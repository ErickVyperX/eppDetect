import uuid
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text
from app.database import Base
from app.core.timezone import get_lima_now_naive

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(150), nullable=False)
    role = Column(String(50), default="supervisor", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=get_lima_now_naive, nullable=False)

class Incident(Base):
    __tablename__ = "incidents"

    # UUID único para cada incidencia
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp = Column(DateTime, default=get_lima_now_naive, index=True, nullable=False)
    track_id = Column(Integer, index=True, nullable=False)
    violation_type = Column(String(50), index=True, nullable=False)  # sin_casco, sin_chaleco, sin_guantes
    confidence = Column(Float, nullable=False)
    frame_path = Column(String(500), nullable=False)  # Ruta al archivo .jpg guardado
    source_name = Column(String(100), default="Cámara Principal", nullable=False)
    resolved = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)
