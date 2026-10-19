import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createApp } from "../../src/app/create-app.js";

describe("OpenAPI Contract & Observability Health Endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("Liveness Probe: /healthz should return 200 OK with UP status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("UP");
    expect(body.uptimeSeconds).toBeGreaterThan(0);
  });

  it("Readiness Probe: /readyz should return 200 OK with dependency health breakdown", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/readyz",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("READY");
    expect(body.dependencies.database).toBe("HEALTHY");
    expect(body.dependencies.redis).toBe("HEALTHY");
  });

  it("Prometheus Metrics: /metrics should return text/plain Prometheus metrics format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("amrutam_");
  });

  it("Swagger Documentation: /docs/json should return valid OpenAPI 3.x schema", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/docs/json",
    });

    expect(res.statusCode).toBe(200);
    const schema = res.json();
    expect(schema.openapi).toMatch(/^3\./);
    expect(schema.info.title).toBe("Amrutam Telemedicine Backend API");
    expect(schema.paths).toBeDefined();
  });
});
