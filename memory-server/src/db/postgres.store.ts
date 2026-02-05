import { Pool, PoolConfig } from 'pg';
import { DataStore } from '../types/db.types';
import { Engram, EngramCreateInput, EngramUpdateInput, Strand } from '../types/engram.types';
import { Synapse, SynapseCreateInput } from '../types/synapse.types';
import { Chronicle, ChronicleCreateInput, ChronicleUpdateInput, ChronicleQuery, Nexus, NexusCreateInput } from '../types/chronicle.types';
import { generateId } from '../utils/crypto';
import { logger } from '../utils/logger';

export class PostgresStore implements DataStore {
  private pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');

      await client.query(`
        CREATE TABLE IF NOT EXISTS engrams (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          strand TEXT NOT NULL DEFAULT 'general',
          tags JSONB DEFAULT '[]'::jsonb,
          metadata JSONB DEFAULT '{}'::jsonb,
          embedding vector(1536),
          signal DOUBLE PRECISION NOT NULL DEFAULT 0.5,
          pulse_rate DOUBLE PRECISION NOT NULL DEFAULT 0.1,
          access_count INTEGER NOT NULL DEFAULT 0,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS synapses (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES engrams(id) ON DELETE CASCADE,
          target_id TEXT NOT NULL REFERENCES engrams(id) ON DELETE CASCADE,
          owner_id TEXT NOT NULL,
          weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
          formed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          reinforced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(source_id, target_id)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS chronicles (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          entity TEXT NOT NULL,
          attribute TEXT NOT NULL,
          value TEXT NOT NULL,
          certainty DOUBLE PRECISION NOT NULL DEFAULT 1.0,
          effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          effective_until TIMESTAMPTZ,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          metadata JSONB DEFAULT '{}'::jsonb,
          UNIQUE(entity, attribute, value, effective_from)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS nexuses (
          id TEXT PRIMARY KEY,
          origin_id TEXT NOT NULL REFERENCES chronicles(id) ON DELETE CASCADE,
          linked_id TEXT NOT NULL REFERENCES chronicles(id) ON DELETE CASCADE,
          bond_type TEXT NOT NULL,
          strength DOUBLE PRECISION NOT NULL DEFAULT 1.0,
          effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          effective_until TIMESTAMPTZ,
          metadata JSONB DEFAULT '{}'::jsonb
        )
      `);

      // Indexes
      await client.query('CREATE INDEX IF NOT EXISTS idx_engrams_owner ON engrams(owner_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_engrams_strand ON engrams(strand)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_engrams_signal ON engrams(signal)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_engrams_content_hash ON engrams(content_hash)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_engrams_created ON engrams(created_at)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_engrams_accessed ON engrams(last_accessed_at)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_engrams_tags ON engrams USING GIN(tags)');

