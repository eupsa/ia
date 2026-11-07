import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buildVerdict, createBenchmark } from '../src/benchmark.js';

test('final verdict derives conservative rates and a bounded queue from measured p95', () => {
  const rows = [
    ['short', 'Resposta curta', 2000, 0.5],
    ['medium', 'Resposta média', 7000, 0.14],
    ['long', 'Resposta longa', 12000, 0.08],
    ['context', 'Contexto extenso', 8000, 0.12],
  ].map(([scenario, label, p95, rps]) => ({ scenario, label, concurrency: 1, attempts: 5, successes: 5, failures: 0, requests_per_second: rps, latency_ms: { p95 } }));
  const verdict = buildVerdict({ results: rows, stable_concurrency: 1, warmup: { duration_ms: 3000 } });
  assert.equal(verdict.status, 'viable');
  assert.equal(verdict.concurrent_requests, 1);
  assert.equal(verdict.request_rates[0].planning_rpm, 21);
  assert.equal(verdict.request_rates[2].planning_rpm, 3.4);
  assert.equal(verdict.queue.recommended_pending, 2);
  assert.equal(verdict.queue.estimated_max_wait_s, 24);
  assert.equal(verdict.queue.client_timeout_s, 46);
  assert.equal(verdict.queue.implemented, false);
});

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
    assert.equal(job.verdict.status, 'viable');
    assert.match(job.verdict.summary, /5\/10 falharam/);
    assert.equal(deleted, nextId);
    assert.equal(benchmark.list()[0].profile, 'auto');
  } finally { db.close(); }
});
