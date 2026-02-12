"""
Graph route — Retrieves CPG vulnerability graphs from Neo4j
for visualization in the frontend NVL renderer.
"""

from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter()


@router.get("/graph")
async def get_graph(
    file_path: Optional[str] = Query(None, description="Filter by file path"),
    scan_id: Optional[str] = Query(None, description="Filter by scan ID"),
):
    """
    Retrieve CPG graph data in NVL-compatible format.

    Returns:
        { nodes: [...], relationships: [...] }
    """
    from Components.Orchestrator import Orchestrator

    orchestrator = Orchestrator()
    if not orchestrator.neo4j_manager or not orchestrator.neo4j_manager.is_connected():
        return {
            "status": "error",
            "message": "Neo4j is not connected",
            "nodes": [],
            "relationships": []
        }

    graph_data = orchestrator.neo4j_manager.get_graph(
        file_path=file_path,
        scan_id=scan_id
    )

    return {
        "status": "success",
        "nodes": graph_data["nodes"],
        "relationships": graph_data["relationships"],
        "nodeCount": len(graph_data["nodes"]),
        "edgeCount": len(graph_data["relationships"]),
    }


@router.delete("/graph")
async def clear_graph(
    file_path: Optional[str] = Query(None),
    scan_id: Optional[str] = Query(None),
):
    """Clear graph data from Neo4j."""
    from Components.Orchestrator import Orchestrator

    orchestrator = Orchestrator()
    if orchestrator.neo4j_manager:
        orchestrator.neo4j_manager.clear_graph(file_path=file_path, scan_id=scan_id)

    return {"status": "success", "message": "Graph cleared"}
