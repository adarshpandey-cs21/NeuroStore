import { z } from 'zod';
import { STRANDS } from '../types/engram.types';

export const CreateEngramSchema = z.object({
  ownerId: z.string().min(1),
  content: z.string().min(1).max(50000),
  strand: z.enum(STRANDS).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  signal: z.number().min(0).max(1).optional(),
  pulseRate: z.number().min(0).max(1).optional(),
});

export const UpdateEngramSchema = z.object({
  content: z.string().min(1).max(50000).optional(),
  strand: z.enum(STRANDS).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  signal: z.number().min(0).max(1).optional(),
  pulseRate: z.number().min(0).max(1).optional(),
});

export const SearchEngramSchema = z.object({
  ownerId: z.string().min(1),
  query: z.string().min(1).max(10000),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
  strand: z.enum(STRANDS).optional(),
  tags: z.array(z.string()).optional(),
  minSignal: z.number().min(0).max(1).optional(),
  minScore: z.number().min(0).max(1).optional().default(0),
  expandSynapses: z.boolean().optional().default(true),
});

export const ListEngramsSchema = z.object({
  ownerId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  strand: z.enum(STRANDS).optional(),
});

export const ReinforceEngramSchema = z.object({
  boost: z.number().min(0).max(1).optional().default(0.1),
});
