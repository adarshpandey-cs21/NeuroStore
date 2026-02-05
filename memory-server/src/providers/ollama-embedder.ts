import { EmbedderProvider } from '../types/provider.types';
import { logger } from '../utils/logger';

export class OllamaEmbedder implements EmbedderProvider {
  private baseUrl: string;
  private model: string;
  readonly dimensions: number;

  constructor(model = 'nomic-embed-text', dimensions = 768, baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.NS_OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    logger.debug('Ollama embedding', { model: this.model });

    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.statusText}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch embeddings natively; sequential fallback
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}
