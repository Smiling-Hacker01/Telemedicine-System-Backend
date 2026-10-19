import { FastifyRequest, FastifyReply } from "fastify";
import { adminService, AdminService } from "./admin.service.js";
import { z } from "zod";

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  actorId: z.string().uuid().optional(),
});

export class AdminController {
  constructor(private service: AdminService = adminService) {}

  getDashboard = async (request: FastifyRequest, reply: FastifyReply) => {
    const dashboard = await this.service.getDashboardAnalytics();

    return reply.status(200).send({
      success: true,
      data: dashboard,
      correlationId: request.correlationId,
    });
  };

  getAuditLogs = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = auditQuerySchema.parse(request.query);
    const result = await this.service.getAuditLogs(query);

    return reply.status(200).send({
      success: true,
      data: result.logs,
      meta: result.meta,
      correlationId: request.correlationId,
    });
  };
}

export const adminController = new AdminController();
