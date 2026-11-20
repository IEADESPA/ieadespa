# api/ — o servidor do sistema (Azure Functions, Node.js 22)

As rotas do sistema de gestão (`/api/...`), publicadas junto com o `app/` no Static Web App. O banco é o Azure SQL.

## Peças principais

- **Uma pasta por rota** (~236): `<Rota>/function.json` (método e caminho) + `<Rota>/index.js` (o handler). O
  comentário do alto de cada `index.js` diz a versão, a regra e o caminho.
- **`shared/`** (~165 módulos): as regras de negócio reaproveitadas. As que mais aparecem:
  - `db.js` (o `mssql` com `SQL_CONNECTION_STRING`), `auth.js` (sessão, senha, permissões, `exigirTitular`,
    `exigirFatorRecente` = confirmação reforçada 428), `escopo.js` e `escopoRotas.js` (o que cada nível alcança:
    congregação, área... até o Geral), `auditoria.js` (`AuditLog`), `entrada.js`;
  - `<tema>.js` (a regra pura) + `<tema>Db.js` (as consultas), por módulo.
- **`scripts/`**: `executar-migracoes.js` (o deploy roda TODAS as `sql/migrations/NNN_*.sql`, em ordem),
  `semear-homologacao.js` (dados de teste da homologação) e `varrer-rotas.js` (chama toda rota sem sessão depois do
  deploy: só 401/400/403 ou 200 nas públicas).

## Regras

- **Rota nova:** sessão + escopo desde o começo (`exigirTitular` para o "meu", `escopoRotas` para o resto; o Geral
  com `exigirGeral`). Rota pública só quando o desenho manda, e com limitador.
- **Atos sensíveis** (aprovar saída grande, remessa, cargo/permissão, exclusão LGPD) pedem `exigirFatorRecente` (428).
- Toda ação relevante grava em `auditoria.js`. Mensagem de erro nunca revela se a pessoa ou o CPF existe.
- **Banco:** mudança de esquema só por migração nova e idempotente (`IF NOT EXISTS`), nunca `DROP` sem transição
  aprovada; nenhuma migração regrava o que a tela edita (README 2.4).
- **Segredos:** `local.settings.enc.json` (SOPS + Age; `npm run secrets:decrypt`). O `local.settings.json`
  aponta para a **produção**: SQL de teste vai na homologação (`ieadespa-homolog`), nunca na produção.
- Nada de credencial no código.

## Testes

```bash
cd api && npm ci && npx jest                 # unidade (shared/__tests__, ~175 arquivos; banco simulado)
npx jest shared/__tests__/<arquivo>.test.js  # só o da mudança (bateria rápida por versão)
```

Ponta a ponta contra um SQL Server de verdade: `tools/e2e-localdb` (README lá). Na homologação: o teste de telas do CI.
