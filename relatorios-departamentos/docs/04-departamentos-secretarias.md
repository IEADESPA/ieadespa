# 04. Departamentos e Secretarias

Lista **confirmada e fechada por ora** (o sistema deve permitir cadastrar novos tipos no
futuro, mas hoje são exatamente estes 8, presentes em toda congregação, cada um com
número fixo Nº 01–08 herdado das planilhas atuais):

| Nº | Sigla | Nome / natureza |
|---|---|---|
| 01 | UCADESPA | União de Crianças — evangelismo infantil |
| 02 | UMADESPA | União de Mocidade — jovens |
| 03 | USADESPA | União de Senhoras |
| 04 | UHADESPA | União de Homens |
| 05 | SEMIADESPA | Missões / evangelismo (discipulado, distribuição de literatura) |
| 06 | AÇÃO DA FÉ | Ação social — cestas básicas e doações |
| 07 | EBD | Escola Bíblica Dominical |
| 08 | FAMÍLIA | Ministério de família |

Essa lista veio das planilhas reais que já são usadas hoje (compartilhadas em PDF) —
elas são a fonte da verdade para o desenho dos formulários. Abaixo, a estrutura comum e
os campos específicos de cada uma.

## Estrutura comum a (quase) todos os departamentos

Todo relatório mensal de departamento segue este esqueleto:

1. **Cabeçalho**: Campo (IEADESPA) — Departamento — Mês/Ano; Área; Congregação; Líder de
   Área (daquele depto); Líder Local (ou Superintendente Local, no caso do EBD — o
   **rótulo do papel local pode variar por departamento**, mas a permissão é a mesma).
2. **Bloco de contagem/cadastro** — específico de cada departamento (ex.: membros,
   alunos matriculados, cestas). Tem uma coluna "TOTAL DO LOCAL" calculada.
3. **Bloco AÇÕES** — específico de cada departamento (visitas, evangelismo etc.).
4. **Bloco EVENTOS** (LOCAL / ÁREA / GERAL) — **idêntico em todos os departamentos**:
   quantidade de eventos realizados em cada nível. Serve para consolidar quantos
   eventos aconteceram no campo todo, por nível, somando todos os departamentos.
5. **Bloco INTEGRAÇÃO** (CONVERSÃO / RECONCILIAÇÃO / DE OUTRA IGREJA → TOTAL) —
   **idêntico em todos os departamentos**. Esse é um indicador transversal: uma pessoa
   convertida através do UCADESPA soma no mesmo total campal de conversões que uma
   convertida através do EBD. **Estes dois blocos (Eventos e Integração) devem ser
   modelados como uma estrutura compartilhada/reutilizável no schema**, não reinventada
   por departamento, porque a consolidação campal precisa somá-los através de todos os
   departamentos.
6. **Bloco FINANCEIRO** — receitas específicas por departamento (ver rateio abaixo) →
   VALOR TOTAL → divisão entre **PARA O LOCAL** / **PARA O GERAL**.
7. **Lista nominal de contribuintes com mensalidade** (quando o departamento cobra
   mensalidade individual) — ordem, nome, valor. Alimenta o campo MENSALIDADES do bloco
   financeiro.
8. **Assinaturas**: Líder Local + **Secretário(a) Geral** (a mesma pessoa, central,
   em todo o campo — não um secretário local) no relatório de cada congregação; Líder
   Geral do departamento + Secretário(a) Geral no relatório consolidado do campo.
   Confirmado: a presença do Secretário(a) Geral já no nível local é proposital, um
   controle antifraude (ver [03-perfis-acesso.md](03-perfis-acesso.md)).

**Não há upload de anexo/comprovante** — decisão explícita. Quem precisar comprovar algo
usa canais externos (WhatsApp). É justamente por isso que o Líder Geral tem poder de
edição sobre os valores (ver [03-perfis-acesso.md](03-perfis-acesso.md)): ele confere o
relatório contra o caixa real recebido e corrige se necessário, ao invés de exigir prova
documental.

## Camada 2 — Tesouraria consolidada do departamento (nível geral/campo)

Além do relatório mês a mês por congregação, cada departamento tem uma **tesouraria
central**, mantida pelo Líder Geral, com um fluxo de caixa próprio, mês a mês:

