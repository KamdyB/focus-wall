from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Opportunity, OpportunityEvent
from app.db.session import get_session

router = APIRouter(prefix="/opportunities", tags=["opportunities"])

FLOW: dict[str, list[str]] = {
    "inbox": ["applied", "archived"],
    "applied": ["interview", "rejected", "archived"],
    "interview": ["offer", "rejected", "archived"],
    "offer": ["won", "archived"],
    "won": [],
    "rejected": ["archived"],
    "archived": [],
}
LIVE = ("inbox", "applied", "interview", "offer")


class OpportunityCreate(BaseModel):
    title: str
    kind: str = "learn"
    organisation: str | None = None
    url: str | None = None
    deadline: str | None = None
    notes: str | None = None


class AdvanceBody(BaseModel):
    to: str
    note: str | None = None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "deadline must be YYYY-MM-DD")


@router.get("")
async def list_opportunities(
    status: str | None = None,
    kind: str | None = None,
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    q = select(Opportunity).order_by(
        Opportunity.deadline.asc().nulls_last(), Opportunity.created_at.desc()
    )
    if status:
        q = q.where(Opportunity.status == status)
    if kind:
        q = q.where(Opportunity.kind == kind)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": str(o.id),
            "kind": o.kind,
            "title": o.title,
            "organisation": o.organisation,
            "url": o.url,
            "deadline": o.deadline.isoformat() if o.deadline else None,
            "notes": o.notes,
            "status": o.status,
            "applied_at": o.applied_at.isoformat() if o.applied_at else None,
            "next_states": FLOW.get(o.status, []),
        }
        for o in rows
    ]


@router.post("")
async def create_opportunity(payload: OpportunityCreate, db: AsyncSession = Depends(get_session)) -> dict:
    opp = Opportunity(
        title=payload.title,
        kind=payload.kind,
        organisation=payload.organisation,
        url=payload.url,
        deadline=_parse_date(payload.deadline),
        notes=payload.notes,
        status="inbox",
        last_touch_at=datetime.now(timezone.utc),
    )
    db.add(opp)
    await db.flush()  # audit fix: id exists before the first event references it
    db.add(OpportunityEvent(opportunity_id=opp.id, from_status=None, to_status="inbox"))
    await db.commit()
    await db.refresh(opp)
    return {"id": str(opp.id), "status": opp.status}


@router.post("/{opp_id}/advance")
async def advance_opportunity(opp_id: UUID, body: AdvanceBody, db: AsyncSession = Depends(get_session)) -> dict:
    opp = (await db.execute(
        select(Opportunity).where(Opportunity.id == opp_id).with_for_update()  # audit fix: race-safe
    )).scalar_one_or_none()
    if not opp:
        raise HTTPException(404, "Not found")
    if body.to not in FLOW.get(opp.status, []):
        raise HTTPException(409, f"Cannot move {opp.status} to {body.to}")
    prev = opp.status
    opp.status = body.to
    now = datetime.now(timezone.utc)
    opp.last_touch_at = now
    if body.to == "applied" and opp.applied_at is None:
        opp.applied_at = now
    db.add(OpportunityEvent(opportunity_id=opp.id, from_status=prev, to_status=body.to, note=body.note))
    await db.commit()
    await db.refresh(opp)
    return {"id": str(opp.id), "status": opp.status, "next_states": FLOW.get(opp.status, [])}


@router.get("/{opp_id}/events")
async def opportunity_events(opp_id: UUID, db: AsyncSession = Depends(get_session)) -> list[dict]:
    rows = (await db.execute(
        select(OpportunityEvent)
        .where(OpportunityEvent.opportunity_id == opp_id)
        .order_by(OpportunityEvent.created_at.asc())
    )).scalars().all()
    return [
        {"from_status": e.from_status, "to_status": e.to_status, "note": e.note, "created_at": e.created_at.isoformat()}
        for e in rows
    ]
