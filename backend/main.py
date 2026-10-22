import sys
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

# Añadir backend al sys.path
BASE_BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_BACKEND_DIR))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.core.config import settings
from app.services.video_engine import video_engine
from app.services.ws_manager import ws_manager
from app.api.auth_router import router as auth_router
from app.api.stream_router import router as stream_router
from app.api.incidents_router import router as incidents_router
from app.api.ws_router import router as ws_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ciclo de inicio: NO iniciar inferencia automáticamente
    loop = asyncio.get_running_loop()
    ws_manager.set_loop(loop)
    print("[Main] Servidor iniciado en http://127.0.0.1:8000.")
    print("[Main] Motor de detección en espera. El supervisor debe elegir la fuente de video en la interfaz.")

    yield

    # Ciclo de apagado
    print("[Main] Deteniendo motor de video...")
    video_engine.stop()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Sistema Web Local de Detección de EPP para Supervisión de Obra",
    version="1.0.0",
    lifespan=lifespan
)

# Middleware de Cabeceras de Seguridad HTTP (SEC-14)
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# CORS restringido a los orígenes autorizados de la aplicación (SEC-09)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Rutas de la API
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(stream_router, prefix=settings.API_V1_STR)
app.include_router(incidents_router, prefix=settings.API_V1_STR)
app.include_router(ws_router)

# NOTA (SEC-13): Se retira app.mount("/static/incidents", ...) para proteger datos personales
# y biométricos de los trabajadores. Las evidencias fotográficas se sirven exclusivamente con
# autenticación y autorización controlada a través de /api/incidents/{incident_id}/frame.

# Montar frontend compilado (si existe) con verificación estricta de Path Traversal (SEC-03)
FRONTEND_DIST = settings.PROJECT_ROOT / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        base_dist = FRONTEND_DIST.resolve()
        requested_file = (base_dist / full_path).resolve()

        if requested_file.is_file() and requested_file.is_relative_to(base_dist):
            return FileResponse(requested_file)

        return FileResponse(
            base_dist / "index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )
else:
    @app.get("/")
    def index():
        return {
            "system": settings.PROJECT_NAME,
            "status": "online",
            "docs": "/docs",
            "message": "Backend activo. Inicie el frontend para acceder a la interfaz gráfica."
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
