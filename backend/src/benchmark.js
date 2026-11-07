import { randomUUID } from 'node:crypto';
import { ndjson } from './server.js';

const prompts = {
  short: 'Em uma frase, explique o que é uma API REST.',
  medium: 'Explique em três tópicos como proteger uma API REST, incluindo autenticação, limites de requisição e registro de erros.',
  long: 'Escreva uma explicação de cerca de 150 palavras sobre como estruturar uma API para sistemas internos. Inclua autenticação, tratamento de erros, logs, testes e limites de concorrência.',
};
const percentile = (values, p) => values.length ? Math.round([...values].sort((a,b) => a-b)[Math.ceil(values.length*p)-1]) : null;
export function createBenchmark({ fetcher = fetch, baseUrl = 'http://127.0.0.1:3000', apiKey = '', installed, db }) {
  const jobs = new Map();
  db.exec('CREATE TABLE IF NOT EXISTS benchmarks(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
  const save = job => { jobs.set(job.id, job); db.prepare('INSERT OR REPLACE INTO benchmarks(id,data) VALUES(?,?)').run(job.id, JSON.stringify(job)); };
  const get = id => jobs.get(id) || JSON.parse(db.prepare('SELECT data FROM benchmarks WHERE id=?').get(id)?.data || 'null');
  const list = () => db.prepare('SELECT data FROM benchmarks ORDER BY rowid DESC LIMIT 20').all().map(row => { const job=JSON.parse(row.data); return { id: job.id, status: job.status, model: job.model, profile: job.profile, started: job.started, finished: job.finished }; });
  for (const row of db.prepare('SELECT id,data FROM benchmarks').all()) { const job=JSON.parse(row.data); if (['running','pending'].includes(job.status)) { job.status='error'; job.error='Teste interrompido pelo reinício do backend.'; save(job); } }
  async function request(model, prompt) {
    const setupStarted = performance.now(); let started = setupStarted, chatId;
    const headers = { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };
    try {
      const chatResponse = await fetcher(`${baseUrl}/api/chats`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(180000) });
      if (!chatResponse.ok) throw Error(`Falha ao criar conversa: HTTP ${chatResponse.status}`);
      chatId = (await chatResponse.json()).id;
      const chat_setup_ms = Math.round(performance.now() - setupStarted);
      started = performance.now();
      const response = await fetcher(`${baseUrl}/api/chats/${chatId}/messages`, { method: 'POST', headers, body: JSON.stringify({ content: prompt, model, rag: false, tools: false, internet: false, benchmark: true }), signal: AbortSignal.timeout(180000) });
      let firstToken = null, outputTokens = null, evalDuration = null, promptTokens = null, done = false, error = '';
      if (response.ok) {
        for await (const item of ndjson(response.body)) {
          if (item.token && firstToken === null) firstToken = Math.round(performance.now() - started);
          if (item.done) { done = true; outputTokens = item.eval_count ?? null; evalDuration = item.eval_duration ?? null; promptTokens = item.prompt_eval_count ?? null; }
          if (item.error) error = item.error;
        }
      } else error = (await response.json().catch(() => ({}))).error || `HTTP ${response.status}`;
      const duration = Math.round(performance.now() - started);
      return { chatId, ok: response.ok && done, status: response.status, chat_setup_ms, duration_ms: duration, first_token_ms: firstToken, prompt_tokens: promptTokens, output_tokens: outputTokens, model_tokens_per_second: evalDuration > 0 && outputTokens != null ? Math.round(outputTokens * 1e11 / evalDuration) / 100 : null, error: error || null };
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
    job.status = 'running'; job.started = new Date().toISOString(); save(job);
    try {
      // Warm-up is excluded from measured samples, so cold model loading is reported separately.
      job.warmup = await request(job.model, prompts.short);
      await cleanup([job.warmup]);
      save(job);
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
        job.results.push({ concurrency, attempts: batch.length, successes: successful.length, failures: batch.length-successful.length, error_rate_pct: Math.round((batch.length-successful.length)/batch.length*100), elapsed_s: Math.round(elapsed*100)/100, requests_per_second: Math.round(successful.length/elapsed*100)/100, output_tokens_per_second: Math.round(successful.reduce((sum,x) => sum + (x.output_tokens || 0),0)/elapsed*100)/100, model_tokens_per_second_p50: percentile(successful.map(x=>x.model_tokens_per_second).filter(x=>x!==null),.5), latency_ms: { p50: percentile(durations,.5), p95: percentile(durations,.95), max: durations.length ? Math.max(...durations) : null }, first_token_ms: { p50: percentile(firstTokens,.5), p95: percentile(firstTokens,.95) }, samples: batch });
        save(job);
      }
      job.status = 'done'; job.finished = new Date().toISOString(); save(job);
    } catch (error) { job.status = 'error'; job.error = error.message; save(job); }
  }
  function start({ model, profile = 'short', repetitions = 5, concurrency = [1,2,4] }) {
    if (!installed(model)) throw Error('Baixe o modelo antes do teste.');
    if (!Object.hasOwn(prompts, profile) || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10 || !Array.isArray(concurrency) || !concurrency.length || concurrency.length > 4 || concurrency.some(n => ![1,2,4,8].includes(n))) throw Error('Configuração de teste inválida.');
    if ([...jobs.values()].some(j => j.status === 'running' || j.status === 'pending')) throw Error('Já existe um teste em andamento.');
    const job = { id: randomUUID(), status: 'pending', model, profile, repetitions, concurrency, prompt: prompts[profile], results: [] };
    save(job);
    run(job);
    return job;
  }
  return { get, list, start };
}
