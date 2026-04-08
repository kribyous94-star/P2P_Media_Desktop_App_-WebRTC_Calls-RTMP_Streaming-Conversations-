import type { WebSocket } from "ws";
import type { FastifyRequest } from "fastify";
import type { WsClientEvent } from "@p2p/shared";
import { connectionRegistry } from "./registry.js";
import { decodeToken } from "../lib/jwt.js";
import { handleJoinConversation, handleLeaveConversation } from "../modules/conversations/conversations.ws.js";
import { handleChatMessage } from "../modules/messages/messages.ws.js";
import { handleWebRTCSignal, cleanupUserCalls } from "../modules/webrtc/webrtc.ws.js";
import { handleRtmpStart, handleRtmpChunk, handleRtmpStop, stopAllRtmpStreams } from "../modules/rtmp/index.js";

export async function wsHandler(socket: WebSocket, request: FastifyRequest) {
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

  socket.send(JSON.stringify({
    type: "auth:success",
    payload: { userId: payload.sub, username: payload.username },
  }));

  console.log(`[WS] ${payload.username} connected — conn: ${connectionId}`);

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
    // Lancer async sans bloquer le handler message
    void routeEvent(connectionId, payload.sub, socket, event);
  });

  socket.on("close", () => {
    // Quitter toutes les conversations au déconnect
    connectionRegistry.getConversations(connectionId).forEach((convId) => {
      handleLeaveConversation(connectionId, payload.sub, convId);
    });
    // Retirer l'utilisateur des appels actifs
    cleanupUserCalls(payload.sub);
    // Arrêter tous les streams RTMP actifs de cet utilisateur
    stopAllRtmpStreams(payload.sub);
    connectionRegistry.remove(connectionId);
    console.log(`[WS] ${payload.username} disconnected — conn: ${connectionId}`);
  });

  socket.on("error", (err) => {
    console.error(`[WS] Error on ${connectionId}:`, err);
    connectionRegistry.remove(connectionId);
  });
}

async function routeEvent(
  connectionId: string,
  userId: string,
  socket: WebSocket,
  event: WsClientEvent
) {
  switch (event.type) {
    case "auth":
      break; // Auth gérée au connect

    case "join_conversation": {
      const { conversationId } = event.payload as { conversationId: string };
      await handleJoinConversation(connectionId, userId, conversationId, socket);
      break;
    }
    case "leave_conversation": {
      const { conversationId } = event.payload as { conversationId: string };
      handleLeaveConversation(connectionId, userId, conversationId);
      break;
    }

    case "chat:message":
      await handleChatMessage(connectionId, userId, socket, event.payload);
      break;

    case "webrtc:signal":
      handleWebRTCSignal(connectionId, userId, socket, event.payload);
      break;

    case "rtmp:start":
      handleRtmpStart(connectionId, userId, socket, event.payload);
      break;

    case "rtmp:chunk":
      handleRtmpChunk(connectionId, userId, socket, event.payload);
      break;

    case "rtmp:stop":
      handleRtmpStop(connectionId, userId, socket, event.payload);
      break;

    case "rtmp:status_request":
      break;

    case "ping":
      break; // heartbeat client — maintient la connexion nginx

    default:
      socket.send(JSON.stringify({
        type: "error",
        payload: { code: "UNKNOWN_EVENT", message: "Unknown event type" },
      }));
  }
}
