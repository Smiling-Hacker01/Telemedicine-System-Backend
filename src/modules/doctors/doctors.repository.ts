import { Doctor, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

export class DoctorsRepository {
  async findByUserId(userId: string): Promise<(Doctor & { user: { email: string; profile: Prisma.ProfileGetPayload<object> | null } }) | null> {
    return prisma.doctor.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            profile: true,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<(Doctor & { user: { email: string; profile: Prisma.ProfileGetPayload<object> | null } }) | null> {
    return prisma.doctor.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            email: true,
            profile: true,
          },
        },
      },
    });
  }

  async findByLicense(licenseNumber: string): Promise<Doctor | null> {
    return prisma.doctor.findUnique({
      where: { licenseNumber },
    });
  }

  async createDoctor(userId: string, data: {
    licenseNumber: string;
    specialties: string[];
    experienceYears: number;
    consultationFee: number;
    bio?: string;
  }): Promise<Doctor> {
    return prisma.doctor.create({
      data: {
        userId,
        licenseNumber: data.licenseNumber,
        specialties: data.specialties,
        experienceYears: data.experienceYears,
        consultationFee: new Prisma.Decimal(data.consultationFee),
        bio: data.bio,
      },
    });
  }

  async updateDoctor(id: string, data: Partial<{
    specialties: string[];
    experienceYears: number;
    consultationFee: number;
    bio?: string;
    isVerified: boolean;
  }>): Promise<Doctor> {
    return prisma.doctor.update({
      where: { id },
      data: {
        specialties: data.specialties,
        experienceYears: data.experienceYears,
        consultationFee: data.consultationFee !== undefined ? new Prisma.Decimal(data.consultationFee) : undefined,
        bio: data.bio,
        isVerified: data.isVerified,
      },
    });
  }
}

export const doctorsRepository = new DoctorsRepository();
