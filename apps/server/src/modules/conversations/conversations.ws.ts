import type { WebSocket } from "ws";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversationMembers, users } from "../../db/schema.js";
import { connectionRegistry } from "../../websocket/registry.js";

// Vérification rapide membership (réutilisée par le handler WS)
export async function getMembership(conversationId: string, userId: string) {
  const [member] = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
        isNull(conversationMembers.bannedAt),
      )
    )
    .limit(1);
  return member ?? null;
}

export async function handleJoinConversation(
  connectionId: string,
  userId: string,
  conversationId: string,
  socket: WebSocket
) {
  // Vérifier que l'utilisateur est bien membre
  const member = await getMembership(conversationId, userId);
  if (!member) {
    socket.send(JSON.stringify({
      type: "error",
      payload: { code: "NOT_MEMBER", message: "Vous n'êtes pas membre de cette conversation" },
    }));
    return;
  }

  connectionRegistry.joinConversation(connectionId, conversationId);

  // Récupérer le username pour le broadcast
  const [user] = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Notifier les autres membres déjà dans la room
  connectionRegistry.broadcastToConversation(
    conversationId,
    {
      type: "conversation:member_joined",
      payload: { conversationId, userId, username: user?.username ?? userId },
    },
    connectionId // exclure l'expéditeur
  );

  // Confirmer au client qu'il a rejoint
  socket.send(JSON.stringify({
    type: "conversation:member_joined",
    payload: { conversationId, userId, username: user?.username ?? userId, self: true },
  }));
}

export function handleLeaveConversation(
  connectionId: string,
  userId: string,
  conversationId: string
) {
  connectionRegistry.leaveConversation(connectionId, conversationId);

  connectionRegistry.broadcastToConversation(
    conversationId,
    {
      type: "conversation:member_left",
      payload: { conversationId, userId },
    }
  );
}
