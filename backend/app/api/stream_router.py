import cv2
import time
import shutil
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.video_engine import video_engine
from app.core.config import settings

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
def video_feed():
    """Transmite el video procesado en tiempo real en formato MJPEG"""
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@router.get("/cameras")
def get_connected_cameras():
    """Escanea y detecta las cámaras web físicas conectadas al equipo"""
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
async def upload_video_file(file: UploadFile = File(...)):
    """Recibe un archivo de video seleccionado desde el explorador de archivos local"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")

    # Guardar en storage local de videos subidos
    dest_path = settings.UPLOADED_VIDEOS_DIR / file.filename
    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar video: {str(e)}")

    return {
        "success": True,
        "filename": file.filename,
        "file_path": str(dest_path),
        "message": f"Archivo '{file.filename}' listo para procesamiento."
    }

@router.post("/start")
def start_stream(payload: StartStreamRequest):
    """Inicia el procesamiento e inferencia de video con la fuente elegida"""
    try:
        if payload.source_type == "camera":
            source_val = payload.camera_index if payload.camera_index is not None else 0
            name = payload.name or f"Cámara Web ({source_val})"
        elif payload.source_type == "file":
            if not payload.file_path or not Path(payload.file_path).exists():
                raise HTTPException(status_code=400, detail="Ruta de archivo de video no encontrada")
            source_val = payload.file_path
            name = payload.name or Path(payload.file_path).name
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
def stop_stream():
    """Detiene el procesamiento del video y libera la cámara/archivo"""
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
def get_stream_status():
    """Retorna el estado y telemetría actual de la transmisión de video"""
    return {
        "is_running": video_engine._is_running,
        "fps": video_engine.current_fps,
        "current_source_name": video_engine.current_source_name,
        "active_violations": video_engine.active_violations_count,
        "active_tracks": video_engine.active_tracks_count
    }
