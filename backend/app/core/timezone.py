from datetime import datetime
from zoneinfo import ZoneInfo

# Zona Horaria Oficial del Sistema: Lima, Perú / Bogotá, Colombia (UTC-5)
LIMA_TZ = ZoneInfo("America/Lima")

def get_lima_now() -> datetime:
    """Retorna la fecha y hora actual con zona horaria de Lima / Bogotá"""
    return datetime.now(LIMA_TZ)

def get_lima_now_naive() -> datetime:
    """
    Retorna la fecha y hora actual de Lima sin tzinfo (naive),
    óptima para almacenamiento directo y consistente en SQLite.
    """
    return datetime.now(LIMA_TZ).replace(tzinfo=None)
