---
name: trava-8a
description: "Trava 8-A (audita v8.1–v8.4) FECHADA e EM PRODUÇÃO 29/10/2026 (revert -m 1 b8af4e1), migração 160, casca v46; regra única de habilitação; decisões dele de 29/10 (Art. 77 carência, CIADSETA p/ outra convenção, licença de candidatura) já aplicadas; armadilhas da ferramenta; próxima = v8.5"
metadata:
  node_type: memory
  type: project
  originSessionId: 28922282-7bd5-4337-97ac-354437859a13
  modified: 2026-10-29T16:32:05.777Z
---

Trava 8-A fechada e em produção desde 29/10/2026: merge `b8af4e1` (desfazer = `git revert -m 1 b8af4e1`), registro em docs/plano/fase-8-ministerial-afm.md. Migração 160 (CEIRecusouEm, Consagracoes.Convencao*, motivos DISCIPLINA/LICENCA_CANDIDATURA/SAIDA_DO_ROL/… no encerramento, retenção). Casca SW v46. Provas: e2e-47..61 = 1.018 verificações; e2e-61 (90); tela front-consagracao 116; teste de tela produção 40880685665 e homologação 40900701520 (0 divergência).

Peças novas: `api/shared/habilitacao.js` (MARCAS_DISCIPLINA + situacaoMinisterial) e `afm.licencaLiturgica` = regra ÚNICA de "pode oficiar" (batismo, Comissão de Unção, QR). Readmissão = DataAdmissao posterior à exclusão, só nível geral (`disciplina.foraDaReadmissao`). CIADSETA obrigatória p/ Evangelista/Pastor antes da cerimônia (inclusive OUTRA_CONVENCAO).

**Decidido por ELE em 29/10/2026 (em produção, merge 2d291e8; não reabrir):** (1) Art. 77 — TODA suspensão terminada deixa o obreiro em Carência Administrativa, fora das funções, até a Prova de Reintegração (`disciplina.CARENCIA_SQL`; a prova só depois do prazo; o processo em carência fica na lista). (2) CIADSETA também para quem vem de outra convenção. (3) Licença de candidatura (Art. 157 §2º) afasta das funções e da liderança (Assentos/Liderança), mas NÃO tira título/histórico/CHM nem trava processos de consagração. Ainda por interpretação (ele pode mudar): exclusão pendente do CEI já afasta das funções; celibato "reconhecido pela Convenção" só no parecer; minimização apaga também Integração/Reintegração. v8.6 ganhou Art. 68 §3º e Art. 70 §3º.

**Why:** contexto da fase 8 e para não reabrir. **How to apply:** CONDICAO_SQL_ATIVO tem colunas SEM alias — nunca juntar MembroReferencia na mesma consulta (Status fica ambíguo; use subconsulta qualificada). PoliticasRetencao: Categoria ≤ 60, BaseLegal ≤ 300 caracteres. `rodar.sh` agora para se a base ou a migração não ficar pronta (antes falhava calado e a bateria rodou sobre base suja); roteiros da v8.1 rodam com BASE=cenario-escada. O ajudante `homologar()` do lib-escada registra a CIADSETA por padrão ({ciadseta:false} para provar a exigência). Ver [[v84-credencial-digital]].
