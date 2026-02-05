import { CompletionProvider } from '../types/provider.types';
import { Strand, STRANDS } from '../types/engram.types';
import { logger } from '../utils/logger';

interface ExtractionResult {
  facts: string[];
  strand: Strand;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a fact extraction engine. Given a piece of text, extract atomic facts and classify the memory type.

Rules:
1. Break the input into atomic, self-contained facts
2. Each fact should be a single, clear statement
3. Preserve important context and specifics
4. Remove redundancy
5. Classify the overall memory into one strand: factual, experiential, procedural, preferential, relational, general

Respond with JSON:
{
  "facts": ["fact1", "fact2", ...],
  "strand": "factual|experiential|procedural|preferential|relational|general"
}`;

export class FactExtractionService {
  constructor(private completion: CompletionProvider) {}

  async extract(content: string): Promise<ExtractionResult> {
    try {
      const result = await this.completion.completeJson<{ facts: string[]; strand: string }>(
        EXTRACTION_SYSTEM_PROMPT,
        content
      );

      const strand = STRANDS.includes(result.strand as Strand)
        ? (result.strand as Strand)
        : 'general';

      const facts = Array.isArray(result.facts) ? result.facts.filter(f => typeof f === 'string' && f.length > 0) : [content];

      if (facts.length === 0) {
        facts.push(content);
      }

      logger.debug('Extracted facts', { count: facts.length, strand });
      return { facts, strand };
    } catch (error) {
      logger.warn('Fact extraction failed, using raw content', { error: String(error) });
      return { facts: [content], strand: 'general' };
    }
  }
}
