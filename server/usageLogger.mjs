import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOG_DIRECTORY = fileURLToPath(
  new URL('./logs/', import.meta.url),
);

export function buildOpenAIUsageRecord(
  response,
  { durationMs, messageCount, timestamp = new Date().toISOString() } = {},
) {
  const usage = response.usage ?? {};
  const inputTokens = usage.input_tokens ?? 0;
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const cacheWriteTokens =
    usage.input_tokens_details?.cache_write_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;

  return {
    timestamp,
    provider: 'openai',
    response_id: response.id ?? null,
    request_id: response._request_id ?? null,
    model: response.model ?? null,
    status: response.status ?? null,
    incomplete_reason: response.incomplete_details?.reason ?? null,
    message_count: messageCount ?? null,
    duration_ms: durationMs ?? null,
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    cache_write_tokens: cacheWriteTokens,
    uncached_input_tokens: Math.max(
      0,
      inputTokens - cachedInputTokens - cacheWriteTokens,
    ),
    cache_hit: cachedInputTokens > 0,
    cache_hit_rate:
      inputTokens > 0
        ? Number((cachedInputTokens / inputTokens).toFixed(4))
        : 0,
    output_tokens: outputTokens,
    reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    total_tokens: usage.total_tokens ?? inputTokens + outputTokens,
  };
}

export async function appendOpenAIUsage(
  record,
  { logDirectory = DEFAULT_LOG_DIRECTORY } = {},
) {
  await mkdir(logDirectory, { recursive: true });
  await appendFile(
    join(logDirectory, 'openai-usage.ndjson'),
    `${JSON.stringify(record)}\n`,
    'utf8',
  );
}
