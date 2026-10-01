# FASE 12 — Inteligência, Indicadores e Benchmarking

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

Fase nova (7ª rodada). Só faz sentido **depois** que as fases 5-9 estiverem
gerando dado — mas entra no roadmap agora porque muda decisões de modelagem lá
atrás: se ninguém souber que vamos comparar congregações, os dados nascem sem os
campos que tornam a comparação possível.

**Por que isso é um diferencial real e não "mais um dashboard":** nenhum ChMS
internacional tem a hierarquia territorial (Congregação → Área → Região →
Quadrante → Distrito) que este sistema já modelou desde a v0.1, e nenhum deles
tem o nível de detalhe financeiro da FASE 4. A combinação das duas coisas permite
uma análise que os produtos de referência não conseguem entregar.

## v12.1 — Indicadores de saúde por congregação

- [ ] **Métricas em razão, não em valor absoluto** — é o que permite comparar uma
      congregação de 80 membros com uma de 900 de forma justa: % de membros em
      classe de EBD ou grupo, % servindo como voluntário, % que contribuiu ao
      menos uma vez no trimestre, contribuição por frequentador, taxa de retenção
      de visitante. *(The Unstuck Group; Carey Nieuwhof; Lifeway Research)*
- [ ] **Indicador antecedente**: crescimento de voluntários costuma anteceder
      crescimento de contribuição em 6 a 12 meses — é o alerta que chega cedo o
      bastante para agir, diferente do caixa, que avisa quando já aconteceu.
- [ ] Série trimestral com tendência, não foto do mês.
- [ ] Conecta com o PSC (v7.1): os 5 Sinais Vitais deixam de ser avaliação
      declaratória anual e passam a ter lastro em dado real do sistema.

## v12.2 — Benchmarking interno anonimizado

- [ ] Cada Dirigente vê a **própria** congregação em detalhe e as demais **apenas
      como percentil** — a comparação continua útil e para de alimentar disputa
      política interna, que é o motivo pelo qual comparação entre igrejas
      normalmente fracassa. *(Gloo + Barna ChurchPulse)*
- [ ] Ranking por Área/Região para quem tem escopo territorial (Pastor de Área vê
      as suas congregações nominalmente — é a função dele).
- [ ] Recorte por porte, não só por território: comparar com pares do mesmo
      tamanho, não com a Sede.

## 🔒 Trava de Revisão 12-A — antes de avançar para a v12.3

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v12.1 e v12.2 pelas 5 perguntas do checklist.

## v12.3 — Engajamento e alerta precoce de evasão

- [ ] **Score de engajamento** por membro cruzando o que o sistema já tem:
      presença (FASE 2/6), contribuição (FASE 4), participação em departamento
      (FASE 5), serviço voluntário (v5.7), participação em assembleia.
- [ ] Alerta de queda **relativa ao próprio padrão** da pessoa (v7.11), abrindo
      item na fila de cuidado pastoral antes de virar caso de Abandono (v1.5) —
      transforma a perda de membro de constatação administrativa em sinal
      antecipado. *(Pushpay Insights)*
- [ ] Estritamente interno e restrito por papel: é informação pastoral sensível,
      não ranking de membro. Sem exposição ao próprio membro, sem uso disciplinar.

## v12.4 — Painel executivo denominacional

- [ ] Visão de Campo para Presidente/CLI/Diretoria: crescimento, saúde
      financeira, conformidade (v7.7, v5.4, v4.19) e execução do PDQ (v4.8) num
      só lugar.
- [ ] **Semáforo de conformidade por congregação** — quem está com balancete,
      habilitação de voluntário, AVCB, prestação de contas e relatório
      departamental em dia. Uma linha por congregação, três cores.
- [ ] Exportação do conjunto para a prestação de contas anual da Assembleia
      (Art. 36 §1º), reaproveitando as demonstrações da v4.9.

## 📌 Pendência entre fases — Trilha de discipulado (self-service, vB.5)

A vB.5 (Portal do Membro) previa "minha trilha de discipulado" no
autoatendimento — não dá pra construir porque **não existe nenhum módulo de
discipulado/formação no sistema hoje** (nem tabela, nem tela, em nenhuma
fase anterior). Fica registrado aqui, na última fase do roadmap
comprometido até agora, porque não tem outro lugar melhor: se um dia surgir
uma fase de discipulado/formação de membro, ela nasce **já sabendo** que
precisa expor isso na área de autoatendimento (mesma infraestrutura de
login/PWA/push da vB.5, sem versão nova de portal). Até lá, o item
correspondente na vB.5 continua bloqueado — de propósito, não esquecido.

## 🔒 Trava de Revisão 12-B — antes de encerrar a FASE 12 (e o roadmap comprometido até aqui)

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v12.3 e v12.4 pelas 5 perguntas do checklist, e faz uma varredura
final na FASE 12 inteira — o Painel Executivo (v12.4) cita números de quase
toda fase anterior (v4.8, v4.19, v5.4, v7.7), então é o lugar onde qualquer
inconsistência acumulada nas fases 4 a 10 fica mais visível: se um número
aqui não bate com o módulo de origem, é sinal de que uma trava anterior
deixou passar algo.
