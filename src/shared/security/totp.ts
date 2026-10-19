import * as OTPAuth from "otpauth";
import crypto from "crypto";
import { env } from "../../config/environment.js";
import { encryptData, decryptData } from "./crypto.js";

export interface GeneratedMfaSecret {
  secretBase32: string;
  encryptedSecret: string;
  uri: string;
  recoveryCodes: string[];
}

/**
 * Generates a new RFC 6238 compliant TOTP secret, QR URI, and 8 recovery codes
 */
export function generateMfaSecret(email: string): GeneratedMfaSecret {
  const secret = new OTPAuth.Secret({ size: 20 });
  const secretBase32 = secret.base32;

  const totp = new OTPAuth.TOTP({
    issuer: env.MFA_APP_NAME,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secret,
  });

  const uri = totp.toString();
  const encryptedSecret = encryptData(secretBase32, env.MFA_ENCRYPTION_KEY);

  // Generate 8 alphanumeric recovery codes (8 chars each)
  const recoveryCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase(),
  );

  return {
    secretBase32,
    encryptedSecret,
    uri,
    recoveryCodes,
  };
}

/**
 * Validates a user-supplied 6-digit TOTP token against the encrypted secret
 */
export function verifyMfaToken(
  token: string,
  encryptedSecret: string,
): boolean {
  try {
    const secretBase32 = decryptData(encryptedSecret, env.MFA_ENCRYPTION_KEY);
    const totp = new OTPAuth.TOTP({
      issuer: env.MFA_APP_NAME,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });

    // delta === null if invalid; returns integer difference in time steps (e.g. 0, -1, 1)
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}
