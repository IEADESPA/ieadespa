---
name: v710-checkin-infantil
description: "v7.10 Check-in infantil com cadeia de custódia (+ portão da EBD) e Trava de Revisão 7-B — mesclados na main em 20/10/2026 (merge e5acfdc, migrações 145, 146, 147); o que ficou com o responsável e as armadilhas"
metadata:
  node_type: memory
  type: project
  originSessionId: dccbed28-b381-4d4e-99d0-06df344d741a
  modified: 2026-10-20T19:19:45.185Z
---

**Entregue em 20/10/2026** — v7.10 e a 🔒 Trava 7-B no mesmo merge (`e5acfdc`, `git revert -m 1 e5acfdc` reverte). Migrações 145 (check-in), 146 (proteção: `IncidentesProtecao.EnvolvidoDaLideranca`, gatilho que só liga) e 147 (MENORES_VISTORIAS_A_RENOVAR obrigatória + regra CHECKIN_SAIDA_OBRIGATORIA). Ramo `v7-10-checkin-infantil`, worktree `C:/tmp/v710-wt` (pode ser apagado depois de conferida a produção). Próxima versão: v7.11 (cuidado pastoral).

**Decisões do responsável (20/10):** (1) aviso ao responsável cadastrado quando um TERCEIRO traz ou retira a criança = SIM, feito. Em 21/10 ele decidiu NÃO fazer as cinco ("deixa como está"; saíram dos planos): dois olhares na retirada comum; reentrada na sala depois da janela; afastado cautelar que traz/retira o próprio filho virar divergente; exigir membro leigo nas decisões do Comitê; devolver o caso ao Dirigente depois de vincular a matrícula. Só ação humana resta: marcar as turmas da EBD "com menores" e cadastrar o Comitê. NÃO reabrir esses itens.

**Trava 7-B — o que mudou (2 altos, 14 médios, 11 baixos):** aviso obrigatório só conta como entregue se saiu do app (`notificarAgora` devolve `externas`; e-mail aceito ou push) — senão `semAviso`/alerta; gestão do check-in com pendência reservada (afastamento etc.) perde a gestão; autorizado "por ficha" pede 428 e toda inclusão avisa os responsáveis; quem perde a aptidão com a sala aberta sai da sala (aviso CHECKIN_SAIDA_OBRIGATORIA); portão da EBD a cada ato (adulto + apto); texto da lei = comunicar IMEDIATAMENTE (ECA 13 e 70-B; Lei 14.344/2022), 24 h é o prazo máximo interno; caso só no nível geral se o envolvido é da liderança local ou não tem matrícula; exclusão LGPD apaga a saúde e revoga consentimentos/autorizações; saúde do visitante só com PAI/MAE/TUTOR; busca de criança por POST; `registrarAuditoria` com UPDLOCK/HOLDLOCK (cadeia não bifurca).

**Prova:** 19 baterias e2e no LocalDB recriado do zero (0 falhas), tela do check-in 1.488 + 648 mutações (645 acusadas, 3 equivalentes), front-protecao 808, front-menores 322, Edge limpo, homologação (teste de tela 1.052 + 142 ações, 4 provas em navegador).

**Armadilhas desta rodada:** a prova de mutação engolia a RAM (mutante que gira sem fim) e derrubou o notebook com tela azul 0x10E — agora cada mutação roda num processo com teto (`--max-old-space-size=2048`, cerca de 2,4 GB, tempo de parede) e o vigia `C:/tmp/vigia-memoria.ps1` mata a prova abaixo de 900 MB (o anúncio de lote dele não funciona; só o de memória); jest sempre `--maxWorkers=2` quando há outra coisa rodando; `C:/tmp/caixa-preta.ps1` grava RAM/GPU a cada 20 s. `node -e` no shell come `\` e chegou a gravar um BACKSPACE (0x08) num regex de teste — editar com Edit/Write. Arquivos com CRLF não casam âncora com `\n` em script node: usar Edit. Comentário `//` no meio de uma linha com várias instruções engole o resto (usar `/* */`). `$e` dentro de string do PowerShell some: laço em arquivo .sh. O `navegador.js` precisa de `PUPPETEER_CORE` apontando para o puppeteer-core da cópia principal (`tools/csp-e2e/node_modules`).
