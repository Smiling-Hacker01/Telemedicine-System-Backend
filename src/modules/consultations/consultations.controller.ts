import { FastifyRequest, FastifyReply } from "fastify";
import {
  consultationsService,
  ConsultationsService,
} from "./consultations.service.js";
import { updateConsultationStatusSchema } from "./consultations.schemas.js";

export class ConsultationsController {
  constructor(private service: ConsultationsService = consultationsService) {}

  updateStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const input = updateConsultationStatusSchema.parse(request.body);
    const updated = await this.service.updateStatus(
      id,
      {
        userId: request.user!.userId,
        role: request.user!.role,
      },
      input,
      request.ip,
      request.headers["user-agent"],
      request.correlationId,
    );

    return reply.status(200).send({
      success: true,
      message: `Consultation status transitioned to ${input.status}`,
      data: { consultation: updated },
      correlationId: request.correlationId,
    });
  };

  getConsultation = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const consultation = await this.service.getConsultation(id, {
      userId: request.user!.userId,
      role: request.user!.role,
    });

    return reply.status(200).send({
      success: true,
      data: { consultation },
      correlationId: request.correlationId,
    });
  };
}

export const consultationsController = new ConsultationsController();
