import {
  Prisma,
  SlotStatus,
  ConsultationStatus,
  ConsultationType,
  PaymentStatus,
  Consultation,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app-error.js';

export interface BookingTxParams {
  patientId: string;
  slotId: string;
  consultationType: ConsultationType;
  notes?: string;
  idempotencyKey?: string;
}

export class BookingsRepository {
  /**
   * Executes an atomic slot reservation using PostgreSQL SELECT ... FOR UPDATE pessimistic row-level locking.
   * Guarantees zero double-booking under extreme concurrent conditions.
   */
  async createBookingAtomic(params: BookingTxParams): Promise<Consultation> {
    return prisma.$transaction(
      async (tx) => {
        // 1. Acquire pessimistic row-level lock on the availability slot
        const lockedSlots = await tx.$queryRaw<
          Array<{
            id: string;
            doctorId: string;
            startTime: Date;
            endTime: Date;
            status: SlotStatus;
          }>
        >`
          SELECT id, "doctorId", "startTime", "endTime", status 
          FROM availability_slots 
          WHERE id = ${params.slotId}::uuid 
          FOR UPDATE
        `;

        if (!lockedSlots || lockedSlots.length === 0) {
          throw new NotFoundError('AvailabilitySlot', params.slotId);
        }

        const slot = lockedSlots[0]!;

        // 2. Validate availability status
        if (slot.status !== SlotStatus.AVAILABLE) {
          throw new ConflictError(
            `The requested slot is already ${slot.status.toLowerCase()} by another patient. Please select another slot.`
          );
        }

        // 3. Verify slot is in the future
        if (new Date(slot.startTime) <= new Date()) {
          throw new ValidationError('Cannot book a slot in the past');
        }

        // 4. Fetch doctor fee
        const doctor = await tx.doctor.findUnique({
          where: { id: slot.doctorId },
          select: { id: true, consultationFee: true, isVerified: true },
        });

        if (!doctor) {
          throw new NotFoundError('Doctor', slot.doctorId);
        }

        // 5. Update slot to BOOKED
        await tx.availabilitySlot.update({
          where: { id: slot.id },
          data: { status: SlotStatus.BOOKED },
        });

        // 6. Generate booking reference: AMR-YYYYMMDD-<RANDOM>
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        const bookingReference = `AMR-${dateStr}-${randomSuffix}`;

        // 7. Create Consultation record
        const consultation = await tx.consultation.create({
          data: {
            bookingReference,
            patientId: params.patientId,
            doctorId: slot.doctorId,
            slotId: slot.id,
            status: ConsultationStatus.PENDING_PAYMENT,
            consultationType: params.consultationType,
            scheduledStartTime: slot.startTime,
            scheduledEndTime: slot.endTime,
            meetingLink: `https://meet.amrutam.co.in/room/${bookingReference}`,
            notes: params.notes,
          },
          include: {
            doctor: {
              include: {
                user: { select: { email: true, profile: true } },
              },
            },
            slot: true,
          },
        });

        // 8. Create Payment record (Initiated)
        const paymentKey = params.idempotencyKey || `pay_${consultation.id}_${Date.now()}`;
        await tx.payment.create({
          data: {
            consultationId: consultation.id,
            amount: doctor.consultationFee,
            currency: 'INR',
            status: PaymentStatus.INITIATED,
            idempotencyKey: paymentKey,
          },
        });

        return consultation;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 10000, // 10s max lock timeout
      }
    );
  }

  async findById(id: string) {
    return prisma.consultation.findUnique({
      where: { id },
      include: {
        doctor: {
          include: { user: { select: { email: true, profile: true } } },
        },
        patient: {
          select: { id: true, email: true, profile: true },
        },
        slot: true,
        prescription: true,
        payment: true,
      },
    });
  }

  async findByBookingReference(bookingReference: string) {
    return prisma.consultation.findUnique({
      where: { bookingReference },
      include: {
        doctor: {
          include: { user: { select: { email: true, profile: true } } },
        },
        patient: {
          select: { id: true, email: true, profile: true },
        },
        slot: true,
        prescription: true,
        payment: true,
      },
    });
  }

  async findBookingsByPatient(patientId: string, skip: number, take: number, status?: ConsultationStatus) {
    const where: Prisma.ConsultationWhereInput = {
      patientId,
      status,
    };

    const [items, total] = await Promise.all([
      prisma.consultation.findMany({
        where,
        skip,
        take,
        orderBy: { scheduledStartTime: 'desc' },
        include: {
          doctor: {
            include: { user: { select: { email: true, profile: true } } },
          },
          slot: true,
          payment: true,
        },
      }),
      prisma.consultation.count({ where }),
    ]);

    return { items, total };
  }

  async findBookingsByDoctor(doctorId: string, skip: number, take: number, status?: ConsultationStatus) {
    const where: Prisma.ConsultationWhereInput = {
      doctorId,
      status,
    };

    const [items, total] = await Promise.all([
      prisma.consultation.findMany({
        where,
        skip,
        take,
        orderBy: { scheduledStartTime: 'asc' },
        include: {
          patient: { select: { id: true, email: true, profile: true } },
          slot: true,
          payment: true,
        },
      }),
      prisma.consultation.count({ where }),
    ]);

    return { items, total };
  }

  async cancelBookingTransaction(
    consultationId: string,
    cancelledBy: string,
    reason: string
  ): Promise<Consultation> {
    return prisma.$transaction(async (tx) => {
      const consultation = await tx.consultation.findUnique({
        where: { id: consultationId },
        include: { slot: true, payment: true },
      });

      if (!consultation) {
        throw new NotFoundError('Consultation', consultationId);
      }

      if (
        consultation.status === ConsultationStatus.COMPLETED ||
        consultation.status === ConsultationStatus.CANCELLED
      ) {
        throw new ConflictError(`Cannot cancel a consultation that is already ${consultation.status}`);
      }

      // Update consultation status
      const updatedConsultation = await tx.consultation.update({
        where: { id: consultationId },
        data: {
          status: ConsultationStatus.CANCELLED,
          cancelledBy,
          cancellationReason: reason,
        },
      });

      // Free up the slot so it can be booked again if slot is still in the future
      if (new Date(consultation.slot.startTime) > new Date()) {
        await tx.availabilitySlot.update({
          where: { id: consultation.slotId },
          data: { status: SlotStatus.AVAILABLE },
        });
      }

      // If payment was SUCCESS, trigger refund status
      if (consultation.payment && consultation.payment.status === PaymentStatus.SUCCESS) {
        await tx.payment.update({
          where: { id: consultation.payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }

      return updatedConsultation;
    });
  }
}

export const bookingsRepository = new BookingsRepository();
