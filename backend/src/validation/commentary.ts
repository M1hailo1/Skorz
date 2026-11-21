import { z } from 'zod';

export const listCommentaryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const createCommentarySchema = z.object({
  minute: z.int32().nonnegative().nullish(),
  sequence: z.int32(),
  period: z.string().nullish(),
  eventType: z.string().nullish(),
  actor: z.string().nullish(),
  team: z.string().nullish(),
  message: z.string().min(1),
  metadata: z.record(z.string(), z.json()).nullish(),
  tags: z.array(z.string()).optional(),
});
