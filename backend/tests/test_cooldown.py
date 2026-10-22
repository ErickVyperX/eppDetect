import unittest
import time
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

        # Dentro de los 60s (ej. 30s después), debe retornar False
        res2 = self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0 + 30.0)
        self.assertFalse(res2)

        # Transcurridos 60s o más (ej. 60.1s después), debe retornar True nuevamente
        res3 = self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0 + 60.1)
        self.assertTrue(res3)

    def test_different_violations_same_track_do_not_interfere(self):
        t0 = 1000.0
        # Primer llamado para NO-Hardhat
        self.assertTrue(self.manager.should_trigger_incident(1, "NO-Hardhat", current_time=t0))

        # En el mismo instante o poco después, NO-Safety-Vest para el MISMO track debe retornar True
        self.assertTrue(self.manager.should_trigger_incident(1, "NO-Safety-Vest", current_time=t0 + 5.0))

        # Pero una repetición de NO-Hardhat sigue en cooldown (False)
        self.assertFalse(self.manager.should_trigger_incident(1, "NO-Hardhat", current_time=t0 + 10.0))

        # Y una repetición de NO-Safety-Vest sigue en cooldown (False)
        self.assertFalse(self.manager.should_trigger_incident(1, "NO-Safety-Vest", current_time=t0 + 10.0))

    def test_reset_clears_history_allowing_immediate_triggers(self):
        t0 = 1000.0
        self.assertTrue(self.manager.should_trigger_incident(1, "NO-Hardhat", current_time=t0))
        self.assertFalse(self.manager.should_trigger_incident(1, "NO-Hardhat", current_time=t0 + 5.0))

        # Ejecutar reset
        self.manager.reset()

        # Debe permitir disparar de inmediato incluso en el mismo timestamp
        self.assertTrue(self.manager.should_trigger_incident(1, "NO-Hardhat", current_time=t0 + 5.0))

    def test_singleton_cooldown_manager_reset(self):
        cooldown_manager.should_trigger_incident(99, "NO-Hardhat")
        self.assertFalse(cooldown_manager.should_trigger_incident(99, "NO-Hardhat"))
        cooldown_manager.reset()
        self.assertTrue(cooldown_manager.should_trigger_incident(99, "NO-Hardhat"))

    def test_clean_old_tracks_discards_inactive_tracks(self):
        t0 = 1000.0
        self.manager.should_trigger_incident(track_id=1, violation_type="NO-Hardhat", current_time=t0)
        self.manager.should_trigger_incident(track_id=2, violation_type="NO-Safety-Vest", current_time=t0 + 100.0)

        # Verificamos que ambos existen
        status1 = self.manager.get_track_status(1, "NO-Hardhat", current_time=t0 + 100.0)
        status2 = self.manager.get_track_status(2, "NO-Safety-Vest", current_time=t0 + 100.0)
        self.assertIsNotNone(status1)
        self.assertIsNotNone(status2)

        # En t0 + 200, track 1 tiene inactividad de 200s (> 180s). Track 2 tiene inactividad de 100s (< 180s)
        self.manager.clean_old_tracks(current_time=t0 + 200.0, max_idle=180.0)

        self.assertIsNone(self.manager.get_track_status(1, "NO-Hardhat", current_time=t0 + 200.0))
        self.assertIsNotNone(self.manager.get_track_status(2, "NO-Safety-Vest", current_time=t0 + 200.0))

if __name__ == "__main__":
    unittest.main()
