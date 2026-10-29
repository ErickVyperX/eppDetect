import cv2
import time
import uuid
import asyncio
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.video_engine import video_engine
from app.core.config import settings
from app.domain.models import User
from app.api.deps import get_current_user, get_current_user_flexible

router = APIRouter(prefix="/stream", tags=["Streaming y Control de Video"])

# Caché en memoria para escaneo de cámaras web (evita accesos concurrentes destructivos a DSHOW)
_CAMERAS_CACHE: Optional[List[dict]] = None
_CAMERAS_CACHE_TIME: float = 0.0
_CAMERAS_CACHE_TTL: float = 30.0  # 30 segundos


class StartStreamRequest(BaseModel):
    source_type: str  # "camera" o "file"
    camera_index: Optional[int] = 0
    file_path: Optional[str] = None
    name: Optional[str] = "Entrada de Video"


async def generate_frames():
    """
    Generador continuo asíncrono de frames MJPEG codificados para el navegador web (#393).
    Evita re-enviar fotogramas duplicados comprobando el número de secuencia del motor.
    """
    last_sent_seq: int = -1
    last_send_time: float = 0.0

    while True:
        frame_bytes, frame_seq, is_live = video_engine.get_latest_frame_packet()
        now = time.time()

        # Enviar inmediatamente si hay un fotograma nuevo, si es el primer frame de la conexión,
        # o cada 1.0s en modo standby como latido de mantenimiento de la conexión MJPEG.
        should_send = (
            frame_seq != last_sent_seq
            or last_sent_seq == -1
            or (not is_live and (now - last_send_time) >= 1.0)
        )

        if frame_bytes and should_send:
            last_sent_seq = frame_seq
            last_send_time = now
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
            )
            await asyncio.sleep(0.015 if is_live else 0.2)
        else:
            await asyncio.sleep(0.015 if is_live else 0.1)


@router.get("/video_feed")
async def video_feed(
    stream_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user_flexible)
):
    """
    Transmite el video procesado en tiempo real en formato MJPEG.
    Requiere autenticación válida vía cabecera Bearer o parámetro query ?token=...
    """
    _ = stream_id  # Identificador de sesión para invalidación de caché en el cliente
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


@router.get("/cameras")
def get_connected_cameras(current_user: User = Depends(get_current_user)):
    """Escanea y detecta las cámaras web físicas conectadas al equipo (Autenticado y con caché de 30s)"""
    global _CAMERAS_CACHE, _CAMERAS_CACHE_TIME

    now = time.time()
    if _CAMERAS_CACHE is not None and (now - _CAMERAS_CACHE_TIME) < _CAMERAS_CACHE_TTL:
        return _CAMERAS_CACHE

    available_cameras = []
    active_cam_idx: Optional[int] = None

    # Si el motor está activo usando una cámara física, incluirla directamente sin reabrirla
    if video_engine.is_running and isinstance(video_engine.current_source, int):
        active_cam_idx = video_engine.current_source
        available_cameras.append({
            "id": f"cam_{active_cam_idx}",
            "index": active_cam_idx,
            "name": f"Cámara {active_cam_idx}" + (" (Principal)" if active_cam_idx == 0 else "")
        })

    # Escanear índices 0 a 3 rápidamente omitiendo la cámara en uso activo
    for idx in range(4):
        if idx == active_cam_idx:
            continue
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

    # Si no detectó por DSHOW y tampoco había cámara activa, probar fallback genérico
    if not available_cameras:
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            available_cameras.append({
                "id": "cam_0",
                "index": 0,
                "name": "Cámara 0 (Predeterminada)"
            })
            cap.release()

    # Ordenar cámaras por índice para consistencia
    available_cameras.sort(key=lambda c: c["index"])

    _CAMERAS_CACHE = available_cameras
    _CAMERAS_CACHE_TIME = now
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
        "message": "Archivo de video verificado y preparado para procesamiento."
    }


@router.post("/start")
def start_stream(
    payload: StartStreamRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Inicia el procesamiento e inferencia de video con la fuente elegida.
    Valida rigurosamente que las fuentes basadas en archivo provengan de la carpeta autorizada.
    Apertura síncrona con reporte de error descriptivo 400 (#389).
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

        try:
            video_engine.start(source=source_val, source_name=name)
        except RuntimeError as err:
            raise HTTPException(
                status_code=400,
                detail=f"No se pudo abrir la fuente de video especificada: {str(err)}"
            )

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
        "is_running": video_engine.is_running,
        "fps": video_engine.current_fps,
        "current_source_name": video_engine.current_source_name,
        "active_violations": video_engine.active_violations_count,
        "active_tracks": video_engine.active_tracks_count
    }
