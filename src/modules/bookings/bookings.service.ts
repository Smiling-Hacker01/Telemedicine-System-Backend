import { UserRole, AuditOutcome, ConsultationStatus } from "@prisma/client";
import {
  bookingsRepository,
  BookingsRepository,
} from "./bookings.repository.js";
import { auditService } from "../../shared/security/audit.service.js";
import { consultationBookingsCounter } from "../../infrastructure/observability/metrics.js";
import {
  NotFoundError,
  ForbiddenError,
} from "../../shared/errors/app-error.js";
import {
  CreateBookingInput,
  CancelBookingInput,
  QueryBookingsInput,
} from "./bookings.schemas.js";

export class BookingsService {
  constructor(private repo: BookingsRepository = bookingsRepository) {}

  async createBooking(
    patientId: string,
    input: CreateBookingInput,
    idempotencyKey?: string,
    clientIp?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    const consultation = await this.repo.createBookingAtomic({
      patientId,
      slotId: input.slotId,
      consultationType: input.consultationType,
      notes: input.notes,
      idempotencyKey,
    });

    consultationBookingsCounter.inc({ status: consultation.status });

    await auditService.record({
      actorId: patientId,
      actorRole: "PATIENT",
      action: "CONSULTATION_BOOKING_CREATED",
      resourceType: "Consultation",
      resourceId: consultation.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      correlationId,
      metadata: {
        bookingReference: consultation.bookingReference,
        doctorId: consultation.doctorId,
        slotId: consultation.slotId,
      },
    });

    return consultation;
  }

  async getBookingById(
    bookingId: string,
    requestingUser: { userId: string; role: UserRole },
  ) {
    const consultation = await this.repo.findById(bookingId);
    if (!consultation) {
      throw new NotFoundError("Consultation", bookingId);
    }

    // Strict Object-Level Authorization
    if (
      requestingUser.role === UserRole.PATIENT &&
      consultation.patientId !== requestingUser.userId
    ) {
      throw new ForbiddenError(
        "You can only view your own consultation bookings",
      );
    }

    if (
      requestingUser.role === UserRole.DOCTOR &&
      consultation.doctor.userId !== requestingUser.userId
    ) {
      throw new ForbiddenError(
        "You can only view consultations scheduled with you",
      );
    }

    return consultation;
  }

  async getMyBookings(
    requestingUser: { userId: string; role: UserRole },
    query: QueryBookingsInput,
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const statusFilter = query.status as ConsultationStatus | undefined;

    if (requestingUser.role === UserRole.PATIENT) {
      const { items, total } = await this.repo.findBookingsByPatient(
        requestingUser.userId,
        skip,
        limit,
        statusFilter,
      );
      return {
        items,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    // If Doctor, look up doctor ID first
    const doctorConsultation = await this.repo.findById(requestingUser.userId); // fallback check
    const doctorId = doctorConsultation?.doctorId || requestingUser.userId;

    const { items, total } = await this.repo.findBookingsByDoctor(
      doctorId,
      skip,
      limit,
      statusFilter,
    );

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async cancelBooking(
    bookingId: string,
    requestingUser: { userId: string; role: UserRole },
    input: CancelBookingInput,
    clientIp?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    const consultation = await this.repo.findById(bookingId);
    if (!consultation) {
      throw new NotFoundError("Consultation", bookingId);
    }

    // Strict Authorization: only patient, assigned doctor, or admin can cancel
    const isPatient = consultation.patientId === requestingUser.userId;
    const isDoctor = consultation.doctor.userId === requestingUser.userId;
    const isAdmin = requestingUser.role === UserRole.ADMIN;

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new ForbiddenError(
        "You do not have permission to cancel this consultation",
      );
    }

    const cancelled = await this.repo.cancelBookingTransaction(
      bookingId,
      requestingUser.userId,
      input.cancellationReason,
    );

    await auditService.record({
      actorId: requestingUser.userId,
      actorRole: requestingUser.role,
      action: "CONSULTATION_BOOKING_CANCELLED",
      resourceType: "Consultation",
      resourceId: bookingId,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      correlationId,
      metadata: { reason: input.cancellationReason },
    });

    return cancelled;
  }
}

export const bookingsService = new BookingsService();