      // HNSW index for vector search
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_engrams_embedding ON engrams
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
        `);
      } catch {
        logger.warn('Could not create HNSW index, falling back to sequential scan');
      }

      await client.query('CREATE INDEX IF NOT EXISTS idx_synapses_source ON synapses(source_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_synapses_target ON synapses(target_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_chronicles_owner ON chronicles(owner_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_chronicles_entity ON chronicles(entity)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_chronicles_attr ON chronicles(entity, attribute)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_nexuses_origin ON nexuses(origin_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_nexuses_linked ON nexuses(linked_id)');

      logger.info('PostgresStore initialized');
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async healthCheck(): Promise<{ ok: boolean; type: string }> {
    try {
      await this.pool.query('SELECT 1');
      return { ok: true, type: 'postgres' };
    } catch {
      return { ok: false, type: 'postgres' };
    }
  }

  private rowToEngram(row: any): Engram {
    return {
      id: row.id,
      ownerId: row.owner_id,
      content: row.content,
      contentHash: row.content_hash,
      strand: row.strand as Strand,
      tags: row.tags || [],
      metadata: row.metadata || {},
      embedding: row.embedding ? this.parseVector(row.embedding) : [],
      signal: row.signal,
      pulseRate: row.pulse_rate,
      accessCount: row.access_count,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastAccessedAt: new Date(row.last_accessed_at),
    };
  }

  private parseVector(vec: string | number[]): number[] {
    if (Array.isArray(vec)) return vec;
    // pgvector returns vectors as '[1,2,3]' strings
    return JSON.parse(vec);
  }

  private formatVector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  async createEngram(input: EngramCreateInput & { contentHash: string; embedding: number[] }): Promise<Engram> {
    const id = generateId();
    const now = new Date();
    const result = await this.pool.query(
      `INSERT INTO engrams (id, owner_id, content, content_hash, strand, tags, metadata, embedding, signal, pulse_rate, access_count, version, created_at, updated_at, last_accessed_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::vector, $9, $10, 0, 1, $11, $11, $11)
       RETURNING *`,
      [
        id, input.ownerId, input.content, input.contentHash,
        input.strand || 'general',
        JSON.stringify(input.tags || []),
        JSON.stringify(input.metadata || {}),
        this.formatVector(input.embedding),
        input.signal ?? 0.5,
        input.pulseRate ?? 0.1,
        now,
      ]
    );
    return this.rowToEngram(result.rows[0]);
  }

  async getEngram(id: string): Promise<Engram | null> {
    const result = await this.pool.query('SELECT * FROM engrams WHERE id = $1', [id]);
    return result.rows[0] ? this.rowToEngram(result.rows[0]) : null;
  }

  async updateEngram(id: string, input: EngramUpdateInput & { contentHash?: string; embedding?: number[] }): Promise<Engram | null> {
    const sets: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (input.content !== undefined) {
      sets.push(`content = $${paramIdx++}`);
      values.push(input.content);
    }
    if (input.contentHash !== undefined) {
      sets.push(`content_hash = $${paramIdx++}`);
      values.push(input.contentHash);
    }
    if (input.strand !== undefined) {
      sets.push(`strand = $${paramIdx++}`);
      values.push(input.strand);
    }
    if (input.tags !== undefined) {
      sets.push(`tags = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(input.tags));
    }
    if (input.metadata !== undefined) {
      sets.push(`metadata = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(input.metadata));
    }
    if (input.embedding !== undefined) {
      sets.push(`embedding = $${paramIdx++}::vector`);
      values.push(this.formatVector(input.embedding));
    }
    if (input.signal !== undefined) {
      sets.push(`signal = $${paramIdx++}`);
      values.push(input.signal);
    }
    if (input.pulseRate !== undefined) {
      sets.push(`pulse_rate = $${paramIdx++}`);
      values.push(input.pulseRate);
    }

    if (sets.length === 0) return this.getEngram(id);

    sets.push(`updated_at = NOW()`);
    sets.push(`version = version + 1`);
    values.push(id);

    const result = await this.pool.query(
      `UPDATE engrams SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
    return result.rows[0] ? this.rowToEngram(result.rows[0]) : null;
  }

  async deleteEngram(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM engrams WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listEngrams(ownerId: string, options?: { limit?: number; offset?: number; strand?: Strand }): Promise<{ engrams: Engram[]; total: number }> {
    const conditions = ['owner_id = $1'];
    const values: any[] = [ownerId];
    let paramIdx = 2;

    if (options?.strand) {
      conditions.push(`strand = $${paramIdx++}`);
      values.push(options.strand);
    }

    const where = conditions.join(' AND ');
    const countResult = await this.pool.query(`SELECT COUNT(*) FROM engrams WHERE ${where}`, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    values.push(limit, offset);

    const result = await this.pool.query(
      `SELECT * FROM engrams WHERE ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      values
    );

    return { engrams: result.rows.map((r: any) => this.rowToEngram(r)), total };
  }

  async findByContentHash(ownerId: string, contentHash: string): Promise<Engram | null> {
    const result = await this.pool.query(
      'SELECT * FROM engrams WHERE owner_id = $1 AND content_hash = $2 LIMIT 1',
      [ownerId, contentHash]
    );
    return result.rows[0] ? this.rowToEngram(result.rows[0]) : null;
  }

  async vectorSearch(ownerId: string, embedding: number[], limit: number, strand?: Strand): Promise<{ engram: Engram; score: number }[]> {
    const conditions = ['owner_id = $1'];
    const values: any[] = [ownerId, this.formatVector(embedding)];
    let paramIdx = 3;

    if (strand) {
      conditions.push(`strand = $${paramIdx++}`);
      values.push(strand);
    }

    values.push(limit);
    const where = conditions.join(' AND ');

    const result = await this.pool.query(
      `SELECT *, 1 - (embedding <=> $2::vector) as similarity
       FROM engrams
       WHERE ${where} AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $${paramIdx}`,
      values
    );

    return result.rows.map((r: any) => ({
      engram: this.rowToEngram(r),
      score: r.similarity,
    }));
  }

  async reinforceEngram(id: string, boost: number): Promise<Engram | null> {
    const result = await this.pool.query(
      `UPDATE engrams SET signal = LEAST(signal + $1, 1.0), updated_at = NOW() WHERE id = $2 RETURNING *`,
      [boost, id]
    );
    return result.rows[0] ? this.rowToEngram(result.rows[0]) : null;
  }

  async decayEngrams(ownerId: string, decayFactor: number, minSignal: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE engrams SET signal = GREATEST(signal * $1, $2), updated_at = NOW()
       WHERE owner_id = $3 AND signal > $2`,
      [decayFactor, minSignal, ownerId]
    );
    return result.rowCount ?? 0;
  }

  async recordAccess(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE engrams SET access_count = access_count + 1, last_accessed_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  // Synapses

  async createSynapse(input: SynapseCreateInput): Promise<Synapse> {
    const id = generateId();
    const result = await this.pool.query(
      `INSERT INTO synapses (id, source_id, target_id, owner_id, weight, formed_at, reinforced_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (source_id, target_id) DO UPDATE SET weight = LEAST(synapses.weight + $5, 1.0), reinforced_at = NOW()
       RETURNING *`,
      [id, input.sourceId, input.targetId, input.ownerId, input.weight ?? 1.0]
    );
    return this.rowToSynapse(result.rows[0]);
  }

  async getSynapsesBetween(sourceId: string, targetId: string): Promise<Synapse | null> {
    const result = await this.pool.query(
      'SELECT * FROM synapses WHERE source_id = $1 AND target_id = $2',
      [sourceId, targetId]
    );
    return result.rows[0] ? this.rowToSynapse(result.rows[0]) : null;
  }

  async getSynapsesFrom(engramId: string): Promise<Synapse[]> {
    const result = await this.pool.query(
      'SELECT * FROM synapses WHERE source_id = $1',
      [engramId]
    );
    return result.rows.map((r: any) => this.rowToSynapse(r));
  }

  async reinforceSynapse(id: string, boost: number): Promise<Synapse | null> {
    const result = await this.pool.query(
      `UPDATE synapses SET weight = LEAST(weight + $1, 1.0), reinforced_at = NOW() WHERE id = $2 RETURNING *`,
      [boost, id]
    );
    return result.rows[0] ? this.rowToSynapse(result.rows[0]) : null;
  }

  private rowToSynapse(row: any): Synapse {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      ownerId: row.owner_id,
      weight: row.weight,
      formedAt: new Date(row.formed_at),
      reinforcedAt: new Date(row.reinforced_at),
    };
  }

  // Chronicles

  async createChronicle(input: ChronicleCreateInput): Promise<Chronicle> {
    const id = generateId();
    const result = await this.pool.query(
      `INSERT INTO chronicles (id, owner_id, entity, attribute, value, certainty, effective_from, effective_until, recorded_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9::jsonb)
       RETURNING *`,
      [
        id, input.ownerId, input.entity, input.attribute, input.value,
        input.certainty ?? 1.0,
        input.effectiveFrom || new Date(),
        input.effectiveUntil || null,
        JSON.stringify(input.metadata || {}),
      ]
    );
    return this.rowToChronicle(result.rows[0]);
  }

  async getChronicle(id: string): Promise<Chronicle | null> {
    const result = await this.pool.query('SELECT * FROM chronicles WHERE id = $1', [id]);
    return result.rows[0] ? this.rowToChronicle(result.rows[0]) : null;
  }

  async updateChronicle(id: string, input: ChronicleUpdateInput): Promise<Chronicle | null> {
    const sets: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (input.certainty !== undefined) {
      sets.push(`certainty = $${paramIdx++}`);
      values.push(input.certainty);
    }
    if (input.effectiveUntil !== undefined) {
      sets.push(`effective_until = $${paramIdx++}`);
      values.push(input.effectiveUntil);
    }
    if (input.metadata !== undefined) {
      sets.push(`metadata = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(input.metadata));
    }

    if (sets.length === 0) return this.getChronicle(id);

    values.push(id);
    const result = await this.pool.query(
      `UPDATE chronicles SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
    return result.rows[0] ? this.rowToChronicle(result.rows[0]) : null;
  }

  async deleteChronicle(id: string): Promise<boolean> {
    // Soft delete: set effective_until to now
    const result = await this.pool.query(
      `UPDATE chronicles SET effective_until = NOW() WHERE id = $1 AND effective_until IS NULL RETURNING id`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async queryChronicles(query: ChronicleQuery): Promise<{ chronicles: Chronicle[]; total: number }> {
    const conditions = ['owner_id = $1'];
    const values: any[] = [query.ownerId];
    let paramIdx = 2;

    if (query.entity) {
      conditions.push(`entity = $${paramIdx++}`);
      values.push(query.entity);
    }
    if (query.attribute) {
      conditions.push(`attribute = $${paramIdx++}`);
      values.push(query.attribute);
    }
    if (query.at) {
      conditions.push(`effective_from <= $${paramIdx} AND (effective_until IS NULL OR effective_until > $${paramIdx})`);
      values.push(query.at);
      paramIdx++;
    }
    if (query.from) {
      conditions.push(`effective_from >= $${paramIdx++}`);
      values.push(query.from);
    }
    if (query.to) {
      conditions.push(`(effective_until IS NULL OR effective_until <= $${paramIdx++})`);
      values.push(query.to);
    }

    const where = conditions.join(' AND ');
    const countResult = await this.pool.query(`SELECT COUNT(*) FROM chronicles WHERE ${where}`, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    values.push(limit, offset);

    const result = await this.pool.query(
      `SELECT * FROM chronicles WHERE ${where} ORDER BY effective_from DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      values
    );

    return { chronicles: result.rows.map((r: any) => this.rowToChronicle(r)), total };
  }

  async getCurrentFact(ownerId: string, entity: string, attribute: string): Promise<Chronicle | null> {
    const result = await this.pool.query(
      `SELECT * FROM chronicles
       WHERE owner_id = $1 AND entity = $2 AND attribute = $3
         AND effective_from <= NOW()
         AND (effective_until IS NULL OR effective_until > NOW())
       ORDER BY effective_from DESC LIMIT 1`,
      [ownerId, entity, attribute]
    );
    return result.rows[0] ? this.rowToChronicle(result.rows[0]) : null;
  }

  async getCurrentChronicles(ownerId: string): Promise<Chronicle[]> {
    const result = await this.pool.query(
      `SELECT * FROM chronicles
       WHERE owner_id = $1
         AND effective_from <= NOW()
         AND (effective_until IS NULL OR effective_until > NOW())
       ORDER BY effective_from DESC`,
      [ownerId]
    );
    return result.rows.map((r: any) => this.rowToChronicle(r));
  }

  async getTimeline(ownerId: string, entity: string): Promise<Chronicle[]> {
    const result = await this.pool.query(
      `SELECT * FROM chronicles WHERE owner_id = $1 AND entity = $2 ORDER BY effective_from ASC`,
      [ownerId, entity]
    );
    return result.rows.map((r: any) => this.rowToChronicle(r));
  }

  // Nexuses

  async createNexus(input: NexusCreateInput): Promise<Nexus> {
    const id = generateId();
    const result = await this.pool.query(
      `INSERT INTO nexuses (id, origin_id, linked_id, bond_type, strength, effective_from, effective_until, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [
        id, input.originId, input.linkedId, input.bondType,
        input.strength ?? 1.0,
        input.effectiveFrom || new Date(),
        input.effectiveUntil || null,
        JSON.stringify(input.metadata || {}),
      ]
    );
    return this.rowToNexus(result.rows[0]);
  }

  async getRelatedChronicles(chronicleId: string): Promise<{ nexus: Nexus; chronicle: Chronicle }[]> {
    const result = await this.pool.query(
      `SELECT n.*, c.id as c_id, c.owner_id as c_owner_id, c.entity as c_entity,
              c.attribute as c_attribute, c.value as c_value, c.certainty as c_certainty,
              c.effective_from as c_effective_from, c.effective_until as c_effective_until,
              c.recorded_at as c_recorded_at, c.metadata as c_metadata
       FROM nexuses n
       JOIN chronicles c ON (n.linked_id = c.id OR n.origin_id = c.id) AND c.id != $1
       WHERE n.origin_id = $1 OR n.linked_id = $1`,
      [chronicleId]
    );

    return result.rows.map((r: any) => ({
      nexus: this.rowToNexus(r),
      chronicle: {
        id: r.c_id,
        ownerId: r.c_owner_id,
        entity: r.c_entity,
        attribute: r.c_attribute,
        value: r.c_value,
        certainty: r.c_certainty,
        effectiveFrom: new Date(r.c_effective_from),
        effectiveUntil: r.c_effective_until ? new Date(r.c_effective_until) : null,
        recordedAt: new Date(r.c_recorded_at),
        metadata: r.c_metadata || {},
      },
    }));
  }

  async getStats(): Promise<{ engrams: number; synapses: number; chronicles: number; nexuses: number }> {
    const [e, s, c, n] = await Promise.all([
      this.pool.query('SELECT COUNT(*) FROM engrams'),
      this.pool.query('SELECT COUNT(*) FROM synapses'),
      this.pool.query('SELECT COUNT(*) FROM chronicles'),
      this.pool.query('SELECT COUNT(*) FROM nexuses'),
    ]);
    return {
      engrams: parseInt(e.rows[0].count, 10),
      synapses: parseInt(s.rows[0].count, 10),
      chronicles: parseInt(c.rows[0].count, 10),
      nexuses: parseInt(n.rows[0].count, 10),
    };
  }

  private rowToChronicle(row: any): Chronicle {
    return {
      id: row.id,
      ownerId: row.owner_id,
      entity: row.entity,
      attribute: row.attribute,
      value: row.value,
      certainty: row.certainty,
      effectiveFrom: new Date(row.effective_from),
      effectiveUntil: row.effective_until ? new Date(row.effective_until) : null,
      recordedAt: new Date(row.recorded_at),
      metadata: row.metadata || {},
    };
  }

  private rowToNexus(row: any): Nexus {
    return {
      id: row.id,
      originId: row.origin_id,
      linkedId: row.linked_id,
      bondType: row.bond_type,
      strength: row.strength,
      effectiveFrom: new Date(row.effective_from),
      effectiveUntil: row.effective_until ? new Date(row.effective_until) : null,
      metadata: row.metadata || {},
    };
  }
}
