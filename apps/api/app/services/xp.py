def task_xp(estimated_minutes: int) -> int:
    return 10 + min(10, estimated_minutes // 15)


def health_xp() -> int:
    return 5
