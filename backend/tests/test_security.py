import unittest
import sys
from pathlib import Path
from datetime import timedelta

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.core.security import (
    get_password_hash,
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
)

class TestSecurity(unittest.TestCase):
    def test_password_hashing_and_verification(self):
        password = "AdminSecretPassword123!"
        hashed = get_password_hash(password)

        self.assertIsInstance(hashed, str)
        self.assertNotEqual(password, hashed)
        self.assertTrue(hashed.startswith("$2b$") or hashed.startswith("$2a$"))

        # Verificación correcta
        self.assertTrue(verify_password(password, hashed))

        # Contraseña errónea debe ser rechazada
        self.assertFalse(verify_password("WrongPassword999", hashed))

    def test_hash_password_alias(self):
        # Verifica que hash_password sea un alias compatible de get_password_hash
        pwd = "TestPassword456"
        hashed = hash_password(pwd)
        self.assertTrue(verify_password(pwd, hashed))

    def test_create_and_decode_valid_access_token(self):
        token = create_access_token(subject="42", expires_delta=timedelta(minutes=15))

        self.assertIsInstance(token, str)
        payload = decode_token(token)

        self.assertIsNotNone(payload)
        self.assertEqual(payload.get("sub"), "42")
        self.assertIn("exp", payload)

    def test_decode_expired_token_returns_none(self):
        # Token con delta negativo (-5 minutos)
        expired_token = create_access_token(subject="99", expires_delta=timedelta(minutes=-5))

        payload = decode_token(expired_token)
        self.assertIsNone(payload)

    def test_decode_malformed_token_returns_none(self):
        malformed_tokens = [
            "",
            "this.is.not.a.valid.jwt",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.payload",
            "Bearer valid_looking_string",
        ]
        for bad_token in malformed_tokens:
            self.assertIsNone(decode_token(bad_token))

    def test_token_with_tampered_signature_returns_none(self):
        token = create_access_token(subject="10")
        # Modificar el último caracter de la firma
        tampered_token = token[:-1] + ("A" if token[-1] != "A" else "B")

        self.assertIsNone(decode_token(tampered_token))

if __name__ == "__main__":
    unittest.main()
