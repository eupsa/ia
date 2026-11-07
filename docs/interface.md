# Guia das telas e controles

O site é uma aplicação de chat em **uma única página**. A área de conversa permanece aberta enquanto **Meus modelos**, **Seus documentos** e **Teste de carga** aparecem em painéis sobre ela. Não há cadastro nem contas individuais: quem tem acesso à instalação compartilha as conversas e os documentos salvos no servidor.

## Primeiro uso

1. Abra `http://localhost:8080` depois de iniciar o Docker Compose. Se a instalação usa domínio, abra o endereço HTTPS configurado.
2. Entre em **Meus modelos**, clique em **Baixar modelo** no Qwen3 0.6B ou 1.7B e acompanhe a barra de progresso.
3. Quando aparecer **Usar modelo**, selecione o modelo. O nome escolhido aparece no alto da conversa.
4. Escreva uma mensagem e pressione **Enter** ou o botão de seta. Para pular uma linha sem enviar, use **Shift+Enter**.

O download pode demorar na primeira vez. O modelo só é baixado quando alguém clica no botão; a escolha do modelo fica lembrada no navegador, enquanto os arquivos do modelo ficam em um volume Docker.

## Tela principal: conversa

| Local | Elemento | O que faz |
| --- | --- | --- |
| Barra superior | Nome do modelo e seta | Abre **Meus modelos** para trocar ou baixar um modelo. |
| Barra superior | **Conectado** / **Sem conexão** | Mostra se a API conseguiu consultar o Ollama. Clique para verificar novamente. |
| Centro | Mensagens **Você** e **Local** | Mostra o histórico da conversa e a resposta à medida que ela chega. Suporta Markdown, listas, links e blocos de código. |
| Abaixo da resposta | **Copiar** | Copia o texto daquela resposta. A indicação muda brevemente para **Copiado**. |
| Abaixo da resposta | **Ferramenta utilizada** | Informa qual ferramenta o modelo chamou, como calculadora ou busca. |
| Abaixo da resposta | **Trechos consultados** | Expande os trechos dos documentos locais usados como referência. |
| Abaixo da resposta | **Fontes da internet** | Mostra links e resumos da pesquisa web; os links abrem em outra aba. |
| Parte inferior | Campo **O que vamos explorar hoje?** | Digite até 8.000 caracteres. **Enter** envia; **Shift+Enter** quebra a linha. |
| Parte inferior | Seta para cima | Envia a mensagem quando há texto, conexão e nenhum download em andamento. |
| Parte inferior | Quadrado **Parar resposta** | Interrompe a geração em andamento. Se já houver texto, uma resposta parcial pode ficar salva na conversa. |

Se você tentar enviar sem ter um modelo instalado, o painel **Meus modelos** abre automaticamente. Um aviso de erro aparece perto do campo de mensagem; o botão **X** fecha esse aviso. O lembrete “A IA pode cometer erros” é especialmente relevante para fatos atuais e documentos importantes.

### Botões ao lado do campo de mensagem

Os botões com destaque estão **ligados**. Eles começam ligados quando a página abre e valem para as próximas mensagens enviadas naquele navegador; não alteram mensagens já salvas.

| Botão | Ligado | Desligado |
| --- | --- | --- |
| Clipe | Abre **Seus documentos** para adicionar ou excluir arquivos. | Não é uma opção liga/desliga. |
| **Documentos** | Procura até três trechos relevantes nos arquivos enviados e permite ferramentas de listagem/busca de documentos. | Não recupera trechos nem oferece essas ferramentas. Os arquivos continuam armazenados. |
| **Ferramentas** | Permite ao modelo chamar calculadora, data/hora e as ferramentas disponíveis de documentos e web. | Não oferece chamadas de ferramenta ao modelo. |
| **Internet** | Permite a pesquisa web. Perguntas sobre fatos recentes podem disparar uma busca antes da geração, mesmo com **Ferramentas** desligado. | Não faz busca web nem oferece a ferramenta de busca ao modelo. |

**Documentos** usa busca por palavras-chave: escrever termos presentes nos arquivos melhora a recuperação. **Internet** ligada não pesquisa toda mensagem; a busca automática depende da pergunta, e o modelo também pode solicitar a ferramenta quando **Ferramentas** estiver ligado. As fontes exibidas ajudam a conferir a resposta, mas não garantem que a interpretação do modelo esteja correta.

## Barra lateral: conversas e acesso aos painéis

