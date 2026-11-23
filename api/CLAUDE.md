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

## Banco (SQL Server): as regras de qualidade

Valem para todo código novo e toda correção. O banco de produção é o nível Basic (5 DTU, 30 workers, 300 sessões),
pequeno: o que escapa aqui só aparece no dia de muito uso. Vêm do estudo de 23/11/2026 (ganho médio), na condição
que ele deu: entram se o ganho não for pequeno.

1. Nada de consulta dentro de laço sobre lista que cresce (N+1): uma consulta só, com junção ou lista de ids.
   [Chatty I/O](https://learn.microsoft.com/azure/architecture/antipatterns/chatty-io/)
2. Filtrar, contar e paginar no banco, nunca trazer tudo para o Node.
   [Extraneous fetching](https://learn.microsoft.com/azure/architecture/antipatterns/extraneous-fetching/)
3. Índice, na mesma migração, em toda coluna filtrada, juntada ou apagada por chave estrangeira (a de "quem
   registrou" não precisa). [Índices em chaves estrangeiras](https://learn.microsoft.com/sql/relational-databases/tables/primary-and-foreign-key-constraints#indexes-on-foreign-key-constraints)
4. Nada de função sobre a coluna no filtro (`CONVERT`, `LOWER`, `ISNULL(col…)`, `LIKE '%…'`), e o parâmetro com o
   tipo da coluna (`NVarChar` × `VARCHAR` desliga o índice).
   [Predicados que não usam índice](https://learn.microsoft.com/sql/relational-databases/post-migration-validation-and-optimization-guide#inability-to-use-predicates-to-filter-data)
5. Nova tentativa, com espera crescente, nos erros passageiros do Azure SQL (40197, 40501, 40613, 49918, 10928,
   10929); no impasse (1205), repetir a transação inteira.
   [Erros passageiros](https://learn.microsoft.com/azure/azure-sql/database/troubleshoot-common-errors-issues#transient-fault-error-messages-40197-40613-and-others)
6. O pool de conexões configurado de propósito para o Basic, não o padrão do driver.
   [Limites do Basic](https://learn.microsoft.com/azure/azure-sql/database/resource-limits-dtu-single-databases)
7. Transação curta, com `SET XACT_ABORT ON`; nada de e-mail, `fetch` ou espera dentro dela.
   [Bloqueios](https://learn.microsoft.com/azure/azure-sql/database/understand-resolve-blocking)
8. `OFFSET … FETCH` só com desempate único no `ORDER BY` e com teto por página.
   [OFFSET e FETCH](https://learn.microsoft.com/sql/t-sql/queries/select-order-by-clause-transact-sql#use-offset-and-fetch-to-limit-the-rows-returned)
9. Valor do usuário só por parâmetro, nunca concatenado no SQL.
   [Injeção de SQL](https://learn.microsoft.com/sql/relational-databases/security/sql-injection)

As regras 5 e 6 ainda não existem no `shared/db.js`. Elas se constroem uma vez só, no `db.js`, numa missão própria,
nunca rota por rota: a nova tentativa em volta de uma gravação solta pode gravar duas vezes. Elas e os casos achados
pelo estudo entram na varredura de defeitos.

## Testes

```bash
cd api && npm ci && npx jest                 # unidade (shared/__tests__, ~175 arquivos; banco simulado)
npx jest shared/__tests__/<arquivo>.test.js  # só o da mudança (bateria rápida por versão)
```

Ponta a ponta contra um SQL Server de verdade: `tools/e2e-localdb` (README lá). Na homologação: o teste de telas do CI.
