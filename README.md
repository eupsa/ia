# Local

Chat com IA no seu servidor. Frontend React, API Node.js 24/Express, SQLite e Ollama em Docker. Visual inspirado no LyricShift, com Figtree e paleta preta, branca e cinza. Sem cards ou título de boas-vindas; os ícones usam o fundo de seus componentes.

## Rodar no computador

Instale e inicie Docker Desktop com containers Linux e Docker Compose 2.24.4 ou superior. No diretório deste projeto:

```sh
docker compose up -d --build
```

Abra [localhost:8080](http://localhost:8080). Em **Meus modelos**, clique em **Baixar modelo** para Qwen3 0.6B ou Qwen3 1.7B. Aguarde o download e selecione **Usar modelo**. Nenhum modelo é baixado automaticamente.

- Chat com respostas em streaming, botão para interromper e Markdown.
- Conversas persistidas no servidor; é possível reabrir e excluir pelo histórico.
- Modelos persistidos em volume Docker, inclusive após recriar containers.
- Busca na internet via SearXNG interno, ativada pelo botão **Internet** no chat. Resultados vêm com links de fonte. O buscador usa mecanismos públicos e sua disponibilidade pode variar.
- O download continua ao fechar o painel. Se o backend reiniciar, clique novamente em baixar para o Ollama retomar as camadas existentes.
- Frontend disponível apenas em `127.0.0.1:8080`. API e Ollama não publicam portas no host.

## Documentos e RAG

No campo de mensagem, use o **clipe** para adicionar ou excluir documentos `.txt` e `.md` em UTF-8. Limites: 200.000 caracteres por arquivo e 100 documentos. O botão **Documentos** habilita ou desabilita a consulta à base para a próxima mensagem.

A ingestão divide o texto em trechos de 1.200 caracteres com sobreposição de 200. A recuperação usa SQLite FTS5/BM25 por palavras-chave, sem embeddings ou outro modelo. Os trechos relevantes entram no contexto antes da geração e ficam disponíveis em **trecho(s) consultado(s)** abaixo da resposta, inclusive após reabrir a conversa. Esses trechos indicam o contexto consultado; não garantem que cada afirmação do modelo esteja fundamentada.

Use palavras que apareçam no arquivo. A busca não identifica automaticamente sinônimos sem termos em comum. PDFs, imagens, OCR e busca vetorial não fazem parte desta implementação.

## Tool Calling

O botão **Ferramentas** habilita as ferramentas nativas do Ollama:

| Ferramenta | Função |
| --- | --- |
| `calculator` | Contas com números, parênteses e operadores `+ - * / %`; `%` é resto da divisão. Sem execução de código. |
| `current_time` | Data e hora no fuso America/Bahia. |
| `list_documents` | Lista os arquivos da base local. |
| `search_documents` | Busca novos trechos nos documentos durante a resposta. |
| `web_search` | Pesquisa a internet e devolve links e trechos de páginas. |

O backend recebe as chamadas do modelo, valida a ferramenta, executa e devolve o resultado ao modelo para continuar a resposta. Aceita até três rodadas com ferramentas, quatro chamadas por rodada e uma rodada final de resposta. Com **Documentos** desligado, as ferramentas de documentos também ficam indisponíveis.

Exemplos:

```text
Use a calculadora para calcular (1250 * 12) / 4.
Qual é a data de hoje? Use a ferramenta de data e hora.
Quais documentos tenho na minha base?
Segundo o manual.md, como funciona a instalação?
```

Os modelos pequenos podem errar ou deixar de chamar ferramentas. A aplicação fornece o protocolo e executa as chamadas; a decisão de chamá-las depende do modelo. Teste as duas opções com os seus próprios documentos.

Perguntas sobre fatos recentes acionam uma busca antes da geração, mesmo se o modelo pequeno não escolher a ferramenta. Perguntas simples sobre a data ou a hora são respondidas diretamente com o relógio do servidor em America/Bahia. Quando a busca falha, a resposta deve indicar que o fato recente não foi verificado. O SearXNG é acessível apenas na rede Docker; não precisa de chave de API. A busca envia a consulta aos mecanismos externos selecionados pelo SearXNG.

## Oracle ARM64: 4 CPUs / 12 GB RAM

As imagens usadas são multiplataforma; o Docker escolhe ARM64 na VM. Não é necessário GPU ou emulação. A configuração limita o Ollama a 3,5 CPUs e 8 GB de RAM, com um modelo carregado, uma geração por vez, contexto de 4.096 tokens e até 1.024 tokens por rodada. Backend, frontend, buscador, proxy e sistema operacional usam a memória restante. Os limites de CPU são tetos de uso, não reservas exclusivas.

Comece com 0.6B para avaliar a latência; 1.7B costuma exigir mais processamento. A velocidade real depende da CPU e do tamanho do contexto, e precisa ser medida na VM. O serviço não oferece fila de atendimento multiusuário: uma segunda geração recebe uma mensagem para aguardar.

### Acesso privado sem domínio

Na VM com Docker Engine e Compose instalados, copie o projeto e execute o mesmo comando de localhost. No seu computador, faça um túnel SSH:

```sh
ssh -L 8080:127.0.0.1:8080 ubuntu@IP_PUBLICO_DA_VM
```

Abra `http://localhost:8080` no computador. Esse modo não exige abrir a porta 8080 no firewall.

### Publicar com domínio, HTTPS e senha

1. Aponte o registro DNS A de um domínio para o IP público da VM. Se houver AAAA, ele também deve apontar corretamente. Libere TCP 80 e 443 nas regras de entrada da Oracle VCN e no firewall do sistema. Mantenha SSH restrito aos seus IPs administrativos.
2. Copie `.env.example` para `.env` e configure `DOMAIN` e `AUTH_USER`.
3. Gere o hash da senha de forma interativa:

   ```sh
   docker run --rm -it caddy:2.10-alpine caddy hash-password
   ```

4. Cole o hash em `AUTH_PASSWORD_HASH` no `.env`, preservando as aspas simples para não interpolar `$`. Não versione o arquivo `.env`.
5. Suba o ambiente:

   ```sh
   docker compose -f compose.yaml -f compose.prod.yaml up -d --build
   ```

O Caddy emite o certificado automaticamente e exige usuário e senha para a interface inteira, incluindo API e downloads. O override remove a porta 8080; somente o Caddy publica 80/443. O primeiro acesso pode levar alguns minutos enquanto o certificado é emitido. O domínio e a VM precisam estar acessíveis pela internet para a emissão funcionar.

Esta é uma instalação pessoal ou para um grupo confiável: todos que usam a mesma senha compartilham histórico, modelos e documentos. Não há contas individuais, isolamento entre usuários ou cobrança. Arquivos e conversas ficam em SQLite sem criptografia própria; proteja o disco e os backups da VM.

## API sem frontend para outros sistemas

Crie `.env` com `DOMAIN=api.seudominio.com` e `API_KEY=` seguido de uma chave longa e aleatória. Para gerar uma chave hexadecimal, use `openssl rand -hex 32` na VM. Aponte o DNS para a VM e libere TCP 80/443. Inicie apenas os serviços necessários:

```sh
docker compose -f compose.yaml -f compose.api.yaml up -d --build ollama search backend gateway
```

Esse comando não inicia o frontend. O Caddy fornece HTTPS, o backend exige `Authorization: Bearer SUA_CHAVE` em todas as rotas da API, exceto `/api/health`, e o Ollama e o SearXNG continuam sem portas públicas. A porta 3000 fica ligada apenas a `127.0.0.1` da VM, para testes locais ou túnel SSH. Não coloque a chave em código frontend ou apps distribuídos ao público; seus serviços devem guardá-la no servidor.

Se este projeto já estiver rodando com frontend na mesma VM, execute `docker compose down` antes do comando acima. Isso remove os containers antigos e preserva os volumes de conversas e modelos.

Exemplo de cliente HTTP (requisições JSON; resposta da mensagem em NDJSON):

```sh
curl -H "Authorization: Bearer $API_KEY" https://api.seudominio.com/api/models
curl -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d '{}' https://api.seudominio.com/api/chats
curl -N -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d '{"model":"qwen3:0.6b","content":"Explique a API em uma frase.","rag":false,"tools":false,"internet":false}' https://api.seudominio.com/api/chats/ID_DA_CONVERSA/messages
```

O cliente lê as linhas JSON do stream: `token` contém texto incremental; `done:true` encerra com `eval_count` (tokens gerados); `error` informa falhas. Cada sistema pode manter o ID da conversa para preservar o histórico. Use `DELETE /api/chats/:id` quando não precisar mais dela. A chave é compartilhada: todos os sistemas autorizados acessam as mesmas conversas. Se precisar de isolamento entre clientes, será necessária autenticação por cliente e autorização por conversa.

## Teste de carga real

No site, abra **Teste de carga**, escolha o perfil de resposta, 3, 5 ou 10 rodadas e inicie. O backend faz uma chamada de aquecimento e depois rodadas sequenciais com 1, 2 e 4 chamadas simultâneas. Com cinco rodadas são 36 chamadas reais ao endpoint de chat. O relatório inclui primeiro token, latência total p50/p95, respostas e tokens por segundo, taxa de erros e amostras individuais. Baixe o JSON para comparar instalações. O teste desativa RAG, ferramentas e internet para medir a geração do modelo sem variação de serviços externos.

Também é possível iniciar e consultar o teste pela API autenticada:

```sh
curl -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d '{"model":"qwen3:0.6b","profile":"short","repetitions":5,"concurrency":[1,2,4]}' https://api.seudominio.com/api/benchmarks
curl -H "Authorization: Bearer $API_KEY" https://api.seudominio.com/api/benchmarks/ID_DO_TESTE
```

O script `node scripts/run-benchmark.mjs` executa o mesmo teste e grava JSON em `reports/`. Por padrão usa `http://127.0.0.1:8080` e `qwen3:0.6b`. Em modo API, configure `API_BASE_URL`, `API_KEY`, `BENCH_MODEL`, `BENCH_PROFILE` e `BENCH_REPETITIONS` no ambiente do processo. Execute o script da máquina cliente se quiser incluir a latência da rede entre ela e a VM.

As métricas são do cliente HTTP no próprio backend, incluindo rede Docker e tempo de leitura do stream. A criação da conversa temporária é medida separadamente como `chat_setup_ms`; `first_token_ms` e `duration_ms` começam no envio da mensagem. `output_tokens` vem de `eval_count`, e `model_tokens_per_second` usa `eval_count / eval_duration` do Ollama. O painel mostra também tokens gerados por segundo no período completo e taxa de erro por nível. As amostras recusadas (HTTP 409) contam como falhas e não entram nos percentis de sucesso. O backend atual só aceita uma geração por vez; as rodadas simultâneas mostram esse limite em vez de ocultá-lo. Com poucas amostras por nível, p95 é exploratório: use dez rodadas ou mais para estimar cauda com maior confiança. O resultado no computador local não representa o desempenho da VM Oracle; execute o mesmo teste nela, em horário sem tráfego, com o modelo e a configuração finais. Os testes novos usam temperatura 0 e semente fixa para reduzir a variação entre respostas.

Os resultados iniciados pelo painel ficam salvos no SQLite e reaparecem em **Resultados salvos** após recarregar a página ou reiniciar o backend. Um teste interrompido pelo reinício é marcado como falha, preservando os níveis já concluídos. Metodologia baseada nas métricas de [TTFT, throughput e concorrência da NVIDIA](https://docs.nvidia.com/enterprise-reference-architectures/enterprise-rag-retrieval-scaling-and-sizing-guide/latest/rag-benchmarking-methodology.html), na prática de [aquecimento e cargas determinísticas da NVIDIA](https://docs.nvidia.com/aicr/latest/user-guide/validation/) e nas [métricas de contagem e duração da API do Ollama](https://docs.ollama.com/api/chat).

Medição local realizada em 7 de novembro de 2026, Qwen3 0.6B, perfil curto, Docker Desktop em Windows x64 (host 16 CPUs/16 GB; Ollama limitado a 3,5 CPUs/8 GB). Aquecimento: 3.262 ms. Com 1 chamada simultânea: 5/5 sucessos, p50 1.759 ms, p95 2.403 ms, 0,55 resposta/s. Com 2: 5/10 sucessos, 5 recusas HTTP 409. Com 4: 5/20 sucessos, 15 recusas HTTP 409. O relatório completo está em `reports/qwen3-0.6b-short-2026-11-07.json`. Esses resultados anteriores usavam temperatura 0,7 e incluíam a criação da conversa na latência; compare entre si, sem misturá-los com relatórios da metodologia atual. Esses valores não são estimativas da VM Oracle.

Os três perfis foram medidos com cinco rodadas por nível. Os números abaixo são latências p50 das respostas bem-sucedidas, em segundos:

| Perfil | 1 simultânea | 2 simultâneas | 4 simultâneas | Sucessos por nível |
| --- | ---: | ---: | ---: | --- |
| Curto | 1,76 | 1,70 | 1,56 | 5/5 · 5/10 · 5/20 |
| Médio | 4,98 | 8,92 | 7,56 | 5/5 · 5/10 · 5/20 |
| Longo | 10,80 | 12,30 | 13,57 | 5/5 · 5/10 · 5/20 |

O primeiro token teve p50 entre 86 e 104 ms após o aquecimento. Os perfis médio e longo geraram centenas de tokens por resposta; a latência total cresce com o tamanho real do texto. Cada perfil tem seu relatório JSON individual em `reports/`, com amostras, percentis e códigos HTTP. A taxa sustentada de respostas completas com uma chamada simultânea foi 0,55/s (curto), 0,16/s (médio) e 0,09/s (longo). Medições feitas em Windows Docker Desktop não substituem o teste na VM ARM64.

Validação da metodologia atual pelo painel web: Qwen3 0.6B, perfil curto, três rodadas, temperatura 0 e semente fixa. A tabela mostrou p50 total de 1.826 ms com 1 chamada (3/3 sucessos), 1.823 ms com 2 (3/6) e 1.835 ms com 4 (3/12). Vazão de saída: 63,53; 64,09; e 62,71 tokens/s, respectivamente. O relatório está em `reports/qwen3-0.6b-short-web-2026-11-07.json`. Três amostras por nível validam o fluxo; use dez rodadas na VM para uma estimativa mais estável.

## Operação e persistência

```sh
docker compose ps
docker compose logs --tail=100 backend ollama
docker compose restart backend
docker compose down
```

Em produção, acrescente `-f compose.yaml -f compose.prod.yaml` a cada comando. `down` mantém os volumes; **`down -v` apaga conversas, documentos e modelos**.

O banco e a base ficam no volume `local-chat_data`; os modelos em `local-chat_models`. Para um backup consistente do SQLite, pare o backend e copie o volume inteiro, incluindo eventuais arquivos WAL/SHM. Exemplo em Bash, a partir deste diretório:

```sh
docker compose stop backend
docker run --rm -v local-chat_data:/source:ro -v "$PWD:/backup" alpine:3.22 tar czf /backup/local-chat-data.tar.gz -C /source .
docker compose start backend
```

Proteja esse arquivo: contém conversas e documentos. Faça também backup do `.env` e, em produção, dos volumes Caddy se quiser preservar a configuração e os certificados.

Se o serviço Ollama estiver desconectado, confira os logs e os recursos disponíveis no Docker Desktop. Reserve memória suficiente no Docker para os limites definidos. O primeiro carregamento de um modelo é mais lento; a geração tem limite de dez minutos por solicitação.

## Desenvolvimento e validação

Para trabalhar sem reconstruir a interface a cada mudança, use Node.js 24 ou superior:

```sh
npm ci
npm test
npm run build
```

O frontend usa Vite. Inicie primeiro os três serviços com `docker compose up -d --build`. Depois execute `npm run dev` na raiz ou em `frontend/`. O Vite abre em `localhost:5173` e envia `/api` para `127.0.0.1:8080`, onde o Nginx encaminha as requisições ao backend Docker. O modo padrão Docker não publica as portas do backend e do Ollama.

Os testes de integração usam respostas simuladas do Ollama para validar streaming, persistência, recuperação de documentos, ciclo de ferramentas, download e falhas. Não medem qualidade do modelo ou desempenho em ARM64.

## Referências

- [Ollama: Docker](https://docs.ollama.com/docker)
- [Ollama: Tool Calling](https://docs.ollama.com/capabilities/tool-calling)
- [Qwen3 0.6B](https://ollama.com/library/qwen3:0.6b) e [Qwen3 1.7B](https://ollama.com/library/qwen3:1.7b)
- [SQLite FTS5](https://sqlite.org/fts5.html)
- [SearXNG Search API](https://docs.searxng.org/dev/search_api.html)
- [Caddy: autenticação](https://caddyserver.com/docs/caddyfile/directives/basic_auth)
