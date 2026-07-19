from uuid import uuid4

from app.services.subject_workflows import revision_priority, split_syllabus_topics, syllabus_preview_token


def test_syllabus_preview_detects_normalized_and_repeated_duplicates() -> None:
    new, duplicates = split_syllabus_topics([" Graphs ", "trees", "graphs", ""], ["Graphs"])
    assert new == ["trees"]
    assert duplicates == ["Graphs", "graphs"]
    subject_id = uuid4()
    assert syllabus_preview_token(subject_id, ["Graphs", "Trees"]) == syllabus_preview_token(subject_id, ["graphs", "trees"])


def test_revision_priority_weights_exam_confidence_time_and_effort() -> None:
    urgent_weak = revision_priority(exam_weight=70, confidence=.2, days_remaining=3, estimated_minutes=30)
    distant_confident = revision_priority(exam_weight=70, confidence=.8, days_remaining=20, estimated_minutes=30)
    longer_same_work = revision_priority(exam_weight=70, confidence=.2, days_remaining=3, estimated_minutes=120)
    assert urgent_weak > distant_confident
    assert urgent_weak > longer_same_work
