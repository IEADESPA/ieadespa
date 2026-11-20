---
name: v715-crise-porta-voz
description: v7.15 Gestão de crise e porta-voz único (Art. 161-B) — em paralelo com a v7.14 desde 23/10/2026 a pedido dele; divisão de números e a trava do LocalDB entre os dois trabalhadores
metadata:
  type: project
---

23/10/2026: ele pediu para trabalhar a v7.15 em paralelo com a v7.14 ("uma não tem nada a ver com a outra; não podemos perder tempo"). Contrato no plano (ramo `v7-15-crise-porta-voz`, worktree C:/tmp/v715-wt, commit ecccdc7): regime de crise (só o nível geral `crise_gestao`, confirmação reforçada, porta-voz = Presidente ou profissional designado), aviso a todos os líderes (sininho+celular na hora, e-mail pela fila da v7.12), manifestações e demandas de imprensa (sem editar), plano de emergência, simulados, vistoria predial com AVCB (ImoveisSituacaoFiscal) e seguro (ApolicesSeguro), equipe de segurança (`seguranca_congregacao`).

Divisão para não colidir: v7.14 = migração 151, e2e-31/32, SW v38, tools/front-identidade; v7.15 = migração 152, e2e-33/34, SW v39, tools/front-crise, app/modulos/crise-seguranca.js. Os dois usam o MESMO LocalDB: trava `mkdir C:/tmp/localdb-trava` (até conseguir) e `rmdir` ao terminar a sequência restaurar→aplicar→e2e. Ao juntar: v7.14 primeiro, depois v7.15 (resolver README, INDICE, index.html, script.js, SW e frontCsp). Ver [[v714-identidade-visual]].

**Pedido dele (23/10/2026):** assim que a v7.14 e a v7.15 estiverem no ar e tudo ok, fazer a **🔒 Trava de Revisão 7-C** (audita v7.11–v7.15 pelas 5 perguntas + varredura da Fase 7 inteira, atenção a menores v7.7/7.8/7.10 e ao consentimento da v7.12; molde da 7-B: duas revisões independentes — costuras entre versões e lei/plano/README —, tudo corrigido com teste, rodada completa do teste de tela `completo=sim` com zero divergência) e **encerrar a Fase 7** (depois vem a Fase 8). Estado em 23/10: v7.15 fechada (ramo c5082c0 + base de tela aprovada) em homologação; v7.14 corrigindo os achados da revisão.

**EM PRODUÇÃO desde 23/10/2026** (merge `2aca0ba`; reverter = `git revert -m 1 2aca0ba`; migração 152 aplicada; SW v39; base do teste de tela = c5082c0, zero divergência em produção). A v7.14 passa a usar SW **v40** ao entrar depois.
