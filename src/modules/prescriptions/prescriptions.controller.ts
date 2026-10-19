import { FastifyRequest, FastifyReply } from 'fastify';
import { prescriptionsService, PrescriptionsService } from './prescriptions.service.js';
import { createPrescriptionSchema } from './prescriptions.schemas.js';

export class PrescriptionsController {
  constructor(private service: PrescriptionsService = prescriptionsService) {}

  createPrescription = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const input = createPrescriptionSchema.parse(request.body);
    const prescription = await this.service.createPrescription(
      userId,
      input,
      request.ip,
      request.headers['user-agent'],
      request.correlationId
    );

    return reply.status(201).send({
      success: true,
      message: 'Medical prescription created and digitally signed successfully',
      data: { prescription },
      correlationId: request.correlationId,
    });
  };

  getPrescription = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { consultationId } = request.params as { consultationId: string };
    const prescription = await this.service.getPrescriptionByConsultationId(
      consultationId,
      {
        userId: request.user!.userId,
        role: request.user!.role,
      }
    );

    return reply.status(200).send({
      success: true,
      data: { prescription },
      correlationId: request.correlationId,
    });
  };
}

export const prescriptionsController = new PrescriptionsController();
