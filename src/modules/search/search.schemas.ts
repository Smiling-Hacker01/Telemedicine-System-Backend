import { z } from 'zod';

export const searchDoctorsSchema = z.object({
  query: z.string().max(100).optional(),
  specialty: z.string().max(100).optional(),
  minFee: z.coerce.number().min(0).optional(),
  maxFee: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  minExperience: z.coerce.number().min(0).max(70).optional(),
  availableDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'availableDate must be YYYY-MM-DD').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sortBy: z.enum(['fee_asc', 'fee_desc', 'rating_desc', 'experience_desc']).default('rating_desc'),
});

export type SearchDoctorsInput = z.infer<typeof searchDoctorsSchema>;
