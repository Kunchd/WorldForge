import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildOpenAIUsageRecord } from './usageLogger.mjs';

test('builds an OpenAI usage record with cached token details', () => {
  const record = buildOpenAIUsageRecord(
    {
      id: 'resp_123',
      _request_id: 'req_123',
      model: 'gpt-test',
      usage: {
        input_tokens: 1_500,
        input_tokens_details: {
          cached_tokens: 1_000,
          cache_write_tokens: 100,
        },
        output_tokens: 200,
        output_tokens_details: { reasoning_tokens: 50 },
        total_tokens: 1_700,
      },
    },
    {
      durationMs: 321,
      messageCount: 4,
      timestamp: '2026-09-19T12:00:00.000Z',
    },
  );

  assert.deepEqual(record, {
    timestamp: '2026-09-19T12:00:00.000Z',
    provider: 'openai',
    response_id: 'resp_123',
    request_id: 'req_123',
    model: 'gpt-test',
    message_count: 4,
    duration_ms: 321,
    input_tokens: 1_500,
    cached_input_tokens: 1_000,
    cache_write_tokens: 100,
    uncached_input_tokens: 400,
    cache_hit: true,
    cache_hit_rate: 0.6667,
    output_tokens: 200,
    reasoning_tokens: 50,
    total_tokens: 1_700,
  });
});
