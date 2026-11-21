import { STATUS_CODES, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { performance } from "node:perf_hooks";
import type { Commentary, Match } from "@prisma/client";
import { ipKeyGenerator } from "express-rate-limit";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { isBlockedBot } from "../security.js";

const UPGRADE_WINDOW_MS = 2_000;
const MAX_UPGRADES_PER_WINDOW = 5;
const MAX_TRACKED_CLIENTS = 10_000;
const MAX_SOCKETS_PER_CLIENT = 20;
const MAX_SOCKETS = 1_000;
const MAX_BUFFERED_BYTES = 256 * 1024;

const MAX_SUBSCRIPTIONS_PER_SOCKET = 100;
const COMMAND_WINDOW_MS = 10_000;
const MAX_COMMANDS_PER_WINDOW = 100;

const commandSchema = z.object({
  type: z.enum(["subscribe", "unsubscribe"]),
  matchId: z.int32().positive(),
});

function sendMessage(socket: WebSocket, message: string, bytes: number) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount + bytes > MAX_BUFFERED_BYTES) {
    socket.terminate();
    return;
  }
  socket.send(message);
}

function sendJson(socket: WebSocket, payload: object) {
  const message = JSON.stringify(payload);
  sendMessage(socket, message, Buffer.byteLength(message));
}

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
  const matchSubscribers = new Map<number, Set<WebSocket>>();

  function unsubscribe(matchId: number, socket: WebSocket) {
    const subscribers = matchSubscribers.get(matchId);
    if (!subscribers) return;

    subscribers.delete(socket);
    if (subscribers.size === 0) matchSubscribers.delete(matchId);
  }


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
      (time) => now - time < UPGRADE_WINDOW_MS,
    );
    if (recent.length >= MAX_UPGRADES_PER_WINDOW) {
      rejectUpgrade(
        socket,
        429,
        Math.ceil((recent[0] + UPGRADE_WINDOW_MS - now) / 1000),
      );
      return;
    }
    if (!attempts.has(client) && attempts.size >= MAX_TRACKED_CLIENTS) {
      rejectUpgrade(socket, 503, 2);
      return;
    }
    attempts.set(client, [...recent, now]);

    const { origin, "user-agent": userAgent } = request.headers;
    if (
      isBlockedBot(userAgent) ||
      (allowedOrigins.size && !allowedOrigins.has(origin ?? ""))
    ) {
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

    const subscriptions = new Set<number>();
    let commandWindowStart = performance.now();
    let commandCount = 0;

    socket.on("message", (data, isBinary) => {
      const now = performance.now();
      if (now - commandWindowStart >= COMMAND_WINDOW_MS) {
        commandWindowStart = now;
        commandCount = 0;
      }
      if (++commandCount > MAX_COMMANDS_PER_WINDOW) {
        socket.terminate();
        return;
      }

      if (isBinary) {
        sendJson(socket, { type: "error", message: "Expected a JSON text message" });
        return;
      }

      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        sendJson(socket, { type: "error", message: "Invalid JSON" });
        return;
      }

      const command = commandSchema.safeParse(message);
      if (!command.success) {
        sendJson(socket, { type: "error", message: "Invalid subscription command" });
        return;
      }

      const { type, matchId } = command.data;
      if (type === "unsubscribe") {
        unsubscribe(matchId, socket);
        subscriptions.delete(matchId);
        sendJson(socket, { type: "unsubscribed", matchId });
        return;
      }

      if (!subscriptions.has(matchId) && subscriptions.size >= MAX_SUBSCRIPTIONS_PER_SOCKET) {
        sendJson(socket, { type: "error", message: "Subscription limit reached" });
        return;
      }

      let subscribers = matchSubscribers.get(matchId);
      if (!subscribers) {
        subscribers = new Set<WebSocket>();
        matchSubscribers.set(matchId, subscribers);
      }
      subscribers.add(socket);
      subscriptions.add(matchId);
      sendJson(socket, { type: "subscribed", matchId });
    });

    socket.once("close", () => {
      for (const matchId of subscriptions) unsubscribe(matchId, socket);
    });
    socket.on("error", () => socket.terminate());
    sendJson(socket, { type: "welcome" });
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

  function broadcast(clients: Iterable<WebSocket>, payload: object) {
    const message = JSON.stringify(payload);
    const bytes = Buffer.byteLength(message);
    for (const client of clients) sendMessage(client, message, bytes);
  }

  function broadcastMatchCreated(match: Match) {
    broadcast(wss.clients, { type: "match_created", data: match });
  }

  function broadcastCommentary(matchId: number, commentary: Commentary) {
    const subscribers = matchSubscribers.get(matchId);
    if (subscribers) broadcast(subscribers, { type: "commentary", data: commentary });
  }

  return { broadcastMatchCreated, broadcastCommentary };
}
