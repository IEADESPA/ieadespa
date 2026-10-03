# FASE 9 — Entidades Vinculadas e Expansão

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## v9.1 — Entidades vinculadas

- [ ] Cadastro de entidades (hospitais, escolas, ONGs com CNPJ próprio — Art. 64-68).
- [ ] Vínculo com a IEADESPA e controle de participação.

**Expandido pela varredura normativa (7ª rodada):**

- [ ] **Intervenção com prazo fatal de ratificação** (Art. 47-A §§1º-2º): a
      intervenção em entidade vinculada precisa ser **ratificada pela CLI em 15
      dias, sob pena de perder a eficácia**. Contador com caducidade automática —
      é o tipo de prazo que, perdido, derruba o ato inteiro.
- [ ] **Requisito legal de formação do gestor** (Art. 153): pedagogia para
      escolas, gestão hospitalar/medicina para hospitais — validado no cadastro
      da entidade, não descoberto numa fiscalização.
- [ ] Prestação de contas da entidade vinculada à CLI, com periodicidade e alerta
      de atraso (mesmo mecanismo da v5.4).

## v9.2 — Expansão (Extensões e novas congregações)

- [ ] Abertura de Extensão da Tenda (nível 0) por congregação-mãe.
- [ ] Emancipação de Extensão → Congregação (CLI).
- [ ] **CME** — Comissão de Missões e Expansão Estratégica (Regimento, Art.
      23): Secretário de Missões + Pastores de Área. Vinha adiada de v2.4
      (Comissões Permanentes) porque dependia do cargo "Secretário de
      Missões", que precisa nascer aqui (Pastor de Área já existe — só falta
      esse cargo). Reaproveita `shared/comissoes.js`, mesmo padrão de CFO/CEP.

## v9.3 — Distrito e macroexpansão

- [ ] Ativação de Distrito (nível 5) com autonomia financeira + dízimo institucional 10%.
- [ ] Blindagem contra desvinculação (intervenção imediata).

## 🔒 Trava de Revisão 9-A — antes de avançar para a v9.4

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v9.1 a v9.3 pelas 5 perguntas do checklist.

## v9.4 — Missões: campos, missionários e prestação de contas *(7ª rodada)*

O risco real em missões não é falta de recurso — é **sustento enviado sem
relatório recebido**, que é exatamente o que a Assembleia cobra e ninguém
consegue responder com número.

- [ ] Cadastro de campo missionário (local, status, congregação mantenedora) e de
      missionário sustentado, com valor mensal amarrado ao Contas a Pagar (v4.5) e
      ao Rateio Geral (v4.10).
- [ ] **Relatório de campo com periodicidade obrigatória** (batismos, atividades,
      pedidos) — e **relatório atrasado sinaliza/suspende o repasse**, mesma
      lógica do balancete departamental (v5.4). Não é punição: é a condição que a
      própria prestação de contas à Assembleia exige.
- [ ] Painel de missões alimentado pelos mesmos dados, sem redigitação — inclusive
      para exibição pública/mural.
- [ ] Conexão com a CME (Comissão de Missões e Expansão, v9.2).
      *(MissionaryConnect; Missions21)*

## v9.5 — Mapa territorial e inteligência de expansão *(7ª rodada)*

- [ ] **Mapa de cobertura**: onde há membros cadastrados sem congregação próxima —
      insumo direto e objetivo para abertura de Extensão da Tenda (v9.2), em vez
      de decidir por percepção.
- [ ] Densidade de membresia por região e distância média até a congregação de
      vínculo.
- [ ] Simulação de emancipação: quais Extensões já atendem os critérios para virar
      Congregação, calculado a partir dos dados que já existem (membresia, PSC da
      v7.1, arrecadação da FASE 4). *(Churchteams; GroupVitals — group finder)*

## v9.6 — Parcerias públicas, CEBAS e projetos sociais *(7ª rodada)*

Só se aplica se a igreja mantiver ação assistencial estruturada (v5.9) — mas se
mantiver, há um regime jurídico próprio que hoje não tem nenhuma cobertura.

- [ ] **Contabilidade segregada por parceria/convênio** (exigência do MROSC,
      Lei 13.019/2014) — centro de custo carimbado por termo de fomento ou
      colaboração, reaproveitando o motor de Centro de Custo da FASE 4.
- [ ] Prestação de contas no formato MROSC: relatório de execução do objeto +
      execução financeira, com prazos e alertas.
- [ ] Controle de vigência e renovação de certificações (**CEBAS** — LC 187/2021;
      Utilidade Pública Federal/Estadual/Municipal; inscrição no CMAS/CNEAS),
      com alerta antecipado — certificação vencida derruba benefício fiscal.
- [ ] Requisitos cumulativos do CEBAS monitorados de forma contínua, não
      conferidos só na hora de renovar.

## 🔒 Trava de Revisão 9-B — antes de encerrar a FASE 9 e avançar para a FASE 10

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v9.4 a v9.6 pelas 5 perguntas do checklist, e faz uma varredura final
na FASE 9 inteira antes de fechar — v9.6 (CEBAS/MROSC) lida com parceria
pública, então consistência de dado aqui tem peso extra.
