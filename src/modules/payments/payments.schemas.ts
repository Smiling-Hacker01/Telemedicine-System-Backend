import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  consultationId: z.string().uuid('Invalid consultation ID format'),
});

export const webhookPayloadSchema = z.object({
  event: z.enum(['payment.succeeded', 'payment.failed', 'refund.processed']),
  eventId: z.string().min(1),
  data: z.object({
    consultationId: z.string().uuid(),
    paymentId: z.string().uuid().optional(),
    transactionId: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().default('INR'),
    failureReason: z.string().optional(),
  }),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
