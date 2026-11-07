# Segurança

O Local Chat foi pensado para uso pessoal ou por um grupo de confiança. No modo API, uma chave Bearer compartilhada dá acesso a todas as conversas e documentos. Não há separação por usuário ou cliente, limitação de taxa por chave, nem uma fila de geração. Faça essas adaptações antes de oferecer o serviço a usuários independentes.

## Relatar uma vulnerabilidade

Não publique segredos ou detalhes de exploração em uma issue pública. Use o recurso **Report a vulnerability** na aba **Security** do repositório, se estiver habilitado, ou entre em contato com o mantenedor pelo perfil do GitHub para combinar um canal privado. Informe versão/commit, passos de reprodução e impacto esperado. Não inclua dados reais de terceiros.

## Recomendações para operadores

- Exponha somente HTTPS (portas 80/443 para o Caddy) ou use o túnel SSH documentado.
- Defina valores aleatórios distintos para `API_KEY` e `SEARXNG_SECRET`; mantenha `.env` fora do Git.
- Nunca coloque `API_KEY` em código de frontend ou aplicativo distribuído ao público.
- Faça backup do volume de dados com o backend parado e restrinja o acesso aos backups.
- Acompanhe atualizações das imagens Docker e dependências npm antes de atualizar em produção.

Veja a [instalação e operação](docs/deployment.md) para detalhes de rede, volumes e backup.
