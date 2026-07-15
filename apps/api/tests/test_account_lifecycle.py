from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.account import AccountDeleteRequest, delete_own_account
from app.services.auth import AuthPrincipal


class _DeleteDb:
    def __init__(self, rowcount=1):
        self.rowcount = rowcount
        self.parameters = None
        self.committed = False
        self.rolled_back = False

    def execute(self, _statement, parameters):
        self.parameters = parameters
        return SimpleNamespace(rowcount=self.rowcount)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def _principal(role="user"):
    return AuthPrincipal(
        user_id=uuid4(),
        session_id=uuid4(),
        email="learner@example.com",
        role=role,
    )


def test_account_deletion_requires_exact_email_confirmation():
    with pytest.raises(HTTPException) as error:
        delete_own_account(
            AccountDeleteRequest(confirmation_email="other@example.com"),
            _DeleteDb(),
            _principal(),
        )
    assert error.value.status_code == 400


def test_root_account_cannot_self_delete():
    with pytest.raises(HTTPException) as error:
        delete_own_account(
            AccountDeleteRequest(confirmation_email="learner@example.com"),
            _DeleteDb(),
            _principal("root_admin"),
        )
    assert error.value.status_code == 409


def test_account_deletion_is_scoped_to_authenticated_user_and_email():
    db = _DeleteDb()
    principal = _principal()

    response = delete_own_account(
        AccountDeleteRequest(confirmation_email=principal.email),
        db,
        principal,
    )

    assert response.status_code == 204
    assert db.parameters == {"user_id": principal.user_id, "email": principal.email}
    assert db.committed is True
