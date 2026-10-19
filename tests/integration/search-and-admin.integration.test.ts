import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { UserRole, SlotStatus } from "@prisma/client";
import { createApp } from "../../src/app/create-app.js";
import { prisma } from "../../src/config/database.js";

describe("Doctor Search & Admin Analytics Integration", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminId: string;
  let doctorId: string;
  let doctorUserId: string;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();

    // 1. Create Admin
    const adminUser = await prisma.user.create({
      data: {
        email: `admin.${Date.now()}@amrutam.co.in`,
        passwordHash: "dummy",
        role: UserRole.ADMIN,
        profile: { create: { firstName: "Super", lastName: "Admin" } },
      },
    });
    adminId = adminUser.id;

    // Login admin to get valid token
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: adminUser.email, password: "dummy" }, // dummy won't match, let's create real password
    });
    // Let's register real admin through API
    const realAdminRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `realadmin.${Date.now()}@amrutam.co.in`,
        password: "AdminPassword123!",
        role: UserRole.ADMIN,
        firstName: "System",
        lastName: "Administrator",
      },
    });
    adminToken = realAdminRes.json().data.tokens.accessToken;
    adminId = realAdminRes.json().data.user.id;

    // 2. Create verified doctor with slots
    const docRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `search.doc.${Date.now()}@amrutam.co.in`,
        password: "Password123!",
        role: UserRole.DOCTOR,
        firstName: "Vaidya",
        lastName: "Panchal",
      },
    });
    const docToken = docRes.json().data.tokens.accessToken;
    doctorUserId = docRes.json().data.user.id;

    const profileRes = await app.inject({
      method: "POST",
      url: "/api/v1/doctors/profile",
      headers: { authorization: `Bearer ${docToken}` },
      payload: {
        licenseNumber: `SRCH-LIC-${Date.now()}`,
        specialties: ["Dermatology", "Ayurveda"],
        experienceYears: 15,
        consultationFee: 650.0,
        bio: "Specialist in chronic skin and Ayurvedic therapies",
      },
    });
    doctorId = profileRes.json().data.doctor.id;

    // Verify the doctor via Admin endpoint
    await app.inject({
      method: "PATCH",
      url: `/api/v1/doctors/${doctorId}/verify`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isVerified: true },
    });

    // Create an availability slot
    const tomorrow = new Date(Date.now() + 86400000);
    await prisma.availabilitySlot.create({
      data: {
        doctorId,
        startTime: tomorrow,
        endTime: new Date(tomorrow.getTime() + 1800000),
        status: SlotStatus.AVAILABLE,
      },
    });
  });

  afterAll(async () => {
    await prisma.availabilitySlot.deleteMany({ where: { doctorId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, doctorUserId] } },
    });
    await app.close();
  });

  it("Search: should find verified doctors by specialty filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search/doctors?specialty=Dermatology",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].specialties).toContain("Dermatology");
  });

  it("Search: should find doctor by query text matching bio or name", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search/doctors?query=Panchal",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].user.profile.lastName).toBe("Panchal");
  });

  it("Search: should filter doctors by fee range and experience", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search/doctors?minFee=500&maxFee=1000&minExperience=10",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("Admin: should return consolidated KPI dashboard analytics", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/analytics",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.overview.totalDoctors).toBeGreaterThan(0);
    expect(body.data.overview.verifiedDoctors).toBeGreaterThan(0);
    expect(body.data.consultationBreakdown).toBeDefined();
  });

  it("Admin: should query paginated audit logs", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-logs?page=1&limit=10",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta.page).toBe(1);
  });
});
