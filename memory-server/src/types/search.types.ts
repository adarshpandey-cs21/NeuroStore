import { Strand } from './engram.types';
import { Chronicle } from './chronicle.types';

export interface SearchQuery {
  ownerId: string;
  query: string;
  limit?: number;
  offset?: number;
  strand?: Strand;
  tags?: string[];
  minSignal?: number;
  minScore?: number;
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

export interface ChronicleHit {
  chronicle: Chronicle;
  relevance: number;
}

export interface SearchResult {
  hits: SearchHit[];
  chronicles: ChronicleHit[];
  total: number;
  query: string;
  took: number;
}
