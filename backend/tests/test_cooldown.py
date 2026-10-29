import unittest
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.cooldown_manager import CooldownManager, cooldown_manager


class TestCooldownManager(unittest.TestCase):
    def setUp(self):
        self.manager = CooldownManager(cooldown_seconds=60.0)
        cooldown_manager.reset()

    def test_first_trigger_true_and_subsequent_false_within_cooldown(self):
        t0 = 1000.0
        # Primer llamado debe retornar True
        res1 = self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0)
        self.assertTrue(res1)

        # Inmediatamente después (mismo segundo) debe retornar False
        res2 = self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0)
        self.assertFalse(res2)

        # 30 segundos después (dentro de ventana de 60s) debe seguir retornando False
        res3 = self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0 + 30.0)
        self.assertFalse(res3)

        # 60.1 segundos después (fuera de cooldown) debe retornar True nuevamente
        res4 = self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0 + 60.1)
        self.assertTrue(res4)

    def test_multiple_violations_independent_for_same_track(self):
        t0 = 1000.0
        # Sin casco dispara
        self.assertTrue(self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0))
        # Sin chaleco en el mismo track debe disparar también (son tipos distintos)
        self.assertTrue(self.manager.should_trigger_incident(track_id=1, violation_type="NO-Safety-Vest", current_time=t0))
        # Repetición de sin casco dentro de cooldown debe suprimirse
        self.assertFalse(self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0 + 5.0))

    def test_reset_clears_all_cooldowns(self):
        t0 = 1000.0
        self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0)
        # En cooldown
        self.assertFalse(self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0 + 10.0))

        # Reset explícito
        self.manager.reset()

        # Debe permitir disparar de nuevo inmediatamente a t0 + 10.0
        self.assertTrue(self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0 + 10.0))

    def test_different_tracks_do_not_interfere(self):
        t0 = 1000.0
        self.assertTrue(self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0))
        self.assertTrue(self.manager.should_trigger_incident(track_id=2, violation_type="NO-Hardhat", current_time=t0))

    def test_clean_old_tracks_removes_expired_records(self):
        t0 = 1000.0
        self.manager.should_trigger_incident(track_id=10, violation_type="NO-Hardhat", current_time=t0)
        key = (10, "NO-Hardhat")
        self.assertIn(key, self.manager._tracks)

        # Limpiar con tiempo menor al timeout (180s por defecto)
        self.manager.clean_old_tracks(current_time=t0 + 100.0)
        self.assertIn(key, self.manager._tracks)

        # Limpiar con tiempo mayor al timeout (180s)
        self.manager.clean_old_tracks(current_time=t0 + 200.0)
        self.assertNotIn(key, self.manager._tracks)


if __name__ == "__main__":
    unittest.main()
