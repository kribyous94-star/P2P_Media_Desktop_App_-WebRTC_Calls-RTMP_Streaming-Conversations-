import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Minimum 3 caractères")
    .max(32, "Maximum 32 caractères")
    .regex(/^[a-zA-Z0-9_-]+$/, "Uniquement lettres, chiffres, _ et -"),
  email: z.string().email("Email invalide"),
  password: z
    .string()
    .min(8, "Minimum 8 caractères")
    .max(128, "Maximum 128 caractères"),
  displayName: z
    .string()
    .min(1, "Requis")
    .max(64, "Maximum 64 caractères")
    .optional(),
});

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput    = z.infer<typeof loginSchema>;
