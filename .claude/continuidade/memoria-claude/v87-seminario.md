---
name: v87-seminario
description: "v8.7 Seminário como sistema acadêmico EM PRODUÇÃO desde 30/10/2026 (revert -m 1 81a2548); migração 163, casca v49; decisões que ele pode mudar; armadilhas; próxima = Trava 8-B"
metadata:
  node_type: memory
  type: project
  originSessionId: 28922282-7bd5-4337-97ac-354437859a13
  modified: 2026-10-30T20:43:37.616Z
---

v8.7 (o Seminário como sistema acadêmico, Regimento Art. 66, 68, 70 §2º, 72) EM PRODUÇÃO desde 30/10/2026: merge `81a2548` (desfazer = `git revert -m 1 81a2548`), registro "Como ficou a v8.7" em docs/plano/fase-8-ministerial-afm.md. Base do teste de tela aprovada = 1db4a40 (homologação 41112302426 sem divergência). Provas: jest 6.227, e2e-66 159, e2e-67 12, tela tools/front-seminario 85 (28 mutações). Próxima = Trava 8-B (fecha a FASE 8). **Pausado em 30/10/2026 a pedido dele** ("na próxima rodada verificamos a fase 8 e já faz a trava"): ao retomar, conferir primeiro o teste de tela da produção (run 41122712170, do merge 81a2548; o deploy e o deploy dos docs 7b893bb passaram) e depois abrir a Trava 8-B.

**Desenho:** 4 cursos = níveis do Art. 72; disciplinas/pré-requisitos; matrícula no curso (exige matrícula AFM ativa); turma com docente em exercício e regra congelada; só turma ENCERRADA vale; docente lança/encerra a própria turma (Minha Formação); aproveitamento com parecer do Reitor/docente; conclusão → diploma DIPLOMA_AFM; declaração (30 dias) e histórico (fotografia com selo do conteúdo no título, conferido na verificação pública). A escada/AFM/CEI leem o nível também do histórico (pares; `afm.avaliarNivel(cargo, nivel, concluido, doHistorico)`). Requisito de formação pode exigir disciplina (AFMDisciplinaRequisitos; NÃO no HABILITACAO_TREINAMENTO).

**Decisões por interpretação (ele pode mudar):** 4 cursos fixos; nota 7,0 / 75%; só turma encerrada conta; reabrir só nível geral; parecer de Reitor/docente; declaração 30 dias; histórico emitido não muda; nível manual continua valendo; aviso Art. 70 §2º por curso sem travar; histórico escolar fica (LGPD anonimiza).

**Why:** retomar sem refazer. **How to apply:** armadilhas — (1) commitar algo na main e voltar ao ramo da versão faz o arquivo SUMIR da pasta do notebook (ele reclamou: "era pra estar no notebook"): depois de commitar na main, juntar a main no ramo atual (`git merge main`) ou commitar no ramo atual; (2) o teste de CSP exige `argsAttr(...)` literal no `data-args-click` (atalho local é recusado); (3) o banco falso dos testes (criarPoolFalso) acusa consulta a mais: cada requisito de disciplina = uma resposta `[]` a mais na fila; (4) bases antigas do LocalDB sem a 163: guardar com `OBJECT_ID` (Meus Dados quebrou o e2e-24). Ver [[v86-educacao-continuada]], [[trava-8a]].
