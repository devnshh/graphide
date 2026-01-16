from pydantic import BaseModel
from typing import List, Optional, Dict, Any

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

# ============================================================================
# API Request Models
# ============================================================================

class ScanRequest(BaseModel):
    filePath: str # List of file paths to scan
    language: str
    intent: str
    codeRange: Optional[CodeRange] = None
    userQuery: Optional[str] = None

class ChatRequest(BaseModel):
    query: str
    context: Optional[Dict[str, Any]] = None
    files: Optional[List[FileContext]] = None
    stage: str # "Q", "D", "KB", "Report", "General"

class SliceRequest(BaseModel):
    code: str
    query: str # CPG Query
    filePath: str

class MediaRequest(BaseModel):
    flowchart_data: Dict[str, Any] # Data needed to generate the flowchart
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
    status: str # "success", "error"
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class ScanResponse(StandardResponse):
    scan_id: str

class ChatResponse(StandardResponse):
    agent_outputs: List[AgentOutput]

class SliceResponse(StandardResponse):
    slices: List[Dict[str, Any]]

class MediaResponse(StandardResponse):
    image_url: str

class VerifyResponse(StandardResponse):
    is_valid: bool
    errors: List[str]
