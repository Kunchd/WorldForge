import OpenAI from 'openai';

export async function generateOpenAIReply(messages) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error(
      'OPENAI_API_KEY is not configured on the local proxy. Add it to .env.local.',
    );
    error.statusCode = 503;
    throw error;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    instructions:
      'You are WorldForge, a concise and thoughtful assistant. Be helpful, accurate, and transparent about uncertainty.',
    input: messages,
    max_output_tokens: 1000,
    store: false,
  });

  const reply = response.output_text?.trim();
  if (!reply) {
    const error = new Error('OpenAI returned an empty response.');
    error.statusCode = 502;
    throw error;
  }

  return reply;
}
