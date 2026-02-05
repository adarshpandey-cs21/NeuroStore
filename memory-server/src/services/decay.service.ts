import { DataStore } from '../types/db.types';
import { Strand, STRANDS } from '../types/engram.types';
import { logger } from '../utils/logger';

export interface DecayOptions {
  minSignal: number;
  defaultPulseRate: number;
  strandRates: Record<Strand, number>;
}

const DEFAULT_DECAY_OPTIONS: DecayOptions = {
  minSignal: 0.01,
  defaultPulseRate: 0.1,
  strandRates: {
    factual: 0.95,
    experiential: 0.90,
    procedural: 0.97,
    preferential: 0.93,
    relational: 0.92,
    general: 0.88,
  },
};

export class DecayService {
  private options: DecayOptions;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private store: DataStore, options?: Partial<DecayOptions>) {
    this.options = { ...DEFAULT_DECAY_OPTIONS, ...options };
  }

  async runDecay(ownerId: string): Promise<{ affected: number }> {
    logger.info('Running decay cycle', { ownerId });

    let totalAffected = 0;

    // Apply decay per strand with different rates
    for (const strand of STRANDS) {
      const rate = this.options.strandRates[strand] ?? this.options.defaultPulseRate;
      const affected = await this.store.decayEngrams(ownerId, rate, this.options.minSignal);
      totalAffected += affected;
    }

    logger.info('Decay cycle complete', { ownerId, affected: totalAffected });
    return { affected: totalAffected };
  }

  async reinforceAccess(engramId: string, boost = 0.1): Promise<void> {
    await this.store.reinforceEngram(engramId, boost);
    await this.store.recordAccess(engramId);
  }

  startPeriodicDecay(ownerId: string, intervalMs = 3600000): void {
    this.stopPeriodicDecay();
    logger.info('Starting periodic decay', { ownerId, intervalMs });
    this.intervalHandle = setInterval(() => {
      this.runDecay(ownerId).catch(err =>
        logger.error('Periodic decay failed', { error: String(err) })
      );
    }, intervalMs);
  }

  stopPeriodicDecay(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
