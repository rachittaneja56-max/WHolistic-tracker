from app.schemas.dsa_integrations import DsaConnection, DsaConnectionsUpdate
from app.services.dsa_integrations import CodeforcesAdapter, ImportedProblem, _CodeChefProblemParser


def test_connections_strip_usernames_and_limit_platforms() -> None:
    connection = DsaConnection(platform="leetcode", username="  alice  ", profile_url=" https://leetcode.com/u/alice/ ")
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
            return {"status": "OK", "result": [
                {"creationTimeSeconds": 2, "verdict": "WRONG_ANSWER", "problem": {"contestId": 1, "index": "A", "name": "Pair", "tags": ["greedy"]}},
                {"creationTimeSeconds": 3, "verdict": "OK", "sourceCode": "print(1)", "programmingLanguage": "Python", "problem": {"contestId": 1, "index": "A", "name": "Pair", "tags": ["greedy"]}},
            ]}

    class Client:
        def __enter__(self): return self
        def __exit__(self, *args): return None
        def get(self, *args, **kwargs): return Response()

    monkeypatch.setattr("app.services.dsa_integrations._client", lambda: Client())
    result = CodeforcesAdapter().fetch(DsaConnection(platform="codeforces", username="alice"))
    assert len(result) == 1
    assert result[0].external_id == "1:A"
    assert result[0].accepted is True
    assert result[0].submission_count == 2
    assert result[0].solution_code == "print(1)"
