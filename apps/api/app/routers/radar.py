from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import local_today
from app.db.models import DiscoveredItem, Opportunity, OpportunityEvent, RadarState, WatchCompany, WatchFeed
from app.db.session import get_session

router = APIRouter(prefix="/radar", tags=["radar"])

REFRESH_COOLDOWN_MINUTES = 240  # server-side cap — protects provider rate limits (Remotive asks ≤4/day)

ENDPOINTS = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{param}/jobs",
    "lever": "https://api.lever.co/v0/postings/{param}?mode=json",
    "remotive": "https://remotive.com/api/remote-jobs?limit=50",
    "arbeitnow": "https://www.arbeitnow.com/api/job-board-api",
    "jobicy": "https://jobicy.com/api/v2/remote-jobs?count=50",
}
SOURCES = tuple(ENDPOINTS)
KEYWORD_SEARCH_SOURCES = ("remotive", "jobicy", "arbeitnow")
FIT_WORDS = (
    "intern", "insight", "first year", "first-year", "early", "scholarship",
    "fellowship", "hackathon", "graduate", "placement", "apprenticeship",
)


class FeedAdd(BaseModel):
    source: str
    param: str = ""  # board slug for greenhouse/lever, search keyword for remotive/jobicy/arbeitnow
    label: str


def _score(title: str) -> int:
    t = title.lower()
    return 1 + (2 if any(w in t for w in FIT_WORDS) else 0)


def _loc(value: object) -> str | None:
    s = str(value or "").strip()
    return s[:64] or None


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


@router.get("/feeds")
async def list_feeds(db: AsyncSession = Depends(get_session)) -> list[dict]:
    # One-time import of the legacy company watchlist so nothing is lost, then feeds are the only table.
    imported = await db.get(RadarState, "companies_imported")
    if not imported:
        companies = (await db.execute(select(WatchCompany))).scalars().all()
        for c in companies:
            await db.execute(
                pg_insert(WatchFeed)
                .values(source=c.board, param=c.slug, label=c.name)
                .on_conflict_do_nothing(index_elements=["source", "param"])
            )
        await db.execute(
            pg_insert(RadarState).values(key="companies_imported", value="1")
            .on_conflict_do_nothing(index_elements=["key"])
        )
        await db.commit()
    rows = (await db.execute(select(WatchFeed).order_by(WatchFeed.created_at))).scalars().all()
    return [{"id": str(f.id), "source": f.source, "param": f.param, "label": f.label} for f in rows]


@router.post("/feeds")
async def add_feed(payload: FeedAdd, db: AsyncSession = Depends(get_session)) -> dict:
    if payload.source not in SOURCES:
        raise HTTPException(422, "source must be greenhouse, lever, remotive, arbeitnow or jobicy")
    param = payload.param.strip().lower()
    if payload.source in ("greenhouse", "lever") and not param:
        raise HTTPException(422, "board slug required for greenhouse and lever")
    res = await db.execute(
        pg_insert(WatchFeed)
        .values(source=payload.source, param=param, label=payload.label.strip()[:120] or payload.source)
        .on_conflict_do_nothing(index_elements=["source", "param"])
    )
    await db.commit()
    return {"status": "added" if res.rowcount else "already"}


@router.delete("/feeds/{feed_id}")
async def remove_feed(feed_id: UUID, db: AsyncSession = Depends(get_session)) -> dict:
    res = await db.execute(delete(WatchFeed).where(WatchFeed.id == feed_id))
    await db.commit()
    return {"deleted": res.rowcount > 0}


async def _fetch_feed(client: httpx.AsyncClient, f: WatchFeed) -> list[tuple]:
    url = ENDPOINTS[f.source]
    url = url.format(param=f.param) if "{param}" in url else url
    if f.source in KEYWORD_SEARCH_SOURCES and f.param:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}search={quote(f.param)}"
    r = await client.get(url)
    r.raise_for_status()
    data = r.json()
    out: list[tuple] = []
    if f.source == "greenhouse":
        for j in data.get("jobs", []):
            out.append((str(j["id"]), j.get("title", ""), f.label, j.get("absolute_url"), None))
    elif f.source == "lever":
        for j in data:
            out.append((str(j["id"]), j.get("text", ""), f.label, j.get("hostedUrl"), None))
    elif f.source == "remotive":
        for j in data.get("jobs", []):
            out.append((str(j["id"]), j.get("title", ""), j.get("company_name"), j.get("url"), _loc(j.get("candidate_required_location"))))
    elif f.source == "arbeitnow":
        for j in data.get("data", []):
            out.append((str(j.get("slug") or j.get("id")), j.get("title", ""), j.get("company_name"), j.get("url"), _loc(j.get("location"))))
    elif f.source == "jobicy":
        for j in data.get("jobs", []):
            out.append((str(j["id"]), j.get("jobTitle", ""), j.get("companyName"), j.get("url"), _loc(j.get("jobGeo"))))
    if f.param and f.source == "arbeitnow":  # no server-side search — filter here
        p = f.param.lower()
        out = [x for x in out if p in (x[1] or "").lower() or p in (x[2] or "").lower()]
    return out


@router.post("/refresh")
async def refresh_radar(db: AsyncSession = Depends(get_session)) -> dict:
    now = datetime.now(timezone.utc)
    state = await db.get(RadarState, "last_refresh")
    if state:
        last = datetime.fromisoformat(state.value)
        if now - last < timedelta(minutes=REFRESH_COOLDOWN_MINUTES):
            remaining = int((timedelta(minutes=REFRESH_COOLDOWN_MINUTES) - (now - last)).total_seconds() // 60)
            return {"added": 0, "failed": [], "skipped": True, "next_refresh_in_minutes": remaining}

    feeds = (await db.execute(select(WatchFeed))).scalars().all()
    added, failed = 0, []
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers={"User-Agent": "focus-wall-radar/1.0"}) as client:
        for f in feeds:
            try:
                items = await _fetch_feed(client, f)
            except Exception:
                failed.append(f.label or f.source)
                continue
            for ext_id, title, org, url, loc in items:
                res = await db.execute(
                    pg_insert(DiscoveredItem)
                    .values(
                        source=f.source,
                        external_id=f"{f.param}:{ext_id}" if f.source in ("greenhouse", "lever") else str(ext_id),
                        kind="earn", title=(title or "")[:240], organisation=org, url=url,
                        eligibility=loc, first_seen=local_today(), fit_score=_score(title or ""),
                    )
                    .on_conflict_do_nothing(index_elements=["source", "external_id"])
                )
                added += res.rowcount or 0
    await db.execute(
        pg_insert(RadarState).values(key="last_refresh", value=now.isoformat())
        .on_conflict_do_update(index_elements=["key"], set_={"value": now.isoformat()})
    )
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
