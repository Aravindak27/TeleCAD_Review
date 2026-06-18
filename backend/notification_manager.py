from fastapi import WebSocket
from typing import Dict, Set

class ConnectionManager:
    """Manages active WebSocket connections mapped by user ID."""
    def __init__(self):
        # Maps user_id (int) -> Set[WebSocket]
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: int):
        """Sends a JSON message to all active sockets of a specific user."""
        if user_id in self.active_connections:
            # Copy connection set to avoid mutation during iteration
            for connection in list(self.active_connections[user_id]):
                try:
                    await connection.send_json(message)
                except Exception:
                    self.disconnect(user_id, connection)

    async def broadcast(self, message: dict):
        """Sends a JSON message to all connected clients."""
        for user_id, connections in list(self.active_connections.items()):
            for connection in list(connections):
                try:
                    await connection.send_json(message)
                except Exception:
                    self.disconnect(user_id, connection)

# Global singleton instance
manager = ConnectionManager()
