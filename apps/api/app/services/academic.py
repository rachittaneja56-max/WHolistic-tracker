from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable
from zoneinfo import ZoneInfo

from app.models.entity import Entity
from app.schemas.academic import AcademicOccurrenceRead, GradeAssessmentRead, GradeSummaryRead


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        raw = value.strip()
        if len(raw) == 10:
            return datetime.combine(date.fromisoformat(raw), time.min, tzinfo=timezone.utc)
        return as_utc(datetime.fromisoformat(raw.replace("Z", "+00:00")))
    except ValueError:
        return None


def occurrence_starts(start: datetime, recurrence: object, range_start: datetime, range_end: datetime) -> list[datetime]:
    """Generate wall-clock occurrences, preserving DST offsets of the source zone."""
    if isinstance(recurrence, str):
        recurrence = {"frequency": recurrence}
    if not isinstance(recurrence, dict):
        return [start] if range_start <= start <= range_end else []
    frequency = recurrence.get("frequency")
    if frequency not in {"daily", "weekly"}:
        return []
    until = recurrence.get("until")
    until_date = date.fromisoformat(until) if isinstance(until, str) else None
    weekdays = set(recurrence.get("weekdays", [])) if isinstance(recurrence.get("weekdays", []), list) else set()
    if any(not isinstance(day, int) or day < 0 or day > 6 for day in weekdays):
        return []
    source_tz = start.tzinfo or timezone.utc
    local_start = start.astimezone(source_tz)
    cursor_date = max(local_start.date(), range_start.astimezone(source_tz).date())
    if cursor_date < local_start.date():
        cursor_date = local_start.date()
    results: list[datetime] = []
    last_date = min(range_end.astimezone(source_tz).date(), until_date) if until_date else range_end.astimezone(source_tz).date()
    while cursor_date <= last_date:
        eligible = cursor_date >= local_start.date() and (frequency == "daily" or not weekdays and cursor_date.weekday() == local_start.weekday() or bool(weekdays) and cursor_date.weekday() in weekdays)
        if eligible:
            candidate = datetime.combine(cursor_date, local_start.timetz()).replace(tzinfo=source_tz)
            candidate_utc = candidate.astimezone(timezone.utc)
            if range_start <= candidate_utc <= range_end:
                results.append(candidate_utc)
        cursor_date += timedelta(days=1)
    return results


def occurrences_for_entity(entity: Entity, range_start: datetime, range_end: datetime) -> list[AcademicOccurrenceRead]:
    metadata = entity.entity_metadata or {}
    start = parse_datetime(metadata.get("start_at"))
    if start is None:
        return []
    end = parse_datetime(metadata.get("end_at"))
    duration = end - start if end and end >= start else None
    overrides = metadata.get("recurrence_overrides", {})
    if not isinstance(overrides, dict):
        overrides = {}
    result: list[AcademicOccurrenceRead] = []
    for scheduled in occurrence_starts(start, metadata.get("recurrence"), range_start, range_end):
        key = scheduled.isoformat()
        override = overrides.get(key, {})
        if not isinstance(override, dict):
            override = {}
        actual_start = parse_datetime(override.get("start_at")) or scheduled
        actual_end = parse_datetime(override.get("end_at")) or (actual_start + duration if duration else None)
        result.append(AcademicOccurrenceRead(
            id=f"occurrence:{entity.id}:{key}", entity_id=entity.id, subject_id=entity.parent_id,
            title=str(override.get("title") or entity.title or "Scheduled academic work"),
            kind=str(metadata.get("academic_kind") or "study_block"), start_at=actual_start, end_at=actual_end,
            estimated_minutes=metadata.get("estimated_minutes") if isinstance(metadata.get("estimated_minutes"), int) else None,
            cancelled=bool(override.get("cancelled", False)),
        ))
    return [row for row in result if not row.cancelled]


