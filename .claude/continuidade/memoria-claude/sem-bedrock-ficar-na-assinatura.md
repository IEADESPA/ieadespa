---
name: sem-bedrock-ficar-na-assinatura
description: 18/11 ele desistiu de usar créditos da AWS (Bedrock/Cline) para os agentes — não compensa; ficar só na assinatura daqui; não reabrir
metadata:
  node_type: memory
  type: user
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-18T19:33:44.181Z
---

Em 18/11/2026 ele pensou em usar o patrocínio da AWS para ONGs (US$ 1.000) para rodar o Claude pelo Amazon Bedrock
(ou pelo Cline) quando a cota da assinatura acabar. Depois da estimativa, **desistiu**: "não compensa… melhor deixar
quieto e ficar apenas por aqui mesmo".

**A estimativa que pesou:** uma hora de agente pesado sai a uns US$ 10–20, então US$ 1.000 dariam de 50 a 100 horas; a
varredura completa do sistema comeria cerca de 70% disso. Além disso, os créditos promocionais talvez nem cubram o Claude,
que é vendido pelo AWS Marketplace.

**Why:** rende pouco para o tamanho do trabalho, e o risco de cobrança no cartão existe.

**How to apply:** não propor de novo Bedrock, Cline nem API paga como saída para a cota, a menos que ele traga o assunto.
O ritmo segue preso à cota de 5 horas da assinatura: priorizar e alternar ([[ritmo-e-limites-de-uso]]). O como fazer, se
um dia ele mudar de ideia, está na documentação oficial do Claude Code no Bedrock (`/setup-bedrock`).
