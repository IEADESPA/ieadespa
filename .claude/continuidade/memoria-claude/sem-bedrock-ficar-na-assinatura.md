---
name: sem-bedrock-ficar-na-assinatura
description: 18/11 ele desistiu de usar créditos da AWS (Bedrock/Cline) para os agentes — não compensa; ficar só na assinatura daqui; não reabrir
metadata:
  node_type: memory
  type: user
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-23T19:48:04.728Z
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

**23/11/2026, ele trouxe o assunto: os créditos de API dos assinantes.** São cerca de US$ 120 por mês, do plano Team de
organização sem fins lucrativos, e ele já os resgatou. A página oficial
(platform.claude.com/docs/en/about-claude/api-credits-for-subscribers) diz:
- **não valem no Claude Code** ("Claude Code: No"); valem na API, no **Agent SDK** e no Playground;
- vencem todo mês, sem acumular;
- sem cartão na organização do Console, nada é cobrado: o serviço para quando o crédito acaba.

Decisão dele: um "revisor de fora" na bancada, pelo Agent SDK, faz a varredura do sistema inteiro com esses créditos,
enquanto a assinatura fica com o desenhista e o construtor. Os relatórios ficam só na bancada privada. A chave da API
nunca vai para o ambiente do usuário: com `ANTHROPIC_API_KEY` no ambiente, o próprio Claude Code larga a assinatura. Não
é a "API paga" recusada acima: é crédito que já vem no plano, sem cartão.
