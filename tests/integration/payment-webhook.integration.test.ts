import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import {
  UserRole,
  SlotStatus,
  ConsultationStatus,
  PaymentStatus,
} from "@prisma/client";
import { createApp } from "../../src/app/create-app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/environment.js";
import { generateHmacSignature } from "../../src/shared/security/crypto.js";

describe("Payment Gateway & Webhook Signature Integration", () => {
  let app: FastifyInstance;
  let consultationId: string;
  let doctorId: string;
  let patientId: string;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();

    // Create doctor
    const doctorUser = await prisma.user.create({
      data: {
        email: `pay.doc.${Date.now()}@amrutam.co.in`,
        passwordHash: "dummy",
        role: UserRole.DOCTOR,
        doctor: {
          create: {
            licenseNumber: `PAY-DOC-${Date.now()}`,
            specialties: ["General"],
            consultationFee: 500.0,
            isVerified: true,
          },
        },
      },
      include: { doctor: true },
    });
    doctorId = doctorUser.doctor!.id;

    // Create patient
    const patientUser = await prisma.user.create({
      data: {
        email: `pay.patient.${Date.now()}@amrutam.co.in`,
        passwordHash: "dummy",
        role: UserRole.PATIENT,
      },
    });
    patientId = patientUser.id;

    // Create slot
    const slot = await prisma.availabilitySlot.create({
      data: {
        doctorId,
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 86400000 + 1800000),
        status: SlotStatus.BOOKED,
      },
    });

    // Create consultation in PENDING_PAYMENT
    const consultation = await prisma.consultation.create({
      data: {
        bookingReference: `AMR-PAY-${Date.now()}`,
        patientId,
        doctorId,
        slotId: slot.id,
        status: ConsultationStatus.PENDING_PAYMENT,
        scheduledStartTime: slot.startTime,
        scheduledEndTime: slot.endTime,
      },
    });
    consultationId = consultation.id;

    // Create Payment record
    await prisma.payment.create({
      data: {
        consultationId,
        amount: 500.0,
        currency: "INR",
        status: PaymentStatus.INITIATED,
        idempotencyKey: `pay_${consultationId}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { consultationId } });
    await prisma.consultation.deleteMany({ where: { id: consultationId } });
    await prisma.availabilitySlot.deleteMany({ where: { doctorId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.user.deleteMany({ where: { id: patientId } });
    await app.close();
  });

  it("should REJECT webhook requests with missing or tampered HMAC signature (401 Unauthorized)", async () => {
    const rawPayload = JSON.stringify({
      event: "payment.succeeded",
      eventId: "evt_123",
      data: {
        consultationId,
        transactionId: "txn_fake_123",
        amount: 500,
        currency: "INR",
      },
    });

    // 1. Missing signature
    const missingRes = await app.inject({
      method: "POST",
      url: "/api/v1/payments/webhook",
      payload: JSON.parse(rawPayload),
    });
    expect(missingRes.statusCode).toBe(401);

    // 2. Tampered / invalid signature
    const invalidRes = await app.inject({
      method: "POST",
      url: "/api/v1/payments/webhook",
      headers: { "x-amrutam-signature": "invalid_signature_hex" },
      payload: JSON.parse(rawPayload),
    });
    expect(invalidRes.statusCode).toBe(401);
  });

  it("should process verified webhook, transition payment to SUCCESS, and transition consultation to SCHEDULED", async () => {
    const webhookBody = {
      event: "payment.succeeded",
      eventId: `evt_${Date.now()}`,
      data: {
        consultationId,
        transactionId: `txn_real_${Date.now()}`,
        amount: 500,
        currency: "INR",
      },
    };

    const rawPayload = JSON.stringify(webhookBody);
    const validSignature = generateHmacSignature(
      rawPayload,
      env.PAYMENT_WEBHOOK_SECRET,
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/webhook",
      headers: {
        "x-amrutam-signature": validSignature,
        "content-type": "application/json",
      },
      payload: webhookBody,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.received).toBe(true);
    expect(body.status).toBe("PAYMENT_SUCCESS");

    // Verify DB state
    const updatedConsultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { payment: true },
    });

    expect(updatedConsultation?.status).toBe(ConsultationStatus.SCHEDULED);
    expect(updatedConsultation?.payment?.status).toBe(PaymentStatus.SUCCESS);
  });

  it("should handle duplicate webhook delivery idempotently without side-effects", async () => {
    const duplicateBody = {
      event: "payment.succeeded",
      eventId: `evt_duplicate_${Date.now()}`,
      data: {
        consultationId,
        transactionId: "txn_duplicate_123",
        amount: 500,
        currency: "INR",
      },
    };

    const rawPayload = JSON.stringify(duplicateBody);
    const validSignature = generateHmacSignature(
      rawPayload,
      env.PAYMENT_WEBHOOK_SECRET,
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/webhook",
      headers: {
        "x-amrutam-signature": validSignature,
        "content-type": "application/json",
      },
      payload: duplicateBody,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("IDEMPOTENT_IGNORE");
  });
});
