from datetime import datetime, timezone
from uuid import UUID

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


@router.post("")
async def start_focus(payload: FocusCreate, db: AsyncSession = Depends(get_session)):
    session = FocusSession(**payload.model_dump())
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {"id": str(session.id), "started_at": session.started_at.isoformat(), "status": session.status}


@router.post("/{session_id}/finish")
async def finish_focus(session_id: UUID, db: AsyncSession = Depends(get_session)):
    session = await db.get(FocusSession, session_id)
    if not session:
        raise HTTPException(404, "Focus session not found")
    session.status = "finished"
    session.completed = True
    session.ended_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "finished", "completed": True}
