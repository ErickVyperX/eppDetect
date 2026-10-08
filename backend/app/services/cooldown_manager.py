import time
import threading
from typing import Dict, Tuple, Optional
from app.core.config import settings

class CooldownManager:
    """
    Gestor de Estado y Ventana de Enfriamiento (Cooldown) para el Tracking de Sujetos.
    
    Regla de Negocio:
    - Cuando se detecta una ausencia de EPP en un sujeto (track_id):
      1. Se emite la alerta y se guarda en BD inmediatamente.
      2. Se trackea al sujeto durante una ventana de 60 segundos (cooldown).
      3. Durante esos 60 segundos NO se vuelve a guardar la incidencia ni a spamear alertas.
      4. Si después de transcurrido el minuto el sujeto sigue cometiendo la misma infracción,
         se repite el proceso (se emite nueva alerta, nuevo frame y nuevo registro en BD).
    """

    def __init__(self, cooldown_seconds: float = settings.INCIDENT_COOLDOWN_SECONDS):
        self.cooldown_seconds = cooldown_seconds
        self._lock = threading.Lock()
        # Estructura: (track_id, violation_type) -> {
        #    'first_seen': float,
        #    'last_alert': float,
        #    'last_seen': float,
        #    'alert_count': int
        # }
        self._tracks: Dict[Tuple[int, str], dict] = {}

    def should_trigger_incident(self, track_id: int, violation_type: str, current_time: Optional[float] = None) -> bool:
        """
        Determina si una infracción detectada debe disparar una nueva incidencia y alerta sonora.
        Retorna True si debe registrarse y alertarse. Retorna False si está dentro de la ventana de 1 minuto.
        """
        if current_time is None:
            current_time = time.time()

        key = (track_id, violation_type)

        with self._lock:
            # Limpieza periódica de tracks inactivos (idle > 180s)
            self._cleanup_stale_tracks_unlocked(current_time)

            track_info = self._tracks.get(key)

            if track_info is None:
                # Primera detección para este track_id y tipo de infracción
                self._tracks[key] = {
                    "first_seen": current_time,
                    "last_alert": current_time,
                    "last_seen": current_time,
                    "alert_count": 1
                }
                return True
            
            # El track ya existe
            track_info["last_seen"] = current_time
            time_since_last_alert = current_time - track_info["last_alert"]

            if time_since_last_alert >= self.cooldown_seconds:
                # Transcurrió el minuto completo y la infracción persiste: disparar nuevo ciclo
                track_info["last_alert"] = current_time
                track_info["alert_count"] += 1
                return True

            # Sigue dentro de la ventana de 60 segundos: tracking continuo y silencioso
            return False

    def get_track_status(self, track_id: int, violation_type: str, current_time: Optional[float] = None) -> Optional[dict]:
        """Retorna el estado de seguimiento del sujeto y segundos restantes de cooldown"""
        if current_time is None:
            current_time = time.time()

        with self._lock:
            track_info = self._tracks.get((track_id, violation_type))
            if not track_info:
                return None
            
            elapsed = current_time - track_info["last_alert"]
            remaining = max(0.0, self.cooldown_seconds - elapsed)
            return {
                "track_id": track_id,
                "violation_type": violation_type,
                "elapsed_since_alert": round(elapsed, 1),
                "remaining_cooldown": round(remaining, 1),
                "alert_count": track_info["alert_count"]
            }

    def _cleanup_stale_tracks_unlocked(self, current_time: float, max_idle: float = 180.0):
        """Elimina tracks que no se han visto en más de max_idle segundos para liberar memoria"""
        keys_to_remove = [
            k for k, v in self._tracks.items()
            if (current_time - v["last_seen"]) > max_idle
        ]
        for k in keys_to_remove:
            del self._tracks[k]

cooldown_manager = CooldownManager()
