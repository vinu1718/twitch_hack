<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Previously On project rules

Build a tight-scope Codex x TwitchCon hackathon demo. Make production-quality changes in small, focused files and inspect related code before editing.

## Architecture

- Use Next.js App Router, TypeScript, and Tailwind CSS.
- Run as one long-lived Node.js 22+ process with `next dev` or `next start`; Docker Compose is for the final run and judges. Do not deploy to Vercel or use serverless functions.
- Use no Python and no database. Keep runtime state in memory and JSON files under `data/`. Keep generated recap media under `data/recaps/` and serve it through `/api/recaps/[id]`.
- Use Node's built-in `fetch` and global `WebSocket`. Add a dependency only when it meaningfully saves work; the `openai` npm package is allowed.
- Support one streamer and one channel. The streamer signs in with their own Twitch account; that same account reads and sends chat.
- Use `gpt-4o-mini-transcribe` for transcription, `gpt-4o-mini-tts` for speech, and the model specified by `OPENAI_TEXT_MODEL` for text (default `gpt-5.6-luna`).
- Keep server logic in `src/lib/` and HTTP route handlers in `src/app/api/`.

## Product scope

- `/dashboard`: streamer login, microphone start/stop, live summary, raid briefing, and test controls.
- `/overlay`: transparent 1920x1080 OBS browser source. On a raid, show a TV-style "Previously on <channel>..." recap with narration and clips from earlier in the stream.
- Respond to `!catchup` with a short recap of about the last 30 minutes and `!lore <term>` with the origin of a channel inside joke.
- Brief the streamer on the channel that raided them.

## Safety and validation

- Never hardcode secrets or log tokens. Load credentials from environment variables.
- Before calling work done, run `npm run lint` and `npx tsc --noEmit`.
