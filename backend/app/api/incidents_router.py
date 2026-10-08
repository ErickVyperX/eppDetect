from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.domain.models import Incident
from app.schemas.incident import IncidentResponse, MetricsSummary
from app.core.config import settings
from app.core.timezone import get_lima_now, get_lima_now_naive

router = APIRouter(prefix="/incidents", tags=["Incidencias y Métricas"])

@router.get("", response_model=List[IncidentResponse])
def get_incidents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    violation_type: Optional[str] = None,
    date_filter: Optional[str] = None,  # YYYY-MM-DD
    db: Session = Depends(get_db)
):
    """Obtiene el listado paginado de incidencias registradas con filtros opcionales"""
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

    # Formatear respuesta con la URL pública relativa del frame
    result = []
    for inc in incidents:
        result.append(
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
        )
    return result

@router.get("/{incident_id}/frame")
def get_incident_frame(incident_id: str, db: Session = Depends(get_db)):
    """Sirve la imagen capturada en alta resolución como evidencia de la infracción"""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")

    file_path = settings.INCIDENTS_STORAGE_DIR / incident.frame_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="El archivo de evidencia fotográfica no existe en disco")

    return FileResponse(path=str(file_path), media_type="image/jpeg")

@router.get("/metrics/summary", response_model=MetricsSummary)
def get_metrics_summary(db: Session = Depends(get_db)):
    """Calcula y devuelve métricas consolidadas para el Supervisor de Obra"""
    total = db.query(Incident).count()

    today_start = datetime.combine(get_lima_now().date(), datetime.min.time())
    today_count = db.query(Incident).filter(Incident.timestamp >= today_start).count()

    # Agrupación por tipo de EPP ausente
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

    for v_type, count in counts_by_type:
        violations_map[v_type] = count
        if count > max_count:
            max_count = count
            top_violation = v_type

    # Distribución por horas de las últimas 24 horas (en hora de Lima)
    twenty_four_hours_ago = get_lima_now_naive() - timedelta(hours=24)
    recent_incidents = (
        db.query(Incident)
        .filter(Incident.timestamp >= twenty_four_hours_ago)
        .all()
    )

    hourly_dict = {f"{h:02d}:00": 0 for h in range(24)}
    for inc in recent_incidents:
        hour_str = inc.timestamp.strftime("%H:00")
        if hour_str in hourly_dict:
            hourly_dict[hour_str] += 1

    hourly_distribution = [
        {"hora": hour, "infracciones": count}
        for hour, count in sorted(hourly_dict.items())
    ]

    return MetricsSummary(
        total_incidents=total,
        today_incidents=today_count,
        violations_by_type=violations_map,
        top_violation=top_violation,
        hourly_distribution=hourly_distribution
    )
