import { AuditOutcome } from '@prisma/client';
import { doctorsRepository, DoctorsRepository } from './doctors.repository.js';
import { auditService } from '../../shared/security/audit.service.js';
import {
  ConflictError,
  NotFoundError,
} from '../../shared/errors/app-error.js';
import {
  CreateDoctorProfileInput,
  UpdateDoctorProfileInput,
  VerifyDoctorInput,
} from './doctors.schemas.js';

export class DoctorsService {
  constructor(private repo: DoctorsRepository = doctorsRepository) {}

  async createProfile(userId: string, input: CreateDoctorProfileInput, clientIp?: string, userAgent?: string, correlationId?: string) {
    const existing = await this.repo.findByUserId(userId);
    if (existing) {
      throw new ConflictError('A doctor profile already exists for this user account');
    }

    const licenseConflict = await this.repo.findByLicense(input.licenseNumber);
    if (licenseConflict) {
      throw new ConflictError('A doctor profile with this medical license number already exists');
    }

    const doctor = await this.repo.createDoctor(userId, input);

    await auditService.record({
      actorId: userId,
      actorRole: 'DOCTOR',
      action: 'DOCTOR_PROFILE_CREATED',
      resourceType: 'Doctor',
      resourceId: doctor.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      correlationId,
      metadata: { licenseNumber: input.licenseNumber },
    });

    return doctor;
  }

  async getProfileByUserId(userId: string) {
    const doctor = await this.repo.findByUserId(userId);
    if (!doctor) {
      throw new NotFoundError('Doctor profile');
    }
    return doctor;
  }

  async getDoctorById(id: string) {
    const doctor = await this.repo.findById(id);
    if (!doctor) {
      throw new NotFoundError('Doctor', id);
    }
    return doctor;
  }

  async updateProfile(userId: string, input: UpdateDoctorProfileInput) {
    const doctor = await this.repo.findByUserId(userId);
    if (!doctor) {
      throw new NotFoundError('Doctor profile');
    }

    return this.repo.updateDoctor(doctor.id, input);
  }

  async verifyDoctor(adminId: string, doctorId: string, input: VerifyDoctorInput) {
    const doctor = await this.repo.findById(doctorId);
    if (!doctor) {
      throw new NotFoundError('Doctor', doctorId);
    }

    const updated = await this.repo.updateDoctor(doctorId, { isVerified: input.isVerified });

    await auditService.record({
      actorId: adminId,
      actorRole: 'ADMIN',
      action: input.isVerified ? 'DOCTOR_VERIFIED' : 'DOCTOR_UNVERIFIED',
      resourceType: 'Doctor',
      resourceId: doctorId,
      outcome: AuditOutcome.SUCCESS,
    });

    return updated;
  }
}

export const doctorsService = new DoctorsService();
