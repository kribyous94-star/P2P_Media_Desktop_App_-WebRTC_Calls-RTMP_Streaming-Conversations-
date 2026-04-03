import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "./auth.schema.js";
import { registerUser, loginUser, getMe, AuthError } from "./auth.service.js";
import { authenticate, getUserId } from "../../middleware/auth.js";

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Validation",
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await registerUser(parsed.data);
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  // POST /api/auth/login
  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Validation",
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await loginUser(parsed.data);
      return reply.send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  // GET /api/auth/me  (protégé)
  app.get("/me", { preHandler: authenticate }, async (request, reply) => {
    try {
      const userId = getUserId(request);
      const user = await getMe(userId);
      return reply.send({ user });
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  // POST /api/auth/logout  (stateless — le client supprime son token)
  app.post("/logout", { preHandler: authenticate }, async (_request, reply) => {
    return reply.send({ message: "Logged out" });
  });
}
