# WorldForge mobile chat

An Android-first Expo/React Native chatbot with a small local Node.js proxy for OpenAI. The same app can run on iOS later without a rewrite.

## Architecture

```text
Android / iOS app  ->  local Node proxy  ->  OpenAI Responses API
   no secret key          key stays here
```

Do not place `OPENAI_API_KEY` in the mobile app or in any `EXPO_PUBLIC_*` variable. Public Expo variables are bundled into the installed app.

## First run on Android

1. Install **Expo Go** from the Google Play Store.
2. Open `.env.local` and set `OPENAI_API_KEY` to your OpenAI API key.
3. Make sure the phone and this computer are on the same Wi-Fi network.
4. In one new PowerShell terminal, start the proxy:

   ```powershell
   npm run server
   ```

5. In a second new PowerShell terminal, start Expo:

   ```powershell
   npm start
   ```

6. Open Expo Go on Android and scan the QR code.

The project currently points to `http://10.0.0.163:3001`. If the computer's LAN address changes, update `EXPO_PUBLIC_API_URL` in `.env.local` and restart Expo. Windows may ask whether Node.js can accept private-network connections; allow private networks for phone testing.

## Useful commands

```powershell
npm start          # Start Expo on the LAN
npm run server     # Start the local OpenAI proxy
npm run typecheck  # Check the mobile TypeScript
npm test           # Test the proxy without calling OpenAI
```

The proxy health check is available at `http://localhost:3001/health`.

## Chat history and usage logs

Chat histories are stored locally on the device with AsyncStorage. AsyncStorage
is unencrypted, so avoid storing sensitive information in a conversation.

After each successful OpenAI response, the proxy appends a JSON line to
`server/logs/openai-usage.ndjson`. Each record includes total input and output
tokens, cached and uncached input tokens, cache hit rate, model, response ID,
and request duration. Message contents are not logged, and `server/logs/` is
ignored by Git.

## Environment variables

Copy `.env.example` to `.env.local` on another machine. `.env.local` is intentionally ignored by Git.

- `OPENAI_API_KEY`: Secret server-side API key.
- `OPENAI_MODEL`: OpenAI model ID; defaults to `gpt-5-mini`.
- `PORT`: Proxy port; defaults to `3001`.
- `EXPO_PUBLIC_API_URL`: URL the phone uses to reach the proxy.

## Next steps

- Add Anthropic as a second implementation under `server/providers/`.
- Add streamed responses.
- Move the proxy to a hosted backend before distributing the app.
- Replace Expo Go with an Expo development build when native dependencies require it.
