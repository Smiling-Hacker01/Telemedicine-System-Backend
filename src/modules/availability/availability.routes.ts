import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { availabilityController } from './availability.controller.js';
import { authenticateToken, requireRoles } from '../../shared/middleware/auth.middleware.js';

export async function availabilityRoutes(app: FastifyInstance) {
  // Public query slots
  app.get('/', availabilityController.getSlots);

  // Authenticated doctor endpoints
  app.post(
    '/',
    { preHandler: [authenticateToken, requireRoles([UserRole.DOCTOR])] },
    availabilityController.createSlot
  );

  app.post(
    '/bulk',
    { preHandler: [authenticateToken, requireRoles([UserRole.DOCTOR])] },
    availabilityController.bulkCreateSlots
  );

  app.delete(
    '/:id',
    { preHandler: [authenticateToken, requireRoles([UserRole.DOCTOR])] },
    availabilityController.cancelSlot
  );
}
