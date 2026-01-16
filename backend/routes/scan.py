from fastapi import APIRouter, HTTPException
try:
    from ..Components.Models import ScanRequest, ScanResponse
    from ..Components.Orchestrator import orchestrator
except ImportError:
    from Components.Models import ScanRequest, ScanResponse
    from Components.Orchestrator import orchestrator

router = APIRouter()

@router.post("/agent/request", response_model=ScanResponse)
async def scan_endpoint(request: ScanRequest):
    """
    Initiate a scan for selected files.
    """
   

    try:
        print(request)
        return orchestrator.handle_scan(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    