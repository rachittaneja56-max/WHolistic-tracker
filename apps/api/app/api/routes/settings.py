from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.settings import AiSettingUpdate, SettingsStatusRead
from app.services.auth import require_owner_mutation
from app.services.runtime_settings import get_settings_status, set_ai_enabled

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/status", response_model=SettingsStatusRead)
def settings_status(response: Response, db: Session = Depends(get_db)) -> SettingsStatusRead:
    response.headers["Cache-Control"] = "no-store"
    return get_settings_status(db)


@router.patch("/ai", response_model=SettingsStatusRead)
def update_ai_setting(payload: AiSettingUpdate, response: Response, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> SettingsStatusRead:
    response.headers["Cache-Control"] = "no-store"
    set_ai_enabled(db, payload.enabled)
    return get_settings_status(db)
