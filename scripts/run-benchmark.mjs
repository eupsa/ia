import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
const base = (process.env.API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const model = process.env.BENCH_MODEL || 'qwen3:0.6b';
const profile = process.env.BENCH_PROFILE || 'short';
const mode = process.env.BENCH_MODE || 'auto';
const repetitions = Number(process.env.BENCH_REPETITIONS || 5);
const headers = { 'Content-Type': 'application/json', ...(process.env.API_KEY ? { Authorization: `Bearer ${process.env.API_KEY}` } : {}) };
const start = await fetch(`${base}/api/benchmarks`, { method: 'POST', headers, body: JSON.stringify({ model, mode, profile, repetitions, concurrency: [1,2,4] }) });
if (!start.ok) throw Error(`Não foi possível iniciar: HTTP ${start.status} ${await start.text()}`);
let job = await start.json();
console.log(`Teste ${job.id} iniciado: ${model}, modo ${mode}${mode === 'manual' ? `, perfil ${profile}` : ''}`);
while (['pending','running'].includes(job.status)) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  const response = await fetch(`${base}/api/benchmarks/${job.id}`, { headers });
  if (!response.ok) throw Error(`Não foi possível consultar: HTTP ${response.status}`);
  job = await response.json();
  console.log(`Estado: ${job.status}; etapa: ${job.current_stage || 'nenhuma'}; cenários concluídos: ${job.results.length}`);
}
const report = { environment: { host_platform: os.platform(), host_arch: os.arch(), host_cpus: os.cpus().length, host_ram_gb: Math.round(os.totalmem()/1024**3), api_base: base, note: 'Medição no host atual; repetir na VM Oracle para dados de produção.' }, benchmark: job };
mkdirSync('reports', { recursive: true });
const path = `reports/${model.replace(':','-')}-${mode}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
writeFileSync(path, JSON.stringify(report, null, 2));
console.log(`Relatório salvo em ${path}`);
if (job.status !== 'done') process.exitCode = 1;
