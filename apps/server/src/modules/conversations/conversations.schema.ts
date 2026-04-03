import { z } from "zod";

export const createConversationSchema = z.object({
  name: z.string().min(1).max(128),
  type: z.enum(["private", "group", "media_room"]),
});

export const updateRoleSchema = z.object({
  role: z.enum(["owner", "moderator", "member", "guest"]),
});

export const updatePermissionsSchema = z.object({
  role: z.enum(["owner", "moderator", "member", "guest"]),
  permissions: z.array(z.enum([
    "invite", "write", "speak", "camera",
    "screen_share", "start_rtmp", "manage_roles", "kick_ban",
  ])),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateRoleInput         = z.infer<typeof updateRoleSchema>;
export type UpdatePermissionsInput  = z.infer<typeof updatePermissionsSchema>;
