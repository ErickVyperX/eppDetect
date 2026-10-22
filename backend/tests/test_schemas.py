import unittest
from datetime import datetime, timezone
from pydantic import ValidationError
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

class MockViolationCountORM:
    def __init__(self, violation_type, count):
        self.violation_type = violation_type
        self.count = count

class TestSchemas(unittest.TestCase):
    def test_user_response_from_dict_and_attributes(self):
        # Desde dict
        user_data = {
            "id": 1,
            "email": "supervisor@safetyvision.local",
            "full_name": "Supervisor Principal",
            "role": "supervisor",
            "is_active": True
        }
        user = UserResponse.model_validate(user_data)
        self.assertEqual(user.id, 1)
        self.assertEqual(user.email, "supervisor@safetyvision.local")

        # Desde objeto con atributos (from_attributes=True)
        orm_user = MockUserORM(2, "operador@obra.pe", "Operador de Campo", "operator", True)
        user_from_orm = UserResponse.model_validate(orm_user)
        self.assertEqual(user_from_orm.id, 2)
        self.assertEqual(user_from_orm.full_name, "Operador de Campo")

    def test_incident_response_from_dict_and_attributes(self):
        now = datetime.now(timezone.utc)
        incident_data = {
            "id": "inc-uuid-12345",
            "timestamp": now,
            "track_id": 42,
            "violation_type": "NO-Hardhat",
            "confidence": 0.94,
            "frame_url": "/api/incidents/inc-uuid-12345/frame",
            "source_name": "Cámara Principal 01",
            "resolved": False,
            "notes": "Sin casco en zona de riesgo"
        }
        inc = IncidentResponse.model_validate(incident_data)
        self.assertEqual(inc.track_id, 42)
        self.assertEqual(inc.violation_type, "NO-Hardhat")
        self.assertFalse(inc.resolved)

        # Desde objeto con atributos (from_attributes=True)
        orm_inc = MockIncidentORM(
            id="inc-uuid-999",
            timestamp=now,
            track_id=10,
            violation_type="NO-Safety-Vest",
            confidence=0.88,
            frame_url="/api/incidents/inc-uuid-999/frame",
            source_name="Webcam Obra",
            resolved=True,
            notes=None
        )
        inc_from_orm = IncidentResponse.model_validate(orm_inc)
        self.assertEqual(inc_from_orm.id, "inc-uuid-999")
        self.assertEqual(inc_from_orm.confidence, 0.88)
        self.assertTrue(inc_from_orm.resolved)
        self.assertIsNone(inc_from_orm.notes)

    def test_violation_count_schema(self):
        # Desde dict
        vc_data = {"violation_type": "NO-Hardhat", "count": 15}
        vc = ViolationCount.model_validate(vc_data)
        self.assertEqual(vc.violation_type, "NO-Hardhat")
        self.assertEqual(vc.count, 15)

        # Desde atributos (from_attributes=True)
        orm_vc = MockViolationCountORM("NO-Safety-Vest", 8)
        vc_from_orm = ViolationCount.model_validate(orm_vc)
        self.assertEqual(vc_from_orm.violation_type, "NO-Safety-Vest")
        self.assertEqual(vc_from_orm.count, 8)

    def test_metrics_summary_schema(self):
        summary_data = {
            "total_incidents": 50,
            "today_incidents": 12,
            "violations_by_type": {
                "NO-Hardhat": 8,
                "NO-Safety-Vest": 4
            },
            "top_violation": "NO-Hardhat",
            "hourly_distribution": [
                {"hour": "08:00", "count": 2},
                {"hour": "09:00", "count": 5}
            ]
        }
        summary = MetricsSummary.model_validate(summary_data)
        self.assertEqual(summary.total_incidents, 50)
        self.assertEqual(summary.top_violation, "NO-Hardhat")
        self.assertEqual(len(summary.hourly_distribution), 2)

    def test_validation_error_on_missing_required_fields(self):
        with self.assertRaises(ValidationError):
            UserResponse.model_validate({"id": 1, "email": "missing_fields@domain.com"})

        with self.assertRaises(ValidationError):
            ViolationCount.model_validate({"violation_type": "NO-Hardhat"})

if __name__ == "__main__":
    unittest.main()
