import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users, type User } from "../../db/schema.js";
import { signToken } from "../../lib/jwt.js";
import type { RegisterInput, LoginInput } from "./auth.schema.js";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 401 | 409 = 400
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// Champs publics retournés au client — jamais le passwordHash
function toPublicUser(user: User) {
  return {
    id:          user.id,
    username:    user.username,
    displayName: user.displayName,
    avatarUrl:   user.avatarUrl ?? undefined,
    createdAt:   user.createdAt.toISOString(),
    updatedAt:   user.updatedAt.toISOString(),
  };
}

export async function registerUser(input: RegisterInput) {
  // Vérification unicité email + username en parallèle
  const [existingEmail, existingUsername] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1),
    db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1),
  ]);

  if (existingEmail.length > 0) throw new AuthError("Email déjà utilisé", 409);
  if (existingUsername.length > 0) throw new AuthError("Nom d'utilisateur déjà pris", 409);

  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 1,
  });

  const [user] = await db.insert(users).values({
    username:     input.username,
    email:        input.email,
    passwordHash,
    displayName:  input.displayName ?? input.username,
  }).returning();

  if (!user) throw new AuthError("Erreur lors de la création du compte");

  const token = signToken({ sub: user.id, username: user.username });
  return { user: toPublicUser(user), token };
}

export async function loginUser(input: LoginInput) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  // Même message d'erreur que "utilisateur non trouvé" — évite l'énumération d'emails
  if (!user) throw new AuthError("Identifiants invalides", 401);

  const valid = await argon2.verify(user.passwordHash, input.password);
  if (!valid) throw new AuthError("Identifiants invalides", 401);

  const token = signToken({ sub: user.id, username: user.username });
  return { user: toPublicUser(user), token };
}

export async function getMe(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new AuthError("Utilisateur introuvable", 401);
  return toPublicUser(user);
}
