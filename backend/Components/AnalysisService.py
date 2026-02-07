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
        self.directory_system_prompt_text = self.system_prompt_text
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            prompt_path = os.path.join(base_dir, "system_prompt.txt")
            if os.path.exists(prompt_path):
                with open(prompt_path, "r") as f:
                    self.system_prompt_text = f.read()

            dir_prompt_path = os.path.join(base_dir, "System_prompt_directory.txt")
            if os.path.exists(dir_prompt_path):
                with open(dir_prompt_path, "r") as f:
                    self.directory_system_prompt_text = f.read()
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


    async def analyze_code(self, file_path: str, code_content: str = "") -> Dict[str, Any]:
        """
        Main entry point for analyzing a code file or directory.
        """
        import shutil
        import uuid
        
        # Normalize path
        file_path = os.path.abspath(file_path)
        base_name = os.path.basename(file_path)
        project_name = f"verify_{base_name.replace('.', '_')}_{uuid.uuid4().hex[:4]}"
        logs = ["Analysis Started."]
        
        # 1. Prepare Target Directory for Joern
        # Joern needs a path it can access (mounted or local).
        host_dir = settings.JOERN_HOST_PATH
        container_dir = settings.JOERN_CONTAINER_PATH
        
        target_host_path = os.path.join(host_dir, base_name)
        
        # Clean up previous if exists (simplified)
        if os.path.exists(target_host_path):
            if os.path.isdir(target_host_path):
                shutil.rmtree(target_host_path)
            else:
                os.remove(target_host_path)
                
        os.makedirs(host_dir, exist_ok=True)

        is_directory = os.path.isdir(file_path)
        
        if is_directory:
            print(f"[Analysis] Copying directory {file_path} to {target_host_path}")
            shutil.copytree(file_path, target_host_path)
            # For container path, it's just the base name mapped
            target_container_path = os.path.join(container_dir, base_name)
        else:
            # Single file
            # If code_content is provided (e.g. from IDE unsaved buffer), use it.
            # Otherwise read from file.
            if not code_content and os.path.exists(file_path):
                with open(file_path, 'r') as f:
                    code_content = f.read()
            
            with open(target_host_path, "w") as f:
                f.write(code_content)
            target_container_path = os.path.join(container_dir, base_name)

        try:
            # --- Step 0: Static Analysis (Rule-Based) ---
            logs.append("Step 1/5: Running Rule-Based Static Analysis...")
            
            # Resolve script path
            script_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static_analysis.sc")
            output_json_path = os.path.join(host_dir, f"static_results_{uuid.uuid4().hex}.json")
            
            # We run the script on the TARGET HOST PATH (where we copied the code).
            # Note: The script runs 'importCode'. If using 'joern-cli' locally, it needs the local path.
            # If 'joern-cli' is running inside the container, it needs the container path.
            # Assumed: Backend is running locally or in same env as 'joern' command.
            # We use 'target_host_path' input for the script.
            
            params = {
                "inputPath": target_host_path,
                "outputFile": output_json_path
            }
            
            print(f"[Analysis] Executing Static Analysis Script on {target_host_path}...")
            success, script_out = await self.joern.run_script(script_path, params)

            print(output_json_path)
            
            static_findings = []
            if os.path.exists(output_json_path):
                try:
                    with open(output_json_path, 'r') as f:
                        static_findings = json.load(f)
                except:
                    pass
                # Cleanup output file
                try:
                    os.remove(output_json_path)
                except:
                    pass
            
            logs.append(f"Step 1 Complete: Found {len(static_findings)} suspicious targets via static rules.")
            
            if not static_findings:
                logs.append("No suspicious code patterns found by static analysis. Skipping deep scan.")
                return {
                    "status": "clean",
                    "message": "Static analysis found no issues.",
                    "logs": logs
                }

            # --- Step 1: Load to Main Joern Session ---
            # We need the project loaded to run Model Q's queries later.
            print(f"[Analysis] Loading {base_name} into Main Joern Session...")
            logs.append(f"Step 2/5: Loading code into Interactive Joern Session...")
            
            await self.joern.load_project(target_container_path, project_name)
            logs.append("Step 2 Complete: Project loaded.")
            
            # --- Step 2 & 3: Model Q & Verification (Iterative) ---
            logs.append(f"Step 3/5: Deep Analysis on {len(static_findings)} targets...")
            
            all_slices = []
            
            for idx, finding in enumerate(static_findings):
                func_code = finding.get("parentFunctionCode", "")
                func_loc = f"{finding.get('filename')}:{finding.get('lineNumber')}"
                
                if not func_code or func_code == "N/A":
                    continue
                    
                print(f"[Analysis] Analyzing target {idx+1}/{len(static_findings)}: {func_loc}")
                # logs.append(f"--> Analyzing target in {func_loc}...") # Filtered for cleaner UI
                
                # Ask Model Q for queries based on the aggregated code
                queries = self._generate_queries(func_code)
                
                if queries is None:
                    # Critical Failure: Model Q is down or erroring
                    error_msg = f"Analysis Aborted: Model Q API failed for {filename}."
                    logs.append(f"    CRITICAL ERROR: {error_msg}")
                    return {
                        "status": "error",
                        "message": "Model Q (Query Generator) is unreachable or returned an error.",
                        "logs": logs
                    }
                
                if not queries:
                    logs.append(f"    Model Q produced no queries for {filename}.")
                    continue
                
                # Verify Code
                # We execute specific queries.
                # Note: Model Q generates queries based on the function snippet.
                # These queries might need adjustment if they assume a specific context, 
                # but usually 'method("name")...' works globally.
                
                success, slices = await self.joern.extract_joern_paths(func_code, queries) # Source code arg is mainly for mapping lines?
                # Actually extract_joern_paths uses source_code argument to map lines from 'line_number' to 'code'.
                # But here 'source_code' is just the function snippet? 
                # Or we should pass the full file content?
                # If we pass directory, we don't have a single 'source_code'.
                # FIX: extract_joern_paths needs to fetch code from the CPG or file on disk if we want accuracy.
                # For now, we will pass 'func_code' so at least we see relative code.
                
                if success and slices:
                    print(f"[Analysis] Verified {len(slices)} path(s) for target {idx+1}")
                    logs.append(f"    Verified {len(slices)} vulnerability path(s) in {func_loc}")
                    
                    # Store finding context (file, code, slices)
                    finding_context = {
                        "file": finding.get("filename"),
                        "line": finding.get("lineNumber"),
                        "code": func_code,
                        "slices": slices
                    }
                    all_slices.append(finding_context)
                else:
                    # logs.append(f"    No executable paths verified.") # Filtered
                    pass

            
            if not all_slices:
                logs.append("Step 4 Complete: No actual vulnerabilities verified after deep scan.")
                return {
                    "status": "clean",
                    "message": "Static analysis flagged issues, but deep verification found no executable paths.",
                    "logs": logs
                }
            
            logs.append(f"Step 4 Complete: Verified {len(all_slices)} total attack vectors.")
            
            # --- Step 4: Explain & Patch ---
            print(f"[Analysis] Explaining {len(all_slices)} verified paths...")
            logs.append("Step 5/5: Generating Fixes...")
            explanation = self._explain_and_patch(all_slices, is_directory=is_directory)
            
            return {
                "status": "vulnerable",
                "slices": all_slices,
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
        
        # Check for API-level errors passed through _call_model_api
        if response_text.startswith("Error:"):
            return None
            
        return self._extract_queries_from_text(response_text)

    def _explain_and_patch(self, slices: List[List[Dict]], is_directory: bool = False) -> Any:
        """
        Ask Gemini (or Model D fallback) to explain the verified slices and suggest a patch.
        Uses system_prompt.txt for instructions.
        """
        slice_text = json.dumps(slices, indent=2)
        
        # If Gemini is configured, use it
        if self.gemini_client:
            try:
                prompt_content = f"""
Here are the verified execution traces AND source code contexts that cause the issue:

{slice_text}

Analyze the slices based on the system instructions and provide the explanation, patch, and reasoning.
"""
                response = self.gemini_client.models.generate_content(
                    model="gemini-3-flash-preview", 
                    contents=prompt_content,
                    config=types.GenerateContentConfig(
                        system_instruction=self.directory_system_prompt_text if is_directory else self.system_prompt_text
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
Here are the verified execution traces AND source code contexts that cause the issue:

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

