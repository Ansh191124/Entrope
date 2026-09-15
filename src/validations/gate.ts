import { z } from "zod";

export const createGateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  location: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
});
export type CreateGateInput = z.infer<typeof createGateSchema>;

export const updateGateSchema = createGateSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateGateInput = z.infer<typeof updateGateSchema>;
