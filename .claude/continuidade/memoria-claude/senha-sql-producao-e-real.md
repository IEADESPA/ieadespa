---
name: senha-sql-producao-e-real
description: "A senha do SQL de produção guardada no cofre SOPS (api/local.settings*.json) é real e está em uso: não tratar como morta, não trocar nem rotacionar sem pedido"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-21T00:00:00.000Z
---

A `SQL_CONNECTION_STRING` de `api/local.settings.json` e de `api/local.settings.enc.json` (banco de produção) tem uma
senha que o responsável confirmou em 30/09/2026 que **existe e é real**: no começo ele disse que não existia, depois
lembrou. O valor nunca vai para arquivo, mensagem ou memória.

**Why:** uma vez ela foi tratada como suspeita por ter aparecido num comando aprovado em
`.claude/settings.local.json`, arquivo local que nunca foi ao Git. A linha foi apagada a pedido dele. O lugar certo
da senha é o cofre SOPS, e ela fica lá como está.

**How to apply:** não apagar, trocar nem "rotacionar" essa senha no cofre ou no Azure SQL sem pedido dele. Ela nunca
vai em comando, em `.claude/settings*.json` ou em texto puro versionado; segredo só pelo fluxo do `SECRETS.md`. Ao
mostrar `local.settings.json` ou `.env*`, mascarar **todos** os valores. Ver também [[testar-sql-na-homologacao]].
Nota trazida da memória local antiga em 21/11/2026.
