import { Strand } from './engram.types';

export interface DatabaseConfig {
  type: 'postgres' | 'sqlite';
  postgres?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
  };
  sqlite?: {
    path: string;
  };
}

export interface RetrievalConfig {
  vectorWeight: number;
  keywordWeight: number;
  recencyWeight: number;
  signalWeight: number;
  synapseWeight: number;
  recencyHalfLifeDays: number;
  recencyMaxDays: number;
  synapseDepth: number;
  synapseDecay: number;
  deduplicationThreshold: number;
}

export interface DecayConfig {
  intervalMs: number;
  minSignal: number;
  defaultPulseRate: number;
  strandRates: Record<Strand, number>;
}

export interface NeuroStoreConfig {
  port: number;
  host: string;
  database: DatabaseConfig;
  retrieval: RetrievalConfig;
  decay: DecayConfig;
  embedding: {
    provider: 'openai' | 'ollama' | 'native';
    model: string;
    dimensions: number;
  };
  completion: {
    provider: 'openai' | 'ollama' | 'native';
    model: string;
  };
}
