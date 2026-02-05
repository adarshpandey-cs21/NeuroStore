import { DataStore } from '../types/db.types';
import { Synapse, SynapseExpansion } from '../types/synapse.types';
import { logger } from '../utils/logger';

export class AssociationService {
  constructor(private store: DataStore) {}

  async formSynapse(sourceId: string, targetId: string, ownerId: string, weight = 0.5): Promise<Synapse> {
    logger.debug('Forming synapse', { sourceId, targetId, weight });
    return this.store.createSynapse({ sourceId, targetId, ownerId, weight });
  }

  async reinforcePath(engramIds: string[], boost = 0.05): Promise<void> {
    for (let i = 0; i < engramIds.length - 1; i++) {
      const synapse = await this.store.getSynapsesBetween(engramIds[i], engramIds[i + 1]);
      if (synapse) {
        await this.store.reinforceSynapse(synapse.id, boost);
      }
    }
  }

  async expandFrom(
    seedIds: string[],
    depth = 2,
    decayFactor = 0.8
  ): Promise<SynapseExpansion[]> {
    const expansions: SynapseExpansion[] = [];
    const visited = new Set<string>(seedIds);

    let frontier = seedIds.map(id => ({ id, boost: 1.0, depth: 0, path: [id] }));

    while (frontier.length > 0) {
      const nextFrontier: typeof frontier = [];

      for (const node of frontier) {
        if (node.depth >= depth) continue;

        const synapses = await this.store.getSynapsesFrom(node.id);

        for (const synapse of synapses) {
          if (visited.has(synapse.targetId)) continue;
          visited.add(synapse.targetId);

          const newBoost = node.boost * synapse.weight * decayFactor;
          const expansion: SynapseExpansion = {
            engramId: synapse.targetId,
            boost: newBoost,
            depth: node.depth + 1,
            path: [...node.path, synapse.targetId],
          };

          expansions.push(expansion);
          nextFrontier.push({
            id: synapse.targetId,
            boost: newBoost,
            depth: node.depth + 1,
            path: expansion.path,
          });
        }
      }

      frontier = nextFrontier;
    }

    return expansions;
  }
}
