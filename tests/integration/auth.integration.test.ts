import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as OTPAuth from "otpauth";
import { FastifyInstance } from "fastify";
import { createApp } from "../../src/app/create-app.js";
import { prisma } from "../../src/config/database.js";

describe("Auth & MFA Integration Workflows", () => {
  let app: FastifyInstance;
  const testEmail = `auth.test.${Date.now()}@amrutam.co.in`;
  const testPassword = "SecurePassword123!";
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it("should register a new patient account", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: testEmail,
        password: testPassword,
        firstName: "Jane",
        lastName: "Doe",
        phone: "+919876543210",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(testEmail);
    expect(body.data.tokens.accessToken).toBeDefined();

    userId = body.data.user.id;
    accessToken = body.data.tokens.accessToken;
  });

  it("should reject duplicate registration with 409 Conflict", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: testEmail,
        password: testPassword,
        firstName: "Jane",
        lastName: "Doe",
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.errorCode).toBe("CONFLICT");
  });

  it("should successfully log in with valid credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.mfaRequired).toBe(false);
    expect(body.data.tokens.accessToken).toBeDefined();
  });

  it("should lock the account after 5 consecutive failed login attempts", async () => {
    // Attempt 5 bad logins
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: testEmail,
          password: "WrongPassword123!",
        },
      });
      expect(res.statusCode).toBe(401);
    }

    // 6th attempt should be blocked with 403 Forbidden (Account locked)
    const blockedRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: testEmail,
        password: testPassword, // Even correct password should be blocked
      },
    });

    expect(blockedRes.statusCode).toBe(403);
    const body = blockedRes.json();
    expect(body.errorCode).toBe("FORBIDDEN");
    expect(body.detail).toContain("locked");

    // Reset lockout for subsequent tests
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });

  it("should configure, verify, and enforce MFA login", async () => {
    // 1. Setup MFA
    const setupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/setup",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(setupRes.statusCode).toBe(200);
    const setupBody = setupRes.json();
    expect(setupBody.data.secret).toBeDefined();
    expect(setupBody.data.recoveryCodes).toHaveLength(8);

    const secretBase32 = setupBody.data.secret;
    const recoveryCode = setupBody.data.recoveryCodes[0];

    // Generate valid TOTP token
    const totp = new OTPAuth.TOTP({
      issuer: "Amrutam Telemedicine",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    const currentToken = totp.generate();

    // 2. Verify and enable MFA
    const verifyRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/verify",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { token: currentToken },
    });

    expect(verifyRes.statusCode).toBe(200);

    // 3. Next login attempt should now require MFA challenge
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: testEmail, password: testPassword },
    });

    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json();
    expect(loginBody.data.mfaRequired).toBe(true);
    expect(loginBody.data.mfaTicket).toBeDefined();

    const mfaTicket = loginBody.data.mfaTicket;

    // 4. Complete MFA verification
    const mfaLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/login",
      payload: {
        mfaTicket,
        totpToken: totp.generate(),
      },
    });

    expect(mfaLoginRes.statusCode).toBe(200);
    expect(mfaLoginRes.json().data.tokens.accessToken).toBeDefined();

    // 5. Test recovery code login
    const recoveryLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/recovery-login",
      payload: {
        mfaTicket,
        recoveryCode,
      },
    });

    expect(recoveryLoginRes.statusCode).toBe(200);
    expect(recoveryLoginRes.json().data.remainingRecoveryCodes).toBe(7);
  });
});
