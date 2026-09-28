from datetime import date, timedelta
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import local_today
from app.db.models import DiscoveredItem, Opportunity, OpportunityEvent, WatchCompany
from app.db.session import get_session

router = APIRouter(prefix="/radar", tags=["radar"])

GREENHOUSE = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
LEVER = "https://api.lever.co/v0/postings/{slug}?mode=json"
FIT_WORDS = ("intern", "insight", "first year", "first-year", "early", "scholarship", "fellowship", "hackathon")


class CompanyAdd(BaseModel):
    name: str
    board: str  # greenhouse | lever
    slug: str


def _score(title: str) -> int:
    t = title.lower()
    return 1 + (2 if any(w in t for w in FIT_WORDS) else 0)


@router.get("")
async def list_radar(db: AsyncSession = Depends(get_session)) -> list[dict]:
    rows = (await db.execute(
        select(DiscoveredItem)
        .where(DiscoveredItem.status == "discovered")
        .order_by(DiscoveredItem.fit_score.desc(), DiscoveredItem.first_seen.desc())
        .limit(10)
    )).scalars().all()
    return [
        {
            "id": str(d.id), "source": d.source, "kind": d.kind, "title": d.title,
            "organisation": d.organisation, "url": d.url, "eligibility": d.eligibility,
            "deadline": d.deadline.isoformat() if d.deadline else None,
            "first_seen": d.first_seen.isoformat(), "fit_score": d.fit_score,
        }
        for d in rows
    ]


@router.get("/companies")
async def list_companies(db: AsyncSession = Depends(get_session)) -> list[dict]:
    rows = (await db.execute(select(WatchCompany).order_by(WatchCompany.created_at.desc()))).scalars().all()
    return [{"id": str(c.id), "name": c.name, "board": c.board, "slug": c.slug} for c in rows]


@router.post("/companies")
async def add_company(payload: CompanyAdd, db: AsyncSession = Depends(get_session)) -> dict:
    if payload.board not in ("greenhouse", "lever"):
        raise HTTPException(422, "board must be greenhouse or lever")
    exists = (await db.execute(
        select(WatchCompany).where(WatchCompany.board == payload.board, WatchCompany.slug == payload.slug)
    )).scalar_one_or_none()
    if exists:
        return {"id": str(exists.id), "status": "already"}
    c = WatchCompany(name=payload.name, board=payload.board, slug=payload.slug)
    db.add(c)
    await db.commit()
    return {"id": str(c.id), "status": "added"}


@router.post("/refresh")
async def refresh_radar(db: AsyncSession = Depends(get_session)) -> dict:
    companies = (await db.execute(select(WatchCompany))).scalars().all()
    added, failed = 0, []
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        for c in companies:
            try:
                if c.board == "greenhouse":
                    r = await client.get(GREENHOUSE.format(slug=c.slug))
                    r.raise_for_status()
                    jobs = r.json().get("jobs", [])
                    pairs = [(str(j["id"]), j.get("title", ""), j.get("absolute_url")) for j in jobs]
                else:
                    r = await client.get(LEVER.format(slug=c.slug))
                    r.raise_for_status()
                    pairs = [(str(j["id"]), j.get("text", ""), j.get("hostedUrl")) for j in r.json()]
            except Exception:
                failed.append(c.slug)
                continue
            seen = set((await db.execute(
                select(DiscoveredItem.external_id).where(DiscoveredItem.source == c.board)
            )).scalars().all())
            for ext_id, title, url in pairs:
                key = f"{c.slug}:{ext_id}"
                if key in seen:
                    continue
                db.add(DiscoveredItem(
                    source=c.board, external_id=key, kind="earn", title=title[:240],
                    organisation=c.name, url=url, fit_score=_score(title),
                ))
                added += 1
    await db.commit()
    return {"added": added, "failed": failed}


@router.post("/{item_id}/pin")
async def pin_item(item_id: UUID, db: AsyncSession = Depends(get_session)) -> dict:
    item = (await db.execute(
        select(DiscoveredItem).where(DiscoveredItem.id == item_id).with_for_update()
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Not found")
    if item.status != "discovered":
        raise HTTPException(409, f"Already {item.status}")
    item.status = "pinned"
    opp = Opportunity(
        title=item.title, kind=item.kind, organisation=item.organisation,
        url=item.url, deadline=item.deadline, notes=f"Radar · {item.source}", status="inbox",
    )
    db.add(opp)
    await db.flush()
    db.add(OpportunityEvent(opportunity_id=opp.id, from_status=None, to_status="inbox", note="pinned from radar"))
    await db.commit()
    return {"opportunity_id": str(opp.id)}


@router.post("/{item_id}/dismiss")
async def dismiss_item(item_id: UUID, db: AsyncSession = Depends(get_session)) -> dict:
    item = (await db.execute(
        select(DiscoveredItem).where(DiscoveredItem.id == item_id).with_for_update()
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Not found")
    if item.status != "discovered":
        raise HTTPException(409, f"Already {item.status}")
    item.status = "dismissed"
    await db.commit()
    return {"status": "dismissed"}
