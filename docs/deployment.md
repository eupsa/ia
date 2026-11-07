# Instalação e operação

O projeto tem três modos: **localhost**, **site HTTPS** e **API HTTPS sem frontend**. Todos usam Ollama, backend, SearXNG e volumes Docker. Se você já usa outro modo na mesma VM, pare o Compose atual antes de subir o próximo; os volumes persistem.

## 1. Teste local

Instale Docker Engine/Desktop com Compose 2.24.4 ou superior. No Windows, use containers Linux. Depois:

```bash
git clone https://github.com/eupsa/ia.git
cd ia
docker compose up -d --build
docker compose ps
```

Abra `http://localhost:8080`, baixe o modelo em **Meus modelos** e inicie uma conversa. A porta 8080 é ligada apenas a `127.0.0.1`. Se aparecer “Ollama desconectado”, aguarde o healthcheck e consulte `docker compose logs --tail=100 backend ollama`.

## 2. Preparar a VM Oracle ARM64

Use uma VM Linux ARM64 com 4 CPUs e 12 GB RAM, Docker Engine e Compose. Verifique a arquitetura com `uname -m` (`aarch64`) e espaço em disco com `df -h`. O Compose limita o Ollama a 3,5 CPUs/8 GB, o backend a 0,5 CPU/512 MB, o buscador a 0,5 CPU/384 MB e carrega um modelo por vez. Reserve espaço para imagens Docker, modelo, banco e logs.

Clone o repositório na VM e escolha **um** dos modos abaixo. As imagens Node, Nginx, Ollama, Caddy e SearXNG precisam estar disponíveis para ARM64 no momento da implantação; confira o resultado de `docker compose up` na própria VM. O desempenho publicado em `reports/` foi medido em Docker Desktop Windows x64, não na Oracle.

### Acesso privado por túnel SSH

Na VM, rode o Compose padrão. No seu computador:

```bash
ssh -L 8080:127.0.0.1:8080 ubuntu@IP_PUBLICO_DA_VM
```

Acesse `http://localhost:8080`. Você não precisa abrir 8080 no firewall público.

### Site HTTPS com autenticação

Configure DNS A/AAAA para o IP da VM. Libere TCP 80 e 443 tanto na Oracle VCN quanto no firewall do Linux. Copie `.env.example` para `.env` e preencha `DOMAIN`, `AUTH_USER`, `AUTH_PASSWORD_HASH` e `SEARXNG_SECRET`. Gere o hash de senha interativamente e um segredo aleatório:

```bash
docker run --rm -it caddy:2.10-alpine caddy hash-password
openssl rand -hex 32
```

Coloque o hash entre **aspas simples** no `.env` para preservar os sinais `$`. O arquivo `.env` é ignorado pelo Git. Inicie:

```bash
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
docker compose -f compose.yaml -f compose.prod.yaml ps
```

O Caddy obtém o certificado TLS e aplica autenticação Basic a todo o site. Não exponha diretamente as portas 3000, 8080 ou 11434. Use uma senha forte e HTTPS; a configuração não oferece contas individuais.

### Somente API HTTPS

Preencha `DOMAIN`, `API_KEY` e `SEARXNG_SECRET` em `.env`; gere as duas chaves com `openssl rand -hex 32` separadamente. Abra TCP 80/443 na VCN e no firewall. Depois:

```bash
docker compose -f compose.yaml -f compose.api.yaml up -d --build ollama search backend gateway
curl https://api.seudominio.com/api/health
curl -H "Authorization: Bearer $API_KEY" https://api.seudominio.com/api/models
```

O frontend não é iniciado. A porta 3000 fica acessível só no loopback da VM; pela internet, use exclusivamente o gateway HTTPS. Mantenha `API_KEY` no servidor chamador, fora de JavaScript distribuído ao navegador. A [referência da API](api.md) mostra o fluxo completo.

## Operação

```bash
docker compose ps
docker compose logs --tail=100 backend ollama search
docker compose down
```

Use os mesmos arquivos `-f` da inicialização ao consultar ou parar um perfil alternativo. `down` preserva os volumes; **`down -v` apaga modelos, conversas, documentos e diagnósticos**. Para atualizar, faça `git pull` e execute novamente o comando `up -d --build` do modo escolhido. Confira `/api/health` e execute um teste curto no chat após a atualização.

### Backup

Pare os containers antes de copiar o SQLite, para incluir dados pendentes do WAL. Na VM Linux, dentro do diretório do repositório:

```bash
docker compose down
docker run --rm -v local-chat_data:/data:ro -v "$PWD":/backup alpine \
  tar -czf /backup/local-chat-data.tar.gz -C /data .
```

Guarde o arquivo fora da VM. O volume `local-chat_data` contém conversas, documentos e relatórios; `local-chat_models` contém os modelos, que podem ser baixados novamente. Confira os nomes efetivos com `docker volume ls` se você alterou o nome do projeto Compose. Inicie novamente com o comando `up` do seu modo.

## Problemas comuns

| Sintoma | Verifique |
| --- | --- |
| Frontend mostra erro de servidor | `docker compose ps`, logs do backend e healthcheck do Ollama |
| Modelo não aparece como instalado | Download em **Meus modelos**, espaço em disco, logs do Ollama |
| HTTP 409 em chamadas simultâneas | Limite atual de uma geração; coloque fila ou reduza concorrência |
| Pesquisa web sem fontes | Logs do SearXNG e conectividade de saída da VM |
| HTTPS não emite certificado | DNS, portas 80/443 na VCN e no firewall, logs do Caddy |
| Serviço lento na VM | Execute o [diagnóstico](benchmark.md) na VM e confira CPU/RAM com `docker stats` |

Não publique `.env`, dumps do SQLite, chaves de API ou arquivos enviados pelos usuários no repositório.
