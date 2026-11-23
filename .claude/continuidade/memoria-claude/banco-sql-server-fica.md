---
name: banco-sql-server-fica
description: "23/11/2026: o banco do ieadespa continua no Azure SQL (SQL Server); não reabrir a troca para o Postgres sem motivo novo"
metadata:
  type: project
---

Em 23/11/2026, ao ver que outros sistemas usam Postgres e ganharam uma habilidade de Postgres, ele perguntou por que o
nosso não é Postgres. Decisão dele: **continuar com o nosso** (Azure SQL, hoje no nível Basic).

**Why:** os dois são bancos do mesmo tipo e sobram para o nosso tamanho. Trocar seria reescrever e retestar cerca de 180
migrações (umas 18 mil linhas) e mais de 200 arquivos do servidor no dialeto do SQL Server, parando Membros e Financeiro
por semanas, sem nada mudar para os membros. O preço depende do nível e do uso, não da marca: conta real de
22/10 a 21/11 (Cost Management), `app-db-prod` (Basic) R$ 32,16; o mesmo banco, no nível serverless, custou ~R$ 1.450 em
outubro. O painel do site (Directus) já usa um Postgres no Azure (`ieadespa-directus-db`, B1ms, criado em 04/09/2026),
que saiu **R$ 0,00** no mesmo período (provável oferta gratuita, que acaba um dia; o preço de tabela do B1ms é
~R$ 137/mês só de processador). Na mesma conta, o banco da homologação custou R$ 113,28 (os testes), e o total foi
R$ 322,76 (o teto dele é R$ 450). A decisão 1 do `README` ("tudo no Azure") já permitia os dois bancos; o motivo da
escolha original não ficou registrado.

Também em 23/11: o sistema da associação (Postgres) fica como está; ele disse que não precisa estudar a troca. As regras
de SQL para o nosso: ele pediu primeiro um estudo da eficiência (`C:\tmp\ieadespa-bancada\estudo-regras-sql.md`): deu ganho
médio, e as 9 regras foram para o `api/CLAUDE.md` (seção "Banco (SQL Server)"), sem habilidade nova.

**How to apply:** não propor a troca. Só reabrir se o sistema sair do Azure ou precisar de algo que só o Postgres faz.
A habilidade de Postgres da bancada é para os sistemas que usam Postgres, não para este. Ver [[custo-azure-e-pico-do-servidor]].
