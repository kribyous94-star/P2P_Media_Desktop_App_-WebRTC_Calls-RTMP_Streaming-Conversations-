import type { WebSocket } from "ws";
import type { FastifyRequest } from "fastify";
import type { WsClientEvent } from "@p2p/shared";
import { connectionRegistry } from "./registry.js";

/**
 * Point d'entrée WebSocket.
 * Chaque connexion est authentifiée via token en query param.
 * Les messages sont routés vers les handlers par type (chat | webrtc | rtmp).
 */
export async function wsHandler(socket: WebSocket, request: FastifyRequest) {
  // Phase 2 : on validera le token JWT ici
  // const token = request.query.token
  // const user = await verifyToken(token)

  const connectionId = crypto.randomUUID();
  connectionRegistry.add(connectionId, socket);

  console.log(`[WS] Client connected: ${connectionId}`);

  socket.on("message", (raw: Buffer) => {
    let event: WsClientEvent;

    try {
      event = JSON.parse(raw.toString()) as WsClientEvent;
    } catch {
      socket.send(JSON.stringify({ type: "error", payload: { code: "INVALID_JSON", message: "Invalid message format" } }));
      return;
    }

    routeEvent(connectionId, socket, event);
  });

  socket.on("close", () => {
    connectionRegistry.remove(connectionId);
    console.log(`[WS] Client disconnected: ${connectionId}`);
  });

  socket.on("error", (err) => {
    console.error(`[WS] Error on ${connectionId}:`, err);
    connectionRegistry.remove(connectionId);
  });
}

function routeEvent(connectionId: string, socket: WebSocket, event: WsClientEvent) {
  switch (event.type) {
    case "auth":
      // Phase 2
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
        payload: { code: "UNKNOWN_EVENT", message: `Unknown event type` },
      }));
  }
}
