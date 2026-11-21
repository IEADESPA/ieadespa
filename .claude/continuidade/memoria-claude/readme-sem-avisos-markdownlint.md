---
name: readme-sem-avisos-markdownlint
description: O usuário tem a extensão markdownlint no VS Code e não quer linhas laranjas nos .md; MD013 (linha longa) não aparece para ele
metadata:
  node_type: memory
  type: feedback
  originSessionId: 36edf0f4-eb01-49ee-92ef-b50648e3316e
  modified: 2026-09-30T22:52:57.008Z
---

O usuário usa a extensão **markdownlint** no VS Code e pediu (30/09/2026) que o `README.md` ficasse sem avisos. A regra **MD013 (line-length) não aparece** no editor dele (desligada nas configurações de usuário), então o texto pode passar de 80 colunas.

**Why:** as linhas laranjas o incomodam; o README tem ~7.800 linhas e é escrito em blocos longos.

**How to apply:** depois de editar qualquer `.md` do repositório, rodar `npx --yes markdownlint-cli2 --config <json com {"MD013": false}> README.md` (config fora do repo, no scratchpad) e confirmar 0 issues antes do commit. Regras que mais pegam: MD032 (linha em branco antes/depois de lista), MD022 (título), MD060 (separador de tabela `| --- |` com espaços), MD040 (cerca de código com linguagem), MD004 (só `-` em lista), MD047 (quebra de linha no fim). Cuidado: linha que começa com `+ ` no meio de um parágrafo vira item de lista — juntar a frase em vez de só trocar o marcador. Ver [[testar-sql-na-homologacao]] para a outra rotina de verificação do projeto.
