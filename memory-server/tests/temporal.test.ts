import { startTestServer, api, assert, assertEqual, assertExists, section, summary, TestServer } from './helpers';
import { CompletionProvider } from '../src/types/provider.types';

const OWNER = 'temporal-test-user';

/**
 * Mock completion provider that simulates LLM fact extraction with temporal detection.
 * This is how it behaves when using openai/ollama providers with real LLM.
 */
class MockCompletion implements CompletionProvider {
  async complete(_systemPrompt: string, userPrompt: string): Promise<string> {
    return userPrompt;
  }

  async completeJson<T>(_systemPrompt: string, userPrompt: string): Promise<T> {
    const lower = userPrompt.toLowerCase();

    // Simulate temporal fact detection for phone-related content
    if (lower.includes('iphone') || lower.includes('samsung') || lower.includes('pixel')) {
      const phone = lower.includes('iphone') ? 'iPhone' :
                     lower.includes('samsung') ? 'Samsung' : 'Pixel';
      return {
        facts: [userPrompt],
        strand: 'preferential',
        temporalFacts: [{ entity: 'speaker', attribute: 'phone', value: phone }],
      } as T;
    }

    // Simulate temporal fact detection for location-related content
    if (lower.includes('moved to') || lower.includes('lives in') || lower.includes('living in')) {
      const cityMatch = userPrompt.match(/(?:moved to|lives in|living in)\s+(\w+)/i);
      const city = cityMatch ? cityMatch[1] : 'unknown';
      return {
        facts: [userPrompt],
        strand: 'experiential',
        temporalFacts: [{ entity: 'speaker', attribute: 'city', value: city }],
      } as T;
    }

    // Simulate multi-fact extraction
    if (lower.includes(' and ')) {
      const parts = userPrompt.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
      return {
        facts: parts.length > 1 ? parts : [userPrompt],
        strand: 'general',
        temporalFacts: [],
      } as T;
    }

    return {
      facts: [userPrompt],
      strand: 'general',
      temporalFacts: [],
    } as T;
  }
}

async function run() {
  console.log('\n🧪 NeuroStore Temporal Integration Tests\n');

  let srv: TestServer | null = null;

  try {
    srv = await startTestServer(new MockCompletion());
    const { baseUrl } = srv;

    // ─────────────────────────────────────
    section('Auto-Chronicle from addMemory (phone)');
    // ─────────────────────────────────────
    {
      // Add memory about Samsung — should auto-create chronicle
      const { status } = await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: 'I just got a Samsung Galaxy S24',
      });
      assertEqual(status, 201, 'Memory added successfully');

      // Check chronicle was auto-created
      const { data } = await api(baseUrl, 'GET',
        `/api/chronicles/current?ownerId=${OWNER}&entity=speaker&attribute=phone`);
      assertEqual(data.chronicle.value, 'Samsung', 'Chronicle auto-created with value Samsung');
    }

    // ─────────────────────────────────────
    section('Auto-Chronicle Update (phone switch)');
    // ─────────────────────────────────────
    {
      // Add memory about switching to iPhone — should auto-expire Samsung, create iPhone
      await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: 'I switched to iPhone 16 Pro',
      });

      const { data } = await api(baseUrl, 'GET',
        `/api/chronicles/current?ownerId=${OWNER}&entity=speaker&attribute=phone`);
      assertEqual(data.chronicle.value, 'iPhone', 'Current phone auto-updated to iPhone');

      // Timeline should have both
      const { data: timeline } = await api(baseUrl, 'GET',
        `/api/chronicles/timeline?ownerId=${OWNER}&entity=speaker`);
      assert(timeline.chronicles.length >= 2, `Timeline has ${timeline.chronicles.length} entries`);

      const samsung = timeline.chronicles.find((c: any) => c.value === 'Samsung');
      assertExists(samsung, 'Samsung in timeline');
      assertExists(samsung.effectiveUntil, 'Samsung was auto-expired');

      const iphone = timeline.chronicles.find((c: any) => c.value === 'iPhone');
      assertExists(iphone, 'iPhone in timeline');
      assert(iphone.effectiveUntil === null, 'iPhone is current (no expiry)');
    }

    // ─────────────────────────────────────
    section('Auto-Chronicle from addMemory (city)');
    // ─────────────────────────────────────
    {
      await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: 'I just moved to Berlin for work',
      });

      const { data } = await api(baseUrl, 'GET',
        `/api/chronicles/current?ownerId=${OWNER}&entity=speaker&attribute=city`);
      assertEqual(data.chronicle.value, 'Berlin', 'City chronicle auto-created');
    }
    {
      await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: 'I moved to Tokyo last month',
      });

      const { data } = await api(baseUrl, 'GET',
        `/api/chronicles/current?ownerId=${OWNER}&entity=speaker&attribute=city`);
      assertEqual(data.chronicle.value, 'Tokyo', 'City auto-updated to Tokyo');
    }

    // ─────────────────────────────────────
    section('Search Returns Chronicles');
    // ─────────────────────────────────────
    {
      const { data } = await api(baseUrl, 'POST', '/api/engrams/search', {
        ownerId: OWNER,
        query: 'what phone do I use',
        limit: 5,
      });
      assert(data.chronicles.length > 0, `Search returned ${data.chronicles.length} chronicle matches`);
      const phoneHit = data.chronicles.find((ch: any) => ch.chronicle.attribute === 'phone');
      assertExists(phoneHit, 'Phone chronicle in search results');
      assertEqual(phoneHit.chronicle.value, 'iPhone', 'Search shows current phone value');
    }
    {
      const { data } = await api(baseUrl, 'POST', '/api/engrams/search', {
        ownerId: OWNER,
        query: 'where do I live city',
        limit: 5,
      });
      const cityHit = data.chronicles.find((ch: any) => ch.chronicle.attribute === 'city');
      assertExists(cityHit, 'City chronicle in search results');
      assertEqual(cityHit.chronicle.value, 'Tokyo', 'Search shows current city value');
    }

    // ─────────────────────────────────────
    section('Multi-Fact Extraction + Synapses');
    // ─────────────────────────────────────
    {
      const { data } = await api(baseUrl, 'POST', '/api/engrams', {
        ownerId: OWNER,
        content: 'I love hiking and I enjoy cooking Italian food',
      });
      assert(data.engrams.length >= 2, `Multi-fact extraction created ${data.engrams.length} engrams`);

      // Check synapses were formed between co-created engrams
      const { data: stats } = await api(baseUrl, 'GET', '/api/status');
      assert(stats.stats.synapses > 0, `Synapses formed: ${stats.stats.synapses}`);
    }

    // ─────────────────────────────────────
    section('Time-Travel Query');
    // ─────────────────────────────────────
    {
      // Query chronicles at a specific point (all current)
      const { data } = await api(baseUrl, 'GET',
        `/api/chronicles?ownerId=${OWNER}&entity=speaker`);
      assert(data.chronicles.length > 0, `Found ${data.chronicles.length} chronicles for speaker`);
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
