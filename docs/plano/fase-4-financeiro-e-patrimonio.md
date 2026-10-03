# FASE 4 — Financeiro e Patrimônio

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## v4.1 — Tesouraria Local e Repasses (Entradas)

Digitaliza o "bloco de dízimo" físico + a folha de fechamento mensal
impressa hoje (planilha Excel): lançamentos de dízimo/oferta por
congregação com Termo nº gerado pelo servidor (nunca digitado à mão),
comprovante obrigatório em PIX, fechamento mensal com o rateio do
**Art. 118 sempre calculado na leitura** (40% retenção local / 60% repasse
à Tesouraria Geral, deduzindo antes aluguel e lote — validado batendo com
um relatório real de congregação), registro do repasse com comprovante, e
relatório em duas versões (completa, e versão "mural" sem os valores por
dizimista — mesmo padrão de redação condicional usado em Ouvidoria/
Disciplina). Perfis de acesso territoriais completos desde já — Tesoureiro
Local/Área/Região/Quadrante/Distrito/Geral, todos usando o mesmo motor
Papel×Escopo×Permissão já existente (nenhuma tela nova de "dar acesso":
são só mais Papéis na tela de Lideranca de sempre) — cada um enxerga
automaticamente as congregações do seu território, com consolidado e
drill-down. Módulo com entrada própria e destacada no painel (não misturado
na lista comum de abas), por lidar com dinheiro real — mesmo login/sessão
do resto do sistema.

- [x] Cadastro de dizimistas por congregação (`Dizimistas`) — substitui a
      planilha; aceita nome avulso pra quem não é dizimista cadastrado.
- [x] Lançamentos de entrada (`LancamentosTesouraria`) com Termo nº
      sequencial e contínuo por congregação, tipo (Dízimo/Oferta), forma de
      pagamento (Dinheiro/PIX/Misto — ver v4.1.1), travados assim que o mês
      fecha.
- [x] Fechamento mensal (`FechamentosTesouraria`): Total Recebido − Aluguel
      − Lote = Total Final, rateado pelo percentual de retenção local
      (Art. 118, editável por congregação em `GestaoParametrosTesouraria` —
      hoje 40/60, mas não hardcoded caso a Assembleia mude a regra).
      Imutável após criado (correção via novo lançamento auditado, não
      reescrita de histórico).
- [x] Registro do repasse à Tesouraria Geral com comprovante opcional.
- [x] Relatório completo (uso interno) e relatório "mural" (sem os valores
      por dizimista, pra afixar publicamente).
- [x] Perfis territoriais de acesso (Tesoureiro Local/Área/Região/
      Quadrante/Distrito — Geral já existia) + visão consolidada com
      drill-down por congregação dentro do escopo de cada um.

### v4.1.1 — Flexibilidade real (a partir do processo físico de verdade)

Ajustes feitos a partir de como o bloco de dízimo funciona na prática, pra
não travar o Tesoureiro em situações reais que a v4.1 ainda não previa:

- [x] Comprovante de PIX/Misto agora é opcional na hora do lançamento —
      pode chegar depois (`PUT /tesouraria-lancamentos/{id}` anexa), fica
      marcado como "comprovante pendente" até lá. Antes exigia na hora, o
      que travava o fluxo quando a pessoa manda o comprovante só depois.
- [x] Pagamento misto (parte em dinheiro, parte em PIX no mesmo
      lançamento) — `FormaPagamento = 'MISTO'` + `ValorPix` (o restante do
      valor é considerado dinheiro).
- [x] Cancelamento nunca mais é exclusão — vira um cancelamento motivado
      que preserva o Termo nº e aparece no relatório como "CANCELADO —
      motivo", igual à folha arrancada do bloco físico (a numeração nunca
      pode simplesmente sumir, senão não bate com o talão original).
- [x] Transparência no "Meu Painel": quem é dizimista vinculado a um
      cadastro de membro vê o próprio histórico de contribuições
      (`MeusLancamentosTesouraria`, mesmo padrão de autoatendimento por
      matrícula de `MeusDadosLGPD`/`MinhaFoto` — pedido explícito do
      usuário por transparência).
- [x] Confirmado (já funcionava desde a v4.1, sem precisar de mudança):
      dizimista não precisa ser membro cadastrado — `Dizimistas.MembroId`
      é opcional, e o lançamento aceita nome avulso pra quem nunca foi
      cadastrado (visitante, cônjuge não-membro etc.) — "só crentes podem
      dizimar" não é "só membros podem dizimar".

