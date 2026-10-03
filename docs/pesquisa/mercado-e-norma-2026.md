# Referência de pesquisa (mercado + norma legal, 2026)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](../plano/INDICE.md).

Pedido explícito do usuário: pesquisar sem se limitar a fontes
brasileiras ("não tenha dor de pesquisar") como sistemas financeiros de
verdade — ERP de grandes empresas, os melhores softwares de contabilidade
pra igreja/terceiro setor, e a norma contábil brasileira que rege
entidades sem fins lucrativos — organizam entradas, saídas, rateio e
auditoria, e usar isso pra reescrever o plano da FASE 4 inteiro numa
sequência única, sem duplicação, em ordem de dependência ("o que fazer
ponto a ponto pra não ter erro"). O que segue nesta seção é o resultado
dessa mesclagem: tudo que já vinha do Regimento + tudo que a pesquisa
trouxe, keyword por keyword — incluindo uma quarta rodada que respondeu
diretamente "isso é tudo, ou tem mais?": sim, tinha mais, duas peças
voltadas ao doador (doação online/recorrente, campanhas com meta) e duas
peças de projeção/patrimônio (fluxo de caixa projetado, depreciação de
ativo fixo) que plataformas de ponta como Pushpay/Tithe.ly e ERPs como
MIP/Nonprofit+ têm e que não estavam aqui ainda. Uma quinta rodada
respondeu "eu quero o pico, não porte médio": o que separa um ERP de
porte médio de um sistema de nível corporativo/bancário de verdade —
ancoragem externa da trilha de auditoria (à prova até de um administrador
com controle total do próprio sistema), monitoramento contínuo de
controles em vez de auditoria por amostragem, revisão periódica de
acessos, o princípio dos quatro olhos de verdade (dois aprovadores
independentes, não só hierarquia), orçamento contínuo (rolling forecast)
e gestão de investimentos/tesouraria avançada.

**Conclusão da pesquisa:** a arquitetura já construída em v4.1-v4.1.5
(Centro de Custo Local/Geral + Categorias de Entrada) segue exatamente o
padrão de **fund accounting simplificado** — não precisa reconstruir a
base. O que faltava pra "competir" com um sistema financeiro de verdade
é completar o outro lado da mesma moeda (Saídas), dar ao doador uma
experiência de ponta (doação online/recorrente), e formalizar o que já
existe em cima de normas e controles reconhecidos:

| Achado | Fonte | Onde entra no plano |
| --- | --- | --- |
| Fund Accounting (fundo restrito/livre) | NetSuite, GivingArc, AlignMint, ChurchTrac, Aplos, Sage | v4.2 |
| Chart of Accounts (Plano de Contas) | NetSuite, Priority, Codejig | v4.2 |
| ITG 2002 (CFC, Res. 1.409/12) — **norma legal brasileira obrigatória** | CFC, CRCSC | v4.2, v4.9 |
| Cost allocation methods (valida o rateio 40/60 já existente) | BPM, CFO Selections, Onetribe | já implementado (v4.1) |
| Doação online/recorrente (Pushpay, Tithe.ly) — **descartada** (sem gateway de pagamento); redesenhada como autolançamento + confirmação do Tesoureiro | Pushpay, Tithe.ly | v4.3 |
| Campanhas de arrecadação com meta (pledge campaigns) | Tithe.ly | v4.4 |
| Accounts Payable + segregação de funções (maker-checker) | Ramp, ApprovalMax, Settle, PBMares, Council of Nonprofits | v4.5, seção 2.7 |
| Vendor Master Data (Cadastro de Fornecedores) | NetSuite, Eftsure, Corpay, Xelix | v4.5 |
| Fundo Fixo de Caixa (petty cash) | Aplos, Harvard Financial Policy | v4.5 |
| Accounts Receivable (Contas a Receber) | conceito geral de ERP | v4.6 |
| CNAB 240/400 (Febraban) — remessa bancária em lote | Febraban, Banco do Brasil, Sicredi | v4.7 |
| Orçado vs. Realizado + Empenho + Fluxo de Caixa Projetado | PLANERGY, Bill.com, AlignMint, Grain Ledger, Blackbaud, Aplos | v4.8 |
| Demonstrações ITG 2002 | CFC | v4.9 |
| Depreciação de ativo fixo | MIP, Nonprofit+, Nonprofit Accounting Basics | v4.11 |
| Hash chain / trilha de auditoria inviolável | pesquisa técnica geral (tamper-evident logs) | v4.12 |
| COSO Internal Control Framework (lente de revisão, não vira versão) | COSO.org, Diligent, Pathlock, Cherry Bekaert | v4.12 |
| KPIs de saúde financeira (meses de reserva, aplicação em atividades-fim, liquidez) | Sage, JMCO, Warren Averett, GivingArc | v4.12 |
| Open Finance Brasil (conciliação automática) | TecnoSpeed, Pluggy, Openi, Paytime | v4.13 |
| COAF/PLD-FT (Lei 9.613/98) — comunicação de operação suspeita, **obrigação legal** | AtlasGov, CFC, Compliance Brazil, VAAS | v4.12 |
| Ancoragem externa de timestamp (RFC 3161) — trilha inviolável até contra admin do próprio sistema | pesquisa técnica (blockchain anchoring) | v4.12 |
| Continuous Controls Monitoring (SOX 404) — controle monitorado o tempo todo, não só por amostragem | CloudEagle, Pathlock, Exabeam | v4.12 |
| Revisão periódica de acessos (access recertification) | TechPrescient, Pathlock | v4.12 |
| Princípio dos Quatro Olhos (dual control) — dois aprovadores independentes, não hierarquia | AICO, Hyperbots, SAP Community | v4.12 |
| Rolling forecast (orçamento contínuo, driver-based) | Cube, Prophix, Vena | v4.8 |
| Treasury Management System — gestão de investimentos, liquidez com margem de confiança | Gartner, Trovata, GTreasury | v4.14 |

## v4.2 — Plano de Contas e Fundo Restrito/Livre

Fundação contábil que todas as versões seguintes dependem — precisa
existir antes do Orçamento (v4.8) e das Demonstrações (v4.9).

- [x] Registro de mapas de dízimos/ofertas por congregação, com numeração
      sequencial de "talão" — entregue em v4.1 (`LancamentosTesouraria`,
      Termo nº), já que não fazia sentido separar do fechamento/rateio.
- [x] **Plano de Contas** (`PlanoContas`) — catálogo hierárquico
      configurável (auto-referenciado, mesmo motor genérico de catálogo já
      usado em Congregações/Áreas — `pai.origem` apontando pra si mesmo)
      por trás de `CategoriasEntrada` (`CategoriasSaida` entra em v4.5) —
      semeado com uma estrutura mínima real (Ativo/Passivo/Patrimônio
      Líquido/Receita/Despesa, com sub-níveis) já compatível com as
      demonstrações da ITG 2002 (v4.9), não uma lista de categorias
      soltas. Tela própria dentro de Financeiro → Plano de Contas (não na
      aba genérica de Catálogos — é configuração exclusiva do módulo).
- [x] `CategoriasEntrada.TipoFundo` (`RESTRITO` | `LIVRE`) — fund
      accounting: Revista/Congresso já nascem `RESTRITO` (finalidade
      específica); Dízimo/Oferta/Departamento/Secretaria são `LIVRE`. A
      Saída (v4.5) correspondente só vai liberar gasto na mesma
      finalidade quando a entrada de origem for restrita.
- [x] **Correção de bug**: a tela de "Categorias de Entrada" nunca tinha
      sido de fato construída no front-end (v4.1.5 só criou o catálogo no
      backend) — o aviso "cadastre em Catálogos" no formulário de
      lançamento apontava pra um lugar que não existia. Corrigido junto.
- **Descartado (decisão explícita, 2026):** conferência/auditoria in loco
  pelo 2º Tesoureiro (Art. 36 §2º/41 II) — a visita física comparando o
  mapa físico com o dinheiro entregue deixa de fazer sentido com a
  conferência digital da Geral (v4.1.3); o 2º Tesoureiro participa dessa
  conferência pelo próprio sistema, não presa a uma tarefa manual
  separada.

## v4.3 — Autolançamento do Dizimista com Confirmação do Tesoureiro

Pergunta direta do usuário ("tem mais coisa que pode ser feita?") levou à
proposta original de doação via PIX/cartão direto pelo Meu Painel — **mas
o próprio usuário barrou essa ideia**: a igreja não vai instalar/operar um
sistema de gerenciamento de pagamentos (gateway). Redesenhada em cima de
como o processo físico já funciona hoje: o bloco de dízimo é numerado
(Termo nº), e essa numeração é a prova que o dizimista guarda — mesmo que
alguém apague o registro no sistema (por mais que haja auditoria), a folha
física continua existindo enquanto a pessoa a guardar. O objetivo desta
versão é dar ao dizimista o equivalente digital dessa prova, sem nunca
processar pagamento nenhum:

- [x] **Autolançamento** (`AutolancamentoTesouraria`, rota pública por
      matrícula, mesmo padrão de auto-atendimento de
      `MeusLancamentosTesouraria`/`MeusDadosLGPD`) — o dizimista REGISTRA
      que já deu um dízimo/oferta (dinheiro ou PIX, fora do sistema; o
      sistema não processa nada) escolhendo categoria, valor, forma e mês.
      Nasce com `Origem='AUTOLANCAMENTO'`, `StatusConfirmacao='PENDENTE'`
      e **sem** Termo nº (`TermoNumero` agora é `NULL`-ável).
- [x] **Confirmação do Tesoureiro Local** (`ConfirmarAutolancamentoTesouraria`)
      — o Tesoureiro só confirma depois de efetivamente ver o
      dinheiro/PIX cair. **O Termo nº só é gerado nesse instante**
      (`shared/tesouraria.js::proximoNumeroTermo`), nunca no
      autolançamento em si — assim nenhum número de termo fica "furado"
      por algo que a pessoa disse que deu mas nunca chegou a ser
      confirmado. Rejeitar registra `MotivoRejeicaoConfirmacao` sem gerar
      termo.
- [x] **Comprovante = o próprio registro confirmado, sem gerar arquivo
      separado** (ajuste pedido explicitamente pelo usuário): uma vez
      `CONFIRMADO`, o lançamento aparece em Minhas Contribuições e o
      `DELETE` de `GestaoLancamentosTesouraria` passa a recusar
      permanentemente cancelá-lo — é o equivalente digital da folhinha do
      bloco físico, que nunca desaparece enquanto existir. Lançamentos de
      origem `TESOUREIRO` (digitados direto pelo Tesoureiro) continuam
      com o cancelamento-com-motivo de sempre (v4.1.1), sem mudança.
- [x] `FecharMesTesouraria` passa a exigir toda pendência de autolançamento
      resolvida (confirmada ou rejeitada) antes de fechar o mês, e soma
      só o que está `StatusConfirmacao='CONFIRMADO'` — dinheiro que
      ninguém confirmou ter recebido não entra no rateio 40/60.
- **Descartado (decisão explícita do usuário, 2026):** doação via PIX/
  cartão processada pelo próprio sistema e doação recorrente agendada —
  isso exigiria integrar um gateway de pagamento, o que a igreja decidiu
  não fazer. O Comprovante Anual de Contribuições (documento anual para
  uso do dizimista, calculado na leitura a partir do histórico já
  confirmado) segue como ideia válida e pode voltar como uma versão
  futura, sem depender de gateway nenhum.

## v4.4 — Campanhas de Arrecadação com Meta e Sorteios

Pedido explícito do usuário: campanhas com meta personalizada por
congregação (ex: Congregação A meta R$1.000, Congregação B meta R$500,
visão geral da meta total somando todas) — e sorteios (números da sorte)
como parte da mesma funcionalidade, totalmente integrados.

- [x] **Campanhas** (`Campanhas`) com objetivo declarado e prazo.
- [x] **Meta personalizada por congregação** (`CampanhaMetas`, ex:
      Congregação A R$1.000, Congregação B R$500) — a meta geral e o total
      arrecadado (por congregação e no total) são **calculados na leitura**
      a partir das metas cadastradas e dos `LancamentosTesouraria`
      vinculados via `CampanhaId`, nunca digitados à mão. Progresso exibido
      com barra visual, tanto no total geral quanto no detalhe por
      congregação.
- [x] Toda campanha nasce com fundo **RESTRITO** — categoria de entrada
      própria (`CategoriasEntrada.Codigo = 'CAMPANHA'`, ligada à conta
      contábil 4.2.3, mesmo princípio de Revista/Congresso, v4.2) — o
      dinheiro arrecadado só poderá ser gasto na finalidade da campanha
      quando as Saídas (v4.5) existirem.
- [x] Contribuição de campanha pode vir por lançamento comum do Tesoureiro
      ou por autolançamento do dizimista (v4.3) — ambos aceitam
      `campanhaId` opcional, validando que a campanha existe e está ATIVA.
- [x] Encerrar/cancelar uma campanha é mudança de `Status`, nunca exclusão
      (mesmo princípio de v4.1.1) — quem já contribuiu continua com o
      registro preservado.
- **Adiado pra quando fizer sentido:** divulgação do progresso em versão
  "mural" (redação condicional sem expor quem doou quanto) — pode
  reaproveitar o mesmo padrão já usado no relatório de tesouraria (v4.1),
  mas não foi pedido agora; a visão de progresso hoje vive dentro de
  Financeiro → Campanhas.

### v4.4.1 — Sorteio vira derivado da campanha, não um Tipo dela (correção de rumo)

Feedback direto do usuário depois de ver o v4.4 inicial: os cupons de um
sorteio são **físicos**, confeccionados numa gráfica, e vendidos pra
**qualquer pessoa** (não só membro/dizimista cadastrado no sistema) — não
fazia sentido o sistema controlar um número individual de cupom nem fazer
o "sorteio" sozinho (`VenderNumeroSorteio`/`SortearCampanha`, removidos).
Redesenhado como o usuário descreveu: o sorteio é um **derivado** de uma
campanha (uma campanha pode ter zero, um ou vários sorteios ligados a
ela) — o que diferencia um sorteio de uma arrecadação comum são os
**prêmios**, não a existência de um número controlado pelo sistema.

- [x] `Sorteios` — tabela própria, `CampanhaId` como pai (não mais
      `Campanhas.Tipo`), com nome, descrição, preço do cupom (só
      informativo, não gera lançamento individual), data prevista e
      status (`ATIVO` | `REALIZADO` | `CANCELADO`).
- [x] `SorteioPremios` — um ou mais prêmios por sorteio (1º prêmio, 2º
      prêmio...), cada um com o nome de quem ganhou preenchido **depois**
      que o sorteio físico acontece (gráfica/evento, fora do sistema) —
      é dado histórico registrado manualmente, não calculado.
- [x] O dinheiro arrecadado com a venda dos cupons continua entrando pela
      Tesouraria normal (lançamento com o `CampanhaId` da campanha-mãe,
      valor em lote conforme a prestação de contas de quem vendeu),
      sem vínculo a um comprador ou número individual.
- [x] Criar sorteio e registrar prêmio/ganhador é restrito a nível Global
      (mesmo princípio de `GestaoCampanhas`).
- **Removido do v4.4 inicial**: `CampanhaSorteioNumeros` (pool de números
  controlado pelo sistema), `VenderNumeroSorteio` e `SortearCampanha`
  (sorteio automático) — não fazem sentido pra cupom físico vendido ao
  público em geral.

## v4.5 — Saídas: Contas a Pagar

Escopo grande demais pra uma entrega só (pedido explícito do usuário: dividir
em duas partes de três itens cada, "senão fica muito grande e pode deixar de
fazer algo que teria que ser feito"). v4.5 inteira já entregue, em duas
rodadas: primeira parte — a fundação (categorias, fornecedores, e o fluxo
completo de solicitação → aprovação → pagamento com os dois controles que já
não podiam esperar: segregação de funções e saldo nunca negativo); segunda
parte — os três controles complementares (duplicidade, 3 cotações, Fundo
Fixo de Caixa).

### Primeira parte (entregue)

- [x] `CategoriasSaida` — catálogo espelhado de `CategoriasEntrada` (mesmo
      motor genérico de catálogo, tela dentro de Financeiro → Plano de
      Contas → Categorias de Saída), cada categoria marcada com o Centro
      de Custo que autoriza o gasto (`LOCAL` de uma congregação, ou
      `GERAL` consolidado, v4.1.3) e um `TipoFundo` (`LIVRE`|`RESTRITO`,
      espelha v4.2) — categoria restrita **exige** vincular a Saída a uma
      Campanha (v4.4) de origem e trava o gasto no que ela já arrecadou
      de fato (`shared/tesouraria.js::saldoRestanteCampanha`) — fecha o
      ciclo prometido em v4.2 ("a Saída correspondente só libera gasto na
      mesma finalidade").
- [x] `Fornecedores` — cadastro próprio (CNPJ/CPF, dados bancários),
      pré-requisito pra pagar qualquer um (`GestaoFornecedores`).
      Verificação de CPF/CNPJ duplicado (bloqueia) e nome parecido
      (avisa, não bloqueia). **Mudança de dados bancários desconfirma
      automaticamente** (`DadosBancariosConfirmados=0`) e trava qualquer
      pagamento a esse fornecedor até **outra pessoa** confirmar
      (`ConfirmarDadosBancariosFornecedor` — quem alterou nunca pode
      confirmar a própria alteração) — é o vetor de fraude nº1 segundo a
      pesquisa (trocar a chave PIX de um fornecedor real pra desviar um
      pagamento já aprovado).
- [x] Fluxo completo em `GestaoSaidas` (`SaidasTesouraria`): Solicitação
      (documentação obrigatória — nota fiscal/recibo, Reg. Art. 120 §2º,
      exigida desde a solicitação, não só no pagamento) → **aprovação por
      alçada de valor** (`AlcadasAprovacao`, configurável — quanto maior
      o valor da faixa, mais aprovadores distintos e de nível territorial
      mais alto exigidos; ranking de amplitude territorial novo em
      `shared/auth.js::nivelAtingeMinimo`, não existia nenhuma comparação
      de nível antes, só igualdade exata) → pagamento (comprovante
      obrigatório) → registro permanente. **Segregação de funções**
      (princípio 2.7): quem solicita nunca aprova/rejeita a própria
      solicitação — checado no próprio endpoint. **Saldo do Centro de
      Custo nunca fica negativo**: o pagamento é bloqueado se faltar
      saldo liberado (`shared/tesouraria.js::saldoCentroCusto`), não uma
      marcação manual. Cancelamento nunca é exclusão (mesmo princípio de
      v4.1.1) — mas uma Saída já paga não pode mais ser cancelada.

### Segunda parte (entregue)

- [x] **Verificação de pagamento duplicado** — mesmo fornecedor + mesmo
      valor + janela de 7 dias, status ainda ativo. **Calculado na
      leitura** (`possivelDuplicidade`, subquery correlacionada no
      próprio `GestaoSaidas`), nunca uma marcação manual — vira um alerta
      visível pra quem aprova (lista e detalhe), nunca bloqueio
      automático (pode ser uma parcela legítima repetida, ex: aluguel
      mensal).
- [x] **3 cotações obrigatórias acima de um valor de referência** (Reg.
      Art. 62) — valor configurável (`ParametrosSaida`, tela em
      Financeiro → Saídas, nunca hardcoded); acima dele, a solicitação
      não entra no sistema sem 3 cotações anexadas (fornecedor, valor e
      documento de cada uma).
- [x] **Fundo Fixo de Caixa** (petty cash) por congregação
      (`FundosFixosCaixa`/`FundoFixoMovimentos`) — teto de valor e
      custodiante responsável definidos por quem tem nível Global; uso do
      dia a dia (despesa miúda ou reposição) feito pelo custodiante local,
      sem precisar da alçada cheia de uma Saída normal. Saldo sempre
      **calculado na leitura** (reposições menos despesas,
      `shared/tesouraria.js::saldoFundoFixo`) — despesa nunca deixa o
      saldo negativo, reposição nunca deixa passar do teto. Documento
      (recibo/comprovante) obrigatório em todo movimento.

## v4.6 — Contas a Receber

- [x] Registro de valor **esperado, ainda não recebido** (ex: acordo de
      parcelamento, boleto emitido pra terceiro) — `ContasAReceber`, sem
      contar no Centro de Custo (v4.1.3) enquanto não for confirmado.
      **Confirmar** (`GestaoContasReceber`, ação `CONFIRMAR`) gera um
      `LancamentoTesouraria` de verdade — mesmo Termo nº sequencial de
      sempre, mesma checagem de mês fechado — não duplica dinheiro, só
      antecipa a visibilidade de "isso ainda vai entrar".
- [x] **Status calculado na leitura**: `Status` gravado é só
      `PREVISTO`/`RECEBIDO`/`CANCELADO` — `VENCIDO` nunca é marcado à
      mão, é derivado comparando a data de vencimento com hoje
      (`diasParaVencimento`), mesmo princípio "calculado na leitura" de
      sempre. Cancelamento nunca é exclusão (mesmo princípio de v4.1.1).

## v4.7 — Remessa Bancária (CNAB 240/400)

- [x] Geração de arquivo de remessa bancária (`shared/cnab240.js`,
      `GestaoRemessasBancarias`, layout estrutural do padrão Febraban
      CNAB 240 — os campos essenciais estão de verdade: banco, valor,
      favorecido, número de documento pra casar o retorno; como todo
      CNAB 240 exige homologação prévia com o banco específico
      contratado, este é o ponto de partida técnico correto, não um
      arquivo já homologado com nenhum banco) pra pagar várias Saídas já
      **APROVADAS** de uma vez só — sobe um arquivo no banco em vez de
      PIX/TED um por um. Só entra fornecedor com dados bancários
      confirmados e completos (v4.5). Dados bancários da própria
      denominação em `DadosBancariosInstituicao`, nunca hardcoded,
      editáveis só por nível Global.
- [x] Leitura do arquivo de retorno do banco (`ProcessarRetornoRemessa`,
      `shared/cnab240.js::parsearRetornoCnab240`) — pagamento confirmado
      vira `SaidasTesouraria.Status = 'PAGA'` automaticamente (mesmo
      efeito de pagar uma por uma, sem repetir o trabalho); rejeitado
      pelo banco fica `FALHOU` com o código de ocorrência, e a Saída
      volta a ficar disponível pra entrar numa remessa nova ou ser paga
      manualmente. Gerar remessa e processar retorno restritos a nível
      Global (move dinheiro de várias congregações de uma vez, mesmo
      princípio de `RegistrarRepasseTesouraria`). Número sequencial do
      arquivo nunca reinicia — mesmo princípio do Termo nº.

## v4.8 — Orçamento Anual, PDQ, Empenho e Fluxo de Caixa Projetado

Escopo grande demais pra uma entrega só (pedido explícito do usuário: "tem
quatro tipos de situações... da pra fazer de uma vez, mas parte em algumas
partes"). Os quatro temas do roadmap original se agrupam naturalmente em
dois blocos independentes: o **motor orçamentário financeiro** (Orçamento
Anual, Orçado vs Realizado, Empenho, Fluxo de Caixa Projetado) e a
**governança do PDQ** (Planejamento Diretor Quadrienal — metas
estratégicas, Fundo de Execução, remanejamento, comissão de
acompanhamento). Primeira parte entregue agora é o motor financeiro;
segunda parte (PDQ) fica pra próxima rodada.

### Primeira parte (entregue) — motor orçamentário financeiro

- [x] **Orçamento Anual** (`OrcamentosAnuais`/`OrcamentoLinhas`, 1º
      Tesoureiro — Art. 36 §1º) — uma linha por categoria de entrada/saída
      já existente (`CategoriasEntrada`/`CategoriasSaida`, v4.2/v4.5), com
      o valor orçado pro ano. Criar/editar restrito a nível Global.
      **Balanço Patrimonial consolidado** (também citado no roadmap
      original) foi escopado pra v4.9 (Demonstrações Contábeis ITG 2002)
      — é uma demonstração contábil de verdade, não parte do orçamento em
      si; mantém esta versão focada no motor orçamentário.
- [x] **Orçado vs. Realizado** por categoria — comparativo calculado na
      leitura a cada consulta do orçamento, comparando o valor orçado
      contra os `LancamentosTesouraria`/`SaidasTesouraria` reais do ano.
- [x] **Empenho** (encumbrance) — não virou tabela própria: é CALCULADO
      NA LEITURA a partir das Saídas já **aprovadas mas ainda não pagas**
      (v4.5) — reserva de fato o valor no orçamento a partir do momento
      em que o compromisso é assumido, antes do pagamento sair, sem
      duplicar lançamento nenhum (mesmo princípio "calculado na leitura,
      nunca marcação manual" de sempre).
- [x] **Fluxo de Caixa Projetado** (`RelatorioFluxoCaixaProjetado`,
      `shared/tesouraria.js::projetarFluxoCaixa`) — estimativa do saldo
      futuro de um Centro de Custo (Local ou Geral) a partir da média das
      entradas/saídas dos últimos 3 meses + o que já está empenhado em
      aberto. **Rolling forecast** embutido de graça: como é sempre
      recalculado do zero a cada consulta (nunca uma projeção salva),
      toda vez que a tela é aberta já é uma reprojeção ajustada pelo que
      foi realizado desde a última vez — não precisou de um mecanismo de
      revisão periódica separado.

### Segunda parte (entregue) — governança do PDQ

- [x] **Planejamento estratégico PDQ** (`PdqPlanos`/`PdqEixos`/`PdqMetas`/
      `PdqProjetos`, `GestaoPdqPlanos`/`GestaoPdqMetas`/`GestaoPdqProjetos`)
      — plano com **exatamente 3 eixos** (validado no endpoint, Art.
      26-29), metas por eixo, projetos por meta com cronograma físico
      (datas) e financeiro (orçamento previsto). **Atraso é calculado na
      leitura** (hoje passou do fim do cronograma e o projeto não foi
      concluído), nunca marcado à mão. Criar/editar é matéria da CLI
      (permissão `"cli"` já existente, mesma usada em
      `GestaoProjetos`/`SucessaoPresidencial` — não um novo conceito).
- [x] **Fundo de Execução Estratégica** (`GestaoFundoExecucaoPdq`) —
      dotação obrigatória de 10% da arrecadação líquida que a Geral já
      recebeu (Art. 27), tratada como um terceiro Centro de Custo
      (`shared/tesouraria.js::saldoCentroCusto`, `centroCusto='PDQ'`) ao
      lado de Local/Geral (v4.1.3) — sempre calculada na leitura, nunca um
      saldo próprio gravado. **Atualizado em v4.10**: o percentual de 10%
      deixou de ser calculado isoladamente sobre o repasse bruto e passou
      a ser um destino do Rateio Geral (o "malote", junto com Convenção e
      Prebenda Pastoral) — mesmo comportamento externo, cálculo agora
      coordenado com as demais fatias da mesma caixa única. **Suspensão
      excepcional só pelo Pastor
      Presidente de verdade**: `shared/diretoria.js::ehPresidenteAtual`
      verifica o Assento real na Diretoria Executiva (cargo `PRESIDENTE`,
      sem `DataFim`) — não uma permissão genérica como "financeiro" ou
      nível Global, que qualquer Tesoureiro Geral teria. Enquanto
      suspenso, `GestaoSaidas` bloqueia qualquer nova solicitação ou
      pagamento contra esse fundo.
- [x] **Remanejamento com cláusula de barreira** (`GestaoRemanejamentoPdq`,
      Art. 28) — até 20% do orçamento do projeto de origem é aprovado
      automaticamente e já ajusta os dois orçamentos na hora; acima disso
      fica `PENDENTE_CLI` até alguém com permissão `"cli"` e nível Global
      homologar — só aí o ajuste é de fato aplicado.
- [x] **Comissão de Acompanhamento de Projetos / PMO Eclesiástico** (Art.
      30) — `GestaoComissoes` generalizado (não era possível cadastrar
      nenhuma sigla além da CCJ) pra aceitar a sigla `PMO`, reaproveitando
      a mesma tabela `ComissaoMembros` sem criar estrutura nova.
- [x] **Relatório de Progresso do PDQ** (`RelatorioProgressoPdq`) — usado
      tanto pra apresentação na AGO (Art. 29) quanto pelo PMO pra reportar
      trimestralmente à CLI (mesmo dado, dois usos): percentual de
      cumprimento por eixo e geral, projetos atrasados, tudo calculado na
      leitura. **Relatório de Justificativa Técnica** (Art. 29 §1º) não
      virou tela própria — é o campo `JustificativaTecnica`, obrigatório
      no próprio endpoint quando uma meta é marcada `NAO_CUMPRIDA`, sem
      acionar nenhum fluxo disciplinar automático.

## v4.9 — Demonstrações Contábeis (ITG 2002)

- [x] Demonstrações exigidas por lei pra entidades sem finalidade de
      lucros (CFC, Resolução 1.409/12 — ITG 2002), geradas a partir do
      Plano de Contas (v4.2): **Balanço Patrimonial**, **Demonstração do
      Resultado do Período**, **Mutações do Patrimônio Líquido** e
      **Fluxo de Caixa** (`shared/demonstracoes.js`,
      `RelatorioDemonstracoesContabeis`) — todas CALCULADAS NA LEITURA a
      partir de `LancamentosTesouraria`/`SaidasTesouraria`/
      `ContasAReceber`, nenhuma tabela nova de "saldo contábil": o
      **Patrimônio Líquido é sempre o residual** (Ativo Total menos
      Passivo Total, definição contábil), nunca um número gravado à
      parte — por isso Mutações do PL e Balanço nunca podem divergir
      entre si (mesma base de cálculo). **Notas Explicativas**
      (`GestaoNotasExplicativas`) é o único texto qualitativo humano, uma
      entrada por ano. Consolidado de toda a denominação (conta única,
      v4.1.3) — restrito a nível Global.
- [x] Regime de **competência** nas demonstrações formais (reconhece
      quando o fato ocorre, não só quando o dinheiro entra/sai) — o
      registro do dia a dia (`LancamentosTesouraria`) continua em regime
      de caixa (é assim que o Tesoureiro Local vive); a conversão pra
      competência acontece só na geração das demonstrações: receita
      inclui `ContasAReceber` ainda não recebidas (v4.6, sem contar duas
      vezes quando uma confirmação já virou lançamento), despesa inclui
      Saídas já aprovadas mas ainda não pagas (v4.5/v4.8 "empenho") — o
      Fluxo de Caixa é a única demonstração que continua em regime de
      caixa de propósito (é literalmente o que ele mede).
- [x] **Classificação funcional de despesas** (`CategoriasSaida.ClassificacaoFuncional`,
      `ATIVIDADES_FIM` | `ADMINISTRATIVA`) — aparece como subtotal na
      Demonstração do Resultado do Período; alimenta o Índice de
      Aplicação em Atividades-Fim (v4.12, futuro).

## v4.10 — Prebenda e sustento pastoral

Pedido explícito do usuário, com um detalhe operacional que mudou a arquitetura:
antes de pagar qualquer Prebenda, era preciso resolver de onde esse dinheiro
vem de verdade. Os 60% que a Tesouraria Local repassa (Art. 118, v4.1) não
chegam todos juntos — cada congregação libera no próprio ritmo (semanal,
mensal, às vezes atrasada vários meses) — e sobre esse total acumulado
("o malote") incide um SEGUNDO rateio, que não existia até aqui: 10% pra
Convenção (Fundo Convencional), 30% pra Prebenda Pastoral, e o resto vira
Tesouro Geral de fato gastável. Sem controlar esse malote — sem garantir
que um repasse já dividido nunca entra de novo em outra divisão — não dá
pra saber quanto realmente existe de Prebenda disponível.

### Fundação entregue: Rateio Geral (o "malote")

- [x] **Segunda camada de rateio sobre os 60%** (`RateioGeralDestinos`
      configurável, `GestaoRateioGeral`) — Convenção 10%, Prebenda
      Pastoral 30%, Fundo PDQ 10% (migrado da v4.8, que calculava sua
      fatia isolada sobre o repasse bruto sem coordenar com as demais —
      unificado aqui num só mecanismo pra não haver duas fatias
      concorrentes reivindicando a mesma caixa única, v4.1.3). O restante
      (hoje 50%) é sempre o Tesouro Geral, calculado como resíduo.
      "O que é do presidente" e "dízimo do pastor", citados como itens a
      entender a partir deste malote, **não viraram destinos com
      percentual próprio nesta entrega** — nenhum percentual concreto foi
      informado pra eles; basta cadastrar uma nova linha em
      `RateioGeralDestinos` (Financeiro → Plano de Contas → Destinos do
      Rateio Geral) quando o percentual for definido.
- [x] **O malote em si**: cada repasse liberado de uma congregação
      (`FechamentosTesouraria` com `Status='REPASSADO'`) fica visível como
      "pendente de rateio" (`GET /rateio-geral/pendentes`, com o atraso em
      meses calculado na leitura) até a Tesouraria Geral fechar o Rateio
      Geral do mês — que processa TUDO que está pendente de uma vez,
      não importa de qual mês ou congregação seja cada repasse.
- [x] **Regra de ouro, garantida pelo banco de dados**: um repasse só
      entra em UM Rateio Geral — nunca dois. Não é só checagem de
      aplicação: `RateioGeralItens.FechamentoId` é `UNIQUE`, o SQL Server
      recusa fisicamente a duplicidade. "O que já foi rateado não pode
      misturar com o que ainda não foi" — literalmente impossível de
      violar mesmo por erro de código futuro.
- [x] **Centro de Custo Geral corrigido**: antes, `GERAL` liberava o
      repasse bruto direto pra gasto; agora só libera o que sobrou depois
      do Rateio Geral (`RateiosGerais.ValorTesouroGeral`) — Convenção,
      Prebenda e PDQ passam a ser Centros de Custo próprios
      (`CategoriasSaida.CentroCusto`), pagáveis como Saídas normais
      (v4.5) assim que o Rateio Geral os libera.
- **Atenção operacional pra quando isso for pra produção**: como o saldo
  `GERAL` passou a depender do Rateio Geral em vez do repasse bruto, é
  preciso rodar o primeiro "Fechar Rateio Geral" (que varre e concilia
  todo o histórico de repasses já liberados) antes de qualquer nova Saída
  Geral — é a reconciliação retroativa que este controle interno exige.

### Confirmado com o usuário e corrigido depois de revisão

O usuário descreveu com precisão o comportamento esperado e pediu
confirmação — verificado linha por linha do código antes de confirmar
(não só por inspeção visual, checagem adversarial de verdade):

1. Um repasse fechado (`RegistrarRepasseTesouraria`) só vira dinheiro
   gastável pro Tesouro Geral **depois** que alguém aciona o fechamento
   do Rateio Geral — antes disso, fica só "pendente", sem contar em
   nenhum Centro de Custo. **Confirmado.**
2. Um novo repasse da mesma congregação, chegado depois que um Rateio
   Geral anterior já foi fechado, aparece isolado como pendente pro
   **próximo** fechamento — nunca se mistura com o que já foi rateado.
   **Confirmado** — é exatamente o que a cláusula `NOT EXISTS` contra
   `RateioGeralItens` garante, por `FechamentoId` individual.

Essa mesma verificação encontrou uma **race condition real**: o fechamento
do Rateio Geral não rodava em transação — dois fechamentos disparados
quase ao mesmo tempo (ex: duplo clique) podiam gerar um `RateioGeralId`
"quebrado" (criado, mas com itens faltando, sem violar a UNIQUE que só
protege contra duplicar o mesmo repasse). **Corrigido**: o fechamento
inteiro agora roda dentro de uma transação SQL, com `sp_getapplock`
serializando fechamentos concorrentes — ou fecha por completo (rateio +
valores por destino + todos os itens), ou não fecha nada.

### Novo: Situação do Tesouro em Tempo Real

Pedido direto do usuário — "o sonho do Pastor Presidente": saber, a
qualquer momento do mês (não só no fechamento), quanto tem em cada
Centro de Custo. `RelatorioSituacaoTesouro` — um painel único mostrando
Tesouro Geral, Convenção, Prebenda Pastoral, Fundo PDQ, o total pendente
no malote, e o saldo Local de cada congregação, tudo calculado na leitura
a cada abertura da tela (nunca uma foto salva que envelhece).

### Entregue (7ª rodada de fechamento) — os 7 itens que faltavam

Ciclo de verdade do sustento pastoral, fechando a v4.10 além do malote
(059). Novo módulo em Financeiro → **Prebenda** (nível Global):

- [x] Prebenda (natureza alimentar, sem vínculo CLT) como categoria de
      Saída com regras próprias — a categoria e o Centro de Custo já
      existiam (`CategoriasSaida.Codigo = 'PREBENDA_PASTORAL'`, migração
      059); agora existe o **cadastro do prebendado** (`Prebendados` —
      dados do ministro via `MembroReferencia`, CPF, fornecedor PF por
      onde o pagamento sai, valor mensal de referência) e a **geração
      recorrente mensal** (`PrebendaGeracoes`, `GestaoPrebendas`), com a
      Saída correspondente criada já APROVADA — pré-autorizada pela
      deliberação, não pela alçada comum de v4.5.
- [x] **Ato de designação ministerial + valor fixado em deliberação de órgão
      colegiado** (`AtosDesignacao`, `GestaoAtosDesignacao`), com a ata
      vinculada ao registro. Não é burocracia: é exatamente o que sustenta
      juridicamente que a prebenda **não é contraprestação por trabalho** —
      a geração mensal só libera prebenda de prebendado com ato (e ata)
      vinculado. *(Lei 8.212/91 art. 22 §§13-14, redação da Lei 13.137/2015;
      Lei 14.647/2023 afirmou na CLT a inexistência de vínculo entre entidade
      religiosa e seus ministros)*
- [x] **Alerta de risco de descaracterização de vínculo** (`PrebendaRiscosVinculo`)
      — se o sistema registrar jornada, subordinação ou controle de horário do
      ministro, ele próprio avisa (na geração e no painel de alertas): são
      justamente os elementos que a Justiça do Trabalho usa pra reconhecer
      vínculo empregatício, e o risco é da igreja.
- [x] Retenções tributárias/previdenciárias corretas — a igreja **não recolhe os
      20% patronais** sobre prebenda (não é remuneração), o ministro é
      **contribuinte individual** e recolhe a própria contribuição; a prebenda
      **é tributável pelo IRPF**, com **IRRF na fonte** calculado pela tabela
      progressiva configurável (`FaixasIrrf`) — o líquido pago ao ministro é
      `bruto − IRRF`, e o IRRF retido fica gravado na geração pra compor o
      informe anual (v4.19). Errar isso nos dois sentidos custa caro: recolher
      o que não deve é perda de recurso; não reter IRRF é passivo fiscal.
- [x] Vedação à "pejotização" do ministério — `GestaoFornecedores` bloqueia o
      cadastro de ministro com prebenda como fornecedor PJ (v4.5) prestando
      serviço ministerial (Reg. Art. 134-A §1º).
- [x] Pagamento em lote de prebendas via remessa bancária (v4.7) — as Saídas de
      prebenda nascem APROVADAS e entram direto na remessa; `ProcessarRetornoRemessa`
      marca a geração como PAGA quando o banco confirma.
- [x] Auxílios e ajudas de custo distintos da prebenda (`AuxiliosAjudaCusto`,
      `GestaoAuxiliosCusto` — moradia, transporte, saúde), cada um com sua
      natureza fiscal (`INDENIZATORIA` | `ISENTA` | `TRIBUTAVEL_IRPF`) e
      categoria de Saída própria — nada mais cai na mesma rubrica.

## v4.11 — Patrimônio, Alçadas e Depreciação

Novo módulo em Financeiro → **Patrimônio**. Tudo calculado na leitura
(`shared/patrimonio.js`), nunca saldo de depreciação gravado à parte:

- [x] Inventário físico anual de bens (`InventariosAnuais`/`InventarioItens`,
      `GestaoInventarios`) — cada congregação/departamento abre o inventário
      de dezembro (Reg. Art. 59) e lança cada bem com estado de conservação
      e presença física; bens em `BensPatrimoniais` (`GestaoBensPatrimoniais`).
- [x] Teto de Alçada Patrimonial (`GestaoAlienacoesBens`) — **5% do PL** apurado
      no último balanço (calculado na leitura via `shared/demonstracoes.js`,
      reaproveitando a base da v4.9). Até o teto (e sem ser Templo Sede) →
      aprovação da CLI; acima do teto OU Templo Sede → **Assembleia Geral**
      (Art. 58 §1º do Estatuto, I e II).
- [x] Blindagem patrimonial — quarentena de 12 meses (`QuarentenasPatrimoniais`,
      Art. 58 §7º) trava alienação de imóvel; a alienação autorizada pela
      Assembleia exige a **ata vinculada** (assinatura coletiva, Art. 31).
- [x] Registro de escrituras, títulos, alvarás, veículos, contratos
      (`BensDocumentos`, `GestaoDocumentosBens`) sob guarda dos 2º/3º Secretários
      (`ResponsavelCargo = SECRETARIO_2 | SECRETARIO_3`).
- [x] **Depreciação de ativo fixo** (método linear) — cada bem tem vida útil e
      valor residual; a depreciação acumulada e o valor contábil líquido são
      calculados na leitura e alimentam o **Ativo Imobilizado** do Balanço
      Patrimonial (v4.9, `shared/demonstracoes.js`), nunca lançados à mão.
- [x] Casa Pastoral como ativo com regra de ocupação (`CasaPastoralOcupacoes`,
      `GestaoCasaPastoral`, Reg. Art. 115): uso exclusivo do Dirigente Titular,
      vedada cessão a terceiros, destituição automática por uso irregular/"gato"
      de luz-água *(gap da varredura)*.

## v4.12 — Auditoria, Compliance e Indicadores (nível enterprise/"pico")

Nível "pico" entregue — os 4 refinamentos de ERP corporativo/bancário + o
resto do COSO formalizado no sistema (`shared/compliance.js`, `GestaoCompliance`,
`GestaoAuditoria`, `GestaoNif`, `GestaoPrestacoesContas`, `RelatorioIndicadoresFinanceiros`):

- [x] **Trilha de Auditoria Inviolável com Ancoragem Externa** —
      `AuditLog.HashRegistro` (SHA-256 em cadeia: dados do registro + hash do
      registro anterior da mesma tabela, em `shared/auditoria.js`) e
      `AuditoriaAncoragens` + `GET /api/auditoria/cadeia` (verificação de
      integridade) + `POST /api/auditoria/ancoragens` (ancoragem externa —
      RFC 3161 ou registro público). *(RFC 3161, blockchain anchoring,
      tamper-evident audit trails)*
- [x] **Monitoramento Contínuo de Controles (CCM)** — `AlertasCompliance` e
      `GET /api/compliance/alertas` varre na hora: dado bancário alterado
      sem confirmação, fracionamento pra fugir de alçada, fornecedor sem
      histórico recebendo valor alto. *(SOX 404 continuous controls monitoring)*
- [x] **Revisão Periódica de Acessos (Access Recertification)** —
      `RecertificacoesAcesso` + `/api/compliance/recertificacoes`: recertifica
      (ou expira) periodicamente (padrão trimestral) cada pessoa com permissão
      `financeiro`. *(SOX user access review)*
- [x] **Princípio dos Quatro Olhos (dual control)** — `ParametrosCompliance.
      ValorCriticoQuatroOlhos`; `GestaoSaidas` passa a exigir **duas
      aprovações independentes** acima do valor crítico (mesmo que a alçada
      peça 1). *(four-eyes principle / dual control)*
- [x] NIF (Núcleo de Inteligência Financeira) — `NifSinalizacoes` +
      `/api/nif/sinalizacoes` (Avaliação de Riscos do COSO formalizada).
- [x] **Comunicação de Operações Suspeitas (COS/COAF)** — `ComunicacoesCoaf` +
      `/api/nif/comunicacoes` (Lei 9.613/1998, prazo de 24h calculado na
      leitura; só comunica sinalização CONFIRMADA pelo NIF).
- [x] Auditoria em 3 níveis — `AuditoriasNiveis` + `/api/auditoria/niveis`
      (INTERNA | NIF | EXTERNA).
- [x] Parecer mensal do Conselho Fiscal — `PareceresConselhoFiscal` +
      `/api/auditoria/pareceres` (APROVADO/REJEITADO, com documento).
- [x] Bloqueio de repasses por falta de prestação de contas — `PrestacoesContas.
      BloqueioRepasse` (`GestaoPrestacoesContas`).
- [x] Prazo fatal de prestação de contas — dia 1º útil, tolerância dia 5;
      **Ata de Pendência automática** + bloqueio quando falta comprovante de
      água/luz (Reg. Art. 120 §3º) *(gap da varredura)*.
- [x] **Painel de Indicadores Financeiros** — `/api/indicadores-financeiros`:
      Meses de Reserva de Caixa (meta 3, Art. 64), Índice de Aplicação em
      Atividades-Fim (meta 70-80%, ITG 2002) e Índice de Liquidez — calculados
      na leitura, nunca digitados à mão.

## v4.13 — Conciliação Bancária por Importação de Extrato

Decisão de custo (confirmada com o usuário): **não** integrar via Open Finance
(API paga/regulada, com tarifa de adesão e consumo). Em vez disso, a Tesouraria
importa o extrato que o próprio banco já entrega **de graça** no internet banking
(OFX/CSV) e o sistema cruza automaticamente contra Entradas/Saídas — de graça e
funcionando com qualquer banco. `shared/conciliação.js` (parser OFX/CSV) +
`GestaoConciliacaoBancaria`.

- [x] Importação de extrato (OFX/CSV) da conta única (v4.1.3) — `ExtratosBancarios`/
      `ExtratoLinhas`, com o arquivo original guardado como prova documental.
- [x] Cruzamento automático contra `LancamentosTesouraria` (entradas) e
      `SaidasTesouraria` (saídas) — casa por valor + data; `ConciliacoesBancarias`
      + `ConciliacaoDivergencias`.
- [x] Alerta só do que não bate — "só no banco" e "só no sistema" viram
      divergências pra resolver, em vez de conferir lançamento por lançamento.
- [x] Duas trilhas: `CONTA_BANCARIA` (extrato) e `CAIXA_FISICO` (cofre) — dinheiro
      vivo não passa pelo banco, então concilia contra o Fundo Fixo de Caixa
      (v4.5), não contra o extrato. `FontesCaixa` já nasce com as duas.

## v4.14 — Gestão de Investimentos e Tesouraria Avançada (nível enterprise/"pico")

Peça que faltava pra fechar o nível "pico": o Regimento já prevê Política
de Investimentos (Art. 64, Fundo de Reserva — 0,2% das entradas líquidas,
autorização da CLI) e o Painel de Indicadores (v4.12) já cobra "Meses de
Reserva", mas não existia onde **gerir de fato** onde esse dinheiro está
aplicado. `shared/investimentos.js` + `GestaoInvestimentos` + `GestaoCashPooling`.

- [x] Registro de aplicações financeiras (CDB, poupança, fundos, títulos
      públicos) do Fundo de Reserva — `AplicacoesFinanceiras` (instituição,
      valor aplicado, taxa, prazo, liquidez) + `ResgatesAplicacoes`. Vedada
      renda variável/cripto/alto risco (Reg. Art. 64 §2º).
- [x] **Gestão de Portfólio de Investimentos** — `GET /api/investimentos`
      consolida onde está aplicada a reserva: valor atual estimado,
      rentabilidade acumulada, resgatáveis agora e vencendo em 90 dias — tudo
      **calculado na leitura**, nunca digitado à mão no relatório.
- [x] **Previsão de Liquidez com margem de confiança** — `GET
      /api/investimentos/liquidez`: evolução do Fluxo de Caixa Projetado
      (v4.8) com **faixa otimista/conservador** baseada no desvio-padrão
      histórico real das entradas do Tesouro Geral. *(treasury management
      systems, liquidity forecasting)*
- [x] **Cash pooling** — `FontesCaixa.Centralizadora` + `CashPoolingMovimentos`
      + `GET /api/cash-pooling`: posição consolidada (caixa GERAL + aplicações)
      e movimentos de concentração/desconcentração. Hoje é uma conta só + cofre,
      mas o mecanismo já nasce pronto pra múltiplas contas (Art. 140).

## v4.15 — Repasses institucionais

`RepassesInstitucionais` + `GestaoRepassesInstitucionais` + `shared/repassesInstitucionais.js`:

- [x] Repasses obrigatórios de congregações/departamentos/distritos para a
      Matriz — registro por origem (`CONGREGACAO | DEPARTAMENTO | DISTRITO`) +
      mês, com o valor devido calculado na leitura.
- [x] Dízimo institucional de 10% (Art. 126-N, I) para a Sede Geral —
      `ParametrosRepasseInstitucional.PercentualDizimoInstitucional` (10%,
      configurável), aplicado sobre a arrecadação líquida consolidada.
- [x] Alerta de atraso de repasse — `GET /repasses-institucionais/alertas`
      calcula na leitura o que está pendente além da tolerância (padrão dia 5);
      atraso de repasse é infração de intervenção (Art. 144, II).

## 🔒 Trava de Revisão 4-A — antes de avançar para a v4.16

- [ ] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditou v4.11 a v4.15 pelas 5 perguntas do checklist —
      Patrimônio/Alçadas/Depreciação, Auditoria/Compliance, Conciliação
      Bancária, Investimentos e Repasses institucionais mexem todos com
      **dinheiro real e trilha de auditoria**.

  **Bugs corrigidos (código rodando de ponta a ponta / tela real):**
  - v4.11: `.slice` num objeto `Date` quebrava a alienação durante
    quarentena patrimonial (Art. 58 §7º); falta de checagem de escopo em
    `GestaoBensPatrimoniais` (PUT) e em todas as rotas de
    `GestaoInventarios` (financeiro de uma congregação editava bem/
    inventário de outra); item de inventário duplicado estourava a
    constraint SQL sem tratamento; lançamento de item sem trilha de
    auditoria.
  - v4.12: hash do `AuditLog` calculado sobre objeto bruto em vez do JSON
    gravado (verificação de integridade sempre acusava violação falsa);
    verificação da cadeia tratava `AuditLog` como cadeia única global em
    vez de por `Tabela` (quebrava a cada intercalação); colisão de rota
    entre `GestaoAuditoria` e `ListarAuditoria`/`RegistrarAuditoria`; prazo
    de 24h do COAF contado a partir do registro em vez da decisão do NIF.
  - v4.13: parser OFX não reconhecia extratos reais (tags SGML sem
    fechamento); corte de data cortava 2 dígitos a mais; pagamento `MISTO`
    nunca conciliava em nenhuma trilha; `Saídas` (nunca pagas em espécie)
    entrando como candidato falso na trilha do cofre; mismatch de
    PascalCase/camelCase no detalhe da conciliação.
  - v4.14: fórmula de previsão de liquidez só descontava o valor empenhado
    no primeiro mês, inflando as faixas otimista/conservador a partir do
    segundo mês.
  - v4.15: off-by-one no cálculo de atraso (marcava atraso já na madrugada
    do próprio dia de tolerância); faltava validação de faixa nos
    parâmetros do repasse institucional.

  **Lacunas README×código fechadas (não só anotadas):**
  - v4.12 ganhou telas para as 5 funcionalidades que só existiam via API
    (Recertificação de Acessos, Ancoragem externa + verificação da cadeia
    de hash, Auditoria em 3 níveis, Parecer mensal do Conselho Fiscal,
    NIF/COAF), dentro da aba Auditoria já existente.
  - v4.12: prazo fatal de prestação de contas (dia 1º útil, tolerância dia
    5) implementado de verdade, com Ata de Pendência automática — antes só
    checava se o comprovante de água/luz tinha sido anexado, sem checar a
    data (`api/shared/prestacoesContas.js`, novo).
  - v4.13: trilha `CAIXA_FISICO` da Conciliação Bancária agora concilia de
    fato contra `FundoFixoMovimentos` (v4.5) em vez de tratar o cofre igual
    a extrato bancário digitado à mão (migração 066).
  - v4.15: `valorArrecadadoLiquido` do repasse institucional de
    `CONGREGACAO` agora vem do `FechamentosTesouraria` real do mês, em vez
    de digitação manual sujeita a divergência.

  **Pendente para fechar `[x]`**: deploy real de ponta a ponta ainda não
  confirmado — commit feito, aguardando push/CI (migração 066 rodar contra
  o Azure SQL real) e confirmação de que o deploy subiu no ar.

## v4.16 — Seguros institucionais *(gap da varredura)*

`ApolicesSeguro` + `GestaoSeguros`:

- [x] Apólice obrigatória para Templo Sede e grandes eventos (Reg. Art. 65-A) —
      o cadastro valida a cobertura mínima `INCENDIO, DANOS_ELETRICOS, RC` e o
      `GET /seguros/alertas` aponta quando falta apólice vigente (negligência
      grave da gestão, §2º).
- [x] Seguro de Responsabilidade Civil para administradores (Reg. Art. 42-A) —
      tipo `RC_ADMINISTRADORES`, sem cobertura para dolo/fraude/ato ilícito
      (documentado no campo de observação).
- [x] Registro de apólices, vigências e coberturas — seguradora, número, início/
      fim, coberturas, prêmio, documento anexado; vigência (`VIGENTE | VENCIDA |
      A_VENCER | CANCELADA`) calculada na leitura.

## v4.17 — Anexo de Parâmetros Monetários *(gap da varredura)*

`ValoresMonetarios` + `ResolucoesNormativas` + `GestaoParametrosMonetarios`:

- [x] Catálogo de valores monetários fixos (tetos, taxas, valores de referência) com
      correção automática a cada 12 meses por IPCA/salário-mínimo (Reg. Art. 65) —
      mesmo espírito do catálogo `Prazos` (v0.1); `proximaCorrecao`/`correcaoVencida`
      calculados na leitura, e correção em lote via `POST /parametros-monetarios/corrigir-todos`.
- [x] "Anexo Único" mantido pela Secretaria Geral (`GET /parametros-monetarios/anexo`),
      com número/data da Resolução Normativa da CLI que fixou/atualizou cada valor
      (Reg. Art. 162-C §§1-2).

## v4.18 — Cessão de templo a terceiros *(gap da varredura)*

`CessoesTemplo` + `GestaoCessoesTemplo`:

- [x] Autorização de cessão do templo para casamentos/eventos de terceiros
      (Reg. Art. 156) — processo de autorização pela Diretoria + cobrança (vira
      `ContasAReceber`, v4.6) + responsabilização civil.
- [x] Taxa de Zeladoria (ressarcimento de custos, não aluguel) — `TaxaZeladoria`
      + `IsencaoTaxa` (isenção social, §2º III); ao autorizar, gera a Conta a
      Receber da taxa.
- [x] Termo de Responsabilidade por danos (`TermoResponsabilidadeUrl`, §4º II)
      + aprovação prévia da lista musical (`ListaMusicalAprovada`, §1º I) — a
      autorização só sai com os dois.

## v4.19 — Obrigações Acessórias Fiscais *(7ª rodada — risco de multa imediato)*

Achado que muda o patamar de risco do módulo financeiro: a igreja é **imune, não
dispensada**. Imunidade tributária afasta o *imposto*, não a *obrigação
acessória* — e a multa por não entregar existe mesmo sem haver imposto a pagar.
`ObrigacoesFiscais` + `RetencoesFonte` + `GestaoObrigacoesFiscais` +
`RelatorioInformeRendimentos`.

- [x] **ECF (Escrituração Contábil Fiscal)** — obrigação no calendário (prazo
      último dia útil de julho do ano seguinte; multa mínima R$ 500/mês —
      IN RFB 2.004/2021).
- [x] **ECD (Escrituração Contábil Digital)** — `GET /obrigacoes-fiscais/medidor-ecd`
      mostra a receita do exercício vs. gatilho de **R$ 1,2 mi** em tempo real
      (IN RFB 1.420/2015 art. 3º-A), com alerta ao ultrapassar.
- [x] **eSocial + DCTFWeb** — obrigações no calendário (categoria 781 / rubrica
      3525 — prebendas; DARF do IRRF conectado à v4.10).
- [x] **EFD-Reinf R-4000** — `RetencoesFonte` por natureza de rendimento
      (SERVICO_PJ | ALUGUEL_PF | AUTONOMO | IRRF_PREBENDA), competência e
      recolhimento (dia 15 do mês seguinte).
- [x] **Calendário de obrigações por CNPJ** — status (PENDENTE/TRANSMITIDA),
      alerta D-60/D-30/D-7 e vencida calculados na leitura, e **cofre de recibos**
      (`ReciboUrl` ao transmitir).
- [x] Informe anual de rendimentos para ministros e prestadores —
      `GET /api/informes-rendimentos/{ano}`, gerado do próprio sistema (IRRF das
      prebendas v4.10 + pagamentos a prestadores v4.5).

## v4.20 — Painel de Imunidade Tributária *(7ª rodada)*

A imunidade dos templos (CF Art. 150, VI, "b") **não é automática nem
permanente**: o CTN Art. 14 a condiciona a três requisitos, e a pesquisa mostra
que a perda, na prática, quase nunca vem de desvio de dinheiro — vem de
**desorganização formal**. `shared/imunidade.js` + `RelatorioImunidadeTributaria` +
`RelatorioDossieFiscal`.

- [x] **Semáforo dos 3 requisitos do CTN Art. 14**, calculado na leitura:
      (I) não distribuir patrimônio/renda — pagamentos a ministros (CPF casa com
      `Prebendados`) fora de rubrica válida; (II) aplicar recursos integralmente
      no País — `Fornecedores.Estrangeiro`; (III) escrituração formal — % de
      lançamentos com comprovante anexado.
- [x] **Dossiê de defesa fiscal exportável** — `GET /api/dossie-fiscal/{ano}`:
      pacote único (demonstrações v4.9 + balancetes + comprovantes + atas de
      aprovação de contas).
- [x] Alerta de conflito de interesses — pagamento a ministro aprovado por
      parente (cruza `SaidaAprovacoes` + `VinculosFamiliares`, dois mecanismos
      que já existiam e nunca foram cruzados).
- [x] **Reforma tributária (LC 214/2025)** — `SaidasTesouraria.TributosEmbutidos`
      (IBS/CBS na aquisição, custo não recuperável) e relatório de carga tributária
      embutida no painel, pro orçamento (v4.8) não subestimar custo.

## 🔒 Trava de Revisão 4-B — antes de avançar para a v4.21

- [x] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditou v4.16 a v4.20 pelas 5 perguntas do checklist —
      atenção especial à v4.19 (Obrigações Acessórias Fiscais, risco de multa
      mensal imediato) e à v4.20 (Painel de Imunidade Tributária).

  **1. Código roda de ponta a ponta contra o ambiente real?** Sim — as 5
  migrações (066 a 070) rodaram com sucesso contra o Azure SQL real via CI
  (`Executar Migrações SQL`); as 134 functions sobem sem erro no
  `func start` local; toda rota nova (`seguros/{recurso?}`,
  `parametros-monetarios/{recurso?}`, `cessoes-templo/{id?}`,
  `obrigacoes-fiscais/{recurso?}`, `informes-rendimentos/{ano?}`,
  `imunidade-tributaria`, `dossie-fiscal/{ano?}`) usa exatamente o mesmo
  nome no `fetch` do front-end e no `route` do `function.json`.

  **2. Toda tela nova abre e mostra dado de verdade?** Sim — as 5 sub-abas
  (Seguros, Parâmetros Monetários, Cessões, Obrigações, Imunidade) têm botão,
  `div` e todo `getElementById` referenciado pelo `script.js` batendo
  exatamente (case-sensitive) com o `id` correspondente no `index.html`;
  nenhum órfão dos dois lados.

  **3. README e código continuam narrando a mesma coisa?** Sim — toda tabela/
  endpoint citado nos blocos de v4.16 a v4.20 existe de fato (migrações 066-070
  e functions correspondentes); nenhuma referência cruzada (`vX.Y`) solta.

  **4. O que ficou pra trás foi corrigido, não só anotado?** Nada pendente
  encontrado — sem `TODO`/`FIXME`/gambiarra nos arquivos destas 5 versões.

  **5. Deploy real de ponta a ponta aconteceu?** Sim, com uma ressalva: o
  primeiro deploy da v4.20 falhou no Azure (`Failed to deploy the Azure
  Functions`, sem detalhe adicional) — investigado e confirmado como falha
  transitória de infraestrutura, não bug de código (mesmo código, mesmo
  commit, o *rerun* subiu limpo, com as migrações e as 134 functions no ar).
  Fica registrado porque, com 134 functions e crescendo, um deploy falho
  sem causa clara merece checar de novo na próxima trava se virou padrão.

## v4.21 — Receitas acessórias e imóveis *(7ª rodada)*

`ReceitasAcessorias` + `ImoveisSituacaoFiscal` + `GestaoReceitasAcessorias` +
`GestaoImoveis` (migração 071).

- [x] Rubrica de **receita acessória** (`BAZAR | ESTACIONAMENTO | CESSAO_SALAO |
      CANTINA_EVENTO | OUTROS`) com **vínculo obrigatório a uma aplicação
      finalística** — `AplicacaoFinalisticaDescricao` é `NOT NULL`, a API
      recusa o registro sem essa descrição (Súmula Vinculante 52/RE 578.562: a
      imunidade do imóvel cedido/alugado só se mantém se o valor for aplicado
      nas atividades essenciais, e o ônus da prova é da igreja). Quando a
      aplicação já virou uma Saída lançada (v4.5), pode ser vinculada depois
      (`PUT /api/receitas-acessorias`) como comprovação formal. Relatório
      "origem → destino" por imóvel/evento — `GET
      /api/receitas-acessorias/relatorio-origem-destino` agrega arrecadado x
      comprovado x pendente.
- [x] **Cadastro de imóveis** com situação de imunidade por tributo (IPTU/ITBI)
      — `GestaoImoveis` (`GET/POST /api/imoveis/{bemId}`) complementa o
      patrimônio (v4.11, `BensPatrimoniais` Tipo = IMOVEL), que só previa
      escritura, não situação fiscal: número do processo de reconhecimento na
      prefeitura, vigência do IPTU e alerta de renovação (`VIGENTE | A_VENCER
      | VENCIDA`, calculado na leitura, D-60 como nos demais alertas do
      sistema) + status do ITBI.
- [x] Conexão com a v4.18 (cessão de templo): `GestaoCessoesTemplo`, ao
      autorizar uma cessão onerosa (com Taxa de Zeladoria e sem isenção), além
      da Conta a Receber já existente, agora também gera automaticamente a
      `ReceitaAcessoria` (Tipo `CESSAO_SALAO`) com a aplicação finalística já
      declarada — nunca nasce como entrada de caixa solta.

## v4.22 — Doações, Integridade e PLD-FT *(7ª rodada)*

`Doacoes` + `PoliticasInstitucionais` + `CodigoCondutaAceites` +
`FornecedoresDueDiligence` + `DeclaracoesConflitoInteresse` +
`GestaoDoacoes` + `GestaoIntegridade` (migração 072).

- [x] **Política de doações aprovada em ata** + registro de doações de alto valor
      com identificação do doador acima de um limite definido — o limite
      (`LIMITE_IDENTIFICACAO_DOADOR`) entra no catálogo de valores monetários
      (v4.17), corrigível junto com os demais tetos, nunca hardcoded; acima
      dele, `doadorNome`/`doadorCpfCnpj` são obrigatórios. O ponto sensível
      para PLD-FT em organização religiosa é a movimentação **em espécie**
      *(Lei 9.613/98; GAFI Recomendação 8 trata OSFL como setor de risco)*.
- [x] Alerta de doação atípica (valor em espécie acima do limite, ou
      fracionamento — mesmo doador, mesmo mês, soma acima do limite em
      parcelas individualmente menores) alimentando o NIF já previsto na
      v4.12 (`NifSinalizacoes` ganhou `DoacaoId`) — o NIF vira o "COAF
      interno" com dado de entrada real, não só de saída.
- [x] **Programa de integridade** (Lei 12.846/2013 alcança associações e
      fundações; Decreto 11.129/2022 define os parâmetros): código de conduta
      com aceite individual registrado (`CodigoCondutaAceites`), canal de
      denúncia declarado formalmente como a Ouvidoria já existente (v3.7,
      `GET /api/integridade/canal-denuncia`, sem duplicar mecanismo),
      **due diligence de fornecedor** antes do cadastro (v4.5) virar apto a
      pagamento (`FornecedoresDueDiligence`) e declaração de conflito de
      interesses por dirigente, renovada por mandato
      (`DeclaracoesConflitoInteresse`, única por `MembroId` + `MandatoReferencia`).
- [x] Recibo de doação padronizado e numerado — protocolo local
      `DOA-{ano}-{sequencial}` por enquanto; será substituído pelo protocolo
      único da vB.4 quando essa fase existir, sem quebrar os números já
      emitidos (dependência futura documentada, não implementada aqui).

## v4.23 — Frota de veículos *(gap da varredura normativa)*

O Regimento trata frota com nível de detalhe que hoje não tem onde morar no
sistema — inclusive transferindo responsabilidade pessoal ao condutor.
`VeiculosFrota` + `TermosAutorizacaoConducao` + `RetiradasChave` +
`ManutencoesVeiculo` + `GestaoFrota` + `GestaoTermosConducao` +
`GestaoRetiradasChave` + `GestaoManutencaoVeiculo` (migração 073). Veículo
continua sendo `BensPatrimoniais` Tipo = VEICULO (v4.11) — estas tabelas só
guardam o que é específico de frota.

- [x] Cadastro de frota com **identificação visual obrigatória** (Art. 155 §1º,
      II) — `GestaoFrota` marca `identificacaoVisualPendente` enquanto a foto
      não é anexada.
- [x] **Termo de Autorização de Condução por missão específica**, com validação
      de CNH vigente do condutor — a emissão já recusa CNH que vence antes do
      fim previsto da missão; sem termo `ATIVO` e dentro da janela da missão,
      o veículo não sai (checado de fato na retirada de chave, não só um
      aviso) (Art. 155 §2º, I).
- [x] **Livro de retirada de chaves** (`RetiradasChave`: data/hora, condutor,
      missão, retorno) — `MultaTransferidaCondutor` (default verdadeiro) e
      `CustoConsertoImprudenciaValor` sustentam a transferência de
      responsabilidade ao condutor que retirou o veículo (Art. 155 §2º, II-III).
- [x] Custeio de combustível **só mediante nota fiscal com o CNPJ da Igreja**, e
      apenas para o veículo presidencial (Art. 155 §3º, I) — vira **bloqueio
      real** no `GestaoSaidas` (v4.5): categoria `COMBUSTIVEL` exige `bemId` de
      um veículo com `EhVeiculoPresidencial = 1` e a confirmação estrutural de
      nota fiscal no CNPJ da Igreja, senão a solicitação é recusada (Art. 155
      §3º, II-III).
- [x] Manutenção preventiva, licenciamento e seguro por veículo, com alerta de
      vencimento consolidado — `GET /api/manutencoes-veiculo/alertas` junta
      `VeiculosFrota.LicenciamentoVencimento`, a apólice vigente por `BemId`
      (v4.16, `ApolicesSeguro`) e a próxima manutenção agendada num único painel.

## v4.24 — Obras, licenciamento e inauguração de templos *(gap da varredura normativa)*

`ObrasTemplo` + `ObraMarcos` + `GestaoObras` + `GestaoObraMarcos`; AVCB e
Alvará/Habite-se entram em `ImoveisSituacaoFiscal` (v4.21, migração 074).

- [x] Ficha de obra por congregação com marcos (pedra fundamental, Art. 87 §1º),
      orçamento e cronograma físico-financeiro (mesmo espírito do motor de
      projetos do PDQ, v4.8) — `ObraMarcos.SaidaId` amarra o marco a uma Saída
      já lançada (v4.5) quando o gasto real vira pagamento de verdade.
- [x] **Trava de "apto a inaugurar"**: `PUT /api/obras/{id}` com `acao:
      'INAUGURAR'` é uma recusa real (não aviso) sem **AVCB** e
      **Alvará/Habite-se** vigentes (lidos de `ImoveisSituacaoFiscal` pelo
      `BemId` da obra) — Art. 87 §2º, I.
- [x] Regras de placa de inauguração como checklist verificável: a inauguração
      só libera com `PlacaNomesConfirmados` e
      `PlacaSemDoadorPoliticoConfirmado` (Art. 87 §3º) confirmados antes.
- [x] Requisito de eficiência energética em obra nova (Art. 162-A §2º):
      `EficienciaEnergeticaConfirmada` obrigatório quando `EhObraNova = 1`,
      checado na mesma trava de inauguração.
- [x] Vencimento de licenças por imóvel com alerta — `GestaoImoveis` generaliza
      a vigência já usada para IPTU (v4.21) também para AVCB e Alvará,
      calculada na leitura. **Ressalva de honestidade**: "AVCB vencido não pode
      receber culto" é hoje só um **alerta** (`impedidoReceberCulto`) — o
      sistema não tem uma agenda de culto pra travar de fato; quem trava de
      verdade é a inauguração acima.
