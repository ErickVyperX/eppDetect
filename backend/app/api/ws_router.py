from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, status
from sqlalchemy.orm import Session

from app.services.ws_manager import ws_manager
from app.core.config import settings
from app.database import get_db
from app.api.deps import get_current_user_from_token

router = APIRouter(tags=["WebSockets"])


@router.websocket("/ws/alerts")
async def websocket_alerts_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Canal WebSocket bidireccional para recepción de alertas sonoras y visuales en tiempo real.
    Protegido contra CSWSH mediante validación de Origin y autenticación obligatoria con token JWT.
    """
    # 1. Validar encabezado Origin para mitigar Cross-Site WebSocket Hijacking (CSWSH)
    origin = websocket.headers.get("origin")
    if origin:
        origin_clean = origin.rstrip("/")
        allowed_clean = [o.rstrip("/") for o in settings.ALLOWED_ORIGINS]
        if origin_clean not in allowed_clean:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    # 2. Validar token de sesión
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        user = get_current_user_from_token(token=token, db=db)
        if not user or not user.is_active:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 3. Conectar cliente autenticado
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
