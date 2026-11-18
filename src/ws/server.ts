import { STATUS_CODES, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { performance } from "node:perf_hooks";
import type { Match } from "@prisma/client";
import { ipKeyGenerator } from "express-rate-limit";
import { WebSocket, WebSocketServer } from "ws";
import { isBlockedBot } from "../security.js";

const UPGRADE_WINDOW_MS = 2_000;
const MAX_UPGRADES_PER_WINDOW = 5;
const MAX_TRACKED_CLIENTS = 10_000;
const MAX_SOCKETS_PER_CLIENT = 20;
const MAX_SOCKETS = 1_000;
const MAX_BUFFERED_BYTES = 256 * 1024;

function rejectUpgrade(socket: Duplex, status: number, retryAfter?: number) {
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n` +
      (retryAfter === undefined ? "" : `Retry-After: ${retryAfter}\r\n`) +
      "\r\n",
  );
}

export function attachWebSocketServer(
  server: Server,
  allowedOrigins: ReadonlySet<string> = new Set(),
) {
  const wss = new WebSocketServer({
    noServer: true,
    path: "/ws",
    maxPayload: 1024,
  });
  const responsiveClients = new WeakSet<WebSocket>();
  const attempts = new Map<string, number[]>();
  const activeSockets = new Map<string, number>();

  server.on("upgrade", (request, socket, head) => {
    const handleSocketError = () => socket.destroy();
    socket.on("error", handleSocketError);
    if (request.method !== "GET" || request.url?.split("?", 1)[0] !== "/ws") {
      rejectUpgrade(socket, 404);
      return;
    }

    const client = ipKeyGenerator(request.socket.remoteAddress ?? "unknown");
    const now = performance.now();
    const recent = (attempts.get(client) ?? []).filter(
      time => now - time < UPGRADE_WINDOW_MS,
    );
    if (recent.length >= MAX_UPGRADES_PER_WINDOW) {
      rejectUpgrade(socket, 429, Math.ceil((recent[0] + UPGRADE_WINDOW_MS - now) / 1000));
      return;
    }
    if (!attempts.has(client) && attempts.size >= MAX_TRACKED_CLIENTS) {
      rejectUpgrade(socket, 503, 2);
      return;
    }
    attempts.set(client, [...recent, now]);

    const { origin, "user-agent": userAgent } = request.headers;
    if (isBlockedBot(userAgent) || (allowedOrigins.size && !allowedOrigins.has(origin ?? ""))) {
      rejectUpgrade(socket, 403);
      return;
    }
    const active = activeSockets.get(client) ?? 0;
    if (active >= MAX_SOCKETS_PER_CLIENT) {
      rejectUpgrade(socket, 429);
      return;
    }
    if (wss.clients.size >= MAX_SOCKETS) {
      rejectUpgrade(socket, 503);
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      socket.removeListener("error", handleSocketError);
      activeSockets.set(client, active + 1);
      ws.once("close", () => {
        const remaining = (activeSockets.get(client) ?? 1) - 1;
        if (remaining === 0) activeSockets.delete(client);
        else activeSockets.set(client, remaining);
      });
      wss.emit("connection", ws, request);
    });
  });

  const pruneAttempts = setInterval(() => {
    const cutoff = performance.now() - UPGRADE_WINDOW_MS;
    for (const [client, times] of attempts) {
      if (times[times.length - 1] <= cutoff) attempts.delete(client);
    }
  }, UPGRADE_WINDOW_MS);
  pruneAttempts.unref();

  wss.on("connection", (socket) => {
    responsiveClients.add(socket);
    socket.on("pong", () => {
      responsiveClients.add(socket);
    });
    socket.on("error", () => socket.terminate());
    socket.on("message", () => socket.terminate());
    socket.send(JSON.stringify({ type: "welcome" }));
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
  heartbeat.unref();
  server.once("close", () => wss.close());
  wss.once("close", () => {
    clearInterval(heartbeat);
    clearInterval(pruneAttempts);
  });

  function broadcastMatchCreated(match: Match) {
    const message = JSON.stringify({ type: "match_created", data: match });
    const messageBytes = Buffer.byteLength(message);
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (client.bufferedAmount + messageBytes > MAX_BUFFERED_BYTES) {
        client.terminate();
        continue;
      }
      client.send(message);
    }
  }

  return { broadcastMatchCreated };
}
