import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loader } from './helpers.mjs';

const summary = { now: 'Chat is betting on the bridge boss.', moments: [{ t: '2026-10-27T12:00:00Z', title: 'Third attempt', detail: 'One bridge left.', clipId: 'existing-clip' }], jokes: [] };
const prepared = { channel: 'streamer', audioUrl: '/api/recaps/existing.mp3', script: 'Previously on streamer...', segments: [{ text: 'Previously on streamer...', momentIndex: -1 }], moments: summary.moments, clipIds: ['existing-clip'] };

test('standby inspection does not initialize a service and returns a detached snapshot', () => {
  let timers = 0;
  const cold = loader({}, { setInterval() { timers++; throw new Error('Preview initialized a service'); } });
  assert.equal(cold('src/lib/recap.ts').getStandbyRecap(), null);
  assert.equal(timers, 0);
  const service = { standby: structuredClone(prepared), queue: ['waiting-raid'] };
  const warm = loader({}, { __previouslyOnRecaps: service });
  const snapshot = warm('src/lib/recap.ts').getStandbyRecap();
  assert.equal(snapshot.audioUrl, prepared.audioUrl);
  snapshot.moments[0].title = 'Client mutation';
  snapshot.clipIds.push('another');
  assert.equal(service.standby.moments[0].title, 'Third attempt');
  assert.equal(service.standby.clipIds.length, 1);
  assert.deepEqual(service.queue, ['waiting-raid']);
});

test('GET standby returns existing media without loading auth, generating audio, or emitting a raid', async () => {
  const load = loader({
    '@/lib/recap': { getStandbyRecap: () => prepared },
    '@/lib/memory': { getSummary() { throw new Error('Unnecessary memory read'); } },
    '@/lib/twitch/auth': { readAuth() { throw new Error('Unnecessary auth read'); } },
  });
  const response = await load('src/app/api/recaps/standby/route.ts').GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), prepared);
});

test('GET standby builds text cards from current memory with no clips or credentials in the response', async () => {
  const load = loader({
    '@/lib/recap': { getStandbyRecap: () => null },
    '@/lib/memory': { getSummary: async () => summary },
    '@/lib/twitch/auth': { readAuth: async () => ({ login: 'streamer', access_token: 'do-not-return', refresh_token: 'also-private' }) },
  });
  const response = await load('src/app/api/recaps/standby/route.ts').GET();
  const data = await response.json();
  assert.equal(data.audioUrl, '');
  assert.equal(data.channel, 'streamer');
  assert.deepEqual(data.clipIds, [null]);
  assert.match(data.script, /Third attempt/);
  assert.equal('raidId' in data, false);
  assert.equal(JSON.stringify(data).includes('private'), false);
  assert.equal(JSON.stringify(data).includes('do-not-return'), false);
});

test('GET standby handles a fresh unauthenticated stream and read failures', async () => {
  for (const failed of [false, true]) {
    const load = loader({
      '@/lib/recap': { getStandbyRecap: () => null },
      '@/lib/memory': { getSummary: async () => { if (failed) throw new Error('Private filesystem path'); return { now: '', moments: [], jokes: [] }; } },
      '@/lib/twitch/auth': { readAuth: async () => null },
    });
    const response = await load('src/app/api/recaps/standby/route.ts').GET();
    const data = await response.json();
    assert.equal(response.status, failed ? 503 : 200);
    assert.equal(JSON.stringify(data).includes('Private filesystem'), false);
    if (!failed) { assert.ok(data.segments.length); assert.equal(data.audioUrl, ''); }
  }
});

test('connection card distinguishes missing required subscriptions from a healthy socket', () => {
  const { connectionIssue, elapsed } = loader()('src/app/dashboard/status-text.ts');
  const health = { eventSub: { connected: true, subscriptions: ['channel.chat.message', 'channel.raid'] } };
  assert.equal(connectionIssue(health, false), '');
  assert.match(connectionIssue({ eventSub: { ...health.eventSub, subscriptions: ['channel.chat.message', 'unrelated'] } }, false), /Missing raid subscription/);
  assert.match(connectionIssue({ eventSub: { connected: false, subscriptions: [] } }, false), /disconnected/);
  assert.match(connectionIssue(health, true), /Health check unavailable/);
  assert.equal(elapsed(0, 12_000), '12s');
  assert.equal(elapsed(0, 1_980_000, false), '33m');
});

test('preview playback cleanup never acknowledges or advances the server raid queue', () => {
  for (const previewOnly of [true, false]) {
    let effect, refIndex = 0;
    const requests = [];
    const audio = { pause() {}, load() {}, removeAttribute() {} };
    const stage = { querySelector: () => ({}) };
    const timeline = { label() { return this; }, add() { return this; }, seek() {}, revert() {} };
    const load = loader({
      react: {
        useEffect(fn) { effect = fn; },
        useRef() { return { current: refIndex++ === 0 ? audio : stage }; },
        useState(value) { return [value, () => {}]; },
      },
      animejs: { createTimeline: () => timeline, animate: () => ({ cancel() {} }) },
    }, {
      AbortController,
      window: { matchMedia: () => ({ matches: false }) },
      fetch: async (url, init) => { requests.push({ url, init }); return new Response(null, { status: 204 }); },
    });
    load('src/app/overlay/use-overlay-sequence.ts').useOverlaySequence(
      { ...prepared, audioUrl: '', raidId: 'active-id', raider: { name: 'sample', viewers: 42 } },
      { current: new Map() }, () => {}, previewOnly);
    const cleanup = effect();
    cleanup();
    assert.equal(requests.length, previewOnly ? 0 : 1);
    if (!previewOnly) assert.equal(requests[0].url, '/api/recaps/playback');
  }
});
