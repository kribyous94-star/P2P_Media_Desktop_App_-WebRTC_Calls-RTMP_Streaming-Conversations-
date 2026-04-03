import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";

import { env } from "./config/env.js";
import { checkDbConnection } from "./db/index.js";
import { wsHandler } from "./websocket/handler.js";
import { authRoutes } from "./modules/auth/auth.routes.js";

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

await app.register(fastifyWebsocket);

// ---- Vérification DB ----

await checkDbConnection();

// ---- Routes REST ----

app.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
}));

await app.register(authRoutes, { prefix: "/api/auth" });

// ---- WebSocket ----

app.register(async (fastify) => {
  fastify.get("/ws", { websocket: true }, wsHandler);
});

// ---- Start ----

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  console.log(`[server] Running on http://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
