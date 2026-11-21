---
name: copias-pesadas-locais-nao-apagar
description: "No notebook do responsável ficam, de propósito, as cópias pesadas aninhadas chamada-ebd/chamada-ebd/, relatorios-departamentos/relatorios-departamentos/ e os .rar; limpeza só quando ele pedir"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-21T00:00:00.000Z
---

Desde 30/09/2026 os protótipos de referência estão no Git, enxutos, na raiz: `chamada-ebd/` e
`relatorios-departamentos/` (só o código-fonte; ver `REFERENCIAS.md`). No notebook do responsável continuam as
cópias **pesadas antigas**, aninhadas dentro delas: `chamada-ebd/chamada-ebd/` e
`relatorios-departamentos/relatorios-departamentos/` (cerca de 1,6 GB com `node_modules`). Também continuam os dois
`.rar` na raiz; o da EBD tem 429 MB, acima do limite de 100 MB do GitHub. O `.gitignore` ignora esses três itens.

**Why:** ele só apaga quando confirmar que a versão enxuta basta, para não precisar "relembrar situações adversas"
se faltar alguma coisa.

**How to apply:** não apagar as pastas aninhadas nem os `.rar`, e não tirar do `.gitignore` as três regras
(`/chamada-ebd/chamada-ebd/`, `/relatorios-departamentos/relatorios-departamentos/`, `*.rar`) sem pedido explícito.
Quando ele pedir a limpeza, apagar as duas pastas e os `.rar` e tirar só essas três linhas; as regras de artefatos,
como `/chamada-ebd/**/node_modules/`, ficam. Nota trazida da memória local antiga em 21/11/2026.
