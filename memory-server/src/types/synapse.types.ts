export interface Synapse {
  id: string;
  sourceId: string;
  targetId: string;
  ownerId: string;
  weight: number;
  formedAt: Date;
  reinforcedAt: Date;
}

export interface SynapseCreateInput {
  sourceId: string;
  targetId: string;
  ownerId: string;
  weight?: number;
}

export interface SynapseExpansion {
  engramId: string;
  boost: number;
  depth: number;
  path: string[];
}
