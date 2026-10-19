import { FastifyRequest, FastifyReply } from "fastify";
import { paymentsService, PaymentsService } from "./payments.service.js";
import { initiatePaymentSchema } from "./payments.schemas.js";

export class PaymentsController {
  constructor(private service: PaymentsService = paymentsService) {}

  initiate = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const input = initiatePaymentSchema.parse(request.body);
    const result = await this.service.initiatePayment(
      input.consultationId,
      userId,
    );

    return reply.status(200).send({
      success: true,
      message: "Payment intent created",
      data: result,
      correlationId: request.correlationId,
    });
  };

  webhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const rawPayload = JSON.stringify(request.body);
    const signature = request.headers["x-amrutam-signature"] as
      string | undefined;

    const result = await this.service.processWebhook(rawPayload, signature);

    return reply.status(200).send({
      received: true,
      status: result.status,
    });
  };
}

export const paymentsController = new PaymentsController();
