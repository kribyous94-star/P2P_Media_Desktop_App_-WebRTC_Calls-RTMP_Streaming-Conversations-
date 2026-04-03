export type UserRole = "owner" | "moderator" | "member" | "guest";

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  userId: string;
  token: string;
  expiresAt: string;
}

// Membership d'un utilisateur dans une conversation
export interface ConversationMembership {
  userId: string;
  conversationId: string;
  role: UserRole;
  joinedAt: string;
  bannedAt?: string;
}
