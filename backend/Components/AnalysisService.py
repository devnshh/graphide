import sys
import os
import json
import requests
from typing import Dict, Any, List

# Adjust path if needed
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from .config import settings
    from .JoernManager import JoernManager, JoernException
except ImportError:
    from config import settings
    from Components.JoernManager import JoernManager, JoernException

class AnalysisService:
    """
    Service to orchestrate the vulnerability analysis workflow using Model Q and Model D.
    """
    
    def __init__(self, joern_url: str = None, llm_config: Dict = None):
        """
        Args:
            joern_url: URL of the Joern server (defaults to config)
            llm_config: Deprecated/Unused, kept for signature compatibility
        """
        if not joern_url:
            joern_url = f"localhost:{settings.JOERN_PORT}"
            
        self.joern = JoernManager(endpoint=joern_url)
        
        # Ensure URLs point to the chat completions endpoint
        self.q_url = self._ensure_endpoint(settings.MODEL_Q_URL)
        self.d_url = self._ensure_endpoint(settings.MODEL_D_URL)

    def _ensure_endpoint(self, url: str) -> str:
        if not url.endswith("/v1/chat/completions"):
            if url.endswith("/"):
                return f"{url}v1/chat/completions"
            return f"{url}/v1/chat/completions"
        return url

    async def analyze_code(self, file_name: str, code_content: str) -> Dict[str, Any]:
        """
        Main entry point for analyzing a code file.
        """
        project_name = f"verify_{os.path.basename(file_name).replace('.', '_')}"
        logs = ["Analysis Started."]
        
        # 1. Save temp file for Joern to read 
        # MUST Write to HOST path, but tell Joern to read from CONTAINER path
        host_dir = settings.JOERN_HOST_PATH
        container_dir = settings.JOERN_CONTAINER_PATH
        
        os.makedirs(host_dir, exist_ok=True)
        # Ensure we don't have permission issues if docker user is different
        try:
             os.chmod(host_dir, 0o777)
        except:
             pass

        host_file_path = os.path.join(host_dir, os.path.basename(file_name))
        with open(host_file_path, "w") as f:
            f.write(code_content)
            
        try:
            # --- Step 1: Load to Joern ---
            # Tell Joern to load from the container path
            container_file_path = os.path.join(container_dir, os.path.basename(file_name))
            print(f"[Analysis] Loading {file_name} into Joern...")
            logs.append(f"Step 1/4: Loading code into Joern environment...")
            
            # We import the DIRECTORY in container
            # Call async
            await self.joern.load_project(container_dir, project_name)
            logs.append("Step 1 Complete: Project loaded in Joern.")
            
            # --- Step 2: Generate Queries (Model Q) ---
            print("[Analysis] Generating verification queries from Model Q...")
            logs.append("Step 2/4: Asking Model Q to generate vulnerability-specific CPG queries...")
            queries = self._generate_queries(code_content)
            print(f"DEBUG: Generated Queries: {queries}")
            
            if not queries:
                logs.append("Step 2 Failed: Model Q did not return valid queries.")
                return {
                    "status": "error",
                    "message": "Failed to generate valid queries from Model Q.",
                    "logs": logs
                }
            logs.append(f"Step 2 Complete: Generated {len(queries)} queries.")
            
            # --- Step 3: Verify & Slice (Joern Execution) ---
            print(f"[Analysis] Executing {len(queries)} queries...")
            logs.append(f"Step 3/4: Executing {len(queries)} CPG queries in Joern to verify logic...")
            
            # Format queries for log display
            formatted_queries = "\n".join([f"- Query {i+1}: `{q}`" for i, q in enumerate(queries)])
            logs.append(f"### Generated Queries\n{formatted_queries}")

            # Call async
            success, slices = await self.joern.extract_joern_paths(code_content, queries)
            
            if not success:
                logs.append("Step 3 Failed: Joern execution encountered errors.")
                return {
                    "status": "error",
                    "message": "Joern execution failed.",
                    "logs": logs
                }

            if not slices:
                print("[Analysis] No vulnerability paths verified.")
                logs.append("Step 3 Complete: No vulnerability paths found by Joern.")
                logs.append("### Joern Output\nNo valid paths returned by reachability flows.")
                return {
                    "status": "clean",
                    "message": "No vulnerabilities verified by formal analysis.",
                    "details": "Model Q generated queries, but verification found no execution paths.",
                    "logs": logs
                }
            
            logs.append(f"Step 3 Complete: Verified {len(slices)} suspicious execution path(s).")
            
            # Format slices for log display
            slice_logs = []
            for i, sl in enumerate(slices):
                slice_logs.append(f"\n**Slice {i+1}**:")
                for step in sl:
                    slice_logs.append(f"  - L{step.get('line_number')}: `{step.get('code').strip()}`")
            
            logs.append(f"### Verified Slices (Joern Output)\n" + "\n".join(slice_logs))
                
            # --- Step 4: Explain & Patch (Model D) ---
            print(f"[Analysis] Vulnerability Verified! Found {len(slices)} execution paths. Asking Model D...")
            logs.append("Step 4/4: Sending verified slices to Model D for explanation and patching...")
            explanation = self._explain_and_patch(slices)
            logs.append("Step 4 Complete: Explanation received.")
            
            return {
                "status": "vulnerable",
                "slices": slices,
                "explanation": explanation,
                "logs": logs
            }
            
        except JoernException as je:
            logs.append(f"Error: Joern Exception occurred: {je}")
            return {"status": "error", "message": f"Joern Error: {je}", "logs": logs}
        except Exception as e:
            import traceback
            traceback.print_exc()
            logs.append(f"Error: Unexpected exception: {e}")
            return {"status": "error", "message": f"Unexpected Error: {e}", "logs": logs}
        finally:
            try:
                # Call async
                await self.joern.reset_session(project_name)
            except:
                pass

    def _call_model_api(self, url: str, prompt: str) -> str:
        """
        Helper to call the external Model APIs.
        Assumes the API accepts a JSON with 'prompt' or 'query'.
        """
        try:
            # Try a standard payload structure
            payload = {
                "prompt": prompt,
                "query": prompt, # redundancy for safety
                "messages": [{"role": "user", "content": prompt}] # Chat completion style
            }
            
            # Note: The provided URLs are for specific models, they might be proxying a chat endpoint
            # or expecting a specific schema. We send multiple fields to hit one that works.
            
            # Litng/VLLM often expects standard OpenAI format:
            # {"messages": [...], "model": "something"}
            # We add a default model field just in case it is required.
            payload["model"] = "default"

            response = requests.post(url, json=payload, timeout=60, verify=False)
            response.raise_for_status()
            
            data = response.json()
            
            # Try to extract text from common response formats
            if "response" in data:
                return data["response"]
            if "output" in data:
                return data["output"]
            if "choices" in data and len(data["choices"]) > 0:
                return data["choices"][0].get("message", {}).get("content", "")
            if "data" in data and "answer" in data["data"]: # AgentClient style
                return data["data"]["answer"]
            
            # If plain text response
            return str(data)
            
        except requests.exceptions.Timeout:
            return f"Error: Request to Model API timed out ({url})."
        except requests.exceptions.ConnectionError:
            return f"Error: Could not connect to Model API ({url}). Check if the server is running."
        except requests.exceptions.HTTPError as he:
            return f"Error: Model API returned {he.response.status_code}: {he.response.text}"
        except Exception as e:
            print(f"Error calling Model API ({url}): {e}")
            return f"Error: Unexpected failure calling Model API: {str(e)}"

    def _generate_queries(self, code: str) -> List[str]:
        """
        Ask Model Q to look for vulnerabilities and output Joern Queries.
        """
        prompt_content = f"""Your task is to design Precise Joern CPGQL Queries for Vulnerability Analysis.
Objective:
Develop targeted CPGQL Joern queries to:
1. Identify taint flows
2. Capture potential vulnerability paths
3. Exclude paths with sanitizers

Constraints:
- Executable Joern CPGQL
- Last query uses reachableByFlows

Output Requirements:
JSON with one field "queries"

Input Code:
{code}"""
        
        response_text = self._call_model_api(self.q_url, prompt_content)
        return self._extract_queries_from_text(response_text)

    def _explain_and_patch(self, slices: List[List[Dict]]) -> Dict:
        """
        Ask Model D to explain the verified slices and suggest a patch.
        """
        slice_text = json.dumps(slices, indent=2)
        
        prompt = f"""
I have mathematically verified a vulnerability in the code provided.
Here are the exact execution traces (Slices) that cause the issue:

{slice_text}

Task:
1. Explain WHY this flow is a vulnerability.
2. Provide a fixed version of the code (PATCH).
3. Explain why the patch fixes the path.

Output format: JSON with keys "explanation", "patch_code", "fix_reasoning".
"""
        response_text = self._call_model_api(self.d_url, prompt)
        
        # Parse JSON from response
        try:
            # Try finding JSON block
            import re
            match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            return json.loads(response_text)
        except:
            return {"explanation": response_text, "patch_code": "", "fix_reasoning": ""}
            
    def _extract_queries_from_text(self, text: str) -> List[str]:
        """
        Helper to extract queries from text (migrated from model.py)
        """
        try:
            # Try to find JSON code block
            start = text.rfind("```json")
            end = text.rfind("}```")
            
            clean_text = text
            if start != -1 and end != -1:
                clean_text = text[start+7:end+1]
            elif "{" in text and "}" in text:
                 # Try to find outermost braces
                 clean_text = text[text.find("{"):text.rfind("}")+1]

            data = json.loads(clean_text)
            return data.get("queries", [])
        except:
            return []