| Elemento | O que faz |
| --- | --- |
| **Nova conversa** | Limpa a área central e o texto em preparação. Uma conversa só é criada no servidor quando a primeira mensagem é enviada. |
| **Suas conversas** e número | Lista as conversas salvas; o número é a quantidade atual. Clique em uma para voltar ao histórico. |
| Ícone de lixeira ao lado da conversa | Abre a confirmação de exclusão. **Excluir** remove a conversa e suas mensagens; **Cancelar** mantém tudo. |
| **Teste de carga** | Abre o diagnóstico de desempenho do modelo selecionado. |
| **Meus modelos** | Abre a lista de modelos instaláveis e o progresso de download. |

Em telas pequenas, o botão de menu na barra superior abre a barra lateral. Toque fora dela ou use **Fechar menu** para voltar à conversa.

## Painel “Meus modelos”

O painel apresenta **Qwen3 0.6B** (mais leve) e **Qwen3 1.7B** (maior), com tamanho aproximado de download e descrição. Cada cartão mostra um dos estados:

- **Baixar modelo:** inicia o download no Ollama. A barra indica o progresso; fechar o painel não cancela o download.
- **Usar modelo:** seleciona um modelo já instalado para as próximas mensagens.
- **Selecionado:** indica qual modelo será usado no chat e no teste de carga.
- **Tentar novamente:** aparece se o download falhou; confira espaço em disco e logs do Ollama se o problema persistir.

Se aparecer **Ollama desconectado**, verifique `docker compose ps` e `docker compose logs --tail=100 backend ollama`. O painel não baixa automaticamente o outro modelo.

## Painel “Seus documentos”

Clique no **clipe** para abrir. **Adicionar documentos** aceita um ou vários arquivos `.txt` ou `.md` em UTF-8. O navegador rejeita arquivos acima de 800 KB; a API limita cada texto a 200.000 caracteres e a base a 100 documentos. Após o envio, a lista mostra os nomes. A lixeira abre uma confirmação antes de apagar um documento.

O conteúdo é dividido em trechos e indexado no SQLite com FTS5. Quando **Documentos** está ligado, os trechos relevantes podem aparecer em **Trechos consultados** na resposta. O painel não oferece pré-visualização nem edição dos arquivos. PDF, imagem e OCR ainda não são aceitos.

## Painel “Teste de carga”

Este painel mede o modelo **atualmente selecionado** com chamadas reais à API. O plano já está definido:

1. **Latência:** respostas curta, média e longa, após um aquecimento fora das métricas.
2. **Contexto:** uma entrada mais extensa com resposta curta.
3. **Capacidade:** chamadas simultâneas crescentes até encontrar o primeiro limite.

Clique em **Executar diagnóstico automático** uma vez. O botão fica indisponível sem modelo instalado ou enquanto há um teste em andamento. A execução continua no backend se você fechar o painel; **Resultados salvos** permite reabrir os relatórios. Se o backend reiniciar durante o teste, o relatório passa a indicar interrupção.

Durante a execução, **Etapa atual** mostra o cenário em andamento. No resultado, **Aquecimento** indica a primeira chamada; a recomendação resume a concorrência que passou nos critérios. A tabela contém cenário, chamadas simultâneas, sucessos, erros, tokens de entrada/saída, tempo até o primeiro token (**TTFT**), latência total, respostas/s e tokens/s. Clique em **amostras individuais** para ver cada requisição e seu código HTTP. **Baixar JSON** exporta o relatório completo.

HTTP 409 indica que outra geração já ocupava a capacidade disponível; essas falhas contam na taxa de erro, mas ficam fora dos percentis de respostas concluídas. Veja [o plano exato e como interpretar os números](benchmark.md). Os [relatórios incluídos no repositório](../reports/) são exemplos medidos localmente e não estimam o desempenho da VM Oracle.

## Confirmação de exclusão e fechamento

Excluir conversa ou documento abre um painel com o nome do item e os botões **Cancelar** e **Excluir**. A exclusão confirmada é permanente na interface. Outros painéis podem ser fechados pelo **X**, pela tecla **Esc** ou clicando fora deles.

## Onde cada dado fica

| Dado | Local |
| --- | --- |
| Conversas, mensagens, documentos e relatórios de teste | SQLite no volume Docker `local-chat_data` |
| Arquivos dos modelos baixados | Volume Docker `local-chat_models` |
| Modelo selecionado | Armazenamento local do navegador (`localStorage`) |
| Texto ainda não enviado e estado dos botões | Memória da aba; reiniciar a página restaura os botões ao padrão ligado |

`docker compose down` preserva os volumes. `docker compose down -v` apaga os dados desses volumes. Para backup e publicação HTTPS, consulte o [guia de implantação](deployment.md).
