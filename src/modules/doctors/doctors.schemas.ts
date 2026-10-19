import { z } from "zod";

export const createDoctorProfileSchema = z.object({
  licenseNumber: z.string().min(3).max(100),
  specialties: z
    .array(z.string().min(2))
    .min(1, "At least one specialty is required"),
  experienceYears: z.number().int().min(0).max(70),
  consultationFee: z
    .number()
    .positive("Consultation fee must be greater than zero"),
  bio: z.string().max(2000).optional(),
});

export const updateDoctorProfileSchema = z.object({
  specialties: z.array(z.string().min(2)).min(1).optional(),
  experienceYears: z.number().int().min(0).max(70).optional(),
  consultationFee: z.number().positive().optional(),
  bio: z.string().max(2000).optional(),
});

export const verifyDoctorSchema = z.object({
  isVerified: z.boolean(),
});

export type CreateDoctorProfileInput = z.infer<
  typeof createDoctorProfileSchema
>;
export type UpdateDoctorProfileInput = z.infer<
  typeof updateDoctorProfileSchema
>;
export type VerifyDoctorInput = z.infer<typeof verifyDoctorSchema>;
