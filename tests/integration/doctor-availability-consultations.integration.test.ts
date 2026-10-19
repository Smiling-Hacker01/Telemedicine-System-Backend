import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { UserRole, SlotStatus } from "@prisma/client";
import { createApp } from "../../src/app/create-app.js";
import { prisma } from "../../src/config/database.js";

describe("Doctor Availability & Consultation Workflows", () => {
  let app: FastifyInstance;
  let doctorToken: string;
  let doctorUserId: string;
  let doctorId: string;
  let patientToken: string;
  let patientId: string;
  let slotId: string;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();

    // 1. Doctor Registration
    const docRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `avail.doc.${Date.now()}@amrutam.co.in`,
        password: "Password123!",
        role: UserRole.DOCTOR,
        firstName: "Dr. Availability",
        lastName: "Expert",
      },
    });
    doctorToken = docRes.json().data.tokens.accessToken;
    doctorUserId = docRes.json().data.user.id;

    const profRes = await app.inject({
      method: "POST",
      url: "/api/v1/doctors/profile",
      headers: { authorization: `Bearer ${doctorToken}` },
      payload: {
        licenseNumber: `AVL-LIC-${Date.now()}`,
        specialties: ["Ayurveda"],
        experienceYears: 8,
        consultationFee: 500,
      },
    });
    doctorId = profRes.json().data.doctor.id;

    // 2. Patient Registration
    const patRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `avail.patient.${Date.now()}@amrutam.co.in`,
        password: "Password123!",
        role: UserRole.PATIENT,
        firstName: "Test",
        lastName: "Patient",
      },
    });
    patientToken = patRes.json().data.tokens.accessToken;
    patientId = patRes.json().data.user.id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { consultation: { doctorId } } });
    await prisma.consultation.deleteMany({ where: { doctorId } });
    await prisma.availabilitySlot.deleteMany({ where: { doctorId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.user.deleteMany({
      where: { id: { in: [doctorUserId, patientId] } },
    });
    await app.close();
  });

  it("Doctor: should create a new availability slot", async () => {
    const tomorrow = new Date(Date.now() + 86400000);
    const start = new Date(tomorrow.setHours(14, 0, 0, 0));
    const end = new Date(tomorrow.setHours(14, 30, 0, 0));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/availability",
      headers: { authorization: `Bearer ${doctorToken}` },
      payload: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.slot.status).toBe(SlotStatus.AVAILABLE);

    slotId = body.data.slot.id;
  });

  it("Doctor: should REJECT overlapping availability slot creation (409 Conflict)", async () => {
    const tomorrow = new Date(Date.now() + 86400000);
    // Overlapping: 14:15 to 14:45 overlaps with 14:00 to 14:30
    const start = new Date(tomorrow.setHours(14, 15, 0, 0));
    const end = new Date(tomorrow.setHours(14, 45, 0, 0));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/availability",
      headers: { authorization: `Bearer ${doctorToken}` },
      payload: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().errorCode).toBe("CONFLICT");
  });

  it("Doctor: should generate bulk slots across working hours", async () => {
    const nextWeek = new Date(Date.now() + 7 * 86400000);
    const dateStr = nextWeek.toISOString().slice(0, 10);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/availability/bulk",
      headers: { authorization: `Bearer ${doctorToken}` },
      payload: {
        date: dateStr,
        startHour: 9,
        endHour: 12,
        slotDurationMinutes: 30,
        bufferMinutes: 10,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.createdCount).toBeGreaterThan(0);
  });

  it("Patient & Doctor: Consultation booking, lifecycle progression, and cancellation", async () => {
    // 1. Patient books the slot
    const bookRes = await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      headers: { authorization: `Bearer ${patientToken}` },
      payload: {
        slotId,
        consultationType: "VIDEO",
        notes: "Consultation lifecycle test",
      },
    });

    expect(bookRes.statusCode).toBe(201);
    const consultationId = bookRes.json().data.consultation.id;

    // 2. Doctor transitions status to IN_PROGRESS (from PENDING_PAYMENT or SCHEDULED)
    // First simulate payment success:
    await prisma.consultation.update({
      where: { id: consultationId },
      data: { status: "SCHEDULED" },
    });

    const startRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/consultations/${consultationId}/status`,
      headers: { authorization: `Bearer ${doctorToken}` },
      payload: { status: "IN_PROGRESS" },
    });

    expect(startRes.statusCode).toBe(200);
    expect(startRes.json().data.consultation.status).toBe("IN_PROGRESS");

    // 3. Complete the consultation
    const completeRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/consultations/${consultationId}/status`,
      headers: { authorization: `Bearer ${doctorToken}` },
      payload: {
        status: "COMPLETED",
        notes: "Patient responded well to advice",
      },
    });

    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().data.consultation.status).toBe("COMPLETED");

    // 4. Invalid transition from COMPLETED should be rejected
    const invalidRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/consultations/${consultationId}/status`,
      headers: { authorization: `Bearer ${doctorToken}` },
      payload: { status: "SCHEDULED" },
    });

    expect(invalidRes.statusCode).toBe(409);
  });
});
