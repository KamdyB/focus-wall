from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Goal, Task, XPEvent, DailyStreak
from app.db.session import get_session
from app.services.xp import task_xp

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    goal_id: UUID | None = None
    what: str
    how: str
    output: str
    estimated_minutes: int = Field(gt=0, le=480)
    size: str = "core"
    lane: str = "technical"
    importance: int = Field(ge=1, le=5)
    due_at: datetime | None = None


@router.post("")
async def create_task(payload: TaskCreate, db: AsyncSession = Depends(get_session)):
    task = Task(**payload.model_dump())
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return {"id": str(task.id), "what": task.what, "status": task.status}


@router.post("/{task_id}/complete")
async def complete_task(task_id: UUID, db: AsyncSession = Depends(get_session)):
    task = await db.get(Task, task_id)
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

    today = datetime.now(timezone.utc).date()
    streak_row = await db.execute(select(DailyStreak).where(DailyStreak.day == today))
    streak = streak_row.scalar_one_or_none()
    if streak is None:
        streak = DailyStreak(day=today, completed_count=0)
        db.add(streak)
    streak.completed_count += 1

    await db.commit()
    return {"status": "completed", "xp_awarded": awarded, "xp": task_xp(task.estimated_minutes) if awarded else 0}
