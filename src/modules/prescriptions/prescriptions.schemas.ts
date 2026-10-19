import { z } from 'zod';

export const medicationItemSchema = z.object({
  name: z.string().min(1, 'Medication name is required'),
  dosage: z.string().min(1, 'Dosage is required (e.g. 500mg)'),
  frequency: z.string().min(1, 'Frequency is required (e.g. Twice daily after meals)'),
  durationDays: z.number().int().positive('Duration must be positive integer'),
  instructions: z.string().optional(),
});

export const createPrescriptionSchema = z.object({
  consultationId: z.string().uuid('Invalid consultation ID format'),
  diagnosis: z.string().min(2, 'Diagnosis is required').max(2000),
  medications: z.array(medicationItemSchema).min(1, 'At least one medication must be prescribed'),
  advice: z.string().max(2000).optional(),
});

export type MedicationItem = z.infer<typeof medicationItemSchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
