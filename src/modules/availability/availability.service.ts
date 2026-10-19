import { SlotStatus, AuditOutcome } from '@prisma/client';
import { availabilityRepository, AvailabilityRepository } from './availability.repository.js';
import { doctorsRepository, DoctorsRepository } from '../doctors/doctors.repository.js';
import { auditService } from '../../shared/security/audit.service.js';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../../shared/errors/app-error.js';
import {
  CreateSlotInput,
  BulkCreateSlotsInput,
  QuerySlotsInput,
} from './availability.schemas.js';

export class AvailabilityService {
  constructor(
    private repo: AvailabilityRepository = availabilityRepository,
    private docRepo: DoctorsRepository = doctorsRepository
  ) {}

  async createSlot(userId: string, input: CreateSlotInput) {
    const doctor = await this.docRepo.findByUserId(userId);
    if (!doctor) {
      throw new NotFoundError('Doctor profile');
    }

    const start = new Date(input.startTime);
    const end = new Date(input.endTime);

    if (start <= new Date()) {
      throw new ValidationError('Slot startTime must be strictly in the future');
    }

    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    if (durationMinutes < 15 || durationMinutes > 240) {
      throw new ValidationError('Slot duration must be between 15 minutes and 4 hours');
    }

    const overlapping = await this.repo.findOverlappingSlot(doctor.id, start, end);
    if (overlapping) {
      throw new ConflictError('This slot overlaps with an existing availability slot for the doctor');
    }

    const slot = await this.repo.createSlot({
      doctorId: doctor.id,
      startTime: start,
      endTime: end,
    });

    await auditService.record({
      actorId: userId,
      actorRole: 'DOCTOR',
      action: 'AVAILABILITY_SLOT_CREATED',
      resourceType: 'AvailabilitySlot',
      resourceId: slot.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { doctorId: doctor.id, startTime: start.toISOString(), endTime: end.toISOString() },
    });

    return slot;
  }

  async bulkCreateSlots(userId: string, input: BulkCreateSlotsInput) {
    const doctor = await this.docRepo.findByUserId(userId);
    if (!doctor) {
      throw new NotFoundError('Doctor profile');
    }

    const slotsToInsert: Array<{ doctorId: string; startTime: Date; endTime: Date; status: SlotStatus }> = [];
    const baseDate = new Date(`${input.date}T00:00:00.000Z`);

    let currentMinutes = input.startHour * 60;
    const endMinutes = input.endHour * 60;

    while (currentMinutes + input.slotDurationMinutes <= endMinutes) {
      const slotStart = new Date(baseDate.getTime() + currentMinutes * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + input.slotDurationMinutes * 60 * 1000);

      if (slotStart > new Date()) {
        const overlapping = await this.repo.findOverlappingSlot(doctor.id, slotStart, slotEnd);
        if (!overlapping) {
          slotsToInsert.push({
            doctorId: doctor.id,
            startTime: slotStart,
            endTime: slotEnd,
            status: SlotStatus.AVAILABLE,
          });
        }
      }

      currentMinutes += input.slotDurationMinutes + input.bufferMinutes;
    }

    if (slotsToInsert.length === 0) {
      throw new ValidationError('No valid future slots could be generated with the provided parameters and existing schedule');
    }

    const count = await this.repo.createManySlots(slotsToInsert);

    await auditService.record({
      actorId: userId,
      actorRole: 'DOCTOR',
      action: 'AVAILABILITY_SLOTS_BULK_CREATED',
      resourceType: 'AvailabilitySlot',
      outcome: AuditOutcome.SUCCESS,
      metadata: { doctorId: doctor.id, slotsCreatedCount: count, date: input.date },
    });

    return { createdCount: count };
  }

  async getSlots(filters: QuerySlotsInput) {
    return this.repo.findSlots({
      doctorId: filters.doctorId,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      status: filters.status,
    });
  }

  async cancelSlot(userId: string, slotId: string) {
    const doctor = await this.docRepo.findByUserId(userId);
    if (!doctor) {
      throw new NotFoundError('Doctor profile');
    }

    const slot = await this.repo.findById(slotId);
    if (!slot) {
      throw new NotFoundError('AvailabilitySlot', slotId);
    }

    if (slot.doctorId !== doctor.id) {
      throw new ForbiddenError('You can only cancel your own availability slots');
    }

    if (slot.status === SlotStatus.BOOKED) {
      throw new ConflictError('Cannot cancel a slot that is already booked. Cancel the consultation instead.');
    }

    return this.repo.updateSlotStatus(slotId, SlotStatus.CANCELLED);
  }
}

export const availabilityService = new AvailabilityService();
