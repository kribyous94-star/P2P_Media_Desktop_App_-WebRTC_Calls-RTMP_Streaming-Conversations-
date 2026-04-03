// Tous les événements WebSocket entre client et serveur
// Séparation stricte : chat | webrtc | rtmp-control

import type { Message } from "./message.js";
import type { SignalMessage } from "./webrtc.js";
import type { RtmpState } from "./rtmp.js";

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

// Payloads typés pour chaque event serveur
export type ServerPayloadMap = {
  "auth:success": { userId: string; username: string };
  "auth:error": { message: string };
  "chat:message": Message;
  "chat:history": { conversationId: string; messages: Message[] };
  "webrtc:signal": SignalMessage;
  "rtmp:state_update": RtmpState;
  "conversation:member_joined": { conversationId: string; userId: string; username: string };
  "conversation:member_left": { conversationId: string; userId: string };
  "error": { code: string; message: string };
};
