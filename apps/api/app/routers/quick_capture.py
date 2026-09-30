import re
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import timedelta, timezone

from app.core.config import settings
from app.db.models import Task

WAT = timezone(timedelta(hours=settings.tz_offset_hours))

from app.db.session import get_session

router = APIRouter(prefix="/quick-capture", tags=["quick-capture"])

DEFAULT_MINUTES = 25


class CaptureIn(BaseModel):
    text: str


def parse_capture(raw: str) -> tuple[str, int, datetime | None]:
    text = raw.strip()
    minutes = DEFAULT_MINUTES
    m = re.search(r"!(\d+)\b", text)
    if m:
        minutes = min(max(int(m.group(1)), 5), 240)
        text = text.replace(m.group(0), " ", 1)
    due_at = None
    if re.search(r"!t\b", text):
        due_at = datetime.combine(datetime.now(WAT).date(), time(23, 59), tzinfo=WAT)
        text = re.sub(r"!t\b", " ", text, count=1)
    title = re.sub(r"\s+", " ", text).strip()
    if not title:
        raise HTTPException(status_code=422, detail="Nothing to capture")
    return title, minutes, due_at


@router.post("")
async def quick_capture(body: CaptureIn, db: AsyncSession = Depends(get_session)):
    title, minutes, due_at = parse_capture(body.text)
    task = Task(
        what=title,
        how="",
        output="",
        estimated_minutes=minutes,
        size="small" if minutes < 30 else "core",
        status="todo",
        due_at=due_at,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return {"id": str(task.id), "title": task.what, "minutes": task.estimated_minutes, "due_today": due_at is not None}
