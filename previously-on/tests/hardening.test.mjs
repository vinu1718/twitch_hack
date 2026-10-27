import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loader, Clock, Socket, tick } from './helpers.mjs';

const quiet = { info() {}, warn() {}, error() {}, log() {} };
const sample = { now: 'The bridge boss is winning.', moments: [{ t: new Date().toISOString(), title: 'Third try', detail: 'Chat predicts another fall.' }], jokes: [] };
async function tempState(t) {
  const dir = await mkdtemp(join(tmpdir(), 'previously-on-hardening-'));
  await mkdir(join(dir, 'data'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('past expiry refreshes once across EventSub, chat and clip requests, and persists rotation', { timeout: 2000 }, async (t) => {
  const dir = await tempState(t);
  const file = join(dir, 'data/auth.json');
  await writeFile(file, JSON.stringify({ access_token: 'private-old-access', refresh_token: 'private-refresh', expires_at: Date.now() - 1000, user_id: 'me', login: 'me' }));
  const logs = [], calls = [];
  let refreshes = 0;
  let subscribed;
  const subscriptionsReady = new Promise((resolve) => { subscribed = resolve; });
  Socket.instances = [];
  const fetch = async (url, init) => {
    if (String(url).includes('oauth2/token')) {
      refreshes++; await tick();
      assert.equal(init.body.get('refresh_token'), 'private-refresh');
      return Response.json({ access_token: 'private-new-access', refresh_token: 'private-rotated-refresh', expires_in: 3600 });
    }
    assert.equal(init.headers.get('Authorization'), 'Bearer private-new-access');
    calls.push(String(url));
    if (calls.filter((url) => url.includes('/eventsub/subscriptions')).length === 2) subscribed();
    if (String(url).includes('chat/messages')) return Response.json({ data: [{ is_sent: true }] });
    if (String(url).includes('/clips')) return Response.json({ data: [{ id: 'verified' }] });
    return Response.json({ data: [] }, { status: 202 });
  };
  const realTimer = setTimeout;
  const load = loader({}, { fetch, WebSocket: Socket, process: { ...process, cwd: () => dir, env: { TWITCH_CLIENT_ID: 'client', TWITCH_CLIENT_SECRET: 'private-client-secret' } },
    setTimeout(fn, ms) { const timer = realTimer(fn, ms === 2000 ? 0 : ms); if (ms !== 2000) timer.unref(); return timer; },
    console: Object.fromEntries(['info', 'warn', 'error', 'log'].map((name) => [name, (...args) => logs.push(args.join(' '))])),
  });
  const eventsub = load('src/lib/twitch/eventsub.ts');
  const chat = load('src/lib/twitch/chat.ts');
  const clips = load('src/lib/twitch/clips.ts');
  await Promise.all([eventsub.startEventSub(), chat.sendChat('test'), clips.createClip()]);
  Socket.instances[0].welcome('session-new');
  await subscriptionsReady;
  assert.equal(refreshes, 1);
  assert.ok(calls.some((url) => url.includes('/chat/messages')));
  assert.ok(calls.some((url) => url.includes('/clips')));
  assert.equal(calls.filter((url) => url.includes('/eventsub/subscriptions')).length, 2);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(saved.expires_at > Date.now());
  assert.equal(saved.refresh_token, 'private-rotated-refresh');
  assert.ok(!logs.join(' ').includes('private-'), 'credentials never logged');
  // Clear real watchdog timers without scheduling another live retry.
  for (const socket of Socket.instances) { socket.listeners.clear(); }
});

test('401 refresh retries exactly once, including a second 401', async (t) => {
  const dir = await tempState(t);
  const file = join(dir, 'data/auth.json');
  await writeFile(file, JSON.stringify({ access_token: 'old', refresh_token: 'refresh', expires_at: Date.now() + 3600000, user_id: 'me', login: 'me' }));
  let refreshes = 0, requests = 0;
  const load = loader({}, { process: { ...process, cwd: () => dir, env: { TWITCH_CLIENT_ID: 'id', TWITCH_CLIENT_SECRET: 'secret' } }, fetch: async (url) => {
    if (String(url).includes('oauth2/token')) { refreshes++; return Response.json({ access_token: 'new', refresh_token: 'next', expires_in: 3600 }); }
    requests++; return new Response(null, { status: 401 });
  } });
  const result = await load('src/lib/twitch/auth.ts').helix('clips');
  assert.equal(result.status, 401); assert.equal(refreshes, 1); assert.equal(requests, 2);
});

test('abrupt socket closes use backoff and new sessions get both subscriptions', async () => {
  Socket.instances = [];
  const clock = new Clock(), sessions = [];
  const load = loader({ './auth': { readAuth: async () => ({ user_id: 'me' }), getAccessToken: async () => 'token', helix: async (_url, init) => { sessions.push(JSON.parse(init.body).transport.session_id); return Response.json({}, { status: 202 }); } }, '@/lib/commands': { startChatCommands() {} } }, { ...clock.globals(), WebSocket: Socket, console: quiet });
  const api = load('src/lib/twitch/eventsub.ts');
  await api.startEventSub(); Socket.instances[0].welcome('one'); await tick();
  Socket.instances[0].close();
  assert.equal(load('src/lib/health.ts').healthSnapshot(null).eventSub.connected, false);
  await clock.advance(999); assert.equal(Socket.instances.length, 1);
  await clock.advance(1); assert.equal(Socket.instances.length, 2);
  Socket.instances[1].welcome('two'); await tick();
  assert.deepEqual(sessions, ['one', 'one', 'two', 'two']);
  Socket.instances[1].close();
  await clock.advance(1999); assert.equal(Socket.instances.length, 2);
  await clock.advance(1); assert.equal(Socket.instances.length, 3);
  Socket.instances[2].welcome('three'); await tick();
  const health = load('src/lib/health.ts').healthSnapshot(null);
  assert.equal(health.eventSub.connected, true);
  assert.equal(health.eventSub.subscriptions.length, 2);
  assert.equal(health.eventSub.sessionStartedAt, clock.now);
});

test('handoff carries subscriptions, then an actual close resubscribes; silent sockets recover without close event', async () => {
  Socket.instances = [];
  const clock = new Clock();
  let subscriptions = 0;
  const load = loader({ './auth': { readAuth: async () => ({ user_id: 'me' }), getAccessToken: async () => 'token', helix: async () => { subscriptions++; return Response.json({}, { status: 202 }); } }, '@/lib/commands': { startChatCommands() {} } }, { ...clock.globals(), WebSocket: Socket, console: quiet });
  await load('src/lib/twitch/eventsub.ts').startEventSub();
  const old = Socket.instances[0]; old.welcome('one'); await tick();
  old.message('session_reconnect', { session: { reconnect_url: 'wss://reconnect' } });
  const replacement = Socket.instances[1];
  assert.ok(!old.closed);
  replacement.welcome('two'); await tick();
  assert.ok(old.closed); assert.equal(subscriptions, 2);
  replacement.close(); await clock.advance(1000);
  assert.equal(Socket.instances.length, 3);
  Socket.instances[2].welcome('three'); await tick(); assert.equal(subscriptions, 4);
  Socket.instances[2].close = () => {}; // Simulate a TCP blackhole that never raises close.
  await clock.advance(15000); await clock.advance(2000);
  assert.equal(Socket.instances.length, 4);
});

for (const damaged of [false, true]) test(`${damaged ? 'corrupt' : 'missing'} memory and lore recover and remain writable`, async (t) => {
  const dir = await tempState(t);
  if (damaged) {
    await writeFile(join(dir, 'data/memory.json'), '{broken');
    await writeFile(join(dir, 'data/lore.json'), JSON.stringify({ entries: 'wrong shape' }));
  }
  const load = loader({}, { process: { ...process, cwd: () => dir }, console: quiet });
  const memory = load('src/lib/memory.ts'), lore = load('src/lib/lore.ts');
  await memory.startMemory();
  assert.equal((await memory.getSummary()).moments.length, 0);
  assert.equal((await lore.getLore()).length, 0);
  await memory.addTranscript('A real fresh transcript.');
  await lore.mergeJokes([{ term: 'banana', explanation: 'Chat banana bit', firstSeen: new Date().toISOString() }]);
  assert.equal(JSON.parse(await readFile(join(dir, 'data/memory.json'), 'utf8')).transcript.length, 1);
  assert.equal((await lore.getLore()).length, 1);
  const files = await readdir(join(dir, 'data'));
  assert.equal(files.filter((file) => file.includes('.corrupt-')).length, damaged ? 2 : 0);
});

test('cold raids emit text immediately despite hung providers and a second raid waits for completion', async () => {
  const bus = new EventEmitter(), clock = new Clock(), events = [];
  const never = new Promise(() => {});
  const load = loader({ '@/lib/bus': { bus }, '@/lib/memory': { getSummary: async () => sample },
    '@/lib/recap-media': { narrate: () => never, cleanRecapAudio: async () => {} },
    '@/lib/recap-script': { recapScript: () => never },
    '@/lib/twitch/auth': { readAuth: async () => ({ login: 'me' }), helix: () => never },
    '@/lib/twitch/chat': { sendChat: () => never },
  }, { ...clock.globals(), console: quiet });
  const api = load('src/lib/recap.ts'); api.startRecaps(); await tick();
  bus.on('recap', (event) => events.push(event));
  const raid = { fromBroadcasterLogin: 'first', fromBroadcasterUserId: 'one', viewers: 10 };
  bus.emit('raid', raid);
  assert.equal(events.length, 1, 'fallback emitted synchronously, within the 5 second budget');
  assert.equal(events[0].audioUrl, '');
  assert.ok(events[0].script.includes('Third try'));
  assert.ok(events[0].clipIds.every((id) => id === null));
  bus.emit('raid', { ...raid, fromBroadcasterLogin: 'second' });
  assert.equal(events.length, 1);
  api.finishRecap('stale-completion'); assert.equal(events.length, 1);
  api.finishRecap(events[0].raidId);
  assert.equal(events.length, 2); assert.equal(events[1].raider.name, 'second');
  await clock.advance(180000); // Lost completion cannot block the queue forever.
});

test('recording lease changes cadence to 60s and expires after a disconnected tab', async (t) => {
  const dir = await tempState(t), clock = new Clock();
  let interval, summaries = 0;
  const load = loader({ '@/lib/summary': { generateSummary: async () => { summaries++; return sample; } }, '@/lib/twitch/clips': { attachMomentClips: async () => {} } }, {
    ...clock.globals(), process: { ...process, cwd: () => dir }, console: quiet,
    setInterval(fn) { interval = fn; return { unref() {} }; },
  });
  const memory = load('src/lib/memory.ts'), health = load('src/lib/health.ts');
  await memory.startMemory(); await memory.addTranscript('First chunk');
  health.microphoneLease('tab', true);
  await clock.advance(59999); interval(); await tick(); assert.equal(summaries, 0);
  await clock.advance(1); interval(); for (let i = 0; i < 8; i++) await tick(); assert.equal(summaries, 1);
  await memory.addTranscript('Second chunk');
  await clock.advance(60000); interval(); await tick(); assert.equal(summaries, 1, 'expired mic lease restores 120s');
  await clock.advance(60000); interval(); await memory.summarizeNow(); assert.equal(summaries, 2);
  assert.equal(health.healthSnapshot(null).summaryState, 'ok');
});

test('provider rejection still emits last-summary text, and health responses expose no credentials', async () => {
  const bus = new EventEmitter(), events = [], clock = new Clock();
  const load = loader({ '@/lib/bus': { bus }, '@/lib/memory': { getSummary: async () => sample },
    '@/lib/recap-media': { narrate: async () => { throw new Error('provider unavailable'); }, cleanRecapAudio: async () => {} },
    '@/lib/recap-script': { recapScript: async () => { throw new Error('provider unavailable'); } },
    '@/lib/twitch/auth': { readAuth: async () => ({ login: 'me', expires_at: clock.now + 50000, access_token: 'do-not-expose', refresh_token: 'also-private' }), helix: async () => new Response(null, { status: 503 }) },
    '@/lib/twitch/chat': { sendChat: async () => {} },
  }, { ...clock.globals(), console: quiet });
  const api = load('src/lib/recap.ts'); api.startRecaps();
  for (let i = 0; i < 8; i++) await tick();
  bus.on('recap', (event) => events.push(event));
  bus.emit('raid', { fromBroadcasterLogin: 'raider', fromBroadcasterUserId: 'one', viewers: 10 });
  assert.equal(events[0].audioUrl, ''); assert.ok(events[0].script.includes('Third try'));
  const response = await load('src/app/api/health/route.ts').GET();
  const text = await response.text();
  assert.ok(!text.includes('do-not-expose') && !text.includes('also-private'));
  assert.ok(!text.includes('access_token') && !text.includes('refresh_token'));
  assert.equal(JSON.parse(text).tokenExpiresAt, clock.now + 50000);
});
