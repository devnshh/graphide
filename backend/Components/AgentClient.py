import requests
import logging
import json
from typing import Dict, Any, Optional, List
from .Models import AgentOutput
try:
    from ..config import settings
except ImportError:
    from config import settings

logger = logging.getLogger("graphide.agent_client")

class AgentClient:
    """
    Client for interacting with the OnDemand Chat API.
    Handles communication with various agents (Q, D, NanoBanana, etc.).
    """

    def __init__(self):
        self.api_key = settings.ONDEMAND_API_KEY
        self.base_url = settings.ONDEMAND_API_URL
        self.start_session_endpoint = f"{self.base_url}"

    def _create_payload(self, query: str, context: Optional[Dict] = None) -> Dict:
        """Create the exact payload structure required by OnDemand API."""
        # Note: The main.py stub used a specific payload structure.
        # We will replicate that structure but make it dynamic.
        
        payload = {
            "query": query,
            "endpointId": settings.DEFAULT_ENDPOINT_ID, # Can be dynamic based on agent type
            "responseMode": "sync",
            "reasoningMode": "low", # High reasoning for Q/D models if needed
            "agentIds": [], # Can be populated if using specific agent IDs
            "onlyFulfillment": "false",
            "modelConfigs": {
                "fulfillmentPrompt": "string", # This seems to be a required field in the stub
                "stopSequences": [],
                "temperature": 0.7,
                "topP": 1,
                "presencePenalty": 0,
                "frequencyPenalty": 0
            }
        }
        
        # Add context if provided (OnDemand might use specific fields for context)
        # For now, we embed important context in the query or use additional fields if the API supports it.
        # The stub didn't show explicit context fields other than 'query'.
        
        return payload

    def query_agent(self, query: str, agent_type: str, context: Optional[Dict] = None) -> AgentOutput:
        """
        Send a query to the specified agent type.
        
        Args:
            query: The prompt/query string.
            agent_type: "Q", "D", "NanoBanana", "Report", "General"
            context: Additional context data.
            
        Returns:
            AgentOutput object.
        """
        
        # In a real implementation, we might select different endpointIds or agentIds based on agent_type.
        # For the hackathon/stub, we use the default endpoint but suffix the query to guide the model.
        
        system_prompt = ""
        if agent_type == "Q":
            system_prompt = "You are Model Q, a Code Property Graph (CPG) Query Generator. Your task is to generate strict Joern CPGQL queries based on the user's vulnerability analysis request."
        elif agent_type == "D":
            system_prompt = "You are Model D, a Vulnerability Detector and Patch Generator. Verify the vulnerability in the provided code slice and generate a secure patch."
        elif agent_type == "NanoBanana":
            system_prompt = "You are the NanoBanana Agent. Generate a flowchart description or explanation of the data flow vulnerability."
        elif agent_type == "Report":
            system_prompt = "You are the Report Agent. Summarize the findings into a comprehensive vulnerability report."
        elif agent_type == "Knowledge":
             system_prompt = "You are the Knowledge Agent. Enrich the findings with CVE/CWE details."
            
        full_query = f"{system_prompt}\n\nTask:\n{query}"
        
        # If there's context like code slices, append them
        if context and "code" in context:
            full_query += f"\n\nContext Code:\n{context['code']}"
            
        payload = self._create_payload(full_query, context)
        
        # We need a session ID. The stub used a hardcoded one.
        # Ideally we create a new session or reuse one.
        # For this implementation, we will use a session ID from config or hardcoded for now as per stub.
        # Stub URL: https://api.on-demand.io/chat/v1/sessions/6969c536539e622c16edbea4/query
        
        # Let's try to create a session first (best practice), if not possible, fallback to stub ID.
        # Since I cannot actually hit the API to create a session in this env, I will rely on the stub ID 
        # but put it in a variable so it's clean.
        session_id = "6969c536539e622c16edbea4" 
        url = f"{self.base_url}/{session_id}/query"
        
        headers = {
            "apikey": self.api_key,
            "Content-Type": "application/json"
        }
        
        logger.info(f"Querying Agent {agent_type} at {url}")
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)
            response.raise_for_status()
            data = response.json()
            
            # Parse response
            # Stub response format: {"data": {"answer": "..."}}
            answer = data.get("data", {}).get("answer", "")
            
            return AgentOutput(
                agentName=agent_type,
                markdownOutput=answer,
                metadata={"raw_response": data}
            )
            
        except Exception as e:
            logger.error(f"Error calling OnDemand API: {e}")
            # For HACKATHON/DEV verification only: Return a mock response if API fails (since I can't hit it)
            return AgentOutput(
                agentName=agent_type,
                markdownOutput=f"**Error calling Agent**: {str(e)}\n\n*Simulated Response for {agent_type}*:\nProcessed request for {agent_type}.",
                metadata={"error": str(e), "mock": True}
            )

agent_client = AgentClient()
