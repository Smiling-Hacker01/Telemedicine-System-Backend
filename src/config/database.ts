import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";
import { env } from "./environment.js";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ||
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "event", level: "error" },
            { emit: "event", level: "warn" },
          ]
        : [{ emit: "event", level: "error" }],
  });

if (env.NODE_ENV === "development") {
  global.__prisma = prisma;
  // @ts-expect-error Prisma event typing
  prisma.$on("query", (e: { query: string; duration: number }) => {
    logger.debug(
      { query: e.query, durationMs: e.duration },
      "Database query executed",
    );
  });
}

// @ts-expect-error Prisma event typing
prisma.$on("error", (e: { message: string }) => {
  logger.error({ error: e.message }, "Database error occurred");
});

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ error }, "Database health check failed");
    return false;
  }
}
