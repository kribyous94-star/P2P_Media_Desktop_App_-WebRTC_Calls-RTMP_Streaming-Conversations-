export type MessageType = "text" | "system" | "file";

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  type: MessageType;
  content: string;
  editedAt?: string;
  deletedAt?: string;
  createdAt: string;
}

// Payload WebSocket pour les messages temps réel
export interface WsMessagePayload {
  conversationId: string;
  content: string;
  type: MessageType;
}
