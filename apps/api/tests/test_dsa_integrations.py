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


def test_leetcode_enriches_all_accepted_submissions_from_catalog(monkeypatch) -> None:
    class Response:
        def __init__(self, payload): self.payload = payload
        def raise_for_status(self): return None
        def json(self): return self.payload

    class Client:
        def __enter__(self): return self
        def __exit__(self, *args): return None
        def post(self, url, *args, **kwargs):
            return Response({"data": {"question": {"title": "Two Sum", "difficulty": "Easy", "topicTags": [{"name": "Array"}]}}})
        def request(self, method, url, *args, **kwargs):
            return Response({"data": {"question": {"title": "Two Sum", "difficulty": "Easy", "topicTags": [{"name": "Array"}]}}})
        def get(self, url, *args, **kwargs):
            if url.endswith("/acSubmission"):
                return Response({"submission": [{"titleSlug": "two-sum", "title": "Two Sum", "timestamp": "10", "lang": "python3"}, {"titleSlug": "two-sum", "timestamp": "20", "lang": "python3"}, {"titleSlug": "binary-tree", "title": "Binary Tree", "timestamp": "30", "lang": "java"}]})
            return Response({"problem": [{"titleSlug": "two-sum", "title": "Two Sum", "difficulty": "Easy", "topicTags": [{"name": "Array"}]}, {"titleSlug": "binary-tree", "title": "Binary Tree", "difficulty": "Medium", "topicTags": [{"name": "Tree"}]}]})

    monkeypatch.setattr("app.services.dsa_integrations._client", lambda: Client())
    from app.services.dsa_integrations import LeetCodeAdapter
    result = LeetCodeAdapter().fetch(DsaConnection(platform="leetcode", username="alice"))
    assert len(result) == 2
    assert next(item for item in result if item.external_id == "two-sum").difficulty == "easy"
    assert next(item for item in result if item.external_id == "two-sum").tags == ["Array"]
    assert next(item for item in result if item.external_id == "two-sum").submission_count == 2


def test_leetcode_catalog_uses_problemset_question_list(monkeypatch) -> None:
    class Response:
        def __init__(self, payload): self.payload = payload
        def raise_for_status(self): return None
        def json(self): return self.payload

    class Client:
        def __enter__(self): return self
        def __exit__(self, *args): return None
        def post(self, url, *args, **kwargs):
            return Response({"data": {"question": {"title": "Two Sum", "difficulty": "Easy", "topicTags": [{"name": "Array"}]}}})
        def request(self, method, url, *args, **kwargs):
            return Response({"data": {"question": {"title": "Two Sum", "difficulty": "Easy", "topicTags": [{"name": "Array"}]}}})
        def get(self, url, *args, **kwargs):
            if url.endswith("/acSubmission"):
                return Response({"submission": [{"titleSlug": "two-sum", "title": "Two Sum", "timestamp": "10", "lang": "python3"}]})
            return Response({"problemsetQuestionList": [{"titleSlug": "two-sum", "title": "Two Sum", "difficulty": "Easy", "topicTags": [{"name": "Array"}]}]})

    monkeypatch.setattr("app.services.dsa_integrations._client", lambda: Client())
    from app.services.dsa_integrations import LeetCodeAdapter
    result = LeetCodeAdapter().fetch(DsaConnection(platform="leetcode", username="alice"))
    assert result[0].difficulty == "easy"
    assert result[0].tags == ["Array"]
