from datetime import date, datetime, timezone
from uuid import UUID, uuid4
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from app.core.config import local_today

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

class Base(DeclarativeBase):
    pass

class Goal(Base):
    __tablename__ = "goals"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(160))
    why: Mapped[str | None] = mapped_column(Text, nullable=True)
    lane: Mapped[str] = mapped_column(String(32), default="technical")
    status: Mapped[str] = mapped_column(String(24), default="inbox")
    attention_cost: Mapped[int] = mapped_column(Integer, default=1)
    importance: Mapped[int] = mapped_column(Integer, default=3)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    auto_close: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    goal_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("goals.id"), nullable=True)
    what: Mapped[str] = mapped_column(Text)
    how: Mapped[str] = mapped_column(Text)
    output: Mapped[str] = mapped_column(Text)
    estimated_minutes: Mapped[int] = mapped_column(Integer)
    size: Mapped[str] = mapped_column(String(16), default="core")
    lane: Mapped[str] = mapped_column(String(32), default="technical")
    importance: Mapped[int] = mapped_column(Integer, default=3)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="todo")
    position: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class RecurringSeries(Base):
    """A repeat rule. Tasks attach to a series; completing one spawns the next occurrence.
    anchor_day preserves the original day-of-month for monthly rules (29/30/31 clamp)."""
    __tablename__ = "recurring_series"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    rule: Mapped[str] = mapped_column(String(16)) # daily | weekly | monthly
    anchor_day: Mapped[int | None] = mapped_column(Integer, nullable=True) # 1..31, monthly only
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class TaskRecurrence(Base):
    __tablename__ = "task_recurrence"
    task_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("tasks.id"), primary_key=True)
    series_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("recurring_series.id"), index=True)

class DailyReflection(Base):
    __tablename__ = "daily_reflections"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    day: Mapped[date] = mapped_column(Date, unique=True)
    body: Mapped[str] = mapped_column(Text)
    mood: Mapped[str | None] = mapped_column(String(16), nullable=True) # great | okay | rough
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class HealthAction(Base):
    __tablename__ = "health_actions"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    action_date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(160))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(24), default="planned")

class FocusSession(Base):
    __tablename__ = "focus_sessions"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    task_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("tasks.id"))
    preset_minutes: Mapped[int] = mapped_column(Integer)
    break_minutes: Mapped[int] = mapped_column(Integer, default=10)
    status: Mapped[str] = mapped_column(String(24), default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)

class XPEvent(Base):
    __tablename__ = "xp_events"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    event_type: Mapped[str] = mapped_column(String(40))
    amount: Mapped[int] = mapped_column(Integer)
    task_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(180), unique=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class DailyStreak(Base):
    __tablename__ = "daily_streaks"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    day: Mapped[date] = mapped_column(Date, unique=True)
    completed_count: Mapped[int] = mapped_column(Integer, default=0)

class Opportunity(Base):
    __tablename__ = "opportunities"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    kind: Mapped[str] = mapped_column(String(24), default="learn")
    title: Mapped[str] = mapped_column(String(200))
    organisation: Mapped[str | None] = mapped_column(String(160), nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="inbox")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_touch_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class OpportunityEvent(Base):
    __tablename__ = "opportunity_events"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    opportunity_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("opportunities.id"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    to_status: Mapped[str] = mapped_column(String(24))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class DiscoveredItem(Base):
    __tablename__ = "discovered_items"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_source_external"),)
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source: Mapped[str] = mapped_column(String(32)) # greenhouse | lever | remotive | arbeitnow | jobicy
    external_id: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(24), default="earn")
    title: Mapped[str] = mapped_column(String(240))
    organisation: Mapped[str | None] = mapped_column(String(160), nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    eligibility: Mapped[str | None] = mapped_column(String(64), nullable=True) # provider's own location field; null = unknown
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    first_seen: Mapped[date] = mapped_column(Date, default=local_today)
    fit_score: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="discovered") # discovered | pinned | dismissed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class WatchFeed(Base):
    """A radar source: company boards (greenhouse/lever slug) or keyword feeds (remotive/jobicy/arbeitnow)."""
    __tablename__ = "watch_feeds"
    __table_args__ = (UniqueConstraint("source", "param", name="uq_feed_source_param"),)
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source: Mapped[str] = mapped_column(String(16))
    param: Mapped[str] = mapped_column(String(160), default="") # slug, or search keyword, or "" for whole feed
    label: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class WatchCompany(Base):
    """Legacy watchlist — kept only as the one-time import source for watch_feeds. Do not write here."""
    __tablename__ = "watch_companies"
    __table_args__ = (UniqueConstraint("board", "slug", name="uq_board_slug"),)
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120))
    board: Mapped[str] = mapped_column(String(16))
    slug: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class RadarState(Base):
    """Server-side guard rows: last radar refresh time, one-time company import flag."""
    __tablename__ = "radar_state"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(64))

class SessionLog(Base):
    __tablename__ = "session_logs"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, unique=True, index=True)
    task_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    minutes: Mapped[int] = mapped_column(Integer)
    worked_on: Mapped[str | None] = mapped_column(Text, nullable=True)
    needed_help: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class UserSetting(Base):
    __tablename__ = "user_settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class ProfileCard(Base):
    """Singleton profile the AI triage reads. id is always 1. Stored as JSON text —
    UserSetting.value is capped at 255 chars, far too small for a real profile."""
    __tablename__ = "profile_card"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    data: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class AiInsight(Base):
    """One AI triage verdict per run. History is kept; reads return the latest row per opportunity.
    deadline here is AI-EXTRACTED and unverified — it is never written back to Opportunity.deadline."""
    __tablename__ = "ai_insights"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    opportunity_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("opportunities.id"), index=True)
    verdict: Mapped[str] = mapped_column(String(16)) # chase | maybe | skip | expired (expired set by code, not the model)
    fit_score: Mapped[int] = mapped_column(Integer, default=0)
    read_title: Mapped[str] = mapped_column(String(240), default="") # what the AI says it read — proof it saw the right page
    read_org: Mapped[str] = mapped_column(String(160), default="")
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    why_fits: Mapped[str] = mapped_column(Text, default="[]")   # JSON array of strings
    concerns: Mapped[str] = mapped_column(Text, default="[]")   # JSON array of strings
    documents: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of strings
    actions: Mapped[str] = mapped_column(Text, default="[]")    # JSON array of short imperatives
    model: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)