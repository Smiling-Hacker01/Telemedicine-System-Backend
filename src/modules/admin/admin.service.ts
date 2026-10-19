import { ConsultationStatus, PaymentStatus, UserRole } from "@prisma/client";
import { prisma } from "../../config/database.js";

export class AdminService {
  /**
   * Computes system-wide operational KPIs and analytics for administrators
   */
  async getDashboardAnalytics() {
    const [
      totalPatients,
      totalDoctors,
      verifiedDoctors,
      consultationsByStatus,
      totalRevenueResult,
      recentBookings,
    ] = await Promise.all([
      // 1. Total patients
      prisma.user.count({ where: { role: UserRole.PATIENT } }),

      // 2. Total doctors
      prisma.doctor.count(),

      // 3. Verified doctors
      prisma.doctor.count({ where: { isVerified: true } }),

      // 4. Consultation breakdown by status
      prisma.consultation.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),

      // 5. Total revenue (sum of successful payments)
      prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCESS },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      // 6. Recent bookings
      prisma.consultation.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          patient: { select: { email: true, profile: true } },
          doctor: {
            include: { user: { select: { email: true, profile: true } } },
          },
          payment: true,
        },
      }),
    ]);

    // Aggregate status counts
    const statusCounts: Record<string, number> = {
      [ConsultationStatus.PENDING_PAYMENT]: 0,
      [ConsultationStatus.SCHEDULED]: 0,
      [ConsultationStatus.IN_PROGRESS]: 0,
      [ConsultationStatus.COMPLETED]: 0,
      [ConsultationStatus.CANCELLED]: 0,
      [ConsultationStatus.NO_SHOW]: 0,
    };

    let totalConsultations = 0;
    for (const group of consultationsByStatus) {
      statusCounts[group.status] = group._count._all;
      totalConsultations += group._count._all;
    }

    const completed = statusCounts[ConsultationStatus.COMPLETED] || 0;
    const completionRate =
      totalConsultations > 0
        ? ((completed / totalConsultations) * 100).toFixed(2) + "%"
        : "0.00%";

    return {
      overview: {
        totalPatients,
        totalDoctors,
        verifiedDoctors,
        totalConsultations,
        completionRate,
        totalRevenue: totalRevenueResult._sum.amount || 0,
        totalSuccessfulTransactions: totalRevenueResult._count._all,
      },
      consultationBreakdown: statusCounts,
      recentBookings,
    };
  }

  /**
   * Queries paginated audit logs for compliance reviews
   */
  async getAuditLogs(filters: {
    page?: number;
    limit?: number;
    action?: string;
    resourceType?: string;
    actorId?: string;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100); // Max 100 per page to bound memory
    const skip = (page - 1) * limit;

    const where = {
      action: filters.action
        ? { contains: filters.action, mode: "insensitive" as const }
        : undefined,
      resourceType: filters.resourceType,
      actorId: filters.actorId,
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: "desc" },
        include: {
          user: {
            select: {
              email: true,
              role: true,
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
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const adminService = new AdminService();
