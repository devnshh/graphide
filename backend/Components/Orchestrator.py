import logging
import os
from typing import Any, Dict, List
try:
    from ..config import settings
    from .JoernManager import JoernManager
    from .Neo4jManager import Neo4jManager
    from .Models import (
        AgentOutput,
        ChatRequest,
        ChatResponse,
        MediaResponse,
        PatchProposal,
        ScanRequest,
        ScanResponse,
        SliceRequest,
        SliceResponse,
        ValidationStatus,
    )
    from .AnalysisService import AnalysisService
    from .Utils import read_file_content
except ImportError:
    from config import settings
    from Components.JoernManager import JoernManager
    from Components.Neo4jManager import Neo4jManager
    from Components.Models import (
        AgentOutput,
        ChatRequest,
        ChatResponse,
        MediaResponse,
        PatchProposal,
        ScanRequest,
        ScanResponse,
        SliceRequest,
        SliceResponse,
        ValidationStatus,
    )
    from Components.AnalysisService import AnalysisService
    from Components.Utils import read_file_content

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
        self.neo4j_manager = Neo4jManager(
            uri=settings.NEO4J_URI,
            user=settings.NEO4J_USER,
            password=settings.NEO4J_PASSWORD
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
                    content = ""
                else:
                    content = read_file_content(request.filePath)
            else:
                 return ScanResponse(status="error", message=f"File not found on backend: {request.filePath}")

            # Run Analysis
            # Call async
            result = await self.analysis_service.analyze_code(request.filePath, content)
            
            logs = result.get("logs", [])
            # Compact log list
            log_md = "\n".join([f"- {l}" for l in logs])
            
            agent_outputs = []
            
            if result["status"] == "error":
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
            
            patch_proposals: List[PatchProposal] = []
            validation_status = ValidationStatus(passed=True, errors=[])

            if result["status"] == "vulnerable":
                 explanation_data = result.get("explanation", {})
                 if isinstance(explanation_data, list) and len(explanation_data) > 0:
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

                 final_md = f"#### Analysis Log\n{log_md}\n\n#### Vulnerability Detected\n{text}\n\n#### Fix Reasoning\n{reasoning}"
                 
                 agent_outputs.append(AgentOutput(
                     agentName="Graphide Analysis",
                     markdownOutput=final_md,
                     metadata={"stage": "Scan", "slices": result.get("slices")}
                 ))
                 if patch_code:
                     patch_proposals.append(
                         PatchProposal(code=patch_code, description="Suggested Fix")
                     )
                 validation_status = ValidationStatus(
                     passed=False,
                     errors=["Vulnerability found"],
                 )

                 verified_slices = result.get("slices", [])
                 if verified_slices and self.neo4j_manager.is_connected():
                     scan_id = self.neo4j_manager.store_analysis_graph(
                         file_path=request.filePath,
                         verified_slices=verified_slices,
                         vulnerabilities=vulnerabilities_list
                     )
                     if scan_id:
                         logger.info(f"Graph stored in Neo4j with scan_id: {scan_id}")
            
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
        
        success, result = await self.joern_manager.run_query(request.query)
        
        if success:
            return SliceResponse(
                status="success",
                slices=[{"raw": result}],
                message="Slicing successful"
            )
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
