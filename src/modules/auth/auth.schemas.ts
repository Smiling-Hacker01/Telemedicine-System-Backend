import { z } from "zod";
import { UserRole } from "@prisma/client";

export const registerUserSchema = z.object({
  email: z.string().email("Invalid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
  role: z.nativeEnum(UserRole).default(UserRole.PATIENT),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phone: z.string().optional(),
});

export const loginUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const verifyMfaSchema = z.object({
  token: z.string().length(6, "TOTP token must be 6 digits"),
});

export const mfaLoginSchema = z.object({
  mfaTicket: z.string().min(1, "MFA ticket is required"),
  totpToken: z.string().length(6, "TOTP token must be 6 digits"),
});

export const mfaRecoveryLoginSchema = z.object({
  mfaTicket: z.string().min(1, "MFA ticket is required"),
  recoveryCode: z.string().min(6, "Recovery code is required"),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type LoginUserInput = z.infer<typeof loginUserSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type VerifyMfaInput = z.infer<typeof verifyMfaSchema>;
export type MfaLoginInput = z.infer<typeof mfaLoginSchema>;
export type MfaRecoveryLoginInput = z.infer<typeof mfaRecoveryLoginSchema>;
