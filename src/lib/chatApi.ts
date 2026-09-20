import { NovelMessage } from '../types/novel';
import { normalizeOpenAIApiKey } from './apiKey';
import type { ModelId } from './apiSettings';
import { DEFAULT_MODEL_ID } from './modelConfig.mjs';

const PROXY_API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const MAX_OUTPUT_TOKENS = 10_000;

export type ChatTransport =
  | { type: 'proxy'; modelId: ModelId }
  | { type: 'openai'; apiKey: string; modelId: ModelId };

type ProxyChatResponse = {
  reply?: string;
  error?: string;
};

type OpenAIResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

function readOpenAIError(data: OpenAIResponse): string | undefined {
  if (data.error?.message) return data.error.message;

  if (data.status === 'incomplete') {
    return data.incomplete_details?.reason === 'max_output_tokens'
      ? 'The narrator ran out of output space before writing the scene. Please retry.'
      : 'The narrator could not finish the response. Please retry.';
  }

  return undefined;
}

type ChatRequest<TResponse> = {
  url: string;
  headers?: Record<string, string>;
  body: unknown;
  readReply: (data: TResponse) => string | undefined;
  readError: (data: TResponse) => string | undefined;
  connectionError: string;
};

function proxyRequest(
  messages: NovelMessage[],
  modelId: ModelId,
): ChatRequest<ProxyChatResponse> {
  if (!PROXY_API_URL) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_URL. Copy .env.example to .env.local and set your computer\'s LAN address.',
    );
  }

  return {
    url: `${PROXY_API_URL}/api/chat`,
    body: {
      provider: 'openai',
      model: modelId,
      messages: messages.map(({ role, content }) => ({ role, content })),
    },
    readReply: (data) => data.reply?.trim(),
    readError: (data) => data.error,
    connectionError:
      'Could not reach the proxy. Confirm both devices share Wi-Fi and the server is running.',
  };
}

function directOpenAIRequest(
  messages: NovelMessage[],
  apiKey: string,
  modelId: ModelId,
): ChatRequest<OpenAIResponse> {
  const normalizedApiKey = normalizeOpenAIApiKey(apiKey);
  if (!normalizedApiKey) {
    throw new Error('The saved OpenAI API key is empty. Add it again.');
  }

  return {
    url: OPENAI_API_URL,
    headers: { Authorization: `Bearer ${normalizedApiKey}` },
    body: {
      model: modelId,
      instructions:
        'You are WorldForge, an interactive visual-novel narrator and game master. Follow the story brief in the first user message, preserve continuity, and stop at meaningful player decisions.',
      input: messages.map(({ role, content }) => ({ role, content })),
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
    },
    readReply: (data) => {
      const directOutput = data.output_text?.trim();
      if (directOutput) return directOutput;

      const outputText = data.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === 'output_text')
        .map((item) => item.text?.trim())
        .filter((text): text is string => Boolean(text))
        .join('\n');
      return outputText || undefined;
    },
    readError: readOpenAIError,
    connectionError:
      'Could not reach OpenAI. Check your internet connection and try again.',
  };
}

async function postChat<TResponse>(
  request: ChatRequest<TResponse>,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...request.headers,
      },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let data: TResponse;

    try {
      data = JSON.parse(responseText) as TResponse;
    } catch {
      throw new Error(`The service returned an invalid response (${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(
        request.readError(data) ?? `Request failed (${response.status}).`,
      );
    }
    const reply = request.readReply(data);
    if (!reply) {
      throw new Error(
        request.readError(data) ??
          'The narrator returned no story text. Please retry.',
      );
    }

    return reply;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request timed out. Please try again.');
    }
    if (error instanceof TypeError) {
      throw new Error(request.connectionError);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendChat(
  messages: NovelMessage[],
  transport: ChatTransport = { type: 'proxy', modelId: DEFAULT_MODEL_ID },
): Promise<string> {
  if (transport.type === 'openai') {
    return postChat(
      directOpenAIRequest(messages, transport.apiKey, transport.modelId),
    );
  }

  return postChat(proxyRequest(messages, transport.modelId));
}
