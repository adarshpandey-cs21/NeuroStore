import { DataStore } from '../types/db.types';
import { Chronicle, ChronicleCreateInput, ChronicleUpdateInput, ChronicleQuery, Nexus, NexusCreateInput } from '../types/chronicle.types';
import { logger } from '../utils/logger';

export class TemporalService {
  constructor(private store: DataStore) {}

  async recordFact(input: ChronicleCreateInput): Promise<Chronicle> {
    // Auto-expire previous version of the same fact
    const existing = await this.store.getCurrentFact(input.ownerId, input.entity, input.attribute);
    if (existing && !input.effectiveFrom) {
      await this.store.updateChronicle(existing.id, { effectiveUntil: new Date() });
      logger.debug('Auto-expired previous fact', { id: existing.id, entity: input.entity, attribute: input.attribute });
    }

    const chronicle = await this.store.createChronicle(input);
    logger.debug('Recorded temporal fact', { id: chronicle.id, entity: input.entity });
    return chronicle;
  }

  async queryFacts(query: ChronicleQuery): Promise<{ chronicles: Chronicle[]; total: number }> {
    return this.store.queryChronicles(query);
  }

  async getCurrentFact(ownerId: string, entity: string, attribute: string): Promise<Chronicle | null> {
    return this.store.getCurrentFact(ownerId, entity, attribute);
  }

  async getTimeline(ownerId: string, entity: string): Promise<Chronicle[]> {
    return this.store.getTimeline(ownerId, entity);
  }

  async getChronicle(id: string): Promise<Chronicle | null> {
    return this.store.getChronicle(id);
  }

  async updateChronicle(id: string, input: ChronicleUpdateInput): Promise<Chronicle | null> {
    return this.store.updateChronicle(id, input);
  }

  async expireChronicle(id: string): Promise<boolean> {
    return this.store.deleteChronicle(id);
  }

  async linkChronicles(input: NexusCreateInput): Promise<Nexus> {
    return this.store.createNexus(input);
  }

  async getRelated(chronicleId: string): Promise<{ nexus: Nexus; chronicle: Chronicle }[]> {
    return this.store.getRelatedChronicles(chronicleId);
  }
}
