import { tokenize, computeTermFrequencies } from '../utils/text';

export interface BM25Document {
  id: string;
  content: string;
}

export interface BM25Result {
  id: string;
  score: number;
}

export class BM25Scorer {
  private k1: number;
  private b: number;

  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  score(query: string, documents: BM25Document[]): BM25Result[] {
    if (documents.length === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return documents.map(d => ({ id: d.id, score: 0 }));

    // Tokenize all documents
    const docTokens = documents.map(d => tokenize(d.content));
    const docLengths = docTokens.map(t => t.length);
    const avgDocLength = docLengths.reduce((a, b) => a + b, 0) / documents.length;

    // Compute document frequencies for query terms
    const df = new Map<string, number>();
    for (const token of queryTokens) {
      if (!df.has(token)) {
        let count = 0;
        for (const tokens of docTokens) {
          if (tokens.includes(token)) count++;
        }
        df.set(token, count);
      }
    }

    const N = documents.length;

    return documents.map((doc, idx) => {
      const tf = computeTermFrequencies(docTokens[idx]);
      let score = 0;

      for (const term of queryTokens) {
        const termFreq = tf.get(term) || 0;
        const docFreq = df.get(term) || 0;

        if (termFreq === 0 || docFreq === 0) continue;

        // IDF component
        const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);

        // TF component with length normalization
        const tfNorm = (termFreq * (this.k1 + 1)) /
          (termFreq + this.k1 * (1 - this.b + this.b * (docLengths[idx] / avgDocLength)));

        score += idf * tfNorm;
      }

      return { id: doc.id, score };
    });
  }
}
