import type { UserRole } from "./user.js";

export type ConversationType = "private" | "group" | "media_room";

// Permissions disponibles par rôle dans une conversation
export type Permission =
  | "invite"
  | "write"
  | "speak"
  | "camera"
  | "screen_share"
  | "start_rtmp"
  | "manage_roles"
  | "kick_ban";

export type PermissionMatrix = Record<UserRole, Permission[]>;

export interface Conversation {
  id: string;
  name: string;
  type: ConversationType;
  ownerId: string;
  permissions: PermissionMatrix;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

// Invitation à rejoindre une conversation
export interface ConversationInvite {
  id: string;
  conversationId: string;
  invitedBy: string;
  inviteeId?: string;       // null = lien public
  token: string;            // token unique pour le lien
  expiresAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  createdAt: string;
}

// Permissions par défaut par rôle
export const DEFAULT_PERMISSIONS: PermissionMatrix = {
  owner: ["invite", "write", "speak", "camera", "screen_share", "start_rtmp", "manage_roles", "kick_ban"],
  moderator: ["invite", "write", "speak", "camera", "screen_share", "start_rtmp", "manage_roles", "kick_ban"],
  member: ["write", "speak", "camera", "screen_share"],
  guest: ["write", "speak"],
};
