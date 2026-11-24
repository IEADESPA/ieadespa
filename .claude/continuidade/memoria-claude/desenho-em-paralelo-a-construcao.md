---
name: desenho-em-paralelo-a-construcao
description: "24/11: 3 papéis ao mesmo tempo — construtor, desenhista e corretor (o construtor corrigindo o que o revisor de fora acha); o revisor de dentro só no portão (antes do homolog e da produção); cada um no seu ramo e worktree"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-24T17:45:00.000Z
---

**24/11/2026, à tarde: 3 papéis** (ordem nova dele): um **construtor** constrói o que foi decidido; um **desenhista** desenha as
rodadas para ele aprovar; um **corretor** (o agente construtor com essa missão) corrige os defeitos que o **revisor de
fora** acha. O revisor de dentro fica parado, **só no portão**: uma passada por ramo antes da homologação e outra antes
da produção (ele escolheu isso ao saber que o revisor de fora revisar os ramos novos custaria US$ 400–500 dos
créditos). O revisor de fora fica com a main e confere de novo cada correção do corretor. Quando o corretor não tem
defeito para corrigir, o lugar dele pode ir a um segundo construtor de outro módulo (nunca o mesmo código). Por quê, nas
palavras dele: "o revisor de fora já está no Fable, no mais alto… ter só um corretor"; olhar mais largo sem gastar com
um revisor a mais.

**23/11/2026, à noite: 4 agentes** (ordem nova dele: "não pode ficar parado… já pode jogar os outros dois… fica aí os
4"): o desenhista, o construtor e mais dois de missões curtas (naquele dia, o revisor de fora na bancada e a pesquisa
dos economizadores). Vale até ele dar outro número.

**23/11/2026, à tarde: 2 agentes** (ordem nova dele: "primeiramente só eu trabalho com esses dois agentes"): o
**desenhista** e o **construtor** (Membros, depois Financeiro, até a homologação e, com o sim dele, a produção). A
conferência do revisor antes da produção continua, no lugar do construtor, nunca como terceiro agente. A caça de
defeitos de segurança ficou "em questões secundárias": o lote 1 da varredura espera.

Na FASE 10, o serviço NÃO para. A regra global (22/11) diz que o número de agentes ao mesmo tempo é ele quem decide,
de 1 a 4, conforme os créditos; sem ordem nova, vale o último número dado no projeto. **No ieadespa, em 23/11/2026: 3
agentes** — um **desenha** (as rodadas), um **constrói** (primeiro o Membros, depois alterna para o Financeiro; não
mais os dois em paralelo) e um **revisa** (o revisor, no modelo mais forte).

**Why:** 21/11, ao ver só um agente: "Tem que ter outro agente trabalhando para já ir colocando tudo lá na homologação
até chegar na produção. Nós não podemos parar isso não." 23/11, a contagem: "Vai ser 3: um vai desenhar, o outro vai
construir primeiramente o Membros e depois ele alterna para o Financeiro, e o terceiro vai revisar."

**How to apply:**

- Quando um agente termina, o próximo daquela frente já começa; 3 papéis ao mesmo tempo (24/11), sem ordem nova.
- Agentes em paralelo nunca mexem no mesmo código; worktree e ramo próprios; só um por vez usa o banco de teste (trava
  `C:/tmp/localdb-trava`); faixa de migrações (Membros até a 199, Financeiro a partir da 200); antes de mesclar no
  `homolog`, `git fetch` e esperar o deploy em curso (`gh run list`).
- O revisor de dentro só no portão: uma passada antes do homolog e outra antes da produção (24/11).
- A produção continua só com o OK dele ([[fase10-nada-sem-aprovacao]]).
- Desenho: a publicação na página de propostas precisa de um agente de contexto limpo (a ferramenta exige ler a versão
  viva inteira). Ver [[ordem-fixa-de-modulos]], [[propostas-de-tela-em-artefato]] e [[conselheiro-e-padrao-alto]].
