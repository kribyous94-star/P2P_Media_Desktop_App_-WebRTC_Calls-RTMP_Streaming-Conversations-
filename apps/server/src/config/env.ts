import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: parseInt(optional("PORT", "3001"), 10),
  HOST: optional("HOST", "0.0.0.0"),

  // Auth
  JWT_SECRET: optional("JWT_SECRET", "change-me-in-production-please"),
  JWT_EXPIRY: optional("JWT_EXPIRY", "7d"),

  // Base de données (Phase 2+)
  DATABASE_URL: optional("DATABASE_URL", ""),

  // CORS
  ALLOWED_ORIGINS: optional("ALLOWED_ORIGINS", "http://localhost:1420"),
} as const;

export type Env = typeof env;
