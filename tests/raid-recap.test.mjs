import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { loader } from './helpers.mjs';

const require = createRequire(import.meta.url);
function load(file, mocks, globals = {}) {
  const source = readFileSync(resolve(file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  const context = vm.createContext({ module: loadedModule, exports: loadedModule.exports, require: (id) => id in mocks ? mocks[id] : require(id),
    console, process, Buffer, Response, Request, Headers, AbortSignal, structuredClone, setTimeout, clearTimeout,
    setInterval: () => ({ unref() {} }), ...globals });
  new vm.Script(code, { filename: file }).runInContext(context);
  return loadedModule.exports;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const summary = { now: 'Third bridge attempt', moments: [{ t: new Date().toISOString(), title: 'Bridge boss', detail: 'Third attempt' }], jokes: [] };

test('clip verification, shared cooldown, and code-owned IDs', async () => {
  let posts = 0, polls = 0;
  const clips = load('src/lib/twitch/clips.ts', {
    '@/lib/bus': { bus: new EventEmitter() },
    './auth': { readAuth: async () => ({ user_id: 'me' }), helix: async (_url, init) => {
      if (init?.method === 'POST') { posts++; return Response.json({ data: [{ id: 'verified-clip' }] }); }
      polls++;
      return Response.json({ data: polls < 2 ? [] : [{ id: 'verified-clip' }] });
    } },
  }, { setTimeout: (callback) => { queueMicrotask(callback); return 0; } });
  const next = structuredClone(summary);
  next.moments[0].clipId = 'invented';
  await clips.attachMomentClips({ moments: [] }, next);
  assert.equal(next.moments[0].clipId, 'verified-clip');
  assert.equal(polls, 2);
  assert.equal(await clips.createClip(), undefined);
  assert.equal(posts, 1);
  const same = structuredClone(next);
  same.moments[0].clipId = 'hallucination';
  await clips.attachMomentClips(next, same);
  assert.equal(same.moments[0].clipId, 'verified-clip');
  const changed = structuredClone(next);
  changed.moments[0].title = 'Different moment';
  await clips.attachMomentClips(next, changed);
  assert.equal(changed.moments[0].clipId, undefined);
});

test('offline clip creation is quiet and ten-message spikes trigger capture', async () => {
  const bus = new EventEmitter();
  let posts = 0;
  const clips = load('src/lib/twitch/clips.ts', {
    '@/lib/bus': { bus }, './auth': { readAuth: async () => ({ user_id: 'me' }), helix: async () => { posts++; return new Response(null, { status: 404 }); } },
  });
  clips.startClips();
  for (let i = 0; i < 9; i++) bus.emit('chat', { chatterUserId: 'viewer', broadcasterUserId: 'me', text: 'Pog' });
  await tick(); assert.equal(posts, 0);
  bus.emit('chat', { chatterUserId: 'viewer', broadcasterUserId: 'me', text: 'Pog' });
  await tick(); assert.equal(posts, 1);
  assert.equal(await clips.createClip(), undefined);
});

test('warm raid emits main immediately, welcomes correlate, cleanup retains playing audio', async () => {
  const bus = new EventEmitter();
  const speechCalls = [], sent = [], retained = [];
  let releaseWelcome;
  const welcomePending = new Promise((resolve) => { releaseWelcome = resolve; });
  let memory = structuredClone(summary);
  let scripts = 0;
  const api = load('src/lib/recap.ts', {
    '@/lib/recap-fallback': loader()('src/lib/recap-fallback.ts'),
    '@/lib/bus': { bus },
    '@/lib/memory': { getSummary: async () => memory },
    '@/lib/recap-media': {
      narrate: async (text, welcome, id) => { speechCalls.push({ text, welcome, id }); if (welcome) await welcomePending; return `/api/recaps/${id}`; },
      cleanRecapAudio: async (keep) => { retained.push(keep()); },
    },
    '@/lib/recap-script': { recapScript: async () => { scripts++; return { script: 'Previously on me... Bridge boss.', segments: [{ text: 'Bridge boss.', momentIndex: 0 }] }; } },
    '@/lib/twitch/auth': { readAuth: async () => ({ login: 'me' }), helix: async () => Response.json({ data: [{ game_name: 'Elden Ring', title: 'Boss attempts' }] }) },
    '@/lib/twitch/chat': { sendChat: async (text) => sent.push(text) },
  });
  api.startRecaps();
  for (let i = 0; i < 8; i++) await tick();
  assert.equal(api.getRecapStatus().state, 'ready');
  const main = [], welcome = [], briefings = [];
  bus.on('recap', (event) => main.push(event)); bus.on('recap-welcome', (event) => welcome.push(event)); bus.on('briefing', (event) => briefings.push(event));
  bus.emit('raid', { fromBroadcasterLogin: 'raider', fromBroadcasterUserId: 'them', viewers: 42 });
  assert.equal(main.length, 1, 'warm main emitted without waiting for lookup or welcome TTS');
  assert.equal(scripts, 1);
  await tick();
  assert.equal(welcome.length, 0);
  assert.equal(briefings[0].game, 'Elden Ring');
  assert.equal(sent.length, 1);
  const playing = main[0].audioUrl;
  memory = { ...summary, now: 'A new chapter' };
  bus.emit('summary', memory);
  for (let i = 0; i < 8; i++) await tick();
  assert.equal(scripts, 2);
  assert.ok(retained.at(-1).includes(playing), 'old standby retained during playback');
  bus.emit('summary', memory);
  await tick(); assert.equal(scripts, 2, 'unchanged summary does not rebuild');
  releaseWelcome();
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(welcome[0].raidId, main[0].raidId);
  api.finishRecap(main[0].raidId);
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(retained.at(-1).length, 1, 'only latest standby survives after playback');
  assert.ok(!retained.at(-1).includes(playing));
  bus.emit('raid', { fromBroadcasterLogin: 'next', fromBroadcasterUserId: 'two', viewers: 8 });
  bus.emit('raid', { fromBroadcasterLogin: 'queued', fromBroadcasterUserId: 'three', viewers: 9 });
  assert.equal(main.length, 2, 'second new raid waits while the first plays');
  assert.equal(sent.length, 3, 'queued viewers still get their chat welcome immediately');
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(briefings.length, 3, 'queued raider briefing is independent of playback');
  api.finishRecap(main[1].raidId);
  assert.equal(main.length, 3);
  assert.equal(main[2].raider.name, 'queued');
  api.finishRecap(main[2].raidId);
});

test('audio route supports byte ranges and rejects invalid ranges and missing files', async () => {
  const route = load('src/app/api/recaps/[id]/route.ts', { '@/lib/recap-media': { readRecapAudio: async (id) => id === 'ok' ? Buffer.from('0123456789') : null } });
  const context = { params: Promise.resolve({ id: 'ok' }) };
  const partial = await route.GET(new Request('http://localhost/audio', { headers: { Range: 'bytes=2-5' } }), context);
  assert.equal(partial.status, 206); assert.equal(await partial.text(), '2345');
  assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10');
  const suffix = await route.GET(new Request('http://localhost/audio', { headers: { Range: 'bytes=-3' } }), context);
  assert.equal(await suffix.text(), '789');
  assert.equal((await route.GET(new Request('http://localhost/audio', { headers: { Range: 'bytes=20-' } }), context)).status, 416);
  assert.equal((await route.GET(new Request('http://localhost/audio'), { params: Promise.resolve({ id: '../secret' }) })).status, 404);
});

test('recap script uses structured output and narrates exactly its subtitle segments', async () => {
  let params;
  const api = load('src/lib/recap-script.ts', { '@/lib/openai': { openai: () => ({ responses: { create: async (input) => {
    params = input;
    return { status: 'completed', output_text: JSON.stringify({ script: 'Ignored duplicate script', segments: [
      { text: 'Previously on me...', momentIndex: -1 }, { text: 'Third try at the bridge boss.', momentIndex: 99 },
    ] }) };
  } } }) } }, { process: { env: { OPENAI_TEXT_MODEL: 'configured-model' } } });
  const result = await api.recapScript('me', summary);
  assert.equal(params.text.format.type, 'json_schema');
  assert.equal(params.text.format.strict, true);
  assert.equal(params.model, 'configured-model');
  assert.equal(params.reasoning.effort, 'low');
  assert.equal(result.script, result.segments.map((line) => line.text).join(' '));
  assert.equal(result.segments[1].momentIndex, -1);
  const fresh = await api.recapScript('me', { now: '', moments: [], jokes: [] });
  assert.ok(fresh.script.startsWith('Previously on me...'));
  assert.ok(!fresh.script.includes('boss'));
});

test('simulation resolves a real login then emits the normal raid event', async () => {
  const bus = new EventEmitter();
  const raids = [];
  bus.on('raid', (raid) => raids.push(raid));
  const api = load('src/app/api/raid/route.ts', {
    '@/lib/bus': { bus }, '@/lib/recap': { startRecaps() {} },
    '@/lib/twitch/auth': { readAuth: async () => ({ user_id: 'me' }), helix: async (url) => {
      assert.equal(url, 'users?login=real_channel');
      return Response.json({ data: [{ id: 'actual-id', login: 'real_channel' }] });
    } },
  });
  const invalid = await api.POST(new Request('http://localhost/api/raid', { method: 'POST', body: JSON.stringify({ login: '../not-a-login' }) }));
  assert.equal(invalid.status, 400);
  const result = await api.POST(new Request('http://localhost/api/raid', { method: 'POST', body: JSON.stringify({ login: 'real_channel' }) }));
  assert.equal(result.status, 200);
  assert.equal(raids[0].fromBroadcasterUserId, 'actual-id');
  assert.equal(raids[0].toBroadcasterUserId, 'me');
  assert.equal(raids[0].viewers, 42);
});

test('moment time server rendering never invokes local time formatting', () => {
  const source = readFileSync('src/app/dashboard/client-time.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  const context = vm.createContext({ exports: loaded.exports, module: loaded, require, Date: class { toLocaleTimeString() { throw new Error('server locale formatting'); } } });
  new vm.Script(code).runInContext(context);
  const { renderToString } = require('react-dom/server');
  const { createElement } = require('react');
  const html = renderToString(createElement(loaded.exports.ClientTime, { value: '2026-10-27T01:23:45Z' }));
  assert.match(html, /<time[^>]*><\/time>/);
});
