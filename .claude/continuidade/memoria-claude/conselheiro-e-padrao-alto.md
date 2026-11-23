---
name: conselheiro-e-padrao-alto
description: "23/11: alto padrão (é obra de Deus): o conselheiro Fable sobre o Opus FUNCIONA no VS Code (sem custo extra no plano dele); agentes padrão, ganchos de proteção e fluxos com muitos agentes quando ajudar"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-23T13:10:00.000Z
---

Em 23/11/2026 ele trouxe dois guias de fora (Avora AI: o conselheiro Fable 5.2 e "os 8 níveis da IA") e pediu para
adaptar à bancada, como padrão de todos os repositórios: "isso aqui é um centro de igrejas para a obra de Deus, então
nós precisamos de um alto padrão. Não podemos fazer as coisas de qualquer maneira."

Decisões dele (23/11):

- **Conselheiro** (`advisorModel: "fable"`: o Opus trabalha e o Fable aconselha antes de decidir o caminho, quando um
  erro se repete e antes de dar como pronto): testado neste computador e **funciona no VS Code**. Na escolha do Fable
  **não apareceu aviso de créditos**: está no plano dele. Dando certo nas próximas conversas, a bancada leva a todos.
- **Agentes padrão na bancada** (construtor, desenhista e revisor no Fable): sim.
- **Ganchos de proteção na bancada** (barrar `git add -A`, ler sem máscara o arquivo que aponta para a produção, levar
  o homolog para a main, navegador sem `--disable-gpu`): sim.
- **Nível 8, os fluxos com muitos agentes (Workflow):** autorizados nas Travas de Revisão e **"sempre que for ajudar,
  é interessante ter mais de 3 agentes"**. É a exceção ao limite de 3 de [[desenho-em-paralelo-a-construcao]].
- **A varredura de defeitos:** planejar agora, para rodar com o revisor no Fable depois que os agentes padrão estiverem
  instalados; mostrar o plano a ele antes de rodar.

**Why:** qualidade que não depende de alguém lembrar a regra; o modelo mais forte nas decisões e na revisão.

**How to apply:**

- Fatos conferidos na documentação oficial (23/11): a chave é `advisorModel`; os subagentes herdam o conselheiro; um
  agente em `.claude/agents/*.md` aceita `model: fable`.
- Teste de 23/11: ele rodou `/model fable`, `/model opus` e `/advisor fable`; a ferramenta `advisor` apareceu. A
  conversa em que foi ligado mantém o Opus 5.5 como conselheiro até `/clear` ou `/compact`; o Fable vale da próxima
  conversa em diante. Agentes lançados antes da troca não usam o Fable.
- Antes de um fluxo com muitos agentes, dizer a ele em uma linha o que vai rodar e quantos agentes.
- O aceite de pagar em créditos é dele, nunca meu.
- Ficaram para depois: times de agentes (experimental), o Claude no GitHub (repositório público, token só ele põe), os
  Projetos na nuvem (o trabalho depende deste computador: LocalDB, Edge, Azure, a bancada).
