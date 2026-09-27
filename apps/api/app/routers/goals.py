from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Goal, Task
from app.db.session import get_session

router = APIRouter(prefix="/goals", tags=["goals"])
CAPACITY = 12


class GoalCreate(BaseModel):
    title: str
    why: str | None = None
    lane: str = "technical"
    attention_cost: int = Field(ge=1, le=5)
    importance: int = Field(ge=1, le=5)
    due_date: str | None = None


def _parse_due(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "due_date must be YYYY-MM-DD")


@router.get("")
async def list_goals(status: str | None = None, db: AsyncSession = Depends(get_session)) -> list[dict]:
    query = select(Goal).order_by(Goal.created_at.desc())
    if status:
        query = query.where(Goal.status == status)
    goals = (await db.execute(query)).scalars().all()

    counts = (
        await db.execute(
            select(Task.goal_id, func.count(Task.id).label("open_count"))
            .where(Task.status.in_(["todo", "in_progress"]))
            .group_by(Task.goal_id)
        )
    ).all()
    open_by_goal = {row.goal_id: int(row.open_count) for row in counts}

    return [
        {
            "id": str(g.id),
            "title": g.title,
            "why": g.why,
            "lane": g.lane,
            "status": g.status,
            "attention_cost": g.attention_cost,
            "importance": g.importance,
            "due_date": g.due_date.isoformat() if g.due_date else None,
            "open_tasks": open_by_goal.get(g.id, 0),
        }
        for g in goals
    ]


@router.post("")
async def create_goal(payload: GoalCreate, db: AsyncSession = Depends(get_session)) -> dict:
    data = payload.model_dump()
    data["due_date"] = _parse_due(data["due_date"])
    goal = Goal(**data)
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return {"id": str(goal.id), "title": goal.title, "status": goal.status}


@router.post("/{goal_id}/activate")
async def activate_goal(goal_id: UUID, force: bool = False, db: AsyncSession = Depends(get_session)) -> dict:
    goal = await db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")

    result = await db.execute(
        select(func.coalesce(func.sum(Goal.attention_cost), 0)).where(Goal.status == "active")
    )
    current_load = int(result.scalar_one())

    if goal.status == "active":
        return {"id": str(goal.id), "status": goal.status, "active_load": current_load}

    if current_load + goal.attention_cost > CAPACITY and not force:
        raise HTTPException(
            409,
            {
                "message": "The wall is full.",
                "current_load": current_load,
                "capacity": CAPACITY,
                "attention_cost": goal.attention_cost,
            },
        )

    goal.status = "active"
    await db.commit()
    return {"id": str(goal.id), "status": goal.status, "active_load": current_load + goal.attention_cost}
