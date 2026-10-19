import { Prisma, SlotStatus } from "@prisma/client";
import { prisma } from "../../config/database.js";
import { getRedisClient } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { SearchDoctorsInput } from "./search.schemas.js";

export class SearchService {
  async searchDoctors(input: SearchDoctorsInput) {
    const page = input.page || 1;
    const limit = input.limit || 20;
    const skip = (page - 1) * limit;

    // Cache key for popular search queries
    const cacheKey = `search:doctors:${JSON.stringify(input)}`;
    const redis = getRedisClient();

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, "Doctor search cache HIT");
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn(
        { error: err },
        "Redis cache read failed during doctor search",
      );
    }

    const where: Prisma.DoctorWhereInput = {
      isVerified: true, // Only show verified doctors to patients
    };

    if (input.specialty) {
      where.specialties = {
        has: input.specialty,
      };
    }

    if (input.minFee !== undefined || input.maxFee !== undefined) {
      where.consultationFee = {
        gte:
          input.minFee !== undefined
            ? new Prisma.Decimal(input.minFee)
            : undefined,
        lte:
          input.maxFee !== undefined
            ? new Prisma.Decimal(input.maxFee)
            : undefined,
      };
    }

    if (input.minRating !== undefined) {
      where.rating = {
        gte: new Prisma.Decimal(input.minRating),
      };
    }

    if (input.minExperience !== undefined) {
      where.experienceYears = {
        gte: input.minExperience,
      };
    }

    if (input.query) {
      where.OR = [
        { bio: { contains: input.query, mode: "insensitive" } },
        { specialties: { has: input.query } },
        {
          user: {
            profile: {
              OR: [
                { firstName: { contains: input.query, mode: "insensitive" } },
                { lastName: { contains: input.query, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    if (input.availableDate) {
      const dateStart = new Date(`${input.availableDate}T00:00:00.000Z`);
      const dateEnd = new Date(`${input.availableDate}T23:59:59.999Z`);

      where.availabilitySlots = {
        some: {
          status: SlotStatus.AVAILABLE,
          startTime: {
            gte: dateStart,
            lte: dateEnd,
          },
        },
      };
    }

    // Dynamic sort
    let orderBy: Prisma.DoctorOrderByWithRelationInput = { rating: "desc" };
    if (input.sortBy === "fee_asc") orderBy = { consultationFee: "asc" };
    if (input.sortBy === "fee_desc") orderBy = { consultationFee: "desc" };
    if (input.sortBy === "experience_desc")
      orderBy = { experienceYears: "desc" };

    const [doctors, total] = await Promise.all([
      prisma.doctor.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              email: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      }),
      prisma.doctor.count({ where }),
    ]);

    const result = {
      items: doctors,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache the result for 60 seconds
    try {
      await redis.setex(cacheKey, 60, JSON.stringify(result));
    } catch (err) {
      logger.warn(
        { error: err },
        "Redis cache set failed during doctor search",
      );
    }

    return result;
  }
}

export const searchService = new SearchService();
