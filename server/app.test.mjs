import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createChatServer } from './app.mjs';

let baseUrl;
const server = createChatServer({
  generateReply: async (messages) =>
    messages.at(-1).content === 'Inspect context'
      ? `${messages[0].content}|${messages.length}`
      : `Echo: ${messages.at(-1).content}`,
});

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test('health endpoint reports ready', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('chat endpoint validates and forwards messages', async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'openai',
      messages: [{ role: 'user', content: 'Hello' }],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: 'Echo: Hello' });
});

test('chat endpoint keeps the original story brief when trimming context', async () => {
  const messages = [
    { role: 'user', content: 'Original story brief' },
    ...Array.from({ length: 33 }, (_, index) => ({
      role: index % 2 === 0 ? 'assistant' : 'user',
      content: `Story turn ${index + 1}`,
    })),
    { role: 'user', content: 'Inspect context' },
  ];
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'openai', messages }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    reply: 'Original story brief|30',
  });
});

test('chat endpoint rejects unsupported providers', async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'anthropic',
      messages: [{ role: 'user', content: 'Hello' }],
    }),
  });

  assert.equal(response.status, 400);
});
