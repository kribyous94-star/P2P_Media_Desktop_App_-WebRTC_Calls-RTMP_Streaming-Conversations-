import type { FastifyInstance } from "fastify";
import { authenticate, getUserId } from "../../middleware/auth.js";
import { connectionRegistry } from "../../websocket/registry.js";
import {
  createConversationSchema,
  updateRoleSchema,
  updatePermissionsSchema,
} from "./conversations.schema.js";
import {
  createConversation,
  getUserConversations,
  getConversation,
  getConversationMembers,
  joinConversation,
  leaveConversation,
  updateMemberRole,
  kickMember,
  updateConversationPermissions,
  addMemberByUsername,
  ConversationError,
} from "./conversations.service.js";

function handleError(err: unknown, reply: Parameters<typeof authenticate>[1]) {
  if (err instanceof ConversationError) {
    return reply.code(err.statusCode).send({ error: err.message });
  }
  throw err;
}

export async function conversationRoutes(app: FastifyInstance) {
  // Toutes les routes nécessitent d'être authentifié
  app.addHook("preHandler", authenticate);

  // POST /api/conversations — créer
  app.post("/", async (request, reply) => {
    const parsed = createConversationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Validation", issues: parsed.error.flatten().fieldErrors });
    }
    try {
      const conv = await createConversation(getUserId(request), parsed.data);
      return reply.code(201).send({ conversation: conv });
    } catch (err) { return handleError(err, reply); }
  });

  // GET /api/conversations — liste des conversations de l'utilisateur
  app.get("/", async (request, reply) => {
    try {
      const convs = await getUserConversations(getUserId(request));
      return reply.send({ conversations: convs });
    } catch (err) { return handleError(err, reply); }
  });

  // GET /api/conversations/:id
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      const conv = await getConversation(request.params.id, getUserId(request));
      return reply.send({ conversation: conv });
    } catch (err) { return handleError(err, reply); }
  });

  // GET /api/conversations/:id/members
  app.get<{ Params: { id: string } }>("/:id/members", async (request, reply) => {
    try {
      const members = await getConversationMembers(request.params.id, getUserId(request));
      return reply.send({ members });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /api/conversations/:id/members  { username } — ajouter un membre par username
  app.post<{ Params: { id: string }; Body: { username: string } }>(
    "/:id/members",
    async (request, reply) => {
      const { username } = request.body ?? {};
      if (!username || typeof username !== "string") {
        return reply.code(400).send({ error: "username requis" });
      }
      try {
        const { conversation, targetUserId, targetUsername } =
          await addMemberByUsername(request.params.id, getUserId(request), username.trim());

        // Notifier le nouveau membre que la conversation lui a été ajoutée
        connectionRegistry.sendToUser(targetUserId, {
          type: "conversation:added",
          payload: conversation,
        });

        // Notifier les membres déjà dans la room WS qu'un nouveau membre a rejoint
        connectionRegistry.broadcastToConversation(request.params.id, {
          type: "conversation:member_joined",
          payload: { conversationId: request.params.id, userId: targetUserId, username: targetUsername },
        });

        return reply.code(201).send({ conversation });
      } catch (err) { return handleError(err, reply); }
    }
  );

  // POST /api/conversations/:id/join
  app.post<{ Params: { id: string } }>("/:id/join", async (request, reply) => {
    try {
      const conv = await joinConversation(request.params.id, getUserId(request));
      return reply.send({ conversation: conv });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /api/conversations/:id/leave
  app.post<{ Params: { id: string } }>("/:id/leave", async (request, reply) => {
    try {
      await leaveConversation(request.params.id, getUserId(request));
      return reply.send({ message: "Left conversation" });
    } catch (err) { return handleError(err, reply); }
  });

  // PUT /api/conversations/:id/members/:userId/role
  app.put<{ Params: { id: string; userId: string } }>(
    "/:id/members/:userId/role",
    async (request, reply) => {
      const parsed = updateRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Validation", issues: parsed.error.flatten().fieldErrors });
      }
      try {
        await updateMemberRole(request.params.id, getUserId(request), request.params.userId, parsed.data);
        return reply.send({ message: "Role updated" });
      } catch (err) { return handleError(err, reply); }
    }
  );

  // DELETE /api/conversations/:id/members/:userId — kick
  app.delete<{ Params: { id: string; userId: string } }>(
    "/:id/members/:userId",
    async (request, reply) => {
      try {
        await kickMember(request.params.id, getUserId(request), request.params.userId);
        return reply.send({ message: "Member kicked" });
      } catch (err) { return handleError(err, reply); }
    }
  );

  // PUT /api/conversations/:id/permissions — modifier les permissions d'un rôle
  app.put<{ Params: { id: string } }>("/:id/permissions", async (request, reply) => {
    const parsed = updatePermissionsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Validation", issues: parsed.error.flatten().fieldErrors });
    }
    try {
      await updateConversationPermissions(request.params.id, getUserId(request), parsed.data);
      return reply.send({ message: "Permissions updated" });
    } catch (err) { return handleError(err, reply); }
  });
}
