from fastapi import APIRouter, HTTPException
try:
    from ..Components.Models import MediaRequest, MediaResponse
    from ..Components.Orchestrator import orchestrator
except ImportError:
    from Components.Models import MediaRequest, MediaResponse
    from Components.Orchestrator import orchestrator

router = APIRouter()

@router.post("/media", response_model=MediaResponse)
async def media_endpoint(request: MediaRequest):
    """
    Handle media generation requests (Flowcharts).
    """
    try:
        return orchestrator.handle_media(request.flowchart_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
