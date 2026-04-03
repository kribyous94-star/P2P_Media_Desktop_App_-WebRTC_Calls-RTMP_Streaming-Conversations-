import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import type { ConversationType, UserRole, Permission, MessageType } from "@p2p/shared";

export const users = pgTable("users", {
  id:           uuid("id").primaryKey().defaultRandom(),
  username:     varchar("username", { length: 32 }).notNull().unique(),
  email:        varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName:  varchar("display_name", { length: 64 }).notNull(),
  avatarUrl:    text("avatar_url"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User    = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ---- Conversations ----

export const conversations = pgTable("conversations", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      varchar("name", { length: 128 }).notNull(),
  type:      varchar("type", { length: 16 }).notNull().$type<ConversationType>(),
  ownerId:   uuid("owner_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_conversations_owner").on(t.ownerId),
]);

export const conversationMembers = pgTable("conversation_members", {
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId:         uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role:           varchar("role", { length: 16 }).notNull().$type<UserRole>(),
  joinedAt:       timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  bannedAt:       timestamp("banned_at", { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.conversationId, t.userId] }),
  index("idx_members_user").on(t.userId),
  index("idx_members_conversation").on(t.conversationId),
]);

export const conversationPermissions = pgTable("conversation_permissions", {
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role:           varchar("role", { length: 16 }).notNull().$type<UserRole>(),
  permissions:    jsonb("permissions").notNull().default([]).$type<Permission[]>(),
}, (t) => [
  primaryKey({ columns: [t.conversationId, t.role] }),
]);

export type Conversation       = typeof conversations.$inferSelect;
export type NewConversation    = typeof conversations.$inferInsert;
export type ConversationMember = typeof conversationMembers.$inferSelect;
export type ConvPermission     = typeof conversationPermissions.$inferSelect;

// ---- Messages ----

export const messages = pgTable("messages", {
  id:             uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  authorId:       uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type:           varchar("type", { length: 16 }).notNull().default("text").$type<MessageType>(),
  content:        text("content").notNull(),
  editedAt:       timestamp("edited_at", { withTimezone: true }),
  deletedAt:      timestamp("deleted_at", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_messages_conversation").on(t.conversationId, t.createdAt),
]);

export type DbMessage    = typeof messages.$inferSelect;
export type NewDbMessage = typeof messages.$inferInsert;
