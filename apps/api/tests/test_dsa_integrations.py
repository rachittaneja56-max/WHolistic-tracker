import pytest

from app.schemas.dsa_integrations import DsaConnection, DsaConnectionsUpdate
from app.services import dsa_integrations
from app.services.dsa_integrations import (
    CodeforcesAdapter,
    LeetCodeAdapter,
    PUBLIC_LEETCODE_DEPRECATION_MESSAGE,
    _CodeChefProblemParser,
    sync_connections,
)


def test_connections_strip_usernames_and_limit_platforms() -> None:
    connection = DsaConnection(
        platform="leetcode",
        username="  alice  ",
        profile_url=" https://leetcode.com/u/alice/ ",
    )
    assert connection.username == "alice"
    assert connection.profile_url == "https://leetcode.com/u/alice/"
    assert len(DsaConnectionsUpdate(connections=[connection]).connections) == 1


def test_codechef_parser_extracts_problem_links() -> None:
    parser = _CodeChefProblemParser()
    parser.feed('<a href="/problems/TEST"> Test Problem </a><a href="/not-a-problem">ignore</a>')
    assert parser.items == [("/problems/TEST", "Test Problem")]


def test_codeforces_groups_submissions_and_preserves_best_solution(monkeypatch) -> None:
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "status": "OK",
                "result": [
                    {
                        "creationTimeSeconds": 2,
                        "verdict": "WRONG_ANSWER",
                        "problem": {
                            "contestId": 1,
                            "index": "A",
                            "name": "Pair",
                            "tags": ["greedy"],
                        },
                    },
                    {
                        "creationTimeSeconds": 3,
                        "verdict": "OK",
                        "sourceCode": "print(1)",
                        "programmingLanguage": "Python",
                        "problem": {
                            "contestId": 1,
                            "index": "A",
                            "name": "Pair",
                            "tags": ["greedy"],
                        },
                    },
                ],
            }

    class Client:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def get(self, *args, **kwargs):
            return Response()

    monkeypatch.setattr("app.services.dsa_integrations._client", lambda: Client())
    result = CodeforcesAdapter().fetch(DsaConnection(platform="codeforces", username="alice"))
    assert len(result) == 1
    assert result[0].external_id == "1:A"
    assert result[0].accepted is True
    assert result[0].submission_count == 2
    assert result[0].solution_code == "print(1)"


def test_public_leetcode_adapter_is_explicitly_deprecated(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.dsa_integrations._client",
        lambda: pytest.fail("deprecated LeetCode sync must not make a network request"),
    )

    with pytest.raises(RuntimeError, match="browser extension"):
        LeetCodeAdapter().fetch(DsaConnection(platform="leetcode", username="alice"))

    assert "third-party feed is unreliable" in PUBLIC_LEETCODE_DEPRECATION_MESSAGE


def test_sync_skips_leetcode_and_keeps_codeforces_enabled(monkeypatch) -> None:
    configured = [
        {"platform": "leetcode", "username": "alice", "profile_url": None, "enabled": True},
        {"platform": "codeforces", "username": "alice_cf", "profile_url": None, "enabled": True},
    ]
    calls = {"leetcode": 0, "codeforces": 0}

    class Adapter:
        def __init__(self, platform):
            self.platform = platform

        def fetch(self, _connection):
            calls[self.platform] += 1
            if self.platform == "leetcode":
                pytest.fail("sync_connections must not call the deprecated LeetCode adapter")
            return []

    class Rows:
        def all(self):
            return []

    class Db:
        def __init__(self):
            self.commits = 0

        def scalars(self, _query):
            return Rows()

        def commit(self):
            self.commits += 1

    monkeypatch.setattr(dsa_integrations, "get_connections", lambda _db: configured)
    monkeypatch.setattr(dsa_integrations, "record_session", lambda *_args, **_kwargs: None)
    monkeypatch.setitem(dsa_integrations.ADAPTERS, "leetcode", Adapter("leetcode"))
    monkeypatch.setitem(dsa_integrations.ADAPTERS, "codeforces", Adapter("codeforces"))

    db = Db()
    results = sync_connections(db)

    assert results[0] == {
        "platform": "leetcode",
        "status": "skipped",
        "skipped_count": 0,
        "message": PUBLIC_LEETCODE_DEPRECATION_MESSAGE,
    }
    assert results[1]["platform"] == "codeforces"
    assert results[1]["status"] == "synced"
    assert calls == {"leetcode": 0, "codeforces": 1}
    assert db.commits == 1
