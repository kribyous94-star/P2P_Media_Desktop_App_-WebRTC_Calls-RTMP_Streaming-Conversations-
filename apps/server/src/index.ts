import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import fastifyJwt from "@fastify/jwt";

import { env } from "./config/env.js";
import { wsHandler } from "./websocket/handler.js";

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "warn" : "info",
    transport:
      env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

// ---- Plugins ----

await app.register(cors, {
  origin: env.ALLOWED_ORIGINS.split(","),
  credentials: true,
});

await app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
});

await app.register(fastifyWebsocket);

// ---- Routes ----

// Health check
app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

// WebSocket — point d'entrée unique pour la signalisation et le chat
app.register(async (fastify) => {
  fastify.get("/ws", { websocket: true }, wsHandler);
});

// Routes REST modulaires (montées dans les phases suivantes)
// app.register(authRoutes, { prefix: "/api/auth" });
// app.register(conversationRoutes, { prefix: "/api/conversations" });
// app.register(messageRoutes, { prefix: "/api/messages" });

// ---- Start ----

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  console.log(`[server] Running on http://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
