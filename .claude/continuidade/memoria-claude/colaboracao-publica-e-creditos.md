---
name: colaboracao-publica-e-creditos
description: "20/11 decisões dele sobre créditos (esforço máximo sempre; resumir a conversa mais cedo; manter o plugin Nonprofits) e colaboração (tudo no repositório PÚBLICO, só o seguro, porque o privado estoura os minutos do GitHub)"
metadata:
  node_type: memory
  type: user
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-20T19:46:52.246Z
---

Em 20/11/2026, depois da pesquisa de créditos e colaboração (`C:/tmp/ieadespa-desenho-fontes/pesquisa-creditos-e-colaboracao.md`):

**Créditos:**
- **Esforço: NÃO reduzir.** Fica no máximo para tudo: "se já começa bom do início, é melhor do que depois ficar
  corrigindo".
- **Resumir a conversa mais cedo: SIM**, ele achou interessante.
- **O plugin Claude for Nonprofits fica ligado:** "somos uma organização, é para usar ao máximo".
- **Caveman: não.**
- Ele achou a pesquisa estreita e pediu outra sobre os projetos de "resumo/grafo do código" (graphify, claude-mem, RTK e
  outros), que prometem de 6 a 7 vezes menos gasto. Ficou em `pesquisa-economizadores.md`.
- **Enxugar a memória:** ele perguntou como seria. Explicar antes de fazer: encurtar as linhas do índice MEMORY.md, sem
  apagar fato nenhum.

**Colaboração:**
- **Vai tudo para o repositório PÚBLICO, só o que é seguro.** Um repositório privado já estourou os minutos do GitHub
  Actions do mês num único dia (300+ commits).
- O objetivo: o colega da organização puxa e continua EXATAMENTE do ponto A, sem linhas do tempo paralelas, com os
  mesmos plugins, habilidades, regras, servidores e fluxos. Depois instala os de segurança e verifica o código.
- Os Artifacts são seguros, porque só a organização acessa.
- Isso muda a decisão de 17/11: o `HANDOFF.md` e a memória passam a poder ir para o Git, sem senha, CPF nem endereço.

**Senha:** a regra de permissão com a senha do PostgreSQL do ASAF foi apagada de `~/.claude/settings.json` em 20/11, com
o OK dele. Ele não vai trocar a senha agora.

Ver [[varredura-em-pedacos-de-30-min]], [[habilidades-de-design-instaladas]], [[sem-bedrock-ficar-na-assinatura]].

**Pesquisa 2 (20/11, `C:/tmp/ieadespa-desenho-fontes/pesquisa-economizadores.md`):**
- Os "6 a 7 vezes" (code-review-graph, graphify) comparam com "ler o projeto inteiro", o que ninguém faz. No nosso caso
  renderiam de 0 a 5%.
- **O que mais pesa:**
  - 22% são agentes do tipo FORK, que herdam a conversa inteira do chefe;
  - 19% é o raciocínio guardado;
  - 9,5% é a parte fixa;
  - só ~11% é a leitura de arquivos.
- **Regra de trabalho:** NUNCA usar fork em tarefa longa. Usar um agente novo (general-purpose) com um resumo escrito
  (estimativa: de 10 a 20% a menos). O fork só em tarefa curta.
- **Próxima economia:** o mapa do sistema, com um CLAUDE.md curto por pasta e resumos do plano e do README.
- O teste do graphify ficou como "talvez", isolado e só se ele quiser.
- Descartados: GrapeRoot (fechado, com telemetria), claude-mem (telemetria, 9 ganchos), claude-context (manda o código
  para fora) e Token Optimizer (licença).
