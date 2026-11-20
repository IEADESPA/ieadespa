---
name: desenho-em-paralelo-a-construcao
description: "O desenho das telas (rodadas para aprovação) corre em paralelo à construção, com um agente próprio; a regra global \"um agente por vez\" não trava o desenho"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-17T14:46:48.371Z
---

Na FASE 10, manter SEMPRE um agente desenhando as próximas rodadas de telas (módulo a módulo, na ordem fixa) enquanto outro constrói/mede — e publicar cada rodada assim que ficar pronta (a publicação precisa de um agente de contexto limpo, porque a ferramenta exige ler a versão viva inteira, ~510 KB). Ele aprova tela por tela e quer o máximo de telas prontas para olhar.

**Why:** 17/11/2026, ele: "as telas, a aprovação das telas, precisam ser feitas logo... elas independem [da construção]... isso já vai sendo paralelo, senão a gente fica perdendo muito tempo". Ele tinha dito antes "um agente por vez"; para desenho × construção isso não vale.

**How to apply:** o agente de construção é o único que mexe no Git (código e docs); o de desenho trabalha no scratchpad (rN-telas.js, rN-lista.js, emendar-rN.js sobre propostas-r2-antes-rN.html) e entrega a rodada pronta; eu lanço a publicação e escrevo as decisões dele no plano. Ver [[ordem-fixa-de-modulos]] e [[propostas-de-tela-em-artefato]].
