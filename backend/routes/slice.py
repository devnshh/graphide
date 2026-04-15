from fastapi import APIRouter

from ..Components.Models import SliceRequest, SliceResponse
from ..Components.Orchestrator import orchestrator

router = APIRouter()

@router.post("/slice", response_model=SliceResponse)
async def slice_endpoint(request: SliceRequest):
    """Execute a slicing query via Joern."""
    return await orchestrator.handle_slice(request)
