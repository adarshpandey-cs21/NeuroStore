import { CompletionProvider } from '../types/provider.types';
import { Strand, STRANDS } from '../types/engram.types';
import { logger } from '../utils/logger';

export interface TemporalFact {
  entity: string;
  attribute: string;
  value: string;
}

export interface ExtractionResult {
  facts: string[];
  strand: Strand;
  temporalFacts: TemporalFact[];
}

const EXTRACTION_SYSTEM_PROMPT = `You are a fact extraction engine. Given a piece of text, extract atomic facts, classify the memory type, and identify any temporal facts (things that change over time).

Rules:
1. Break the input into atomic, self-contained facts
2. Each fact should be a single, clear statement
3. Preserve important context and specifics
4. Remove redundancy
5. Classify the overall memory into one strand: factual, experiential, procedural, preferential, relational, general
6. Identify temporal facts — things with an entity, an attribute, and a current value that may change over time. Examples:
   - "I switched to iPhone" → entity: speaker, attribute: phone, value: iPhone
   - "John lives in Berlin" → entity: John, attribute: city, value: Berlin
   - "I'm using VS Code now" → entity: speaker, attribute: editor, value: VS Code
   - "My favorite color is blue" → entity: speaker, attribute: favorite_color, value: blue
   Only extract temporal facts when there is a clear entity-attribute-value relationship.

Respond with JSON:
{
  "facts": ["fact1", "fact2", ...],
  "strand": "factual|experiential|procedural|preferential|relational|general",
  "temporalFacts": [
    { "entity": "entity_name", "attribute": "attribute_name", "value": "current_value" }
  ]
}`;

export class FactExtractionService {
  constructor(private completion: CompletionProvider) {}

  async extract(content: string): Promise<ExtractionResult> {
    try {
      const result = await this.completion.completeJson<{
        facts: string[];
        strand: string;
        temporalFacts?: TemporalFact[];
      }>(EXTRACTION_SYSTEM_PROMPT, content);

      const strand = STRANDS.includes(result.strand as Strand)
        ? (result.strand as Strand)
        : 'general';

      const facts = Array.isArray(result.facts)
        ? result.facts.filter(f => typeof f === 'string' && f.length > 0)
        : [content];

      if (facts.length === 0) {
        facts.push(content);
      }

      const temporalFacts = Array.isArray(result.temporalFacts)
        ? result.temporalFacts.filter(
            tf => tf && typeof tf.entity === 'string' && typeof tf.attribute === 'string' && typeof tf.value === 'string'
          )
        : [];

      logger.debug('Extracted facts', { count: facts.length, strand, temporalFacts: temporalFacts.length });
      return { facts, strand, temporalFacts };
    } catch (error) {
      logger.warn('Fact extraction failed, using raw content', { error: String(error) });
      return { facts: [content], strand: 'general', temporalFacts: [] };
    }
  }
}
