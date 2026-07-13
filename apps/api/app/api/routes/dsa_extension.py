from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.integration_client import IntegrationClient
from app.schemas.dsa_extension import (
    ExtensionExchangeRequest,
    ExtensionImportBatchRead,
    ExtensionImportBatchRequest,
    ExtensionImportItemResult,
    ExtensionPairingCodeRead,
    ExtensionPairingStatusRead,
    ExtensionTokenRead,
)
from app.services.auth import require_authenticated_owner, require_owner_mutation
from app.services.dsa_extension import (
    create_pairing_code,
    exchange_pairing_code,
    extension_status,
    require_extension_token,
    revoke_extension_tokens,
    upsert_extension_record,
)

router = APIRouter(prefix="/integrations/dsa/extension", tags=["dsa-extension"])
logger = logging.getLogger(__name__)


@router.get("/pairing", response_model=ExtensionPairingStatusRead)
def get_pairing_status(
    response: Response,
    db: Session = Depends(get_db),
    _owner: str = Depends(require_authenticated_owner),
) -> ExtensionPairingStatusRead:
    response.headers["Cache-Control"] = "no-store"
    paired, last_used_at, imported_problem_count = extension_status(db)
    return ExtensionPairingStatusRead(
        paired=paired,
        last_used_at=last_used_at,
        imported_problem_count=imported_problem_count,
    )


@router.post("/pairing-codes", response_model=ExtensionPairingCodeRead, status_code=status.HTTP_201_CREATED)
def issue_pairing_code(
    db: Session = Depends(get_db),
    _owner: str = Depends(require_owner_mutation),
) -> ExtensionPairingCodeRead:
    code, expires_at = create_pairing_code(db)
    return ExtensionPairingCodeRead(code=code, expires_at=expires_at)


@router.post("/exchange", response_model=ExtensionTokenRead)
def exchange_extension_code(payload: ExtensionExchangeRequest, db: Session = Depends(get_db)) -> ExtensionTokenRead:
    return ExtensionTokenRead(token=exchange_pairing_code(db, payload.code, payload.extension_name))


@router.delete("/pairing", status_code=status.HTTP_204_NO_CONTENT)
def revoke_extension(
    db: Session = Depends(get_db),
    _owner: str = Depends(require_owner_mutation),
) -> Response:
    revoke_extension_tokens(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/import-batches", response_model=ExtensionImportBatchRead)
def import_extension_batch(
    payload: ExtensionImportBatchRequest,
    db: Session = Depends(get_db),
    _client: IntegrationClient = Depends(require_extension_token),
) -> ExtensionImportBatchRead:
    results: list[ExtensionImportItemResult] = []
    for record in payload.records:
        try:
            with db.begin_nested():
                item_status, reason = upsert_extension_record(db, record)
            results.append(ExtensionImportItemResult(external_problem_id=record.external_problem_id, status=item_status, reason=reason))
        except IntegrityError:
            results.append(ExtensionImportItemResult(external_problem_id=record.external_problem_id, status="failed", reason="conflict"))
        except Exception:
            logger.exception("Extension import failed for %s", record.external_problem_id)
            results.append(ExtensionImportItemResult(external_problem_id=record.external_problem_id, status="failed", reason="invalid_record"))
    db.commit()
    return ExtensionImportBatchRead(
        imported=sum(item.status == "imported" for item in results),
        updated=sum(item.status == "updated" for item in results),
        skipped=sum(item.status == "skipped" for item in results),
        failed=sum(item.status == "failed" for item in results),
        results=results,
    )
