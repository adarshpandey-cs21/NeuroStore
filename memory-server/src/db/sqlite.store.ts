import Database from 'better-sqlite3';
import { DataStore } from '../types/db.types';
import { Engram, EngramCreateInput, EngramUpdateInput, Strand } from '../types/engram.types';
import { Synapse, SynapseCreateInput } from '../types/synapse.types';
import { Chronicle, ChronicleCreateInput, ChronicleUpdateInput, ChronicleQuery, Nexus, NexusCreateInput } from '../types/chronicle.types';
import { generateId } from '../utils/crypto';
import { cosineSimilarity } from '../utils/math';
import { logger } from '../utils/logger';

export class SqliteStore implements DataStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS engrams (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        strand TEXT NOT NULL DEFAULT 'general',
        tags TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}',
        embedding BLOB,
        signal REAL NOT NULL DEFAULT 0.5,
        pulse_rate REAL NOT NULL DEFAULT 0.1,
        access_count INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS synapses (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES engrams(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES engrams(id) ON DELETE CASCADE,
        owner_id TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        formed_at INTEGER NOT NULL,
        reinforced_at INTEGER NOT NULL,
        UNIQUE(source_id, target_id)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chronicles (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        entity TEXT NOT NULL,
        attribute TEXT NOT NULL,
        value TEXT NOT NULL,
        certainty REAL NOT NULL DEFAULT 1.0,
        effective_from INTEGER NOT NULL,
        effective_until INTEGER,
        recorded_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}',
        UNIQUE(entity, attribute, value, effective_from)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nexuses (
        id TEXT PRIMARY KEY,
        origin_id TEXT NOT NULL REFERENCES chronicles(id) ON DELETE CASCADE,
        linked_id TEXT NOT NULL REFERENCES chronicles(id) ON DELETE CASCADE,
        bond_type TEXT NOT NULL,
        strength REAL NOT NULL DEFAULT 1.0,
        effective_from INTEGER NOT NULL,
        effective_until INTEGER,
        metadata TEXT DEFAULT '{}'
      )
    `);

    // Indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_engrams_owner ON engrams(owner_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_engrams_strand ON engrams(strand)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_engrams_signal ON engrams(signal)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_engrams_content_hash ON engrams(content_hash)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_engrams_created ON engrams(created_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_engrams_accessed ON engrams(last_accessed_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_synapses_source ON synapses(source_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_synapses_target ON synapses(target_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_chronicles_owner ON chronicles(owner_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_chronicles_entity ON chronicles(entity)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_chronicles_attr ON chronicles(entity, attribute)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_nexuses_origin ON nexuses(origin_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_nexuses_linked ON nexuses(linked_id)');

    logger.info('SqliteStore initialized');
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async healthCheck(): Promise<{ ok: boolean; type: string }> {
    try {
      this.db.prepare('SELECT 1').get();
      return { ok: true, type: 'sqlite' };
    } catch {
      return { ok: false, type: 'sqlite' };
    }
  }

  private encodeEmbedding(embedding: number[]): Buffer {
    const buf = Buffer.alloc(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
      buf.writeFloatLE(embedding[i], i * 4);
    }
    return buf;
  }

  private decodeEmbedding(buf: Buffer): number[] {
    const result: number[] = [];
    for (let i = 0; i < buf.length; i += 4) {
      result.push(buf.readFloatLE(i));
    }
    return result;
  }

  private toEpoch(date: Date): number {
    return date.getTime();
  }

  private fromEpoch(epoch: number): Date {
    return new Date(epoch);
  }

  private rowToEngram(row: any): Engram {
    return {
      id: row.id,
      ownerId: row.owner_id,
      content: row.content,
      contentHash: row.content_hash,
      strand: row.strand as Strand,
      tags: JSON.parse(row.tags || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
      embedding: row.embedding ? this.decodeEmbedding(row.embedding) : [],
      signal: row.signal,
      pulseRate: row.pulse_rate,
      accessCount: row.access_count,
      version: row.version,
      createdAt: this.fromEpoch(row.created_at),
      updatedAt: this.fromEpoch(row.updated_at),
      lastAccessedAt: this.fromEpoch(row.last_accessed_at),
    };
  }

  async createEngram(input: EngramCreateInput & { contentHash: string; embedding: number[] }): Promise<Engram> {
    const id = generateId();
    const now = this.toEpoch(new Date());

    const stmt = this.db.prepare(`
      INSERT INTO engrams (id, owner_id, content, content_hash, strand, tags, metadata, embedding, signal, pulse_rate, access_count, version, created_at, updated_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
    `);

    stmt.run(
      id, input.ownerId, input.content, input.contentHash,
      input.strand || 'general',
      JSON.stringify(input.tags || []),
      JSON.stringify(input.metadata || {}),
      this.encodeEmbedding(input.embedding),
      input.signal ?? 0.5,
      input.pulseRate ?? 0.1,
      now, now, now
    );

    return (await this.getEngram(id))!;
  }

  async getEngram(id: string): Promise<Engram | null> {
    const row = this.db.prepare('SELECT * FROM engrams WHERE id = ?').get(id) as any;
    return row ? this.rowToEngram(row) : null;
  }

  async updateEngram(id: string, input: EngramUpdateInput & { contentHash?: string; embedding?: number[] }): Promise<Engram | null> {
    const sets: string[] = [];
    const values: any[] = [];

    if (input.content !== undefined) { sets.push('content = ?'); values.push(input.content); }
    if (input.contentHash !== undefined) { sets.push('content_hash = ?'); values.push(input.contentHash); }
    if (input.strand !== undefined) { sets.push('strand = ?'); values.push(input.strand); }
    if (input.tags !== undefined) { sets.push('tags = ?'); values.push(JSON.stringify(input.tags)); }
    if (input.metadata !== undefined) { sets.push('metadata = ?'); values.push(JSON.stringify(input.metadata)); }
    if (input.embedding !== undefined) { sets.push('embedding = ?'); values.push(this.encodeEmbedding(input.embedding)); }
    if (input.signal !== undefined) { sets.push('signal = ?'); values.push(input.signal); }
    if (input.pulseRate !== undefined) { sets.push('pulse_rate = ?'); values.push(input.pulseRate); }

    if (sets.length === 0) return this.getEngram(id);

    sets.push('updated_at = ?');
    values.push(this.toEpoch(new Date()));
    sets.push('version = version + 1');
    values.push(id);

    this.db.prepare(`UPDATE engrams SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getEngram(id);
  }

  async deleteEngram(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM engrams WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async listEngrams(ownerId: string, options?: { limit?: number; offset?: number; strand?: Strand }): Promise<{ engrams: Engram[]; total: number }> {
    const conditions = ['owner_id = ?'];
    const values: any[] = [ownerId];

    if (options?.strand) {
      conditions.push('strand = ?');
      values.push(options.strand);
    }

    const where = conditions.join(' AND ');
    const countRow = this.db.prepare(`SELECT COUNT(*) as cnt FROM engrams WHERE ${where}`).get(...values) as any;
    const total = countRow.cnt;

    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const rows = this.db.prepare(
      `SELECT * FROM engrams WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...values, limit, offset) as any[];

    return { engrams: rows.map(r => this.rowToEngram(r)), total };
  }

  async findByContentHash(ownerId: string, contentHash: string): Promise<Engram | null> {
    const row = this.db.prepare(
      'SELECT * FROM engrams WHERE owner_id = ? AND content_hash = ? LIMIT 1'
    ).get(ownerId, contentHash) as any;
    return row ? this.rowToEngram(row) : null;
  }

  async vectorSearch(ownerId: string, embedding: number[], limit: number, strand?: Strand): Promise<{ engram: Engram; score: number }[]> {
    // Brute-force cosine similarity for SQLite
    const conditions = ['owner_id = ?', 'embedding IS NOT NULL'];
    const values: any[] = [ownerId];

    if (strand) {
      conditions.push('strand = ?');
      values.push(strand);
    }

    const where = conditions.join(' AND ');
    const rows = this.db.prepare(`SELECT * FROM engrams WHERE ${where}`).all(...values) as any[];

    const scored = rows.map(row => ({
      engram: this.rowToEngram(row),
      score: row.embedding ? cosineSimilarity(embedding, this.decodeEmbedding(row.embedding)) : 0,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async reinforceEngram(id: string, boost: number): Promise<Engram | null> {
    this.db.prepare(
      'UPDATE engrams SET signal = MIN(signal + ?, 1.0), updated_at = ? WHERE id = ?'
    ).run(boost, this.toEpoch(new Date()), id);
    return this.getEngram(id);
  }

  async decayEngrams(ownerId: string, decayFactor: number, minSignal: number): Promise<number> {
    const result = this.db.prepare(
      'UPDATE engrams SET signal = MAX(signal * ?, ?), updated_at = ? WHERE owner_id = ? AND signal > ?'
    ).run(decayFactor, minSignal, this.toEpoch(new Date()), ownerId, minSignal);
    return result.changes;
  }

  async recordAccess(id: string): Promise<void> {
    this.db.prepare(
      'UPDATE engrams SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?'
    ).run(this.toEpoch(new Date()), id);
  }

  // Synapses

  async createSynapse(input: SynapseCreateInput): Promise<Synapse> {
    const id = generateId();
    const now = this.toEpoch(new Date());
    const weight = input.weight ?? 1.0;

    this.db.prepare(`
      INSERT INTO synapses (id, source_id, target_id, owner_id, weight, formed_at, reinforced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, target_id) DO UPDATE SET weight = MIN(synapses.weight + ?, 1.0), reinforced_at = ?
    `).run(id, input.sourceId, input.targetId, input.ownerId, weight, now, now, weight, now);

    const row = this.db.prepare(
      'SELECT * FROM synapses WHERE source_id = ? AND target_id = ?'
    ).get(input.sourceId, input.targetId) as any;
    return this.rowToSynapse(row);
  }

  async getSynapsesBetween(sourceId: string, targetId: string): Promise<Synapse | null> {
    const row = this.db.prepare(
      'SELECT * FROM synapses WHERE source_id = ? AND target_id = ?'
    ).get(sourceId, targetId) as any;
    return row ? this.rowToSynapse(row) : null;
  }

  async getSynapsesFrom(engramId: string): Promise<Synapse[]> {
    const rows = this.db.prepare(
      'SELECT * FROM synapses WHERE source_id = ?'
    ).all(engramId) as any[];
    return rows.map(r => this.rowToSynapse(r));
  }

  async reinforceSynapse(id: string, boost: number): Promise<Synapse | null> {
    this.db.prepare(
      'UPDATE synapses SET weight = MIN(weight + ?, 1.0), reinforced_at = ? WHERE id = ?'
    ).run(boost, this.toEpoch(new Date()), id);
    const row = this.db.prepare('SELECT * FROM synapses WHERE id = ?').get(id) as any;
    return row ? this.rowToSynapse(row) : null;
  }

  private rowToSynapse(row: any): Synapse {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      ownerId: row.owner_id,
      weight: row.weight,
      formedAt: this.fromEpoch(row.formed_at),
      reinforcedAt: this.fromEpoch(row.reinforced_at),
    };
  }

  // Chronicles

  async createChronicle(input: ChronicleCreateInput): Promise<Chronicle> {
    const id = generateId();
    const now = this.toEpoch(new Date());

    this.db.prepare(`
      INSERT INTO chronicles (id, owner_id, entity, attribute, value, certainty, effective_from, effective_until, recorded_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.ownerId, input.entity, input.attribute, input.value,
      input.certainty ?? 1.0,
      input.effectiveFrom ? this.toEpoch(input.effectiveFrom) : now,
      input.effectiveUntil ? this.toEpoch(input.effectiveUntil) : null,
      now,
      JSON.stringify(input.metadata || {})
    );

    return (await this.getChronicle(id))!;
  }

  async getChronicle(id: string): Promise<Chronicle | null> {
    const row = this.db.prepare('SELECT * FROM chronicles WHERE id = ?').get(id) as any;
    return row ? this.rowToChronicle(row) : null;
  }

  async updateChronicle(id: string, input: ChronicleUpdateInput): Promise<Chronicle | null> {
    const sets: string[] = [];
    const values: any[] = [];

    if (input.certainty !== undefined) { sets.push('certainty = ?'); values.push(input.certainty); }
    if (input.effectiveUntil !== undefined) {
      sets.push('effective_until = ?');
      values.push(input.effectiveUntil ? this.toEpoch(input.effectiveUntil) : null);
    }
    if (input.metadata !== undefined) { sets.push('metadata = ?'); values.push(JSON.stringify(input.metadata)); }

    if (sets.length === 0) return this.getChronicle(id);

    values.push(id);
    this.db.prepare(`UPDATE chronicles SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getChronicle(id);
  }

  async deleteChronicle(id: string): Promise<boolean> {
    const result = this.db.prepare(
      'UPDATE chronicles SET effective_until = ? WHERE id = ? AND effective_until IS NULL'
    ).run(this.toEpoch(new Date()), id);
    return result.changes > 0;
  }

  async queryChronicles(query: ChronicleQuery): Promise<{ chronicles: Chronicle[]; total: number }> {
    const conditions = ['owner_id = ?'];
    const values: any[] = [query.ownerId];

    if (query.entity) { conditions.push('entity = ?'); values.push(query.entity); }
    if (query.attribute) { conditions.push('attribute = ?'); values.push(query.attribute); }
    if (query.at) {
      const epoch = this.toEpoch(query.at);
      conditions.push('effective_from <= ? AND (effective_until IS NULL OR effective_until > ?)');
      values.push(epoch, epoch);
    }
    if (query.from) { conditions.push('effective_from >= ?'); values.push(this.toEpoch(query.from)); }
    if (query.to) { conditions.push('(effective_until IS NULL OR effective_until <= ?)'); values.push(this.toEpoch(query.to)); }

    const where = conditions.join(' AND ');
    const countRow = this.db.prepare(`SELECT COUNT(*) as cnt FROM chronicles WHERE ${where}`).get(...values) as any;
    const total = countRow.cnt;

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const rows = this.db.prepare(
      `SELECT * FROM chronicles WHERE ${where} ORDER BY effective_from DESC LIMIT ? OFFSET ?`
    ).all(...values, limit, offset) as any[];

    return { chronicles: rows.map(r => this.rowToChronicle(r)), total };
  }

  async getCurrentFact(ownerId: string, entity: string, attribute: string): Promise<Chronicle | null> {
    const now = this.toEpoch(new Date());
    const row = this.db.prepare(
      `SELECT * FROM chronicles
       WHERE owner_id = ? AND entity = ? AND attribute = ?
         AND effective_from <= ?
         AND (effective_until IS NULL OR effective_until > ?)
       ORDER BY effective_from DESC LIMIT 1`
    ).get(ownerId, entity, attribute, now, now) as any;
    return row ? this.rowToChronicle(row) : null;
  }

  async getTimeline(ownerId: string, entity: string): Promise<Chronicle[]> {
    const rows = this.db.prepare(
      'SELECT * FROM chronicles WHERE owner_id = ? AND entity = ? ORDER BY effective_from ASC'
    ).all(ownerId, entity) as any[];
    return rows.map(r => this.rowToChronicle(r));
  }

  // Nexuses

  async createNexus(input: NexusCreateInput): Promise<Nexus> {
    const id = generateId();
    const now = this.toEpoch(new Date());

    this.db.prepare(`
      INSERT INTO nexuses (id, origin_id, linked_id, bond_type, strength, effective_from, effective_until, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.originId, input.linkedId, input.bondType,
      input.strength ?? 1.0,
      input.effectiveFrom ? this.toEpoch(input.effectiveFrom) : now,
      input.effectiveUntil ? this.toEpoch(input.effectiveUntil) : null,
      JSON.stringify(input.metadata || {})
    );

    const row = this.db.prepare('SELECT * FROM nexuses WHERE id = ?').get(id) as any;
    return this.rowToNexus(row);
  }

  async getRelatedChronicles(chronicleId: string): Promise<{ nexus: Nexus; chronicle: Chronicle }[]> {
    const rows = this.db.prepare(`
      SELECT n.*, c.id as c_id, c.owner_id as c_owner_id, c.entity as c_entity,
             c.attribute as c_attribute, c.value as c_value, c.certainty as c_certainty,
             c.effective_from as c_effective_from, c.effective_until as c_effective_until,
             c.recorded_at as c_recorded_at, c.metadata as c_metadata
      FROM nexuses n
      JOIN chronicles c ON (n.linked_id = c.id OR n.origin_id = c.id) AND c.id != ?
      WHERE n.origin_id = ? OR n.linked_id = ?
    `).all(chronicleId, chronicleId, chronicleId) as any[];

    return rows.map(r => ({
      nexus: this.rowToNexus(r),
      chronicle: {
        id: r.c_id,
        ownerId: r.c_owner_id,
        entity: r.c_entity,
        attribute: r.c_attribute,
        value: r.c_value,
        certainty: r.c_certainty,
        effectiveFrom: this.fromEpoch(r.c_effective_from),
        effectiveUntil: r.c_effective_until ? this.fromEpoch(r.c_effective_until) : null,
        recordedAt: this.fromEpoch(r.c_recorded_at),
        metadata: JSON.parse(r.c_metadata || '{}'),
      },
    }));
  }

  async getStats(): Promise<{ engrams: number; synapses: number; chronicles: number; nexuses: number }> {
    const e = this.db.prepare('SELECT COUNT(*) as cnt FROM engrams').get() as any;
    const s = this.db.prepare('SELECT COUNT(*) as cnt FROM synapses').get() as any;
    const c = this.db.prepare('SELECT COUNT(*) as cnt FROM chronicles').get() as any;
    const n = this.db.prepare('SELECT COUNT(*) as cnt FROM nexuses').get() as any;
    return { engrams: e.cnt, synapses: s.cnt, chronicles: c.cnt, nexuses: n.cnt };
  }

  private rowToChronicle(row: any): Chronicle {
    return {
      id: row.id,
      ownerId: row.owner_id,
      entity: row.entity,
      attribute: row.attribute,
      value: row.value,
      certainty: row.certainty,
      effectiveFrom: this.fromEpoch(row.effective_from),
      effectiveUntil: row.effective_until ? this.fromEpoch(row.effective_until) : null,
      recordedAt: this.fromEpoch(row.recorded_at),
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }

  private rowToNexus(row: any): Nexus {
    return {
      id: row.id,
      originId: row.origin_id,
      linkedId: row.linked_id,
      bondType: row.bond_type,
      strength: row.strength,
      effectiveFrom: this.fromEpoch(row.effective_from),
      effectiveUntil: row.effective_until ? this.fromEpoch(row.effective_until) : null,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }
}
