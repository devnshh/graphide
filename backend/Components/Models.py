from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel

ResponseStatus = Literal["success", "error", "processing"]
ChatStage = Literal["Q", "D", "KB", "Report", "General"]

# ============================================================================
# Shared Models
# ============================================================================

class CodeRange(BaseModel):
    startLine: int
    endLine: int
    startColumn: Optional[int] = None
    endColumn: Optional[int] = None

class FileContext(BaseModel):
    filePath: str
    content: str
    language: str


class PatchProposal(BaseModel):
    code: str
    description: str


class ValidationStatus(BaseModel):
    passed: bool
    errors: List[str]

# ============================================================================
# API Request Models
# ============================================================================

class ScanRequest(BaseModel):
    filePath: str
    language: str
    intent: str
    codeRange: Optional[CodeRange] = None
    userQuery: Optional[str] = None

class ChatRequest(BaseModel):
    query: str
    context: Optional[Dict[str, Any]] = None
    files: Optional[List[FileContext]] = None
    sessionId: str
    stage: ChatStage

class SliceRequest(BaseModel):
    code: str
    query: str
    filePath: str

class MediaRequest(BaseModel):
    flowchart_data: Dict[str, Any]
    vulnerability_id: str

class VerifyRequest(BaseModel):
    original_code: str
    patched_code: str
    language: str

# ============================================================================
# API Response Models
# ============================================================================

class AgentOutput(BaseModel):
    agentName: str
    markdownOutput: str
    metadata: Optional[Dict[str, Any]] = None

class StandardResponse(BaseModel):
    status: ResponseStatus
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class ScanResponse(StandardResponse):
    agentOutputs: Optional[List[AgentOutput]] = None
    patchProposals: Optional[List[PatchProposal]] = None
    vulnerabilities: Optional[List[Dict[str, Any]]] = None
    validationStatus: Optional[ValidationStatus] = None


class ChatResponse(StandardResponse):
    agent_outputs: List[AgentOutput]

class SliceResponse(StandardResponse):
    slices: List[Dict[str, Any]]

class MediaResponse(StandardResponse):
    image_url: str

class VerifyResponse(StandardResponse):
    is_valid: bool
    errors: List[str]
