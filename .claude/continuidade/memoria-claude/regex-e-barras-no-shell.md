---
name: regex-e-barras-no-shell
description: Código com regex ou barra invertida nunca vai por heredoc/node -e/template do shell; usar Edit/Write e rodar o código com um exemplo
metadata:
  node_type: memory
  type: feedback
  originSessionId: b78b5f11-8f29-43b6-a1a1-18ef263a2c3b
  modified: 2026-10-02T01:50:03.996Z
---

Script `node` embutido no shell (heredoc, `node -e`, template literal dentro dele) **perde as barras invertidas**: `/^\d+$/` virou `/^d+$/` e `\[` virou `[`. Aconteceu três vezes (v7.4, v7.5, e de novo no `extrairIp` e no `idValido`). O pior caso foi um regex de validação de id que **foi para produção** recusando todo id em texto.

**Why:** o erro é silencioso (o arquivo continua com sintaxe válida) e os testes que usam números ou strings sem barra não pegam.

**How to apply:** (1) código que contenha regex, `\n`, `\d`, `\.` ou `\[` entra pela ferramenta Edit/Write, nunca por script de shell; (2) logo depois, rode o código com 2-3 exemplos reais (`node -e` lendo um arquivo `.js` salvo, não string em linha) ou um teste; (3) arquivos `.js` de `api/` e `app/` estão em CRLF no disco (`git ls-files --eol`): busca multilinha por `\n` em script falha — use Edit. Ver [[verificacao-e2e-localdb]] sobre passar a query em texto nos testes.
