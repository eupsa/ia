import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createBenchmark } from '../src/benchmark.js';

test('automatic diagnosis runs all scenarios and stops at failed concurrency', async () => {
  const db = new DatabaseSync(':memory:');
  let nextId = 0;
  let busy = false;
  let deleted = 0;
  const fetcher = async (url, options) => {
    if (url.endsWith('/api/chats') && options.method === 'POST') return Response.json({ id: String(++nextId) });
    if (options.method === 'DELETE') { deleted++; return new Response(null, { status: 204 }); }
    if (url.endsWith('/messages')) {
      if (busy) return Response.json({ error: 'busy' }, { status: 409 });
      busy = true;
      await new Promise(resolve => setTimeout(resolve, 5));
      busy = false;
      return new Response('{"token":"ok"}\n{"done":true,"eval_count":2,"eval_duration":100000000,"prompt_eval_count":20}\n');
    }
    throw Error(`Unexpected request: ${url}`);
  };
  try {
    const benchmark = createBenchmark({ db, fetcher, installed: model => model === 'qwen3:0.6b' });
    const started = benchmark.start({ model: 'qwen3:0.6b' });
    let job;
    for (let i = 0; i < 200; i++) {
      job = benchmark.get(started.id);
      if (job.status === 'done' || job.status === 'error') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(job.status, 'done', job.error);
    assert.deepEqual(job.results.map(row => row.scenario), ['short', 'medium', 'long', 'context', 'capacity']);
    assert.deepEqual(job.results.map(row => row.attempts), [5, 3, 2, 3, 10]);
    assert.equal(job.results.at(-1).failures, 5);
    assert.equal(job.stable_concurrency, 1);
    assert.match(job.recommendation, /fila/);
    assert.equal(deleted, nextId);
    assert.equal(benchmark.list()[0].profile, 'auto');
  } finally { db.close(); }
});
