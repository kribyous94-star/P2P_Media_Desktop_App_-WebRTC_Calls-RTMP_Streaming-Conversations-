import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JwtPayload {
  sub: string;       // userId
  username: string;
  iat?: number;
  exp?: number;
}

const ALGORITHM = "HS256" as const;

export function signToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_EXPIRY,
  });
}

export function verifyToken(token: string): JwtPayload {
  // On impose explicitement l'algorithme HS256 — protège contre
  // les attaques par confusion d'algorithme (CVE-2022-21449 style)
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: [ALGORITHM],
  });

  if (typeof payload === "string") {
    throw new Error("Invalid token payload");
  }

  return payload as JwtPayload;
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}
