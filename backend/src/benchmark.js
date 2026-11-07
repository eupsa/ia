import { randomUUID } from 'node:crypto';
import { ndjson } from './server.js';

const prompts = {
  short: 'Em uma frase, explique o que é uma API REST.',
  medium: 'Explique em três tópicos como proteger uma API REST, incluindo autenticação, limites de requisição e registro de erros.',
  long: 'Escreva uma explicação de cerca de 150 palavras sobre como estruturar uma API para sistemas internos. Inclua autenticação, tratamento de erros, logs, testes e limites de concorrência.',
};
const percentile = (values, p) => values.length ? Math.round([...values].sort((a,b) => a-b)[Math.ceil(values.length*p)-1]) : null;
export function createBenchmark({ fetcher = fetch, baseUrl = 'http://127.0.0.1:3000', apiKey = '', installed }) {
  const jobs = new Map();
  const get = id => jobs.get(id);
  async function request(model, prompt) {
    const started = performance.now(); let chatId;
    const headers = { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };
    try {
      const chatResponse = await fetcher(`${baseUrl}/api/chats`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(180000) });
      if (!chatResponse.ok) throw Error(`Falha ao criar conversa: HTTP ${chatResponse.status}`);
      chatId = (await chatResponse.json()).id;
      const response = await fetcher(`${baseUrl}/api/chats/${chatId}/messages`, { method: 'POST', headers, body: JSON.stringify({ content: prompt, model, rag: false, tools: false, internet: false }), signal: AbortSignal.timeout(180000) });
      let firstToken = null, outputTokens = null, done = false, error = '';
      if (response.ok) {
        for await (const item of ndjson(response.body)) {
          if (item.token && firstToken === null) firstToken = Math.round(performance.now() - started);
          if (item.done) { done = true; outputTokens = item.eval_count ?? null; }
          if (item.error) error = item.error;
        }
      } else error = (await response.json().catch(() => ({}))).error || `HTTP ${response.status}`;
      const duration = Math.round(performance.now() - started);
      return { chatId, ok: response.ok && done, status: response.status, duration_ms: duration, first_token_ms: firstToken, output_tokens: outputTokens, error: error || null };
    } catch (error) { return { chatId, ok: false, status: null, duration_ms: Math.round(performance.now() - started), first_token_ms: null, output_tokens: null, error: error.message }; }
  }
  async function cleanup(samples) {
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    for (const sample of samples) {
      if (!sample.chatId) continue;
      await fetcher(`${baseUrl}/api/chats/${sample.chatId}`, { method: 'DELETE', headers }).catch(() => {});
      delete sample.chatId;
    }
  }
  async function run(job) {
    job.status = 'running'; job.started = new Date().toISOString();
    try {
      // Warm-up is excluded from measured samples, so cold model loading is reported separately.
      job.warmup = await request(job.model, prompts.short);
      await cleanup([job.warmup]);
      if (!job.warmup.ok) throw Error(`Aquecimento falhou: ${job.warmup.error || job.warmup.status}`);
      for (const concurrency of job.concurrency) {
        const started = performance.now();
        const batch = [];
        for (let wave = 0; wave < job.repetitions; wave++) batch.push(...await Promise.all(Array.from({ length: concurrency }, () => request(job.model, prompts[job.profile]))));
        const successful = batch.filter(x => x.ok);
        const durations = successful.map(x => x.duration_ms);
        const firstTokens = successful.map(x => x.first_token_ms).filter(x => x !== null);
        const elapsed = (performance.now() - started) / 1000;
        await cleanup(batch);
        job.results.push({ concurrency, attempts: batch.length, successes: successful.length, failures: batch.length-successful.length, elapsed_s: Math.round(elapsed*100)/100, requests_per_second: Math.round(successful.length/elapsed*100)/100, latency_ms: { p50: percentile(durations,.5), p95: percentile(durations,.95), max: durations.length ? Math.max(...durations) : null }, first_token_ms: { p50: percentile(firstTokens,.5), p95: percentile(firstTokens,.95) }, samples: batch });
      }
      job.status = 'done'; job.finished = new Date().toISOString();
    } catch (error) { job.status = 'error'; job.error = error.message; }
  }
  function start({ model, profile = 'short', repetitions = 5, concurrency = [1,2,4] }) {
    if (!installed(model)) throw Error('Baixe o modelo antes do teste.');
    if (!Object.hasOwn(prompts, profile) || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10 || !Array.isArray(concurrency) || !concurrency.length || concurrency.length > 4 || concurrency.some(n => ![1,2,4,8].includes(n))) throw Error('Configuração de teste inválida.');
    if ([...jobs.values()].some(j => j.status === 'running' || j.status === 'pending')) throw Error('Já existe um teste em andamento.');
    const job = { id: randomUUID(), status: 'pending', model, profile, repetitions, concurrency, prompt: prompts[profile], results: [] };
    jobs.set(job.id, job);
    run(job);
    return job;
  }
  return { get, start };
}
