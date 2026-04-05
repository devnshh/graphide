from fastapi import APIRouter, HTTPException, Query

try:
    from ..Components.RepositoryGraphManager import RepositoryGraphManager
except ImportError:
    from Components.RepositoryGraphManager import RepositoryGraphManager


router = APIRouter()
repository_graph_manager = RepositoryGraphManager()


@router.get("/repository-graph")
async def get_repository_graph(
    target_path: str = Query(..., description="Selected file or folder path inside the repository"),
):
    try:
        return repository_graph_manager.get_repository_graph(target_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build repository graph: {exc}") from exc
