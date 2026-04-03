import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Hook d'authentification pour les routes REST protégées.
 * Phase 2 : implémentation complète avec JWT.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: "Unauthorized" });
  }
}

/**
 * Extrait le userId du token JWT vérifié.
 * À utiliser après le hook authenticate.
 */
export function getUserId(request: FastifyRequest): string {
  const payload = request.user as { sub: string };
  return payload.sub;
}
