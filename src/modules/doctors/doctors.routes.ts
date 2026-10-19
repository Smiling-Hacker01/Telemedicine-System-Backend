import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { doctorsController } from './doctors.controller.js';
import { authenticateToken, requireRoles } from '../../shared/middleware/auth.middleware.js';

export async function doctorsRoutes(app: FastifyInstance) {
  // Public doctor endpoint
  app.get('/:id', doctorsController.getDoctorById);

  // Authenticated doctor endpoints
  app.post(
    '/profile',
    { preHandler: [authenticateToken, requireRoles([UserRole.DOCTOR])] },
    doctorsController.createProfile
  );

  app.get(
    '/me/profile',
    { preHandler: [authenticateToken, requireRoles([UserRole.DOCTOR])] },
    doctorsController.getMyProfile
  );

  app.patch(
    '/me/profile',
    { preHandler: [authenticateToken, requireRoles([UserRole.DOCTOR])] },
    doctorsController.updateMyProfile
  );

  // Admin verification endpoint
  app.patch(
    '/:id/verify',
    { preHandler: [authenticateToken, requireRoles([UserRole.ADMIN])] },
    doctorsController.verifyDoctor
  );
}
