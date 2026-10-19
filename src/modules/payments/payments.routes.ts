import { FastifyInstance } from "fastify";
import { paymentsController } from "./payments.controller.js";
import { authenticateToken } from "../../shared/middleware/auth.middleware.js";

export async function paymentsRoutes(app: FastifyInstance) {
  // Initiate payment (requires authentication)
  app.post(
    "/initiate",
    { preHandler: [authenticateToken] },
    paymentsController.initiate,
  );

  // Webhook handler (HMAC signature verification inside service)
  app.post("/webhook", paymentsController.webhook);
}
