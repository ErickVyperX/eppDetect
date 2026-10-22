import unittest
from fastapi.testclient import TestClient

# Asegurar importación compatible tanto con 'backend.main' como 'main'
try:
    from backend.main import app
except ModuleNotFoundError:
    from main import app

class TestAPIAuthAndFallback(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Usamos TestClient sin levantar el background thread del motor de video
        cls.client = TestClient(app)

    def test_protected_endpoints_return_401_without_token(self):
        # 1. GET /api/incidents
        res_incidents = self.client.get("/api/incidents")
        self.assertEqual(res_incidents.status_code, 401, f"Expected 401 for /api/incidents, got {res_incidents.status_code}")

        # 2. GET /api/stream/status
        res_stream_status = self.client.get("/api/stream/status")
        self.assertEqual(res_stream_status.status_code, 401, f"Expected 401 for /api/stream/status, got {res_stream_status.status_code}")

        # 3. POST /api/stream/start
        res_stream_start = self.client.post("/api/stream/start", json={"source_id": "webcam_0"})
        self.assertEqual(res_stream_start.status_code, 401, f"Expected 401 for /api/stream/start, got {res_stream_start.status_code}")

    def test_protected_endpoint_rejects_invalid_token(self):
        headers = {"Authorization": "Bearer invalid_fake_token_12345"}
        res = self.client.get("/api/incidents", headers=headers)
        self.assertEqual(res.status_code, 401)

    def test_api_nonexistent_returns_404_json_not_html(self):
        res = self.client.get("/api/nonexistent")
        self.assertEqual(res.status_code, 404)
        
        # Debe responder con JSON, no con HTML de index.html
        content_type = res.headers.get("content-type", "")
        self.assertIn("application/json", content_type)
        data = res.json()
        self.assertIn("detail", data)

    def test_security_headers_present(self):
        res = self.client.get("/api/nonexistent")
        self.assertEqual(res.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(res.headers.get("X-Frame-Options"), "DENY")
        self.assertEqual(res.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")

if __name__ == "__main__":
    unittest.main()
