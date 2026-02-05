import { startTestServer, api, assert, assertEqual, assertExists, section, summary, TestServer } from './helpers';

const OWNER = 'test-user-1';

async function run() {
  console.log('\n🧪 NeuroStore API Integration Tests\n');

  let srv: TestServer | null = null;

  try {
    srv = await startTestServer();
    const { baseUrl } = srv;
    let engramId: string;

    // ─────────────────────────────────────
    section('Health & Status');
    // ─────────────────────────────────────
    {
      const { status, data } = await api(baseUrl, 'GET', '/api/health');
      assertEqual(status, 200, 'GET /api/health returns 200');
      assertEqual(data.status, 'ok', 'Health status is ok');
      assertEqual(data.database, 'sqlite', 'Database type is sqlite');
    }
    {
      const { status, data } = await api(baseUrl, 'GET', '/api/status');
      assertEqual(status, 200, 'GET /api/status returns 200');
      assertEqual(data.stats.engrams, 0, 'Initial engram count is 0');
      assertEqual(data.stats.chronicles, 0, 'Initial chronicle count is 0');
    }

    // ─────────────────────────────────────
    section('Add Memory (Engram CRUD)');
    // ─────────────────────────────────────
    {
      const { status, data } = await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: 'TypeScript is a typed superset of JavaScript',
        tags: ['programming', 'typescript'],
      });
      assertEqual(status, 201, 'POST /api/engrams returns 201');
      assert(Array.isArray(data.engrams), 'Response contains engrams array');
      assert(data.engrams.length >= 1, 'At least one engram created');

      const engram = data.engrams[0];
      engramId = engram.id;
      assertExists(engram.id, 'Engram has ID');
      assertEqual(engram.ownerId, OWNER, 'Engram has correct ownerId');
      assertEqual(engram.strand, 'general', 'Native provider defaults strand to general');
      assert(engram.signal === 0.5, 'Default signal is 0.5');
      assert(Array.isArray(engram.tags), 'Tags preserved');
    }

    // ─────────────────────────────────────
    section('Get Engram');
    // ─────────────────────────────────────
    {
      const { status, data } = await api(baseUrl, 'GET', `/api/engrams/${engramId}`);
      assertEqual(status, 200, 'GET /api/engrams/:id returns 200');
      assertEqual(data.engram.id, engramId, 'Returns correct engram');
    }
    {
      const { status } = await api(baseUrl, 'GET', '/api/engrams/nonexistent-id');
      assertEqual(status, 404, 'GET nonexistent engram returns 404');
    }

    // ─────────────────────────────────────
    section('Update Engram');
    // ─────────────────────────────────────
    {
      const { status, data } = await api(baseUrl, 'PATCH', `/api/engrams/${engramId}`, {
        tags: ['programming', 'typescript', 'updated'],
        signal: 0.8,
      });
      assertEqual(status, 200, 'PATCH /api/engrams/:id returns 200');
      assertEqual(data.engram.signal, 0.8, 'Signal updated to 0.8');
      assert(data.engram.tags.includes('updated'), 'Tags updated');
    }

    // ─────────────────────────────────────
    section('List Engrams');
    // ─────────────────────────────────────
    {
      const { status, data } = await api(baseUrl, 'GET', `/api/engrams?ownerId=${OWNER}`);
      assertEqual(status, 200, 'GET /api/engrams returns 200');
      assert(data.total >= 1, 'Total count >= 1');
      assert(data.engrams.length >= 1, 'Engrams array has items');
    }

    // ─────────────────────────────────────
    section('Deduplication');
    // ─────────────────────────────────────
    {
      // Add exact same content again
      const { data: before } = await api(baseUrl, 'GET', '/api/status');
      const countBefore = before.stats.engrams;

      await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: 'TypeScript is a typed superset of JavaScript',
      });

      const { data: after } = await api(baseUrl, 'GET', '/api/status');
      assertEqual(after.stats.engrams, countBefore, 'Duplicate content does not create new engram');
    }

    // ─────────────────────────────────────
    section('Add More Memories (for search)');
    // ─────────────────────────────────────
    {
      await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: 'Python is great for data science and machine learning',
        tags: ['programming', 'python'],
      });
      await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: 'React is a JavaScript library for building user interfaces',
        tags: ['programming', 'react'],
      });
      await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: 'I prefer dark mode in all my editors',
        tags: ['preference'],
      });

      const { data } = await api(baseUrl, 'GET', '/api/status');
      assert(data.stats.engrams >= 4, `Have ${data.stats.engrams} engrams stored`);
    }

    // ─────────────────────────────────────
    section('Search');
    // ─────────────────────────────────────
    {
      const { status, data } = await api(baseUrl, 'POST', '/api/engrams/search', {
        ownerId: OWNER,
        query: 'programming languages',
        limit: 5,
      });
      assertEqual(status, 200, 'POST /api/engrams/search returns 200');
      assert(data.hits.length > 0, `Search returned ${data.hits.length} hits`);
      assert(typeof data.took === 'number', 'Response includes timing');
      assert(Array.isArray(data.chronicles), 'Response includes chronicles array');

      // Verify retrieval trace
      const hit = data.hits[0];
      assertExists(hit.trace, 'Hit includes retrieval trace');
      assert(typeof hit.trace.vectorScore === 'number', 'Trace has vectorScore');
      assert(typeof hit.trace.keywordScore === 'number', 'Trace has keywordScore');
      assert(typeof hit.trace.finalScore === 'number', 'Trace has finalScore');
    }

    // ─────────────────────────────────────
    section('Reinforce Engram');
    // ─────────────────────────────────────
    {
      const { data: before } = await api(baseUrl, 'GET', `/api/engrams/${engramId}`);
      const signalBefore = before.engram.signal;

      const { status, data } = await api(baseUrl, 'POST', `/api/engrams/${engramId}/reinforce`, {
        boost: 0.1,
      });
      assertEqual(status, 200, 'POST /api/engrams/:id/reinforce returns 200');
      assert(data.engram.signal > signalBefore, `Signal increased from ${signalBefore} to ${data.engram.signal}`);
    }

    // ─────────────────────────────────────
    section('Chronicles (Direct API)');
    // ─────────────────────────────────────
    let chronicleId: string;
    {
      // Record: user has Samsung
      const { status, data } = await api(baseUrl, 'POST', '/api/chronicles', {
        ownerId: OWNER,
        entity: OWNER,
        attribute: 'phone',
        value: 'Samsung Galaxy S24',
      });
      assertEqual(status, 201, 'POST /api/chronicles returns 201');
      assertExists(data.chronicle.id, 'Chronicle has ID');
      assertEqual(data.chronicle.entity, OWNER, 'Chronicle entity correct');
      assertEqual(data.chronicle.value, 'Samsung Galaxy S24', 'Chronicle value correct');
      chronicleId = data.chronicle.id;
    }
    {
      // Current fact should be Samsung
      const { status, data } = await api(baseUrl, 'GET',
        `/api/chronicles/current?ownerId=${OWNER}&entity=${OWNER}&attribute=phone`);
      assertEqual(status, 200, 'GET /api/chronicles/current returns 200');
      assertEqual(data.chronicle.value, 'Samsung Galaxy S24', 'Current phone is Samsung');
    }
    {
      // Record: user switches to iPhone (should auto-expire Samsung)
      const { status, data } = await api(baseUrl, 'POST', '/api/chronicles', {
        ownerId: OWNER,
        entity: OWNER,
        attribute: 'phone',
        value: 'iPhone 16 Pro',
      });
      assertEqual(status, 201, 'New chronicle created for iPhone');

      // Current fact should now be iPhone
      const { data: current } = await api(baseUrl, 'GET',
        `/api/chronicles/current?ownerId=${OWNER}&entity=${OWNER}&attribute=phone`);
      assertEqual(current.chronicle.value, 'iPhone 16 Pro', 'Current phone updated to iPhone');
    }
    {
      // Timeline should show both
      const { status, data } = await api(baseUrl, 'GET',
        `/api/chronicles/timeline?ownerId=${OWNER}&entity=${OWNER}`);
      assertEqual(status, 200, 'GET /api/chronicles/timeline returns 200');
      assert(data.chronicles.length >= 2, `Timeline has ${data.chronicles.length} entries`);

      // First entry (oldest) should be Samsung with effective_until set
      const samsung = data.chronicles.find((c: any) => c.value === 'Samsung Galaxy S24');
      assertExists(samsung, 'Samsung exists in timeline');
      assertExists(samsung.effectiveUntil, 'Samsung chronicle was expired');
    }

    // ─────────────────────────────────────
    section('Chronicle Search via Engram Search');
    // ─────────────────────────────────────
    {
      const { data } = await api(baseUrl, 'POST', '/api/engrams/search', {
        ownerId: OWNER,
        query: 'phone',
        limit: 5,
      });
      assert(data.chronicles.length > 0, `Chronicle search returned ${data.chronicles.length} matches`);
      const phoneChronicle = data.chronicles.find((ch: any) => ch.chronicle.attribute === 'phone');
      assertExists(phoneChronicle, 'Phone chronicle found in search results');
      assertEqual(phoneChronicle.chronicle.value, 'iPhone 16 Pro', 'Chronicle shows current value (iPhone)');
    }

    // ─────────────────────────────────────
    section('Chronicle Update & Expire');
    // ─────────────────────────────────────
    {
      const { status, data } = await api(baseUrl, 'PATCH', `/api/chronicles/${chronicleId}`, {
        certainty: 0.5,
      });
      assertEqual(status, 200, 'PATCH /api/chronicles/:id returns 200');
      assertEqual(data.chronicle.certainty, 0.5, 'Certainty updated');
    }

    // ─────────────────────────────────────
    section('Nexus (Link Chronicles)');
    // ─────────────────────────────────────
    {
      // Add another chronicle to link to
      const { data: c2 } = await api(baseUrl, 'POST', '/api/chronicles', {
        ownerId: OWNER,
        entity: OWNER,
        attribute: 'carrier',
        value: 'AT&T',
      });

      const { status, data } = await api(baseUrl, 'POST', '/api/nexuses', {
        originId: chronicleId,
        linkedId: c2.chronicle.id,
        bondType: 'related_to',
      });
      assertEqual(status, 201, 'POST /api/nexuses returns 201');
      assertExists(data.nexus.id, 'Nexus has ID');
      assertEqual(data.nexus.bondType, 'related_to', 'Bond type correct');

      // Get related
      const { data: related } = await api(baseUrl, 'GET', `/api/chronicles/${chronicleId}/related`);
      assert(related.related.length > 0, 'Related chronicles found');
    }

    // ─────────────────────────────────────
    section('Decay');
    // ─────────────────────────────────────
    {
      const { status, data } = await api(baseUrl, 'POST', '/api/decay/run', {
        ownerId: OWNER,
      });
      assertEqual(status, 200, 'POST /api/decay/run returns 200');
      assert(typeof data.affected === 'number', `Decay affected ${data.affected} engrams`);
    }

    // ─────────────────────────────────────
    section('Delete Engram');
    // ─────────────────────────────────────
    {
      const { status } = await api(baseUrl, 'DELETE', `/api/engrams/${engramId}`);
      assertEqual(status, 204, 'DELETE /api/engrams/:id returns 204');

      const { status: getStatus } = await api(baseUrl, 'GET', `/api/engrams/${engramId}`);
      assertEqual(getStatus, 404, 'Deleted engram returns 404');
    }

    // ─────────────────────────────────────
    section('Validation');
    // ─────────────────────────────────────
    {
      const { status } = await api(baseUrl, 'POST', '/api/engrams', {});
      assertEqual(status, 400, 'Empty body returns 400');
    }
    {
      const { status } = await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: '',
      });
      assertEqual(status, 400, 'Empty content returns 400');
    }
    {
      const { status } = await api(baseUrl, 'POST', '/api/engrams/search', {
        query: 'test',
      });
      assertEqual(status, 400, 'Search without ownerId returns 400');
    }

    // ─────────────────────────────────────
    section('Final Stats');
    // ─────────────────────────────────────
    {
      const { data } = await api(baseUrl, 'GET', '/api/status');
      console.log(`  Engrams: ${data.stats.engrams}, Synapses: ${data.stats.synapses}, Chronicles: ${data.stats.chronicles}, Nexuses: ${data.stats.nexuses}`);
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
