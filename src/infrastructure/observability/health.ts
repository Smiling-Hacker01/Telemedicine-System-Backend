import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { checkDatabaseHealth } from '../../config/database.js';
import { checkRedisHealth } from '../../config/redis.js';
import { prometheusRegistry } from './metrics.js';

export async function registerHealthAndMetricsRoutes(app: FastifyInstance) {
  // Liveness Probe
  app.get('/healthz', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      status: 'UP',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness Probe
  app.get('/readyz', async (_request: FastifyRequest, reply: FastifyReply) => {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const isReady = dbHealthy && redisHealthy;
    const statusCode = isReady ? 200 : 503;

    return reply.status(statusCode).send({
      status: isReady ? 'READY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: dbHealthy ? 'HEALTHY' : 'UNHEALTHY',
        redis: redisHealthy ? 'HEALTHY' : 'UNHEALTHY',
      },
    });
  });

  // Prometheus Metrics Scrape Endpoint
  app.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await prometheusRegistry.metrics();
    return reply
      .header('content-type', prometheusRegistry.contentType)
      .status(200)
      .send(metrics);
  });
}
