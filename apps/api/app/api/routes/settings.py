from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.settings import AiCredentialUpdate, AiProviderName, AiSettingUpdate, GithubCredentialName, GithubCredentialUpdate, GithubSettingUpdate, SettingsStatusRead
from app.services.auth import require_owner_mutation
from app.services.runtime_settings import (
    get_settings_status,
    remove_ai_credential,
    remove_github_credential,
    set_ai_credential,
    set_github_credential,
    update_ai_settings,
    update_github_enabled,
)

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/status", response_model=SettingsStatusRead)
def settings_status(response: Response, db: Session = Depends(get_db)) -> SettingsStatusRead:
    response.headers["Cache-Control"] = "no-store"
    return get_settings_status(db)


@router.patch("/ai", response_model=SettingsStatusRead)
def update_ai_setting(payload: AiSettingUpdate, response: Response, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> SettingsStatusRead:
    response.headers["Cache-Control"] = "no-store"
    update_ai_settings(db, payload)
    return get_settings_status(db)


@router.put("/ai/credentials/{provider}", response_model=SettingsStatusRead)
def save_ai_key(provider: AiProviderName, payload: AiCredentialUpdate, response: Response, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> SettingsStatusRead:
    try:
        set_ai_credential(db, provider, payload.api_key)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    response.headers["Cache-Control"] = "no-store"
    return get_settings_status(db)


@router.delete("/ai/credentials/{provider}", response_model=SettingsStatusRead)
def delete_ai_key(provider: AiProviderName, response: Response, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> SettingsStatusRead:
    remove_ai_credential(db, provider)
    response.headers["Cache-Control"] = "no-store"
    return get_settings_status(db)


@router.patch("/github", response_model=SettingsStatusRead)
def update_github_setting(payload: GithubSettingUpdate, response: Response, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> SettingsStatusRead:
    update_github_enabled(db, payload.enabled)
    response.headers["Cache-Control"] = "no-store"
    return get_settings_status(db)


@router.put("/github/credentials/{credential}", response_model=SettingsStatusRead)
def save_github_credential(credential: GithubCredentialName, payload: GithubCredentialUpdate, response: Response, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> SettingsStatusRead:
    try:
        set_github_credential(db, credential, payload.value)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    response.headers["Cache-Control"] = "no-store"
    return get_settings_status(db)


@router.delete("/github/credentials/{credential}", response_model=SettingsStatusRead)
def delete_github_credential(credential: GithubCredentialName, response: Response, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> SettingsStatusRead:
    remove_github_credential(db, credential)
    response.headers["Cache-Control"] = "no-store"
    return get_settings_status(db)
