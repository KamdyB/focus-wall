from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


@router.post("/decay")
async def decay_stale(db: AsyncSession = Depends(get_session)):
    """Pending tasks untouched for 7+ days (and not scheduled ahead) -> decayed archive."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)
    res = await db.execute(
        text(
            "UPDATE tasks SET status = 'decayed' "
            "WHERE status = 'todo' AND created_at < :cutoff "
            "AND (due_at IS NULL OR due_at < :now)"
        ),
        {"cutoff": cutoff, "now": now},
    )
    await db.commit()
    return {"decayed": res.rowcount}
