import { ChatMessage } from '../types/chat';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

type ChatResponse = {
  reply?: string;
  error?: string;
};

export async function sendChat(messages: ChatMessage[]): Promise<string> {
  if (!API_URL) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_URL. Copy .env.example to .env.local and set your computer\'s LAN address.',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        messages: messages.map(({ role, content }) => ({ role, content })),
      }),
      signal: controller.signal,
    });
    const data = (await response.json()) as ChatResponse;

    if (!response.ok) {
      throw new Error(data.error ?? `Request failed (${response.status}).`);
    }
    if (!data.reply) {
      throw new Error('The model returned an empty response.');
    }

    return data.reply;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request timed out. Check the proxy and try again.');
    }
    if (error instanceof TypeError) {
      throw new Error(
        'Could not reach the local proxy. Confirm both devices share Wi-Fi and the server is running.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
