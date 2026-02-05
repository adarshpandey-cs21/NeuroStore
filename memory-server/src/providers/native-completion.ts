import { CompletionProvider } from '../types/provider.types';
import { logger } from '../utils/logger';

/**
 * Native completion provider — zero external dependencies.
 * Returns content as-is (no fact extraction, no strand classification, no temporal detection).
 * Suitable for local dev and testing without an LLM key.
 */
export class NativeCompletion implements CompletionProvider {
  constructor() {
    logger.info('Using native completion provider (passthrough, no LLM needed)');
  }

  async complete(_systemPrompt: string, userPrompt: string): Promise<string> {
    return userPrompt;
  }

  async completeJson<T>(_systemPrompt: string, userPrompt: string): Promise<T> {
    return {
      facts: [userPrompt],
      strand: 'general',
      temporalFacts: [],
    } as T;
  }
}