### v4.1.2 — Visualização e conciliação (feedback de uso real)

O v4.1/v4.1.1 tratava bem o *registro* da entrada, mas faltava a parte de
*acompanhamento* — a reação direta ao usar na prática foi "está muito cru".
Três lacunas concretas corrigidas:

- [x] **Lista de Dizimistas do Mês** (`RelatorioDizimistasMes`, sub-aba
      própria) — antes só existia a lista de LANÇAMENTOS (por termo); agora
      existe a lista de PESSOAS, cruzando o cadastro de dizimistas com quem
      já contribuiu no mês e quem ainda não (mais os avulsos que
      contribuíram sem estar cadastrados).
- [x] **Status de contabilização visível** — o dado já existia (um
      lançamento só entra num Fechamento quando o mês fecha), só não
      aparecia na tela. Agora toda linha mostra "Contabilizado" ou
      "Pendente de fechamento" claramente.
- [x] **Conciliação de PIX em lote** (`ConciliarPixTesouraria`,
      `ConciliacoesTesouraria`) — exigir 1 comprovante por PIX travava a
      agilidade real: agora dá pra marcar vários PIX/Misto pendentes e
      anexar UM extrato bancário só cobrindo a soma, em vez de abrir recibo
      por recibo. Continua podendo anexar comprovante individual quando faz
      mais sentido (não substitui, complementa).
- [x] **Forma do repasse à Tesouraria Geral** (`FechamentosTesouraria.FormaRepasse`)
      — o próprio repasse de 60% pode ser em PIX, depósito ou dinheiro
      entregue em mãos; antes só registrava que o repasse aconteceu, não
      como.

**Descartado desta versão (não é esquecimento — vira v4.1.3, depende dos
dados destas versões já existirem):** saldo virtual por órgão/departamento
(Reg. Art. 133-C — fase seguinte trata só Tesouraria Geral + Congregações,
não departamentos como UMADESPA/EBD), lançamentos de **saída**, conciliação
bancária mensal *do total do caixa* (a conciliação desta versão é só de
PIX, ver acima), teto de acumulação de caixa local de 10 salários-mínimos
com recolhimento automático do excedente (Reg. Art. 119), fiscalização
contábil formal do Conselho Fiscal (Reg. Art. 145). Também fica para depois
(precisa de meses de dados reais primeiro): recálculo automático de
`MembroReferencia.DizimistaFiel` a partir do histórico de lançamentos, em
vez do bit editado manualmente hoje.

### v4.1.3 — Centro de Custo (caixa único de verdade)

Correção de modelo a partir de como a tesouraria funciona hoje de fato
(confirmado com o usuário): existe **uma única conta bancária** pra toda a
denominação — qualquer congregação deposita direto nela, não existe "a
congregação manda 60% pra Geral" como movimentação bancária real (o
dinheiro já está todo no mesmo lugar desde o depósito). O que existe é a
Tesouraria Geral conferindo o fechamento e **liberando** o saldo virtual
de 40% (Centro de Custo Local) pra congregação poder gastar.

- [x] `RegistrarRepasseTesouraria` agora exige nível **GLOBAL**
      (`auth.exigirNivelGlobal`-equivalente) — antes qualquer um com
      `financeiro` no escopo da própria congregação podia "se autoliberar",
      o que não faz sentido nesse modelo (quem confere e libera é sempre a
      Geral, nunca o próprio local).
- [x] Linguagem da UI corrigida pra refletir a direção certa: "Registrar
      repasse" virou "Tesouraria Geral: conferir e liberar"; status
      `REPASSADO`/`FECHADO` aparecem como "Saldo liberado" / "Aguardando
      liberação da Tesouraria Geral".
- [x] `ListarFechamentosTesouraria` ganhou os agregados de Centro de Custo:
      `centroCustoGeral` (liberado vs. pendente de conferência) e
      `porCongregacao` (saldo liberado vs. pendente de liberação por
      congregação) — visão na sub-aba Consolidado.
- **Decisão explícita — não fazer ainda:** quando um dia existirem contas
  bancárias por congregação (Regimento Art. 140 — CNPJ de filial), a
  liberação vira movimentação real entre contas e o endpoint muda; até lá
  é liberação de saldo dentro do caixa único, sem transferência de verdade.
