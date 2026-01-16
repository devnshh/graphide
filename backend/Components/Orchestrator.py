import logging
import uuid
import os
from typing import Dict, Any, List, Optional
try:
    from ..config import settings
    from .JoernManager import JoernManager
    from .AgentClient import agent_client
    from .Models import ScanResponse, ScanRequest, ChatResponse, ChatRequest, AgentOutput, SliceResponse, SliceRequest, MediaResponse
except ImportError:
    from config import settings
    from Components.JoernManager import JoernManager
    from Components.AgentClient import agent_client
    from Components.Models import ScanResponse, ScanRequest, ChatResponse, ChatRequest, AgentOutput, SliceResponse, SliceRequest, MediaResponse

logger = logging.getLogger("graphide.orchestrator")

class Orchestrator:
    """
    Central Orchestrator for Graphide Backend.
    Manages the state and flow between Agents, Joern, and the Frontend.
    """
    
    def __init__(self):
        self.joern_manager = JoernManager(
            port=settings.JOERN_PORT,
            compose_file=settings.JOERN_COMPOSE_FILE
        )
        # In-memory store for sessions/state (Simple dict for hackathon)
        self.sessions: Dict[str, Any] = {}

    # def handle_scan(self, request: ScanRequest) -> ScanResponse:
    def handle_scan(self, request):
        """
        Phase 1 Step 1: Frontend initiates scan.
        Triggers fetching of files (handled by frontend usually, but here we just ack).
        Ideally, this might trigger the 'Load Project' in Joern if the files are local.
        """
        scan_id = str(uuid.uuid4())
        logger.info("=" * 60)
        logger.info("INCOMING REQUEST FROM IDE")
        logger.info(f"  Intent: {request.intent}")
        logger.info(f"  File: {request.filePath}")
        logger.info(f"  Language: {request.language}")
        if request.codeRange:
            logger.info(f"  Range: L{request.codeRange.startLine}-L{request.codeRange.endLine}")
        if request.userQuery:
            logger.info(f"  Query: {request.userQuery}")
        logger.info("=" * 60)
        
        # Logic:
        # 1. Provide acknowledgement.
        # 2. (Optional) Trigger background Joern import if paths are local server paths.
        # 3. For the workflow, the next step is usually the Frontend calling /chat with code.
        
        resp=requests.post("/chat", json={"query": "hi"})

        return ScanResponse(
            status="success",
            message="Scan initiated. ready for analysis.",
            data={"files_count": len(request.files)},
            scan_id=scan_id
        )

    def handle_chat(self, request: ChatRequest) -> ChatResponse:
        """
        Phase 1-4: Generic Chat Entry point.
        Routes to specific agents based on 'stage' or intent.
        """
        logger.info(f"Chat request for stage: {request.stage}")
        
        agent_outputs = []
        
        if request.stage == "Q":
            # Phase 1: Code -> Model Q -> CPG Query
            output = agent_client.query_agent(request.query, "Q", context={"files": request.files})

            agent_outputs.append(output)
            
        elif request.stage == "D":
            # Phase 2: Sliced Code -> Model D -> Patch
            # Also triggers Knowledge Agent
            output_d = agent_client.query_agent(request.query, "D", context={"files": request.files})
            agent_outputs.append(output_d)
            
            output_k = agent_client.query_agent(request.query, "Knowledge", context={"files": request.files})
            agent_outputs.append(output_k)
            
        elif request.stage == "Report":
            # Phase 4: Generate Report
            output = agent_client.query_agent(request.query, "Report", context={"files": request.files})
            agent_outputs.append(output)
            
        elif request.stage == "General":
             output = agent_client.query_agent(request.query, "General")
             agent_outputs.append(output)
             
        elif request.stage == "NanoBanana":
             # Phase 3: Flowchart
             output = agent_client.query_agent(request.query, "NanoBanana", context={"files": request.files})
             agent_outputs.append(output)

        else:
            # Default fallback
            output = agent_client.query_agent(request.query, "General")
            agent_outputs.append(output)
            
        return ChatResponse(
            status="success",
            agent_outputs=agent_outputs
        )

    def handle_slice(self, request: SliceRequest) -> SliceResponse:
        """
        Phase 1 Step 5: Execute CPG Query in Joern to get Slices.
        """
        logger.info(f"Slicing request for file: {request.filePath}")
        
        # 1. Run Query via JoernManager
        # Note: In a real scenario, we might need to ensureproject is loaded.
        # For simplicity, we assume project is loaded or we load it here.
        # We'll just run the query provided by Model Q.
        
        status, result = self.joern_manager.run_query(request.query)
        
        if status.name == "SUCCESSFUL":
            # The result from JoernManager is a string, we might need to parse it if it's JSON.
            # Assuming Model Q generates a query that returns JSON or we parse the string.
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
        Phase 3: Generate/Store Flowchart Image.
        """
        # In a real implementation, this would call a Media Generation API or render the flowchart.
        # For this hackathon, we Returns a placeholder or mock URL.
        
        # Ref workflow: "generated flowchart image is stored on the backend... sent to Media API... displayed to frontend"
        
        image_url = f"https://placehold.co/600x400?text=Vulnerability+Flowchart"
        return MediaResponse(
            status="success",
            image_url=image_url,
            message="Flowchart generated"
        )
    
    def handle_verify(self, original: str, patched: str, language: str) -> Dict:
        """
        Phase 3: AST Patch Verifier.
        """
        # Logic to call an external AST Verifier tool (or Agent).
        # We will simulate this or call an agent if defined.
        # Workflow says "AST Patch Verifier tool on OnDemand".
        
        # We can implement a simple check or call the agent client.
        # Let's call a specific "Verifier" agent or mock it as it's a "Custom Tool".
        
        # Mocking for reliability in this env:
        return {
            "is_valid": True,
            "errors": []
        }

orchestrator = Orchestrator()
