from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.domain.models import Incident, User
from app.schemas.incident import IncidentResponse, MetricsSummary
from app.core.config import settings
from app.core.timezone import get_lima_now, get_lima_now_naive
from app.api.deps import get_current_user, get_current_user_flexible

router = APIRouter(prefix="/incidents", tags=["Incidencias y Métricas"])


@router.get("", response_model=List[IncidentResponse])
def get_incidents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    violation_type: Optional[str] = None,
    date_filter: Optional[str] = None,  # YYYY-MM-DD
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtiene el listado paginado de incidencias registradas con filtros opcionales (Autenticado)"""
    query = db.query(Incident)

    if violation_type and violation_type != "all":
        query = query.filter(Incident.violation_type == violation_type)

    if date_filter:
        try:
            target_date = datetime.strptime(date_filter, "%Y-%m-%d").date()
            start_dt = datetime.combine(target_date, datetime.min.time())
            end_dt = datetime.combine(target_date, datetime.max.time())
            query = query.filter(Incident.timestamp >= start_dt, Incident.timestamp <= end_dt)
        except ValueError:
            pass

    incidents = query.order_by(desc(Incident.timestamp)).offset(skip).limit(limit).all()

    return [
        IncidentResponse(
            id=inc.id,
            timestamp=inc.timestamp,
            track_id=inc.track_id,
            violation_type=inc.violation_type,
            confidence=inc.confidence,
            frame_url=f"/api/incidents/{inc.id}/frame",
            source_name=inc.source_name,
            resolved=inc.resolved,
            notes=inc.notes
        )
        for inc in incidents
    ]


@router.get("/{incident_id}/frame")
def get_incident_frame(
    incident_id: str,
    current_user: User = Depends(get_current_user_flexible),
    db: Session = Depends(get_db)
):
    """
    Sirve la imagen capturada en alta resolución como evidencia de la infracción.
    Acepta autenticación por cabecera Bearer o parámetro query '?token=...' para elementos <img>.
    Valida contención de ruta en el sistema de archivos (prevención de Path Traversal).
    """
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")

    # Contención de ruta estricta
    clean_filename = Path(incident.frame_path).name
    file_path = (settings.INCIDENTS_STORAGE_DIR / clean_filename).resolve()

    if not file_path.is_file() or not file_path.is_relative_to(settings.INCIDENTS_STORAGE_DIR.resolve()):
        raise HTTPException(status_code=404, detail="El archivo de evidencia fotográfica no existe en disco")

    return FileResponse(path=str(file_path), media_type="image/jpeg")


@router.get("/metrics/summary", response_model=MetricsSummary)
def get_metrics_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Calcula y devuelve métricas consolidadas para el Supervisor de Obra (Autenticado)"""
    today_start = datetime.combine(get_lima_now().date(), datetime.min.time())
    today_count = db.query(func.count(Incident.id)).filter(Incident.timestamp >= today_start).scalar() or 0

    # Agrupación por tipo de EPP ausente (su suma provee también el total histórico sin query extra)
    counts_by_type = (
        db.query(Incident.violation_type, func.count(Incident.id))
        .group_by(Incident.violation_type)
        .all()
    )

    violations_map = {
        "sin_casco": 0,
        "sin_chaleco": 0,
        "sin_guantes": 0
    }
    top_violation = None
    max_count = -1
    total = 0

    for v_type, count in counts_by_type:
        total += count
        violations_map[v_type] = count
        if count > max_count:
            max_count = count
            top_violation = v_type

    # Distribución cronológica continua de las últimas 24 horas (#397) consultando solo la columna timestamp
    now = get_lima_now_naive()
    current_hour_start = now.replace(minute=0, second=0, microsecond=0)
    start_time = current_hour_start - timedelta(hours=23)

    recent_timestamps = (
        db.query(Incident.timestamp)
        .filter(Incident.timestamp >= start_time)
        .all()
    )

    # Generar los 24 intervalos horarios secuenciales desde (now - 23h) hasta la hora actual
    hourly_slots = []
    slot_counts = {}
    for i in range(24):
        slot_dt = start_time + timedelta(hours=i)
        slot_key = slot_dt.strftime("%Y-%m-%d %H")
        slot_label = slot_dt.strftime("%H:00")
        hourly_slots.append((slot_key, slot_label))
        slot_counts[slot_key] = 0

    for (ts,) in recent_timestamps:
        if ts:
            inc_key = ts.strftime("%Y-%m-%d %H")
            if inc_key in slot_counts:
                slot_counts[inc_key] += 1

    hourly_distribution = [
        {"hora": label, "infracciones": slot_counts[key]}
        for key, label in hourly_slots
    ]

    return MetricsSummary(
        total_incidents=total,
        today_incidents=today_count,
        violations_by_type=violations_map,
        top_violation=top_violation,
        hourly_distribution=hourly_distribution
    )
