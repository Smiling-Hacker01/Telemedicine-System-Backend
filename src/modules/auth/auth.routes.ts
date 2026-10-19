import { FastifyInstance } from "fastify";
import { authController } from "./auth.controller.js";
import { authenticateToken } from "../../shared/middleware/auth.middleware.js";

export async function authRoutes(app: FastifyInstance) {
  // Public auth routes
  app.post("/register", authController.register);
  app.post("/login", authController.login);
  app.post("/refresh-token", authController.refreshToken);
  app.post("/mfa/login", authController.verifyMfaLogin);
  app.post("/mfa/recovery-login", authController.loginWithRecoveryCode);

  // Authenticated user routes
  app.post(
    "/mfa/setup",
    { preHandler: [authenticateToken] },
    authController.setupMfa,
  );
  app.post(
    "/mfa/verify",
    { preHandler: [authenticateToken] },
    authController.verifyAndEnableMfa,
  );
  app.get("/me", { preHandler: [authenticateToken] }, authController.me);
}
