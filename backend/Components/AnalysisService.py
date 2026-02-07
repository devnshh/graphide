import sys
import os
import json
import requests
from typing import Dict, Any, List
try:
    from google import genai
    from google.genai import types
except ImportError:
    print("Warning: google.genai not found. Please install google-genai.")
    genai = None


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
        
        # Initialize Gemini
        self.gemini_client = None
        if hasattr(settings, "GEMINI_API_KEY") and settings.GEMINI_API_KEY and genai:
            self.gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
            
        # Load System Prompt
        self.system_prompt_text = "You are a vulnerability analysis expert."
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            prompt_path = os.path.join(base_dir, "system_prompt.txt")
            if os.path.exists(prompt_path):
                with open(prompt_path, "r") as f:
                    self.system_prompt_text = f.read()
        except Exception as e:
            print(f"Error loading system prompt: {e}")


    def _ensure_endpoint(self, url: str) -> str:
        # If no URL provided, return empty
        if not url:
            return ""
            
        # If the user explicitly provided a full path (heuristic), trust it
        if "chat/completions" in url or "generate" in url:
            return url
            
        # Default behavior: Assume base URL and append OpenAI-style endpoint
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
            
            # --- Retry Loop for Query Generation & Verification ---
            # We assume "flakiness" comes from bad queries. We will retry Step 2 & 3.
            max_retries = 3
            slices = []
            queries = []
            
            for attempt in range(1, max_retries + 1):
                logs.append(f"--- Attempt {attempt}/{max_retries} ---")
                
                # --- Step 2: Generate Queries (Model Q) ---
                print(f"[Analysis] Generating verification queries from Model Q (Attempt {attempt})...")
                logs.append("Step 2/4: Asking Model Q to generate vulnerability-specific CPG queries...")
                
                # If this is a retry, we could pass context (TODO: capture specific Joern error if possible)
                prev_error = "Execution Failed" if attempt > 1 else None
                queries = self._generate_queries(code_content, previous_error=prev_error)
                
                print(f"DEBUG: Generated Queries: {queries}")
                
                if not queries:
                    logs.append(f"Step 2 Failed: Model Q did not return valid queries (Attempt {attempt}).")
                    if attempt == max_retries:
                        return {
                            "status": "error",
                            "message": "Failed to generate valid queries from Model Q after multiple attempts.",
                            "logs": logs
                        }
                    continue # Try again
                
                logs.append(f"Step 2 Complete: Generated {len(queries)} queries.")
                
                # --- Step 3: Verify & Slice (Joern Execution) ---
                print(f"[Analysis] Executing {len(queries)} queries...")
                logs.append(f"Step 3/4: Executing {len(queries)} CPG queries in Joern to verify logic...")
                
                # Format queries for log display
                formatted_queries = "\n".join([f"- Query {i+1}: `{q}`" for i, q in enumerate(queries)])
                logs.append(f"### Generated Queries (Attempt {attempt})\n{formatted_queries}")

                # Call async
                success, slices = await self.joern.extract_joern_paths(code_content, queries)
                
                if success:
                    # Success! Break the retry loop
                    break
                else:
                    logs.append(f"Step 3 Failed: Joern execution encountered errors (Attempt {attempt}).Retrying...")
                    if attempt == max_retries:
                         return {
                            "status": "error",
                            "message": "Joern execution failed after multiple attempts.",
                            "logs": logs
                        }
            
            # If we exited the loop successfully with valid slices or explicitly 'success' but empty slices


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
        print(f"DEBUG: Calling Model API at {url}")
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
            # payload["model"] = "default" # Model D rejects "default"


            # print(f"DEBUG: Payload: {json.dumps(payload)}") 
            response = requests.post(url, json=payload, timeout=60, verify=False)
            print(f"DEBUG: Response Status: {response.status_code}")
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
            print(f"ERROR: Model API Timed out: {url}")
            return f"Error: Request to Model API timed out ({url})."
        except requests.exceptions.ConnectionError:
            print(f"ERROR: Model API Connection Refused: {url}")
            return f"Error: Could not connect to Model API ({url}). Check if the server is running."
        except requests.exceptions.HTTPError as he:
            print(f"ERROR: Model API HTTP Error: {he.response.status_code} - {he.response.text}")
            return f"Error: Model API returned {he.response.status_code}: {he.response.text}"
        except Exception as e:
            print(f"Error calling Model API ({url}): {e}")
            return f"Error: Unexpected failure calling Model API: {str(e)}"

    def _generate_queries(self, code: str, previous_error: str = None) -> List[str]:
        """
        Ask Model Q to look for vulnerabilities and output Joern Queries.
        """
        
        # Enhanced constraints to reduce syntax errors
        context_instruction = ""
        if previous_error:
            context_instruction = f"\nIMPORTANT: Your previous attempt failed with execution errors. Please rewrite the queries to be syntactically correct standard CPGQL. avoid using abbreviated forms like 'call.name', use 'cpg.call.name'.\n"

        prompt_content = f"""Your task is to design Precise Joern CPGQL Queries for Vulnerability Analysis.
Objective:
Develop targeted CPGQL Joern queries to:
1. Identify taint flows
2. Capture potential vulnerability paths
3. Exclude paths with sanitizers

Constraints & Syntax Rules:
- MUST use standard CPGQL syntax starting with `cpg.` (e.g., `cpg.call`, `cpg.method`).
- Define intermediate steps using `def` (e.g., `def source = ...`).
- final query MUST use `.reachableByFlows(...)`.
- Output MUST be a valid JSON object with a "queries" key containing a list of strings.

{context_instruction}

Input Code:
{code}

Output Requirements:
JSON with one field "queries"
"""
        
        response_text = self._call_model_api(self.q_url, prompt_content)
        print(f"DEBUG: Model Q Raw Response: {response_text}")
        return self._extract_queries_from_text(response_text)

    def _explain_and_patch(self, slices: List[List[Dict]]) -> Any:
        """
        Ask Gemini (or Model D fallback) to explain the verified slices and suggest a patch.
        Uses system_prompt.txt for instructions.
        """
        slice_text = json.dumps(slices, indent=2)
        
        # If Gemini is configured, use it
        if self.gemini_client:
            try:
                prompt_content = f"""
Here are the exact execution traces (Slices) that cause the issue:

{slice_text}

Analyze the slices based on the system instructions and provide the explanation, patch, and reasoning.
"""
                response = self.gemini_client.models.generate_content(
                    model="gemini-3-flash-preview", 
                    contents=prompt_content,
                    config=types.GenerateContentConfig(
                        system_instruction=self.system_prompt_text
                        # Removed response_mime_type="application/json" to allow Markdown output
                    )
                )
                
                response_text = response.text
                print(f"[Analysis] Gemini Response received: {len(response_text)} chars")
                
                # Return the raw text (Markdown) directly for better UI rendering
                return response_text
                    
            except Exception as e:
                print(f"[Analysis] Gemini Error: {e}. Falling back to Model D.")
                # Fallback to Model D logic below
        
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
        Handles standard JSON and Python-dict style (single quotes) responses.
        """
        try:
            # 1. Try to find content within ```json ... ``` or just ``` ... ```
            import re
            match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
            if match:
                clean_text = match.group(1)
            else:
                # 2. Try to find outermost braces if no code block
                start = text.find("{")
                end = text.rfind("}")
                if start != -1 and end != -1:
                    clean_text = text[start:end+1]
                else:
                    clean_text = text

            # 3. Handle Single Quotes (Invalid JSON but common LLM output)
            # If we see 'queries': ['...', '...'], replace single quotes with double quotes
            # ONLY if it looks like there are no double quotes wrapping the content
            if "'" in clean_text and '"' not in clean_text:
                 clean_text = clean_text.replace("'", '"')
            
            # 4. Try parsing as JSON first
            try:
                data = json.loads(clean_text)
                return data.get("queries", [])
            except json.JSONDecodeError:
                # 5. Fallback: Try ast.literal_eval for Python-style dicts
                import ast
                try:
                    # Fix: If LLM outputs {"queries": ['...']} (mixed quotes), ast.literal_eval handles it fine as a dict
                    data = ast.literal_eval(clean_text)
                    if isinstance(data, dict):
                        return data.get("queries", [])
                except:
                    pass
                
                # 6. Fallback: Heuristic replacement for mixed quotes cases
                # e.g. "queries": ['val1', 'val2']
                # We try to replace single quotes with double quotes specifically inside the list
                try:
                    # Very rough heuristic: replace ' with " if it looks like a list item
                    normalized = clean_text.replace("'", '"')
                    data = json.loads(normalized)
                    return data.get("queries", [])
                except:
                    pass

                # 7. Fallback: Regex extraction as last resort
                queries = re.findall(r"['\"](.*?)['\"]", clean_text)
                # Filter out keys like 'queries'
                return [q for q in queries if q != "queries"]

        except Exception as e:
            print(f"DEBUG: Error extracting queries: {e}")
            return []

