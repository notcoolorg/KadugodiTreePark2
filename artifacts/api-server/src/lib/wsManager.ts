import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { URL } from "url";
import { handlePlayerConnect, handlePlayerDisconnect } from "./playerPresence.js";

interface Client {
  ws: WebSocket;
  roomCode: string;
  playerId: string;
}

const clients: Client[] = [];

// Grace timers before treating a disconnect as permanent
const DISCONNECT_GRACE_MS = 15_000;
const pendingDisconnects = new Map<string, ReturnType<typeof setTimeout>>();

function presenceKey(roomCode: string, playerId: string) {
  return `${roomCode}:${playerId}`;
}

function isPlayerStillConnected(roomCode: string, playerId: string): boolean {
  return clients.some(
    c => c.roomCode === roomCode && c.playerId === playerId && c.ws.readyState === WebSocket.OPEN
  );
}

export function setupWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const urlStr = req.url ?? "";
    const url = new URL(urlStr, "http://localhost");
    const roomCode = url.searchParams.get("roomCode") ?? "";
    const playerId = url.searchParams.get("playerId") ?? "";

    if (!roomCode || !playerId) {
      ws.close(1008, "Missing roomCode or playerId");
      return;
    }

    const key = presenceKey(roomCode, playerId);

    // Cancel any pending disconnect grace timer — player is back
    const pendingTimer = pendingDisconnects.get(key);
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      pendingDisconnects.delete(key);
    }

    const client: Client = { ws, roomCode, playerId };
    clients.push(client);

    // Mark player as connected in the game state
    handlePlayerConnect(roomCode, playerId);

    ws.on("close", () => {
      const idx = clients.indexOf(client);
      if (idx !== -1) clients.splice(idx, 1);

      // Only start the grace timer if the player has no other open connection
      if (!isPlayerStillConnected(roomCode, playerId)) {
        const timerId = setTimeout(() => {
          pendingDisconnects.delete(key);
          // Double-check: player might have reconnected during the grace window
          if (!isPlayerStillConnected(roomCode, playerId)) {
            handlePlayerDisconnect(roomCode, playerId);
          }
        }, DISCONNECT_GRACE_MS);

        pendingDisconnects.set(key, timerId);
      }
    });

    ws.on("error", () => {
      const idx = clients.indexOf(client);
      if (idx !== -1) clients.splice(idx, 1);
    });
  });

  return wss;
}

export function broadcastToRoom(roomCode: string, data: unknown): void {
  const message = JSON.stringify(data);
  const roomClients = clients.filter(c => c.roomCode === roomCode);
  for (const client of roomClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

export function getConnectedPlayerIds(roomCode: string): string[] {
  return clients
    .filter(c => c.roomCode === roomCode && c.ws.readyState === WebSocket.OPEN)
    .map(c => c.playerId);
}
