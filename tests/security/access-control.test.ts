import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { UserRole } from "@prisma/client";
import { createApp } from "../../src/app/create-app.js";
import { prisma } from "../../src/config/database.js";

describe("Security & Access Control Tests (OWASP Top 10)", () => {
  let app: FastifyInstance;
  let patientToken: string;
  let patientId: string;
  let doctorToken: string;
  let doctorUserId: string;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();

    // 1. Patient User
    const pRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `sec.patient.${Date.now()}@amrutam.co.in`,
        password: "Password123!",
        role: UserRole.PATIENT,
        firstName: "Sec",
        lastName: "Patient",
      },
    });
    patientToken = pRes.json().data.tokens.accessToken;
    patientId = pRes.json().data.user.id;

    // 2. Doctor User
    const dRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `sec.doc.${Date.now()}@amrutam.co.in`,
        password: "Password123!",
        role: UserRole.DOCTOR,
        firstName: "Dr. Sec",
        lastName: "Doctor",
      },
    });
    doctorToken = dRes.json().data.tokens.accessToken;
    doctorUserId = dRes.json().data.user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [patientId, doctorUserId] } },
    });
    await app.close();
  });

  it("OWASP A01 Broken Access Control: Patient MUST NOT be permitted to access Admin Analytics (403 Forbidden)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/analytics",
      headers: { authorization: `Bearer ${patientToken}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.errorCode).toBe("FORBIDDEN");
  });

  it("OWASP A01 Broken Access Control: Doctor MUST NOT be permitted to access Admin Audit Logs (403 Forbidden)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-logs",
      headers: { authorization: `Bearer ${doctorToken}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.errorCode).toBe("FORBIDDEN");
  });

  it("OWASP A01 Privilege Escalation: Patient MUST NOT be permitted to create Doctor Availability Slots (403 Forbidden)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/availability",
      headers: { authorization: `Bearer ${patientToken}` },
      payload: {
        startTime: new Date(Date.now() + 86400000).toISOString(),
        endTime: new Date(Date.now() + 86400000 + 1800000).toISOString(),
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("OWASP A07 Identification & Auth: Requests without Bearer token to protected routes must be rejected (401 Unauthorized)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/bookings/my-bookings",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().errorCode).toBe("UNAUTHORIZED");
  });

  it("OWASP A07 Identification & Auth: Requests with forged/tampered JWT tokens must be rejected (401 Unauthorized)", async () => {
    const forgedToken = patientToken.slice(0, -5) + "abcde";
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/bookings/my-bookings",
      headers: { authorization: `Bearer ${forgedToken}` },
    });

    expect(res.statusCode).toBe(401);
  });
});
