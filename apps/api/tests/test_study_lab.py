import pytest
from pydantic import ValidationError

from app.routers.study_lab import StudyProgressIn


def test_progress_schema_accepts_only_compact_summary_fields():
    progress = StudyProgressIn(
        selected_resource="spiral-matrix",
        completed_stages=["Concept", "Attempt unaided"],
        session_count=3,
        logged_minutes=125,
    )
    assert progress.completed_stages == ["Concept", "Attempt unaided"]
    assert progress.session_count == 3
    assert progress.logged_minutes == 125


def test_progress_schema_rejects_private_notes_or_full_snapshot_fields():
    with pytest.raises(ValidationError):
        StudyProgressIn(
            selected_resource="spiral-matrix",
            completed_stages=[],
            notes="private study notes must remain local",
            evidence=[{"code": "private source code"}],
        )


def test_progress_schema_bounds_counts_and_stages():
    with pytest.raises(ValidationError):
        StudyProgressIn(session_count=-1)
    with pytest.raises(ValidationError):
        StudyProgressIn(completed_stages=["Concept"] * 9)
