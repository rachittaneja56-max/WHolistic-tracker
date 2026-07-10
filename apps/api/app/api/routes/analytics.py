from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entity import Entity
from app.models.review import Review
from app.models.session import ActivitySession
from app.schemas.analytics import HeatmapDayRead, HeatmapResponse, LearningVsShippingDayRead, LearningVsShippingResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])
DEFAULT_RANGE_DAYS = 84
LEARNING_ENTITY_TYPES = {"til", "note"}
SHIPPING_SESSION_ACTIONS = {"push", "pr_merged"}


def get_default_date_range(now: datetime | None = None) -> tuple[date, date]:
    current_time = now or datetime.now(timezone.utc)
    end_date = current_time.date()
    start_date = end_date - timedelta(days=DEFAULT_RANGE_DAYS - 1)
    return start_date, end_date


def resolve_date_range(start_date: date | None, end_date: date | None) -> tuple[date, date, datetime, datetime]:
    default_start_date, default_end_date = get_default_date_range()
    resolved_start_date = start_date or default_start_date
    resolved_end_date = end_date or default_end_date
    if resolved_start_date > resolved_end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date must be on or before end_date")

    range_start = datetime.combine(resolved_start_date, time.min, tzinfo=timezone.utc)
    range_end = datetime.combine(resolved_end_date, time.max, tzinfo=timezone.utc)
    return resolved_start_date, resolved_end_date, range_start, range_end


def date_key_from_datetime(value: datetime | None) -> date | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.date()
    return value.astimezone(timezone.utc).date()


@router.get("/heatmap", response_model=HeatmapResponse)
def get_analytics_heatmap(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> HeatmapResponse:
    resolved_start_date, resolved_end_date, range_start, range_end = resolve_date_range(start_date, end_date)

    per_day: dict[date, dict[str, int]] = defaultdict(
        lambda: {
            "created_entities": 0,
            "revisited_entities": 0,
            "reviews": 0,
            "pr_opened": 0,
            "pr_merged": 0,
            "pushes": 0,
            "tils_created": 0,
        }
    )

    created_entities = db.scalars(
        select(Entity)
        .where(Entity.created_at.is_not(None))
        .where(Entity.created_at >= range_start)
        .where(Entity.created_at <= range_end)
    ).all()
    for entity in created_entities:
        day = date_key_from_datetime(entity.created_at)
        if day is None:
            continue
        per_day[day]["created_entities"] += 1
        if entity.type == "til":
            per_day[day]["tils_created"] += 1

    revisited_seen: dict[date, set[object]] = defaultdict(set)
    revisited_sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.action == "revisited")
        .where(ActivitySession.date.is_not(None))
        .where(ActivitySession.date >= range_start)
        .where(ActivitySession.date <= range_end)
    ).all()
    for session_row in revisited_sessions:
        day = date_key_from_datetime(session_row.date)
        if day is None:
            continue
        unique_key = session_row.entity_id or session_row.id
        if unique_key in revisited_seen[day]:
            continue
        revisited_seen[day].add(unique_key)
        per_day[day]["revisited_entities"] += 1

    reviews = db.scalars(
        select(Review)
        .where(Review.reviewed_at.is_not(None))
        .where(Review.reviewed_at >= range_start)
        .where(Review.reviewed_at <= range_end)
    ).all()
    for review in reviews:
        day = date_key_from_datetime(review.reviewed_at)
        if day is not None:
            per_day[day]["reviews"] += 1

    github_sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.action.in_(["pr_opened", "pr_merged", "push"]))
        .where(ActivitySession.date.is_not(None))
        .where(ActivitySession.date >= range_start)
        .where(ActivitySession.date <= range_end)
    ).all()
    for session_row in github_sessions:
        day = date_key_from_datetime(session_row.date)
        if day is None or session_row.action is None:
            continue
        if session_row.action == "pr_opened":
            per_day[day]["pr_opened"] += 1
        elif session_row.action == "pr_merged":
            per_day[day]["pr_merged"] += 1
        elif session_row.action == "push":
            per_day[day]["pushes"] += 1

    days: list[HeatmapDayRead] = []
    cursor = resolved_start_date
    while cursor <= resolved_end_date:
        counts = per_day[cursor]
        days.append(HeatmapDayRead(date=cursor, **counts))
        cursor += timedelta(days=1)

    return HeatmapResponse(range={"start_date": resolved_start_date, "end_date": resolved_end_date}, days=days)


