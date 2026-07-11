from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.graph import DecayConfidenceJobRead
from app.services.auth import require_owner_mutation
from app.services.confidence import apply_confidence_decay

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/decay-confidence", response_model=DecayConfidenceJobRead)
def decay_confidence_job(db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> DecayConfidenceJobRead:
    result = apply_confidence_decay(db)
    return DecayConfidenceJobRead(**result)
