"""
Neo4jManager — Stores and retrieves CPG vulnerability graphs from Neo4j.

Node model:   (:CodeNode {nodeId, code, file, line, type, scanId})
Edge model:   (:CodeNode)-[:FLOWS_TO {scanId}]->(:CodeNode)
"""

from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase, AsyncGraphDatabase
import uuid


class Neo4jManager:
    """
    Manages interactions with Neo4j for storing and querying
    CPG vulnerability flow graphs.
    """

    def __init__(self, uri: str = "bolt://localhost:7687",
                 user: str = "neo4j",
                 password: str = "graphide123"):
        self.uri = uri
        self.user = user
        self.password = password
        self.driver = None
        self._connect()

    def _connect(self):
        """Connect to Neo4j (non-blocking, won't crash if unavailable)."""
        try:
            self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            # Verify connectivity
            self.driver.verify_connectivity()
            print(f"[Neo4jManager] Connected to Neo4j at {self.uri}")
            self._ensure_indexes()
        except Exception as e:
            print(f"[Neo4jManager] Warning: Could not connect to Neo4j at {self.uri}: {e}")
            self.driver = None

    def _ensure_indexes(self):
        """Create indexes for efficient lookups."""
        if not self.driver:
            return
        try:
            with self.driver.session() as session:
                session.run(
                    "CREATE INDEX code_node_file IF NOT EXISTS "
                    "FOR (n:CodeNode) ON (n.file)"
                )
                session.run(
                    "CREATE INDEX code_node_scan IF NOT EXISTS "
                    "FOR (n:CodeNode) ON (n.scanId)"
                )
        except Exception as e:
            print(f"[Neo4jManager] Warning: Failed to create indexes: {e}")

    def is_connected(self) -> bool:
        """Check if Neo4j is available."""
        if not self.driver:
            return False
        try:
            self.driver.verify_connectivity()
            return True
        except Exception:
            return False

    def store_analysis_graph(
        self,
        file_path: str,
        verified_slices: List[List[Dict[str, Any]]],
        vulnerabilities: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Store CPG vulnerability paths from a scan into Neo4j.

        Args:
            file_path: The analyzed file path
            verified_slices: List of vulnerability paths, each path is a list
                           of nodes with {id, line_number, code}
            vulnerabilities: Optional vulnerability metadata

        Returns:
            scan_id: Unique ID for this scan's graph data
        """
        if not self.driver:
            print("[Neo4jManager] Not connected, skipping graph storage.")
            return ""

        scan_id = str(uuid.uuid4())[:8]

        try:
            with self.driver.session() as session:
                for path_idx, path in enumerate(verified_slices):
                    if not path:
                        continue

                    # Determine vulnerability info for this path
                    vuln_type = "unknown"
                    severity = "medium"
                    if vulnerabilities and path_idx < len(vulnerabilities):
                        vuln = vulnerabilities[path_idx]
                        vuln_type = vuln.get("type", "unknown")
                        severity = vuln.get("severity", "medium")

                    prev_node_id = None

                    for node in path:
                        node_uid = f"{scan_id}_{node.get('id', 'unknown')}"
                        line = node.get("line_number", 0)
                        code = node.get("code", "")

                        # Determine node type based on position
                        if node == path[0]:
                            node_type = "source"
                        elif node == path[-1]:
                            node_type = "sink"
                        else:
                            node_type = "intermediate"

                        # Create node
                        session.run(
                            """
                            MERGE (n:CodeNode {nodeId: $nodeId})
                            SET n.code = $code,
                                n.file = $file,
                                n.line = $line,
                                n.type = $nodeType,
                                n.scanId = $scanId,
                                n.vulnType = $vulnType,
                                n.severity = $severity
                            """,
                            nodeId=node_uid,
                            code=code,
                            file=file_path,
                            line=line,
                            nodeType=node_type,
                            scanId=scan_id,
                            vulnType=vuln_type,
                            severity=severity
                        )

                        # Create edge from previous node
                        if prev_node_id:
                            session.run(
                                """
                                MATCH (a:CodeNode {nodeId: $fromId})
                                MATCH (b:CodeNode {nodeId: $toId})
                                MERGE (a)-[r:FLOWS_TO]->(b)
                                SET r.scanId = $scanId,
                                    r.pathIndex = $pathIdx
                                """,
                                fromId=prev_node_id,
                                toId=node_uid,
                                scanId=scan_id,
                                pathIdx=path_idx
                            )

                        prev_node_id = node_uid

            print(f"[Neo4jManager] Stored graph for scan {scan_id}: "
                  f"{len(verified_slices)} paths from {file_path}")
            return scan_id

        except Exception as e:
            print(f"[Neo4jManager] Error storing graph: {e}")
            return ""

    def get_graph(self, file_path: Optional[str] = None,
                  scan_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Retrieve graph data from Neo4j in NVL-compatible format.

        Args:
            file_path: Filter by analyzed file path
            scan_id: Filter by specific scan ID

        Returns:
            dict with 'nodes' and 'relationships' arrays for NVL
        """
        if not self.driver:
            return {"nodes": [], "relationships": []}

        try:
            with self.driver.session() as session:
                # Build query based on filters
                if scan_id:
                    result = session.run(
                        """
                        MATCH (n:CodeNode {scanId: $scanId})
                        OPTIONAL MATCH (n)-[r:FLOWS_TO]->(m:CodeNode {scanId: $scanId})
                        RETURN n, r, m
                        """,
                        scanId=scan_id
                    )
                elif file_path:
                    result = session.run(
                        """
                        MATCH (n:CodeNode {file: $file})
                        OPTIONAL MATCH (n)-[r:FLOWS_TO]->(m:CodeNode {file: $file})
                        RETURN n, r, m
                        """,
                        file=file_path
                    )
                else:
                    # Return all (with limit)
                    result = session.run(
                        """
                        MATCH (n:CodeNode)
                        OPTIONAL MATCH (n)-[r:FLOWS_TO]->(m:CodeNode)
                        RETURN n, r, m
                        LIMIT 200
                        """
                    )

                # Build NVL-compatible format
                nodes_map = {}
                relationships = []

                for record in result:
                    n = record["n"]
                    r = record["r"]
                    m = record["m"]

                    # Add source node
                    n_id = n["nodeId"]
                    if n_id not in nodes_map:
                        nodes_map[n_id] = {
                            "id": n_id,
                            "caption": n.get("code", "")[:60],
                            "code": n.get("code", ""),
                            "file": n.get("file", ""),
                            "line": n.get("line", 0),
                            "type": n.get("type", "intermediate"),
                            "vulnType": n.get("vulnType", ""),
                            "severity": n.get("severity", ""),
                            "scanId": n.get("scanId", ""),
                        }

                    # Add target node + relationship
                    if m is not None and r is not None:
                        m_id = m["nodeId"]
                        if m_id not in nodes_map:
                            nodes_map[m_id] = {
                                "id": m_id,
                                "caption": m.get("code", "")[:60],
                                "code": m.get("code", ""),
                                "file": m.get("file", ""),
                                "line": m.get("line", 0),
                                "type": m.get("type", "intermediate"),
                                "vulnType": m.get("vulnType", ""),
                                "severity": m.get("severity", ""),
                                "scanId": m.get("scanId", ""),
                            }
                        relationships.append({
                            "id": f"{n_id}_to_{m_id}",
                            "from": n_id,
                            "to": m_id,
                            "caption": "FLOWS_TO",
                        })

                return {
                    "nodes": list(nodes_map.values()),
                    "relationships": relationships
                }

        except Exception as e:
            print(f"[Neo4jManager] Error querying graph: {e}")
            return {"nodes": [], "relationships": []}

    def clear_graph(self, file_path: Optional[str] = None,
                    scan_id: Optional[str] = None):
        """Remove graph data from Neo4j."""
        if not self.driver:
            return

        try:
            with self.driver.session() as session:
                if scan_id:
                    session.run(
                        "MATCH (n:CodeNode {scanId: $scanId}) DETACH DELETE n",
                        scanId=scan_id
                    )
                elif file_path:
                    session.run(
                        "MATCH (n:CodeNode {file: $file}) DETACH DELETE n",
                        file=file_path
                    )
        except Exception as e:
            print(f"[Neo4jManager] Error clearing graph: {e}")

    def close(self):
        """Close the Neo4j driver."""
        if self.driver:
            self.driver.close()
