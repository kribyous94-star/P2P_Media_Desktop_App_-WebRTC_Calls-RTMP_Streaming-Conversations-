import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { getMessages, createMessage } from "./messages.service.js";
import { sendMessageSchema, getMessagesQuerySchema } from "./messages.schema.js";
import { connectionRegistry } from "../../websocket/registry.js";

export async function messageRoutes(fastify: FastifyInstance) {
  // GET /api/conversations/:id/messages?before=<ISO>&limit=50
  fastify.get<{
    Params: { id: string };
    Querystring: { before?: string; limit?: string };
  }>(
    "/:id/messages",
    { preHandler: authenticate },
    async (request, reply) => {
      const query = getMessagesQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ error: query.error.issues });
      }

      try {
        const result = await getMessages(
          request.params.id,
          request.jwtPayload!.sub,
          query.data.before
        );
        return reply.send(result);
      } catch (err) {
        if (err instanceof Error && err.message === "NOT_MEMBER") {
          return reply.status(403).send({ error: "Forbidden" });
        }
        throw err;
      }
    }
  );

  // POST /api/conversations/:id/messages
  fastify.post<{
    Params: { id: string };
    Body: { content: string; type?: "text" };
  }>(
    "/:id/messages",
    { preHandler: authenticate },
    async (request, reply) => {
      const body = sendMessageSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.issues });
      }

      try {
        const message = await createMessage(
          request.params.id,
          request.jwtPayload!.sub,
          body.data.content,
          body.data.type
        );

        // Broadcast to all members in the WS room
        connectionRegistry.broadcastToConversation(request.params.id, {
          type:    "chat:message",
          payload: message,
        });

        return reply.status(201).send({ message });
      } catch (err) {
        if (err instanceof Error && err.message === "FORBIDDEN") {
          return reply.status(403).send({ error: "Permission denied: send_message" });
        }
        throw err;
      }
    }
  );
}
