---
name: v714-identidade-visual
description: v7.14 Identidade Visual Anual (Art. 159) — decisões dele de 22/10/2026; primeiro ciclo = identidade 2027, sugestões abrem 1º/11/2026 (tem de estar no ar antes)
metadata:
  type: project
---

Decisões do responsável (22/10/2026): (1) não existe lista de temas já usados desde 2006 → tela "Temas já usados" e a Secretaria cadastra; (2) vota todo membro apto e em comunhão pelo Meu Painel; (3) **pedidos de uniforme FORA** — a camiseta do ano já é pedida e tratada na aba Camisetas do SITE (membro/responsável pede; Dirigente só avisa e entrega); não fazer "pedido do Dirigente vira conta a pagar".

Prazo: o 1º ciclo (identidade 2027) abre sugestões em **1º/11/2026** → publicar antes. Ramo `v7-14-identidade-visual` (worktree C:/tmp/v714-wt). Art. 159 está em regimento_interno_2026.txt linhas 1990-2025; Art. 126-Q II (só o Geral define identidade). Enquetes (v2.8, migração 034) não têm abertura/fechamento por data nem voto em Meu Painel — a v7.14 acrescenta. Ver [[v713-eventos-no-site]].

**Parado em 22/10/2026 à noite** a pedido dele ("para o serviço por hoje"): só o contrato está no ramo (`85fc73f`, já no GitHub); a implementação NÃO começou. Retomar: implementar conforme o contrato (migração 151, shared/identidadeVisual.js, Db, rota, Meu Painel vota em enquetes, aba da Diretoria, e2e-31/32, tools/front-identidade), revisão adversarial, homologação e produção **antes de 1º/11/2026**.

**23/10/2026:** ele retomou ("pode continuar") e avisou que **não há prazo de 1º/11**: o processo deste ano (identidade 2027) já está sendo feito fora do sistema; o 1º ciclo no sistema é o de **novembro de 2027 (identidade 2028)** — trabalhar com calma. O ciclo do ano é aberto pela Diretoria (não criar ciclo sozinho).

**EM PRODUÇÃO desde 27/10/2026** (merge `1604e66`; reverter = `git revert -m 1 1604e66`; migração 151; casca v40; base do teste de tela = d18db55, zero divergência na homologação; a e2e-33 dela virou e2e-39).
