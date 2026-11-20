---
name: bateria-rapida-por-versao
description: "Decisão dele (11/11/2026) — antes de produção, cada versão roda só os testes dela + os antigos que usam o código mexido (~15–30 min); a bateria completa do LocalDB (~2 h) só nas Travas"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-11T13:14:01.599Z
---

Antes de produção, cada versão roda a bateria RÁPIDA do LocalDB: os roteiros e2e da própria versão + os antigos que chamam os handlers/módulos compartilhados que ela mudou (alvo: 15 a 30 minutos). A bateria completa (`tools/e2e-localdb/tudo.sh`, 80 roteiros, ~1h50) fica só para o fechamento de fase (Travas) e roda enquanto outro trabalho anda.

**Why:** em 10–11/11/2026 a entrega da v9.5 esperou ~2 h de bateria (e mais 2 h por erro meu de base velha); ele reclamou: "2 horas de testes para entrar em produção — a que ponto a gente chegou". Escolheu a opção "Rápido por versão" na pergunta de 11/11.

**How to apply:** as bases antigas ainda precisam do esquema novo (a v9.5 quebrou roteiros antigos porque o cadastro de pessoas passou a usar a tabela Bairros) — na rápida, aplicar a migração nova em cima de cada base usada (restaurar, migrar, salvar: segundos) em vez de refazer a cadeia toda. Escolher os roteiros antigos por `grep` dos handlers mudados (`git diff --stat main...<ramo> -- api`) nos e2e (`chamarRota("X/index.js")`). Ver [[verificacao-e2e-localdb]] e [[v95-territorio]].
