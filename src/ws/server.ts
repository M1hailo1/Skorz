import type { Server } from "node:http";
import type { Match } from "@prisma/client";
import { WebSocket, WebSocketServer } from "ws";

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function broadcast(wss: WebSocketServer, payload: unknown) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) {
      continue;
    }

    client.send(JSON.stringify(payload));
  }
}

export function attachWebSocketServer(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
  });
  const responsiveClients = new WeakSet<WebSocket>();

  wss.on("connection", (socket) => {
    responsiveClients.add(socket);
    socket.on("pong", () => {
      responsiveClients.add(socket);
    });
    sendJson(socket, { type: "welcome" });

    socket.on("error", console.error);
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (!responsiveClients.delete(socket)) {
        socket.terminate();
        continue;
      }

      socket.ping();
    }
  }, 30_000);
  wss.once("close", () => clearInterval(heartbeat));

  function broadcastMatchCreated(match: Match) {
    broadcast(wss, { type: "match_created", data: match });
  }

  return { broadcastMatchCreated };
}
