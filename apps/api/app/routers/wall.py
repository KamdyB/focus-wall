from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import local_today
from app.db.models import DailyStreak, Goal, Task, XPEvent
from app.db.session import get_session
from app.services.planner import select_today

from datetime import timedelta, timezone

WAT = timezone(timedelta(hours=1))  # Africa/Lagos — no DST

def local_today():
    return datetime.now(WAT).date()

router = APIRouter(prefix="/wall", tags=["wall"])


@router.get("/today")
async def today(db: AsyncSession = Depends(get_session)):
    goals_result = await db.execute(select(Goal))
    goals = goals_result.scalars().all()
    goals_by_id = {g.id: g for g in goals}

    tasks_result = await db.execute(select(Task).order_by(Task.position.asc(), Task.created_at.asc()))
    tasks = tasks_result.scalars().all()

    plan = select_today(tasks, goals_by_id, daily_minutes=90)

    xp_result = await db.execute(select(func.coalesce(func.sum(XPEvent.amount), 0)))
    xp = int(xp_result.scalar_one())

    active_load = sum(g.attention_cost for g in goals if g.status == "active")

    streak_result = await db.execute(select(DailyStreak).order_by(DailyStreak.day.desc()).limit(30))
    streak_rows = streak_result.scalars().all()

    streak = 0
    cursor = local_today()
    for row in streak_rows:
        if row.day == cursor and row.completed_count > 0:
            streak += 1
            cursor = cursor.fromordinal(cursor.toordinal() - 1)
        elif row.day < cursor:
            break

    def serial(item):
        task, score = item
        return {
            "id": str(task.id),
            "what": task.what,
            "how": task.how,
            "output": task.output,
            "minutes": task.estimated_minutes,
            "lane": task.lane,
            "score": round(score, 2),
            "due_at": task.due_at.isoformat() if task.due_at else None,
        }

    return {
        "date": local_today().isoformat(),
        "active_load": active_load,
        "capacity": 12,
        "xp": xp,
        "level": xp // 100 + 1,
        "streak": streak,
        "remaining_minutes": plan["remaining_minutes"],
        "core": [serial(x) for x in plan["core"]],
        "small": [serial(x) for x in plan["small"]],
        "next": [serial(x) for x in plan["next"]],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