- **Saldo transportado do mês anterior**
- **Movimentação geral do mês atual** (= soma do que todas as congregações reportaram)
- **Investimento no [depto] local** (parcela que ficou nas congregações)
- **Total de entrada no [depto] geral** (parcela que subiu para o fundo geral do
  departamento)
- **Suporte para Secretaria Geral** — **confirmado como facultativo**: alguns
  departamentos contribuem com essa dedução extra para sustentar a secretaria central
  (ex.: SEMIADESPA/Missões, R$ 150,00 no exemplo real), a maioria não paga nada. Não é
  calculado por fórmula — é uma opção que cada departamento pode ou não adotar,
  configurada no perfil de rateio daquele departamento.
- **Despesas** (lançamentos livres, descrição + valor — ex.: "repasse para Indonésia",
  "ajuda para Marabá", "folhetos" no caso do SEMIADESPA)
- **Saldo em caixa / saldo do mês**

Ou seja, o modelo financeiro tem **duas camadas**: (1) o relatório mensal por
congregação, que já calcula local/geral por linha, e (2) um livro-caixa do
departamento em nível de campo, que acumula entradas, registra despesas e carrega saldo
mês a mês. Ver [05-modelo-dados.md](05-modelo-dados.md) para o desenho de entidades.

## Rateio — métodos confirmados

O rateio (como se divide o dinheiro entre local/geral) **varia por departamento** e
precisa ser **cadastrado individualmente por departamento**, configurável pelo
Secretário(a) Geral a pedido do Líder Geral daquele departamento. Métodos confirmados,
cada um usado por departamentos diferentes:

- **Integral (100%) para o geral** — tudo o que é arrecadado sobe para o fundo geral do
  departamento.
- **Integral (100%) para o local** — tudo fica na congregação (ex.: EBD, no exemplo
  real, praticamente toda a oferta ficou local).
- **Taxa fixa de mensalidade** — valor fixo por contribuinte (ex.: USADESPA/Senhoras).
- **Percentual** (ex.: 40% para o geral, caso da FAMÍLIA) — **atenção**: em alguns
  departamentos que usam percentual, quem preenche o relatório **já lança apenas o
  valor líquido** (o resultado do cálculo, ex.: os 40% que efetivamente sobem), sem
  registrar o valor bruto nem os outros 60% que ficam no local — para simplificar o
  preenchimento. Ou seja, o campo "Valor Total" nem sempre é um valor bruto a ser
  dividido automaticamente pelo sistema; às vezes já chega pré-calculado pelo próprio
  líder local.
- **Variável / flexível (decidido caso a caso)** — o método usado pelo UHADESPA visto
  nos exemplos reais: a divisão local/geral muda a cada lançamento porque é decidida
  manualmente, não por uma fórmula fixa. Não é uma inconsistência nos dados — é o
  método de rateio daquele departamento.

Consequência para o design: o **perfil de rateio** de cada departamento precisa
registrar não só o método (fixo/percentual/integral/mensalidade/variável), mas também
se o cálculo é **automático** (sistema divide o valor bruto informado) ou se o valor
informado **já vem líquido/pré-calculado** pelo preenchedor. O painel do Secretário(a)
Geral precisa ter uma tela para editar esse perfil por tipo de departamento, sem
depender de alteração de código.

## Especificação de campos por departamento

### 01 — UCADESPA (Crianças)
- **Contagem**: Congregados, Total do Local, Visitantes
- **Ações**: Casas Visitadas, Crianças Evangelizadas, Orações Normais, Extras
- **Financeiro**: Mensalidades, Ofertas, Campanhas, Outros

### 02 — UMADESPA (Mocidade)
- **Contagem**: Membros em Comunhão, Membros sem Comunhão, Congregados, Total do Local
- **Ações**: Casas Visitadas, Jovens Evangelizados, Orações Normais, Extras
- **Financeiro**: Mensalidades, Ofertas, Campanhas, Outros

### 03 — USADESPA (Senhoras)
- **Contagem**: Membros em Comunhão, Membros sem Comunhão, Congregados, Total do Local,
  Matriculadas, Não Matriculada
- **Ações**: Casas Visitadas, Tarde de Louvor, Orações Normais, Extras
- **Financeiro**: Mensalidades, Ofertas, Campanhas, Outros

