import logging

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.core.config import get_settings
from backend.core.websocket_manager import manager

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()


@router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """WebSocket endpoint authenticated via JWT token in the URL path.

    The client connects to /ws/<jwt_token> and receives real-time
    events for ingestion completions, dedup updates, etc.
    """
    # Accept first, then validate — calling close() before accept()
    # causes FastAPI to reject the handshake with a generic 403.
    await websocket.accept()

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except jwt.PyJWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Register with manager (already accepted above)
    if user_id not in manager.connections:
        manager.connections[user_id] = []
    manager.connections[user_id].append(websocket)
    logger.info("WS connected: user=%s", user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception:
        manager.disconnect(websocket, user_id)
