import { createApp } from './app/create-app.js';
import { env } from './config/environment.js';
import { logger } from './config/logger.js';
import { prisma } from './config/database.js';
import { closeRedis } from './config/redis.js';

async function bootstrap() {
  try {
    const app = await createApp();

    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    logger.info(`Amrutam Telemedicine Backend running at http://${env.HOST}:${env.PORT}`);
    logger.info(`OpenAPI Documentation available at http://${env.HOST}:${env.PORT}/docs`);
    logger.info(`Prometheus Metrics available at http://${env.HOST}:${env.PORT}/metrics`);
    logger.info(`Health check probe available at http://${env.HOST}:${env.PORT}/healthz`);

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Initiating graceful shutdown...`);

      try {
        await app.close();
        logger.info('HTTP server closed');

        await prisma.$disconnect();
        logger.info('Database connections closed');

        await closeRedis();
        logger.info('Redis connections closed');

        logger.info('Graceful shutdown completed successfully');
        process.exit(0);
      } catch (err) {
        logger.error({ error: err }, 'Error during graceful shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ error: err }, 'Failed to start Amrutam backend server');
    process.exit(1);
  }
}

bootstrap();
