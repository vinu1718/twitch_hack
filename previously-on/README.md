# Previously On

Early scaffold for a Twitch stream recap app. The dashboard and OBS overlay are placeholders; Twitch login, microphone capture, recaps, and chat commands are not implemented yet.

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

The host port comes from `APP_PORT` in `.env`; `.env.example` defaults to 3000. Stop the service with `docker compose down`. The `data/` and `public/recaps/` folders are bind mounted so runtime state and recap media survive container recreation.

## Build the live stream memory

Set `OPENAI_API_KEY` and `OPENAI_TEXT_MODEL` in your ignored `.env`, then sign in to Twitch on `/dashboard`. Click **Start** to record the microphone in fresh 30 second files. Each completed file is transcribed and saved in `data/memory.json`; chat messages are saved there too. The summary updates every two minutes when new input exists, or immediately with **Summarize now**. The dashboard receives updates from `/api/stream`. Click **Stop** to upload the final partial recording.

The browser must allow microphone access. `localhost` supports this during development; use HTTPS if you serve the dashboard from another host.

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
