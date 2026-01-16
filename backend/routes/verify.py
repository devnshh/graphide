from fastapi import APIRouter, HTTPException
try:
    from ..Components.Models import VerifyRequest, VerifyResponse
    from ..Components.Orchestrator import orchestrator
except ImportError:
    from Components.Models import VerifyRequest, VerifyResponse
    from Components.Orchestrator import orchestrator

router = APIRouter()

@router.post("/verify", response_model=VerifyResponse)
async def verify_endpoint(request: VerifyRequest):
    """
    Verify a generated patch.
    """
    try:
        result = orchestrator.handle_verify(request.original_code, request.patched_code, request.language)
        return VerifyResponse(
            status="success",
            is_valid=result["is_valid"],
            errors=result["errors"]
        )
    except Exception as e:
        # raise HTTPException(status_code=500, detail=str(e))
        # Fail gracefully for hackathon
        return VerifyResponse(status="error", is_valid=False, errors=[str(e)])
