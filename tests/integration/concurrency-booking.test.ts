import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { UserRole, SlotStatus, ConsultationType } from "@prisma/client";
import { prisma } from "../../src/config/database.js";
import { bookingsRepository } from "../../src/modules/bookings/bookings.repository.js";
import { ConflictError } from "../../src/shared/errors/app-error.js";

describe("Concurrency & Race-Condition Safe Booking", () => {
  let doctorId: string;
  let patientIds: string[] = [];

  beforeAll(async () => {
    // 1. Create a test doctor
    const doctorUser = await prisma.user.create({
      data: {
        email: `concurrency.doc.${Date.now()}@amrutam.co.in`,
        passwordHash: "dummy_hash",
        role: UserRole.DOCTOR,
        profile: {
          create: { firstName: "Dr. Concurrency", lastName: "Specialist" },
        },
        doctor: {
          create: {
            licenseNumber: `CONC-LIC-${Date.now()}`,
            specialties: ["General Medicine"],
            consultationFee: 750.0,
            isVerified: true,
          },
        },
      },
      include: { doctor: true },
    });
    doctorId = doctorUser.doctor!.id;

    // 2. Create 10 concurrent patient accounts
    for (let i = 0; i < 10; i++) {
      const patient = await prisma.user.create({
        data: {
          email: `patient.concurrent.${i}.${Date.now()}@amrutam.co.in`,
          passwordHash: "dummy_hash",
          role: UserRole.PATIENT,
          profile: {
            create: { firstName: `Patient_${i}`, lastName: "Test" },
          },
        },
      });
      patientIds.push(patient.id);
    }
  });

  afterAll(async () => {
    // Cleanup created test records (delete payments first to satisfy foreign key)
    await prisma.payment.deleteMany({ where: { consultation: { doctorId } } });
    await prisma.consultation.deleteMany({ where: { doctorId } });
    await prisma.availabilitySlot.deleteMany({ where: { doctorId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    for (const pid of patientIds) {
      await prisma.user.deleteMany({ where: { id: pid } });
    }
  });

  it("MUST prevent double booking: when 10 patients attempt to book the exact same slot concurrently, exactly 1 succeeds and 9 fail", async () => {
    // Create exactly ONE single available slot for the doctor
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const slotStart = new Date(tomorrow.setHours(10, 0, 0, 0));
    const slotEnd = new Date(tomorrow.setHours(10, 30, 0, 0));

    const singleSlot = await prisma.availabilitySlot.create({
      data: {
        doctorId,
        startTime: slotStart,
        endTime: slotEnd,
        status: SlotStatus.AVAILABLE,
      },
    });

    // Launch 10 simultaneous concurrent booking attempts for this single slot
    const concurrentAttempts = patientIds.map((patientId) =>
      bookingsRepository.createBookingAtomic({
        patientId,
        slotId: singleSlot.id,
        consultationType: ConsultationType.VIDEO,
        notes: `Simultaneous booking attempt by ${patientId}`,
      }),
    );

    const results = await Promise.allSettled(concurrentAttempts);

    const successfulBookings = results.filter((r) => r.status === "fulfilled");
    const failedBookings = results.filter((r) => r.status === "rejected");

    // CRITICAL INVARIANT: Exactly 1 succeeds, exactly 9 fail
    expect(successfulBookings).toHaveLength(1);
    expect(failedBookings).toHaveLength(9);

    // Verify all 9 rejections were concurrency conflicts (ConflictError or DB Serialization/Write conflict)
    for (const failure of failedBookings) {
      if (failure.status === "rejected") {
        const error = failure.reason;
        const isConflict =
          error instanceof ConflictError ||
          error?.name === "ConflictError" ||
          error?.code === "P2034" || // Prisma write conflict
          error?.message?.includes("conflict") ||
          error?.message?.includes("already");
        expect(isConflict).toBe(true);
      }
    }

    // Verify database state: exactly 1 consultation is linked to this slot
    const bookingsInDb = await prisma.consultation.findMany({
      where: { slotId: singleSlot.id },
    });
    expect(bookingsInDb).toHaveLength(1);

    // Verify slot status in DB is BOOKED
    const updatedSlot = await prisma.availabilitySlot.findUnique({
      where: { id: singleSlot.id },
    });
    expect(updatedSlot?.status).toBe(SlotStatus.BOOKED);
  });
});
