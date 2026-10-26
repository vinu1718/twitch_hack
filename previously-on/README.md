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