### 04 — UHADESPA (Homens)
- **Contagem**: Membros em Comunhão, Membros sem Comunhão, Congregados, Total do Local,
  Matriculados, Não Matriculado
- **Ações**: Casas Visitadas, Tarde de Louvor, Orações Normais, Extras
- **Financeiro**: Mensalidades, Ofertas, Campanhas, Outros

### 05 — SEMIADESPA (Missões)
- **Contagem**: Bíblias Distribuídas, Folhetos Distribuídos, Outras Literaturas, Total
  do Local, Pessoas no Discipulado I, Pessoas no Discipulado II
- **Ações**: Casas Visitadas, Número de Pessoas Evangelizadas, Número de Evangelismos,
  Cultos Evangelísticos
- **Financeiro**: Mensalidades (lista nominal extensa de pequenos contribuintes),
  Ofertas, Campanhas, Outros
- **Despesas típicas da tesouraria**: repasses para obras missionárias (ex.: exterior,
  outras localidades), impressão de folhetos

### 06 — AÇÃO DA FÉ (Ação Social)
- **Contagem**: Peso da Cesta, Cestas, Saída de Alimentos (KG), Entrada de Alimentos
- **Itens rastreados individualmente** (quantidade/total em KG): Arroz, Feijão, Óleo,
  Açúcar, Sal, Café, Macarrão, Extrato de Tomate, Sardinha, Flocão, Farinha, Biscoito,
  Papel Higiênico, Sabão em Pó, Creme Dental, Sabonete, Barra de Sabão, Bucha de
  Alumínio, Outros
- **Financeiro**: Contribuições, Ofertas, Campanha, Outros

### 07 — EBD (Escola Bíblica Dominical)
- **Contagem**: Alunos Ausentes, Alunos Presentes, Visitantes, Total de Presença, EBD's
  Realizadas, Alunos Visitados, Alunos Matriculados, Bíblias, Revistas
- **Ações Extra Classe**: Social, Ação Pró EBD, Ação Pró Igreja
- **Percentuais calculados**: % Ausência, % Presença (sobre o total de matriculados)
- **Financeiro**: apenas Ofertas (não tem mensalidade/campanha)
- **Particularidade**: é o único departamento com **granularidade semanal** dentro do
  relatório mensal — uma aba secundária detalha cada domingo (1º ao 5º) com os mesmos
  campos, que se somam no total do mês. O papel do responsável local é chamado
  "Superintendente Local" em vez de "Líder Local" (rótulo diferente, mesma permissão).

### 08 — FAMÍLIA
- **Contagem**: Famílias Crentes, Famílias com Membros Não Crentes, Famílias com Único
  Membro, Total do Local, Menores de 18 com Pais Não Crentes, Casais com Esposo ou
  Esposa Não Crente
- **Ações**: Casas Visitadas, Famílias que Mudaram, Famílias/Casais Assistidos,
  Famílias/Casais Integrados
- **Financeiro**: Mensalidades, Ofertas, Campanhas, Outros

## Consequência para o design técnico

Como cada departamento tem campos de contagem/ações totalmente diferentes, mas
Eventos, Integração e a estrutura Financeira são padronizadas, o **formulário
configurável** (schema dinâmico por tipo de departamento) proposto em
[05-modelo-dados.md](05-modelo-dados.md) deve separar claramente:

- Campos **específicos** do departamento (bloco de contagem + bloco de ações) — variam
  livremente por tipo.
- Campos **compartilhados** (Eventos, Integração) — mesma estrutura sempre, reutilizada.
- Estrutura **financeira** — receitas variam por departamento (nomes/quantidade de
  colunas), mas o cálculo de rateio (→ total → local/geral) é sempre o mesmo mecanismo,
  parametrizado pelo perfil de rateio daquele departamento.

## Pré-preenchimento inteligente (confirmado)

Á semelhança de uma declaração de Imposto de Renda pré-preenchida, o formulário mensal
deve vir com os campos "de estado" (ex.: número de membros, matriculados) **já
preenchidos com o valor do último relatório enviado**, para o líder local só precisar
corrigir o que mudou, sem ter que recontar/recalcular tudo todo mês. Campos "de fluxo"
(ex.: número de cultos no mês, evangelismos, ofertas) começam sempre zerados, pois são
específicos daquele mês.
