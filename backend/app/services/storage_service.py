import cv2
import numpy as np
from pathlib import Path
from app.core.config import settings

class StorageService:
    def __init__(self, base_storage_dir: Path = settings.INCIDENTS_STORAGE_DIR):
        self.base_dir = base_storage_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save_incident_frame(self, incident_id: str, frame: np.ndarray) -> str:
        """
        Guarda el frame del incidente en disco local en formato JPG.
        Retorna la ruta relativa para su posterior consulta y servicio web.
        """
        filename = f"{incident_id}.jpg"
        filepath = self.base_dir / filename
        
        # Guardar imagen con compresión JPG de alta calidad (calidad 90)
        cv2.imwrite(str(filepath), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        
        return filename

storage_service = StorageService()
