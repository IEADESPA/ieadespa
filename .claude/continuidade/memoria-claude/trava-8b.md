---
name: trava-8b
description: "Trava 8-B — FECHADA e EM PRODUÇÃO 03/11/2026 (revert -m 1 adfd7d7), migração 164, casca v50; FASE 8 ENCERRADA, próxima FASE 9; decisões dele e o teto do teste de tela"
metadata:
  node_type: memory
  type: project
  originSessionId: 28922282-7bd5-4337-97ac-354437859a13
  modified: 2026-11-03T17:36:27.668Z
---

**EM PRODUÇÃO desde 03/11/2026** (merge `adfd7d7`; reverter = `git revert -m 1 adfd7d7`; docs `34a2236`). Migração 164, casca v50, `e2e-68` (53).

- **FASE 8 ENCERRADA.** Próxima: FASE 9 (Entidades vinculadas, docs/plano/fase-9-entidades-vinculadas.md).
- **Provas:** jest 6.228; bateria e2e-1..68 verde; homologação 41635650092; produção completa 41661600155 (5.818 + 745 iguais, 0 divergência).
- **Decisões que ele pode mudar:** listadas no fim da seção da Trava 8-B, em docs/plano/fase-8-ministerial-afm.md:
  - CHM do dirigente só avisa;
  - Prova de Reintegração registrada pela disciplina;
  - requisito disciplinar só na consagração;
  - turma reaberta mantém aprovação;
  - minimização apaga o acadêmico;
  - urgência do batismo só pelo nível geral;
  - outra convenção só para Evangelista e Pastor;
  - Seminário só em novembro;
  - Diácono, Auxiliar e Missionário não celebram.

**Armadilha do teste de tela:**
- A rodada COMPLETA logo depois de aprovar uma base nova refaz a 1ª rodada da base (~62 min) e depois a da versão atual (~60 min).
- O teto era 90 min e a cortou no meio. Agora é 150 (`61e16b6`).
- O teste rápido do push na main é cancelado quando se dispara o completo (mesmo grupo de concorrência). Isso é normal.

Ligada a [[trava-8a]] e [[v87-seminario]].
