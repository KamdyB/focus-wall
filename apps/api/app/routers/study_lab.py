import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import StudyLabState
from app.db.session import get_session

router = APIRouter(prefix="/study-lab", tags=["study-lab"])
MAX_STATE_BYTES = 400_000
ALLOWED_STAGES = {"Concept", "Understand", "Attempt unaided", "Debug", "Reinforce", "Practise", "Build", "Ship"}


class StudyResource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=240)
    url: str | None = Field(default=None, max_length=2048)
    area: str = Field(default="Added by you", max_length=100)
    note: str = Field(default="", max_length=1200)


class StudyRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    date: str = Field(max_length=64)
    resource: str = Field(max_length=240)
    minutes: int = Field(ge=0, le=480)
    evidence: str = Field(max_length=12000)
    steps: list[str] = Field(default_factory=list, max_length=8)


class StudyState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    selected: str = Field(default="spiral-matrix", max_length=100)
    completed: list[str] = Field(default_factory=list, max_length=8)
    notes: str = Field(default="", max_length=50000)
    records: list[StudyRecord] = Field(default_factory=list, max_length=100)
    customResources: list[StudyResource] = Field(default_factory=list, max_length=100)
    updatedAt: int = Field(default=0, ge=0)


class StudyStateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data: StudyState


class StudyProgressIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = 1
    selected_resource: str = Field(default="spiral-matrix", max_length=100)
    completed_stages: list[str] = Field(default_factory=list, max_length=8)
    session_count: int = Field(default=0, ge=0, le=100000)
    logged_minutes: int = Field(default=0, ge=0, le=10000000)


def _decode(row: StudyLabState | None) -> dict[str, Any] | None:
    if row is None:
        return None
    try:
        value = json.loads(row.data)
    except (TypeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _is_full_state(data: dict[str, Any] | None) -> bool:
    return bool(data is not None and {"selected", "completed", "notes", "records", "customResources"}.issubset(data))


@router.get("/state")
async def get_state(db: AsyncSession = Depends(get_session)) -> dict:
    # ID 2 was previously used for a compact progress summary. Prefer a full state there;
    # otherwise expose the older full snapshot at ID 1 without deleting or mutating it.
    current = await db.get(StudyLabState, 2)
    current_data = _decode(current)
    if _is_full_state(current_data):
        return {"data": current_data, "updated_at": current.updated_at.isoformat() if current and current.updated_at else None, "source": "cloud"}
    legacy = await db.get(StudyLabState, 1)
    legacy_data = _decode(legacy)
    if _is_full_state(legacy_data):
        return {
            "data": legacy_data,
            "updated_at": legacy.updated_at.isoformat() if legacy and legacy.updated_at else None,
            "source": "legacy-cloud-snapshot",
            "progress": current_data,
        }
    return {
        "data": None,
        "updated_at": current.updated_at.isoformat() if current and current.updated_at else None,
        "source": "empty",
        "progress": current_data,
    }


@router.put("/state")
async def save_state(payload: StudyStateIn, db: AsyncSession = Depends(get_session)) -> dict:
    data = payload.data.model_dump(by_alias=True)
    if any(stage not in ALLOWED_STAGES for stage in data["completed"]):
        raise HTTPException(status_code=422, detail="Unknown mastery stage")
    for record in data["records"]:
        if any(stage not in ALLOWED_STAGES for stage in record["steps"]):
            raise HTTPException(status_code=422, detail="Unknown mastery stage in evidence record")
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_STATE_BYTES:
        raise HTTPException(status_code=413, detail="Study data exceeds 400 KB. Export a backup and shorten old notes before syncing.")
    now = datetime.now(timezone.utc)
    stmt = insert(StudyLabState).values(id=2, data=encoded, updated_at=now).on_conflict_do_update(
        index_elements=["id"], set_={"data": encoded, "updated_at": now}
    )
    await db.execute(stmt)
    await db.commit()
    return {"saved": True, "data": data, "updated_at": now.isoformat(), "bytes": len(encoded.encode("utf-8"))}


@router.get("/progress")
async def get_progress(db: AsyncSession = Depends(get_session)) -> dict:
    row = await db.get(StudyLabState, 2)
    data = _decode(row)
    if _is_full_state(data):
        return {"progress": {
            "version": 1,
            "selected_resource": data.get("selected", "spiral-matrix"),
            "completed_stages": data.get("completed", []),
            "session_count": len(data.get("records", [])),
            "logged_minutes": sum(int(r.get("minutes", 0)) for r in data.get("records", [])),
        }, "updated_at": row.updated_at.isoformat() if row and row.updated_at else None}
    return {"progress": data, "updated_at": row.updated_at.isoformat() if row and row.updated_at else None}


@router.put("/progress")
async def save_progress(payload: StudyProgressIn, db: AsyncSession = Depends(get_session)) -> dict:
    # Compatibility endpoint writes only to ID 3, never over the full Study Lab snapshot at ID 2.
    stages = list(dict.fromkeys(payload.completed_stages))[:8]
    if any(stage not in ALLOWED_STAGES for stage in stages):
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
    stmt = insert(StudyLabState).values(id=3, data=encoded, updated_at=now).on_conflict_do_update(
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
    return {"deleted": True, "message": "Old legacy snapshot deleted; current cloud state and local data are unchanged"}
