from fastapi import APIRouter

from ..Components.Models import ScanRequest, ScanResponse
from ..Components.Orchestrator import orchestrator

router = APIRouter()

@router.post("/agent/request", response_model=ScanResponse)
async def scan_endpoint(request: ScanRequest):
    """Initiate a scan for selected files."""
    return await orchestrator.handle_scan(request)
