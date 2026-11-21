---
name: readme-enxuto-historico-em-docs
description: "O README da raiz deve ficar pequeno (<600 linhas); o histórico de cada versão vai em docs/plano/fase-N-*.md, nunca no README"
metadata:
  node_type: memory
  type: feedback
  originSessionId: b78b5f11-8f29-43b6-a1a1-18ef263a2c3b
  modified: 2026-10-01T19:39:49.210Z
---

O usuário reclamou que o README passou de 9.000 linhas porque virou diário de entrega de cada versão. Em 01/10/2026 ele foi dividido: o README ficou com regras permanentes, arquitetura, modelo de dados e referência técnica (~576 linhas), e o histórico foi para `docs/plano/` (um arquivo por fase) e `docs/pesquisa/`.

**Why:** "esse arquivo está gigante demais... não tem como seguir" — ele não gosta de histórico jogado no README e quer o histórico em outro arquivo.

**How to apply:** ao entregar uma versão, escrever checklist/decisões/limites/verificação em `docs/plano/fase-N-….md` (não no README); rodar `node docs/gerar-indice.js` e commitar o `docs/plano/INDICE.md` junto; no README só mexer na linha da fase (situação / "Estado atual") e na lista de tabelas da seção 4 quando uma migração criar tabela. Rodar markdownlint em `README.md` e `docs/**/*.md` ([[readme-sem-avisos-markdownlint]]). Se um arquivo de fase passar de ~2.000 linhas, dividir por bloco de versões.
