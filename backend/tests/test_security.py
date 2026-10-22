import unittest
from datetime import timedelta
import jwt
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

        # Verificación errónea
        self.assertFalse(verify_password("WrongPassword!", hashed))
        self.assertFalse(verify_password("", hashed))

    def test_hash_password_alias(self):
        password = "TestPassword456"
        hashed = hash_password(password)
        self.assertTrue(verify_password(password, hashed))

    def test_create_and_decode_valid_token(self):
        subject = "testuser@safetyvision.local"
        token = create_access_token(subject=subject, expires_delta=timedelta(minutes=15))

        self.assertIsInstance(token, str)
        payload = decode_token(token)

        self.assertIsNotNone(payload)
        self.assertEqual(payload.get("sub"), subject)
        self.assertIn("exp", payload)
        self.assertIn("iat", payload)

    def test_decode_expired_token(self):
        # Crear token que ya expiró hace 5 minutos
        expired_token = create_access_token(
            subject="expired@safetyvision.local",
            expires_delta=timedelta(minutes=-5)
        )
        payload = decode_token(expired_token)
        self.assertIsNone(payload)

    def test_decode_malformed_token(self):
        malformed_tokens = [
            "invalid.token.structure",
            "not_a_jwt",
            "",
            "header.payload",
        ]
        for bad_token in malformed_tokens:
            self.assertIsNone(decode_token(bad_token))

    def test_decode_token_with_wrong_secret(self):
        # Token firmado con otra clave
        tampered_token = jwt.encode(
            {"sub": "attacker", "exp": 9999999999},
            "completely_wrong_secret_key",
            algorithm="HS256"
        )
        self.assertIsNone(decode_token(tampered_token))

if __name__ == "__main__":
    unittest.main()
