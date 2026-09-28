from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import select

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import FocusSession
from app.db.session import get_session

router = APIRouter(prefix="/focus-sessions", tags=["focus"])


class FocusCreate(BaseModel):
    task_id: UUID
    preset_minutes: int = Field(default=45, ge=1, le=180)
    break_minutes: int = Field(default=10, ge=0, le=60)


class FocusFinish(BaseModel):
    completed: bool = True

@router.get("/active")
async def active_session(db: AsyncSession = Depends(get_session)):
    res = await db.execute(
        select(FocusSession)
        .where(FocusSession.status == "running")
        .order_by(FocusSession.started_at.desc())
        .limit(1)
    )
    s = res.scalar_one_or_none()
    if not s:
        return None
    elapsed = (datetime.now(timezone.utc) - s.started_at).total_seconds()
    return {
        "id": s.id,
        "task_id": s.task_id,
        "planned_minutes": s.planned_minutes,
        "started_at": s.started_at.isoformat(),
        "remaining_seconds": max(0, int(s.planned_minutes * 60 - elapsed)),
    }

@router.post("")
async def start_focus(payload: FocusCreate, db: AsyncSession = Depends(get_session)):
    session = FocusSession(**payload.model_dump())
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {
        "id": str(session.id),
        "started_at": session.started_at.isoformat(),
        "status": session.status,
    }


@router.post("/{session_id}/finish")
async def finish_focus(
    session_id: UUID,
    payload: FocusFinish | None = None,
    db: AsyncSession = Depends(get_session),
):
    session = await db.get(FocusSession, session_id)
    if not session:
        raise HTTPException(404, "Focus session not found")

    if session.status in {"finished", "abandoned"}:
        return {"status": session.status, "completed": session.completed}

    completed = payload.completed if payload is not None else True
    session.status = "finished" if completed else "abandoned"
    session.completed = completed
    session.ended_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": session.status, "completed": session.completed}

