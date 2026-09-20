import { createServer } from 'node:http';

import { generateOpenAIReply } from './providers/openai.mjs';
import {
  DEFAULT_MODEL_ID,
  isModelId,
} from '../src/lib/modelConfig.mjs';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARACTERS = 30_000;

function writeJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function validateMessages(value) {
  if (!Array.isArray(value) || value.length === 0) {
    const error = new Error('At least one message is required.');
    error.statusCode = 400;
    throw error;
  }

  const contextMessages =
    value.length > MAX_MESSAGES
      ? [value[0], ...value.slice(-(MAX_MESSAGES - 1))]
      : value;

  const messages = contextMessages.map((message) => {
    const role = message?.role;
    const content = message?.content?.trim();
    if ((role !== 'user' && role !== 'assistant') || !content) {
      const error = new Error('Each message needs a valid role and content.');
      error.statusCode = 400;
      throw error;
    }
    return { role, content };
  });

  const characterCount = messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );
  if (characterCount > MAX_TOTAL_CHARACTERS) {
    const error = new Error('This story turn is too long. Shorten your response.');
    error.statusCode = 413;
    throw error;
  }

  return messages;
}

function validateModel(value) {
  const model = value ?? DEFAULT_MODEL_ID;
  if (!isModelId(model)) {
    const error = new Error('Unsupported model.');
    error.statusCode = 400;
    throw error;
  }
  return model;
}

export function createChatServer({ generateReply = generateOpenAIReply } = {}) {
  return createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      writeJson(response, 204, {});
      return;
    }

    if (request.method === 'GET' && request.url === '/health') {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (request.method !== 'POST' || request.url !== '/api/chat') {
      writeJson(response, 404, { error: 'Not found.' });
      return;
    }

    try {
      const body = await readJson(request);
      if (body.provider && body.provider !== 'openai') {
        const error = new Error(`Unsupported provider: ${body.provider}`);
        error.statusCode = 400;
        throw error;
      }

      const messages = validateMessages(body.messages);
      const model = validateModel(body.model);
      const reply = await generateReply(messages, model);
      writeJson(response, 200, { reply });
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode)
        ? error.statusCode
        : Number.isInteger(error?.status)
          ? error.status
          : 500;
      const safeMessage =
        statusCode >= 500 && statusCode !== 503 && !error?.expose
          ? 'The AI service could not complete the request.'
          : error instanceof Error
            ? error.message
            : 'Unexpected server error.';

      if (statusCode >= 500) console.error(error);
      writeJson(response, statusCode, { error: safeMessage });
    }
  });
}
