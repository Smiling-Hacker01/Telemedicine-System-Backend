import { FastifyInstance } from "fastify";
import { UserRole } from "@prisma/client";
import { bookingsController } from "./bookings.controller.js";
import {
  authenticateToken,
  requireRoles,
} from "../../shared/middleware/auth.middleware.js";
import { idempotencyMiddleware } from "../../shared/middleware/idempotency.middleware.js";

export async function bookingsRoutes(app: FastifyInstance) {
  // Patient creates booking with idempotency support
  app.post(
    "/",
    {
      preHandler: [
        authenticateToken,
        requireRoles([UserRole.PATIENT]),
        idempotencyMiddleware,
      ],
    },
    bookingsController.createBooking,
  );

  // Get user's own bookings
  app.get(
    "/my-bookings",
    { preHandler: [authenticateToken] },
    bookingsController.getMyBookings,
  );

  // Get specific booking by ID
  app.get(
    "/:id",
    { preHandler: [authenticateToken] },
    bookingsController.getBookingById,
  );

  // Cancel booking
  app.post(
    "/:id/cancel",
    { preHandler: [authenticateToken] },
    bookingsController.cancelBooking,
  );
}
