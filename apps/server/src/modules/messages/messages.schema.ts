import { z } from "zod";

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  type:    z.enum(["text"]).optional().default("text"),
});

export const getMessagesQuerySchema = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional(),
});
