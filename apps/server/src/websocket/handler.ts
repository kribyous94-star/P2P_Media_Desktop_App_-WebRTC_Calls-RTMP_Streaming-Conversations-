import type { WebSocket } from "ws";
import type { FastifyRequest } from "fastify";
import type { WsClientEvent } from "@p2p/shared";
import { connectionRegistry } from "./registry.js";
import { decodeToken } from "../lib/jwt.js";

export async function wsHandler(socket: WebSocket, request: FastifyRequest) {
  // Token JWT extrait du query param (les headers ne sont pas disponibles
  // lors du handshake WebSocket côté navigateur)
  const rawToken = (request.query as Record<string, string>)["token"];
  const payload = rawToken ? decodeToken(rawToken) : null;

  if (!payload) {
    socket.send(JSON.stringify({
      type: "auth:error",
      payload: { message: "Token invalide ou manquant" },
    }));
    socket.close(4001, "Unauthorized");
    return;
  }

  const connectionId = crypto.randomUUID();
  connectionRegistry.add(connectionId, socket);
  connectionRegistry.bindUser(connectionId, payload.sub);

  // Confirmer l'authentification au client
  socket.send(JSON.stringify({
    type: "auth:success",
    payload: { userId: payload.sub, username: payload.username },
  }));

  console.log(`[WS] ${payload.username} (${payload.sub}) connected — conn: ${connectionId}`);

  socket.on("message", (raw: Buffer) => {
    let event: WsClientEvent;
    try {
      event = JSON.parse(raw.toString()) as WsClientEvent;
    } catch {
      socket.send(JSON.stringify({
        type: "error",
        payload: { code: "INVALID_JSON", message: "Invalid message format" },
      }));
      return;
    }
    routeEvent(connectionId, socket, event);
  });

  socket.on("close", () => {
    connectionRegistry.remove(connectionId);
    console.log(`[WS] ${payload.username} disconnected — conn: ${connectionId}`);
  });

  socket.on("error", (err) => {
    console.error(`[WS] Error on ${connectionId}:`, err);
    connectionRegistry.remove(connectionId);
  });
}

function routeEvent(connectionId: string, socket: WebSocket, event: WsClientEvent) {
  switch (event.type) {
    case "auth":
      // Auth gérée au connect — ce message est ignoré
      break;
    case "join_conversation":
    case "leave_conversation":
      // Phase 3
      break;
    case "chat:message":
      // Phase 4
      break;
    case "webrtc:signal":
      // Phase 5
      break;
    case "rtmp:status_request":
      // Phase 10
      break;
    default:
      socket.send(JSON.stringify({
        type: "error",
        payload: { code: "UNKNOWN_EVENT", message: "Unknown event type" },
      }));
  }
}
