import { z } from 'zod';
import { ConsultationStatus } from '@prisma/client';

export const updateConsultationStatusSchema = z.object({
  status: z.nativeEnum(ConsultationStatus),
  notes: z.string().max(2000).optional(),
});

export const updateConsultationNotesSchema = z.object({
  notes: z.string().min(1).max(2000),
});

export type UpdateConsultationStatusInput = z.infer<typeof updateConsultationStatusSchema>;
export type UpdateConsultationNotesInput = z.infer<typeof updateConsultationNotesSchema>;