@router.get("/learning-vs-shipping", response_model=LearningVsShippingResponse)
def get_learning_vs_shipping(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> LearningVsShippingResponse:
    resolved_start_date, resolved_end_date, range_start, range_end = resolve_date_range(start_date, end_date)

    shipping_by_day: dict[date, int] = defaultdict(int)
    learning_by_day: dict[date, int] = defaultdict(int)

    shipping_sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.action.in_(list(SHIPPING_SESSION_ACTIONS)))
        .where(ActivitySession.date.is_not(None))
        .where(ActivitySession.date >= range_start)
        .where(ActivitySession.date <= range_end)
    ).all()
    for session_row in shipping_sessions:
        day = date_key_from_datetime(session_row.date)
        if day is not None:
            shipping_by_day[day] += 1

    learning_entities = db.scalars(
        select(Entity)
        .where(Entity.type.in_(list(LEARNING_ENTITY_TYPES)))
        .where(Entity.created_at.is_not(None))
        .where(Entity.created_at >= range_start)
        .where(Entity.created_at <= range_end)
    ).all()
    for entity in learning_entities:
        day = date_key_from_datetime(entity.created_at)
        if day is not None:
            learning_by_day[day] += 1

    learning_reviews = db.scalars(
        select(Review)
        .where(Review.reviewed_at.is_not(None))
        .where(Review.reviewed_at >= range_start)
        .where(Review.reviewed_at <= range_end)
    ).all()
    for review in learning_reviews:
        day = date_key_from_datetime(review.reviewed_at)
        if day is not None:
            learning_by_day[day] += 1

    learning_revisits_seen: dict[date, set[object]] = defaultdict(set)
    learning_revisits = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.action == "revisited")
        .where(ActivitySession.date.is_not(None))
        .where(ActivitySession.date >= range_start)
        .where(ActivitySession.date <= range_end)
    ).all()
    for session_row in learning_revisits:
        day = date_key_from_datetime(session_row.date)
        if day is None:
            continue
        unique_key = session_row.entity_id or session_row.id
        if unique_key in learning_revisits_seen[day]:
            continue
        learning_revisits_seen[day].add(unique_key)
        learning_by_day[day] += 1

    days: list[LearningVsShippingDayRead] = []
    shipped_without_learning_days = 0
    learning_after_shipping_days = 0
    shipping_days = 0
    learning_days = 0

    cursor = resolved_start_date
    while cursor <= resolved_end_date:
        shipping_count = shipping_by_day.get(cursor, 0)
        learning_count = learning_by_day.get(cursor, 0)
        if shipping_count > 0:
            shipping_days += 1
        if learning_count > 0:
            learning_days += 1
        if shipping_count > 0 and learning_count == 0:
            shipped_without_learning_days += 1
        if shipping_count > 0 and learning_count > 0:
            learning_after_shipping_days += 1

        days.append(
            LearningVsShippingDayRead(
                date=cursor,
                shipping_count=shipping_count,
                learning_count=learning_count,
            )
        )
        cursor += timedelta(days=1)

    return LearningVsShippingResponse(
        range={"start_date": resolved_start_date, "end_date": resolved_end_date},
        summary={
            "shipped_without_learning_days": shipped_without_learning_days,
            "learning_after_shipping_days": learning_after_shipping_days,
            "shipping_days": shipping_days,
            "learning_days": learning_days,
        },
        days=days,
    )
