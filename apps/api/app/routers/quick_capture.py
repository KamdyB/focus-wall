import re
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Task
from app.db.session import get_session

router = APIRouter(prefix="/quick-capture", tags=["quick-capture"])

# --- the wall's vocabulary lives here, nowhere else ---
DEFAULT_MINUTES = 45   # a bare capture is a real block, not a crumb — lands in Today's three
SMALL_WIN_MAX = 30     # minutes < SMALL_WIN_MAX => "small win", otherwise "core"
MIN_MINUTES, MAX_MINUTES = 5, 240

WAT = timezone(timedelta(hours=settings.tz_offset_hours))


class CaptureIn(BaseModel):
    text: str
    force: bool = False  # second ADD tap after a duplicate warning logs it anyway


def parse_capture(raw: str) -> tuple[str, int, datetime | None]:
    text = raw.strip()
    minutes = DEFAULT_MINUTES
    m = re.search(r"!(\d+)\b", text)
    if m:
        minutes = min(max(int(m.group(1)), MIN_MINUTES), MAX_MINUTES)
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

    if not body.force:
        dup = (await db.execute(
            select(Task)
            .where(func.lower(Task.what) == title.lower(), Task.status == "todo")
            .limit(1)
        )).scalar_one_or_none()
        if dup:
            # Ask, don't block: created stays False, the client prompts one more tap.
            return {
                "created": False, "duplicate_of": dup.what, "id": "",
                "title": title, "minutes": minutes, "due_today": due_at is not None,
            }

    task = Task(
        what=title, how="", output="",
        estimated_minutes=minutes,
        size="small" if minutes < SMALL_WIN_MAX else "core",
        status="todo", due_at=due_at,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return {
        "created": True, "duplicate_of": None, "id": str(task.id),
        "title": task.what, "minutes": task.estimated_minutes, "due_today": due_at is not None,
    }