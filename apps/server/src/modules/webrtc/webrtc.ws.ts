import type { WebSocket } from "ws";
import { connectionRegistry } from "../../websocket/registry.js";
import type { SignalMessage } from "@p2p/shared";

export function handleWebRTCSignal(
  connectionId: string,
  userId: string,
  socket: WebSocket,
  payload: unknown
) {
  const signal = payload as Partial<SignalMessage>;

  if (!signal.type || !signal.conversationId) {
    socket.send(JSON.stringify({
      type: "error",
      payload: { code: "INVALID_SIGNAL", message: "type and conversationId are required" },
    }));
    return;
  }

  // Verify sender is in the WS room
  if (!connectionRegistry.getConversations(connectionId).includes(signal.conversationId)) {
    socket.send(JSON.stringify({
      type: "error",
      payload: { code: "NOT_IN_ROOM", message: "Join the conversation first" },
    }));
    return;
  }

  // Always override fromPeerId with the authenticated userId (never trust the client)
  const outgoing: SignalMessage = {
    type:           signal.type,
    conversationId: signal.conversationId,
    fromPeerId:     userId,
    toPeerId:       signal.toPeerId,
    payload:        signal.payload ?? {},
  };

  if (outgoing.toPeerId) {
    // Route to a specific peer (1:1 signaling)
    connectionRegistry.sendToUser(outgoing.toPeerId, { type: "webrtc:signal", payload: outgoing });
  } else {
    // Broadcast to the whole conversation room except sender
    connectionRegistry.broadcastToConversation(outgoing.conversationId, {
      type:    "webrtc:signal",
      payload: outgoing,
    }, connectionId);
  }
}
