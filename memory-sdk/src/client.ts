import {
  Engram, EngramCreateInput, EngramUpdateInput,
  SearchQuery, SearchResult,
  Chronicle, ChronicleCreateInput, ChronicleUpdateInput, ChronicleQuery,
  Nexus, NexusCreateInput,
  HealthResponse, StatusResponse,
  NeuroStoreClientOptions, Strand,
} from './types';
import { NeuroStoreError } from './errors';

export class NeuroStoreClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private retries: number;
  private retryDelay: number;

  constructor(options: NeuroStoreClientOptions = {}) {
    const baseUrl = options.baseUrl || process.env.NS_BASE_URL || 'http://localhost:3000';
    const apiKey = options.apiKey || process.env.NS_API_KEY;

    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      ...options.headers,
    };
    this.retries = options.retries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
  }

  // --- Engrams ---

  async addMemory(input: EngramCreateInput): Promise<{ engrams: Engram[] }> {
    return this.post('/api/engrams', input);
  }

  async listEngrams(ownerId: string, options?: { limit?: number; offset?: number; strand?: Strand }): Promise<{ engrams: Engram[]; total: number }> {
    const params = new URLSearchParams({ ownerId });
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.strand) params.set('strand', options.strand);
    return this.get(`/api/engrams?${params}`);
  }

  async getEngram(id: string): Promise<{ engram: Engram }> {
    return this.get(`/api/engrams/${id}`);
  }

  async updateEngram(id: string, input: EngramUpdateInput): Promise<{ engram: Engram }> {
    return this.patch(`/api/engrams/${id}`, input);
  }

  async deleteEngram(id: string): Promise<void> {
    await this.del(`/api/engrams/${id}`);
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    return this.post('/api/engrams/search', query);
  }

  async reinforceEngram(id: string, boost?: number): Promise<{ engram: Engram }> {
    return this.post(`/api/engrams/${id}/reinforce`, { boost });
  }

  // --- Chronicles ---

  async recordChronicle(input: ChronicleCreateInput): Promise<{ chronicle: Chronicle }> {
    return this.post('/api/chronicles', input);
  }

  async queryChronicles(query: ChronicleQuery): Promise<{ chronicles: Chronicle[]; total: number }> {
    const params = new URLSearchParams({ ownerId: query.ownerId });
    if (query.entity) params.set('entity', query.entity);
    if (query.attribute) params.set('attribute', query.attribute);
    if (query.at) params.set('at', query.at);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));
    return this.get(`/api/chronicles?${params}`);
  }

  async getCurrentFact(ownerId: string, entity: string, attribute: string): Promise<{ chronicle: Chronicle }> {
    const params = new URLSearchParams({ ownerId, entity, attribute });
    return this.get(`/api/chronicles/current?${params}`);
  }

  async getTimeline(ownerId: string, entity: string): Promise<{ chronicles: Chronicle[] }> {
    const params = new URLSearchParams({ ownerId, entity });
    return this.get(`/api/chronicles/timeline?${params}`);
  }

  async getChronicle(id: string): Promise<{ chronicle: Chronicle }> {
    return this.get(`/api/chronicles/${id}`);
  }

  async updateChronicle(id: string, input: ChronicleUpdateInput): Promise<{ chronicle: Chronicle }> {
    return this.patch(`/api/chronicles/${id}`, input);
  }

  async expireChronicle(id: string): Promise<void> {
    await this.del(`/api/chronicles/${id}`);
  }

  // --- Nexuses ---

  async createNexus(input: NexusCreateInput): Promise<{ nexus: Nexus }> {
    return this.post('/api/nexuses', input);
  }

  async getRelatedChronicles(chronicleId: string): Promise<{ related: { nexus: Nexus; chronicle: Chronicle }[] }> {
    return this.get(`/api/chronicles/${chronicleId}/related`);
  }

  // --- System ---

  async health(): Promise<HealthResponse> {
    return this.get('/api/health');
  }

  async status(): Promise<StatusResponse> {
    return this.get('/api/status');
  }

  async runDecay(ownerId: string): Promise<{ affected: number }> {
    return this.post('/api/decay/run', { ownerId });
  }

  // --- HTTP helpers ---

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (response.status === 204) {
          return undefined as T;
        }

        const json = await response.json();

        if (!response.ok) {
          throw NeuroStoreError.fromResponse(response.status, json);
        }

        return json as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry client errors (4xx)
        if (error instanceof NeuroStoreError && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        if (attempt < this.retries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
