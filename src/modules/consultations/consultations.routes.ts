import { FastifyInstance } from "fastify";
import { consultationsController } from "./consultations.controller.js";
import { authenticateToken } from "../../shared/middleware/auth.middleware.js";

export async function consultationsRoutes(app: FastifyInstance) {
  app.get(
    "/:id",
    { preHandler: [authenticateToken] },
    consultationsController.getConsultation,
  );
  app.patch(
    "/:id/status",
    { preHandler: [authenticateToken] },
    consultationsController.updateStatus,
  );
}
