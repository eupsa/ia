import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';

async function fixture(t, fetcher) {
  const { app, db } = createApp({ dbPath: ':memory:', fetcher });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const chat = await (await post('/chats', {})).json();
  return { base, post, chat };
}
test('current date comes from server, not the model', async t => {
  let modelCalls = 0;
  const { base, post, chat } = await fixture(t, async url => {
    if (url.includes('/api/tags')) return Response.json({ models: [{ name: 'qwen3:0.6b' }] });
    modelCalls++; return new Response('unexpected');
  });
  const response = await post(`/chats/${chat.id}/messages`, { content: 'que dia é hj', model: 'qwen3:0.6b' });
  assert.match(await response.text(), /America\/Bahia/);
  assert.equal(modelCalls, 0);
  assert.equal((await (await fetch(base + '/chats/' + chat.id)).json()).messages.length, 2);
});
test('recent questions search the web and persist source links', async t => {
  const { base, post, chat } = await fixture(t, async url => {
    if (url.includes('/api/tags')) return Response.json({ models: [{ name: 'qwen3:0.6b' }] });
    if (url.includes('/search?')) return Response.json({ results: [{ title: 'Fonte', url: 'https://example.org/noticia', content: 'Informação recente' }] });
    return new Response('{"message":{"content":"Conforme a fonte."},"done":true}\n');
  });
  const response = await post(`/chats/${chat.id}/messages`, { content: 'Quem é o presidente atual?', model: 'qwen3:0.6b' });
  assert.match(await response.text(), /example.org/);
  const saved = await (await fetch(base + '/chats/' + chat.id)).json();
  assert.equal(saved.messages[1].web_sources[0].url, 'https://example.org/noticia');
});
