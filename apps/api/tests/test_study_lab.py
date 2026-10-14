import pytest
from pydantic import ValidationError

from app.routers.study_lab import StudyProgressIn, StudyStateIn, _valid_stage


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


def test_full_state_accepts_notes_records_and_custom_resources_for_cross_device_sync():
    payload = StudyStateIn.model_validate({
        "data": {
            "selected": "spiral-matrix",
            "completed": ["Concept", "Attempt unaided"],
            "notes": "I traced the top row first.",
            "records": [{
                "id": "record-1", "date": "2026-10-08T12:00:00Z",
                "resource": "Spiral Matrix", "minutes": 25,
                "evidence": "Attempted with four boundaries.", "steps": ["Concept"]
            }],
            "customResources": [{
                "id": "custom-1", "title": "My system design notes",
                "url": "https://example.com/notes", "area": "Added by you",
                "note": "Review from memory"
            }],
            "updatedAt": 1791460800000
        }
    })
    assert payload.data.notes == "I traced the top row first."
    assert payload.data.records[0].evidence.startswith("Attempted")
    assert payload.data.customResources[0].id == "custom-1"


def test_full_state_rejects_unexpected_fields():
    with pytest.raises(ValidationError):
        StudyStateIn.model_validate({"data": {"notes": "x", "unknown": "should fail"}})



def test_full_state_accepts_gated_lesson_progress_and_xp():
    payload = StudyStateIn.model_validate({
        "data": {
            "selected": "python-tutorial",
            "completed": ["py-read", "py-types"],
            "mastered": ["py-read"],
            "xpAwards": {"py-read": {"date": "2026-10-15", "points": 10, "mode": "practice"}},
            "notes": "",
            "records": [{
                "id": "mastery-py-read-1", "date": "2026-10-15T00:00:00Z",
                "resource": "Read, close, recreate", "minutes": 25,
                "evidence": "Rebuilt the examples and tested a changed input.",
                "steps": ["py-read"]
            }],
            "customResources": [],
            "updatedAt": 1792022400000
        }
    })
    assert payload.data.mastered == ["py-read"]
    assert payload.data.xpAwards["py-read"]["points"] == 10


def test_only_known_lesson_ids_are_accepted_as_progress():
    assert _valid_stage("py-read")
    assert _valid_stage("Concept")
    assert not _valid_stage("invented-lesson")
