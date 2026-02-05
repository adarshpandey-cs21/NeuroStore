import { DataStore } from '../types/db.types';
import { EmbedderProvider, CompletionProvider } from '../types/provider.types';
import { Engram, EngramCreateInput, EngramUpdateInput, Strand } from '../types/engram.types';
import { SearchQuery, SearchResult } from '../types/search.types';
import { FactExtractionService } from './fact-extraction.service';
import { DeduplicationService } from './deduplication.service';
import { AssociationService } from './association.service';
import { DecayService } from './decay.service';
import { RetrievalPipeline } from '../retrieval/pipeline';
import { logger } from '../utils/logger';

export class MemoryService {
  private factExtraction: FactExtractionService;
  private deduplication: DeduplicationService;
  private association: AssociationService;
  private decay: DecayService;
  private retrieval: RetrievalPipeline;

  constructor(
    private store: DataStore,
    private embedder: EmbedderProvider,
    completion: CompletionProvider
  ) {
    this.factExtraction = new FactExtractionService(completion);
    this.deduplication = new DeduplicationService(store, embedder);
    this.association = new AssociationService(store);
    this.decay = new DecayService(store);
    this.retrieval = new RetrievalPipeline(store, embedder);
  }

  async addMemory(input: EngramCreateInput): Promise<Engram[]> {
    logger.info('Adding memory', { ownerId: input.ownerId, contentLength: input.content.length });

    // Step 1: Extract facts and classify strand
    const { facts, strand } = await this.factExtraction.extract(input.content);
    const effectiveStrand = input.strand || strand;

    const storedEngrams: Engram[] = [];

    for (const fact of facts) {
      // Step 2: Generate embedding
      const embedding = await this.embedder.embed(fact);

      // Step 3: Check for duplicates
      const { isDuplicate, existing } = await this.deduplication.checkDuplicate(
        input.ownerId,
        fact,
        embedding
      );

      if (isDuplicate && existing) {
        // Reinforce existing memory instead of creating duplicate
        logger.debug('Duplicate found, reinforcing', { id: existing.id });
        await this.decay.reinforceAccess(existing.id, 0.1);
        storedEngrams.push(existing);
        continue;
      }

      // Step 4: Store new engram
      const contentHash = this.deduplication.computeHash(fact);
      const engram = await this.store.createEngram({
        ownerId: input.ownerId,
        content: fact,
        strand: effectiveStrand,
        tags: input.tags,
        metadata: input.metadata,
        signal: input.signal,
        pulseRate: input.pulseRate,
        contentHash,
        embedding,
      });

      storedEngrams.push(engram);
    }

    // Step 5: Form synapses between co-created engrams
    if (storedEngrams.length > 1) {
      for (let i = 0; i < storedEngrams.length - 1; i++) {
        for (let j = i + 1; j < storedEngrams.length; j++) {
          await this.association.formSynapse(
            storedEngrams[i].id,
            storedEngrams[j].id,
            input.ownerId,
            0.5
          );
        }
      }
    }

    logger.info('Memory stored', { count: storedEngrams.length });
    return storedEngrams;
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    return this.retrieval.search(query);
  }

  async getEngram(id: string): Promise<Engram | null> {
    const engram = await this.store.getEngram(id);
    if (engram) {
      await this.store.recordAccess(id);
    }
    return engram;
  }

  async updateEngram(id: string, input: EngramUpdateInput): Promise<Engram | null> {
    let embedding: number[] | undefined;
    let contentHash: string | undefined;

    if (input.content) {
      embedding = await this.embedder.embed(input.content);
      contentHash = this.deduplication.computeHash(input.content);
    }

    return this.store.updateEngram(id, { ...input, embedding, contentHash });
  }

  async deleteEngram(id: string): Promise<boolean> {
    return this.store.deleteEngram(id);
  }

  async listEngrams(ownerId: string, options?: { limit?: number; offset?: number; strand?: Strand }): Promise<{ engrams: Engram[]; total: number }> {
    return this.store.listEngrams(ownerId, options);
  }

  async reinforceEngram(id: string, boost: number): Promise<Engram | null> {
    return this.store.reinforceEngram(id, boost);
  }

  async runDecay(ownerId: string): Promise<{ affected: number }> {
    return this.decay.runDecay(ownerId);
  }

  async getStats(): Promise<{ engrams: number; synapses: number; chronicles: number; nexuses: number }> {
    return this.store.getStats();
  }

  async healthCheck(): Promise<{ ok: boolean; type: string }> {
    return this.store.healthCheck();
  }
}
