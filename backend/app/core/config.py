import os
import secrets
from pathlib import Path

# Cargar variables de entorno desde el .env en la raíz del proyecto si existe
try:
    from dotenv import load_dotenv
    _project_root = Path(__file__).resolve().parent.parent.parent.parent
    _env_root = _project_root / ".env"
    if _env_root.is_file():
        load_dotenv(_env_root)
    else:
        load_dotenv()
except ImportError:
    pass

# Rutas del proyecto
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # .../eppDetect/backend
PROJECT_ROOT = BACKEND_DIR.parent                            # .../eppDetect
STORAGE_DIR = BACKEND_DIR / "storage"
INCIDENTS_STORAGE_DIR = STORAGE_DIR / "incidents"
UPLOADED_VIDEOS_DIR = STORAGE_DIR / "uploaded_videos"
DB_PATH = BACKEND_DIR / "epp_database.db"
DEFAULT_TRACKER_PATH = Path(__file__).resolve().parent / "botsort_fast.yaml"

# Asegurar existencia de directorios de almacenamiento
INCIDENTS_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
UPLOADED_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

# Parsear orígenes permitidos desde variable de entorno o usar valores por defecto
_env_origins = os.getenv("ALLOWED_ORIGINS")
if _env_origins:
    DEFAULT_ALLOWED_ORIGINS = [o.strip() for o in _env_origins.split(",") if o.strip()]
else:
    DEFAULT_ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]

class Settings:
    PROJECT_NAME: str = "EPP Safety Vision - Sistema de Monitoreo de Obra"
    API_V1_STR: str = "/api"
    # Secreto criptográfico: se lee de variable de entorno o se genera uno aleatorio seguro en memoria
    SECRET_KEY: str = os.getenv("SECRET_KEY") or secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 12)))  # 12 horas por defecto
    ALLOWED_ORIGINS: list = DEFAULT_ALLOWED_ORIGINS
    
    # Límites de subida y extensiones de video
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(3000 * 1024 * 1024)))  # 3000 MB
    ALLOWED_VIDEO_EXTENSIONS: set = {".mp4", ".avi", ".mkv", ".mov"}

    BACKEND_DIR: Path = BACKEND_DIR
    PROJECT_ROOT: Path = PROJECT_ROOT
    STORAGE_DIR: Path = STORAGE_DIR
    INCIDENTS_STORAGE_DIR: Path = INCIDENTS_STORAGE_DIR
    UPLOADED_VIDEOS_DIR: Path = UPLOADED_VIDEOS_DIR

    # Base de Datos SQLite Local
    DATABASE_URL: str = f"sqlite:///{DB_PATH.as_posix()}"
    
    # YOLO & Tracking (ubicado en D:\PROYECTO-YOLO\PPE_PROYECTO-1\eppDetect\weights_yolov26s_v1.2.pt)
    MODEL_PATH: str = str(PROJECT_ROOT / "weights_yolov26s_v1.2.pt")
    
    # Rastreador multi-objeto: usa BoT-SORT optimizado (sin Optical Flow pesado) por defecto
    TRACKER_CONFIG: str = os.getenv(
        "TRACKER_CONFIG",
        str(DEFAULT_TRACKER_PATH) if DEFAULT_TRACKER_PATH.is_file() else "botsort.yaml"
    )

    # Tamaño de imagen de entrada para inferencia YOLO (512 equilibra precisión de EPP y ~22+ FPS en CPU)
    INFERENCE_IMGSZ: int = int(os.getenv("INFERENCE_IMGSZ", "640"))

    # Parámetros de captura de video de cámara web en Windows (640x480 maximiza FPS de cámara USB)
    CAMERA_WIDTH: int = int(os.getenv("CAMERA_WIDTH", "1280"))
    CAMERA_HEIGHT: int = int(os.getenv("CAMERA_HEIGHT", "720"))

    # Regla de Negocio: Cooldown de 60 segundos por trabajador/infracción
    INCIDENT_COOLDOWN_SECONDS: float = float(os.getenv("INCIDENT_COOLDOWN_SECONDS", "60.0"))
    
    # Confidence threshold
    CONF_THRESHOLD: float = float(os.getenv("CONF_THRESHOLD", "0.55"))

settings = Settings()
