import json
import asyncio
from typing import List
from fastapi import WebSocket

class WebSocketConnectionManager:
    """Administrador de conexiones WebSocket para difusión de alertas en tiempo real"""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self._loop: asyncio.AbstractEventLoop = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        """Envía mensaje a todos los clientes conectados de forma asíncrona"""
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                dead_connections.append(connection)
        for dead in dead_connections:
            self.disconnect(dead)

    def broadcast_from_sync(self, message: dict):
        """Permite enviar alertas desde hilos síncronos (como el pipeline de OpenCV)"""
        if self._loop and self._loop.is_running() and self.active_connections:
            asyncio.run_coroutine_threadsafe(self.broadcast(message), self._loop)

ws_manager = WebSocketConnectionManager()
