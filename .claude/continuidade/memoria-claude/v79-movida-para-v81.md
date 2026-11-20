---
name: v79-movida-para-v81
description: "A v7.9 (CLI: faltas e perda de assento, Art. 27) foi movida na íntegra para a v8.1 (AFM) em 15/10/2026 por ordem do responsável; a fase 7 segue na v7.10; ponto de projeto em aberto sobre sessões integradas com a AFM"
metadata:
  node_type: memory
  type: project
  originSessionId: dccbed28-b381-4d4e-99d0-06df344d741a
  modified: 2026-10-15T21:09:10.286Z
---

Em 15/10/2026 o responsável mandou **não pular a v7.9: copiar na íntegra para a fase 8 e fundir com a v8.1** ("a v8.1 vai ficar uma mega fase"). Feito e no `main` (commit 9c0800e): o texto original (3 itens: 3 faltas consecutivas = perda de assento; §2º apreciação/AGE de destituição; taxonomia fechada de justificativa, Art. 149 §2º) está em `docs/plano/fase-8-ministerial-afm.md`, subseção "Absorvido da antiga v7.9" dentro da v8.1 (índice: v8.1 = 0/8 itens). Na fase 7 ficou só um aviso curto no lugar da v7.9; README e fase 2 apontam para a v8.1.

**Why:** a contagem de faltas da CLI depende de saber quais sessões são também da AFM (Art. 69), então só faz sentido construir junto com o módulo da AFM.

**How to apply:** a próxima versão a construir na fase 7 é a **v7.10** (check-in infantil), depois a Trava 7-B antes da v7.11. **Ponto em aberto que NÃO decidi (é do responsável):** o texto da v7.9 diz "excluindo as integradas com AFM" (sessão da AFM não conta falta); a "Nota (v0.3)" da fase 2 diz que faltas da CLI e da AFM somam no mesmo contador de 3. As duas redações foram preservadas; escolher antes de implementar a v8.1. Ver [[v78-incidentes-protecao]] para o estado da fase 7 e [[readme-enxuto-historico-em-docs]] (README precisa ficar < 600 linhas; está em 599, então toda mudança futura no README deve ser compensada movendo texto para docs/plano).
