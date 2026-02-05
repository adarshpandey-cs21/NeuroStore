import { EmbedderProvider, CompletionProvider } from '../types/provider.types';
import { OpenAIEmbedder } from './openai-embedder';
import { OllamaEmbedder } from './ollama-embedder';
import { NativeEmbedder } from './native-embedder';
import { OpenAICompletion } from './openai-completion';
import { OllamaCompletion } from './ollama-completion';
import { NativeCompletion } from './native-completion';

export type EmbedderProviderType = 'openai' | 'ollama' | 'native';
export type CompletionProviderType = 'openai' | 'ollama' | 'native';

export interface ProviderOptions {
  embedder: {
    provider: EmbedderProviderType;
    model?: string;
    dimensions?: number;
    apiKey?: string;
    baseUrl?: string;
  };
  completion: {
    provider: CompletionProviderType;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
}

export class ProviderFactory {
  static createEmbedder(options: ProviderOptions['embedder']): EmbedderProvider {
    switch (options.provider) {
      case 'openai':
        return new OpenAIEmbedder(options.apiKey, options.model, options.dimensions);
      case 'ollama':
        return new OllamaEmbedder(options.model, options.dimensions, options.baseUrl);
      case 'native':
        return new NativeEmbedder(options.dimensions);
      default:
        throw new Error(`Unknown embedder provider: ${options.provider}`);
    }
  }

  static createCompletion(options: ProviderOptions['completion']): CompletionProvider {
    switch (options.provider) {
      case 'openai':
        return new OpenAICompletion(options.apiKey, options.model);
      case 'ollama':
        return new OllamaCompletion(options.model, options.baseUrl);
      case 'native':
        return new NativeCompletion();
      default:
        throw new Error(`Unknown completion provider: ${options.provider}`);
    }
  }

  static createFromEnv(): { embedder: EmbedderProvider; completion: CompletionProvider } {
    const embedderProvider = (process.env.NS_EMBEDDER_PROVIDER || 'native') as EmbedderProviderType;
    const completionProvider = (process.env.NS_COMPLETION_PROVIDER || 'native') as CompletionProviderType;

    return {
      embedder: ProviderFactory.createEmbedder({
        provider: embedderProvider,
        model: process.env.NS_EMBEDDER_MODEL,
        dimensions: process.env.NS_EMBEDDING_DIMENSIONS ? parseInt(process.env.NS_EMBEDDING_DIMENSIONS, 10) : undefined,
      }),
      completion: ProviderFactory.createCompletion({
        provider: completionProvider,
        model: process.env.NS_COMPLETION_MODEL,
      }),
    };
  }
}
