import { startTestServer, assert, assertEqual, assertExists, section, summary, TestServer } from './helpers';
import { NeuroStoreClient } from '../../memory-sdk/src/client';
import { NeuroStoreError } from '../../memory-sdk/src/errors';

const OWNER = 'sdk-test-user';

async function run() {
  console.log('\n🧪 NeuroStore SDK Integration Tests\n');

  let srv: TestServer | null = null;

  try {
    srv = await startTestServer();
    const { baseUrl } = srv;

    // Create client pointing at test server (no retries for speed)
    const client = new NeuroStoreClient({
      baseUrl,
      retries: 0,
    });

    // ─────────────────────────────────────
    section('SDK: Health & Status');
    // ─────────────────────────────────────
    {
      const health = await client.health();
      assertEqual(health.status, 'ok', 'health().status is ok');
      assertEqual(health.database, 'sqlite', 'health().database is sqlite');
      assertExists(health.timestamp, 'health().timestamp present');
    }
    {
      const status = await client.status();
      assertEqual(status.stats.engrams, 0, 'status().stats.engrams starts at 0');
      assertEqual(status.stats.chronicles, 0, 'status().stats.chronicles starts at 0');
      assertEqual(status.stats.synapses, 0, 'status().stats.synapses starts at 0');
      assertEqual(status.stats.nexuses, 0, 'status().stats.nexuses starts at 0');
      assert(typeof status.uptime === 'number', 'status().uptime is number');
    }

    // ─────────────────────────────────────
    section('SDK: Add Memory');
    // ─────────────────────────────────────
    let engramId: string;
    {
      const result = await client.addMemory({
        ownerId: OWNER,
        content: 'TypeScript is a typed superset of JavaScript',
        tags: ['programming', 'typescript'],
      });
      assert(Array.isArray(result.engrams), 'addMemory returns engrams array');
      assert(result.engrams.length >= 1, 'At least one engram created');

      const engram = result.engrams[0];
      engramId = engram.id;
      assertExists(engram.id, 'Engram has id');
      assertEqual(engram.ownerId, OWNER, 'Engram ownerId correct');
      assert(engram.signal === 0.5, 'Default signal is 0.5');
      assert(Array.isArray(engram.tags), 'Engram has tags array');
    }

    // ─────────────────────────────────────
    section('SDK: Get Engram');
    // ─────────────────────────────────────
    {
      const result = await client.getEngram(engramId);
      assertEqual(result.engram.id, engramId, 'getEngram returns correct engram');
      assertEqual(result.engram.ownerId, OWNER, 'getEngram ownerId matches');
      assert(result.engram.content.length > 0, 'getEngram content not empty');
    }
    {
      // Not found
      let caught = false;
      try {
        await client.getEngram('nonexistent-id');
      } catch (err) {
        caught = true;
        assert(err instanceof NeuroStoreError, 'Error is NeuroStoreError');
        assertEqual((err as NeuroStoreError).statusCode, 404, 'Not found returns 404');
      }
      assert(caught, 'getEngram with bad id throws');
    }

    // ─────────────────────────────────────
    section('SDK: Update Engram');
    // ─────────────────────────────────────
    {
      const result = await client.updateEngram(engramId, {
        tags: ['programming', 'typescript', 'updated'],
        signal: 0.8,
      });
      assertEqual(result.engram.signal, 0.8, 'Signal updated to 0.8');
      assert(result.engram.tags.includes('updated'), 'Tags include updated');
    }

    // ─────────────────────────────────────
    section('SDK: List Engrams');
    // ─────────────────────────────────────
    {
      const result = await client.listEngrams(OWNER);
      assert(result.total >= 1, `listEngrams total >= 1 (got ${result.total})`);
      assert(result.engrams.length >= 1, 'listEngrams has items');
      assertEqual(result.engrams[0].ownerId, OWNER, 'Listed engram ownerId matches');
    }
    {
      // With options
      const result = await client.listEngrams(OWNER, { limit: 1 });
      assert(result.engrams.length <= 1, 'listEngrams respects limit');
    }

    // ─────────────────────────────────────
    section('SDK: Reinforce Engram');
    // ─────────────────────────────────────
    {
      const before = await client.getEngram(engramId);
      const signalBefore = before.engram.signal;

      const result = await client.reinforceEngram(engramId, 0.1);
      assert(result.engram.signal > signalBefore, `Signal increased from ${signalBefore} to ${result.engram.signal}`);
    }

    // ─────────────────────────────────────
    section('SDK: Add More Memories + Search');
    // ─────────────────────────────────────
    {
      await client.addMemory({
        ownerId: OWNER,
        content: 'Python is great for data science',
        tags: ['programming', 'python'],
      });
      await client.addMemory({
        ownerId: OWNER,
        content: 'React is a JavaScript library for UI',
        tags: ['programming', 'react'],
      });

      const result = await client.search({
        ownerId: OWNER,
        query: 'programming languages',
        limit: 5,
      });
      assert(result.hits.length > 0, `search returned ${result.hits.length} hits`);
      assert(typeof result.took === 'number', 'search includes timing');
      assert(Array.isArray(result.chronicles), 'search includes chronicles array');

      // Verify retrieval trace
      const hit = result.hits[0];
      assertExists(hit.trace, 'Hit includes retrieval trace');
      assert(typeof hit.trace.vectorScore === 'number', 'Trace has vectorScore');
      assert(typeof hit.trace.keywordScore === 'number', 'Trace has keywordScore');
      assert(typeof hit.trace.finalScore === 'number', 'Trace has finalScore');
    }

    // ─────────────────────────────────────
    section('SDK: Chronicles CRUD');
    // ─────────────────────────────────────
    let chronicleId: string;
    {
      // Record
      const result = await client.recordChronicle({
        ownerId: OWNER,
        entity: OWNER,
        attribute: 'phone',
        value: 'Samsung Galaxy S24',
      });
      assertExists(result.chronicle.id, 'Chronicle has id');
      assertEqual(result.chronicle.entity, OWNER, 'Chronicle entity correct');
      assertEqual(result.chronicle.value, 'Samsung Galaxy S24', 'Chronicle value correct');
      chronicleId = result.chronicle.id;
    }
    {
      // Get
      const result = await client.getChronicle(chronicleId);
      assertEqual(result.chronicle.id, chronicleId, 'getChronicle returns correct chronicle');
      assertEqual(result.chronicle.value, 'Samsung Galaxy S24', 'getChronicle value correct');
    }
    {
      // Current fact
      const result = await client.getCurrentFact(OWNER, OWNER, 'phone');
      assertEqual(result.chronicle.value, 'Samsung Galaxy S24', 'getCurrentFact returns Samsung');
    }
    {
      // Update
      const result = await client.updateChronicle(chronicleId, { certainty: 0.5 });
      assertEqual(result.chronicle.certainty, 0.5, 'updateChronicle certainty updated');
    }

    // ─────────────────────────────────────
    section('SDK: Chronicle Auto-Expire on New Value');
    // ─────────────────────────────────────
    {
      // Record new phone — should auto-expire Samsung
      await client.recordChronicle({
        ownerId: OWNER,
        entity: OWNER,
        attribute: 'phone',
        value: 'iPhone 16 Pro',
      });

      const current = await client.getCurrentFact(OWNER, OWNER, 'phone');
      assertEqual(current.chronicle.value, 'iPhone 16 Pro', 'Current phone updated to iPhone');

      const timeline = await client.getTimeline(OWNER, OWNER);
      assert(timeline.chronicles.length >= 2, `Timeline has ${timeline.chronicles.length} entries`);

      const samsung = timeline.chronicles.find((c: any) => c.value === 'Samsung Galaxy S24');
      assertExists(samsung, 'Samsung in timeline');
      assertExists(samsung!.effectiveUntil, 'Samsung was auto-expired');
    }

    // ─────────────────────────────────────
    section('SDK: Query Chronicles');
    // ─────────────────────────────────────
    {
      const result = await client.queryChronicles({ ownerId: OWNER, entity: OWNER });
      assert(result.chronicles.length > 0, `queryChronicles returned ${result.chronicles.length} chronicles`);
    }

    // ─────────────────────────────────────
    section('SDK: Nexuses');
    // ─────────────────────────────────────
    {
      // Create another chronicle to link
      const { chronicle: c2 } = await client.recordChronicle({
        ownerId: OWNER,
        entity: OWNER,
        attribute: 'carrier',
        value: 'AT&T',
      });

      const result = await client.createNexus({
        originId: chronicleId,
        linkedId: c2.id,
        bondType: 'related_to',
      });
      assertExists(result.nexus.id, 'Nexus has id');
      assertEqual(result.nexus.bondType, 'related_to', 'Nexus bondType correct');

      // Get related
      const related = await client.getRelatedChronicles(chronicleId);
      assert(related.related.length > 0, 'Related chronicles found');
    }

    // ─────────────────────────────────────
    section('SDK: Decay');
    // ─────────────────────────────────────
    {
      const result = await client.runDecay(OWNER);
      assert(typeof result.affected === 'number', `Decay affected ${result.affected} engrams`);
    }

    // ─────────────────────────────────────
    section('SDK: Delete Engram');
    // ─────────────────────────────────────
    {
      await client.deleteEngram(engramId);

      let caught = false;
      try {
        await client.getEngram(engramId);
      } catch (err) {
        caught = true;
        assertEqual((err as NeuroStoreError).statusCode, 404, 'Deleted engram returns 404');
      }
      assert(caught, 'Deleted engram throws on get');
    }

    // ─────────────────────────────────────
    section('SDK: Error Handling');
    // ─────────────────────────────────────
    {
      // 400 — missing required fields
      let caught = false;
      try {
        await client.addMemory({ ownerId: '', content: '' } as any);
      } catch (err) {
        caught = true;
        assert(err instanceof NeuroStoreError, 'Error is NeuroStoreError');
        assertEqual((err as NeuroStoreError).statusCode, 400, 'Empty content returns 400');
      }
      assert(caught, 'addMemory with empty content throws');
    }
    {
      // 400 — search missing ownerId
      let caught = false;
      try {
        await client.search({ query: 'test' } as any);
      } catch (err) {
        caught = true;
        assertEqual((err as NeuroStoreError).statusCode, 400, 'Search without ownerId returns 400');
      }
      assert(caught, 'search without ownerId throws');
    }

    // ─────────────────────────────────────
    section('SDK: Client with API Key (no server key set)');
    // ─────────────────────────────────────
    {
      // Server has no NS_API_KEY set, so any key should work (auth disabled)
      const keyClient = new NeuroStoreClient({
        baseUrl,
        apiKey: 'test-key-123',
        retries: 0,
      });
      const health = await keyClient.health();
      assertEqual(health.status, 'ok', 'Client with API key works when server auth disabled');
    }

    // ─────────────────────────────────────
    section('SDK: Final Stats');
    // ─────────────────────────────────────
    {
      const status = await client.status();
      console.log(`  Engrams: ${status.stats.engrams}, Synapses: ${status.stats.synapses}, Chronicles: ${status.stats.chronicles}, Nexuses: ${status.stats.nexuses}`);
    }

  } finally {
    if (srv) await srv.close();
  }

  const { failed: f } = summary();
  process.exit(f > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
