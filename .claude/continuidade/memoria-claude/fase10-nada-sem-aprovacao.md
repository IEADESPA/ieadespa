---
name: fase10-nada-sem-aprovacao
description: "FASE 10 — nada vai para a produção sem ele VER e aprovar (literalmente nada); toda tela com no mínimo 3 e até 5 opções, claro e escuro; aprova pela homologação ou pelo artefato"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-13T17:40:04.252Z
---

Na FASE 10, **nenhuma mudança de tela, cor, texto ou comportamento vai para a `main`/produção sem ele ver e dizer "aprovado"**. Ele vê no link da homologação (eu mando o link) ou na página de propostas (artefato). Toda tela e toda situação: **mínimo 3, até 5 opções** (tela e cor), sempre claro + escuro — inclusive depois que ele já escolheu a linha geral (módulo, submódulo, formulário... cada um com as suas opções).

**Why:** 11/11/2026, ditado por ele: "a IA é sempre tendente ao erro"; vendo opções antes, erro se corrige antes e ele pode trazer algo melhor; "senão nós vamos nos quebrar e o negócio não vai para frente". Ele mandou parar o desenho para registrar isso. Está escrito como "Regras de aprovação desta fase" no topo de `docs/plano/fase-10-experiencia-design-performance.md`.

**Da rodada 4 em diante (12/11/2026): ele aprova JUNTO com o Presidente** — os dois olham e respondem juntos ("se tiver mudança, já é o Presidente que quer"), para não refazer depois. As respostas no artefato podem vir dos dois.

**Votações vinculantes: FEITO (13/11/2026).** Ele aprovou pela explicação, sem abrir a homologação ("se tu já testou, pode subir") — quando ele não puder abrir a homologação, explicar em português simples com exemplo e perguntar se pode subir. Merge 4fdb47e (revert -m 1 4fdb47e), migração 173 em produção sem aviso de votação antiga, casca v59. O preparo da base cenario-pastoral agora aplica a 173 (e2e-31/32/39 passam pelo GestaoEnquetes).

**Correções que ele aprova direto (não passam pela homologação):** defeito pedido por ele em conversa ("pode corrigir") vai à main na hora, com a prova completa (jest inteiro + e2e LocalDB + prova no navegador quando mexe em tela) — ex.: 13/11 lista de pessoas no banco + Cadastrar Pessoa em branco (0118594). Mudança de DESENHO de tela continua precisando das opções e do OK dele.

**How to apply:** a regra 1 do CLAUDE.md (push na hora) continua para as anotações do plano/docs; código que muda o sistema ou o site na FASE 10 vai primeiro para a homologação (ramo `homolog`, ver [[urls-producao-e-homologacao]]) e só entra na `main` depois do OK dele, vendo. Nunca "aprovar por ele". A página de propostas precisa ser clicável (escolher tela → opção 1–5 → prévia claro/escuro), não o quadro grande — ver [[propostas-de-tela-em-artefato]].
