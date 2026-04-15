from pathlib import Path
import logging
import sys

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = "backend"

load_dotenv()

from .config import settings
from .routes import chat, graph, media, repository_graph, scan, slice, verify

logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

app = FastAPI(
    title=settings.APP_NAME,
    description="Backend for Graphide: Agentic Vulnerability Analysis",
    version="1.0.0"
)

# Allow CORS for localhost (VS Code / Electron)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scan.router, tags=["Scan"])
app.include_router(chat.router, tags=["Chat"])
app.include_router(slice.router, tags=["Slice"])
app.include_router(media.router, tags=["Media"])
app.include_router(verify.router, tags=["Verify"])
app.include_router(graph.router, tags=["Graph"])
app.include_router(repository_graph.router, tags=["Repository Graph"])

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "joern_status": "checking..."
    }

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
