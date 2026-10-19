import { z } from 'zod';
import { ConsultationType } from '@prisma/client';

export const createBookingSchema = z.object({
  slotId: z.string().uuid('Invalid slot ID format'),
  consultationType: z.nativeEnum(ConsultationType).default(ConsultationType.VIDEO),
  notes: z.string().max(1000).optional(),
});

export const cancelBookingSchema = z.object({
  cancellationReason: z.string().min(5, 'Please provide a valid cancellation reason').max(500),
});

export const queryBookingsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.string().optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type QueryBookingsInput = z.infer<typeof queryBookingsSchema>;
