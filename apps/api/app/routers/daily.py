from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import local_today, settings
from app.db.models import DailyReflection, DailyStreak, Opportunity, SessionLog, Task, XPEvent
from app.db.session import get_session

router = APIRouter(prefix="/daily", tags=["daily"])

MOODS = ("great", "okay", "rough")
LIVE_OPP = ("inbox", "applied", "interview", "offer")


class ReflectionIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    mood: str | None = None


def _day_bounds() -> tuple[datetime, datetime]:
    """UTC bounds of 'today' in the user's timezone."""
    tz = timezone(timedelta(hours=settings.tz_offset_hours))
    now = datetime.now(tz)
    start = datetime(now.year, now.month, now.day, tzinfo=tz)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


def _refl(row: DailyReflection | None) -> dict | None:
    if not row:
        return None
    return {"date": row.day.isoformat(), "body": row.body, "mood": row.mood}


@router.get("/briefing")
async def briefing(db: AsyncSession = Depends(get_session)) -> dict:
    start, end = _day_bounds()
    today = start.date()

    done = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "completed", Task.completed_at >= start, Task.completed_at < end)
    )).scalar() or 0

    open_count = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "todo")
    )).scalar() or 0

    xp = (await db.execute(
        select(func.coalesce(func.sum(XPEvent.amount), 0)).where(XPEvent.occurred_at >= start, XPEvent.occurred_at < end)
    )).scalar() or 0

    focus_min = (await db.execute(
        select(func.coalesce(func.sum(SessionLog.minutes), 0)).where(SessionLog.created_at >= start, SessionLog.created_at < end)
    )).scalar() or 0

    streak = 0
    days = set((await db.execute(select(DailyStreak.day))).scalars().all())
    cursor = today if today in days else today - timedelta(days=1)  # today unearned ≠ broken streak
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)

    next_opp = (await db.execute(
        select(Opportunity)
        .where(Opportunity.status.in_(LIVE_OPP), Opportunity.deadline.is_not(None), Opportunity.deadline >= today)
        .order_by(Opportunity.deadline)
        .limit(1)
    )).scalar_one_or_none()

    top = (await db.execute(
        select(Task).where(Task.status == "todo").order_by(Task.importance.desc(), Task.created_at).limit(3)
    )).scalars().all()

    refl = (await db.execute(select(DailyReflection).where(DailyReflection.day == today))).scalar_one_or_none()

    return {
        "date": today.isoformat(),
        "done_today": int(done),
        "open_tasks": int(open_count),
        "xp_today": int(xp),
        "focus_minutes": int(focus_min),
        "streak": streak,
        "next_up": [{"id": str(t.id), "title": t.what} for t in top],
        "next_deadline": ({"title": next_opp.title, "deadline": next_opp.deadline.isoformat()} if next_opp else None),
        "reflection_done": refl is not None,
    }


@router.get("/reflection")
async def get_reflection(day: str | None = Query(default=None), db: AsyncSession = Depends(get_session)) -> dict | None:
    if day:
        try:
            d = date.fromisoformat(day)
        except ValueError:
            raise HTTPException(422, "day must be YYYY-MM-DD")
    else:
        d = local_today()
    row = (await db.execute(select(DailyReflection).where(DailyReflection.day == d))).scalar_one_or_none()
    return _refl(row)


@router.put("/reflection")
async def put_reflection(payload: ReflectionIn, db: AsyncSession = Depends(get_session)) -> dict:
    if payload.mood is not None and payload.mood not in MOODS:
        raise HTTPException(422, "mood must be great, okay or rough")
    d = local_today()
    await db.execute(
        pg_insert(DailyReflection)
        .values(day=d, body=payload.body, mood=payload.mood)
        .on_conflict_do_update(index_elements=["day"], set_={"body": payload.body, "mood": payload.mood})
    )
    await db.commit()
    row = (await db.execute(select(DailyReflection).where(DailyReflection.day == d))).scalar_one_or_none()
    return _refl(row)


@router.get("/reflections")
async def recent_reflections(limit: int = Query(default=7, le=30), db: AsyncSession = Depends(get_session)) -> list[dict]:
    rows = (await db.execute(
        select(DailyReflection).order_by(DailyReflection.day.desc()).limit(limit)
    )).scalars().all()
    return [_refl(r) for r in rows]
