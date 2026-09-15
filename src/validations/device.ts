import { z } from "zod";

export const createDeviceSchema = z.object({
  gateId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  deviceIdentifier: z.string().trim().min(4).max(100),
});
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  gateId: z.string().uuid().optional(),
  active: z.boolean().optional(),
});
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
