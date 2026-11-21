---
name: empurrar-ramo-durante-o-servico
description: "Em versão longa, empurrar o ramo para o GitHub a cada etapa — o responsável só vê a nuvem e reclama de \"uma hora sem atualizar\""
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-05T20:14:28.076Z
---

Durante uma versão longa (ramo vX.Y antes do merge), fazer `git push origin <ramo>` a cada commit/etapa (desenho, código, correções da revisão, docs), não só no fim.

**Why:** 05/11/2026, v9.4: quase uma hora de trabalho só em commits locais; ele reclamou "nada de atualizar". Ele só enxerga o GitHub (CLAUDE.md regra 1).

**How to apply:** commit no ramo → push do ramo na mesma hora; avisar em uma linha o que subiu. A main continua só no merge final (depois da homologação). Ver [[nada-em-aberto]].
