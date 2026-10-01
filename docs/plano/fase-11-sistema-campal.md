# FASE 11 — Sistema Campal (multi-campo)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

**Especulativa/opcional** — registrada aqui só como opção de futuro distante, depois
de tudo o mais estar pronto e rodando de verdade no nosso campo. Pode não vir a ser
construída — depende da demanda real de outros campos da Convenção, não é um
compromisso.

**Contexto:** hoje o sistema é feito sob medida pra um único campo (SETA em
Parauapebas). O Estatuto e o Regimento Interno, porém, são o padrão normativo comum a
todos os campos vinculados à Convenção — e muitos campos menores não têm estrutura
nem pra manter uma planilha organizada, quanto mais adotar um sistema como este do
jeito que está hoje (construído em cima de um `MembroId`/matrícula e um conjunto de
tabelas pensados pra um campo só).

**Perguntas em aberto pra quando (e se) isso for desenhado de verdade** — de
propósito sem resposta ainda, é cedo pra decidir:

- [ ] Modelo de isolamento entre campos: cada campo com seu próprio banco/instância,
      ou um banco único com todo registro amarrado a um `CampoId`? Tem implicação
      direta em custo, complexidade de deploy e naturalmente em segurança (um campo
      nunca pode ver dado de outro).
- [ ] Portabilidade de matrícula entre campos: hoje a Carta de Trânsito (v1.4) resolve
      transferência *dentro* do mesmo campo — mudar de campo (ex: "mudou de cidade")
      é outra categoria de problema: precisa decidir se a matrícula viaja com a
      pessoa, se é reemitida no campo novo, e o que acontece com o histórico
      (disciplina, cartas, consagrações) que ficou no campo de origem.
- [ ] Modelo de acesso/administração: existe um nível "Convenção" que enxerga todos os
      campos (KPIs agregados, comparação entre campos), ou cada campo administra o
      seu isoladamente, sem visão central nenhuma?
- [ ] Migração/adoção para campos sem nenhum dado digitalizado hoje (só papel ou
      planilha solta, se tanto) — que caminho de importação inicial faz sentido pra
      quem está começando do zero.
