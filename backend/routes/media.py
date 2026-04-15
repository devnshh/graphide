from fastapi import APIRouter

from ..Components.Models import MediaRequest, MediaResponse
from ..Components.Orchestrator import orchestrator

router = APIRouter()

@router.post("/media", response_model=MediaResponse)
async def media_endpoint(request: MediaRequest):
    """Handle media generation requests."""
    return orchestrator.handle_media(request.flowchart_data)
