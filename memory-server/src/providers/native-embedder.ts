import { createHash } from 'crypto';
import { EmbedderProvider } from '../types/provider.types';
import { logger } from '../utils/logger';

/**
 * Native hash-based embedder — zero external dependencies.
 * Generates deterministic, L2-normalized vectors from text using SHA-512 expansion.
 * Suitable for dedup, basic similarity, and testing. Use OpenAI/Ollama for production semantic search.
 */
export class NativeEmbedder implements EmbedderProvider {
  readonly dimensions: number;

  constructor(dimensions = 384) {
    this.dimensions = dimensions;
    logger.info('Using native embedder (no external provider needed)', { dimensions });
  }

  async embed(text: string): Promise<number[]> {
    return this.hashEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(t => this.hashEmbed(t));
  }

  private hashEmbed(text: string): number[] {
    const normalized = text.toLowerCase().trim();
    const embedding: number[] = [];

    // Generate enough hash rounds to fill dimensions
    let round = 0;
    while (embedding.length < this.dimensions) {
      const hash = createHash('sha512')
        .update(`${round}:${normalized}`)
        .digest();

      // Convert each 4-byte chunk to a float in [-1, 1]
      for (let i = 0; i + 3 < hash.length && embedding.length < this.dimensions; i += 4) {
        const uint = hash.readUInt32LE(i);
        embedding.push((uint / 0xFFFFFFFF) * 2 - 1);
      }
      round++;
    }

    // L2-normalize the vector
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }
}
