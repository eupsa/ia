# Referência da API

A API Node.js expõe rotas sob `/api`. No Compose local, acesse pelo frontend em `http://127.0.0.1:8080/api`. No perfil sem frontend, use o domínio HTTPS configurado no Caddy. Quando `API_KEY` está definida, envie `Authorization: Bearer <chave>` em todas as rotas, exceto `/api/health`. A chave é **compartilhada**: não há contas nem isolamento de conversas por cliente.

## Fluxo mínimo

```bash
export BASE_URL=https://api.seudominio.com
export API_KEY=sua_chave

curl -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/models"
curl -X POST -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/chats"
```

O segundo comando retorna um `id`. Use esse identificador no caminho seguinte:

```bash
curl -N -X POST "$BASE_URL/api/chats/ID_DA_CONVERSA/messages" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen3:0.6b","content":"Explique uma API em uma frase.","rag":false,"tools":false,"internet":false}'
```

`-N` faz o `curl` exibir o fluxo sem buffering. O retorno é **NDJSON**, uma linha JSON por evento, e não um único objeto JSON. Um cliente deve ler cada linha até receber `done:true` ou `error`:

```jsonl
{"sources":[]}
{"web_sources":[]}
{"token":"Uma API..."}
{"done":true,"eval_count":42,"eval_duration":800000000,"prompt_eval_count":190,"prompt_eval_duration":100000000}
```

Os campos de contagem e duração vêm do Ollama e podem ser `null`. Eventos `tool`, `notice`, `sources` e `web_sources` podem aparecer durante a geração. O texto final é a concatenação dos valores `token`; o histórico fica disponível em `GET /api/chats/:id`.

## Rotas

| Método e caminho | Finalidade | Entrada / observação |
| --- | --- | --- |
| `GET /api/health` | Saúde da API e do Ollama | Público; retorna `status`, `ollama`, `busy` |
| `GET /api/models` | Lista modelos permitidos, instalação e download | Qwen3 0.6B e 1.7B |
| `POST /api/models/pull` | Inicia download assíncrono | `{"model":"qwen3:0.6b"}`; acompanhe em `GET /api/models` |
| `GET /api/chats` | Lista conversas | Mais recentes primeiro |
| `POST /api/chats` | Cria conversa | Corpo opcional `{}`; retorna `id` |
| `GET /api/chats/:id` | Conversa e mensagens | Inclui fontes documentais e links web |
| `DELETE /api/chats/:id` | Apaga conversa | HTTP 204 |
| `POST /api/chats/:id/messages` | Gera resposta em streaming | Corpo descrito abaixo |
| `GET /api/documents` | Lista documentos | Metadados, sem texto integral |
| `POST /api/documents` | Adiciona documento | `{"name":"manual.md","text":"conteúdo"}` |
| `DELETE /api/documents/:id` | Apaga documento | HTTP 204 |
| `POST /api/benchmarks` | Inicia diagnóstico | `{"model":"qwen3:0.6b","mode":"auto"}` |
| `GET /api/benchmarks` | Últimos 20 diagnósticos | Resumos |
| `GET /api/benchmarks/:id` | Estado e métricas | Relatório completo |

### Parâmetros da mensagem

| Campo | Tipo | Comportamento |
| --- | --- | --- |
| `model` | string, obrigatório | `qwen3:0.6b` ou `qwen3:1.7b`, já instalado |
| `content` | string, obrigatório | 1 a 8.000 caracteres |
| `rag` | boolean | `false` desliga a recuperação de documentos; omitido liga |
| `tools` | boolean | `false` desliga as ferramentas; omitido liga |
| `internet` | boolean | `false` desliga a busca web; omitido liga |

Os campos internos `benchmark` e `benchmark_max_tokens` são usados pelo diagnóstico; clientes comuns não precisam enviá-los. O modelo tem contexto máximo configurado em 4.096 tokens e o servidor guarda até 20 mensagens recentes, respeitando um orçamento de caracteres. Não há controle de `system prompt` ou de múltiplos usuários pela API atual.

### Documentos

Aceita `.txt` e `.md` UTF-8, nome de até 160 caracteres, texto de até 200.000 caracteres e no máximo 100 arquivos. A busca usa FTS5/BM25 e retorna até três trechos por consulta. Não processa PDF, imagem ou OCR.

### Diagnóstico

`POST /api/benchmarks` retorna HTTP 202 e um `id` imediatamente. Consulte `GET /api/benchmarks/:id` até `status` ser `done` ou `error`. O teste usa chamadas reais ao endpoint de mensagens, salva etapas no SQLite e continua se o cliente desconectar. [Cenários e interpretação das métricas](benchmark.md).

Em um diagnóstico automático concluído, `verdict` contém `status` (`viable`, `limited` ou `inconclusive`), `headline`, `summary`, `concurrent_requests`, `request_rates` e `queue`. Cada item de `request_rates` traz `p95_ms`, `measured_rpm` e `planning_rpm`. `queue.implemented` é `false`: `recommended_pending`, `estimated_max_wait_s` e `client_timeout_s` são recomendações de planejamento, não uma fila ativa. Os relatórios anteriores são enriquecidos com esse parecer quando o backend é iniciado.

## Respostas de erro

Erros antes do início do stream retornam JSON `{"error":"mensagem"}`. Depois do início, um erro aparece como uma linha NDJSON `{"error":"mensagem"}`. Trate ambos.

| HTTP | Significado frequente |
| --- | --- |
| 400 | Modelo não permitido ou não instalado; entrada inválida |
| 401 | Chave Bearer ausente ou incorreta |
| 403 | Escrita de navegador com origem cross-site |
| 404 | Conversa ou diagnóstico inexistente |
| 409 | Outra geração, download ou teste ocupa a capacidade atual |
| 502/503 | Falha no Ollama ou serviço indisponível |

O backend aceita **uma geração por vez**. Integrações com múltiplos sistemas devem tratar HTTP 409 com fila, limite de concorrência ou retentativa com espera. Não faça retentativas imediatas em massa.
