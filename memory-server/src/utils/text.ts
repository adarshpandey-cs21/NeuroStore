const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'about', 'up', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
  'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their', 'what',
  'which', 'who', 'whom',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOPWORDS.has(token));
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeTermFrequencies(tokens: string[]): Map<string, number> {
  const freqs = new Map<string, number>();
  for (const token of tokens) {
    freqs.set(token, (freqs.get(token) || 0) + 1);
  }
  return freqs;
}
