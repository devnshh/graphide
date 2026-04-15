from fastapi import APIRouter

from ..Components.Models import ChatRequest, ChatResponse
from ..Components.Orchestrator import orchestrator

router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """Unified chat endpoint for interacting with agents."""
    return orchestrator.handle_chat(request)
