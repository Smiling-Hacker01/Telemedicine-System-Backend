import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { env } from "../../config/environment.js";
import { UnauthorizedError, ForbiddenError } from "../errors/app-error.js";
import { JwtUserPayload } from "../types/auth.types.js";

export async function authenticateToken(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new UnauthorizedError("Empty Bearer token provided");
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtUserPayload;
    request.user = decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Access token has expired");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError("Invalid access token");
    }
    throw new UnauthorizedError("Authentication failed");
  }
}

export function requireRoles(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new UnauthorizedError("User authentication context is missing");
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError(
        `Access restricted to roles: [${allowedRoles.join(", ")}]`,
      );
    }
  };
}
