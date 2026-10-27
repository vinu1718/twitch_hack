# Previously On live test

## Preflight

- Run `npm test`, `npm run lint`, and `npx tsc --noEmit`.
- Restart `npm run dev` after updating these background services. Use port 3001. For the final Docker run use `docker compose up --build -d`, after stopping the development server on the same port.
- Restore real EventSub URLs in `.env` if you used the Twitch CLI mock:
  - `EVENTSUB_WS_URL=wss://eventsub.wss.twitch.tv/ws`
  - `EVENTSUB_SUBSCRIPTIONS_URL=https://api.twitch.tv/helix/eventsub/subscriptions`
- Log into Previously On with the receiving streamer account. Keep this login; the second account is only for sending the raid.
- In **Health**, confirm EventSub is connected and both `channel.chat.message` and `channel.raid` are listed. Session age should increase. Token expiry can be near or past expiry before an API call: the next API request should refresh it automatically.
- Go live on the receiving channel, enable clips in Twitch settings, and verify the app has `clips:edit`. Clip capture is unavailable offline and shares a 90 second cooldown across all triggers.

## OBS setup

- Add a Browser source above gameplay: URL `http://localhost:3001/overlay`, width 1920, height 1080. Use the actual `APP_PORT` for a Docker run on another port.
- Keep the page transparent. Turn **Shutdown source when not visible** and **Refresh browser when scene becomes active** off so the event listener survives scene changes.
- Enable **Control audio via OBS** where available. Make sure the source is unmuted and routed to the stream track. Use **Monitor and Output** if you also want to hear it, and use headphones to avoid feeding narration back into the microphone.
- Keep the dashboard microphone tab open. Start microphone capture and speak two or three specific events and a recurring joke. After a chunk finishes, watch **Last transcript chunk** advance. Speak more to test the next chunk too.
- The Health cadence should read **60s** during recording and **120s** after Stop. **Last summary run** should advance when new input exists. Wait for **Standby recap ready**, or press **Summarize now**.
- Simulate one raid with a real channel login. Verify title, narration, clips/text cards, subtitles, welcome card, then complete transparency. A regular browser tab needs one click to enable audio; avoid playing the same recap audibly in both that tab and OBS.

## Real raid from a second account

- Use another browser profile or private window for the second Twitch account. Do not reconnect Previously On as that account.
- For a reliable test with game/title context, start a short test broadcast on the second account using another device or OBS instance. Keep the receiving channel live.
- On the receiving channel, allow the small/new-account raid in Twitch's raid settings if your normal restrictions block it.
- In the second account's own channel chat, type `/raid YOUR_RECEIVING_CHANNEL_LOGIN` (no angle brackets). When Twitch offers **Raid Now**, click it. The raid event occurs when the raid actually transfers, not when the countdown is merely started.
- Check: one welcome chat message, one briefing with the correct raider/game/viewers, and a recap that starts promptly. With standby ready there should be no model-generation pause. A cold or failed preparation must still show a title/text cards within five seconds.

Twitch's instructions: [How to use raids](https://help.twitch.tv/s/article/how-to-use-raids?language=en_US&langue=en_US), [when the raid event fires](https://dev.twitch.tv/docs/api/raids/). OBS reference: [Browser source](https://obsproject.com/kb/browser-source).

## What to watch for

- Type `!ping` from both accounts: receive `pong`; repeat after the 20 second user cooldown. `!catchup` should be specific, brief and plain text. Test one known `!lore` term.
- Send a normal chat message and watch **Last chat event** advance. The streamer's own messages still do not enter memory, by design.
- Mark a distinctive spoken moment, note its clock time, and compare the eventual clip with what was happening then. The 60 second summary cadence reduces capture lag; it does not retrospectively seek a historical moment, and the 90 second clip cooldown still applies.
- Simulate two raids at least five seconds apart while the first recap is playing. The first must finish through its welcome and fade; then the second starts. Neither narration nor cards should replace the first. A delayed welcome must not attach to the wrong raider.
- If Twitch disconnects, Health must show disconnected, then a new session age and both subscriptions after reconnecting. Messages during a real disconnect cannot be replayed by Twitch. Automated tests cover socket close, exponential backoff, handoff, and missing-close recovery without interrupting your live network.
- Automated tests force expired auth in an isolated file, share the refresh across EventSub/chat/clips, and check rotated refresh persistence. To repeat against real Twitch, the following optional command changes only local expiry; do not print `auth.json` on stream:

```bash
node --input-type=module <<'JS'
import { readFile, writeFile, rename } from 'node:fs/promises';
const file = 'data/auth.json';
const auth = JSON.parse(await readFile(file, 'utf8'));
auth.expires_at = Date.now() - 1000;
const temporary = `${file}.expiry-test.tmp`;
await writeFile(temporary, JSON.stringify(auth), { mode: 0o600 });
await rename(temporary, file);
JS
```

- After forcing expiry, type `!ping`; Health should show a future token expiry and chat should reply. Keep streaming until the next eligible moment clip, and verify new clips appear and EventSub still receives messages. A genuine revoked authorization requires Twitch login again; refreshing cannot restore revoked scopes.
- The automated failure tests hold OpenAI promises forever or reject them: a cold raid still emits last-summary text synchronously, with no narrator or clips. A later provider completion must never interrupt that playback. Welcome speech is optional and is skipped after its three second end-card wait.
- Missing/corrupt save recovery is tested in temporary directories. Don't damage your real lore file to test this on air. Backups of malformed files have `.corrupt-<id>` suffixes.
- Scan terminal output for generic connection/provider status only. Never display `.env` or `data/auth.json` in OBS; the Health endpoint exposes expiry, never access or refresh tokens.

Record a short OBS sample and play it back to check stream-track audio, subtitle readability over gameplay, and a clean transparent ending. Stop microphone capture after the test.
