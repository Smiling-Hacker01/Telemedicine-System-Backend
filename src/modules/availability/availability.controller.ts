import { FastifyRequest, FastifyReply } from "fastify";
import {
  availabilityService,
  AvailabilityService,
} from "./availability.service.js";
import {
  createSlotSchema,
  bulkCreateSlotsSchema,
  querySlotsSchema,
} from "./availability.schemas.js";

export class AvailabilityController {
  constructor(private service: AvailabilityService = availabilityService) {}

  createSlot = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const input = createSlotSchema.parse(request.body);
    const slot = await this.service.createSlot(userId, input);

    return reply.status(201).send({
      success: true,
      message: "Availability slot created successfully",
      data: { slot },
      correlationId: request.correlationId,
    });
  };

  bulkCreateSlots = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const input = bulkCreateSlotsSchema.parse(request.body);
    const result = await this.service.bulkCreateSlots(userId, input);

    return reply.status(201).send({
      success: true,
      message: `Successfully created ${result.createdCount} availability slots`,
      data: result,
      correlationId: request.correlationId,
    });
  };

  getSlots = async (request: FastifyRequest, reply: FastifyReply) => {
    const filters = querySlotsSchema.parse(request.query);
    const slots = await this.service.getSlots(filters);

    return reply.status(200).send({
      success: true,
      data: { slots, count: slots.length },
      correlationId: request.correlationId,
    });
  };

  cancelSlot = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.userId;
    const slot = await this.service.cancelSlot(userId, id);

    return reply.status(200).send({
      success: true,
      message: "Availability slot cancelled successfully",
      data: { slot },
      correlationId: request.correlationId,
    });
  };
}

export const availabilityController = new AvailabilityController();
