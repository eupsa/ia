import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';

test('API-only mode requires bearer key on private endpoints', async t => {
  process.env.API_KEY = 'test-secret-value';
  const { app, db } = createApp({ dbPath: ':memory:', fetcher: async () => Response.json({ models: [] }) });
  delete process.env.API_KEY;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/health')).status, 200);
  assert.equal((await fetch(base + '/api/chats')).status, 401);
  assert.equal((await fetch(base + '/api/chats', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await fetch(base + '/api/chats', { headers: { Authorization: 'Bearer test-secret-value' } })).status, 200);
});
