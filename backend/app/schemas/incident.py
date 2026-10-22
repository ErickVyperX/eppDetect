from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List, Dict

class IncidentResponse(BaseModel):
    id: str
    timestamp: datetime
    track_id: int
    violation_type: str
    confidence: float
    frame_url: str
    source_name: str
    resolved: bool
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class ViolationCount(BaseModel):
    violation_type: str
    count: int

    model_config = ConfigDict(from_attributes=True)

class MetricsSummary(BaseModel):
    total_incidents: int
    today_incidents: int
    violations_by_type: Dict[str, int]
    top_violation: Optional[str]
    hourly_distribution: List[Dict[str, int | str]]

class VideoSourceInfo(BaseModel):
    id: str
    name: str
    source_type: str  # 'webcam' o 'video_file'
    path_or_index: str | int
    is_active: bool
