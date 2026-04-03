CREATE TABLE IF NOT EXISTS "users" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username"      varchar(32) NOT NULL UNIQUE,
  "email"         varchar(255) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "display_name"  varchar(64) NOT NULL,
  "avatar_url"    text,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
