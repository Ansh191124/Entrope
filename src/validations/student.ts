import { z } from "zod";

export const createStudentSchema = z.object({
  enrollmentNo: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  phone: z.string().trim().max(20).optional().nullable(),
  department: z.string().trim().min(1).max(100),
  course: z.string().trim().min(1).max(100),
  year: z.number().int().min(1).max(10),
  semester: z.number().int().min(1).max(20),
  section: z.string().trim().max(20).optional().nullable(),
  photoUrl: z.string().trim().url().optional().nullable(),
  password: z.string().min(8).max(200).optional(), // if omitted, a random one is generated
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const listStudentsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  department: z.string().trim().max(100).optional(),
  active: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const csvStudentRowSchema = z.object({
  enrollmentNo: z.string().trim().min(1, "missing enrollment number"),
  name: z.string().trim().min(1, "missing name"),
  email: z.string().trim().email("invalid email"),
  phone: z.string().trim().optional(),
  department: z.string().trim().min(1, "missing department"),
  course: z.string().trim().min(1, "missing course"),
  year: z.coerce.number().int().min(1).max(10),
  semester: z.coerce.number().int().min(1).max(20),
  section: z.string().trim().optional(),
});
