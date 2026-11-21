---
name: ritmo-e-limites-de-uso
description: "Em sessões longas autônomas o responsável pede pausas (ex.: 40 min) para não esgotar os limites de uso; pausar com Monitor (até 30 min, re-armar), nunca com sleep encadeado"
metadata:
  node_type: memory
  type: feedback
  originSessionId: da91e9b0-03ac-4d66-b670-429112727baa
  modified: 2026-10-06T22:33:28.941Z
---

Em 06/10/2026, numa sessão autônoma de ~4 h ("rode tudo até eu voltar"), o responsável interrompeu com "faça uma pausa de 40 minutos para não gastar todos os limites de uso" — os créditos recarregam nesse intervalo.

**Why:** o plano de uso tem limite por janela de tempo; uma sessão longa com muitas chamadas de ferramenta esgota a janela e para o trabalho de vez.

**How to apply:** em trabalho autônomo longo, ser econômico (menos verificações redundantes, saídas filtradas) e, se ele pedir pausa, parar de verdade: `Monitor` com um laço `until` até o horário-alvo (máximo 30 min por arme; re-armar o restante). `sleep` longo em primeiro plano é bloqueado pelo ambiente. Antes de pausar, deixar o estado publicado (commit + push) e dizer o horário de retomada. Ver [[nada-em-aberto]].