def grade_summary(assessments: Iterable[GradeAssessmentRead], target_grade: float | None = None) -> GradeSummaryRead:
    rows = list(assessments)
    warnings: list[str] = []
    weights = [item.weight_percent for item in rows]
    if any(weight is None for weight in weights) and any(weight is not None for weight in weights):
        warnings.append("Assessments cannot mix weighted and unweighted grading.")
    if any(item.points_earned is not None and item.points_possible is not None and item.points_earned > item.points_possible for item in rows):
        warnings.append("Points earned cannot exceed points possible.")
    if any(item.points_earned is not None and (item.points_possible is None or item.points_possible <= 0) for item in rows):
        warnings.append("A recorded score requires positive points possible.")
    weighted = all(weight is not None for weight in weights) and bool(rows)
    total_weight = sum(float(item.weight_percent or 0) for item in rows) if weighted else 0.0
    if weighted and total_weight > 100.00001:
        warnings.append("Assessment weights exceed 100%.")
    if not weighted:
        graded = [item for item in rows if item.points_earned is not None and item.points_possible and item.points_possible > 0]
        if not graded:
            return GradeSummaryRead(target_grade=target_grade, warnings=warnings, assessments=rows)
        earned, possible = sum(item.points_earned or 0 for item in graded), sum(item.points_possible or 0 for item in graded)
        percent = round(earned / possible * 100, 2)
        return GradeSummaryRead(current_weighted_grade=percent, grade_on_graded_work=percent, target_grade=target_grade, warnings=warnings, assessments=rows)
    graded_weight = 0.0
    contribution = 0.0
    for item in rows:
        if item.points_earned is not None and item.points_possible and item.points_possible > 0:
            score = item.points_earned / item.points_possible * 100
            weight = float(item.weight_percent or 0)
            graded_weight += weight
            contribution += score * weight / 100
    ungraded = max(0.0, 100.0 - graded_weight)
    required = None
    if target_grade is not None and ungraded > 0:
        required = round((target_grade - contribution) / ungraded * 100, 2)
        if required < 0 or required > 100:
            warnings.append("The target is outside the possible range for remaining assessments.")
    return GradeSummaryRead(
        current_weighted_grade=round(contribution, 2) if graded_weight else None,
        grade_on_graded_work=round(contribution / graded_weight * 100, 2) if graded_weight else None,
        graded_weight=round(graded_weight, 2), ungraded_weight=round(ungraded, 2), total_weight=round(total_weight, 2),
        target_grade=target_grade, required_score_on_remaining=required, warnings=warnings, assessments=rows,
    )


def assessment_rows(tasks: Iterable[Entity]) -> list[GradeAssessmentRead]:
    rows = []
    for task in tasks:
        metadata = task.entity_metadata or {}
        if metadata.get("academic_kind") not in {"assignment", "exam"}:
            continue
        def number(name: str) -> float | None:
            value = metadata.get(name)
            return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
        rows.append(GradeAssessmentRead(entity_id=task.id, title=task.title or "Assessment", weight_percent=number("weight_percent"), points_earned=number("points_earned"), points_possible=number("points_possible")))
    return rows


def parse_ics(value: str) -> list[dict[str, object]]:
    if len(value) > 1_000_000:
        raise ValueError("ICS payload is too large")
    lines = re.sub(r"\r?\n[ \t]", "", value).replace("\r\n", "\n").split("\n")
    if "BEGIN:VCALENDAR" not in lines or "END:VCALENDAR" not in lines:
        raise ValueError("ICS must contain one VCALENDAR")
    events: list[dict[str, object]] = []
    current: dict[str, str] | None = None
    for line in lines:
        if line == "BEGIN:VEVENT":
            if current is not None: raise ValueError("Nested VEVENT is invalid")
            current = {}
        elif line == "END:VEVENT":
            if current is None: raise ValueError("VEVENT end without start")
            if "DTSTART" not in current or "SUMMARY" not in current: raise ValueError("VEVENT requires DTSTART and SUMMARY")
            start = _ics_datetime(current["DTSTART"])
            end = _ics_datetime(current["DTEND"]) if "DTEND" in current else None
            if end and end < start: raise ValueError("VEVENT ends before it starts")
            events.append({"uid": current.get("UID") or hashlib.sha256((current["DTSTART"] + current["SUMMARY"]).encode()).hexdigest(), "title": _ics_unescape(current["SUMMARY"]), "start": start, "end": end})
            current = None
        elif current is not None and ":" in line:
            key, content = line.split(":", 1); current[key.split(";", 1)[0]] = content
    if current is not None or len(events) > 1000: raise ValueError("Invalid or excessive ICS events")
    return events


def _ics_datetime(raw: str) -> datetime:
    try:
        if raw.endswith("Z"): return datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        if len(raw) == 8: return datetime.combine(datetime.strptime(raw, "%Y%m%d").date(), time.min, tzinfo=timezone.utc)
        return datetime.strptime(raw, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
    except ValueError as exc: raise ValueError("ICS date/time is invalid") from exc


def _ics_unescape(value: str) -> str:
    return value.replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def export_ics(events: Iterable[AcademicOccurrenceRead]) -> str:
    def stamp(value: datetime) -> str: return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Personal Dev KG//Academic Planning//EN", "CALSCALE:GREGORIAN"]
    for event in events:
        lines += ["BEGIN:VEVENT", f"UID:{event.id.replace(':', '-') }@personal-dev-kg", f"DTSTAMP:{stamp(datetime.now(timezone.utc))}", f"DTSTART:{stamp(event.start_at)}"]
        if event.end_at: lines.append(f"DTEND:{stamp(event.end_at)}")
        lines += [f"SUMMARY:{event.title.replace('\\', '\\\\').replace(',', '\\,').replace(';', '\\;').replace(chr(10), '\\n')}", "END:VEVENT"]
    return "\r\n".join(lines + ["END:VCALENDAR", ""])