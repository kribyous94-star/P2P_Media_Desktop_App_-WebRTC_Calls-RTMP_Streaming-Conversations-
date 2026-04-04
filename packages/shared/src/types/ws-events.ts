// Tous les événements WebSocket entre client et serveur
// Séparation stricte : chat | webrtc | rtmp-control

import type { Message } from "./message.js";
import type { SignalMessage } from "./webrtc.js";
import type { RtmpState } from "./rtmp.js";
import type { UserRole } from "./user.js";
import type { Permission } from "./conversation.js";

// ---- Événements envoyés par le CLIENT ----
export type ClientEventType =
  | "auth"
  | "join_conversation"
  | "leave_conversation"
  | "chat:message"
  | "webrtc:signal"
  | "rtmp:status_request";

// ---- Événements envoyés par le SERVEUR ----
export type ServerEventType =
  | "auth:success"
  | "auth:error"
  | "chat:message"
  | "chat:history"
  | "webrtc:signal"
  | "rtmp:state_update"
  | "conversation:added"
  | "conversation:member_joined"
  | "conversation:member_left"
  | "error";

export interface WsClientEvent {
  type: ClientEventType;
  payload: unknown;
}

export interface WsServerEvent {
  type: ServerEventType;
  payload: unknown;
}

// Payload d'une conversation ajoutée (reçu par le nouveau membre)
export interface ConversationAddedPayload {
  id: string; name: string; type: string; ownerId: string;
  userRole: UserRole; permissions: Permission[];
  createdAt: string; updatedAt: string;
}

// Payloads typés pour chaque event serveur
export type ServerPayloadMap = {
  "auth:success": { userId: string; username: string };
  "auth:error": { message: string };
  "chat:message": Message;
  "chat:history": { conversationId: string; messages: Message[] };
  "webrtc:signal": SignalMessage;
  "rtmp:state_update": RtmpState;
  "conversation:added": ConversationAddedPayload;
  "conversation:member_joined": { conversationId: string; userId: string; username: string };
  "conversation:member_left": { conversationId: string; userId: string };
  "error": { code: string; message: string };
};
