from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import SessionLog
from app.db.session import get_session

router = APIRouter(prefix="/logs", tags=["logs"])


class LogCreate(BaseModel):
    session_id: UUID | None = None
    task_id: UUID | None = None
    minutes: int = Field(ge=1, le=600)
    worked_on: str | None = None
    needed_help: bool = False


@router.post("")
async def create_log(payload: LogCreate, db: AsyncSession = Depends(get_session)) -> dict:
    log = SessionLog(
        session_id=payload.session_id, task_id=payload.task_id, minutes=payload.minutes,
        worked_on=(payload.worked_on or "")[:2000] or None, needed_help=payload.needed_help,
    )
    db.add(log)
    await db.commit()
    return {"id": str(log.id)}
