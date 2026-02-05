import express, { Express } from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { SqliteStore } from '../src/db/sqlite.store';
import { NativeEmbedder } from '../src/providers/native-embedder';
import { NativeCompletion } from '../src/providers/native-completion';
import { CompletionProvider } from '../src/types/provider.types';
import { MemoryService } from '../src/services/memory.service';
import { TemporalService } from '../src/services/temporal.service';
import { DecayService } from '../src/services/decay.service';
import { EngramController } from '../src/api/controllers/engram.controller';
import { ChronicleController } from '../src/api/controllers/chronicle.controller';
import { SystemController } from '../src/api/controllers/system.controller';
import { mountRoutes } from '../src/api/routes';
import { errorHandler, notFound } from '../src/api/middleware/error-handler';
import { DataStore } from '../src/types/db.types';
import { EmbedderProvider } from '../src/types/provider.types';

export interface TestServer {
  baseUrl: string;
  server: http.Server;
  store: DataStore;
  embedder: EmbedderProvider;
  close: () => Promise<void>;
}

let testCounter = 0;

export async function startTestServer(completion?: CompletionProvider): Promise<TestServer> {
  const dbPath = path.join(__dirname, `..`, `data`, `test-${Date.now()}-${testCounter++}.sqlite`);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const store = new SqliteStore(dbPath);
  await store.initialize();

  const embedder = new NativeEmbedder(384);
  const comp = completion || new NativeCompletion();

  const memoryService = new MemoryService(store, embedder, comp);
  const temporalService = new TemporalService(store);
  const decayService = new DecayService(store);

  const app: Express = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', mountRoutes({
    engram: new EngramController(memoryService),
    chronicle: new ChronicleController(temporalService),
    system: new SystemController(memoryService, decayService),
  }));
  app.use(notFound);
  app.use(errorHandler);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        server,
        store,
        embedder,
        close: async () => {
          server.close();
          await store.close();
          try { fs.unlinkSync(dbPath); } catch {}
        },
      });
    });
  });
}

// ── HTTP helpers ──

export async function api(baseUrl: string, method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  const status = res.status;
  if (status === 204) return { status, data: null };

  const data = await res.json();
  return { status, data };
}

// ── Assertion helpers ──

let passed = 0;
let failed = 0;
const failures: string[] = [];

export function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.error(`  ✗ ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

export function assertExists(value: unknown, message: string): void {
  assert(value !== null && value !== undefined, message);
}

export function section(name: string): void {
  console.log(`\n── ${name} ──`);
}

export function summary(): { passed: number; failed: number } {
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  if (failures.length > 0) {
    console.log(`\n  Failures:`);
    failures.forEach(f => console.log(`    - ${f}`));
  }
  console.log(`${'═'.repeat(40)}\n`);
  return { passed, failed };
}
