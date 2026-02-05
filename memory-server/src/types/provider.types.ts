export interface EmbedderProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

export interface CompletionProvider {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
  completeJson<T>(systemPrompt: string, userPrompt: string): Promise<T>;
}
