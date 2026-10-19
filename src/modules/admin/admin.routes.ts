import { FastifyInstance } from "fastify";
import { UserRole } from "@prisma/client";
import { adminController } from "./admin.controller.js";
import {
  authenticateToken,
  requireRoles,
} from "../../shared/middleware/auth.middleware.js";

export async function adminRoutes(app: FastifyInstance) {
  // Enforce ADMIN role on all /admin endpoints
  app.addHook("preHandler", authenticateToken);
  app.addHook("preHandler", requireRoles([UserRole.ADMIN]));

  app.get("/analytics", adminController.getDashboard);
  app.get("/audit-logs", adminController.getAuditLogs);
}
