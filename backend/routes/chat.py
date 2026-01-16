from fastapi import APIRouter, HTTPException
try:
    from ..Components.Models import ChatRequest, ChatResponse
    from ..Components.Orchestrator import orchestrator
except ImportError:
    from Components.Models import ChatRequest, ChatResponse
    from Components.Orchestrator import orchestrator

router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """
    Unified Chat Endpoint for interacting with Agents (Q, D, Reporting, etc.).
    """
    try:
        return orchestrator.handle_chat(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
