from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Goal
from app.db.session import get_session

router = APIRouter(prefix="/goals", tags=["goals"])


class GoalCreate(BaseModel):
    title: str
    why: str | None = None
    lane: str = "technical"
    attention_cost: int = Field(ge=1, le=5)
    importance: int = Field(ge=1, le=5)
    due_date: str | None = None


@router.post("")
async def create_goal(payload: GoalCreate, db: AsyncSession = Depends(get_session)):
    goal = Goal(**payload.model_dump())
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return {"id": str(goal.id), "title": goal.title, "status": goal.status}


@router.post("/{goal_id}/activate")
async def activate_goal(goal_id: UUID, db: AsyncSession = Depends(get_session)):
    goal = await db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")

    result = await db.execute(select(func.coalesce(func.sum(Goal.attention_cost), 0)).where(Goal.status == "active"))
    current_load = int(result.scalar_one())

    if current_load + goal.attention_cost > 12:
        raise HTTPException(
            409,
            {
                "message": "The wall is full.",
                "current_load": current_load,
                "capacity": 12,
                "attention_cost": goal.attention_cost,
            },
        )

    goal.status = "active"
    await db.commit()
    return {"id": str(goal.id), "status": goal.status, "active_load": current_load + goal.attention_cost}
