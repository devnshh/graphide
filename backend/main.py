
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import uvicorn
try:
    from .config import settings
    from .routes import scan, chat, slice, media, verify
except ImportError:
    from config import settings
    from routes import scan, chat, slice, media, verify

# Configure logging
logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("graphide.main")

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

# Include Routers
app.include_router(scan.router, tags=["Scan"])
app.include_router(chat.router, tags=["Chat"])
app.include_router(slice.router, tags=["Slice"])
app.include_router(media.router, tags=["Media"])
app.include_router(verify.router, tags=["Verify"])

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok", 
        "service": settings.APP_NAME,
        "joern_status": "checking..." # In real app we might check verify connection here
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
