import { createChatServer } from './app.mjs';

const port = Number(process.env.PORT) || 3001;
const server = createChatServer();

server.listen(port, '0.0.0.0', () => {
  console.log(`WorldForge API proxy listening on http://0.0.0.0:${port}`);
});
