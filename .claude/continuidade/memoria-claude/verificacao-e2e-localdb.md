---
name: verificacao-e2e-localdb
description: Como rodar os handlers reais contra SQL Server local (LocalDB psc7) antes de cada versão; achou bugs que os testes unitários não viam
metadata:
  node_type: memory
  type: reference
  originSessionId: b78b5f11-8f29-43b6-a1a1-18ef263a2c3b
  modified: 2026-10-08T19:57:46.820Z
---

Para cada versão nova com migração, a verificação ponta a ponta foi feita assim (scripts descartáveis no scratchpad da sessão, nunca versionados):

- Instância LocalDB `psc7` (banco `ieadespa_local`): `sqllocaldb start psc7`; se travar, `sqllocaldb stop psc7 -k` e iniciar de novo. Para recriar do zero: `DROP DATABASE` com `SINGLE_USER WITH ROLLBACK IMMEDIATE` e reaplicar as migrações 001..N com um script PowerShell que divide os batches por `GO` (testa também a migração nova).
- Um shim de `mssql` (via `Module._load`) liga os handlers reais (`GestaoXxx/index.js`) ao LocalDB por uma ponte Node↔PowerShell. Sessões de teste: `auth.reassinarSessao({membroId, permissoes, escopoCongregacoes})`.
- Roteiro `e2e-*.js` cobre acesso/escopo, fluxo feliz e recusas, auditoria (zero `[AUDITORIA]` com falha, `RegistroId` nunca nulo) e as garantias do banco (gatilhos, índices únicos, CHECK). Rodar sobre banco recém-criado, senão dados da rodada anterior atrapalham.
- Para tela: DOM simulado em `vm` com payload `<img onerror>` em todo campo; para o contrato, capturar as formas reais das respostas dos handlers e comparar com as propriedades que o `script.js` lê (as fixtures de um agente seguem o contrato descrito, não o real).

- Armadilhas que o roteiro já pegou: `CHECK (col IN (...))` deixa passar `NULL` (desconhecido) — escreva `col IS NOT NULL AND col IN (...)`; `Funcionalidades.Nome` aceita 100 caracteres e `PoliticasRetencao.BaseLegal` 300 (consulte `sys.columns` antes de semear texto longo).

- **Fidelidade ao HTTP:** a query string chega SEMPRE em texto. O harness precisa converter os valores de `query` para string (`String(v)`), senão uma validação de id que só aceita número passa nos testes e quebra em produção (aconteceu na v7.5: regex `/^d+$/` recusou todo `?congregacaoId=1`). Acrescente também um teste de CI que chama os handlers com `jest.mock("../db")` e valores em texto.
- **Além do funcional (v7.5):** (a) bateria de segurança — matriz ator × ação (gestor de outra congregação, líder de outra equipe, membro comum, permissão trocada), injeção de SQL/HTML em cada campo, lixo (nulo, lista, objeto, 5.000 caracteres, datas 0001/9999) e "403 igual para existente e inexistente"; (b) **corridas de verdade**: orquestrador que dispara N processos `node` ao mesmo tempo, cada um com sua conexão (a ponte do shim é uma conexão só, então `Promise.all` não prova corrida) — achou remoção duplicada e a remoção que perdia para a geração simultânea; (c) revisor adversarial só de leitura em outro agente, que achou XSS armazenado pelas notificações que nenhum teste meu cobria. Para provar que um teste vale, rode-o contra a versão anterior do arquivo (`git stash`/`git show`) e veja falhar.

- **Desde a v7.6 a ferramenta está versionada em `tools/e2e-localdb/`** (README próprio): ponte `ponte.ps1` + `shim-mssql.js`, `lib.js` (fuzz, `retrato`, sessões), `bases.ps1` (backup/restore sem COMPRESSION — LocalDB Express não aceita), `rodar.sh preparar` (migra do zero ~1–15 min + cenário + salva a base) e `rodar.sh roteiro ...` (restaura em segundos). Roteiros e2e-1…6 da v7.6 servem de modelo. Cada versão nova: copiar, trocar o cenário e as expectativas.
- **Armadilhas novas (v7.6):** nome de `Funcionalidades` >100 chars só estourou no e2e real; o executor de migrações pendura se a ponte ficar viva (`pool.close()` do shim a encerra); mudou uma regra no servidor → o roteiro antigo quebra por **expectativa defasada**, ler cada ✗ antes de mexer no servidor (duas vezes o erro era do teste); quem indicou/aprovou não registra a ficha; "líder" exige a permissão `pessoas`.
- **Mock de transação em teste unitário:** o `mssql` real procura o pool dentro de `sql.Transaction`; para testar caminho transacional sem driver, `jest.mock("../db")` com `Transaction/Request` simulados e a primeira `query` lançando um marcador (`PASSOU_DA_PORTA`) prova que o código chegou à gravação.

**Why:** na v7.2 o roteiro achou um defeito real (resposta de `consolidar` sobrescrevia `indeferidos`) que 86 testes unitários não viam; e a comparação com a produção achou que a grade de cultos semeada diferia da publicada no site.

**How to apply:** antes de commitar uma versão com migração/handlers novos, repetir esse roteiro; depois do deploy, conferir rotas novas (401 sem sessão) e, se mexe no site, comparar o que o site publica com o que o sistema devolve. Ver [[testar-sql-na-homologacao]] para o banco de homologação.
