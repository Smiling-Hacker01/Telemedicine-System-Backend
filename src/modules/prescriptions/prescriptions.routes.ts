import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { prescriptionsController } from './prescriptions.controller.js';
import { authenticateToken, requireRoles } from '../../shared/middleware/auth.middleware.js';

export async function prescriptionsRoutes(app: FastifyInstance) {
  // Doctor creates prescription
  app.post(
    '/',
    { preHandler: [authenticateToken, requireRoles([UserRole.DOCTOR])] },
    prescriptionsController.createPrescription
  );

  // Authenticated user (patient, assigned doctor, admin) reads prescription
  app.get(
    '/consultation/:consultationId',
    { preHandler: [authenticateToken] },
    prescriptionsController.getPrescription
  );
}
