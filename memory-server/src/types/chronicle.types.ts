export interface Chronicle {
  id: string;
  ownerId: string;
  entity: string;
  attribute: string;
  value: string;
  certainty: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  recordedAt: Date;
  metadata: Record<string, unknown>;
}

export interface ChronicleCreateInput {
  ownerId: string;
  entity: string;
  attribute: string;
  value: string;
  certainty?: number;
  effectiveFrom?: Date;
  effectiveUntil?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface ChronicleUpdateInput {
  certainty?: number;
  effectiveUntil?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface ChronicleQuery {
  ownerId: string;
  entity?: string;
  attribute?: string;
  at?: Date;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface Nexus {
  id: string;
  originId: string;
  linkedId: string;
  bondType: string;
  strength: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  metadata: Record<string, unknown>;
}

export interface NexusCreateInput {
  originId: string;
  linkedId: string;
  bondType: string;
  strength?: number;
  effectiveFrom?: Date;
  effectiveUntil?: Date | null;
  metadata?: Record<string, unknown>;
}
