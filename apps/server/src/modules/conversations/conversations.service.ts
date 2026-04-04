import { eq, and, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  conversations,
  conversationMembers,
  conversationPermissions,
  users,
} from "../../db/schema.js";
import { DEFAULT_PERMISSIONS, type Permission, type UserRole } from "@p2p/shared";
import type { CreateConversationInput, UpdateRoleInput, UpdatePermissionsInput } from "./conversations.schema.js";

export class ConversationError extends Error {
  constructor(message: string, public readonly statusCode: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "ConversationError";
  }
}

// ---- Helpers ----

async function getMembership(conversationId: string, userId: string) {
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

export async function getEffectivePermissions(
  conversationId: string,
  role: UserRole
): Promise<Permission[]> {
  // Chercher les permissions custom pour ce rôle dans cette conversation
  const [custom] = await db
    .select()
    .from(conversationPermissions)
    .where(
      and(
        eq(conversationPermissions.conversationId, conversationId),
        eq(conversationPermissions.role, role),
      )
    )
    .limit(1);

  // Si override existe, on l'utilise — sinon les defaults du shared package
  return custom?.permissions ?? DEFAULT_PERMISSIONS[role] ?? [];
}

export async function hasPermission(
  conversationId: string,
  userId: string,
  permission: Permission
): Promise<boolean> {
  const member = await getMembership(conversationId, userId);
  if (!member) return false;

  const perms = await getEffectivePermissions(conversationId, member.role);
  return perms.includes(permission);
}

// ---- CRUD ----

export async function createConversation(
  userId: string,
  input: CreateConversationInput
) {
  // Créer la conversation + owner en transaction
  const result = await db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversations)
      .values({ name: input.name, type: input.type, ownerId: userId })
      .returning();

    if (!conv) throw new ConversationError("Erreur lors de la création");

    // Le créateur devient owner automatiquement
    await tx.insert(conversationMembers).values({
      conversationId: conv.id,
      userId,
      role: "owner",
    });

    return conv;
  });

  return toPublicConversation(result, "owner");
}

export async function getUserConversations(userId: string) {
  // Toutes les conversations où l'utilisateur est membre non banni
  const rows = await db
    .select({
      conversation: conversations,
      role: conversationMembers.role,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.userId, userId),
        isNull(conversationMembers.bannedAt),
      )
    );

  return rows.map((r) => toPublicConversation(r.conversation, r.role));
}

export async function getConversation(conversationId: string, userId: string) {
  const member = await getMembership(conversationId, userId);
  if (!member) throw new ConversationError("Conversation introuvable ou accès refusé", 404);

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv) throw new ConversationError("Conversation introuvable", 404);

  const perms = await getEffectivePermissions(conversationId, member.role);
  return toPublicConversation(conv, member.role, perms);
}

export async function getConversationMembers(conversationId: string, userId: string) {
  // Vérifier que l'appelant est membre
  const caller = await getMembership(conversationId, userId);
  if (!caller) throw new ConversationError("Accès refusé", 403);

  const rows = await db
    .select({
      userId:      conversationMembers.userId,
      role:        conversationMembers.role,
      joinedAt:    conversationMembers.joinedAt,
      username:    users.username,
      displayName: users.displayName,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        isNull(conversationMembers.bannedAt),
      )
    );

  return rows.map((r) => ({
    userId:      r.userId,
    role:        r.role,
    joinedAt:    r.joinedAt.toISOString(),
    username:    r.username,
    displayName: r.displayName,
  }));
}

export async function joinConversation(conversationId: string, userId: string) {
  // Vérifier que la conversation existe
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv) throw new ConversationError("Conversation introuvable", 404);

  const existing = await getMembership(conversationId, userId);
  if (existing) throw new ConversationError("Déjà membre de cette conversation", 409);

  await db.insert(conversationMembers).values({
    conversationId,
    userId,
    role: "member",
  });

  return toPublicConversation(conv, "member");
}

