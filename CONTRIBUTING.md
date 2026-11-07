# Contribuir

Obrigado por ajudar a melhorar o Local Chat. Antes de propor uma mudança, abra uma issue ou descreva o problema no pull request para alinhar o objetivo.

## Ambiente de desenvolvimento

1. Instale Node.js 24, npm e Docker Compose 2.24.4+.
2. Execute `npm ci`, `npm test` e `npm run build` na raiz.
3. Para testar com o Ollama real, rode `docker compose up -d --build` e abra `http://localhost:8080`.
4. Para iterar no frontend, mantenha o Compose rodando e execute `npm run dev`; o Vite encaminha `/api` para a porta 8080.

Inclua testes quando mudar o comportamento da API ou do diagnóstico. Os testes automatizados usam respostas simuladas do Ollama; qualquer resultado de desempenho precisa ser medido com inferência real e acompanhado de modelo, hardware e configuração. Não inclua conversas privadas, documentos de usuários, `.env`, banco SQLite ou tokens em commits.

## Pull requests

- Explique o problema, a solução e como verificou o resultado.
- Mantenha alterações focadas e atualize a documentação quando mudar rotas, variáveis de ambiente ou configuração Docker.
- Confirme `npm test`, `npm run build` e `docker compose config --quiet` antes de enviar.
- Para mudanças de interface, inclua uma captura de tela sem dados pessoais.

O código do projeto está sob a [licença MIT](LICENSE). Modelos e imagens de terceiros seguem suas próprias licenças.
