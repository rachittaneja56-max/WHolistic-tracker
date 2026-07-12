from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.dsa_integrations import DsaConnectionsUpdate, DsaIntegrationStatusRead, DsaSyncResponse
from app.services.auth import require_owner_mutation
from app.services.dsa_integrations import get_connections, save_connections, sync_connections

router = APIRouter(prefix="/integrations/dsa", tags=["dsa-integrations"])


def _status(db: Session) -> DsaIntegrationStatusRead:
    connections = get_connections(db)
    return DsaIntegrationStatusRead(connections=connections, configured_platforms=[item["platform"] for item in connections if item.get("enabled", True)])


@router.get("/status", response_model=DsaIntegrationStatusRead)
def get_dsa_integration_status(response: Response, db: Session = Depends(get_db)) -> DsaIntegrationStatusRead:
    response.headers["Cache-Control"] = "no-store"
    return _status(db)


@router.put("/connections", response_model=DsaIntegrationStatusRead)
def update_dsa_connections(payload: DsaConnectionsUpdate, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> DsaIntegrationStatusRead:
    platforms = [connection.platform for connection in payload.connections]
    if len(set(platforms)) != len(platforms):
        raise HTTPException(status_code=400, detail="Each platform can only be configured once")
    save_connections(db, payload.connections)
    return _status(db)


@router.post("/sync", response_model=DsaSyncResponse)
def sync_dsa_integrations(db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> DsaSyncResponse:
    results = sync_connections(db)
    return DsaSyncResponse(results=results, total_imported=sum(item.get("imported_count", 0) for item in results), total_updated=sum(item.get("updated_count", 0) for item in results), total_skipped=sum(item.get("skipped_count", 0) for item in results))
