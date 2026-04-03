import type { WebSocket } from "ws";

/**
 * Registre des connexions WebSocket actives.
 *
 * Structure :
 * - connectionId → socket (pour envoyer à un peer spécifique)
 * - userId → Set<connectionId> (un user peut avoir plusieurs onglets)
 * - conversationId → Set<connectionId> (pour broadcaster dans un salon)
 */
class ConnectionRegistry {
  private readonly connections = new Map<string, WebSocket>();
  private readonly userConnections = new Map<string, Set<string>>();
  private readonly conversationConnections = new Map<string, Set<string>>();
  private readonly connectionToUser = new Map<string, string>();

  add(connectionId: string, socket: WebSocket): void {
    this.connections.set(connectionId, socket);
  }

  remove(connectionId: string): void {
    const userId = this.connectionToUser.get(connectionId);
    if (userId) {
      this.userConnections.get(userId)?.delete(connectionId);
      this.connectionToUser.delete(connectionId);
    }

    // Retirer de tous les salons
    this.conversationConnections.forEach((members) => {
      members.delete(connectionId);
    });

    this.connections.delete(connectionId);
  }

  bindUser(connectionId: string, userId: string): void {
    this.connectionToUser.set(connectionId, userId);
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);
  }

  joinConversation(connectionId: string, conversationId: string): void {
    if (!this.conversationConnections.has(conversationId)) {
      this.conversationConnections.set(conversationId, new Set());
    }
    this.conversationConnections.get(conversationId)!.add(connectionId);
  }

  leaveConversation(connectionId: string, conversationId: string): void {
    this.conversationConnections.get(conversationId)?.delete(connectionId);
  }

  // Envoyer à un user (toutes ses connexions)
  sendToUser(userId: string, payload: unknown): void {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) return;

    const message = JSON.stringify(payload);
    for (const connId of connectionIds) {
      this.connections.get(connId)?.send(message);
    }
  }

  // Broadcaster dans un salon (sauf l'expéditeur)
  broadcastToConversation(conversationId: string, payload: unknown, excludeConnectionId?: string): void {
    const connectionIds = this.conversationConnections.get(conversationId);
    if (!connectionIds) return;

    const message = JSON.stringify(payload);
    for (const connId of connectionIds) {
      if (connId !== excludeConnectionId) {
        this.connections.get(connId)?.send(message);
      }
    }
  }

  getUserId(connectionId: string): string | undefined {
    return this.connectionToUser.get(connectionId);
  }

  getSocket(connectionId: string): WebSocket | undefined {
    return this.connections.get(connectionId);
  }

  getConversationMemberCount(conversationId: string): number {
    return this.conversationConnections.get(conversationId)?.size ?? 0;
  }
}

export const connectionRegistry = new ConnectionRegistry();
