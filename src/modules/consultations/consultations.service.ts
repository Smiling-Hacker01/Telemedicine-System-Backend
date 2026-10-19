import { ConsultationStatus, UserRole, AuditOutcome } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { auditService } from '../../shared/security/audit.service.js';
import {
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../../shared/errors/app-error.js';
import { UpdateConsultationStatusInput } from './consultations.schemas.js';

const VALID_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  [ConsultationStatus.PENDING_PAYMENT]: [ConsultationStatus.SCHEDULED, ConsultationStatus.CANCELLED],
  [ConsultationStatus.SCHEDULED]: [
    ConsultationStatus.IN_PROGRESS,
    ConsultationStatus.CANCELLED,
    ConsultationStatus.NO_SHOW,
  ],
  [ConsultationStatus.IN_PROGRESS]: [ConsultationStatus.COMPLETED, ConsultationStatus.CANCELLED],
  [ConsultationStatus.COMPLETED]: [],
  [ConsultationStatus.CANCELLED]: [],
  [ConsultationStatus.NO_SHOW]: [],
};

export class ConsultationsService {
  async updateStatus(
    consultationId: string,
    requestingUser: { userId: string; role: UserRole },
    input: UpdateConsultationStatusInput,
    clientIp?: string,
    userAgent?: string,
    correlationId?: string
  ) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { doctor: true },
    });

    if (!consultation) {
      throw new NotFoundError('Consultation', consultationId);
    }

    // Role check: only assigned doctor or admin can change lifecycle to IN_PROGRESS, COMPLETED, NO_SHOW
    const isAssignedDoctor = consultation.doctor.userId === requestingUser.userId;
    const isAdmin = requestingUser.role === UserRole.ADMIN;

    if (!isAssignedDoctor && !isAdmin) {
      throw new ForbiddenError('Only the assigned doctor or administrator can modify the consultation state');
    }

    const currentStatus = consultation.status;
    const nextStatus = input.status;

    // Check valid state transition
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(nextStatus)) {
      throw new ConflictError(
        `Invalid consultation state transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: [${allowed?.join(', ') || 'none'}]`
      );
    }

    const data: {
      status: ConsultationStatus;
      actualStartTime?: Date;
      actualEndTime?: Date;
      notes?: string;
    } = {
      status: nextStatus,
      notes: input.notes !== undefined ? input.notes : consultation.notes || undefined,
    };

    if (nextStatus === ConsultationStatus.IN_PROGRESS && !consultation.actualStartTime) {
      data.actualStartTime = new Date();
    }

    if (nextStatus === ConsultationStatus.COMPLETED) {
      data.actualEndTime = new Date();
    }

    const updated = await prisma.consultation.update({
      where: { id: consultationId },
      data,
    });

    await auditService.record({
      actorId: requestingUser.userId,
      actorRole: requestingUser.role,
      action: `CONSULTATION_STATUS_${nextStatus}`,
      resourceType: 'Consultation',
      resourceId: consultationId,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      correlationId,
      metadata: { previousStatus: currentStatus, newStatus: nextStatus },
    });

    return updated;
  }

  async getConsultation(consultationId: string, requestingUser: { userId: string; role: UserRole }) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        doctor: { include: { user: { select: { email: true, profile: true } } } },
        patient: { select: { id: true, email: true, profile: true } },
        slot: true,
        prescription: true,
        payment: true,
      },
    });

    if (!consultation) {
      throw new NotFoundError('Consultation', consultationId);
    }

    // Object-level permission check
    const isPatient = consultation.patientId === requestingUser.userId;
    const isDoctor = consultation.doctor.userId === requestingUser.userId;
    const isAdmin = requestingUser.role === UserRole.ADMIN;

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new ForbiddenError('You do not have permission to view this consultation');
    }

    return consultation;
  }
}

export const consultationsService = new ConsultationsService();
