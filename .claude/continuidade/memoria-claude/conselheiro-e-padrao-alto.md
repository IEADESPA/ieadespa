---
name: conselheiro-e-padrao-alto
description: "23/11: ele quer alto padrão (é obra de Deus): o conselheiro Fable sobre o Opus (testar aqui antes de levar a todos), agentes padrão e ganchos de proteção na bancada"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-23T12:30:00.000Z
---

Em 23/11/2026 ele trouxe dois guias de fora (Avora AI: o conselheiro Fable 5.2 e "os 8 níveis da IA") e pediu para
adaptar à bancada, como padrão de todos os repositórios: "isso aqui é um centro de igrejas para a obra de Deus, então
nós precisamos de um alto padrão. Não podemos fazer as coisas de qualquer maneira."

Decisões dele (23/11):
- **Conselheiro** (`advisorModel: "fable"`, o Opus trabalha e o Fable aconselha nas horas difíceis): **testar primeiro
  neste computador**; dando certo, a bancada leva a todos.
- **Agentes padrão na bancada** (construtor, desenhista e revisor no Fable): sim.
- **Ganchos de proteção na bancada** (barrar `git add -A`, ler sem máscara o arquivo que aponta para a produção, levar
  o homolog para a main): sim.

**Why:** qualidade que não depende de alguém lembrar a regra; o modelo mais forte nas decisões e na revisão.

**How to apply:**
- Fatos conferidos na documentação oficial (23/11): a chave é `advisorModel`; os subagentes herdam o conselheiro; um
  agente em `.claude/agents/*.md` aceita `model: fable`. NÃO confirmado: o conselheiro na extensão do VS Code; o preço
  (pode sair dos créditos de uso, à parte) — o "50% do limite semanal" do guia não está na documentação.
- O aceite de pagar em créditos é dele, nunca meu.
- Ficaram para depois: times de agentes (experimental), o Claude no GitHub (repositório público), os Projetos (beta).
- Ver [[desenho-em-paralelo-a-construcao]].
