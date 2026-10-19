import { FastifyInstance } from 'fastify';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { doctorsRoutes } from '../modules/doctors/doctors.routes.js';
import { availabilityRoutes } from '../modules/availability/availability.routes.js';
import { bookingsRoutes } from '../modules/bookings/bookings.routes.js';
import { consultationsRoutes } from '../modules/consultations/consultations.routes.js';
import { prescriptionsRoutes } from '../modules/prescriptions/prescriptions.routes.js';
import { paymentsRoutes } from '../modules/payments/payments.routes.js';
import { searchRoutes } from '../modules/search/search.routes.js';
import { adminRoutes } from '../modules/admin/admin.routes.js';
import { registerHealthAndMetricsRoutes } from '../infrastructure/observability/health.js';

export async function registerRoutes(app: FastifyInstance) {
  // Observability & Health endpoints
  await registerHealthAndMetricsRoutes(app);

  // API v1 Domain Modules
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: '/auth' });
      await v1.register(doctorsRoutes, { prefix: '/doctors' });
      await v1.register(availabilityRoutes, { prefix: '/availability' });
      await v1.register(bookingsRoutes, { prefix: '/bookings' });
      await v1.register(consultationsRoutes, { prefix: '/consultations' });
      await v1.register(prescriptionsRoutes, { prefix: '/prescriptions' });
      await v1.register(paymentsRoutes, { prefix: '/payments' });
      await v1.register(searchRoutes, { prefix: '/search' });
      await v1.register(adminRoutes, { prefix: '/admin' });
    },
    { prefix: '/api/v1' }
  );
}
