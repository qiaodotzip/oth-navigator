import { z } from "zod";
import { AuditFieldsSchema, SlugSchema, VerificationSchema } from "../primitives";

export const TenantCategorySchema = z.enum([
  "government",
  "healthcare",
  "community",
  "retail",
  "lifestyle",
  "sports",
  "facility",
]);

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const TenantSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  roomId: SlugSchema,
  nameEn: z.string().min(1),
  nameZh: z.string().min(1),
  category: TenantCategorySchema,
  unitNo: z.string().optional(),
  counters: z.array(z.string()).default([]),
  accessibility: z
    .object({
      liftAccess: z.boolean().default(true),
      stepFreeRoute: z.boolean().default(true),
      notes: z.string().optional(),
    })
    .default({ liftAccess: true, stepFreeRoute: true }),
  /** Free-text for now; structured opening hours are a later concern. */
  hours: z.string().optional(),
  sourceUrl: z.string().url(),
  /** Tenants change. A map that cannot say "this closed in March" goes stale silently. */
  validFrom: DateOnly.optional(),
  validTo: DateOnly.optional(),
  verification: VerificationSchema.default({ status: "unverified", evidence: [] }),
});

export type TenantCategory = z.infer<typeof TenantCategorySchema>;
export type Tenant = z.infer<typeof TenantSchema>;
