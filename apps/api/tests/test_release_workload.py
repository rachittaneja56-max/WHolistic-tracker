from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.agents.services.recall import RecallDueItem
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.schemas.academic import GradeAssessmentRead
from app.services.academic import grade_summary, occurrences_for_entity
from app.services.agenda import build_agenda
from app.services.entity_search import extract_search_text


def _entity(entity_type: str, title: str, metadata: dict | None = None, parent_id=None) -> Entity:
    return Entity(
        id=uuid4(), user_id=uuid4(), type=entity_type, title=title, content="Study material", content_type="markdown",
        tags=["semester-5"], confidence_score=0.65, entity_metadata=metadata or {}, parent_id=parent_id,
    )


def test_realistic_semester_workload_scales_without_losing_agenda_contracts() -> None:
    """Exercise the production agenda/recurrence path with a semester-sized in-memory workload."""
    now = datetime(2026, 7, 20, 9, tzinfo=timezone.utc)
    subjects = [_entity("subject_topic", f"Course {index}", {"exam_date": "2026-08-15"}) for index in range(8)]
    tasks = [
        _entity(
            "task", f"Assignment {index}",
            {"academic_kind": "assignment", "status": "todo", "estimated_minutes": 30 + index % 90,
             "priority": ["low", "medium", "high", "urgent"][index % 4],
             "due_at": (now + timedelta(days=index % 42 - 4)).date().isoformat()},
            subjects[index % len(subjects)].id,
        )
        for index in range(2_400)
    ]
    notes = [_entity("note", f"Lecture note {index}") for index in range(600)]
    dsa = [_entity("dsa_problem", f"Problem {index}") for index in range(120)]
    recurring = _entity(
        "task", "Weekly tutorial", {"academic_kind": "tutorial", "start_at": "2026-07-20T10:00:00+00:00", "estimated_minutes": 60,
                                      "recurrence": {"frequency": "weekly", "until": "2026-09-30"}}, subjects[0].id,
    )
    occurrences = occurrences_for_entity(recurring, now, now + timedelta(days=42))
    sessions = [
        ActivitySession(id=uuid4(), user_id=subjects[0].user_id, entity_id=tasks[index].id, action="study_planned",
                        date=now + timedelta(hours=index % 18), meta={"duration_minutes": 25, "status": "planned"})
        for index in range(160)
    ]
    recalls = [RecallDueItem(entity=problem, due_score=8, due_reasons=["Scheduled review is due."], days_since_review=9, days_until_exam=None) for problem in dsa]

    agenda = build_agenda(
        entities=[*subjects, *tasks, *notes, *dsa], sessions=sessions, recalls=recalls, checks=[], projects=[],
        start_date=now.date(), end_date=(now + timedelta(days=7)).date(), now=now, available_minutes=240,
        learning_focuses=["Subjects", "DSA practice"], preferred_focus_minutes=45,
    )

    assert len(occurrences) == 6
    assert agenda.totals.total_items == len(tasks) + len(subjects) + len(sessions) + len(recalls)
    assert agenda.totals.overdue_items > 0
    assert agenda.capacity.is_over_capacity is True
    assert agenda.recommended is not None
    assert agenda.recommended.id == agenda.overdue.items[0].id
    assert agenda.balance.coursework_items >= len(tasks)


def test_release_search_recurrence_and_grades_accept_realistic_semester_inputs() -> None:
    assessments = [
        GradeAssessmentRead(entity_id=uuid4(), title=f"Assessment {index}", weight_percent=5, points_earned=80 + index % 20, points_possible=100)
        for index in range(20)
    ]
    grades = grade_summary(assessments, target_grade=85)
    rich_content = '[{"type":"paragraph","content":[{"type":"text","text":"Operating systems scheduling notes"}]}]'

    assert grades.current_weighted_grade is not None
    assert grades.current_weighted_grade >= 80
    assert grades.ungraded_weight == 0
    assert extract_search_text(rich_content, "blocks") == "Operating systems scheduling notes"
