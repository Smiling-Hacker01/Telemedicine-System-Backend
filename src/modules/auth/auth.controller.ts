import { FastifyRequest, FastifyReply } from "fastify";
import { authService, AuthService } from "./auth.service.js";
import {
  registerUserSchema,
  loginUserSchema,
  refreshTokenSchema,
  verifyMfaSchema,
  mfaLoginSchema,
  mfaRecoveryLoginSchema,
} from "./auth.schemas.js";

export class AuthController {
  constructor(private service: AuthService = authService) {}

  register = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = registerUserSchema.parse(request.body);
    const result = await this.service.register(
      input,
      request.ip,
      request.headers["user-agent"],
      request.correlationId,
    );

    return reply.status(201).send({
      success: true,
      message: "Account registered successfully",
      data: result,
      correlationId: request.correlationId,
    });
  };

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = loginUserSchema.parse(request.body);
    const result = await this.service.login(
      input,
      request.ip,
      request.headers["user-agent"],
      request.correlationId,
    );

    return reply.status(200).send({
      success: true,
      message: result.mfaRequired
        ? "MFA authentication challenge required"
        : "Login successful",
      data: result,
      correlationId: request.correlationId,
    });
  };

  verifyMfaLogin = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = mfaLoginSchema.parse(request.body);
    const result = await this.service.verifyMfaLogin(
      input,
      request.ip,
      request.headers["user-agent"],
      request.correlationId,
    );

    return reply.status(200).send({
      success: true,
      message: "MFA verification successful",
      data: result,
      correlationId: request.correlationId,
    });
  };

  loginWithRecoveryCode = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const input = mfaRecoveryLoginSchema.parse(request.body);
    const result = await this.service.loginWithRecoveryCode(
      input,
      request.ip,
      request.headers["user-agent"],
      request.correlationId,
    );

    return reply.status(200).send({
      success: true,
      message: "Recovery code login successful",
      data: result,
      correlationId: request.correlationId,
    });
  };

  setupMfa = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const result = await this.service.setupMfa(userId);

    return reply.status(200).send({
      success: true,
      message:
        "MFA setup initiated. Scan QR code or enter secret into Authenticator app.",
      data: {
        secret: result.secretBase32,
        uri: result.uri,
        recoveryCodes: result.recoveryCodes,
      },
      correlationId: request.correlationId,
    });
  };

  verifyAndEnableMfa = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const input = verifyMfaSchema.parse(request.body);
    await this.service.verifyAndEnableMfa(userId, input);

    return reply.status(200).send({
      success: true,
      message: "MFA has been successfully verified and enabled on your account",
      data: { mfaEnabled: true },
      correlationId: request.correlationId,
    });
  };

  refreshToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = refreshTokenSchema.parse(request.body);
    const tokens = await this.service.refreshToken(input.refreshToken);

    return reply.status(200).send({
      success: true,
      message: "Tokens refreshed successfully",
      data: { tokens },
      correlationId: request.correlationId,
    });
  };

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const user = await this.service.getCurrentUser(userId);

    return reply.status(200).send({
      success: true,
      data: { user },
      correlationId: request.correlationId,
    });
  };
}

export const authController = new AuthController();
