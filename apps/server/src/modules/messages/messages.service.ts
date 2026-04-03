import { eq, and, lt, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { messages, users, conversationMembers } from "../../db/schema.js";
import { hasPermission } from "../conversations/conversations.service.js";
import type { Message } from "@p2p/shared";

const PAGE_SIZE = 50;

function toMessage(
  row: typeof messages.$inferSelect,
  authorUsername: string
): Message {
  return {
    id:              row.id,
    conversationId:  row.conversationId,
    authorId:        row.authorId,
    authorUsername,
    type:            row.type,
    content:         row.content,
    editedAt:        row.editedAt?.toISOString(),
    deletedAt:       row.deletedAt?.toISOString(),
    createdAt:       row.createdAt.toISOString(),
  };
}

/**
 * Fetches paginated messages for a conversation.
 * Returns up to PAGE_SIZE messages, ordered newest-first.
 * Use `before` (ISO timestamp) for cursor-based pagination.
 */
export async function getMessages(
  conversationId: string,
  userId: string,
  before?: string
): Promise<{ messages: Message[]; hasMore: boolean }> {
  // Verify membership
  const member = await db
    .select()
    .from(conversationMembers)
    .where(and(
      eq(conversationMembers.conversationId, conversationId),
      eq(conversationMembers.userId, userId)
    ))
    .then((r) => r[0] ?? null);

  if (!member) throw new Error("NOT_MEMBER");

  const conditions = before
    ? and(eq(messages.conversationId, conversationId), lt(messages.createdAt, new Date(before)))
    : eq(messages.conversationId, conversationId);

  // Fetch PAGE_SIZE + 1 to detect hasMore
  const rows = await db
    .select({
      message:  messages,
      username: users.username,
    })
    .from(messages)
    .innerJoin(users, eq(messages.authorId, users.id))
    .where(conditions)
    .orderBy(desc(messages.createdAt))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const slice   = rows.slice(0, PAGE_SIZE);

  // Return in chronological order (oldest first) for the client
  const result = slice.reverse().map((r) => toMessage(r.message, r.username));
  return { messages: result, hasMore };
}

/**
 * Persists a new message and returns it enriched with authorUsername.
 * Enforces the send_message permission.
 */
export async function createMessage(
  conversationId: string,
  authorId: string,
  content: string,
  type: "text" = "text"
): Promise<Message> {
  // Check permission
  if (!(await hasPermission(conversationId, authorId, "write"))) {
    throw new Error("FORBIDDEN");
  }

  const [row] = await db
    .insert(messages)
    .values({ conversationId, authorId, type, content })
    .returning();

  if (!row) throw new Error("INSERT_FAILED");

  const author = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, authorId))
    .then((r) => r[0]);

  return toMessage(row, author?.username ?? "unknown");
}