- **Auditoria formal do Conselho Fiscal adiada de propósito** (decisão
  explícita — não compensa investir agora): a conferência da Geral hoje é
  simples (conferir e liberar); o fluxo completo de auditoria financeira
  (aceitar/rejeitar relatório, parecer formal) só faz sentido depois do
  módulo financeiro completo, incluindo **saídas** — fica pra mais adiante,
  junto com Fiscalização do Conselho Fiscal (Art. 145).

### v4.1.4 — Categorias de Entrada (revertida e substituída pela v4.1.5)

Tentativa inicial: um `Tipo = 'OUTRA'` genérico com aprovação individual da
Geral. **Corrigido a partir de feedback direto do usuário** — ver v4.1.5.

### v4.1.5 — Categorias de Entrada nomeadas (correção de rumo)

Não existe "outras entradas" genérica — pedido explícito, com justificativa
de compliance: um balde sem categoria nomeada é exatamente o tipo de
rubrica que esconde lavagem de dinheiro. A congregação tem várias fontes
de entrada reais e nomeadas (dízimo, oferta, entrada de departamento,
oferta de culto de departamento, secretaria, revista, congresso...) — cada
uma precisa ser uma categoria com nome próprio, não um "outros".

- [x] `CategoriasEntrada` — catálogo configurável (via `GestaoCatalogos`,
      mesmo padrão de Departamentos/Congregações — dá pra cadastrar mais
      categorias em Catálogos, sem mexer em código). `LancamentosTesouraria.Tipo`
      passa a ser o `Codigo` de uma categoria em vez de um enum fixo no
      código. Seed inicial: Dízimo, Oferta, Entrada de Departamento, Oferta
      de Culto do Departamento, Entrada de Secretaria, Entrada de Revista,
      Entrada de Congresso.
- [x] Todas as categorias passam pelo **mesmo fluxo** (lançamento →
      fechamento mensal → rateio 40/60 → liberação da Geral) — **sem**
      aprovação individual extra por categoria; a supervisão é o fechamento
      + liberação de sempre (v4.1.3), que já olha o mês inteiro.
- [x] `Descricao` (nota livre) fica disponível pra **qualquer** categoria,
      não só uma — e pelo menos um entre dizimista/nome avulso/descrição é
      sempre obrigatório (nunca existe uma entrada sem procedência
      identificada, é exatamente esse buraco que gera risco de compliance).
- **Revertido desta versão:** `Tipo='OUTRA'`, `StatusAprovacao`,
  `AprovarEntradaTesouraria` (removido) — não fazem mais sentido com a
  categorização nomeada.
- **Fechamentos mensais já são "automáticos"** por design desde a v4.1: o
  rateio 40/60 (Centro de Custo Local/Geral) é sempre **calculado a partir
  dos lançamentos**, nunca digitado — não existe "lançar de novo" o
  resultado de um fechamento.
- **Fora do escopo desta versão, registrado pra não esquecer:** um módulo
  de "contas a receber" (registrar um boleto/valor esperado antes de
  receber de fato) foi mencionado como ideia de pesquisa, mas não é uma
  entrada de dinheiro real — vira, se fizer sentido, uma peça própria
  depois que o essencial de entradas estiver maduro. Centro de Custo por
  Área/Região também não existe hoje (essas unidades não guardam dinheiro
  próprio, são coordenação) — só Local e Geral, como já é; Distrito pode
  vir a ter um centro de custo próprio no futuro, mas isso é história pra
  mais adiante.

### v4.1.6 — Navegação por sub-módulos (pedido explícito)

Financeiro parou de abrir direto num formulário de "cadastrar dízimo" —
quem clica precisa entender logo de cara o que está procurando. Nova
sub-aba "Visão Geral" (`SUBMODULOS_FINANCEIRO`, `app/script.js`) vira a
porta de entrada: uma grade de cards, um por sub-módulo financeiro do
roadmap (README, FASE 4) — "Entradas" já funciona (leva pro que já existe
desde v4.1); os demais (Saídas, Orçamento, Patrimônio, Doações Online,
Auditoria) aparecem visíveis, mas marcados "Em breve" e desabilitados —
mostra o caminho sem fingir que já foi construído. Crescer aqui, quando
cada peça do roadmap for implementada, é só marcar `pronto: true` no
array — mesmo espírito do objeto `MODULOS` do painel principal (seção
2.6), um nível mais fundo.
