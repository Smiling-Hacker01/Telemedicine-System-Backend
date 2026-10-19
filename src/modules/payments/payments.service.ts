import {
  PaymentStatus,
  ConsultationStatus,
  AuditOutcome,
} from "@prisma/client";
import { prisma } from "../../config/database.js";
import { env } from "../../config/environment.js";
import { verifyHmacSignature } from "../../shared/security/crypto.js";
import { auditService } from "../../shared/security/audit.service.js";
import { paymentTransactionsCounter } from "../../infrastructure/observability/metrics.js";
import {
  NotFoundError,
  UnauthorizedError,
  ConflictError,
} from "../../shared/errors/app-error.js";
import { WebhookPayload } from "./payments.schemas.js";

export class PaymentsService {
  /**
   * Generates a checkout / payment intent object for client-side payment initiation
   */
  async initiatePayment(consultationId: string, userId: string) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        payment: true,
        doctor: true,
      },
    });

    if (!consultation) {
      throw new NotFoundError("Consultation", consultationId);
    }

    if (consultation.patientId !== userId) {
      throw new UnauthorizedError(
        "You are not authorized to pay for this consultation",
      );
    }

    if (consultation.status !== ConsultationStatus.PENDING_PAYMENT) {
      throw new ConflictError(
        `Consultation is already in '${consultation.status}' status and does not require payment`,
      );
    }

    const payment = consultation.payment;
    if (!payment) {
      throw new NotFoundError(
        "Payment record for consultation",
        consultationId,
      );
    }

    return {
      paymentId: payment.id,
      consultationId: consultation.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      checkoutUrl: `https://pay.amrutam.co.in/checkout?paymentId=${payment.id}&ref=${consultation.bookingReference}`,
    };
  }

  /**
   * Processes webhook from Payment Gateway with cryptographic HMAC signature verification and idempotency
   */
  async processWebhook(
    rawPayload: string,
    signatureHeader?: string,
  ): Promise<{ received: boolean; status: string }> {
    if (!signatureHeader) {
      throw new UnauthorizedError(
        "Missing required Webhook Signature header (x-amrutam-signature)",
      );
    }

    const isValid = verifyHmacSignature(
      rawPayload,
      env.PAYMENT_WEBHOOK_SECRET,
      signatureHeader,
    );
    if (!isValid) {
      throw new UnauthorizedError(
        "Invalid webhook signature verification failed",
      );
    }

    const payload: WebhookPayload = JSON.parse(rawPayload);

    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { consultationId: payload.data.consultationId },
        include: { consultation: true },
      });

      if (!payment) {
        throw new NotFoundError(
          "Payment for consultation",
          payload.data.consultationId,
        );
      }

      // Idempotency check: If payment already transitioned to target state, return without side-effects
      if (
        (payload.event === "payment.succeeded" &&
          payment.status === PaymentStatus.SUCCESS) ||
        (payload.event === "payment.failed" &&
          payment.status === PaymentStatus.FAILED)
      ) {
        return { received: true, status: "IDEMPOTENT_IGNORE" };
      }

      if (payload.event === "payment.succeeded") {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            transactionId: payload.data.transactionId,
            metadata: {
              processedAt: new Date().toISOString(),
              eventId: payload.eventId,
            },
          },
        });

        await tx.consultation.update({
          where: { id: payment.consultationId },
          data: {
            status: ConsultationStatus.SCHEDULED,
          },
        });

        paymentTransactionsCounter.inc({
          status: "SUCCESS",
          provider: payment.provider,
        });

        await auditService.record({
          actorRole: "PAYMENT_GATEWAY",
          action: "PAYMENT_SUCCEEDED",
          resourceType: "Payment",
          resourceId: payment.id,
          outcome: AuditOutcome.SUCCESS,
          metadata: {
            transactionId: payload.data.transactionId,
            consultationId: payment.consultationId,
            amount: Number(payment.amount),
          },
        });

        return { received: true, status: "PAYMENT_SUCCESS" };
      }

      if (payload.event === "payment.failed") {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            metadata: {
              failureReason: payload.data.failureReason || "Declined",
              eventId: payload.eventId,
            },
          },
        });

        paymentTransactionsCounter.inc({
          status: "FAILED",
          provider: payment.provider,
        });

        await auditService.record({
          actorRole: "PAYMENT_GATEWAY",
          action: "PAYMENT_FAILED",
          resourceType: "Payment",
          resourceId: payment.id,
          outcome: AuditOutcome.FAILURE,
          metadata: {
            transactionId: payload.data.transactionId,
            failureReason: payload.data.failureReason,
          },
        });

        return { received: true, status: "PAYMENT_FAILED" };
      }

      return { received: true, status: "EVENT_UNHANDLED" };
    });
  }
}

export const paymentsService = new PaymentsService();
