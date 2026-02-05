import { z } from 'zod';

export const CreateChronicleSchema = z.object({
  ownerId: z.string().min(1),
  entity: z.string().min(1).max(500),
  attribute: z.string().min(1).max(500),
  value: z.string().min(1).max(10000),
  certainty: z.number().min(0).max(1).optional().default(1.0),
  effectiveFrom: z.string().datetime().optional(),
  effectiveUntil: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateChronicleSchema = z.object({
  certainty: z.number().min(0).max(1).optional(),
  effectiveUntil: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const QueryChronicleSchema = z.object({
  ownerId: z.string().min(1),
  entity: z.string().optional(),
  attribute: z.string().optional(),
  at: z.string().datetime().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const CreateNexusSchema = z.object({
  originId: z.string().min(1),
  linkedId: z.string().min(1),
  bondType: z.string().min(1).max(100),
  strength: z.number().min(0).max(1).optional().default(1.0),
  effectiveFrom: z.string().datetime().optional(),
  effectiveUntil: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});
