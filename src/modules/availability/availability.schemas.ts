import { z } from "zod";
import { SlotStatus } from "@prisma/client";

export const createSlotSchema = z
  .object({
    startTime: z
      .string()
      .datetime({ message: "startTime must be an ISO-8601 datetime string" }),
    endTime: z
      .string()
      .datetime({ message: "endTime must be an ISO-8601 datetime string" }),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "endTime must be strictly after startTime",
    path: ["endTime"],
  });

export const bulkCreateSlotsSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format"),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    slotDurationMinutes: z.number().int().min(15).max(120).default(30),
    bufferMinutes: z.number().int().min(0).max(60).default(5),
  })
  .refine((data) => data.endHour > data.startHour, {
    message: "endHour must be strictly after startHour",
    path: ["endHour"],
  });

export const querySlotsSchema = z.object({
  doctorId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.nativeEnum(SlotStatus).optional(),
});

export type CreateSlotInput = z.infer<typeof createSlotSchema>;
export type BulkCreateSlotsInput = z.infer<typeof bulkCreateSlotsSchema>;
export type QuerySlotsInput = z.infer<typeof querySlotsSchema>;
