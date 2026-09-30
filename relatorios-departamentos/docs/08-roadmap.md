# 08. Roadmap e Perguntas em Aberto

## Fases propostas

### Fase 0 — Conceitual (estamos aqui)
- [x] Estrutura organizacional validada (Campo → Área → Congregação → Departamento).
- [x] Perfis de acesso e fluxo de aprovação validados, com base em como a operação
      funciona hoje na prática.
- [x] Lista oficial dos 8 departamentos/secretarias e seus campos, com base nas
      planilhas reais já em uso.
- [x] Métodos de rateio confirmados (fixo, percentual, integral, mensalidade por
      contribuinte, isento, variável).
- [x] Restrição de orçamento Azure identificada e incorporada à decisão de arquitetura.
- [ ] Resolver as pendências específicas listadas abaixo.

### Fase 1 — Protótipo / Mock de telas
- Telas navegáveis (sem backend real) para validar a experiência de: Líder Local
  preenchendo um relatório (com pré-preenchimento de campos de estado), Líder de Área
  aprovando/comentando, Líder Geral corrigindo valores e aprovando definitivamente, e
  o painel do Secretário Geral configurando o perfil de rateio de um departamento.

### Fase 2 — MVP funcional (local)
- Cadastro de estrutura organizacional (campo, área, congregação — com vínculo
  área↔congregação com data de vigência) e dos 8 departamentos.
- Login por matrícula + senha.
- Preenchimento, envio e fluxo de duas aprovações (Área → Geral) do relatório mensal.
- Log de auditoria de edições.
- Tesouraria consolidada por departamento (livro-caixa mensal).
- Visão consolidada por área e por campo.

### Fase 3 — Refinamento
- Notificações/lembretes de pendência (quem não enviou o relatório).
- Exportação de relatórios (PDF/Excel) — reproduzindo o formato das planilhas atuais,
  já familiar às lideranças.
- Dashboards/gráficos sobre os dados consolidados de Eventos e Integração campo afora.

### Fase 4 — Migração/operação em produção no Azure
- Provisionar os recursos dentro do orçamento de ~US$ 30/mês (ver
  [07-arquitetura-tecnica.md](07-arquitetura-tecnica.md)).
- Deploy automatizado (CI/CD).
- Alertas de orçamento configurados.

## Perguntas em aberto (atualizado)

Praticamente tudo que estava listado na rodada anterior foi esclarecido (ver seção
"Resolvido" abaixo). O único ponto que continua genuinamente em aberto:

- [ ] Nenhuma pendência estrutural crítica no momento. Itens de detalhe (ex.: nomes
      exatos de todos os métodos de rateio de cada um dos 8 departamentos, prazos
      específicos por departamento) devem ser levantados durante o desenho do
      protótipo (Fase 1), campo a campo, junto com quem opera cada departamento hoje.

## Resolvido nesta rodada

- **Matrícula do rol de membros**: o sistema de gestão de membros existe, mas **não é
  integrável**. Cadastro de usuário será **manual** — o Secretário(a) Geral consulta a
  matrícula no outro sistema e cadastra a pessoa manualmente aqui.
- **"Secretário Geral" no relatório local**: confirmado que é sempre a mesma pessoa
  central (não um secretário por congregação) — presente propositalmente em todos os
  níveis como controle antifraude, para que nenhum relatório local seja
  produzido/alterado sem que a Secretaria Geral tenha ciência.
- **"Suporte para Secretaria Geral"**: confirmado como **facultativo por
  departamento** — não é uma fórmula automática; alguns departamentos optam por
  contribuir (ex.: SEMIADESPA), a maioria não.
- **Divisão local/geral**: confirmado que existem múltiplos métodos de rateio
  registrados por departamento (100% geral, 100% local, mensalidade fixa, percentual —
  às vezes já lançado líquido pelo preenchedor — e variável/manual, caso do UHADESPA
  visto nos exemplos). Não é inconsistência nos dados, é o método daquele
  departamento.
- **Crédito Azure**: programa nonprofit, crédito anual (~US$ 110/mês em média se
  dividido), meta de consumo conservadora fixada em ~US$ 30/mês para durar o ano
  inteiro. Gerenciado pelo(a) Secretário(a) Geral / equipe própria.
- **Novos tipos de departamento**: vale já prototipar/testar essa tela na Fase 1 (mockup
  de "criar novo departamento"), mas a implementação funcional fica para a Fase 3 — o
  MVP trava a lista em exatamente 8 departamentos, para não perder o foco.

## Materiais de referência recebidos

- Planilhas/relatórios reais em PDF de todos os 8 departamentos (alguns em branco,
  outros preenchidos com dados de exemplo de janeiro/2026), incluindo a visão por
  congregação, a visão consolidada do campo e a tesouraria de cada departamento. Essas
  planilhas são a fonte da verdade para os campos documentados em
  [04-departamentos-secretarias.md](04-departamentos-secretarias.md) e devem continuar
  sendo a referência ao desenhar as telas do protótipo (Fase 1), para manter os
  relatórios digitais reconhecíveis para quem já usa o formato atual.
