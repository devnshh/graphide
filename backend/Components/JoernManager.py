import json
import asyncio
import websockets
import httpx
from typing import List, Tuple, Any, Optional, Dict
from cpgqls_client import import_code_query, delete_query

class JoernException(Exception):
    """Custom exception for Joern-related errors"""
    pass

class JoernManager:
    """
    Manages interactions with Joern server for real-time backend service.
    Implements async CPGQLS protocol client directly to avoid asyncio execution loop issues.
    """
    
    def __init__(self, endpoint: str = "localhost:8080"):
        """
        Initialize a Joern Manager.
        
        Args:
            endpoint: Joern server endpoint (e.g., localhost:8080)
        """
        self.endpoint = endpoint.rstrip("/")
        # We don't maintain a persistent connection because the CPGQLS protocol 
        # typically handles one connection per query flow or session, 
        # but for simplicity and robustness against timeouts/disconnects, 
        # we will connect on demand for each query in this async implementation.

    def _get_ws_endpoint(self) -> str:
        return f"ws://{self.endpoint}/connect"

    def _get_query_endpoint(self) -> str:
        return f"http://{self.endpoint}/query"

    def _get_result_endpoint(self, uuid: str) -> str:
        return f"http://{self.endpoint}/result/{uuid}"

    async def run_query(self, query: str) -> Tuple[bool, str]:
        """
        Run a single Joern query using async websockets and http.
        Protocol:
        1. Connect WS
        2. Receive "connected"
        3. POST /query
        4. Wait for result UUID on WS
        5. GET /result/{uuid}
        """
        try:
            async with websockets.connect(self._get_ws_endpoint()) as websocket:
                connected_msg = await websocket.recv()
                if connected_msg != "connected":
                    raise JoernException(f"Unexpected initial message from Joern: {connected_msg}")

                async with httpx.AsyncClient() as client:
                    response = await client.post(self._get_query_endpoint(), json={"query": query})

                    if response.status_code != 200:
                        raise JoernException(f"Failed to post query: {response.text}")

                    data = response.json()
                    uuid = data.get("uuid")
                    if not uuid:
                        raise JoernException("No UUID returned from query submission")

                await websocket.recv()

                async with httpx.AsyncClient() as client:
                    result_response = await client.get(self._get_result_endpoint(uuid))

                    if result_response.status_code != 200:
                        raise JoernException(f"Failed to retrieve result: {result_response.text}")

                    json_body = result_response.json()
                    stdout = json_body.get("stdout", "")
                    stderr = json_body.get("stderr", "")

                    if stderr:
                        raise JoernException(f"Joern internal error (stderr): {stderr}")

                    if "Error" in stdout or "ConsoleException" in stdout:
                        return False, stdout
                    if "List()" in stdout or "= empty iterator" in stdout:
                        return True, stdout
                    return True, stdout

        except ConnectionRefusedError as exc:
            raise JoernException(f"Joern server not reachable at {self.endpoint}") from exc
        except JoernException:
            raise
        except Exception as exc:
            raise JoernException(f"Failed to execute query against {self.endpoint}: {exc}") from exc
    
    async def load_project(self, input_path: str, project_name: str = "temp_project") -> str:
        """
        Load a project into Joern.
        
        Args:
            input_path: Path to the source code
            project_name: Name to assign to the project (default: temp_project)
            
        Returns:
            Output logs from the import
        """
        # Delete any existing project before importing the new one.
        await self.delete_project(project_name, strict=False)

        import_cmd = import_code_query(input_path, project_name)
        success, output = await self.run_query(import_cmd)
        
        if not success:
            raise JoernException(f"Failed to import project: {output}")
            
        return output

    async def delete_project(self, project_name: str, strict: bool = True) -> str:
        """
        Delete a project from Joern to free memory.
        
        Args:
            project_name: Name of the project to delete
            strict: If True, raises exception on failure. If False, just logs/returns.
            
        Returns:
            Output logs
        """
        delete_cmd = delete_query(project_name)
        success, output = await self.run_query(delete_cmd)
        
        if strict and not success:
            raise JoernException(f"Failed to delete project {project_name}: {output}")
            
        return output

    async def reset_session(self, project_name: str = "temp_project"):
        """
        Helper to clean up a session.
        """
        await self.delete_project(project_name, strict=False)

    async def run_batch_queries(self, queries: List[str]) -> Tuple[bool, List[Any]]:
        """
        Run a list of queries.
        Raises JoernException as soon as one query fails.
        """
        results = []
        for q in queries:
            success, output = await self.run_query(q)
            if not success:
                raise JoernException(f"Batch query failed: {output}")
            results.append(output)
        return True, results

    async def extract_joern_paths(self, source_code: str, queries: list) -> Tuple[bool, list]:
        """
        Run the queries and assume the last one is a reachability query that needs slicing.
        
        Args:
            source_code: The source code string
            queries: List of Scala queries string
            
        Returns:
            Tuple (Success, Slices List)
        """
        if not queries:
            raise JoernException("No queries provided for Joern path extraction")

        setup_queries = queries[:-1]
        await self.run_batch_queries(setup_queries)

        # Modify and run the last query
        reachability_query = queries[-1]
        
        # Strip .l if present
        if reachability_query.endswith(".l"):
            reachability_query = reachability_query[:-2]

        # Inject the JSON mapping logic
        # This is the "Magic" slicing step
        json_transform = (
            ".map(flow => flow.elements.map(node => "
            "Map(\"id\" -> node.id, \"line_number\" -> node.lineNumber, \"code\" -> node.code)"
            ")).toJsonPretty"
        )
        final_query = reachability_query + json_transform
        
        success, json_output = await self.run_query(final_query)

        if not success:
            raise JoernException(f"Joern query returned an error: {json_output}")

        if '"""' in json_output:
            parts = json_output.split('"""')
            if len(parts) < 2:
                raise JoernException(f"Unexpected Joern JSON output format: {json_output}")
            clean_json = parts[1]
        else:
            clean_json = json_output

        if not clean_json.strip():
            return True, []

        try:
            paths_data = json.loads(clean_json)
        except json.JSONDecodeError as exc:
            raise JoernException(f"Failed to parse Joern JSON output: {json_output}") from exc

        return True, self._map_paths_to_code(source_code, paths_data)

    async def run_script(self, script_path: str, params: Dict[str, str]) -> Tuple[bool, str]:
        """
        Run a standalone Joern script using the 'joern' CLI.
        This runs in a separate process/JVM async.
        
        Args:
            script_path: Absolute path to the .sc script
            params: Dictionary of parameters to pass to the script
        """
        import asyncio
        
        # Construct parameters string
        # joern --script script.sc --param inputPath=... --param outputFile=...
        cmd = ["joern", "--script", script_path]
        for k, v in params.items():
            cmd.extend([f"--param", f"{k}={v}"])
            
        print(f"[JoernManager] Executing: {' '.join(cmd)}")
        
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode().strip()
                print(f"[JoernManager] Script failed: {error_msg}")
                return False, error_msg

            return True, stdout.decode().strip()

        except FileNotFoundError as exc:
            raise JoernException(f"Joern CLI not found: {exc}") from exc
        except OSError as exc:
            raise JoernException(f"Failed to launch Joern CLI: {exc}") from exc

    def _map_paths_to_code(self, source_code: str, paths_json: List[List[Dict]]) -> List[List[Dict]]:
        """
        Internal helper to slice the source code based on line numbers.
        """
        source_lines = source_code.splitlines()
        sliced_paths = []
        
        for path_trace in paths_json:
            slice_ = []
            for node in path_trace:
                line_num = node.get("line_number")
                if isinstance(line_num, int) and 0 < line_num <= len(source_lines):
                    slice_.append({
                        "id": node.get("id"),
                        "line_number": line_num,
                        "code": source_lines[line_num - 1]
                    })
            if slice_:
                sliced_paths.append(slice_)
                
        return sliced_paths
