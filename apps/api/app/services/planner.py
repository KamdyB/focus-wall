from datetime import datetime, timezone


def deadline_score(due_at: datetime | None, now: datetime) -> float:
    if due_at is None:
        return 10.0
    days = (due_at.date() - now.date()).days
    if days < 0:
        return 100.0
    if days == 0:
        return 95.0
    if days == 1:
        return 85.0
    if days <= 3:
        return 70.0
    if days <= 7:
        return 55.0
    return 30.0


def importance_score(importance: int) -> float:
    return max(1, min(5, importance)) * 20.0


def load_fit_score(attention_cost: int) -> float:
    return max(0.0, min(100.0, 100.0 - 15.0 * (attention_cost - 1)))


def time_fit_score(estimated_minutes: int, remaining_minutes: int) -> float:
    return 100.0 if estimated_minutes <= remaining_minutes else 0.0


def task_score(task, goal, remaining_minutes: int, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    d = deadline_score(task.due_at, now)
    i = importance_score(task.importance)
    l = load_fit_score(goal.attention_cost if goal else 1)
    t = time_fit_score(task.estimated_minutes, remaining_minutes)
    return 0.40 * d + 0.30 * i + 0.20 * l + 0.10 * t


def select_today(tasks, goals_by_id, daily_minutes: int):
    remaining = daily_minutes
    open_tasks = [t for t in tasks if t.status in {"todo", "in_progress"}]

    scored = []
    now = datetime.now(timezone.utc)
    for task in open_tasks:
        goal = goals_by_id.get(task.goal_id)
        score = task_score(task, goal, remaining, now)
        scored.append((score, task))

    scored.sort(key=lambda x: (-x[0], x[1].due_at or datetime.max.replace(tzinfo=timezone.utc), x[1].estimated_minutes, x[1].position))

    core = []
    lanes = set()

    for score, task in scored:
        if len(core) >= 3:
            break
        if task.estimated_minutes > remaining:
            continue
        if task.size != "core":
            continue
        if task.lane in lanes and len(lanes) < 3:
            continue
        core.append((task, score))
        lanes.add(task.lane)
        remaining -= task.estimated_minutes

    # Second pass fills unused slots when lane diversity made the first pass too strict.
    if len(core) < 3:
        selected_ids = {task.id for task, _ in core}
        for score, task in scored:
            if len(core) >= 3:
                break
            if task.id in selected_ids or task.size != "core":
                continue
            if task.estimated_minutes <= remaining:
                core.append((task, score))
                remaining -= task.estimated_minutes

    small = []
    for score, task in scored:
        if len(small) >= 2 or task.size == "core":
            continue
        if task in [x[0] for x in core]:
            continue
        if task.estimated_minutes <= 30 and task.estimated_minutes <= remaining:
            small.append((task, score))
            remaining -= task.estimated_minutes

    chosen = {task.id for task, _ in core + small}
    next_items = [(task, score) for score, task in scored if task.id not in chosen][:3]

    return {
        "core": core,
        "small": small,
        "next": next_items,
        "remaining_minutes": remaining,
    }
