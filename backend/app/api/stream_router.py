import cv2
import time
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Query, Header, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.services.video_engine import video_engine
from app.core.config import settings
from app.domain.models import User
from app.database import get_db
from app.api.deps import get_current_user, get_current_user_from_token

router = APIRouter(prefix="/stream", tags=["Streaming y Control de Video"])

class StartStreamRequest(BaseModel):
    source_type: str  # "camera" o "file"
    camera_index: Optional[int] = 0
    file_path: Optional[str] = None
    name: Optional[str] = "Entrada de Video"

def generate_frames():
    """Generador continuo de frames MJPEG codificados para el navegador web"""
    while True:
        frame_bytes = video_engine.get_latest_jpeg()
        if frame_bytes is not None:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            time.sleep(0.033)  # ~30 FPS máximo de refresco en streaming
        else:
            time.sleep(0.05)

@router.get("/video_feed")
def video_feed(
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Transmite el video procesado en tiempo real en formato MJPEG.
    Requiere autenticación válida vía cabecera Bearer o parámetro query ?token=...
    """
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split("Bearer ", 1)[1].strip()
    elif token:
        raw_token = token.strip()

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere token de autenticación para acceder a la transmisión de video.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    get_current_user_from_token(token=raw_token, db=db)

    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@router.get("/cameras")
def get_connected_cameras(current_user: User = Depends(get_current_user)):
    """Escanea y detecta las cámaras web físicas conectadas al equipo (Autenticado)"""
    available_cameras = []
    
    # Escanear índices 0 a 3 rápidamente
    for idx in range(4):
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
        if cap.isOpened():
            ret, _ = cap.read()
            if ret:
                available_cameras.append({
                    "id": f"cam_{idx}",
                    "index": idx,
                    "name": f"Cámara {idx}" + (" (Principal)" if idx == 0 else "")
                })
            cap.release()
            
    # Si no detectó por DSHOW, probar fallback genérico
    if not available_cameras:
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            available_cameras.append({
                "id": "cam_0",
                "index": 0,
                "name": "Cámara 0 (Predeterminada)"
            })
            cap.release()

    return available_cameras

@router.post("/upload_video")
async def upload_video_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Recibe un archivo de video desde el explorador local.
    Aplica mitigaciones contra Path Traversal (UUID seguro y contención is_relative_to),
    validación de extensiones permitidas y límite estricto de tamaño de subida.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido.")

    ext = Path(file.filename).suffix.lower()
    if ext not in settings.ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Formato de video '{ext}' no permitido. Formatos aceptados: {', '.join(sorted(settings.ALLOWED_VIDEO_EXTENSIONS))}"
        )

    # Generar identificador seguro único para el archivo en disco
    safe_filename = f"{uuid.uuid4().hex}{ext}"
    dest_path = (settings.UPLOADED_VIDEOS_DIR / safe_filename).resolve()

    if not dest_path.is_relative_to(settings.UPLOADED_VIDEOS_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Ruta de archivo no autorizada.")

    # Guardar en chunks controlando que no exceda el límite máximo (200 MB)
    CHUNK_SIZE = 1024 * 1024  # 1 MB por bloque
    total_bytes = 0

    try:
        with open(dest_path, "wb") as buffer:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
                    buffer.close()
                    if dest_path.exists():
                        dest_path.unlink()
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"El archivo excede el tamaño máximo permitido de {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB."
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if dest_path.exists():
            dest_path.unlink()
        raise HTTPException(status_code=500, detail=f"Error al guardar video: {str(e)}")

    return {
        "success": True,
        "filename": safe_filename,
        "file_path": safe_filename,
        "message": f"Archivo de video verificado y preparado para procesamiento."
    }

@router.post("/start")
def start_stream(
    payload: StartStreamRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Inicia el procesamiento e inferencia de video con la fuente elegida.
    Valida rigurosamente que las fuentes basadas en archivo provengan de la carpeta autorizada.
    """
    try:
        if payload.source_type == "camera":
            source_val = payload.camera_index if payload.camera_index is not None else 0
            name = payload.name or f"Cámara Web ({source_val})"
        elif payload.source_type == "file":
            if not payload.file_path:
                raise HTTPException(status_code=400, detail="Ruta o nombre de archivo de video no especificado.")
            
            clean_filename = Path(payload.file_path).name
            target_path = (settings.UPLOADED_VIDEOS_DIR / clean_filename).resolve()

            if not target_path.is_file() or not target_path.is_relative_to(settings.UPLOADED_VIDEOS_DIR.resolve()):
                raise HTTPException(status_code=400, detail="Archivo de video no encontrado o no autorizado.")
            
            source_val = str(target_path)
            name = payload.name or target_path.name
        else:
            raise HTTPException(status_code=400, detail="Tipo de fuente no soportado (debe ser 'camera' o 'file')")

        video_engine.start(source=source_val, source_name=name)

        return {
            "success": True,
            "message": f"Monitoreo iniciado con: {name}",
            "is_running": True,
            "current_source_name": name
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al iniciar monitoreo: {str(e)}")

@router.post("/stop")
def stop_stream(current_user: User = Depends(get_current_user)):
    """Detiene el procesamiento del video y libera la cámara/archivo (Autenticado)"""
    try:
        video_engine.stop()
        return {
            "success": True,
            "message": "Monitoreo detenido correctamente.",
            "is_running": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al detener monitoreo: {str(e)}")

@router.get("/status")
def get_stream_status(current_user: User = Depends(get_current_user)):
    """Retorna el estado y telemetría actual de la transmisión de video (Autenticado)"""
    return {
        "is_running": video_engine._is_running,
        "fps": video_engine.current_fps,
        "current_source_name": video_engine.current_source_name,
        "active_violations": video_engine.active_violations_count,
        "active_tracks": video_engine.active_tracks_count
    }
