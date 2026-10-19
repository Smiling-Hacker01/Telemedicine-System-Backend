import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
} from "../../src/shared/security/hash.js";

describe("Password Hashing & Verification", () => {
  it("should hash a password and verify it correctly", async () => {
    const rawPassword = "StrongPassword123!";
    const hash = await hashPassword(rawPassword);

    expect(hash).not.toEqual(rawPassword);
    expect(hash.startsWith("$2")).toBe(true);

    const isMatch = await verifyPassword(rawPassword, hash);
    expect(isMatch).toBe(true);
  });

  it("should reject incorrect passwords", async () => {
    const rawPassword = "StrongPassword123!";
    const hash = await hashPassword(rawPassword);

    const isMatch = await verifyPassword("WrongPassword!", hash);
    expect(isMatch).toBe(false);
  });
});
