import { DataStore } from '../types/db.types';
import { EmbedderProvider } from '../types/provider.types';
import { SearchQuery, SearchResult, SearchHit, RetrievalTrace } from '../types/search.types';
import { SynapseExpansion } from '../types/synapse.types';
import { Engram, Strand } from '../types/engram.types';
import { BM25Scorer } from './bm25';
import { minMaxNormalize, clamp } from '../utils/math';
import { logger } from '../utils/logger';

interface PipelineConfig {
  vectorWeight: number;
  keywordWeight: number;
  recencyWeight: number;
  signalWeight: number;
  synapseWeight: number;
  recencyHalfLifeDays: number;
  recencyMaxDays: number;
  synapseDepth: number;
  synapseDecay: number;
}

const DEFAULT_CONFIG: PipelineConfig = {
  vectorWeight: 0.40,
  keywordWeight: 0.20,
  recencyWeight: 0.10,
  signalWeight: 0.15,
  synapseWeight: 0.15,
  recencyHalfLifeDays: 7,
  recencyMaxDays: 90,
  synapseDepth: 2,
  synapseDecay: 0.8,
};

export class RetrievalPipeline {
  private bm25: BM25Scorer;
  private config: PipelineConfig;

  constructor(
    private store: DataStore,
    private embedder: EmbedderProvider,
    config?: Partial<PipelineConfig>
  ) {
    this.bm25 = new BM25Scorer();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const startTime = Date.now();
    const limit = query.limit ?? 10;

    // Step 1: Embed query
    const queryEmbedding = await this.embedder.embed(query.query);

    // Step 2: Vector search — fetch extra candidates
    const candidateLimit = limit * 3;
    const vectorResults = await this.store.vectorSearch(
      query.ownerId,
      queryEmbedding,
      candidateLimit,
      query.strand
    );

    if (vectorResults.length === 0) {
      return { hits: [], total: 0, query: query.query, took: Date.now() - startTime };
    }

    // Step 3: BM25 keyword search over candidates
    const bm25Docs = vectorResults.map(vr => ({ id: vr.engram.id, content: vr.engram.content }));
    const bm25Results = this.bm25.score(query.query, bm25Docs);
    const bm25Map = new Map(bm25Results.map(r => [r.id, r.score]));

    // Step 4: Normalize scores
    const vectorScores = vectorResults.map(vr => vr.score);
    const keywordScores = vectorResults.map(vr => bm25Map.get(vr.engram.id) || 0);

    const normalizedVector = minMaxNormalize(vectorScores);
    const normalizedKeyword = minMaxNormalize(keywordScores);

    // Step 5 & 6: Synapse expansion
    const synapseBoosts = new Map<string, number>();
    if (query.expandSynapses !== false) {
      const topSeeds = vectorResults.slice(0, Math.min(5, vectorResults.length));
      const expansions = await this.expandSynapses(topSeeds.map(s => s.engram.id));
      for (const exp of expansions) {
        const current = synapseBoosts.get(exp.engramId) || 0;
        synapseBoosts.set(exp.engramId, Math.max(current, exp.boost));
      }
    }

    // Step 7: Compute final scores
    const now = Date.now();
    const scored: { engram: Engram; trace: RetrievalTrace }[] = vectorResults.map((vr, idx) => {
      const daysSinceAccess = (now - vr.engram.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);

      const vectorComponent = this.config.vectorWeight * normalizedVector[idx];
      const keywordComponent = this.config.keywordWeight * normalizedKeyword[idx];
      const recencyBoost = this.config.recencyWeight *
        Math.exp(-daysSinceAccess / this.config.recencyHalfLifeDays) *
        clamp(1 - daysSinceAccess / this.config.recencyMaxDays, 0, 1);
      const signalBoost = this.config.signalWeight * vr.engram.signal;
      const synapseBoost = this.config.synapseWeight * (synapseBoosts.get(vr.engram.id) || 0);

      const finalScore = vectorComponent + keywordComponent + recencyBoost + signalBoost + synapseBoost;

      return {
        engram: vr.engram,
        trace: {
          vectorScore: normalizedVector[idx],
          keywordScore: normalizedKeyword[idx],
          recencyBoost,
          signalBoost,
          synapseBoost,
          finalScore,
        },
      };
    });

    // Step 8 & 9: Sort and trim
    scored.sort((a, b) => b.trace.finalScore - a.trace.finalScore);
    const topHits = scored.slice(0, limit);

    // Step 10: Post-retrieval reinforcement (fire and forget)
    this.reinforceAccessed(topHits.map(h => h.engram.id)).catch(err =>
      logger.warn('Post-retrieval reinforcement failed', { error: String(err) })
    );

    const hits: SearchHit[] = topHits.map(h => ({
      engram: {
        id: h.engram.id,
        ownerId: h.engram.ownerId,
        content: h.engram.content,
        strand: h.engram.strand,
        tags: h.engram.tags,
        metadata: h.engram.metadata,
        signal: h.engram.signal,
        accessCount: h.engram.accessCount,
        createdAt: h.engram.createdAt,
        updatedAt: h.engram.updatedAt,
        lastAccessedAt: h.engram.lastAccessedAt,
      },
      trace: h.trace,
    }));

    return {
      hits,
      total: hits.length,
      query: query.query,
      took: Date.now() - startTime,
    };
  }

  private async expandSynapses(seedIds: string[]): Promise<SynapseExpansion[]> {
    const expansions: SynapseExpansion[] = [];
    const visited = new Set<string>(seedIds);

    // BFS with depth limit
    let frontier = seedIds.map(id => ({ id, boost: 1.0, depth: 0, path: [id] }));

    while (frontier.length > 0) {
      const nextFrontier: typeof frontier = [];

      for (const node of frontier) {
        if (node.depth >= this.config.synapseDepth) continue;

        const synapses = await this.store.getSynapsesFrom(node.id);

        for (const synapse of synapses) {
          if (visited.has(synapse.targetId)) continue;
          visited.add(synapse.targetId);

          const newBoost = node.boost * synapse.weight * this.config.synapseDecay;
          const expansion: SynapseExpansion = {
            engramId: synapse.targetId,
            boost: newBoost,
            depth: node.depth + 1,
            path: [...node.path, synapse.targetId],
          };

          expansions.push(expansion);
          nextFrontier.push({
            id: synapse.targetId,
            boost: newBoost,
            depth: node.depth + 1,
            path: expansion.path,
          });
        }
      }

      frontier = nextFrontier;
    }

    return expansions;
  }

  private async reinforceAccessed(engramIds: string[]): Promise<void> {
    for (const id of engramIds) {
      await this.store.recordAccess(id);
    }
  }
}
