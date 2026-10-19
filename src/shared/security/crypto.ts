import crypto from "crypto";
import { env } from "../../config/environment.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts plaintext using AES-256-GCM with authenticated tag.
 * Returns payload formatted as: iv:authTag:ciphertext (all hex encoded)
 */
export function encryptData(
  plaintext: string,
  secretKeyHex: string = env.DATA_ENCRYPTION_KEY,
): string {
  const key = Buffer.from(secretKeyHex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "Encryption key must be exactly 32 bytes (64 hex characters)",
    );
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM payload formatted as: iv:authTag:ciphertext
 */
export function decryptData(
  encryptedPayload: string,
  secretKeyHex: string = env.DATA_ENCRYPTION_KEY,
): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted payload format. Expected iv:authTag:ciphertext",
    );
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Malformed encrypted payload parts");
  }

  const key = Buffer.from(secretKeyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid IV or Auth Tag length");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Computes an HMAC-SHA256 signature for verification (e.g. Doctor prescription signature, Webhook)
 */
export function generateHmacSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Constant-time comparison to prevent timing attacks
 */
export function verifyHmacSignature(
  payload: string,
  secret: string,
  expectedSignature: string,
): boolean {
  const calculated = generateHmacSignature(payload, secret);
  if (calculated.length !== expectedSignature.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(calculated, "utf8"),
    Buffer.from(expectedSignature, "utf8"),
  );
}
