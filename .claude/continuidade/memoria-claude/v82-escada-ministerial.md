---
name: v82-escada-ministerial
description: "v8.2 escada ministerial EM PRODUÇÃO desde 28/10/2026 (revert -m 1 9ee1968), migração 157; decisões que ele pode mudar, armadilhas e provas"
metadata:
  node_type: memory
  type: project
  originSessionId: 28922282-7bd5-4337-97ac-354437859a13
  modified: 2026-10-28T14:42:43.946Z
---

v8.2 (escada ministerial) EM PRODUÇÃO desde 28/10/2026: merge 9ee1968, desfazer = `git revert -m 1 9ee1968`. Migração 157, casca SW v43, rota /api/escada/requisitos + afm vetaveis/chm/matricular-candidato/vetar. Próxima = v8.3 (CEI/escrutínio, divórcio).

**Decisões por interpretação (ele pode mudar):** Missionário degrau obrigatório; Missionária é teto também p/ outra convenção; nomeação do Presidente dispensa só o técnico; Evangelista/Pastor exigem curso concluído mesmo nomeados; idade 30 do Presbítero e Pastor casado só avisos; dado que falta trava; CHM vale p/ uma subida; veto encerra a indicação; sem permissão "disciplina" protocola sem ver; ninguém mexe na própria escada; processos de Evangelista/Pastor antigos: reprovar e protocolar como nomeação.

**Why:** contexto para v8.3 e para não reabrir o que foi decidido.

**How to apply:** armadilhas — scripts python/regex só via Write no scratchpad; simulador de tela (vm) não tem dataset nem URLSearchParams (usar get/setAttribute e injetar); regex de e2e pode casar com o rótulo do item (usar a frase inteira); preenchimento inicial em migração roda UMA vez (migrações rodam a cada deploy); avaliar() recebe pool OU transação. Provas: e2e-51..54 (`bash rodar.sh preparar-escada`), tools/front-escada. Não cobrar cadastro de pessoas ([[nao-cobrar-cadastros-de-pessoas]]). Ver [[v81-afm-faltas-cli-wip]].
