import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loader, Clock } from './helpers.mjs';

const summary = { now: 'The bridge boss is winning.', moments: [], jokes: [] };
function eventWhere(bus, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { bus.off(name, receive); reject(new Error(`Missing ${name}`)); }, 2000);
    function receive(event) { if (!predicate(event)) return; clearTimeout(timer); bus.off(name, receive); resolve(event); }
    bus.on(name, receive);
  });
}

test('main and welcome both request the same soft shimmer voice', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'previously-on-narrator-'));
  await mkdir(join(dir, 'data'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const calls = [];
  const load = loader({ '@/lib/openai': { openai: () => ({ audio: { speech: { create: async (params) => { calls.push(params); return { arrayBuffer: async () => new Uint8Array([73,68,51]).buffer }; } } } }) } }, { process: { ...process, cwd: () => dir } });
  const media = load('src/lib/recap-media.ts');
  await media.narrate('Previously on the channel.');
  await media.narrate('And to the raiders, welcome in!', true);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.model, 'gpt-4o-mini-tts');
    assert.equal(call.voice, 'shimmer');
    assert.match(call.instructions, /soft, light, feminine/i);
    assert.match(call.instructions, /No deep/i);
  }
  assert.equal((await readdir(join(dir, 'data/recaps'))).filter(name => media.mediaId.test(name)).length, 2);
});

test('dev reload refreshes welcome methods without losing queued raids or adding listeners', async () => {
  const bus = new EventEmitter(), shared = {}, clock = new Clock(), calls = [];
  const globals = { ...clock.globals(), globalThis: shared };
  const mocks = version => ({
    '@/lib/bus': { bus },
    '@/lib/memory': { getSummary: async () => summary },
    '@/lib/recap-media': { narrate: async (text, welcome) => { calls.push({ version, text, welcome }); }, cleanRecapAudio: async () => {} },
    '@/lib/recap-script': { recapScript: async () => ({ script: 'Previously on me...', segments: [{ text: 'Previously on me...', momentIndex: -1 }] }) },
    '@/lib/twitch/auth': { readAuth: async () => ({ login: 'me' }), helix: async () => Response.json({ data: [] }) },
    '@/lib/twitch/chat': { sendChat: async () => {} },
  });
  const before = loader(mocks('old'), globals)('src/lib/recap.ts');
  const ready = eventWhere(bus, 'recap-status', state => state.state === 'ready');
  before.startRecaps(); await ready;
  const originalService = shared.__previouslyOnRecaps;
  const main = [];
  bus.on('recap', event => main.push(event));
  let welcome = eventWhere(bus, 'recap-welcome');
  bus.emit('raid', { fromBroadcasterLogin: 'first', fromBroadcasterUserId: '1', viewers: 42 });
  await welcome;
  bus.emit('raid', { fromBroadcasterLogin: 'second', fromBroadcasterUserId: '2', viewers: 10 });
  assert.equal(main.length, 1);
  const after = loader(mocks('new'), globals)('src/lib/recap.ts');
  assert.equal(after.getRecapStatus().state, 'ready');
  assert.equal(shared.__previouslyOnRecaps, originalService);
  assert.equal(bus.listenerCount('raid'), 1);
  assert.equal(bus.listenerCount('summary'), 1);
  welcome = eventWhere(bus, 'recap-welcome', event => event.raider.name === 'second');
  after.finishRecap(main[0].raidId);
  await welcome;
  assert.equal(main.length, 2);
  assert.equal(main[1].raider.name, 'second');
  assert.equal(calls.filter(call => call.version === 'new' && call.welcome).length, 1);
  assert.equal(calls.filter(call => call.version === 'old' && call.welcome).length, 1);
  after.finishRecap(main[1].raidId);
});

test('welcome playback keeps the gentle delivery instead of forcing a two-second slot', () => {
  const { narrationPlaybackRate } = loader({ react: {}, animejs: {} })('src/app/overlay/use-overlay-sequence.ts');
  assert.equal(narrationPlaybackRate(4, false), 1);
  assert.ok(narrationPlaybackRate(4.704, false) <= 1.15);
  assert.equal(narrationPlaybackRate(12, false), 1.15);
  assert.equal(narrationPlaybackRate(28, true), 2);
  assert.equal(narrationPlaybackRate(NaN, false), 1);
});
