import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { UserRole, SlotStatus } from "@prisma/client";
import { createApp } from "../../src/app/create-app.js";
import { prisma } from "../../src/config/database.js";

describe("Idempotency Key Middleware Integration", () => {
  let app: FastifyInstance;
  let patientToken: string;
  let slotId: string;
  let doctorId: string;
  let patientId: string;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();

    // Create doctor
    const doc = await prisma.user.create({
      data: {
        email: `idempotent.doc.${Date.now()}@amrutam.co.in`,
        passwordHash: "dummy",
        role: UserRole.DOCTOR,
        doctor: {
          create: {
            licenseNumber: `IDEM-DOC-${Date.now()}`,
            specialties: ["General"],
            consultationFee: 400.0,
            isVerified: true,
          },
        },
      },
      include: { doctor: true },
    });
    doctorId = doc.doctor!.id;

    // Create patient
    const regRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `idempotent.patient.${Date.now()}@amrutam.co.in`,
        password: "Password123!",
        firstName: "Idem",
        lastName: "Patient",
      },
    });
    patientToken = regRes.json().data.tokens.accessToken;
    patientId = regRes.json().data.user.id;

    // Create slot
    const slot = await prisma.availabilitySlot.create({
      data: {
        doctorId,
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 86400000 + 1800000),
        status: SlotStatus.AVAILABLE,
      },
    });
    slotId = slot.id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { consultation: { doctorId } } });
    await prisma.consultation.deleteMany({ where: { doctorId } });
    await prisma.availabilitySlot.deleteMany({ where: { doctorId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.user.deleteMany({ where: { id: patientId } });
    await app.close();
  });

  it("should replay cached response on network retry with identical Idempotency-Key", async () => {
    const idempotencyKey = `idem-key-test-${Date.now()}`;
    const payload = {
      slotId,
      consultationType: "VIDEO",
      notes: "First booking attempt",
    };

    // First request
    const firstRes = await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      headers: {
        authorization: `Bearer ${patientToken}`,
        "idempotency-key": idempotencyKey,
      },
      payload,
    });

    expect(firstRes.statusCode).toBe(201);
    const firstBody = firstRes.json();
    expect(firstBody.success).toBe(true);
    const bookingRef = firstBody.data.consultation.bookingReference;

    // Second request (simulating network retry with the exact same Idempotency-Key)
    const secondRes = await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      headers: {
        authorization: `Bearer ${patientToken}`,
        "idempotency-key": idempotencyKey,
      },
      payload,
    });

    expect(secondRes.statusCode).toBe(201);
    expect(secondRes.headers["x-idempotent-replay"]).toBe("true");
    const secondBody = secondRes.json();
    expect(secondBody.data.consultation.bookingReference).toBe(bookingRef);
  });

  it("should reject request with 422 if Idempotency-Key is reused with a different payload", async () => {
    // Create a fresh available slot for this collision test
    const newSlot = await prisma.availabilitySlot.create({
      data: {
        doctorId,
        startTime: new Date(Date.now() + 172800000), // 2 days in future
        endTime: new Date(Date.now() + 172800000 + 1800000),
        status: SlotStatus.AVAILABLE,
      },
    });

    const idempotencyKey = `idem-collision-key-${Date.now()}`;

    // Request 1: Succeeds and saves the idempotent response
    const firstRes = await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      headers: {
        authorization: `Bearer ${patientToken}`,
        "idempotency-key": idempotencyKey,
      },
      payload: {
        slotId: newSlot.id,
        consultationType: "VIDEO",
        notes: "Original payload",
      },
    });
    expect(firstRes.statusCode).toBe(201);

    // Request 2 with same key but altered payload
    const conflictRes = await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      headers: {
        authorization: `Bearer ${patientToken}`,
        "idempotency-key": idempotencyKey,
      },
      payload: {
        slotId: newSlot.id,
        consultationType: "AUDIO",
        notes: "DIFFERENT PAYLOAD",
      },
    });

    expect(conflictRes.statusCode).toBe(422);
    expect(conflictRes.json().errorCode).toBe("UNPROCESSABLE_ENTITY");
  });
});
