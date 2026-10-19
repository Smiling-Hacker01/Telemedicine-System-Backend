import { describe, it, expect } from "vitest";
import {
  encryptData,
  decryptData,
  generateHmacSignature,
  verifyHmacSignature,
} from "../../src/shared/security/crypto.js";

describe("AES-256-GCM Encryption & HMAC Security", () => {
  const testSecretKey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("should successfully encrypt and decrypt a sensitive medical string", () => {
    const sensitivePhi =
      "Patient diagnosed with Acute Bronchitis. Prescribe Amoxicillin 500mg.";
    const encrypted = encryptData(sensitivePhi, testSecretKey);

    expect(encrypted).not.toEqual(sensitivePhi);
    expect(encrypted.split(":")).toHaveLength(3); // iv:authTag:ciphertext

    const decrypted = decryptData(encrypted, testSecretKey);
    expect(decrypted).toEqual(sensitivePhi);
  });

  it("should throw an error if encrypted payload has been tampered with", () => {
    const text = "Confidential medical data";
    const encrypted = encryptData(text, testSecretKey);
    const parts = encrypted.split(":");

    // Tamper with ciphertext by altering the last hex character
    const tamperedCiphertext =
      parts[2]!.slice(0, -1) + (parts[2]!.slice(-1) === "a" ? "b" : "a");
    const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;

    expect(() => decryptData(tamperedPayload, testSecretKey)).toThrow();
  });

  it("should throw an error if encryption key is not 32 bytes (64 hex characters)", () => {
    const invalidKey = "short_key";
    expect(() => encryptData("hello", invalidKey)).toThrow(
      "Encryption key must be exactly 32 bytes",
    );
  });

  it("should correctly generate and verify HMAC-SHA256 signatures", () => {
    const payload = JSON.stringify({ consultationId: "test-123", amount: 500 });
    const secret = "whsec_test_secret_for_signing_webhook_events";

    const signature = generateHmacSignature(payload, secret);
    expect(signature).toBeDefined();
    expect(signature.length).toBe(64); // SHA-256 hex digest length

    const isValid = verifyHmacSignature(payload, secret, signature);
    expect(isValid).toBe(true);

    const isInvalid = verifyHmacSignature(payload, "wrong_secret", signature);
    expect(isInvalid).toBe(false);

    const isTampered = verifyHmacSignature(
      payload + "tampered",
      secret,
      signature,
    );
    expect(isTampered).toBe(false);
  });
});
