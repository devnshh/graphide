from fastapi import APIRouter

from ..Components.Models import VerifyRequest, VerifyResponse
from ..Components.Orchestrator import orchestrator

router = APIRouter()

@router.post("/verify", response_model=VerifyResponse)
async def verify_endpoint(request: VerifyRequest):
    """Verify a generated patch."""
    result = orchestrator.handle_verify(
        request.original_code,
        request.patched_code,
        request.language,
    )
    return VerifyResponse(
        status="success",
        is_valid=result["is_valid"],
        errors=result["errors"],
    )
