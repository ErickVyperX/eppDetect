import cv2
import time
import uuid
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict
import numpy as np
from ultralytics import YOLO

from app.core.config import settings
from app.database import SessionLocal
from app.domain.models import Incident
from app.services.storage_service import storage_service
from app.services.cooldown_manager import cooldown_manager
from app.services.ws_manager import ws_manager
from app.core.timezone import get_lima_now, get_lima_now_naive

logger = logging.getLogger("video_engine")

# Mapeo de colores y categorías
VIOLATION_CLASSES = {"sin_casco", "sin_chaleco", "sin_guantes"}
COMPLIANCE_CLASSES = {"casco", "chaleco", "guantes"}

COLOR_VIOLATION = (0, 0, 220)       # Rojo BGR
COLOR_COMPLIANCE = (0, 180, 0)      # Verde BGR
COLOR_TEXT = (255, 255, 255)        # Blanco

class VideoEngine:
    """Motor de procesamiento de video, inferencia YOLO, tracking y emisión de alertas"""

    def __init__(self):
        self.model: Optional[YOLO] = None
        self.cap: Optional[cv2.VideoCapture] = None
        self.current_source: str | int = 0
        self.current_source_name: str = "En espera de selección"
        
        # Sincronización y ciclo de vida (#390)
        self._stop_event = threading.Event()
        self._stop_event.set()  # Inicialmente detenido
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        
        # Pool de trabajadores para I/O asíncrono (evidencias en disco y SQLite) (#392)
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="incident_worker")
        
        # Buffer de frame JPEG para streaming MJPEG
        self._current_jpeg: Optional[bytes] = None
        
        # Telemetría en tiempo real
        self.current_fps: float = 0.0
        self.active_violations_count: int = 0
        self.active_tracks_count: int = 0

        # Control de frecuencia de logs de error en tracking
        self._last_track_error_time: float = 0.0

    @property
    def is_running(self) -> bool:
        """Indica si el pipeline de procesamiento de video está en ejecución activa."""
        return self._stop_event is not None and not self._stop_event.is_set() and self._thread is not None and self._thread.is_alive()

    @property
    def _is_running(self) -> bool:
        """Compatibilidad hacia atrás con endpoints existentes."""
        return self.is_running

    def initialize_model(self):
        """Carga el modelo YOLO en memoria una sola vez y ejecuta warmup inicial."""
        if self.model is None:
            model_file = settings.MODEL_PATH
            logger.info(f"Cargando modelo YOLO desde: {model_file}")
            self.model = YOLO(model_file)
            logger.info(f"Modelo cargado con éxito. Clases: {self.model.names}")
            try:
                # Warmup con fotograma negro para reducir latencia inicial
                dummy_frame = np.zeros((640, 640, 3), dtype=np.uint8)
                self.model.predict(dummy_frame, verbose=False)
                logger.info("Warmup del modelo completado con éxito.")
            except Exception as e:
                logger.warning(f"No se pudo completar el warmup del modelo: {e}")

    def start(self, source: str | int = 0, source_name: str = "Cámara Web"):
        """Inicia el hilo de captura e inferencia continua con la fuente elegida tras validación síncrona (#389)"""
        if self.is_running or (self._thread is not None and self._thread.is_alive()):
            self.stop()

        if self._thread is not None and self._thread.is_alive():
            raise RuntimeError("El hilo previo de procesamiento sigue vivo tras stop.")

        self.initialize_model()

        # Reset de estado entre fuentes (#388)
        cooldown_manager.reset()

        # Recreación limpia de trackers: borrar atributo para que Ultralytics lo inicialice de nuevo
        predictor = getattr(self.model, "predictor", None)
        if predictor is not None and hasattr(predictor, "trackers"):
            del predictor.trackers

        src = source
        if isinstance(src, str) and src.isdigit():
            src = int(src)

        self.current_source = src
        self.current_source_name = source_name

        # Validación síncrona de captura antes de iniciar hilo de procesamiento (#389)
        cap = self._open_capture(src)
        if cap is None or not cap.isOpened():
            logger.error(f"No se pudo abrir la fuente de video: {source_name} ({source})")
            raise RuntimeError(f"No se pudo abrir la fuente de video especificada: {source_name}")

        self.cap = cap
        session_stop_event = threading.Event()
        self._stop_event = session_stop_event
        self._thread = threading.Thread(
            target=self._process_loop,
            args=(cap, session_stop_event),
            daemon=True
        )
        self._thread.start()
        logger.info(f"Pipeline iniciado con origen: {source_name} (tracker: {settings.TRACKER_CONFIG})")

    def stop(self):
        """Detiene el hilo de procesamiento de forma segura y libera recursos (#390)"""
        if self._stop_event is not None:
            self._stop_event.set()

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=10.0)
            if self._thread.is_alive():
                logger.warning("El hilo de procesamiento sigue vivo tras esperar 10 segundos.")
            else:
                self._thread = None
        else:
            self._thread = None

        # Limpieza residual en caso de hilo terminado o abortado
        if self.cap:
            try:
                self.cap.release()
            except Exception as e:
                logger.warning(f"Error al liberar captura residual: {e}")
            self.cap = None

        self.current_fps = 0.0
        self.active_violations_count = 0
        self.active_tracks_count = 0
        with self._lock:
            self._current_jpeg = None
        logger.info("Pipeline detenido y cámara/video liberados.")

    def get_latest_jpeg(self) -> Optional[bytes]:
        """Obtiene el último frame JPEG generado para streaming o una pantalla en espera"""
        with self._lock:
            if self._current_jpeg is not None:
                return self._current_jpeg

        # Si el motor está detenido, generar frame de espera
        return self._generate_standby_frame()

    def _generate_standby_frame(self) -> bytes:
        """Genera un cuadro visual limpio indicando que el monitoreo está detenido con textos centrados dinámicamente"""
        img_w, img_h = 854, 480
        img = np.zeros((img_h, img_w, 3), dtype=np.uint8)
        img[:] = (15, 23, 42)  # Fondo azul oscuro (#0F172A)
        
        # Borde decorativo
        cv2.rectangle(img, (20, 20), (img_w - 20, img_h - 20), (51, 65, 85), 2)
        
        title = "SISTEMA DE MONITOREO EN ESPERA"
        subtitle = "Seleccione una entrada de video y haga clic en 'Iniciar Monitoreo'"
        
        (tw_title, th_title), _ = cv2.getTextSize(title, cv2.FONT_HERSHEY_SIMPLEX, 0.75, 2)
        (tw_sub, th_sub), _ = cv2.getTextSize(subtitle, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        
        x_title = max(10, (img_w - tw_title) // 2)
        y_title = (img_h // 2) - 15
        
        x_sub = max(10, (img_w - tw_sub) // 2)
        y_sub = (img_h // 2) + 25
        
        cv2.putText(img, title, (x_title, y_title),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(img, subtitle, (x_sub, y_sub),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (148, 163, 184), 1, cv2.LINE_AA)
        
        ret, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        return buffer.tobytes() if ret else b''

    def _open_capture(self, source: Optional[str | int] = None) -> Optional[cv2.VideoCapture]:
        """
        Abre la fuente de video con OpenCV usando los backends óptimos para Windows.
        Para índices int: prueba primero cv2.CAP_MSMF y luego cv2.CAP_DSHOW.
        Para archivos: utiliza cv2.VideoCapture(path).
        Devuelve la instancia de VideoCapture abierta o None si falla.
        """
        src = self.current_source if source is None else source
        if isinstance(src, str) and src.isdigit():
            src = int(src)

        if isinstance(src, int):
            backends = [cv2.CAP_MSMF, cv2.CAP_DSHOW]
            for backend in backends:
                backend_name = "CAP_MSMF" if backend == cv2.CAP_MSMF else "CAP_DSHOW"
                logger.info(f"Intentando abrir cámara índice {src} con {backend_name}...")
                cap = cv2.VideoCapture(src, backend)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, settings.CAMERA_WIDTH)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, settings.CAMERA_HEIGHT)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

                    # Descartar frames de calentamiento de la webcam (autoexposición)
                    for _ in range(5):
                        cap.read()

                    # Verificar que un read() retorne ret True
                    ret, test_frame = cap.read()
                    if ret and test_frame is not None and test_frame.size > 0:
                        logger.info(f"Cámara {src} abierta y verificada con éxito usando {backend_name}.")
                        return cap

                    logger.warning(f"Cámara {src} abierta con {backend_name} pero no devolvió fotogramas válidos.")
                    cap.release()

            logger.error(f"No se pudo inicializar la cámara {src} con ningún backend compatible.")
            return None
        else:
            logger.info(f"Abriendo archivo de video: {src}")
            cap = cv2.VideoCapture(src)
            if cap.isOpened():
                return cap
            logger.error(f"No se pudo abrir el archivo de video: {src}")
            return None

    def _persist_and_broadcast_incident(
        self,
        incident_id: str,
        track_id: int,
        cls_name: str,
        conf: float,
        source_name: str,
        frame_to_save: np.ndarray
    ):
        """Tarea asíncrona de fondo para guardar evidencia fotográfica, persistir en SQLite y emitir WS (#392)"""
        try:
            frame_filename = storage_service.save_incident_frame(incident_id, frame_to_save)
            
            db = SessionLocal()
            try:
                incident_db = Incident(
                    id=incident_id,
                    timestamp=get_lima_now_naive(),
                    track_id=track_id,
                    violation_type=cls_name,
                    confidence=conf,
                    frame_path=frame_filename,
                    source_name=source_name
                )
                db.add(incident_db)
                db.commit()
            except Exception as err:
                logger.error(f"Error al persistir incidencia {incident_id} en BD: {err}")
                db.rollback()
            finally:
                db.close()

            ws_manager.broadcast_from_sync({
                "type": "new_incident",
                "incident": {
                    "id": incident_id,
                    "timestamp": get_lima_now().isoformat(),
                    "track_id": track_id,
                    "violation_type": cls_name,
                    "confidence": round(conf, 2),
                    "frame_url": f"/api/incidents/{incident_id}/frame",
                    "source_name": source_name
                }
            })
            logger.info(f"[ALERTA EPP] Sujeto #{track_id} sin {cls_name}. Cooldown 60s activado.")
        except Exception as err:
            logger.error(f"Error inesperado en persistencia de incidencia {incident_id}: {err}", exc_info=True)

    def _process_loop(self, cap: cv2.VideoCapture, stop_event: threading.Event):
        """Bucle principal de procesamiento de frames, inferencia con tracker ({settings.TRACKER_CONFIG}) y reglas de negocio (#386, #387, #390, #391)"""
        fps_timer = time.time()
        frame_counter = 0
        consecutive_read_failures = 0
        reopened_already = False

        try:
            while not stop_event.is_set():
                if cap is None or not cap.isOpened():
                    break

                ret, frame = cap.read()
                if not ret or frame is None or frame.size == 0:
                    # Si es un archivo de video y llegó al final, rebobinar para demostración continua
                    if not isinstance(self.current_source, int):
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        time.sleep(0.04)
                        continue

                    consecutive_read_failures += 1
                    if consecutive_read_failures >= 30:
                        if not reopened_already:
                            logger.warning("30 fallos consecutivos al leer la cámara. Intentando reabrir cámara...")
                            try:
                                cap.release()
                            except Exception:
                                pass
                            new_cap = self._open_capture(self.current_source)
                            if new_cap is not None and new_cap.isOpened():
                                cap = new_cap
                                if self.cap is not None:
                                    self.cap = new_cap
                                reopened_already = True
                                consecutive_read_failures = 0
                                continue
                            else:
                                logger.error("No se pudo reabrir la cámara tras 30 fallos consecutivos. Finalizando bucle.")
                                break
                        else:
                            logger.error("La cámara continúa fallando tras intento de reapertura. Finalizando bucle.")
                            break

                    time.sleep(0.05)
                    continue

                # Lectura exitosa: resetear contador de fallos
                consecutive_read_failures = 0

                now = time.time()
                results = None
                try:
                    # Rastreo continuo con el tracker configurado (BoT-SORT por defecto)
                    results = self.model.track(
                        frame,
                        persist=True,
                        tracker=settings.TRACKER_CONFIG,
                        conf=settings.CONF_THRESHOLD,
                        verbose=False
                    )
                except Exception as err:
                    now_err = time.time()
                    if now_err - self._last_track_error_time >= 5.0:
                        logger.error(f"Error en model.track con tracker ({settings.TRACKER_CONFIG}): {err}. Usando fallback predict.")
                        self._last_track_error_time = now_err
                    try:
                        # Fallback a predict simple para mantener visualización de cajas sin tracking
                        results = self.model.predict(
                            frame,
                            conf=settings.CONF_THRESHOLD,
                            verbose=False
                        )
                    except Exception as pred_err:
                        if now_err - self._last_track_error_time >= 5.0:
                            logger.error(f"Error en fallback predict: {pred_err}")

                annotated_frame = frame.copy()
                violations_in_frame = 0
                unique_tracks_in_frame = set()
                pending_incidents = []

                if results and len(results) > 0:
                    boxes = results[0].boxes
                    if boxes is not None and len(boxes) > 0:
                        for i in range(len(boxes)):
                            box = boxes[i]
                            cls_id = int(box.cls[0].item())
                            cls_name = self.model.names.get(cls_id, f"clase_{cls_id}")
                            conf = float(box.conf[0].item())
                            xyxy = box.xyxy[0].cpu().numpy().astype(int)
                            x1, y1, x2, y2 = xyxy

                            # Obtener track_id de forma segura (#387: NO inventar IDs; fallback predict no tiene id)
                            track_id = int(box.id[0].item()) if (hasattr(box, "id") and box.id is not None and len(box.id) > 0) else None
                            if track_id is not None:
                                unique_tracks_in_frame.add(track_id)

                            is_violation = cls_name in VIOLATION_CLASSES
                            if is_violation:
                                violations_in_frame += 1

                            color = COLOR_VIOLATION if is_violation else COLOR_COMPLIANCE
                            # Bounding box con grosor aumentado para mayor visibilidad
                            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 3)

                            label_tag = "ALERTA" if is_violation else "OK"
                            track_str = f"#{track_id} " if track_id is not None else ""
                            label = f"[{label_tag}] {track_str}{cls_name} ({conf:.0%})"
                            
                            # Etiqueta con escala y grosor aumentados para lectura nítida
                            font_scale = 1.3
                            font_thickness = 2
                            (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, font_thickness)
                            label_height = th + baseline + 8
                            label_y_top = max(0, y1 - label_height)
                            
                            cv2.rectangle(annotated_frame, (x1, label_y_top), (x1 + tw + 10, y1), color, -1)
                            cv2.putText(annotated_frame, label, (x1 + 5, y1 - baseline - 3),
                                        cv2.FONT_HERSHEY_SIMPLEX, font_scale, COLOR_TEXT, font_thickness, cv2.LINE_AA)

                            # Solo candidatos con track_id válido emitirán alertas (#387)
                            if is_violation and track_id is not None:
                                pending_incidents.append((track_id, cls_name, conf))

                self.active_violations_count = violations_in_frame
                self.active_tracks_count = len(unique_tracks_in_frame)
                
                frame_counter += 1
                if time.time() - fps_timer >= 1.0:
                    self.current_fps = round(frame_counter / (time.time() - fps_timer), 1)
                    frame_counter = 0
                    fps_timer = time.time()

                # Evaluar cooldown y despachar guardado asíncrono sobre el fotograma completamente renderizado (#391, #392)
                for track_id, cls_name, conf in pending_incidents:
                    should_alert = cooldown_manager.should_trigger_incident(
                        track_id=track_id,
                        violation_type=cls_name,
                        current_time=now
                    )

                    if should_alert:
                        incident_id = str(uuid.uuid4())
                        frame_copy = annotated_frame.copy()
                        self._executor.submit(
                            self._persist_and_broadcast_incident,
                            incident_id,
                            track_id,
                            cls_name,
                            conf,
                            self.current_source_name,
                            frame_copy
                        )

                # Codificar fotograma para streaming MJPEG
                ret_enc, buffer = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                if ret_enc:
                    with self._lock:
                        self._current_jpeg = buffer.tobytes()

                time.sleep(0.01)

        except Exception as err:
            logger.error(f"Excepción en bucle de video: {err}", exc_info=True)
        finally:
            # Liberación segura de captura local dentro del hilo secundario (#390)
            if cap is not None:
                try:
                    cap.release()
                except Exception as err:
                    logger.warning(f"Error al liberar captura de video local: {err}")
            if self.cap is cap:
                self.cap = None

            self.current_fps = 0.0
            self.active_violations_count = 0
            self.active_tracks_count = 0
            with self._lock:
                self._current_jpeg = None
            logger.info("Recursos de captura liberados por el hilo de procesamiento.")

video_engine = VideoEngine()
