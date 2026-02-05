import { Engram, EngramCreateInput, EngramUpdateInput, Strand } from './engram.types';
import { Synapse, SynapseCreateInput } from './synapse.types';
import { Chronicle, ChronicleCreateInput, ChronicleUpdateInput, ChronicleQuery, Nexus, NexusCreateInput } from './chronicle.types';

export interface DataStore {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; type: string }>;

  // Engrams
  createEngram(input: EngramCreateInput & { contentHash: string; embedding: number[] }): Promise<Engram>;
  getEngram(id: string): Promise<Engram | null>;
  updateEngram(id: string, input: EngramUpdateInput & { contentHash?: string; embedding?: number[] }): Promise<Engram | null>;
  deleteEngram(id: string): Promise<boolean>;
  listEngrams(ownerId: string, options?: { limit?: number; offset?: number; strand?: Strand }): Promise<{ engrams: Engram[]; total: number }>;
  findByContentHash(ownerId: string, contentHash: string): Promise<Engram | null>;
  vectorSearch(ownerId: string, embedding: number[], limit: number, strand?: Strand): Promise<{ engram: Engram; score: number }[]>;
  reinforceEngram(id: string, boost: number): Promise<Engram | null>;
  decayEngrams(ownerId: string, decayFactor: number, minSignal: number): Promise<number>;
  recordAccess(id: string): Promise<void>;

  // Synapses
  createSynapse(input: SynapseCreateInput): Promise<Synapse>;
  getSynapsesBetween(sourceId: string, targetId: string): Promise<Synapse | null>;
  getSynapsesFrom(engramId: string): Promise<Synapse[]>;
  reinforceSynapse(id: string, boost: number): Promise<Synapse | null>;

  // Chronicles
  createChronicle(input: ChronicleCreateInput): Promise<Chronicle>;
  getChronicle(id: string): Promise<Chronicle | null>;
  updateChronicle(id: string, input: ChronicleUpdateInput): Promise<Chronicle | null>;
  deleteChronicle(id: string): Promise<boolean>;
  queryChronicles(query: ChronicleQuery): Promise<{ chronicles: Chronicle[]; total: number }>;
  getCurrentFact(ownerId: string, entity: string, attribute: string): Promise<Chronicle | null>;
  getTimeline(ownerId: string, entity: string): Promise<Chronicle[]>;

  // Nexuses
  createNexus(input: NexusCreateInput): Promise<Nexus>;
  getRelatedChronicles(chronicleId: string): Promise<{ nexus: Nexus; chronicle: Chronicle }[]>;

  // Stats
  getStats(): Promise<{ engrams: number; synapses: number; chronicles: number; nexuses: number }>;
}
