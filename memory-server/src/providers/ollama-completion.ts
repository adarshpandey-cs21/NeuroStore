import { CompletionProvider } from '../types/provider.types';
import { logger } from '../utils/logger';

export class OllamaCompletion implements CompletionProvider {
  private baseUrl: string;
  private model: string;

  constructor(model = 'llama3', baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.NS_OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = model;
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    logger.debug('Ollama completion', { model: this.model });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        options: { temperature: 0.1 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama completion failed: ${response.statusText}`);
    }

    const data = await response.json() as { message: { content: string } };
    return data.message.content;
  }

  async completeJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    const jsonSystemPrompt = `${systemPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No explanations, no markdown.`;
    const content = await this.complete(jsonSystemPrompt, userPrompt);

    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Ollama response');
    }

    return JSON.parse(jsonMatch[0]) as T;
  }
}
