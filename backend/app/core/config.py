import os
from pathlib import Path

# Rutas del proyecto
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # .../eppDetect/backend
PROJECT_ROOT = BACKEND_DIR.parent                            # .../eppDetect
STORAGE_DIR = BACKEND_DIR / "storage"
INCIDENTS_STORAGE_DIR = STORAGE_DIR / "incidents"
UPLOADED_VIDEOS_DIR = STORAGE_DIR / "uploaded_videos"
DB_PATH = BACKEND_DIR / "epp_database.db"

# Asegurar existencia de directorios de almacenamiento
INCIDENTS_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
UPLOADED_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

class Settings:
    PROJECT_NAME: str = "EPP Safety Vision - Sistema de Monitoreo de Obra"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = "epp-safety-secret-key-super-secure-local-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12 horas (turno completo)
    
    BACKEND_DIR: Path = BACKEND_DIR
    PROJECT_ROOT: Path = PROJECT_ROOT
    STORAGE_DIR: Path = STORAGE_DIR
    INCIDENTS_STORAGE_DIR: Path = INCIDENTS_STORAGE_DIR
    UPLOADED_VIDEOS_DIR: Path = UPLOADED_VIDEOS_DIR

    # Base de Datos SQLite Local
    DATABASE_URL: str = f"sqlite:///{DB_PATH.as_posix()}"
    
    # YOLO & Tracking (ubicado en D:\PROYECTO-YOLO\PPE_PROYECTO-1\eppDetect\weights_yolov26s_v1.pt)
    MODEL_PATH: str = str(PROJECT_ROOT / "weights_yolov26s_v1.pt")
    
    # Regla de Negocio: Cooldown de 60 segundos por trabajador/infracción
    INCIDENT_COOLDOWN_SECONDS: float = 60.0
    
    # Confidence threshold
    CONF_THRESHOLD: float = 0.25

settings = Settings()
