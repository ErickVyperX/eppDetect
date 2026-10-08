import cv2
import time
import uuid
import threading
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
        
        self._is_running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        
        # Buffer de frame JPEG para streaming MJPEG
        self._current_jpeg: Optional[bytes] = None
        
        # Telemetría en tiempo real
        self.current_fps: float = 0.0
        self.active_violations_count: int = 0
        self.active_tracks_count: int = 0

    def initialize_model(self):
        """Carga el modelo YOLO en memoria una sola vez"""
        if self.model is None:
            model_file = settings.MODEL_PATH
            print(f"[VideoEngine] Cargando modelo YOLO desde: {model_file}")
            self.model = YOLO(model_file)
            print("[VideoEngine] Modelo cargado con éxito. Clases:", self.model.names)

    def start(self, source: str | int = 0, source_name: str = "Cámara Web"):
        """Inicia el hilo de captura e inferencia continua con la fuente elegida"""
        if self._is_running:
            self.stop()

        self.initialize_model()
        self.current_source = source
        self.current_source_name = source_name
        self._is_running = True
        self._thread = threading.Thread(target=self._process_loop, daemon=True)
        self._thread.start()
        print(f"[VideoEngine] Pipeline iniciado con origen: {source_name}")

    def stop(self):
        """Detiene el hilo de procesamiento y libera recursos"""
        self._is_running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None
        
        self.current_fps = 0.0
        self.active_violations_count = 0
        self.active_tracks_count = 0
        with self._lock:
            self._current_jpeg = None
        print("[VideoEngine] Pipeline detenido y cámara/video liberados.")

    def get_latest_jpeg(self) -> Optional[bytes]:
        """Obtiene el último frame JPEG generado para streaming o una pantalla en espera"""
        with self._lock:
            if self._current_jpeg is not None:
                return self._current_jpeg

        # Si el motor está detenido, generar frame de espera
        return self._generate_standby_frame()

    def _generate_standby_frame(self) -> bytes:
        """Genera un cuadro visual limpio indicando que el monitoreo está detenido"""
        img = np.zeros((480, 854, 3), dtype=np.uint8)
        img[:] = (15, 23, 42)  # Fondo azul oscuro (#0F172A)
        
        # Borde decorativo
        cv2.rectangle(img, (20, 20), (834, 460), (51, 65, 85), 2)
        
        cv2.putText(img, "SISTEMA DE MONITOREO EN ESPERA", (210, 220),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(img, "Seleccione una entrada de video y haga clic en 'Iniciar Monitoreo'", (170, 260),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (148, 163, 184), 1, cv2.LINE_AA)
        
        ret, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        return buffer.tobytes() if ret else b''

    def _open_capture(self) -> bool:
        """Abre la fuente de video con OpenCV"""
        src = self.current_source
        if isinstance(src, str) and src.isdigit():
            src = int(src)
        
        if isinstance(src, int):
            self.cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
            if not self.cap.isOpened():
                self.cap = cv2.VideoCapture(src)
        else:
            self.cap = cv2.VideoCapture(src)
            
        return self.cap.isOpened()

    def _process_loop(self):
        """Bucle principal de procesamiento de frames y reglas de negocio"""
        if not self._open_capture():
            print(f"[VideoEngine] Error: No se pudo abrir la fuente {self.current_source}")
            self._is_running = False
            return

        fps_timer = time.time()
        frame_counter = 0

        while self._is_running:
            ret, frame = self.cap.read()
            if not ret:
                # Si es un archivo de video y llegó al final, rebobinar para demostración continua
                if not isinstance(self.current_source, int):
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    time.sleep(0.04)
                    continue
                else:
                    time.sleep(0.05)
                    continue

            now = time.time()
            try:
                results = self.model.track(
                    frame,
                    persist=True,
                    conf=settings.CONF_THRESHOLD,
                    verbose=False
                )
            except Exception:
                results = self.model(frame, conf=settings.CONF_THRESHOLD, verbose=False)

            annotated_frame = frame.copy()
            violations_in_frame = 0
            unique_tracks_in_frame = set()

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

                        track_id = int(box.id[0].item()) if (box.id is not None and len(box.id) > 0) else (i + 1)
                        unique_tracks_in_frame.add(track_id)

                        is_violation = cls_name in VIOLATION_CLASSES
                        if is_violation:
                            violations_in_frame += 1

                        color = COLOR_VIOLATION if is_violation else COLOR_COMPLIANCE
                        cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)

                        label_tag = "ALERTA" if is_violation else "OK"
                        label = f"[{label_tag}] #{track_id} {cls_name} ({conf:.0%})"
                        
                        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                        cv2.rectangle(annotated_frame, (x1, max(0, y1 - 22)), (x1 + tw + 6, max(0, y1)), color, -1)
                        cv2.putText(annotated_frame, label, (x1 + 3, max(14, y1 - 6)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_TEXT, 1, cv2.LINE_AA)

                        # --- REGLA DE NEGOCIO: TRACKING Y COOLDOWN DE 60 SEGUNDOS ---
                        if is_violation:
                            should_alert = cooldown_manager.should_trigger_incident(
                                track_id=track_id,
                                violation_type=cls_name,
                                current_time=now
                            )

                            if should_alert:
                                incident_id = str(uuid.uuid4())
                                frame_filename = storage_service.save_incident_frame(incident_id, annotated_frame)
                                
                                db = SessionLocal()
                                try:
                                    incident_db = Incident(
                                        id=incident_id,
                                        timestamp=get_lima_now_naive(),
                                        track_id=track_id,
                                        violation_type=cls_name,
                                        confidence=conf,
                                        frame_path=frame_filename,
                                        source_name=self.current_source_name
                                    )
                                    db.add(incident_db)
                                    db.commit()
                                except Exception as err:
                                    print(f"[VideoEngine] Error al persistir incidencia: {err}")
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
                                        "source_name": self.current_source_name
                                    }
                                })
                                print(f"[ALERTA EPP] Sujeto #{track_id} sin {cls_name}. Cooldown 60s activado.")

            self.active_violations_count = violations_in_frame
            self.active_tracks_count = len(unique_tracks_in_frame)
            
            frame_counter += 1
            if time.time() - fps_timer >= 1.0:
                self.current_fps = round(frame_counter / (time.time() - fps_timer), 1)
                frame_counter = 0
                fps_timer = time.time()

            banner_text = f"FPS: {self.current_fps} | En pantalla: {self.active_tracks_count} | Infracciones: {self.active_violations_count}"
            cv2.rectangle(annotated_frame, (10, 10), (450, 38), (0, 0, 0), -1)
            cv2.putText(annotated_frame, banner_text, (18, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)

            ret, buffer = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ret:
                with self._lock:
                    self._current_jpeg = buffer.tobytes()

            time.sleep(0.01)

        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None

video_engine = VideoEngine()
