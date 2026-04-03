import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Vérification de la connexion au démarrage
pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err);
});

export const db = drizzle(pool, { schema });

export async function checkDbConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("[DB] Connection OK");
  } finally {
    client.release();
  }
}

export { pool };
