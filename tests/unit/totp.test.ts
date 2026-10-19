import { describe, it, expect } from "vitest";
import * as OTPAuth from "otpauth";
import {
  generateMfaSecret,
  verifyMfaToken,
} from "../../src/shared/security/totp.js";

describe("RFC 6238 TOTP Multi-Factor Authentication", () => {
  it("should generate valid TOTP secret, URI, and 8 recovery codes", () => {
    const email = "doctor.test@amrutam.co.in";
    const result = generateMfaSecret(email);

    expect(result.secretBase32).toBeDefined();
    expect(result.encryptedSecret).toBeDefined();
    expect(result.uri).toContain("otpauth://totp/");
    expect(result.uri).toContain(encodeURIComponent(email));
    expect(result.recoveryCodes).toHaveLength(8);
  });

  it("should successfully verify a current TOTP token generated with the secret", () => {
    const result = generateMfaSecret("patient@amrutam.co.in");

    const totp = new OTPAuth.TOTP({
      issuer: "Amrutam Telemedicine",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(result.secretBase32),
    });

    const currentToken = totp.generate();
    const isValid = verifyMfaToken(currentToken, result.encryptedSecret);

    expect(isValid).toBe(true);
  });

  it("should reject invalid or counterfeit TOTP tokens", () => {
    const result = generateMfaSecret("patient@amrutam.co.in");
    const isInvalid = verifyMfaToken("000000", result.encryptedSecret);

    expect(isInvalid).toBe(false);
  });
});
