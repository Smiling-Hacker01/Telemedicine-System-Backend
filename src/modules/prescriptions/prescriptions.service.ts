import { UserRole, AuditOutcome, ConsultationStatus } from "@prisma/client";
import { prisma } from "../../config/database.js";
import {
  encryptData,
  decryptData,
  generateHmacSignature,
} from "../../shared/security/crypto.js";
import { auditService } from "../../shared/security/audit.service.js";
import { prescriptionsIssuedCounter } from "../../infrastructure/observability/metrics.js";
import { env } from "../../config/environment.js";
import {
  ConflictError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../../shared/errors/app-error.js";
import {
  CreatePrescriptionInput,
  MedicationItem,
} from "./prescriptions.schemas.js";

export class PrescriptionsService {
  async createPrescription(
    userId: string,
    input: CreatePrescriptionInput,
    clientIp?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    // 1. Fetch consultation
    const consultation = await prisma.consultation.findUnique({
      where: { id: input.consultationId },
      include: {
        doctor: true,
        prescription: true,
      },
    });

    if (!consultation) {
      throw new NotFoundError("Consultation", input.consultationId);
    }

    // 2. Strict authorization: Only the assigned doctor can issue a prescription
    if (consultation.doctor.userId !== userId) {
      throw new ForbiddenError(
        "You can only issue prescriptions for consultations assigned to you",
      );
    }

    // 3. Status validation: Consultation must be IN_PROGRESS or COMPLETED
    if (
      consultation.status !== ConsultationStatus.IN_PROGRESS &&
      consultation.status !== ConsultationStatus.COMPLETED
    ) {
      throw new ValidationError(
        `Prescription cannot be issued while consultation is in '${consultation.status}' status. It must be IN_PROGRESS or COMPLETED.`,
      );
    }

    // 4. Immutability check: Only 1 prescription per consultation
    if (consultation.prescription) {
      throw new ConflictError(
        "A prescription has already been issued for this consultation and is immutable",
      );
    }

    // 5. Encrypt Sensitive Protected Health Information (PHI) using AES-256-GCM
    const encryptedDiagnosis = encryptData(input.diagnosis);
    const encryptedMedications = encryptData(JSON.stringify(input.medications));
    const encryptedAdvice = input.advice ? encryptData(input.advice) : null;

    // 6. Generate digital signature (doctor authenticity & anti-tampering)
    const signaturePayload = `${consultation.doctorId}:${consultation.id}:${input.diagnosis}:${JSON.stringify(input.medications)}`;
    const digitalSignature = generateHmacSignature(
      signaturePayload,
      env.DATA_ENCRYPTION_KEY,
    );

    // 7. Persist encrypted prescription record
    const prescription = await prisma.prescription.create({
      data: {
        consultationId: consultation.id,
        doctorId: consultation.doctorId,
        patientId: consultation.patientId,
        diagnosis: encryptedDiagnosis,
        medications: encryptedMedications,
        advice: encryptedAdvice,
        digitalSignature,
        version: 1,
        isImmutable: true,
      },
    });

    prescriptionsIssuedCounter.inc();

    await auditService.record({
      actorId: userId,
      actorRole: "DOCTOR",
      action: "PRESCRIPTION_ISSUED",
      resourceType: "Prescription",
      resourceId: prescription.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      correlationId,
      metadata: {
        consultationId: consultation.id,
        doctorId: consultation.doctorId,
        patientId: consultation.patientId,
      },
    });

    // Return decrypted view to the issuing doctor
    return {
      id: prescription.id,
      consultationId: prescription.consultationId,
      doctorId: prescription.doctorId,
      patientId: prescription.patientId,
      diagnosis: input.diagnosis,
      medications: input.medications,
      advice: input.advice,
      digitalSignature: prescription.digitalSignature,
      createdAt: prescription.createdAt,
    };
  }

  async getPrescriptionByConsultationId(
    consultationId: string,
    requestingUser: { userId: string; role: UserRole },
  ) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        doctor: true,
        prescription: true,
      },
    });

    if (!consultation || !consultation.prescription) {
      throw new NotFoundError("Prescription for consultation", consultationId);
    }

    // Strict Authorization Check
    const isPatient = consultation.patientId === requestingUser.userId;
    const isDoctor = consultation.doctor.userId === requestingUser.userId;
    const isAdmin = requestingUser.role === UserRole.ADMIN;

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new ForbiddenError(
        "You do not have permission to view this medical prescription",
      );
    }

    const p = consultation.prescription;

    // Decrypt AES-256-GCM protected medical data
    const decryptedDiagnosis = decryptData(p.diagnosis);
    const decryptedMedications: MedicationItem[] = JSON.parse(
      decryptData(p.medications),
    );
    const decryptedAdvice = p.advice ? decryptData(p.advice) : undefined;

    return {
      id: p.id,
      consultationId: p.consultationId,
      doctorId: p.doctorId,
      patientId: p.patientId,
      diagnosis: decryptedDiagnosis,
      medications: decryptedMedications,
      advice: decryptedAdvice,
      digitalSignature: p.digitalSignature,
      version: p.version,
      createdAt: p.createdAt,
    };
  }
}

export const prescriptionsService = new PrescriptionsService();
