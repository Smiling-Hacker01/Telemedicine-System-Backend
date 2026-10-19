import { UserRole } from '@prisma/client';

export interface JwtUserPayload {
  userId: string;
  email: string;
  role: UserRole;
  mfaVerified?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mfaEnabled: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtUserPayload;
    correlationId: string;
  }
}
