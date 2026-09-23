from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.planner import deadline_score, select_today, task_score
from app.services.xp import task_xp


def test_overdue_beats_no_deadline():
    now = datetime.now(timezone.utc)
    assert deadline_score(now - timedelta(days=1), now) == 100
    assert deadline_score(None, now) == 10


def test_task_xp_has_cap():
    assert task_xp(15) == 11
    assert task_xp(300) == 20


def test_today_plan_respects_budget_and_three_core_limit():
    goal = SimpleNamespace(attention_cost=2)
    goals = {1: goal, 2: SimpleNamespace(attention_cost=1)}
    tasks = [
        SimpleNamespace(id=1, goal_id=1, status="todo", estimated_minutes=45, size="core",
                        lane="technical", importance=5, due_at=None, position=0),
        SimpleNamespace(id=2, goal_id=2, status="todo", estimated_minutes=30, size="core",
                        lane="career", importance=5, due_at=None, position=1),
        SimpleNamespace(id=3, goal_id=2, status="todo", estimated_minutes=30, size="core",
                        lane="academic", importance=3, due_at=None, position=2),
        SimpleNamespace(id=4, goal_id=2, status="todo", estimated_minutes=30, size="core",
                        lane="personal", importance=3, due_at=None, position=3),
    ]
    plan = select_today(tasks, goals, daily_minutes=90)
    assert len(plan["core"]) <= 3
    total = sum(t.estimated_minutes for t, _ in plan["core"] + plan["small"])
    assert total <= 90
