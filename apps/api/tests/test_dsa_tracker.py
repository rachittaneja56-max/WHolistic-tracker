from sqlalchemy.dialects import postgresql

from app.api.routes.dsa_tracker import list_dsa_problems


class _Rows:
    def all(self):
        return []


class _RecordingDb:
    def __init__(self):
        self.scalar_queries = []
        self.items_query = None

    def scalar(self, query):
        self.scalar_queries.append(query)
        return 0

    def scalars(self, query):
        self.items_query = query
        return _Rows()


def _sql(query) -> str:
    return str(
        query.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


def test_dsa_filters_and_stats_share_row_status_and_platform_fallbacks() -> None:
    db = _RecordingDb()

    response = list_dsa_problems(
        search=None,
        platform="manual",
        difficulty=None,
        problem_status="solved",
        tag=None,
        sort="updated_desc",
        limit=50,
        offset=0,
        db=db,
        _owner="owner",
    )

    filter_sql = _sql(db.scalar_queries[0])
    solved_stats_sql = _sql(db.scalar_queries[1])
    review_stats_sql = _sql(db.scalar_queries[3])
    platform_stats_sql = _sql(db.scalar_queries[4])

    # Explicit metadata wins; imported accepted=true is the solved fallback.
    assert "metadata ->> 'status'" in filter_sql
    assert "metadata -> 'integration'" in filter_sql
    assert "accepted" in filter_sql
    assert "THEN 'solved' ELSE 'unsolved'" in filter_sql
    assert "= 'solved'" in filter_sql

    # Missing/empty integration.platform is the same 'manual' value shown in rows.
    assert "platform" in filter_sql
    assert "coalesce(nullif" in filter_sql.lower()
    assert "'manual'" in filter_sql

    # Summary cards use the same expressions, including manual as a distinct platform.
    assert "accepted" in solved_stats_sql
    assert "= 'solved'" in solved_stats_sql
    assert "accepted" in review_stats_sql
    assert "= 'review'" in review_stats_sql
    assert "count(distinct(coalesce(nullif" in platform_stats_sql.lower()
    assert "'manual'" in platform_stats_sql

    assert response.total == 0
    assert response.stats.solved == 0
    assert response.stats.review_due == 0
    assert response.stats.platforms == 0
