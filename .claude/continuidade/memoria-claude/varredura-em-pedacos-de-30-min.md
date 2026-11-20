---
name: varredura-em-pedacos-de-30-min
description: "19/11 ele quer a caça de defeitos (e trabalhos longos) em pedaços de 30 min por agente, para a cota acabar perdendo no máximo 30 min; plano no fase-10"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-19T17:30:40.112Z
---

Em 19/11/2026 ele pediu que a varredura de defeitos rode com VÁRIOS agentes, cada um com no máximo 30 minutos de
trabalho, repartindo os lotes ainda mais. Se a cota acabar no meio, perde-se pouco.

**Why:** a cota de 5 horas já parou agentes no meio várias vezes (18 e 19/11), e trabalho longo perdido custa caro.

**How to apply:**
- Fatiar o trabalho em pedaços de ~30 min. Cada agente olha a hora no início, para aos 25 min e grava o que achou ou
  fez (arquivo + `memoria-projeto`) antes de terminar.
- A conferência dos achados e as correções também em pedaços.
- O plano (cerca de 26 pedaços, de 2 a 4 por dia, encaixados na construção) está no plano da fase 10, seção "Como a
  varredura vai rodar". Ele diz quando começa.
- Vale como ideia também para construções longas: dividir em incrementos curtos com commit a cada um.

Ver [[ritmo-e-limites-de-uso]], [[habilidades-de-design-instaladas]].
