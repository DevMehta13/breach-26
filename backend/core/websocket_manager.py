"""WebSocket connection manager (singleton).

Maintains a mapping of user_id -> list of active WebSocket connections.
Supports personal messages (to a specific user) and broadcast (to all).
"""

from __future__ import annotations

import json
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    _instance: ConnectionManager | None = None

    def __new__(cls) -> ConnectionManager:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._connections: dict[str, list[WebSocket]] = {}
        return cls._instance

    @property
    def connections(self) -> dict[str, list[WebSocket]]:
        return self._connections

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        """Accept a WebSocket and register it under the given user_id."""
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(websocket)
        logger.info("WS connected: user=%s (total=%d)", user_id, len(self._connections[user_id]))

    def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        """Remove a WebSocket from the user's connection list."""
        if user_id in self._connections:
            self._connections[user_id] = [
                ws for ws in self._connections[user_id] if ws is not websocket
            ]
            if not self._connections[user_id]:
                del self._connections[user_id]
        logger.info("WS disconnected: user=%s", user_id)

    async def send_personal_message(self, message: dict, user_id: str) -> None:
        """Send a JSON message to all connections for a specific user."""
        if user_id not in self._connections:
            return
        payload = json.dumps(message)
        dead: list[WebSocket] = []
        for ws in self._connections[user_id]:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, user_id)

    async def broadcast(self, message: dict) -> None:
        """Send a JSON message to all connected users."""
        payload = json.dumps(message)
        dead_pairs: list[tuple[WebSocket, str]] = []
        for user_id, sockets in self._connections.items():
            for ws in sockets:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead_pairs.append((ws, user_id))
        for ws, uid in dead_pairs:
            self.disconnect(ws, uid)


manager = ConnectionManager()
