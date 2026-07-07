from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DevPilot",
    description="Lightweight Online Coding Platform",
    version="2.0.0",
)

# CORS — allow frontend dev server and production
origins = os.environ.get("CORS_ORIGINS", '["http://localhost:5173"]').strip("[]").replace('"', '').split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from server.api.routes import execute

app.include_router(execute.router, prefix="/api/execute", tags=["Execute"])

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "DevPilot", "version": "2.0.0"}

# Serve built React frontend
frontend_path = Path("dist")
if frontend_path.exists() and frontend_path.is_dir():
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not Found")
        path = frontend_path / full_path
        if path.exists() and path.is_file():
            return FileResponse(path)
        return FileResponse(frontend_path / "index.html")
else:
    logger.warning("Frontend 'dist' directory not found. Only API will be served.")
