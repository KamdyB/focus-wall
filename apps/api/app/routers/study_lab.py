import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import StudyLabState
from app.db.session import get_session

router = APIRouter(prefix="/study-lab", tags=["study-lab"])


class StudyProgressIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = 1
    selected_resource: str = Field(default="spiral-matrix", max_length=100)
    completed_stages: list[str] = Field(default_factory=list, max_length=8)
    session_count: int = Field(default=0, ge=0, le=100000)
    logged_minutes: int = Field(default=0, ge=0, le=10000000)


@router.get("/progress")
async def get_progress(db: AsyncSession = Depends(get_session)) -> dict:
    # id=2 is reserved for a tiny, allow-listed progress summary.
    row = await db.get(StudyLabState, 2)
    if row is None:
        return {"progress": None, "updated_at": None}
    try:
        data = json.loads(row.data)
    except (TypeError, json.JSONDecodeError):
        data = None
    return {"progress": data if isinstance(data, dict) else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None}


@router.put("/progress")
async def save_progress(payload: StudyProgressIn, db: AsyncSession = Depends(get_session)) -> dict:
    # Only aggregate progress is accepted. Notes, code, evidence text, and custom URLs are rejected.
    stages = list(dict.fromkeys(payload.completed_stages))[:8]
    allowed_stages = {"Concept", "Understand", "Attempt unaided", "Debug", "Reinforce", "Practise", "Build", "Ship"}
    if any(stage not in allowed_stages for stage in stages):
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Unknown mastery stage")
    data = {
        "version": 1,
        "selected_resource": payload.selected_resource,
        "completed_stages": stages,
        "session_count": payload.session_count,
        "logged_minutes": payload.logged_minutes,
    }
    encoded = json.dumps(data, separators=(",", ":"))
    now = datetime.now(timezone.utc)
    stmt = insert(StudyLabState).values(id=2, data=encoded, updated_at=now).on_conflict_do_update(
        index_elements=["id"], set_={"data": encoded, "updated_at": now}
    )
    await db.execute(stmt)
    await db.commit()
    return {"saved": True, "progress": data, "updated_at": now.isoformat()}


@router.delete("/legacy-snapshot")
async def delete_legacy_snapshot(db: AsyncSession = Depends(get_session)) -> dict:
    # Explicit UI action only: never automatically delete user data.
    row = await db.get(StudyLabState, 1)
    if row is None:
        return {"deleted": False, "message": "No legacy full snapshot exists"}
    await db.delete(row)
    await db.commit()
    return {"deleted": True, "message": "Legacy full snapshot deleted"}
