import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loader } from './helpers.mjs';

test('all three neutral status cards are visible in server HTML before any health request', () => {
  const load = loader({ 'next/link': ({ children, href, className }) => React.createElement('a', { href, className }, children) });
  const { DashboardLive } = load('src/app/dashboard/dashboard-live.tsx');
  const html = renderToStaticMarkup(React.createElement(DashboardLive, { login: 'streamer', initialSummary: { now: 'An existing stream story.', moments: [], jokes: [] }, initialLore: [] }));
  const cards = html.slice(html.indexOf('<section class="status-rail"'), html.indexOf('</section>', html.indexOf('<section class="status-rail"')));
  assert.equal((cards.match(/class="status-card is-off"/g) || []).length, 3);
  assert.equal((cards.match(/<strong>Checking…<\/strong>/g) || []).length, 3);
  assert.doesNotMatch(cards, /opacity:0|visibility:hidden|display:none/);
  assert.match(html, /Saved summary/);
  assert.doesNotMatch(html, /No summary run yet/);
});
