export const STRANDS = ['factual', 'experiential', 'procedural', 'preferential', 'relational', 'general'] as const;
export type Strand = typeof STRANDS[number];

export interface Engram {
  id: string;
  ownerId: string;
  content: string;
  contentHash: string;
  strand: Strand;
  tags: string[];
  metadata: Record<string, unknown>;
  embedding: number[];
  signal: number;
  pulseRate: number;
  accessCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date;
}

export interface EngramCreateInput {
  ownerId: string;
  content: string;
  strand?: Strand;
  tags?: string[];
  metadata?: Record<string, unknown>;
  signal?: number;
  pulseRate?: number;
}

export interface EngramUpdateInput {
  content?: string;
  strand?: Strand;
  tags?: string[];
  metadata?: Record<string, unknown>;
  signal?: number;
  pulseRate?: number;
}
