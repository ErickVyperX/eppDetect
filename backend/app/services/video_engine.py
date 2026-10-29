import cv2
import time
import uuid
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Tuple, List
import numpy as np
import torch
from ultralytics import YOLO

from app.core.config import settings
from app.database import SessionLocal
from app.domain.models import Incident
from app.services.storage_service import storage_service
from app.services.cooldown_manager import cooldown_manager
from app.services.ws_manager import ws_manager
from app.core.timezone import get_lima_now, get_lima_now_naive

logger = logging.getLogger("video_engine")

# Categorías de infracción y paleta de colores BGR
VIOLATION_CLASSES = {"sin_casco", "sin_chaleco", "sin_guantes"}

COLOR_VIOLATION = (0, 0, 220)       # Rojo BGR
COLOR_COMPLIANCE = (0, 180, 0)      # Verde BGR
COLOR_TEXT = (255, 255, 255)        # Blanco


class _CameraStreamReader:
    """
    Lector asíncrono sin cola para cámaras web en vivo.
    Mantiene un hilo ligero leyendo continuamente del sensor USB para entregar
    siempre el fotograma más reciente sin bloquear el hilo de inferencia YOLO.
    """

    def __init__(self, cap: cv2.VideoCapture, stop_event: threading.Event):
        self._cap = cap
        self._stop_event = stop_event
        self._lock = threading.Lock()
        self._new_frame_event = threading.Event()
        self._latest_frame: Optional[np.ndarray] = None
        self._latest_ret: bool = False
        self._has_unread: bool = False
        self._stopped: bool = False
        self._thread = threading.Thread(target=self._reader_loop, daemon=True, name="camera_grabber")
        self._thread.start()

    def _reader_loop(self):
        while not self._stop_event.is_set() and not self._stopped:
            if self._cap is None or not self._cap.isOpened():
                with self._lock:
                    self._latest_ret = False
                    self._has_unread = True
                self._new_frame_event.set()
                break

            ret, frame = self._cap.read()
            with self._lock:
                self._latest_ret = bool(ret and frame is not None and frame.size > 0)
                self._latest_frame = frame if self._latest_ret else None
                self._has_unread = True
            self._new_frame_event.set()

            if not ret:
                time.sleep(0.02)

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """Obtiene el último fotograma capturado esperando como máximo 50ms si aún no hay uno nuevo."""
        self._new_frame_event.wait(timeout=0.05)
        with self._lock:
            if not self._has_unread and self._latest_frame is None:
                return False, None
            self._has_unread = False
            self._new_frame_event.clear()
            return self._latest_ret, self._latest_frame

    def stop(self):
        self._stopped = True
        self._new_frame_event.set()
        if self._thread.is_alive():
            self._thread.join(timeout=1.0)


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

        # Buffer de frame JPEG y número de secuencia para streaming MJPEG sin duplicados
        self._current_jpeg: Optional[bytes] = None
        self._frame_seq: int = 0
        self._standby_jpeg: bytes = self._generate_standby_frame()

        # Telemetría en tiempo real
        self.current_fps: float = 0.0
        self.active_violations_count: int = 0
        self.active_tracks_count: int = 0

        # Configuración de aceleración por hardware y control de logs
        self._use_half: bool = False
        self._device: str = "cpu"
        self._last_track_error_time: float = 0.0

    @property
    def is_running(self) -> bool:
        """Indica si el pipeline de procesamiento de video está en ejecución activa."""
        return (
            self._stop_event is not None
            and not self._stop_event.is_set()
            and self._thread is not None
            and self._thread.is_alive()
        )

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
            self._use_half = torch.cuda.is_available()
            self._device = "cuda:0" if self._use_half else "cpu"
            hw_label = torch.cuda.get_device_name(0) if self._use_half else "CPU"
            logger.info(
                f"Modelo cargado con éxito. Dispositivo: {self._device} ({hw_label}) | "
                f"CUDA FP16: {self._use_half} | Clases: {self.model.names}"
            )

            try:
                # Warmup con fotograma negro al tamaño de inferencia configurado
                imgsz = settings.INFERENCE_IMGSZ
                dummy_frame = np.zeros((imgsz, imgsz, 3), dtype=np.uint8)
                self.model.predict(
                    dummy_frame,
                    imgsz=imgsz,
                    device=self._device,
                    quantize=16 if self._use_half else None,
                    verbose=False
                )
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
            daemon=True,
            name="video_inference_loop"
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
            self._frame_seq += 1
        logger.info("Pipeline detenido y cámara/video liberados.")

    def get_latest_jpeg(self) -> Optional[bytes]:
        """Obtiene el último frame JPEG generado para streaming o la pantalla en espera pre-cacheada."""
        with self._lock:
            if self._current_jpeg is not None:
                return self._current_jpeg
        return self._standby_jpeg

    def get_latest_frame_packet(self) -> Tuple[bytes, int, bool]:
        """
        Retorna una tupla (jpeg_bytes, frame_seq, is_live) bajo lock.
        Permite al generador MJPEG enviar fotogramas únicamente cuando existe un frame nuevo.
        """
        with self._lock:
            if self._current_jpeg is not None:
                return self._current_jpeg, self._frame_seq, True
            return self._standby_jpeg, self._frame_seq, False

    def _generate_standby_frame(self) -> bytes:
        """Genera un cuadro visual limpio indicando que el monitoreo está detenido con textos centrados dinámicamente"""
        img_w, img_h = 854, 480
        img = np.zeros((img_h, img_w, 3), dtype=np.uint8)
        img[:] = (15, 23, 42)  # Fondo azul oscuro (#0F172A)

        # Borde decorativo
        cv2.rectangle(img, (20, 20), (img_w - 20, img_h - 20), (51, 65, 85), 2)

        title = "SISTEMA DE MONITOREO EN ESPERA"
        subtitle = "Seleccione una entrada de video y haga clic en 'Iniciar Monitoreo'"

        (tw_title, _), _ = cv2.getTextSize(title, cv2.FONT_HERSHEY_SIMPLEX, 0.75, 2)
        (tw_sub, _), _ = cv2.getTextSize(subtitle, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)

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
                    # Reafirmar FOURCC MJPG después de cambiar resolución (OpenCV en Windows resetea a YUY2 al cambiar WIDTH/HEIGHT)
                    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                    cap.set(cv2.CAP_PROP_FPS, 30)
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

    def _run_inference(self, frame: np.ndarray):
        """Ejecuta el rastreo multi-objeto (BoT-SORT optimizado) con fallback automático a predict."""
        quantize_mode = 16 if self._use_half else None
        try:
            return self.model.track(
                frame,
                persist=True,
                tracker=settings.TRACKER_CONFIG,
                conf=settings.CONF_THRESHOLD,
                imgsz=settings.INFERENCE_IMGSZ,
                device=self._device,
                quantize=quantize_mode,
                verbose=False
            )
        except Exception as err:
            now_err = time.time()
            if now_err - self._last_track_error_time >= 5.0:
                logger.error(f"Error en model.track con tracker ({settings.TRACKER_CONFIG}): {err}. Usando fallback predict.")
                self._last_track_error_time = now_err
            try:
                return self.model.predict(
                    frame,
                    conf=settings.CONF_THRESHOLD,
                    imgsz=settings.INFERENCE_IMGSZ,
                device=self._device,
                    quantize=quantize_mode,
                    verbose=False
                )
            except Exception as pred_err:
                if now_err - self._last_track_error_time >= 5.0:
                    logger.error(f"Error en fallback predict: {pred_err}")
                return None

    def _annotate_and_extract(
        self,
        frame: np.ndarray,
        results
    ) -> Tuple[List[Tuple[int, str, float]], int, int]:
        """
        Dibuja in-place las cajas delimitadoras y etiquetas escaladas dinámicamente sobre el fotograma,
        extrayendo las infracciones candidatas y métricas de telemetría sin clonar el array en RAM.
        """
        violations_in_frame = 0
        unique_tracks_in_frame = set()
        pending_incidents: List[Tuple[int, str, float]] = []

        if not results or len(results) == 0:
            return pending_incidents, 0, 0

        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return pending_incidents, 0, 0

        # Escalado dinámico de fuente y bordes proporcional al alto de la imagen
        frame_h = frame.shape[0] if frame.ndim >= 2 else 480
        font_scale = max(0.65, round(frame_h / 950.0, 2))
        font_thickness = 2
        box_thickness = max(2, int(round(frame_h / 240.0)))

        for i in range(len(boxes)):
            box = boxes[i]
            cls_id = int(box.cls[0].item())
            cls_name = self.model.names.get(cls_id, f"clase_{cls_id}")
            conf = float(box.conf[0].item())
            xyxy = box.xyxy[0].cpu().numpy().astype(int)
            x1, y1, x2, y2 = xyxy

            # Obtener track_id de forma segura (#387: NO inventar IDs; fallback predict no tiene id)
            track_id = (
                int(box.id[0].item())
                if (hasattr(box, "id") and box.id is not None and len(box.id) > 0)
                else None
            )
            if track_id is not None:
                unique_tracks_in_frame.add(track_id)

            is_violation = cls_name in VIOLATION_CLASSES
            if is_violation:
                violations_in_frame += 1

            color = COLOR_VIOLATION if is_violation else COLOR_COMPLIANCE
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, box_thickness)

            label_tag = "ALERTA" if is_violation else "OK"
            track_str = f"#{track_id} " if track_id is not None else ""
            label = f"[{label_tag}] {track_str}{cls_name} ({conf:.0%})"

            (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, font_thickness)
            label_height = th + baseline + 8
            label_y_top = max(0, y1 - label_height)

            cv2.rectangle(frame, (x1, label_y_top), (x1 + tw + 10, y1), color, -1)
            cv2.putText(
                frame,
                label,
                (x1 + 5, y1 - baseline - 3),
                cv2.FONT_HERSHEY_SIMPLEX,
                font_scale,
                COLOR_TEXT,
                font_thickness,
                cv2.LINE_AA
            )

            # Solo candidatos con track_id válido emitirán alertas (#387)
            if is_violation and track_id is not None:
                pending_incidents.append((track_id, cls_name, conf))

        return pending_incidents, violations_in_frame, len(unique_tracks_in_frame)

    def _dispatch_incidents(
        self,
        pending_incidents: List[Tuple[int, str, float]],
        annotated_frame: np.ndarray,
        now: float
    ):
        """Evalúa la ventana de cooldown y despacha el guardado asíncrono clonando el frame solo si hay alerta."""
        frame_cloned: Optional[np.ndarray] = None
        for track_id, cls_name, conf in pending_incidents:
            if cooldown_manager.should_trigger_incident(
                track_id=track_id,
                violation_type=cls_name,
                current_time=now
            ):
                if frame_cloned is None:
                    frame_cloned = annotated_frame.copy()
                incident_id = str(uuid.uuid4())
                self._executor.submit(
                    self._persist_and_broadcast_incident,
                    incident_id,
                    track_id,
                    cls_name,
                    conf,
                    self.current_source_name,
                    frame_cloned
                )

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
        """Bucle principal de procesamiento de frames, inferencia con tracker y reglas de negocio (#386-#392)"""
        fps_timer = time.time()
        frame_counter = 0
        infer_time_accum = 0.0
        logged_first_telemetry = False
        consecutive_read_failures = 0
        reopened_already = False
        is_camera_source = isinstance(self.current_source, int)

        # Activar lector asíncrono sin cola cuando cap es una instancia real de cv2.VideoCapture en vivo
        cam_reader: Optional[_CameraStreamReader] = None
        if is_camera_source and isinstance(cap, cv2.VideoCapture):
            cam_reader = _CameraStreamReader(cap, stop_event)

        try:
            while not stop_event.is_set():
                if cap is None or not cap.isOpened():
                    break

                if cam_reader is not None:
                    ret, frame = cam_reader.read()
                else:
                    ret, frame = cap.read()

                if not ret or frame is None or frame.size == 0:
                    # Si es un archivo de video y llegó al final, rebobinar para demostración continua
                    if not is_camera_source:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        time.sleep(0.03)
                        continue

                    consecutive_read_failures += 1
                    if consecutive_read_failures >= 30:
                        if not reopened_already:
                            logger.warning("30 fallos consecutivos al leer la cámara. Intentando reabrir cámara...")
                            if cam_reader is not None:
                                cam_reader.stop()
                                cam_reader = None
                            try:
                                cap.release()
                            except Exception:
                                pass
                            new_cap = self._open_capture(self.current_source)
                            if new_cap is not None and new_cap.isOpened():
                                cap = new_cap
                                if self.cap is not None:
                                    self.cap = new_cap
                                if isinstance(cap, cv2.VideoCapture):
                                    cam_reader = _CameraStreamReader(cap, stop_event)
                                reopened_already = True
                                consecutive_read_failures = 0
                                continue
                            else:
                                logger.error("No se pudo reabrir la cámara tras 30 fallos consecutivos. Finalizando bucle.")
                                break
                        else:
                            logger.error("La cámara continúa fallando tras intento de reapertura. Finalizando bucle.")
                            break

                    time.sleep(0.03)
                    continue

                # Lectura exitosa: resetear contador de fallos
                consecutive_read_failures = 0
                now = time.time()

                # 1. Inferencia y tracking
                t_inf0 = time.perf_counter()
                results = self._run_inference(frame)
                infer_time_accum += (time.perf_counter() - t_inf0)

                # 2. Dibujo in-place y extracción de telemetría
                pending_incidents, violations_in_frame, tracks_in_frame = self._annotate_and_extract(frame, results)
                self.active_violations_count = violations_in_frame
                self.active_tracks_count = tracks_in_frame

                # 3. Actualización de FPS reales
                frame_counter += 1
                elapsed_fps = time.time() - fps_timer
                if elapsed_fps >= 1.0:
                    self.current_fps = round(frame_counter / elapsed_fps, 1)
                    if not logged_first_telemetry and frame_counter > 0:
                        avg_inf_ms = (infer_time_accum / frame_counter) * 1000.0
                        gpu_max_fps = 1000.0 / max(avg_inf_ms, 0.1)
                        logger.info(
                            f"Telemetría activa -> Inferencia {self._device}: {avg_inf_ms:.1f} ms/frame "
                            f"(capacidad IA: ~{gpu_max_fps:.0f} FPS) | Tasa de entrega de fuente de video: {self.current_fps} FPS"
                        )
                        logged_first_telemetry = True
                    infer_time_accum = 0.0
                    frame_counter = 0
                    fps_timer = time.time()

                # 4. Evaluación de cooldown y despacho asíncrono de evidencias (#391, #392)
                if pending_incidents:
                    self._dispatch_incidents(pending_incidents, frame, now)

                # 5. Codificación JPEG optimizada (calidad 75) y publicación con número de secuencia
                ret_enc, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                if ret_enc:
                    jpeg_bytes = buffer.tobytes()
                    with self._lock:
                        self._current_jpeg = jpeg_bytes
                        self._frame_seq += 1

                # Solo ceder tiempo mínimo si es un archivo de video local; en cámara en vivo correr a máxima fluidez
                if not is_camera_source:
                    time.sleep(0.005)

        except Exception as err:
            logger.error(f"Excepción en bucle de video: {err}", exc_info=True)
        finally:
            if cam_reader is not None:
                cam_reader.stop()

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
                self._frame_seq += 1
            logger.info("Recursos de captura liberados por el hilo de procesamiento.")


video_engine = VideoEngine()
