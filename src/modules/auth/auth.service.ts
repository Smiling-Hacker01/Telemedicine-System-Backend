import jwt from "jsonwebtoken";
import { AuditOutcome } from "@prisma/client";
import { env } from "../../config/environment.js";
import { authRepository, AuthRepository } from "./auth.repository.js";
import { hashPassword, verifyPassword } from "../../shared/security/hash.js";
import {
  generateMfaSecret,
  verifyMfaToken,
  GeneratedMfaSecret,
} from "../../shared/security/totp.js";
import { auditService } from "../../shared/security/audit.service.js";
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import {
  RegisterUserInput,
  LoginUserInput,
  VerifyMfaInput,
  MfaLoginInput,
  MfaRecoveryLoginInput,
} from "./auth.schemas.js";
import { AuthTokens, JwtUserPayload } from "../../shared/types/auth.types.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export class AuthService {
  constructor(private repo: AuthRepository = authRepository) {}

  private generateTokens(payload: JwtUserPayload): AuthTokens {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accessExpiry = env.JWT_ACCESS_EXPIRY as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refreshExpiry = env.JWT_REFRESH_EXPIRY as any;

    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: accessExpiry,
    });
    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: refreshExpiry,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: env.JWT_ACCESS_EXPIRY,
    };
  }

  async register(
    input: RegisterUserInput,
    clientIp?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      await auditService.record({
        action: "AUTH_REGISTER_FAILED_DUPLICATE",
        resourceType: "User",
        outcome: AuditOutcome.FAILURE,
        ipAddress: clientIp,
        userAgent,
        correlationId,
        metadata: { email: input.email },
      });
      throw new ConflictError(
        "An account with this email address already exists",
      );
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.repo.createUser({
      email: input.email,
      passwordHash,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    });

    await auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "AUTH_REGISTER_SUCCESS",
      resourceType: "User",
      resourceId: user.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      correlationId,
    });

    const tokens = this.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaVerified: false,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.profile?.firstName,
        lastName: user.profile?.lastName,
        mfaEnabled: user.mfaEnabled,
      },
      tokens,
    };
  }

  async login(
    input: LoginUserInput,
    clientIp?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    const user = await this.repo.findByEmail(input.email);
    if (!user) {
      // Mitigate account enumeration: perform dummy hash check
      await hashPassword("dummy_password_timing_defense");
      throw new UnauthorizedError("Invalid email or password");
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const waitMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / (60 * 1000),
      );
      await auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: "AUTH_LOGIN_BLOCKED_LOCKED_ACCOUNT",
        resourceType: "User",
        resourceId: user.id,
        outcome: AuditOutcome.FAILURE,
        ipAddress: clientIp,
        userAgent,
        correlationId,
      });
      throw new ForbiddenError(
        `Account is temporarily locked due to multiple failed login attempts. Try again in ${waitMinutes} minutes.`,
      );
    }

    const isMatch = await verifyPassword(input.password, user.passwordHash);
    if (!isMatch) {
      const attempts = user.failedLoginAttempts + 1;
      const lockedUntil =
        attempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_DURATION_MS)
          : null;
      await this.repo.updateFailedLogin(user.id, attempts, lockedUntil);

      await auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: "AUTH_LOGIN_FAILED_CREDENTIALS",
        resourceType: "User",
        resourceId: user.id,
        outcome: AuditOutcome.FAILURE,
        ipAddress: clientIp,
        userAgent,
        correlationId,
        metadata: { attempts },
      });

      throw new UnauthorizedError("Invalid email or password");
    }

    // Reset failed login counter on successful password verification
    await this.repo.resetFailedLogin(user.id);

    // If MFA is enabled, issue an ephemeral MFA challenge ticket
    if (user.mfaEnabled) {
      const mfaTicket = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          isMfaChallenge: true,
        },
        env.JWT_ACCESS_SECRET,
        { expiresIn: "5m" },
      );

      await auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: "AUTH_MFA_CHALLENGE_ISSUED",
        resourceType: "User",
        resourceId: user.id,
        outcome: AuditOutcome.SUCCESS,
        ipAddress: clientIp,
        userAgent,
        correlationId,
      });

      return {
        mfaRequired: true,
        mfaTicket,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    }

    await auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "AUTH_LOGIN_SUCCESS",
      resourceType: "User",
      resourceId: user.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      correlationId,
    });

    const tokens = this.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaVerified: false,
    });

    return {
      mfaRequired: false,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.profile?.firstName,
        lastName: user.profile?.lastName,
        mfaEnabled: user.mfaEnabled,
      },
      tokens,
    };
  }

  async verifyMfaLogin(
    input: MfaLoginInput,
    clientIp?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    let payload: { userId: string; email: string; isMfaChallenge?: boolean };
    try {
      payload = jwt.verify(input.mfaTicket, env.JWT_ACCESS_SECRET) as {
        userId: string;
        email: string;
        isMfaChallenge?: boolean;
      };
    } catch {
      throw new UnauthorizedError("Invalid or expired MFA ticket");
    }

    if (!payload.isMfaChallenge) {
      throw new UnauthorizedError("Malformed MFA ticket");
    }

    const user = await this.repo.findById(payload.userId);
    if (!user || !user.mfaSecret) {
      throw new UnauthorizedError("User does not have MFA configured");
    }

    const isValid = verifyMfaToken(input.totpToken, user.mfaSecret);
    if (!isValid) {
      await auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: "AUTH_MFA_VERIFY_FAILED",
        resourceType: "User",
        resourceId: user.id,
        outcome: AuditOutcome.FAILURE,
        ipAddress: clientIp,
        userAgent,
        correlationId,
      });
      throw new UnauthorizedError("Invalid TOTP verification code");
    }

    await auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "AUTH_MFA_LOGIN_SUCCESS",
      resourceType: "User",
      resourceId: user.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      correlationId,
    });

    const tokens = this.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaVerified: true,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.profile?.firstName,
        lastName: user.profile?.lastName,
        mfaEnabled: true,
      },
      tokens,
    };
  }

  async loginWithRecoveryCode(
    input: MfaRecoveryLoginInput,
    clientIp?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    let payload: { userId: string; email: string; isMfaChallenge?: boolean };
    try {
      payload = jwt.verify(input.mfaTicket, env.JWT_ACCESS_SECRET) as {
        userId: string;
        email: string;
        isMfaChallenge?: boolean;
      };
    } catch {
      throw new UnauthorizedError("Invalid or expired MFA ticket");
    }

    const user = await this.repo.findById(payload.userId);
    if (!user || !user.mfaEnabled) {
      throw new UnauthorizedError("User not found or MFA not enabled");
    }

    const cleanInputCode = input.recoveryCode.trim().toUpperCase();
    const codeIndex = user.mfaRecoveryCodes.indexOf(cleanInputCode);
    if (codeIndex === -1) {
      await auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: "AUTH_MFA_RECOVERY_CODE_INVALID",
        resourceType: "User",
        resourceId: user.id,
        outcome: AuditOutcome.FAILURE,
        ipAddress: clientIp,
        userAgent,
        correlationId,
      });
      throw new UnauthorizedError("Invalid recovery code");
    }

    // Burn the used recovery code
    const remainingCodes = [...user.mfaRecoveryCodes];
    remainingCodes.splice(codeIndex, 1);
    await this.repo.updateRecoveryCodes(user.id, remainingCodes);

    await auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "AUTH_MFA_RECOVERY_LOGIN_SUCCESS",
      resourceType: "User",
      resourceId: user.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      correlationId,
      metadata: { remainingCodesCount: remainingCodes.length },
    });

    const tokens = this.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaVerified: true,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.profile?.firstName,
        lastName: user.profile?.lastName,
        mfaEnabled: true,
      },
      tokens,
      remainingRecoveryCodes: remainingCodes.length,
    };
  }

  async setupMfa(userId: string): Promise<GeneratedMfaSecret> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundError("User", userId);

    const mfaData = generateMfaSecret(user.email);
    await this.repo.setMfaSecret(
      userId,
      mfaData.encryptedSecret,
      mfaData.recoveryCodes,
    );

    return mfaData;
  }

  async verifyAndEnableMfa(
    userId: string,
    input: VerifyMfaInput,
  ): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user || !user.mfaSecret) {
      throw new ValidationError(
        "MFA setup must be initiated before verification",
      );
    }

    const isValid = verifyMfaToken(input.token, user.mfaSecret);
    if (!isValid) {
      throw new ValidationError("Invalid 6-digit TOTP verification code");
    }

    await this.repo.enableMfa(userId);

    await auditService.record({
      actorId: userId,
      actorRole: user.role,
      action: "AUTH_MFA_ENABLED",
      resourceType: "User",
      resourceId: userId,
      outcome: AuditOutcome.SUCCESS,
    });
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(
        refreshToken,
        env.JWT_REFRESH_SECRET,
      ) as JwtUserPayload;
      const user = await this.repo.findById(decoded.userId);
      if (!user || !user.isActive) {
        throw new UnauthorizedError(
          "User account is inactive or no longer exists",
        );
      }

      return this.generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
        mfaVerified: decoded.mfaVerified,
      });
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
  }

  async getCurrentUser(userId: string) {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundError("User", userId);

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      mfaEnabled: user.mfaEnabled,
      profile: user.profile,
      doctor: user.doctor,
    };
  }
}

export const authService = new AuthService();
