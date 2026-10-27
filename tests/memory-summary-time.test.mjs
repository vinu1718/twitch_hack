import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loader, Clock } from './helpers.mjs';

const summary = { now: 'Third attempt at the bridge.', moments: [], jokes: [] };
const quiet = { info() {}, warn() {}, error() {}, log() {} };
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'previously-on-summary-time-'));
  await mkdir(join(dir, 'data'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const clock = new Clock();
  function fresh(generateSummary = async () => summary) {
    return loader({ '@/lib/summary': { generateSummary }, '@/lib/twitch/clips': { attachMomentClips: async () => {} }, '@/lib/lore': { mergeJokes: async () => {} } }, {
      ...clock.globals(), process: { ...process, cwd: () => dir }, console: quiet,
    });
  }
  return { dir, file: join(dir, 'data/memory.json'), clock, fresh };
}

test('successful summary time is persisted and restored to health after a fresh process', async t => {
  const { file, clock, fresh } = await fixture(t);
  const first = fresh(async () => { await clock.advance(1000); return summary; });
  const memory = first('src/lib/memory.ts');
  await memory.addTranscript('Another bridge attempt.');
  await memory.summarizeNow();
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.lastSummaryAt, clock.now);
  assert.equal(first('src/lib/health.ts').healthSnapshot(null).lastSummaryAt, saved.lastSummaryAt);
  await clock.advance(120000);
  const restarted = fresh();
  assert.equal((await restarted('src/lib/memory.ts').getSummary()).now, summary.now);
  assert.equal(restarted('src/lib/health.ts').healthSnapshot(null).lastSummaryAt, saved.lastSummaryAt);
  assert.equal(restarted('src/lib/health.ts').healthSnapshot(null).summaryState, 'ok');
  assert.equal((await restarted('src/lib/memory.ts').summarizeNow()).updated, false);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).lastSummaryAt, saved.lastSummaryAt);
});

test('legacy or invalid optional timestamps preserve existing memory instead of resetting it', async t => {
  const { dir, file, fresh } = await fixture(t);
  const state = { transcript: [], chat: [], summary, pendingTranscript: [], pendingChat: [], nextId: 1 };
  for (const stamp of [undefined, 'invalid', -1]) {
    await writeFile(file, JSON.stringify({ ...state, lastSummaryAt: stamp }));
    const load = fresh();
    assert.equal((await load('src/lib/memory.ts').getSummary()).now, summary.now);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).lastSummaryAt, null);
    assert.equal(load('src/lib/health.ts').healthSnapshot(null).lastSummaryAt, null);
  }
  assert.deepEqual(await readdir(join(dir, 'data')), ['memory.json']);
});

test('a failed summary never replaces the persisted last successful summary time', async t => {
  const { file, clock, fresh } = await fixture(t);
  const first = fresh();
  await first('src/lib/memory.ts').addTranscript('The first attempt.');
  await first('src/lib/memory.ts').summarizeNow();
  const savedTime = JSON.parse(await readFile(file, 'utf8')).lastSummaryAt;
  await clock.advance(10000);
  const failing = fresh(async () => { throw new Error('Provider failed'); });
  await failing('src/lib/memory.ts').addTranscript('A new attempt.');
  await assert.rejects(failing('src/lib/memory.ts').summarizeNow());
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.lastSummaryAt, savedTime);
  assert.equal(saved.summary.now, summary.now);
});
