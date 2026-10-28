import unittest
import sys
from pathlib import Path
from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.api.deps import get_current_user_from_token
from app.api.incidents_router import router as inc_router
from app.api.stream_router import router as st_router
from main import app

class TestAPIAuthAndFallback(unittest.TestCase):
    def test_auth_without_token_raises_401(self):
        """Verifica que llamadas sin token disparen HTTP 401 Unauthorized"""
        with self.assertRaises(HTTPException) as ctx:
            get_current_user_from_token(token="", db=None)
        self.assertEqual(ctx.exception.status_code, 401)

        with self.assertRaises(HTTPException) as ctx_none:
            get_current_user_from_token(token=None, db=None)
        self.assertEqual(ctx_none.exception.status_code, 401)

    def test_auth_with_invalid_token_raises_401(self):
        """Verifica que tokens alterados o ilegítimos disparen HTTP 401 Unauthorized"""
        with self.assertRaises(HTTPException) as ctx:
            get_current_user_from_token(token="invalid_token_12345", db=None)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_spa_fallback_rule(self):
        """Verifica que las rutas bajo /api/ o /ws/ sean reconocidas como no elegibles para SPA index.html"""
        api_paths = ["api/nonexistent", "api/v1/unknown", "ws/alerts/fake", "api", "ws"]
        for p in api_paths:
            is_api_or_ws = p.startswith("api/") or p.startswith("ws/") or p == "api" or p == "ws"
            self.assertTrue(is_api_or_ws, f"Path {p} should be treated as API/WS and return 404, not index.html")

        client_spa_paths = ["monitoring", "metrics", "dashboard", "settings"]
        for p in client_spa_paths:
            is_api_or_ws = p.startswith("api/") or p.startswith("ws/") or p == "api" or p == "ws"
            self.assertFalse(is_api_or_ws, f"Path {p} should be treated as frontend client route")

    def test_security_middlewares_and_auth_dependencies(self):
        """Verifica que CORSMiddleware y las dependencias de autenticación estén presentes"""
        middleware_names = [m.cls.__name__ for m in app.user_middleware]
        self.assertIn("CORSMiddleware", middleware_names)

        inc_deps = {r.path: [d.call.__name__ for d in r.dependant.dependencies] for r in inc_router.routes}
        st_deps = {r.path: [d.call.__name__ for d in r.dependant.dependencies] for r in st_router.routes}

        self.assertIn("get_current_user", inc_deps.get("/incidents", []))
        self.assertIn("get_current_user", inc_deps.get("/incidents/metrics/summary", []))
        self.assertIn("get_current_user", st_deps.get("/stream/status", []))
        self.assertIn("get_current_user", st_deps.get("/stream/start", []))

if __name__ == "__main__":
    unittest.main()
