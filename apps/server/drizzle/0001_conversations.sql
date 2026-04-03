-- Conversations (salons privés, groupes, salles média)
CREATE TABLE IF NOT EXISTS "conversations" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"       varchar(128) NOT NULL,
  "type"       varchar(16)  NOT NULL CHECK (type IN ('private', 'group', 'media_room')),
  "owner_id"   uuid         NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz  NOT NULL DEFAULT now(),
  "updated_at" timestamptz  NOT NULL DEFAULT now()
);

-- Membres d'une conversation avec leur rôle
CREATE TABLE IF NOT EXISTS "conversation_members" (
  "conversation_id" uuid        NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "user_id"         uuid        NOT NULL REFERENCES "users"("id")         ON DELETE CASCADE,
  "role"            varchar(16) NOT NULL CHECK (role IN ('owner', 'moderator', 'member', 'guest')),
  "joined_at"       timestamptz NOT NULL DEFAULT now(),
  "banned_at"       timestamptz,
  PRIMARY KEY ("conversation_id", "user_id")
);

-- Permissions par rôle, par conversation (surcharge des defaults)
-- permissions stocké en JSONB : ex. ["write","speak","camera"]
CREATE TABLE IF NOT EXISTS "conversation_permissions" (
  "conversation_id" uuid        NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role"            varchar(16) NOT NULL CHECK (role IN ('owner', 'moderator', 'member', 'guest')),
  "permissions"     jsonb       NOT NULL DEFAULT '[]',
  PRIMARY KEY ("conversation_id", "role")
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS "idx_members_user"         ON "conversation_members" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_members_conversation"  ON "conversation_members" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_owner"   ON "conversations" ("owner_id");
