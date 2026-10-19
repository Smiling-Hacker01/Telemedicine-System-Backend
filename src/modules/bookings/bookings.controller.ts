import { FastifyRequest, FastifyReply } from 'fastify';
import { bookingsService, BookingsService } from './bookings.service.js';
import {
  createBookingSchema,
  cancelBookingSchema,
  queryBookingsSchema,
} from './bookings.schemas.js';
import { saveIdempotentResponse } from '../../shared/middleware/idempotency.middleware.js';

export class BookingsController {
  constructor(private service: BookingsService = bookingsService) {}

  createBooking = async (request: FastifyRequest, reply: FastifyReply) => {
    const patientId = request.user!.userId;
    const input = createBookingSchema.parse(request.body);
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

    const consultation = await this.service.createBooking(
      patientId,
      input,
      idempotencyKey,
      request.ip,
      request.headers['user-agent'],
      request.correlationId
    );

    const responsePayload = {
      success: true,
      message: 'Consultation booked successfully. Proceed to payment.',
      data: { consultation },
      correlationId: request.correlationId,
    };

    if (idempotencyKey) {
      await saveIdempotentResponse(
        idempotencyKey.trim(),
        request.url,
        201,
        responsePayload,
        request.body
      );
    }

    return reply.status(201).send(responsePayload);
  };

  getBookingById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const consultation = await this.service.getBookingById(id, {
      userId: request.user!.userId,
      role: request.user!.role,
    });

    return reply.status(200).send({
      success: true,
      data: { consultation },
      correlationId: request.correlationId,
    });
  };

  getMyBookings = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = queryBookingsSchema.parse(request.query);
    const result = await this.service.getMyBookings(
      {
        userId: request.user!.userId,
        role: request.user!.role,
      },
      query
    );

    return reply.status(200).send({
      success: true,
      data: result.items,
      meta: result.meta,
      correlationId: request.correlationId,
    });
  };

  cancelBooking = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const input = cancelBookingSchema.parse(request.body);
    const consultation = await this.service.cancelBooking(
      id,
      {
        userId: request.user!.userId,
        role: request.user!.role,
      },
      input,
      request.ip,
      request.headers['user-agent'],
      request.correlationId
    );

    return reply.status(200).send({
      success: true,
      message: 'Consultation booking cancelled successfully',
      data: { consultation },
      correlationId: request.correlationId,
    });
  };
}

export const bookingsController = new BookingsController();
