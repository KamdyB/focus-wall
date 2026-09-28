from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import UserSetting
from app.db.session import get_session

router = APIRouter(prefix="/settings", tags=["settings"])

ALLOWED = {"theme": {"light", "dark"}}


class SettingIn(BaseModel):
    key: str
    value: str


@router.get("")
async def get_settings(db: AsyncSession = Depends(get_session)):
    rows = (await db.execute(select(UserSetting))).scalars().all()
    return {r.key: r.value for r in rows}


@router.put("")
async def put_setting(body: SettingIn, db: AsyncSession = Depends(get_session)):
    if body.key not in ALLOWED or body.value not in ALLOWED[body.key]:
        raise HTTPException(status_code=422, detail="unknown setting")
    stmt = insert(UserSetting).values(key=body.key, value=body.value).on_conflict_do_update(
        index_elements=["key"], set_={"value": body.value}
    )
    await db.execute(stmt)
    await db.commit()
    return {"key": body.key, "value": body.value}
