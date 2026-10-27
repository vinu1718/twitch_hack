# Previously On

A live Twitch stream memory with microphone transcription, chat commands, channel lore, and a narrated raid recap for OBS.

## Daily development

Use Node.js 22+. From this directory:

```bash
npm ci
cp -n .env.example .env
npm run dev
```

`npm run dev` starts Next.js on port 3001. Set `APP_PORT=3001` and `TWITCH_REDIRECT_URI=http://localhost:3001/api/auth/callback` in your local `.env` so Docker Compose and Twitch login use the same port. Open the [dashboard](http://localhost:3001/dashboard) or [OBS overlay](http://localhost:3001/overlay). The overlay is intended for a 1920x1080 OBS browser source with a transparent background.

## Final run with Docker Compose

Docker Compose builds and runs the long-lived production Node server:

```bash
docker compose up --build -d
```

The host port comes from `APP_PORT` in `.env`; `.env.example` defaults to 3000. Stop the service with `docker compose down`. The `data/` folder is bind mounted so runtime state survives container recreation. Narration is written to `data/recaps/` and served through `/api/recaps/[id]`, including in the production Docker image.

## Build the live stream memory

Set `OPENAI_API_KEY` and `OPENAI_TEXT_MODEL` in your ignored `.env`, then sign in to Twitch on `/dashboard`. Click **Start** to record the microphone in fresh 30 second files. Each completed file is transcribed and saved in `data/memory.json`; chat messages are saved there too. With new input, the summary updates every minute during recording or every two minutes otherwise; **Summarize now** runs it immediately. The dashboard receives updates from `/api/stream`. Click **Stop** to upload the final partial recording.

The browser must allow microphone access. `localhost` supports this during development; use HTTPS if you serve the dashboard from another host. Summaries run every 60 seconds while the microphone is recording and every 120 seconds otherwise, when new input exists. Recording tabs renew a lease every 20 seconds; a closed or disconnected tab stops the faster cadence after 75 seconds.

## Chat commands and channel lore

Viewers can type `!catchup` for a short recap of the last 30 minutes or `!lore <term>` for an inside joke. `!lore` on its own lists up to five saved terms. Replies are plain text. Each user has a 20 second cooldown per command, and the bot spaces all replies by at least three seconds. Catch-up answers are shared for 60 seconds so a burst of requests uses one model response.

Jokes from stream summaries are kept in `data/lore.json` across streams. Edit or delete entries in **Saved lore** on `/dashboard`; manual corrections are preserved when new summaries arrive, and deleted terms are not recreated automatically.

## Test EventSub with the Twitch CLI

First, connect your Twitch account from `/dashboard` once so `data/auth.json` exists. The CLI WebSocket mock does not perform OAuth. Stop the running dev server, then use three terminals:

```bash
# Terminal 1: start Twitch's mock WebSocket and subscription endpoint.
twitch event websocket start-server
```

```bash
# Terminal 2: run this app against the mock endpoint.
EVENTSUB_WS_URL=ws://127.0.0.1:8080/ws \
EVENTSUB_SUBSCRIPTIONS_URL=http://127.0.0.1:8080/eventsub/subscriptions \
npm run dev
```

```bash
# Terminal 3: send a simulated incoming raid.
twitch event trigger channel.raid --transport=websocket
```

The app should log an active `channel.raid` subscription, then a `Raid from ...` line. Twitch CLI 1.1.24's mock rejects `channel.chat.message` version 1, so it may also log that subscription as rejected; Twitch's live endpoint supports it. To test `!ping` → `pong`, run against Twitch's real endpoints and type `!ping` in your channel chat.

## Raid recap demo

1. Connect Twitch and capture some microphone audio or viewer chat. Press **Summarize now** and wait for **Standby recap ready**. Every changed summary prepares a new 15 second dramatic recap and AI narrator audio in the background; raids use that prepared audio immediately.
2. Add `http://localhost:3001/overlay` as a 1920×1080 OBS browser source. Enable audio for the source (and monitoring if you want to hear it yourself). OBS browser sources autoplay audio; a regular browser tab needs one click on the overlay page before narration can play. The page is completely transparent between raids.
3. Enter a real channel login in **Simulate raid**. This looks up the account, emits the same `raid` event as Twitch, and simulates 42 incoming viewers. It also sends a real welcome message to your connected channel chat.
4. Watch the title card, narrated recap with subtitles, and raider welcome. The dashboard shows the raider's current channel game/title and a greeting suggestion. Without standby audio, the overlay immediately shows text cards from memory while narration is prepared in the background for a future raid.

Clips are optional: Twitch must be live with clips enabled and `clips:edit` granted. New summary moments and chat spikes share a 90 second capture cooldown. Created clips are verified by polling Twitch before their IDs are saved. A summary clip captures the stream at summary time; Twitch cannot retrospectively clip an arbitrary historical moment. Chat spikes capture near the event. When offline or without clips, animated text cards keep the recap usable. Clip embeds are muted so the AI narrator remains clear. Subtitles and clip switches use proportional segment text length against actual audio playback progress.

Welcome narration is generated in parallel with recap playback and starts at the end card if it arrives within three seconds. Raids are queued in arrival order and start after playback completion; the overlay also queues incoming events. Older MP3s are deleted after standby replacement and playback completion; a three minute watchdog advances the queue if the overlay disconnects. Provider errors leave the previous standby available. Without a standby, text cards from the last summary are emitted immediately, without waiting for OpenAI, auth or disk. Fresh narration is prepared in the background for a later raid.

The **Health** box reports EventSub session age and active subscriptions, last chat/transcript/summary timestamps, recording cadence, and token expiry. Tokens refresh on demand, with one shared refresh for concurrent requests and one retry after a 401. Missing or corrupt memory/lore files start fresh; malformed files are preserved with `.corrupt-<id>` suffixes. Logs exclude credentials and upstream error bodies; development request logs omit OAuth callbacks. See [LIVE_TEST.md](LIVE_TEST.md) for tonight's OBS, second-account raid, and failure checks.

Run `npm test`, `npm run lint`, and `npx tsc --noEmit` for local checks. Restart `npm run dev` after changing the global background services so their singleton listeners use the new code.
