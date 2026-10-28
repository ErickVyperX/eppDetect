import unittest
import sys
from pathlib import Path
from datetime import datetime, timezone
from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.schemas.auth import UserResponse
from app.schemas.incident import IncidentResponse, MetricsSummary, ViolationCount

# Clase simulada de objeto ORM para probar from_attributes=True
class MockUserORM:
    def __init__(self, id, email, full_name, role, is_active):
        self.id = id
        self.email = email
        self.full_name = full_name
        self.role = role
        self.is_active = is_active

class MockIncidentORM:
    def __init__(self, id, timestamp, track_id, violation_type, confidence, frame_url, source_name, resolved, notes=None):
        self.id = id
        self.timestamp = timestamp
        self.track_id = track_id
        self.violation_type = violation_type
        self.confidence = confidence
        self.frame_url = frame_url
        self.source_name = source_name
        self.resolved = resolved
        self.notes = notes

class TestPydanticV2Schemas(unittest.TestCase):
    def test_user_response_from_attributes(self):
        orm_user = MockUserORM(
            id=1,
            email="supervisor@obra.pe",
            full_name="Carlos Supervisor",
            role="supervisor",
            is_active=True,
        )

        user_resp = UserResponse.model_validate(orm_user)
        self.assertEqual(user_resp.id, 1)
        self.assertEqual(user_resp.email, "supervisor@obra.pe")
        self.assertEqual(user_resp.full_name, "Carlos Supervisor")
        self.assertEqual(user_resp.role, "supervisor")
        self.assertTrue(user_resp.is_active)

    def test_user_response_from_dict(self):
        data = {
            "id": 2,
            "email": "admin@obra.pe",
            "full_name": "Administrador General",
            "role": "admin",
            "is_active": True,
        }
        user_resp = UserResponse.model_validate(data)
        self.assertEqual(user_resp.id, 2)
        self.assertEqual(user_resp.role, "admin")

    def test_incident_response_from_attributes(self):
        now = datetime.now(timezone.utc)
        orm_incident = MockIncidentORM(
            id="550e8400-e29b-41d4-a716-446655440000",
            timestamp=now,
            track_id=42,
            violation_type="sin_casco",
            confidence=0.88,
            frame_url="/api/v1/incidents/550e8400-e29b-41d4-a716-446655440000/frame",
            source_name="Cámara 0 (Acceso Principal)",
            resolved=False,
            notes=None,
        )

        inc_resp = IncidentResponse.model_validate(orm_incident)
        self.assertEqual(inc_resp.id, "550e8400-e29b-41d4-a716-446655440000")
        self.assertEqual(inc_resp.track_id, 42)
        self.assertEqual(inc_resp.violation_type, "sin_casco")
        self.assertAlmostEqual(inc_resp.confidence, 0.88)
        self.assertFalse(inc_resp.resolved)

    def test_violation_count_schema(self):
        vc = ViolationCount(violation_type="sin_chaleco", count=15)
        self.assertEqual(vc.violation_type, "sin_chaleco")
        self.assertEqual(vc.count, 15)

        # Validación de tipos: count debe ser entero
        with self.assertRaises(ValidationError):
            ViolationCount(violation_type="sin_chaleco", count="no_es_numero")

    def test_metrics_summary_schema(self):
        summary_data = {
            "total_incidents": 50,
            "today_incidents": 12,
            "violations_by_type": {
                "sin_casco": 25,
                "sin_chaleco": 15,
                "sin_guantes": 10,
            },
            "top_violation": "sin_casco",
            "hourly_distribution": [
                {"hour": "08:00", "count": 3},
                {"hour": "09:00", "count": 5},
            ],
        }

        metrics = MetricsSummary.model_validate(summary_data)
        self.assertEqual(metrics.total_incidents, 50)
        self.assertEqual(metrics.today_incidents, 12)
        self.assertEqual(metrics.top_violation, "sin_casco")
        self.assertEqual(metrics.violations_by_type["sin_casco"], 25)
        self.assertEqual(len(metrics.hourly_distribution), 2)

if __name__ == "__main__":
    unittest.main()
