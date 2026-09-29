import calendar
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import local_today, settings
from app.db.models import DailyStreak, FocusSession, Goal, RecurringSeries, Task, TaskRecurrence, XPEvent
from app.db.session import get_session
from app.services.xp import task_xp

router = APIRouter(prefix="/tasks", tags=["tasks"])

RECUR_RULES = ("daily", "weekly", "monthly")


class TaskCreate(BaseModel):
    goal_id: UUID | None = None
    what: str
    how: str = ""
    output: str = ""
    estimated_minutes: int = Field(default=30, gt=0, le=480)
    size: str = "core"
    lane: str = "technical"
    importance: int = Field(default=3, ge=1, le=5)
    due_at: datetime | None = None
    recur: str | None = None  # daily | weekly | monthly


class TaskUpdate(BaseModel):
    goal_id: UUID | None = None
    what: str | None = None
    how: str | None = None
    output: str | None = None
    estimated_minutes: int | None = Field(default=None, gt=0, le=480)
    size: str | None = None
    lane: str | None = None
    importance: int | None = Field(default=None, ge=1, le=5)
    due_at: datetime | None = None
    recur: str | None = None  # 'none' removes the repeat, others set it


def _next_occurrence(rule: str, anchor_day: int | None) -> datetime:
    """Next occurrence as UTC. Computed from today in WAT (never chained off the old
    task's date, so monthly dates can't drift)."""
    tz = timezone(timedelta(hours=settings.tz_offset_hours))
    today = local_today()
    if rule == "weekly":
        d = today + timedelta(days=7)
    elif rule == "monthly":
        y, m = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
        d = date(y, m, min(anchor_day or today.day, calendar.monthrange(y, m)[1]))
    else:  # daily
        d = today + timedelta(days=1)
    return datetime(d.year, d.month, d.day, tzinfo=tz).astimezone(timezone.utc)


async def _attach_recurrence(db: AsyncSession, task: Task, rule: str) -> None:
    link = (await db.execute(select(TaskRecurrence).where(TaskRecurrence.task_id == task.id))).scalar_one_or_none()
    if link:
        series = await db.get(RecurringSeries, link.series_id)
        series.rule = rule
        if rule == "monthly" and series.anchor_day is None:
            base = task.due_at or task.created_at or datetime.now(timezone.utc)
            series.anchor_day = base.day
        return
    base = task.due_at or task.created_at or datetime.now(timezone.utc)
    series = RecurringSeries(rule=rule, anchor_day=base.day if rule == "monthly" else None)
    db.add(series)
    await db.flush()
    db.add(TaskRecurrence(task_id=task.id, series_id=series.id))


async def _spawn_next(db: AsyncSession, task: Task) -> None:
    """Completing a recurring task creates the next occurrence in the same transaction.
    One pending 'todo' per series — never two copies of the same habit on the wall."""
    link = (await db.execute(select(TaskRecurrence).where(TaskRecurrence.task_id == task.id))).scalar_one_or_none()
    if not link:
        return
    series = await db.get(RecurringSeries, link.series_id)
    pending = (await db.execute(
        select(TaskRecurrence.task_id)
        .join(Task, Task.id == TaskRecurrence.task_id)
        .where(TaskRecurrence.series_id == series.id, Task.status == "todo")
    )).scalars().first()
    if pending:
        return
    clone = Task(
        goal_id=task.goal_id, what=task.what, how=task.how, output=task.output,
        estimated_minutes=task.estimated_minutes, size=task.size, lane=task.lane,
        importance=task.importance, due_at=_next_occurrence(series.rule, series.anchor_day),
        status="todo", position=task.position,
    )
    db.add(clone)
    await db.flush()
    db.add(TaskRecurrence(task_id=clone.id, series_id=series.id))


