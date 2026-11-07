# Como o diagnóstico de carga funciona

O painel **Teste de carga** executa um plano fixo sobre a mesma API de mensagens usada pelo chat. Você escolhe o modelo instalado e inicia o teste; as dimensões abaixo já estão programadas. O backend salva cada etapa no SQLite, de modo que recarregar a página não perde o progresso.

## Plano de medição

| Ordem | Cenário | Repetições | Concorrência | Saída máxima |
| --- | --- | ---: | ---: | ---: |
| 0 | Aquecimento, fora das métricas | 1 | 1 | Padrão da API |
| 1 | Pergunta curta sobre API REST | 5 | 1 | 128 tokens |
| 2 | Explicação média em três tópicos | 3 | 1 | 384 tokens |
| 3 | Explicação longa sobre arquitetura de API | 2 | 1 | 768 tokens |
| 4 | Entrada com 32 registros e resposta curta | 3 | 1 | 128 tokens |
| 5 | Capacidade com pergunta curta | 5 ondas por nível | 2, 4, até 8 | 128 tokens |

Cada onda dispara as chamadas do nível ao mesmo tempo. A etapa seguinte só começa quando todas terminam. O teste encerra a expansão no primeiro nível em que a taxa de falhas ultrapassa **5%** ou o p95 da latência total supera **2× o p95 da pergunta curta sequencial**. A recomendação é o último nível aprovado. No Compose padrão, `OLLAMA_NUM_PARALLEL=1` e a API mantém uma geração ativa; por isso, é esperado que chamadas concorrentes recebam HTTP 409.

## O que cada número mede

- **TTFT:** tempo entre o envio da mensagem e o primeiro token recebido pela API, em milissegundos.
- **Latência total:** tempo entre o envio da mensagem e a conclusão do stream, em milissegundos.
- **p50/p95:** observações nas posições `ceil(0,50 × n)` e `ceil(0,95 × n)` da lista ordenada. Com poucas amostras, p95 frequentemente é o valor máximo.
- **Respostas/s:** respostas concluídas com sucesso divididas pelo tempo decorrido da etapa.
- **Tokens/s da etapa:** soma dos tokens de saída bem-sucedidos dividida pelo tempo da etapa. Com concorrência, é a vazão observada pelo cliente.
- **Tokens/s do modelo:** `eval_count / eval_duration` informado pelo Ollama, convertido de nanossegundos; o painel mostra a mediana.
- **Entrada/saída:** mediana de `prompt_eval_count` e `eval_count` informados pelo Ollama.
- **Taxa de erro:** chamadas sem conclusão bem-sucedida divididas por todas as tentativas, incluindo HTTP 409.

As durações de respostas com falha ficam nas amostras individuais, mas não entram nos percentis de respostas concluídas. O tempo de criação de cada conversa é registrado separadamente em `chat_setup_ms` no JSON. O benchmark apaga as conversas temporárias ao fim de cada etapa. RAG, ferramentas e internet são desativados; temperatura `0` e semente `42` reduzem a variação do texto gerado.

## Como interpretar

Este é um **diagnóstico rápido**, com amostras suficientes para revelar recusas e regressões grandes. Ele não substitui um ensaio prolongado de produção: pequenas amostras não tornam p95 estatisticamente estável, e a duração depende da máquina, da temperatura da CPU, do modelo e do texto gerado. Compare resultados do mesmo modelo e hardware, repita em horários distintos e deixe margem para tráfego real. Não use os relatórios do Docker Desktop como previsão da VM ARM64.

Para chamadas de outros sistemas, execute o teste na própria VM, baixe o JSON pelo painel e registre modelo, hardware, versão do Ollama e configuração do Compose. Se houver HTTP 409, limite a concorrência do cliente ou coloque uma fila na frente da API.

As métricas seguem a terminologia de [TTFT e vazão da NVIDIA](https://docs.nvidia.com/enterprise-reference-architectures/enterprise-rag-retrieval-scaling-and-sizing-guide/latest/rag-benchmarking-methodology.html) e usam os campos de tempo e contagem da [API de chat do Ollama](https://docs.ollama.com/api/chat).
