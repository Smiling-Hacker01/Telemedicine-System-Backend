import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { UserRole, SlotStatus, ConsultationStatus } from "@prisma/client";
import { createApp } from "../../src/app/create-app.js";
import { prisma } from "../../src/config/database.js";
import { decryptData } from "../../src/shared/security/crypto.js";

describe("Prescriptions & PHI Security Integration", () => {
  let app: FastifyInstance;
  let doctorToken: string;
  let patientToken: string;
  let otherPatientToken: string;
  let consultationId: string;
  let doctorId: string;
  let patientId: string;
  let otherPatientId: string;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();

    // 1. Create Doctor
    const docRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `rx.doctor.${Date.now()}@amrutam.co.in`,
        password: "Password123!",
        role: UserRole.DOCTOR,
        firstName: "Dr. Ayurveda",
        lastName: "Sharma",
      },
    });
    doctorToken = docRes.json().data.tokens.accessToken;
    const docUserId = docRes.json().data.user.id;

    // Doctor profile
    const profileRes = await app.inject({
      method: "POST",
      url: "/api/v1/doctors/profile",
      headers: { authorization: `Bearer ${doctorToken}` },
      payload: {
        licenseNumber: `AYUR-${Date.now()}`,
        specialties: ["Ayurveda", "Panchakarma"],
        experienceYears: 12,
        consultationFee: 800,
      },
    });
    doctorId = profileRes.json().data.doctor.id;

    // 2. Create Patient 1
    const p1Res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `rx.patient1.${Date.now()}@amrutam.co.in`,
        password: "Password123!",
        role: UserRole.PATIENT,
        firstName: "Rahul",
        lastName: "Verma",
      },
    });
    patientToken = p1Res.json().data.tokens.accessToken;
    patientId = p1Res.json().data.user.id;

    // 3. Create Patient 2 (Unauthorized third-party)
    const p2Res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `rx.patient2.${Date.now()}@amrutam.co.in`,
        password: "Password123!",
        role: UserRole.PATIENT,
        firstName: "Sneha",
        lastName: "Patel",
      },
    });
    otherPatientToken = p2Res.json().data.tokens.accessToken;
    otherPatientId = p2Res.json().data.user.id;

    // 4. Create slot and consultation
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const slot = await prisma.availabilitySlot.create({
      data: {
        doctorId,
        startTime: tomorrow,
        endTime: new Date(tomorrow.getTime() + 30 * 60 * 1000),
        status: SlotStatus.BOOKED,
      },
    });

    const consultation = await prisma.consultation.create({
      data: {
        bookingReference: `AMR-RX-${Date.now()}`,
        patientId,
        doctorId,
        slotId: slot.id,
        status: ConsultationStatus.IN_PROGRESS,
        scheduledStartTime: slot.startTime,
        scheduledEndTime: slot.endTime,
      },
    });
    consultationId = consultation.id;
  });

  afterAll(async () => {
    await prisma.prescription.deleteMany({ where: { consultationId } });
    await prisma.consultation.deleteMany({ where: { id: consultationId } });
    await prisma.availabilitySlot.deleteMany({ where: { doctorId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.user.deleteMany({
      where: { id: { in: [patientId, otherPatientId] } },
    });
    await app.close();
  });

  it("should allow the assigned doctor to issue an encrypted prescription", async () => {
    const rawDiagnosis =
      "Vata imbalance with chronic insomnia and digestive fatigue";
    const medications = [
      {
        name: "Ashwagandha Churna",
        dosage: "3 grams",
        frequency: "Twice daily with warm milk",
        durationDays: 30,
        instructions: "Take 30 minutes before sleep",
      },
      {
        name: "Triphala Tablets",
        dosage: "1000mg",
        frequency: "Once before bed",
        durationDays: 15,
      },
    ];

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prescriptions",
      headers: { authorization: `Bearer ${doctorToken}` },
      payload: {
        consultationId,
        diagnosis: rawDiagnosis,
        medications,
        advice: "Practice Pranayama for 15 minutes daily.",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.prescription.diagnosis).toBe(rawDiagnosis);
    expect(body.data.prescription.digitalSignature).toBeDefined();

    // Verify database row: the diagnosis and medications MUST BE ENCRYPTED in the DB
    const dbRecord = await prisma.prescription.findUnique({
      where: { consultationId },
    });

    expect(dbRecord).toBeDefined();
    expect(dbRecord!.diagnosis).not.toEqual(rawDiagnosis);
    expect(dbRecord!.diagnosis).toContain(":"); // iv:authTag:ciphertext format

    // Verify decryption matches
    const decrypted = decryptData(dbRecord!.diagnosis);
    expect(decrypted).toBe(rawDiagnosis);
  });

  it("should allow the consultation patient to view their own decrypted prescription", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/prescriptions/consultation/${consultationId}`,
      headers: { authorization: `Bearer ${patientToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.prescription.diagnosis).toContain("Vata imbalance");
    expect(body.data.prescription.medications).toHaveLength(2);
  });

  it("should DENY unauthorized third-party patients from viewing the prescription (Broken Object Level Auth / BOLA prevention)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/prescriptions/consultation/${consultationId}`,
      headers: { authorization: `Bearer ${otherPatientToken}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.errorCode).toBe("FORBIDDEN");
  });
});
