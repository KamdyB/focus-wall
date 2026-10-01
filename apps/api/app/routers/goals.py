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
    force: bool = False  # second CARVE IT tap after a duplicate warning adds it anyway


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    why: str | None = None
    lane: str | None = None
    attention_cost: int | None = Field(default=None, ge=1, le=5)
    importance: int | None = Field(default=None, ge=1, le=5)
    due_date: str | None = None


def _parse_due(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "due_date must be YYYY-MM-DD")


async def _payload(g: Goal, db: AsyncSession) -> dict:
    n = (await db.execute(
        select(func.count(Task.id)).where(Task.goal_id == g.id, Task.status.in_(["todo", "in_progress"]))
    )).scalar_one()
    return {
        "id": str(g.id),
        "title": g.title,
        "why": g.why,
        "lane": g.lane,
        "status": g.status,
        "attention_cost": g.attention_cost,
        "importance": g.importance,
        "due_date": g.due_date.isoformat() if g.due_date else None,
        "open_tasks": int(n),
    }


@router.get("")
async def list_goals(status: str | None = None, db: AsyncSession = Depends(get_session)) -> list[dict]:
    query = select(Goal).order_by(Goal.created_at.desc())
    if status:
        query = query.where(Goal.status == status)
    goals = (await db.execute(query)).scalars().all()
    return [await _payload(g, db) for g in goals]


@router.post("")
async def create_goal(payload: GoalCreate, db: AsyncSession = Depends(get_session)) -> dict:
    title = payload.title.strip()
    if not title:
        raise HTTPException(422, "Title can't be empty")

    if not payload.force:
        dup = (await db.execute(
            select(Goal)
            .where(func.lower(Goal.title) == title.lower(), Goal.status.in_(["inbox", "active"]))
            .limit(1)
        )).scalar_one_or_none()
        if dup:
            # Ask, don't block: the client prompts one more tap.
            return {"created": False, "duplicate_of": dup.title, "id": "", "title": title}

    goal = Goal(
        title=title, why=payload.why, lane=payload.lane,
        attention_cost=payload.attention_cost, importance=payload.importance,
        due_date=_parse_due(payload.due_date),
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return {"created": True, "duplicate_of": None, "id": str(goal.id), "title": goal.title, "status": goal.status}


@router.patch("/{goal_id}")
async def update_goal(goal_id: UUID, payload: GoalUpdate, db: AsyncSession = Depends(get_session)) -> dict:
    goal = await db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and not (data["title"] or "").strip():
        raise HTTPException(422, "Title can't be empty")
    if "due_date" in data:
        data["due_date"] = _parse_due(data["due_date"])
    for key, value in data.items():
        setattr(goal, key, value)
    await db.commit()
    await db.refresh(goal)
    return await _payload(goal, db)


@router.delete("/{goal_id}")
async def delete_goal(goal_id: UUID, db: AsyncSession = Depends(get_session)) -> dict:
    goal = await db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")
    n = int((await db.execute(select(func.count(Task.id)).where(Task.goal_id == goal_id))).scalar_one())
    if n > 0:
        raise HTTPException(409, f"This goal still has {n} task(s) — settle or delete them first")
    await db.delete(goal)
    await db.commit()
    return {"deleted": True}


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
