# Branch/PR de homologação

Este branch existe só pra manter aberto um Pull Request permanente, cujo
**ambiente de preview** (grátis, incluso no plano Standard do Static Web
App) fica apontado pro banco `ieadespa-homolog` em vez do banco de
produção (`app-db-prod`) — ver [`HOMOLOGACAO.md`](./HOMOLOGACAO.md).

**Não feche nem faça merge deste PR** — o ambiente de preview é destruído
quando o PR fecha. Se precisar recriar, basta reabrir um PR a partir
deste branch (ou de outro) e reconfigurar a `SQL_CONNECTION_STRING` do
novo ambiente de preview com o comando documentado em `HOMOLOGACAO.md`.
