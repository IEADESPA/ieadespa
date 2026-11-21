---
name: desenho-em-paralelo-a-construcao
description: "Sempre mais de um agente trabalhando em paralelo (construção de módulos para a homologação e desenho), cada um no seu ramo e worktree; a regra global \"um agente por vez\" NÃO vale aqui"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-21T19:40:00.000Z
---

Na FASE 10, o serviço NÃO para: manter agentes trabalhando em paralelo, cada um no seu ramo e no seu worktree. Em
21/11/2026: um agente no Membros (`v10-membros-svelte`, `C:/tmp/ieadespa-svelte`) e outro construindo o Financeiro
aprovado (`v10-financeiro-svelte`, `C:/tmp/ieadespa-financeiro/obra`), os dois levando à homologação. Quando houver
rodada de desenho, mais um agente desenha enquanto os outros constroem.

**Why:** 17/11/2026, ele: "as telas, a aprovação das telas, precisam ser feitas logo... isso já vai sendo paralelo". Em
21/11/2026, ao ver só um agente trabalhando: "Tem que ter outro agente trabalhando para já ir colocando tudo lá na
homologação até chegar na produção. Nós não podemos parar isso não."

**How to apply:**

- Quando um agente termina, o próximo daquela frente já começa; nunca deixar só um trabalhando se há outra frente
  aprovada esperando (construção de módulo aprovado, pendências, desenho do próximo módulo).
- Para não colidirem: worktree e ramo próprios; faixa própria de migrações (Membros até 18x, Financeiro a partir da 200);
  antes de mesclar no `homolog`, `git fetch` e esperar o deploy que estiver rodando (`gh run list`).
- A produção continua só com o OK dele ([[fase10-nada-sem-aprovacao]]).
- Desenho: a publicação na página de propostas precisa de um agente de contexto limpo (a ferramenta exige ler a versão
  viva inteira). Ver [[ordem-fixa-de-modulos]] e [[propostas-de-tela-em-artefato]].
