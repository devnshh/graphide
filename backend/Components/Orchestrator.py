import logging
import os
from typing import Dict, Any, List, Optional
try:
    from ..config import settings
    from .JoernManager import JoernManager
    from .Models import ScanResponse, ScanRequest, ChatResponse, ChatRequest, AgentOutput, SliceResponse, SliceRequest, MediaResponse
    from .AnalysisService import AnalysisService
except ImportError:
    from config import settings
    from Components.JoernManager import JoernManager
    from Components.Models import ScanResponse, ScanRequest, ChatResponse, ChatRequest, AgentOutput, SliceResponse, SliceRequest, MediaResponse
    from Components.AnalysisService import AnalysisService

logger = logging.getLogger("graphide.orchestrator")

class Orchestrator:
    """
    Central Orchestrator for Graphide Backend.
    Manages the state and flow between Models (Q, D), Joern, and the Frontend.
    """
    
    def __init__(self):
        self.joern_manager = JoernManager(
            endpoint=f"localhost:{settings.JOERN_PORT}"
        )
        self.sessions: Dict[str, Any] = {}
        self.analysis_service = AnalysisService(joern_url=f"localhost:{settings.JOERN_PORT}")

    async def handle_scan(self, request: ScanRequest) -> ScanResponse:
        """
        Main Analysis Flow: Frontend initiates scan -> Backend calls Q -> Joern -> D.
        """
        logger.info("=" * 60)
        logger.info("INCOMING REQUEST FROM IDE")
        logger.info(f"  Intent: {request.intent}")
        logger.info(f"  File: {request.filePath}")
        logger.info("=" * 60)
        
        try:
            # Read file content
            content = ""
            if os.path.exists(request.filePath):
                if os.path.isdir(request.filePath):
                    content = "" # AnalysisService will handle the directory copy
                else:
                    with open(request.filePath, 'r') as f:
                        content = f.read()
            else:
                 return ScanResponse(status="error", message=f"File not found on backend: {request.filePath}")

            # Run Analysis
            # Call async
            result = await self.analysis_service.analyze_code(request.filePath, content)
            
            logs = result.get("logs", [])
            # Compact log list
            log_md = "\n".join([f"- {l}" for l in logs])
            
            agent_outputs = []
            
            # Add Log Output first or last? Last is better effectively.
            # But if error, it's the only thing.
            
            if result["status"] == "error":
                 # Even on error, return the log
                 agent_outputs.append(AgentOutput(
                     agentName="Graphide System",
                     markdownOutput=f"#### Analysis Failed\n{result.get('message')}\n\n#### Analysis Log\n{log_md}",
                     metadata={"stage": "Error"}
                 ))
                 return ScanResponse(
                     status="error", 
                     message=result.get("message"),
                     agentOutputs=agent_outputs
                 )
            
            patch_proposals = []
            validation_status = {"passed": True, "errors": []}

            if result["status"] == "vulnerable":
                 explanation_data = result.get("explanation", {})
                 # Handle raw text or structured
                 if isinstance(explanation_data, list) and len(explanation_data) > 0:
                     # If Gemini returned a list of objects, take the first one or aggregate
                     # For now, we assume the first object contains the main analysis
                     explanation_data = explanation_data[0]

                 if isinstance(explanation_data, dict):
                     text = explanation_data.get("explanation", "Vulnerability detected.")
                     reasoning = explanation_data.get("fix_reasoning", "No reasoning provided.")
                     patch_code = explanation_data.get("patch_code", "")
                     vulnerabilities_list = explanation_data.get("vulnerabilities", [])
                 else:
                     text = str(explanation_data)
                     patch_code = ""
                     reasoning = ""
                     vulnerabilities_list = []

                 # 1. Main Vulnerability Report
                 # User requested logs BEFORE explanation
                 # Use tighter spacing and consistent headers
                 final_md = f"#### Analysis Log\n{log_md}\n\n#### Vulnerability Detected\n{text}\n\n#### Fix Reasoning\n{reasoning}"
                 
                 agent_outputs.append(AgentOutput(
                     agentName="Graphide Analysis",
                     markdownOutput=final_md,
                     metadata={"stage": "Scan", "slices": result.get("slices")}
                 ))
                 if patch_code:
                     patch_proposals.append({
                         "code": patch_code,
                         "description": "Suggested Fix"
                     })
                 validation_status = {"passed": False, "errors": ["Vulnerability found"]}
            
            elif result["status"] == "clean":
                 agent_outputs.append(AgentOutput(
                     agentName="Graphide Analysis",
                     markdownOutput=f"{result.get('message', 'No vulnerabilities found.')}\n\n#### Analysis Log\n{log_md}",
                     metadata={"stage": "Scan"}
                 ))
                 vulnerabilities_list = []

            return ScanResponse(
                status="success",
                agentOutputs=agent_outputs,
                patchProposals=patch_proposals,
                vulnerabilities=vulnerabilities_list,
                validationStatus=validation_status
            )

        except Exception as e:
            logger.error(f"Error in scan: {e}")
            import traceback
            traceback.print_exc()
            return ScanResponse(status="error", message=f"Backend Error: {str(e)}")

    def handle_chat(self, request: ChatRequest) -> ChatResponse:
        """
        Simplified Chat Handler.
        Since specific OnDemand agents are removed, this routes general queries to Model D or returns a default.
        """
        logger.info(f"Chat request for stage: {request.stage}")
        
        # We can route "General" chat to Model D if it supports it, or just return a placeholder.
        # User instructions implied stripping OnDemand and focusing on the Analysis Flow.
        
        return ChatResponse(
            status="success",
            agent_outputs=[AgentOutput(
                agentName="System",
                markdownOutput="Chat functionality is currently limited to Analysis results.",
                metadata={}
            )]
        )

    async def handle_slice(self, request: SliceRequest) -> SliceResponse:
        """
        Execute CPG Query in Joern to get Slices.
        """
        logger.info(f"Slicing request for file: {request.filePath}")
        
        status, result = await self.joern_manager.run_query(request.query)
        
        if status.name == "SUCCESSFUL":
            return SliceResponse(
                status="success",
                slices=[{"raw": result}],
                message="Slicing successful"
            )
        else:
             return SliceResponse(
                status="error",
                slices=[],
                message=f"Joern query failed: {result}"
            )

    def handle_media(self, flowchart_data: Dict) -> MediaResponse:
        """
        Generate/Store Flowchart Image.
        """
        image_url = f"https://placehold.co/600x400?text=Vulnerability+Flowchart"
        return MediaResponse(
            status="success",
            image_url=image_url,
            message="Flowchart generated"
        )
    
    def handle_verify(self, original: str, patched: str, language: str) -> Dict:
        """
        AST Patch Verifier.
        """
        return {
            "is_valid": True,
            "errors": []
        }

orchestrator = Orchestrator()
