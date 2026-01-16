from fastapi import APIRouter, HTTPException
try:
    from ..Components.Models import SliceRequest, SliceResponse
    from ..Components.Orchestrator import orchestrator
except ImportError:
    from Components.Models import SliceRequest, SliceResponse
    from Components.Orchestrator import orchestrator

router = APIRouter()

@router.post("/slice", response_model=SliceResponse)
async def slice_endpoint(request: SliceRequest):
    """
    Execute a slicing query via Joern.
    """
    try:
        return orchestrator.handle_slice(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
