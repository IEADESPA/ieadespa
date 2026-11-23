---
name: desenho-em-paralelo-a-construcao
description: "Neste projeto, 3 agentes ao mesmo tempo (decisão de 23/11): um desenha, um constrói (Membros primeiro, depois alterna para o Financeiro) e um revisa; cada um no seu ramo e worktree"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-23T22:15:03.519Z
---

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

- Quando um agente termina, o próximo daquela frente já começa; mas nunca mais que 3 ao mesmo tempo, sem ordem nova.
- Agentes em paralelo nunca mexem no mesmo código; worktree e ramo próprios; só um por vez usa o banco de teste (trava
  `C:/tmp/localdb-trava`); faixa de migrações (Membros até a 199, Financeiro a partir da 200); antes de mesclar no
  `homolog`, `git fetch` e esperar o deploy em curso (`gh run list`).
- O revisor confere o que o construtor entregou antes da homologação e antes da produção.
- A produção continua só com o OK dele ([[fase10-nada-sem-aprovacao]]).
- Desenho: a publicação na página de propostas precisa de um agente de contexto limpo (a ferramenta exige ler a versão
  viva inteira). Ver [[ordem-fixa-de-modulos]], [[propostas-de-tela-em-artefato]] e [[conselheiro-e-padrao-alto]].
