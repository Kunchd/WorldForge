import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createChatServer } from './app.mjs';

let baseUrl;
const server = createChatServer({
  generateReply: async (messages) => `Echo: ${messages.at(-1).content}`,
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
