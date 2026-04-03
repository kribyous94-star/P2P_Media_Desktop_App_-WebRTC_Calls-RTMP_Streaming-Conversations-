import type { WebSocket } from "ws";
import { connectionRegistry } from "../../websocket/registry.js";
import { createMessage } from "./messages.service.js";

export async function handleChatMessage(
  connectionId: string,
  userId: string,
  socket: WebSocket,
  payload: unknown
) {
  const { conversationId, content } = payload as { conversationId: string; content: string };

  if (!conversationId || typeof content !== "string" || content.trim().length === 0) {
    socket.send(JSON.stringify({
      type: "error",
      payload: { code: "INVALID_PAYLOAD", message: "conversationId and content are required" },
    }));
    return;
  }

  // Verify the user is in the WS room for this conversation
  if (!connectionRegistry.getConversations(connectionId).has(conversationId)) {
    socket.send(JSON.stringify({
      type: "error",
      payload: { code: "NOT_IN_ROOM", message: "Join the conversation first" },
    }));
    return;
  }

  try {
    const message = await createMessage(conversationId, userId, content.trim());

    // Broadcast to everyone in the room (including sender for echo)
    connectionRegistry.broadcastToConversation(conversationId, {
      type:    "chat:message",
      payload: message,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    socket.send(JSON.stringify({
      type: "error",
      payload: { code, message: "Failed to send message" },
    }));
  }
}
