import { User, UserRole, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

export class AuthRepository {
  async findByEmail(email: string): Promise<(User & { profile: Prisma.ProfileGetPayload<object> | null }) | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { profile: true },
    });
  }

  async findById(id: string): Promise<(User & { profile: Prisma.ProfileGetPayload<object> | null; doctor: Prisma.DoctorGetPayload<object> | null }) | null> {
    return prisma.user.findUnique({
      where: { id },
      include: { profile: true, doctor: true },
    });
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<User & { profile: Prisma.ProfileGetPayload<object> | null }> {
    return prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        role: data.role,
        profile: {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
          },
        },
      },
      include: { profile: true },
    });
  }

  async updateFailedLogin(id: string, attempts: number, lockedUntil: Date | null): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil,
      },
    });
  }

  async resetFailedLogin(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async setMfaSecret(id: string, encryptedSecret: string, recoveryCodes: string[]): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        mfaSecret: encryptedSecret,
        mfaRecoveryCodes: recoveryCodes,
      },
    });
  }

  async enableMfa(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        mfaEnabled: true,
      },
    });
  }

  async disableMfa(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaRecoveryCodes: [],
      },
    });
  }

  async updateRecoveryCodes(id: string, remainingCodes: string[]): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        mfaRecoveryCodes: remainingCodes,
      },
    });
  }
}

export const authRepository = new AuthRepository();
