import { AvailabilitySlot, SlotStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';

export class AvailabilityRepository {
  async findOverlappingSlot(
    doctorId: string,
    startTime: Date,
    endTime: Date
  ): Promise<AvailabilitySlot | null> {
    return prisma.availabilitySlot.findFirst({
      where: {
        doctorId,
        status: { not: SlotStatus.CANCELLED },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
  }

  async createSlot(data: {
    doctorId: string;
    startTime: Date;
    endTime: Date;
  }): Promise<AvailabilitySlot> {
    return prisma.availabilitySlot.create({
      data: {
        doctorId: data.doctorId,
        startTime: data.startTime,
        endTime: data.endTime,
        status: SlotStatus.AVAILABLE,
      },
    });
  }

  async createManySlots(
    slots: Array<{ doctorId: string; startTime: Date; endTime: Date; status: SlotStatus }>
  ): Promise<number> {
    const result = await prisma.availabilitySlot.createMany({
      data: slots,
      skipDuplicates: true,
    });
    return result.count;
  }

  async findSlots(filters: {
    doctorId?: string;
    startDate?: Date;
    endDate?: Date;
    status?: SlotStatus;
  }): Promise<AvailabilitySlot[]> {
    return prisma.availabilitySlot.findMany({
      where: {
        doctorId: filters.doctorId,
        status: filters.status,
        startTime: {
          gte: filters.startDate,
          lte: filters.endDate,
        },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async findById(id: string): Promise<AvailabilitySlot | null> {
    return prisma.availabilitySlot.findUnique({
      where: { id },
    });
  }

  async updateSlotStatus(id: string, status: SlotStatus): Promise<AvailabilitySlot> {
    return prisma.availabilitySlot.update({
      where: { id },
      data: { status },
    });
  }
}

export const availabilityRepository = new AvailabilityRepository();
