---
name: v81-afm-faltas-cli-wip
description: "v8.1 (AFM + faltas da CLI) — EM PRODUÇÃO desde 27/10/2026 (merge e4e5ea2, revert -m 1), migração 156; decisões que ele pode mudar; armadilhas"
metadata:
  node_type: memory
  type: project
  originSessionId: 28922282-7bd5-4337-97ac-354437859a13
  modified: 2026-10-28T00:59:22.628Z
---

**EM PRODUÇÃO desde 27/10/2026**: merge `e4e5ea2` na main (desfazer = `git revert -m 1 e4e5ea2`), ramo `v8-1-afm`. Migração **156**. Base do teste de tela aprovada = d991bfe (homologação passou com 0 divergência, run 40604234062). O `homolog` está preso à worktree C:/tmp/homolog-v711; NUNCA mesclar o homolog na main.

**Feito:** servidor (afm.js, afmDb.js, GestaoAFM, rotas de reunião/justificativa/batismo/comissões), tela (app/modulos/afm.js, SW v42), docs (fase-8 "Como ficou", README 599 linhas, INDICE). Provas: jest 6.082; LocalDB e2e-47 212, e2e-48 104, e2e-49 19, e2e-50 48 (`bash rodar.sh preparar-afm`); tela tools/front-afm 80 (contrato real gravado pelo e2e-47 com E2E_CONTRATO=1). Duas revisões independentes aplicadas (crítico do servidor = Dirigente podia excluir a CLI inteira abrindo/encerrando 3 reuniões → agora só o nível geral).

**Decisões que tomei e ELE pode mudar (contadas no relatório):** integrada conta para a CLI (Art. 69); justificada interrompe; Extraordinária não conta; Seminário de novembro só AFM (Art. 70 §1º); só contam reuniões abertas depois da v8.1; uma reunião que conta por dia + "não conta falta"; ninguém justifica a própria falta; exclusão não fecha cadeira nem tira acesso; presença por senha da sala continua.

**Ação humana:** cadastrar Reitor e docentes, conferir níveis dos oficiais, compor a CDER.

**Armadilhas:** citei "Art. 310" que era NÚMERO DA LINHA do regimento (certo: Art. 56 §2º) — conferir artigo pelo texto; o shell comeu `\*` e `\.` em heredoc (escrever scripts com Write); depois de excluído a pessoa não acumula faltas (sessões seguintes são "quebra"). Ver [[v79-movida-para-v81]], [[urls-producao-e-homologacao]].
