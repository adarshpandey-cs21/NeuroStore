import { Strand } from './engram.types';

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
    createdAt: Date;
    updatedAt: Date;
    lastAccessedAt: Date;
  };
  trace: RetrievalTrace;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  query: string;
  took: number;
}
