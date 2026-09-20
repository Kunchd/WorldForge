import OpenAI from 'openai';

import {
  appendOpenAIUsage,
  buildOpenAIUsageRecord,
} from '../usageLogger.mjs';

const MAX_OUTPUT_TOKENS = 4_000;

export async function generateOpenAIReply(messages, model) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error(
      'OPENAI_API_KEY is not configured on the local proxy. Add it to .env.local.',
    );
    error.statusCode = 503;
    throw error;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const startedAt = performance.now();
  const response = await client.responses.create({
    model,
    instructions:
      'You are WorldForge, an interactive visual-novel narrator and game master. Follow the story brief in the first user message, preserve continuity, and stop at meaningful player decisions.',
    input: messages,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
  });

  const usageRecord = buildOpenAIUsageRecord(response, {
    durationMs: Math.round(performance.now() - startedAt),
    messageCount: messages.length,
  });
  try {
    await appendOpenAIUsage(usageRecord);
  } catch (error) {
    console.error('Could not write the OpenAI usage log.', error);
  }

  const reply = response.output_text?.trim();
  if (!reply) {
    const hitOutputLimit =
      response.status === 'incomplete' &&
      response.incomplete_details?.reason === 'max_output_tokens';
    const error = new Error(
      hitOutputLimit
        ? 'The narrator ran out of output space before writing the scene. Please retry.'
        : 'The narrator returned no story text. Please retry.',
    );
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }

  return reply;
}
