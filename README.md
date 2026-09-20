# WorldForge

An Android-first Expo/React Native interactive-novel app. Players create a
setting and high-level plot, then shape an AI-narrated visual-novel-style story
through their choices. Requests can use either a small Node.js proxy or the
player's own OpenAI API key.

## Architecture

```text
                         -> local Node proxy -> OpenAI Responses API
Android / iOS app ------|
                         -> direct request --> OpenAI Responses API
                            user's own key
```

The proxy remains the default. Never place a shared or service
`OPENAI_API_KEY` in the mobile source or in an `EXPO_PUBLIC_*` variable; public
Expo variables are bundled into the installed app. A personal key entered in
the app is stored with Expo SecureStore (Android Keystore or iOS Keychain) and
is sent only to OpenAI while direct mode is selected.

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

## Creating and playing novels

The home screen is a library of locally saved novels. Select **New novel**, add
a setting and high-level plot, and optionally provide a title. WorldForge
injects that brief into `prompt.md` and asks the narrator to generate the first
playable scene. The setup prompt remains in model context but is hidden from
the reader view.

Existing histories from the earlier chat-based version are imported into the
library automatically.

## Using your own OpenAI key

Open **Settings**, choose **My API key**, enter a personal OpenAI API key, and
select **Save & use key**. The app then posts directly to the OpenAI
Responses API, so the local proxy does not need to be running. You can switch
back to **Server proxy**, replace the saved key, or remove it from the same
screen.

Direct-key mode is available on Android and iOS. The web build always uses the
proxy because Expo SecureStore does not provide protected web storage. A key in
a client app can still be exposed on a compromised or instrumented device, so
use a restricted project key with spending limits and prefer the proxy for a
deployed multi-user service.

## Novel history and usage logs

Novel briefs and story histories are stored locally on the device with
AsyncStorage. AsyncStorage is unencrypted, so avoid storing sensitive
information in a story.

After each successful OpenAI response made through the proxy, the proxy appends a JSON line to
`server/logs/openai-usage.ndjson`. Each record includes total input and output
tokens, cached and uncached input tokens, cache hit rate, model, response ID,
and request duration. Message contents are not logged, and `server/logs/` is
ignored by Git. Direct requests do not pass through the server and therefore
are not included in this log.

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
