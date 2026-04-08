import type { WebSocket } from "ws";
import { connectionRegistry } from "../../websocket/registry.js";
import type { SignalMessage } from "@p2p/shared";

/**
 * Registre des participants actifs par conversation.
 * Clé = conversationId, valeur = liste ordonnée de { userId, callerName }.
 */
interface Participant { userId: string; callerName: string; }
const callRegistry = new Map<string, Participant[]>();

function broadcastCallState(
  conversationId: string,
  newcomer:       string | null,
  callerName?:    string,
) {
  const participants = (callRegistry.get(conversationId) ?? []).map((p) => p.userId);
  connectionRegistry.broadcastToConversation(conversationId, {
    type:    "call:state_update",
    payload: { conversationId, participants, newcomer, callerName },
  });
}

export function handleWebRTCSignal(
  connectionId: string,
  userId: string,
  socket: WebSocket,
  payload: unknown,
) {
  const signal = payload as Partial<SignalMessage>;

  if (!signal.type || !signal.conversationId) {
    socket.send(JSON.stringify({
      type:    "error",
      payload: { code: "INVALID_SIGNAL", message: "type and conversationId are required" },
    }));
    return;
  }

  // Verify sender is in the WS room
  if (!connectionRegistry.getConversations(connectionId).includes(signal.conversationId)) {
    socket.send(JSON.stringify({
      type:    "error",
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

  // ---- call-announce : rejoindre la salle d'appel ----
  if (signal.type === "call-announce") {
    const { callerName } = (signal.payload as { callerName?: string }) ?? {};
    const list = callRegistry.get(signal.conversationId) ?? [];
    if (!list.find((p) => p.userId === userId)) {
      list.push({ userId, callerName: callerName ?? userId });
      callRegistry.set(signal.conversationId, list);
    }
    broadcastCallState(signal.conversationId, userId, callerName);
    return; // état diffusé via call:state_update — pas de signal webrtc:signal à router
  }

  // ---- call-leave : quitter sans forcer les autres ----
  if (signal.type === "call-leave") {
    const list = callRegistry.get(signal.conversationId) ?? [];
    const filtered = list.filter((p) => p.userId !== userId);
    if (filtered.length === 0) {
      callRegistry.delete(signal.conversationId);
    } else {
      callRegistry.set(signal.conversationId, filtered);
    }
    // Diffuser le signal aux pairs pour qu'ils ferment leur PC
    connectionRegistry.broadcastToConversation(signal.conversationId, {
      type:    "webrtc:signal",
      payload: outgoing,
    }, connectionId);
    broadcastCallState(signal.conversationId, null);
    return;
  }

  // ---- Routage standard ----
  if (outgoing.toPeerId) {
    connectionRegistry.sendToUser(outgoing.toPeerId, { type: "webrtc:signal", payload: outgoing });
  } else {
    connectionRegistry.broadcastToConversation(outgoing.conversationId, {
      type:    "webrtc:signal",
      payload: outgoing,
    }, connectionId);
  }
}

/**
 * Appelé lors de la déconnexion WS d'un utilisateur.
 * Retire cet utilisateur de tous les appels actifs et notifie les participants.
 */
export function cleanupUserCalls(userId: string) {
  for (const [convId, participants] of callRegistry.entries()) {
    const idx = participants.findIndex((p) => p.userId === userId);
    if (idx !== -1) {
      participants.splice(idx, 1);
      if (participants.length === 0) {
        callRegistry.delete(convId);
      } else {
        broadcastCallState(convId, null);
      }
    }
  }
}