export async function addMemberByUsername(
  conversationId: string,
  requestingUserId: string,
  targetUsername: string
) {
  if (!(await hasPermission(conversationId, requestingUserId, "invite"))) {
    throw new ConversationError("Permission refusée : invite", 403);
  }

  const [target] = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.username, targetUsername))
    .limit(1);

  if (!target) throw new ConversationError("Utilisateur introuvable", 404);

  // joinConversation handles the "already member" check
  return joinConversation(conversationId, target.id);
}

export async function leaveConversation(conversationId: string, userId: string) {
  const member = await getMembership(conversationId, userId);
  if (!member) throw new ConversationError("Pas membre de cette conversation", 404);

  // Un owner ne peut pas partir s'il est le seul owner
  if (member.role === "owner") {
    const owners = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.role, "owner"),
          isNull(conversationMembers.bannedAt),
        )
      );

    if (owners.length <= 1) {
      throw new ConversationError(
        "Impossible de quitter : vous êtes le seul owner. Transférez d'abord la propriété.",
        403
      );
    }
  }

  await db
    .delete(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      )
    );
}

export async function updateMemberRole(
  conversationId: string,
  callerId: string,
  targetUserId: string,
  input: UpdateRoleInput
) {
  // Vérifier la permission manage_roles
  const canManage = await hasPermission(conversationId, callerId, "manage_roles");
  if (!canManage) throw new ConversationError("Permission insuffisante", 403);

  // Impossible de changer son propre rôle
  if (callerId === targetUserId) {
    throw new ConversationError("Impossible de modifier votre propre rôle", 400);
  }

  const target = await getMembership(conversationId, targetUserId);
  if (!target) throw new ConversationError("Membre introuvable", 404);

  // Seul un owner peut promouvoir en owner
  if (input.role === "owner") {
    const caller = await getMembership(conversationId, callerId);
    if (caller?.role !== "owner") {
      throw new ConversationError("Seul un owner peut transférer la propriété", 403);
    }
  }

  await db
    .update(conversationMembers)
    .set({ role: input.role })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, targetUserId),
      )
    );
}

export async function kickMember(
  conversationId: string,
  callerId: string,
  targetUserId: string
) {
  const canKick = await hasPermission(conversationId, callerId, "kick_ban");
  if (!canKick) throw new ConversationError("Permission insuffisante", 403);

  if (callerId === targetUserId) throw new ConversationError("Impossible de vous kick vous-même", 400);

  const target = await getMembership(conversationId, targetUserId);
  if (!target) throw new ConversationError("Membre introuvable", 404);

  // Ne peut pas kick quelqu'un de rang supérieur ou égal
  const caller = await getMembership(conversationId, callerId);
  const rankMap: Record<UserRole, number> = { owner: 3, moderator: 2, member: 1, guest: 0 };
  if ((rankMap[target.role] ?? 0) >= (rankMap[caller?.role ?? "guest"] ?? 0)) {
    throw new ConversationError("Impossible de kick un membre de rang supérieur ou égal", 403);
  }

  await db
    .delete(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, targetUserId),
      )
    );
}

export async function updateConversationPermissions(
  conversationId: string,
  callerId: string,
  input: UpdatePermissionsInput
) {
  const canManage = await hasPermission(conversationId, callerId, "manage_roles");
  if (!canManage) throw new ConversationError("Permission insuffisante", 403);

  // Upsert les permissions custom
  await db
    .insert(conversationPermissions)
    .values({
      conversationId,
      role: input.role,
      permissions: input.permissions,
    })
    .onConflictDoUpdate({
      target: [conversationPermissions.conversationId, conversationPermissions.role],
      set: { permissions: input.permissions },
    });
}

// ---- Format public ----

function toPublicConversation(
  conv: { id: string; name: string; type: string; ownerId: string; createdAt: Date; updatedAt: Date },
  userRole: UserRole,
  permissions?: Permission[]
) {
  return {
    id:          conv.id,
    name:        conv.name,
    type:        conv.type,
    ownerId:     conv.ownerId,
    userRole,
    permissions: permissions ?? DEFAULT_PERMISSIONS[userRole] ?? [],
    createdAt:   conv.createdAt.toISOString(),
    updatedAt:   conv.updatedAt.toISOString(),
  };
}
