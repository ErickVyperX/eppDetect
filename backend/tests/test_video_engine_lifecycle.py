import unittest
import sys
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import cv2
import numpy as np
from app.services.video_engine import VideoEngine, _CameraStreamReader
from app.core.config import settings
import app.api.stream_router as stream_module
from app.api.stream_router import get_connected_cameras


class TestVideoEngineLifecycle(unittest.TestCase):
    """Pruebas unitarias para el ciclo de vida del motor de video, trackers y captura."""

    def setUp(self):
        self.engine = VideoEngine()

    def tearDown(self):
        if self.engine.is_running:
            self.engine.stop()

    def test_start_deletes_predictor_trackers_attribute(self):
        """Verifica que start() elimine el atributo predictor.trackers en vez de dejarlo como lista vacía []."""
        mock_model = MagicMock()
        mock_predictor = MagicMock()
        # Simular que existían trackers previos
        mock_predictor.trackers = ["tracker_objeto_1", "tracker_objeto_2"]
        mock_model.predictor = mock_predictor
        self.engine.model = mock_model

        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True

        with patch.object(self.engine, "_open_capture", return_value=mock_cap), \
             patch.object(self.engine, "_process_loop", return_value=None):
            self.engine.start(source=0, source_name="Cámara Test")

            # El atributo 'trackers' debe haber sido eliminado completamente (no una lista vacía)
            self.assertFalse(
                hasattr(self.engine.model.predictor, "trackers"),
                "El atributo predictor.trackers debe eliminarse para que Ultralytics lo recree limpiamente."
            )

    def test_start_stop_start_lifecycle(self):
        """Verifica que el ciclo start -> stop -> start funcione correctamente sin excepciones."""
        mock_model = MagicMock()
        self.engine.model = mock_model

        mock_cap1 = MagicMock()
        mock_cap1.isOpened.return_value = True
        mock_cap2 = MagicMock()
        mock_cap2.isOpened.return_value = True

        with patch.object(self.engine, "_open_capture", side_effect=[mock_cap1, mock_cap2]):
            def fake_loop(cap, stop_event):
                while not stop_event.is_set():
                    time.sleep(0.01)

            with patch.object(self.engine, "_process_loop", side_effect=fake_loop):
                # 1. Primer inicio
                self.engine.start(source=0, source_name="Cam 1")
                self.assertTrue(self.engine.is_running)
                self.assertIsNotNone(self.engine.cap)

                # 2. Detención
                self.engine.stop()
                self.assertFalse(self.engine.is_running)
                self.assertIsNone(self.engine._thread)
                self.assertIsNone(self.engine.cap)
                self.assertEqual(self.engine.current_fps, 0.0)

                # 3. Segundo inicio (no debe lanzar excepción ni colisionar)
                self.engine.start(source=1, source_name="Cam 2")
                self.assertTrue(self.engine.is_running)
                self.assertIsNotNone(self.engine.cap)

                # Detención final
                self.engine.stop()
                self.assertFalse(self.engine.is_running)

    def test_start_raises_runtime_error_if_thread_still_alive(self):
        """Verifica que start() lance RuntimeError si el hilo previo no finaliza tras stop()."""
        self.engine.model = MagicMock()

        # Simular un hilo rebelde que no muere tras stop()
        mock_thread = MagicMock()
        mock_thread.is_alive.return_value = True
        self.engine._thread = mock_thread

        with patch.object(self.engine, "stop"):
            # stop() es llamado pero el hilo sigue vivo
            with self.assertRaises(RuntimeError) as ctx:
                self.engine.start(source=0)
            self.assertIn("sigue vivo tras stop", str(ctx.exception))

    def test_open_capture_configures_properties_and_checks_frames(self):
        """Verifica que _open_capture configure MJPG, ancho/alto, buffersize y descarte frames."""
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        test_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        mock_cap.read.return_value = (True, test_frame)

        with patch("cv2.VideoCapture", return_value=mock_cap) as mock_vc:
            cap = self.engine._open_capture(0)
            self.assertIsNotNone(cap)
            self.assertEqual(cap, mock_cap)

            # Verificar que intentó primero con CAP_MSMF
            mock_vc.assert_any_call(0, cv2.CAP_MSMF)

            # Verificar configuración de propiedades
            mock_cap.set.assert_any_call(cv2.CAP_PROP_FRAME_WIDTH, settings.CAMERA_WIDTH)
            mock_cap.set.assert_any_call(cv2.CAP_PROP_FRAME_HEIGHT, settings.CAMERA_HEIGHT)
            mock_cap.set.assert_any_call(cv2.CAP_PROP_BUFFERSIZE, 1)

            # Debe haber leído frames de calentamiento más la prueba
            self.assertGreaterEqual(mock_cap.read.call_count, 6)

    def test_process_loop_fallback_to_predict_on_tracking_error(self):
        """Verifica que si model.track lanza excepción, se active el fallback a model.predict sin alertas."""
        mock_model = MagicMock()
        # model.track falla
        mock_model.track.side_effect = IndexError("list index out of range")

        # model.predict provee la caja sin track_id
        mock_box = MagicMock()
        mock_box.cls = [MagicMock(item=lambda: 0)]
        mock_box.conf = [MagicMock(item=lambda: 0.95)]
        mock_box.xyxy = [MagicMock(cpu=lambda: MagicMock(numpy=lambda: np.array([10, 20, 80, 90])))]
        mock_box.id = None  # Sin track_id

        mock_pred_res = MagicMock()
        mock_pred_res.boxes = [mock_box]
        mock_model.predict.return_value = [mock_pred_res]
        mock_model.names = {0: "sin_casco"}
        self.engine.model = mock_model

        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

        stop_ev = threading.Event()

        # El primer read da frame, el segundo detiene el bucle
        def side_read():
            if not stop_ev.is_set():
                stop_ev.set()
                return True, dummy_frame
            return False, None

        mock_cap.read.side_effect = side_read

        with patch.object(self.engine._executor, "submit") as mock_submit:
            self.engine._process_loop(mock_cap, stop_ev)

            # Verificaciones
            mock_model.track.assert_called()
            mock_model.predict.assert_called()
            # Al no tener track_id, no debe emitir alerta ni llamar a submit
            mock_submit.assert_not_called()
            # Al salir del bucle, _current_jpeg debe ser None
            self.assertIsNone(self.engine._current_jpeg)
            self.assertEqual(self.engine.current_fps, 0.0)

    def test_consecutive_read_failures_attempts_reopen_and_exits(self):
        """Verifica que tras 30 fallos seguidos de read() se intente reabrir la cámara y si falla termine el bucle limpiamente."""
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        # Simular 30 fallos de lectura consecutivos
        mock_cap.read.return_value = (False, None)

        self.engine.current_source = 0
        stop_ev = threading.Event()

        # Parchear time.sleep para que la prueba se ejecute instantáneamente
        with patch("time.sleep", return_value=None), \
             patch.object(self.engine, "_open_capture", return_value=None) as mock_reopen:

            self.engine._process_loop(mock_cap, stop_ev)

            # Debe haber intentado reabrir la cámara exactamente una vez al llegar al fallo 30
            mock_reopen.assert_called_once_with(0)
            # Al salir del bucle, los recursos deben estar limpios
            self.assertIsNone(self.engine._current_jpeg)
            self.assertEqual(self.engine.current_fps, 0.0)

    def test_stream_router_cameras_skips_active_source_and_caches(self):
        """Verifica que /cameras no reabra la cámara en uso si el motor está corriendo y use caché 30s."""
        # Limpiar caché previa
        stream_module._CAMERAS_CACHE = None
        stream_module._CAMERAS_CACHE_TIME = 0.0

        mock_user = MagicMock()

        with patch("app.api.stream_router.video_engine") as mock_ve, \
             patch("cv2.VideoCapture") as mock_vc:

            # Simular motor activo en cámara índice 0
            mock_ve.is_running = True
            mock_ve.current_source = 0

            # VideoCapture solo debería ser consultado para índices 1, 2, 3
            mock_cap = MagicMock()
            mock_cap.isOpened.return_value = False
            mock_vc.return_value = mock_cap

            cams = get_connected_cameras(current_user=mock_user)

            # Debe contener cam_0 agregada directamente sin abrir captura
            cam_ids = [c["id"] for c in cams]
            self.assertIn("cam_0", cam_ids)

            # Ninguna llamada a VideoCapture con (0, cv2.CAP_DSHOW) debió ocurrir
            for call_args in mock_vc.call_args_list:
                args, _ = call_args
                if len(args) > 0:
                    self.assertNotEqual(args[0], 0, "No debe abrirse el índice 0 mientras el motor está activo")

            # Segunda llamada dentro de 30s debe provenir de caché sin tocar cv2.VideoCapture
            mock_vc.reset_mock()
            cams_cached = get_connected_cameras(current_user=mock_user)
            self.assertEqual(cams, cams_cached)
            mock_vc.assert_not_called()

    def test_standby_frame_cached_and_packet_sequence(self):
        """Verifica que el frame standby esté pre-cacheado y que get_latest_frame_packet controle la secuencia."""
        jpeg_bytes, seq_initial, is_live = self.engine.get_latest_frame_packet()
        self.assertFalse(is_live)
        self.assertGreater(len(jpeg_bytes), 100)
        self.assertEqual(jpeg_bytes, self.engine._standby_jpeg)

        # Simular nuevo frame en vivo
        with self.engine._lock:
            self.engine._current_jpeg = b"fake_live_jpeg"
            self.engine._frame_seq += 1

        live_bytes, seq_live, is_live_now = self.engine.get_latest_frame_packet()
        self.assertTrue(is_live_now)
        self.assertEqual(live_bytes, b"fake_live_jpeg")
        self.assertEqual(seq_live, seq_initial + 1)

    def test_camera_stream_reader_delivers_latest_frame(self):
        """Verifica que _CameraStreamReader lea asíncronamente el último fotograma disponible."""
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        frame = np.ones((480, 640, 3), dtype=np.uint8) * 128
        mock_cap.read.return_value = (True, frame)

        stop_ev = threading.Event()
        reader = _CameraStreamReader(mock_cap, stop_ev)
        try:
            ret, captured = reader.read()
            self.assertTrue(ret)
            self.assertIsNotNone(captured)
            self.assertEqual(captured.shape, (480, 640, 3))
        finally:
            reader.stop()


if __name__ == "__main__":
    unittest.main()
