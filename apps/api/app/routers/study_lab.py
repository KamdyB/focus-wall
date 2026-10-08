import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import StudyLabState
from app.db.session import get_session

router = APIRouter(prefix="/study-lab", tags=["study-lab"])


class StudyStateIn(BaseModel):
    data: dict = Field(default_factory=dict)


@router.get("")
async def get_study_state(db: AsyncSession = Depends(get_session)) -> dict:
    row = await db.get(StudyLabState, 1)
    if row is None:
        return {"data": None, "updated_at": None}
    try:
        data = json.loads(row.data)
    except (TypeError, json.JSONDecodeError):
        data = None
    return {"data": data, "updated_at": row.updated_at.isoformat() if row.updated_at else None}


@router.put("")
async def save_study_state(payload: StudyStateIn, db: AsyncSession = Depends(get_session)) -> dict:
    # Keep the snapshot bounded; no secrets or uploaded files belong in this record.
    encoded = json.dumps(payload.data, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > 500_000:
        from fastapi import HTTPException
        raise HTTPException(status_code=413, detail="Study state is too large to save")
    now = datetime.now(timezone.utc)
    stmt = insert(StudyLabState).values(id=1, data=encoded, updated_at=now).on_conflict_do_update(
        index_elements=["id"], set_={"data": encoded, "updated_at": now}
    )
    await db.execute(stmt)
    await db.commit()
    return {"saved": True, "updated_at": now.isoformat()}
