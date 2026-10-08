import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket):
    """Canal WebSocket bidireccional para recepción de alertas sonoras y visuales en tiempo real"""
    await ws_manager.connect(websocket)
    try:
        # Enviar confirmación de conexión inicial
        await websocket.send_json({
            "type": "connected",
            "message": "Conexión en tiempo real activa con el servidor de detección EPP"
        })
        
        while True:
            # Mantener la conexión abierta y responder a posibles pings del cliente
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)
