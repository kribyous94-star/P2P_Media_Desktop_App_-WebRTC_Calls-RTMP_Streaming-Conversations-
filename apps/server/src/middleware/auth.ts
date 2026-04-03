import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";

/**
 * Hook d'authentification pour les routes REST protégées.
 * Lit le token depuis le header Authorization: Bearer <token>
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Unauthorized", message: "Missing Bearer token" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    // Attacher le payload au request pour les handlers suivants
    (request as FastifyRequest & { jwtPayload: JwtPayload }).jwtPayload = payload;
  } catch {
    reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired token" });
  }
}

/**
 * Extrait le userId du token vérifié.
 * À utiliser après le hook authenticate.
 */
export function getUserId(request: FastifyRequest): string {
  const payload = (request as FastifyRequest & { jwtPayload: JwtPayload }).jwtPayload;
  if (!payload) throw new Error("authenticate hook must run before getUserId");
  return payload.sub;
}