async def _payload(db: AsyncSession, task: Task) -> dict:
    row = (await db.execute(
        select(RecurringSeries)
        .join(TaskRecurrence, TaskRecurrence.series_id == RecurringSeries.id)
        .where(TaskRecurrence.task_id == task.id)
    )).scalar_one_or_none()
    return {
        "id": str(task.id),
        "goal_id": str(task.goal_id) if task.goal_id else None,
        "what": task.what, "how": task.how, "output": task.output,
        "estimated_minutes": task.estimated_minutes, "size": task.size,
        "lane": task.lane, "importance": task.importance,
        "due_at": task.due_at.isoformat() if task.due_at else None,
        "status": task.status,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "recur": row.rule if row else None,
    }


@router.post("")
async def create_task(payload: TaskCreate, db: AsyncSession = Depends(get_session)):
    task = Task(**payload.model_dump(exclude={"recur"}))
    db.add(task)
    await db.flush()
    if payload.recur in RECUR_RULES:
        await _attach_recurrence(db, task, payload.recur)
    await db.commit()
    await db.refresh(task)
    return await _payload(db, task)


@router.get("/{task_id}")
async def get_task(task_id: UUID, db: AsyncSession = Depends(get_session)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return await _payload(db, task)


@router.patch("/{task_id}")
async def update_task(task_id: UUID, payload: TaskUpdate, db: AsyncSession = Depends(get_session)):
    task = (await db.execute(select(Task).where(Task.id == task_id).with_for_update())).scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    if payload.recur is not None and payload.recur != "none" and payload.recur not in RECUR_RULES:
        raise HTTPException(422, "recur must be none, daily, weekly or monthly")
    for key, value in payload.model_dump(exclude_unset=True, exclude={"recur"}).items():
        setattr(task, key, value)
    if payload.recur == "none":
        await db.execute(delete(TaskRecurrence).where(TaskRecurrence.task_id == task.id))
    elif payload.recur is not None:
        await _attach_recurrence(db, task, payload.recur)
    await db.commit()
    await db.refresh(task)
    return await _payload(db, task)


@router.delete("/{task_id}")
async def delete_task(task_id: UUID, db: AsyncSession = Depends(get_session)):
    task = await db.get(Task, task_id)
    if not task:
        return {"deleted": False}  # idempotent
    await db.execute(delete(FocusSession).where(FocusSession.task_id == task_id))
    await db.execute(delete(TaskRecurrence).where(TaskRecurrence.task_id == task_id))
    await db.delete(task)
    await db.commit()
    return {"deleted": True}


@router.post("/{task_id}/complete")
async def complete_task(task_id: UUID, db: AsyncSession = Depends(get_session)):
    # Row lock: two simultaneous completes — the second sees 'completed' and stops. No double XP, no double spawn.
    task = (await db.execute(select(Task).where(Task.id == task_id).with_for_update())).scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status == "completed":
        return {"status": "completed", "xp_awarded": False}

    task.status = "completed"
    task.completed_at = datetime.now(timezone.utc)

    key = f"task_completed:{task.id}"
    existing = await db.execute(select(XPEvent).where(XPEvent.idempotency_key == key))
    if existing.scalar_one_or_none() is None:
        db.add(XPEvent(
            event_type="task_completed",
            amount=task_xp(task.estimated_minutes),
            task_id=task.id,
            idempotency_key=key,
        ))
        awarded = True
    else:
        awarded = False

    if task.goal_id:
        goal = await db.get(Goal, task.goal_id)
        if goal:
            goal.last_activity_at = datetime.now(timezone.utc)
            if goal.auto_close:
                remaining = await db.execute(
                    select(Task).where(Task.goal_id == goal.id, Task.status.in_(["todo", "in_progress"]))
                )
                if not remaining.scalars().first():
                    goal.status = "completed"

    await _spawn_next(db, task)

    # Atomic streak upsert — concurrent completes can't collide on the day row.
    today = local_today()
    await db.execute(
        pg_insert(DailyStreak)
        .values(day=today, completed_count=1)
        .on_conflict_do_update(index_elements=["day"], set_={"completed_count": DailyStreak.completed_count + 1})
    )

    await db.commit()
    return {"status": "completed", "xp_awarded": awarded, "xp": task_xp(task.estimated_minutes) if awarded else 0}
