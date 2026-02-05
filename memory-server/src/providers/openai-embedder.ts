import OpenAI from 'openai';
import { EmbedderProvider } from '../types/provider.types';
import { logger } from '../utils/logger';

export class OpenAIEmbedder implements EmbedderProvider {
  private client: OpenAI;
  private model: string;
  readonly dimensions: number;

  constructor(apiKey?: string, model = 'text-embedding-3-small', dimensions = 1536) {
    this.client = new OpenAI({ apiKey: apiKey || process.env.NS_OPENAI_API_KEY });
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    logger.debug('Embedding batch', { count: texts.length, model: this.model });

    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });

    return response.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  }
}
