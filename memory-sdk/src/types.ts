export type Strand = 'factual' | 'experiential' | 'procedural' | 'preferential' | 'relational' | 'general';

export interface Engram {
  id: string;
  ownerId: string;
  content: string;
  contentHash: string;
  strand: Strand;
  tags: string[];
  metadata: Record<string, unknown>;
  signal: number;
  pulseRate: number;
  accessCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
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

export interface RetrievalTrace {
  vectorScore: number;
  keywordScore: number;
  recencyBoost: number;
  signalBoost: number;
  synapseBoost: number;
  finalScore: number;
}

export interface SearchHit {
  engram: {
    id: string;
    ownerId: string;
    content: string;
    strand: Strand;
    tags: string[];
    metadata: Record<string, unknown>;
    signal: number;
    accessCount: number;
    createdAt: string;
    updatedAt: string;
    lastAccessedAt: string;
  };
  trace: RetrievalTrace;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  query: string;
  took: number;
}

export interface SearchQuery {
  ownerId: string;
  query: string;
  limit?: number;
  offset?: number;
  strand?: Strand;
  tags?: string[];
  minSignal?: number;
  expandSynapses?: boolean;
}

export interface Chronicle {
  id: string;
  ownerId: string;
  entity: string;
  attribute: string;
  value: string;
  certainty: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  recordedAt: string;
  metadata: Record<string, unknown>;
}

export interface ChronicleCreateInput {
  ownerId: string;
  entity: string;
  attribute: string;
  value: string;
  certainty?: number;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ChronicleUpdateInput {
  certainty?: number;
  effectiveUntil?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ChronicleQuery {
  ownerId: string;
  entity?: string;
  attribute?: string;
  at?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface Nexus {
  id: string;
  originId: string;
  linkedId: string;
  bondType: string;
  strength: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  metadata: Record<string, unknown>;
}

export interface NexusCreateInput {
  originId: string;
  linkedId: string;
  bondType: string;
  strength?: number;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  metadata?: Record<string, unknown>;
}

export interface HealthResponse {
  status: string;
  database: string;
  timestamp: string;
}

export interface StatusResponse {
  database: string;
  stats: {
    engrams: number;
    synapses: number;
    chronicles: number;
    nexuses: number;
  };
  uptime: number;
  memory: Record<string, number>;
}

export interface NeuroStoreClientOptions {
  /** Server URL. Falls back to NS_BASE_URL env var, then http://localhost:3000 */
  baseUrl?: string;
  /** API key. Falls back to NS_API_KEY env var */
  apiKey?: string;
  headers?: Record<string, string>;
  retries?: number;
  retryDelay?: number;
}
