# Financeiro (módulo 2): o plano da construção

Escrito em 21/11/2026 pelo agente de construção, no ramo `v10-financeiro-svelte` (feito a partir do `v10-membros-svelte`,
que tem a casca nova e o front Svelte). As regras de negócio estão em
[`fase-10-experiencia-design-performance.md`](fase-10-experiencia-design-performance.md#financeiro-módulo-2-o-desenho-aprovado-e-o-que-a-igreja-vive-hoje);
este documento diz **como** se constrói, em que ordem e com que prova. Cada incremento reproduz uma tela APROVADA e leva o
par "aprovado × construído" (mesmo nível, modo e aparelho).

## 1. O que já existe (o inventário de 21/11/2026)

**No servidor e no banco (o Financeiro antigo, em JS, em produção):** ~37 rotas (`GestaoLancamentosTesouraria`,
`FecharMesTesouraria`, `RegistrarRepasseTesouraria`, `GestaoRateioGeral`, `GestaoSaidas`, `GestaoFornecedores`,
`GestaoConciliacaoBancaria`, `GestaoOrcamentos`, `GestaoBensPatrimoniais`...) e as tabelas das migrações 043 a 097
(`LancamentosTesouraria`, `Dizimistas`, `FechamentosTesouraria`, `RateiosGerais` + `RateioGeralDestinos`, `SaidasTesouraria`,
`CategoriasEntrada/Saida`, `PlanoContas`, `Fornecedores`, `ExtratosBancarios`...). Esse modelo nasceu do Regimento e carrega o
que **não existe** na Igreja:

| No banco antigo | A realidade aprovada (19 a 21/11/2026) |
| --- | --- |
| "malote" do Rateio Geral (`RateioGeralItens`), destinos Prebenda 30%, PDQ 10%, Convenção 10% | rateio só dos 60% da Geral: Presidente 30%, Tesouro Geral 60%, Convenção 10% + o dízimo do pastor (10% dos 30%) |
| `CentroCusto` é um texto (`LOCAL`, `GERAL`, `PDQ`, `DEPTO_X`) | centenas de centros de custo da Igreja inteira, em árvore |
| 40/60 sobre o bruto, com aluguel e lote em colunas fixas da congregação | "Despesas congregacionais" numa linha só (aluguel, lote, obra liberada), descontadas ANTES do líquido |
| `TermoNumero` sequencial digital, `MesReferencia` digitado | blocos de papel numerados, folhas contínuas, "Este mês" e "Mês posterior" |
| fechamento por congregação e mês, repasse = fechamento | pré-repasse por período (corte com dia e hora), caixa único da Geral, extrato por congregação sem mês |

**Decisão de construção (a registrar com ele, sem mudar regra):** o Financeiro novo usa **tabelas novas, com o prefixo `Fin`**,
e **não regrava** as antigas. Motivos: (1) começa em janeiro de 2027 só com os saldos de abertura (o ano de 2026 não vem);
(2) o modelo antigo tem conceitos reprovados; (3) as telas antigas continuam funcionando na produção até a troca, sem risco de
migração de dados no meio do ano. Reaproveita-se o que é da Igreja inteira e já serve: `Congregacoes`, `Areas`,
`MembroReferencia`, `Fornecedores`, os papéis com a permissão `financeiro` (Tesoureiro Geral, Local, de Área) e a trilha
(`shared/auditoria.js`). Na troca (missão futura, com o OK dele), as rotas antigas de lançamento ficam só de leitura.

**No front Svelte (ramo `v10-membros-svelte`):** `front/src/comum/` (Botao, Campo, Cartao, Chip, Pilulas, Etapas, Icone,
MenuModulo, Estado, EmConstrucao, `api.ts`, `ponte.ts`, `tokens.css`) e o módulo Membros (`front/src/membros/`). A casca
(`app/modulos/casca.js`) só conhece o Membros: `abrirMembrosSvelte` monta o menu em `#membrosMenuRaiz` e as telas em
`#membrosRaiz`; o `vite.config.ts` tem uma entrada só e chama o CSS de `membros.css`. **O Financeiro precisa de uma segunda
entrada** (ver o incremento 1b).

**As provas que já existem:** `npx jest` (api, banco simulado), `tools/e2e-localdb` (os handlers reais contra o LocalDB; o
Financeiro usa a instância própria `fin` e o banco `ieadespa_fin`, para não atropelar o agente de Membros, que usa `psc7`),
`npm run check` e `npm run conferir` (front), o teste de telas do CI na homologação e as fotos dos pares
(`C:/tmp/ieadespa-financeiro/ferramentas/foto.sh` desenha o aprovado direto das páginas de propostas).

## 2. O modelo de dados (tabelas novas `Fin*`)

Dinheiro em `DECIMAL(14,2)`. Nada se apaga nem se reabre: o erro se corrige com **estorno** (movimento contrário com o
motivo), e toda ação grava na trilha. Toda migração é idempotente (`IF NOT EXISTS`). As migrações do Financeiro começam na
**200** (o Membros vai até a 184 e cresce).

| Migração | Tabela | Para quê |
| --- | --- | --- |
| 200 | `FinCentrosCusto` | os centros de custo da Igreja inteira, em árvore (`CentroPaiId`): os 3 da Geral (Presidente, Tesouro Geral, Convenção) e um por congregação, que **nascem sozinhos**; departamentos e secretarias depois (fora da 1ª entrega) |
| 200 | `FinMovimentosCentro` | o livro de cada centro de custo (valor com sinal); nesta migração só o tipo `ABERTURA` (o saldo de abertura, positivo ou negativo) e o `ESTORNO` |
| 200 | `FinLotesGrafica` | o lote da gráfica: a série (ano), a primeira e a última folha, as folhas por bloco (50) |
| 200 | `FinBlocos` | cada bloco: o número (calculado pela primeira folha: 70.051 → bloco 1.401), a primeira e a última folha, com quem está (Tesouraria Geral ou a congregação), a situação (na Geral, esperando, em uso, fechado) |
| 200 | `FinFolhas` | o destino de cada folha agora: lançada (vem do lançamento) ou a exceção (cancelada, arrancada ou extraviada, com a observação); a folha sem linha está livre. Desde a 201, a entrega (saída) em que a folha foi usada (`SaidaId`) |
| 200 | `FinLivroBlocos` | o livro de entrada e saída: o cadastro do lote, a saída (entregue a quem, de qual congregação; a área só leva) e a entrada (devolvido por quem; recebe a Tesouraria Geral) |
| 201 | índices, `FinFolhasDesfeitas` e a devolução parcial | a revisão de 23/11/2026 e a regra dele de 24/11 (ver "As regras dele de 23 e 24/11/2026"): os índices que a 200 deixou sem; o histórico da exceção desfeita; a faixa da saída, a saída que cada entrada fecha, se a devolução foi parcial e a faixa que voltou livre |
| 202 | `FinLancamentos` | a folha preenchida: bloco, folha, dia, hora (sozinha), tipo (dízimo, oferta de culto, oferta voluntária), forma (espécie ou Pix), valor, a voluntária junto do dízimo, o dizimista (matrícula ou nome digitado), "Este mês" ou "Mês posterior" e o mês em que soma (calculado) |
| 202 | `FinRelatoriosMes` | o relatório do mês de cada congregação: a folha em que começa (a 1ª marcada "mês posterior" no mês anterior) e a última, a situação (aberto, mandado, conferido pela Geral, fechado pelo Conselho Fiscal), a reabertura só com o voto do Conselho e a autorização do Ministério |
| 203 | `FinDizimosDigitais` | o Pix que o membro informa; ligado a uma folha do bloco (quem liga escolhe a folha livre) ou excluído com o motivo (o membro é avisado) |
| 204 | `FinPreRepasses`, `FinComprovantesPix`, `FinDespesasCongregacionais` | o pré-repasse por período (corte com dia e hora), os comprovantes anexados (foto ou PDF), as despesas congregacionais (cadastra a congregação, aceita a Geral; obra só o Presidente) |
| 205 | `FinCaixaDias`, `FinCaixaMovimentos`, `FinRecibos` | o caixa único da Geral (abre e fecha; espécie e Pix separados; "a espécie virou Pix" com o comprovante; espécie zero no fim do dia) e o recibo com o código do QR |
| 206 | `FinExtratoBanco`, `FinExtratoCongregacao` | o arquivo do extrato da Cora (até a ligação automática) e o extrato de cada congregação na Geral (entra Pix e espécie; sai a parte da Geral quando o relatório fecha e a despesa dela paga pela Geral) |
| 207 | `FinPercentuaisRateio`, `FinRateios`, `FinRateioItens` | os percentuais com a data em que passam a valer (30/60/10 e o dízimo do pastor), o rateio (escolher → rateado) e o que entrou em cada um |
| 208 | `FinSaidas` | a saída de cada centro de custo (fornecedor da Igreja inteira, comprovante) |
| 209 | `FinDocumentos` | o código de validação de cada folha do mural e de cada recibo (o QR abre a página pública que diz se existe e é aquele) |

## 3. As rotas (todas com sessão e escopo desde o começo)

Uma pasta por rota em `api/` (`function.json` + `index.js`); a regra pura em `api/shared/fin<Tema>.js` e as consultas em
`api/shared/fin<Tema>Db.js`. Prefixo `/api/financeiro/...` (nenhuma rota antiga usa). A permissão é `financeiro`; o escopo
pela congregação do registro (`escopoRotas.congregacaoNoEscopo`); o que é da Igreja inteira (lote da gráfica, centros de
custo da Geral, percentuais, caixa, rateio) só no nível geral (`exigirGeral`); atos sensíveis (saldo de abertura, estorno,
reabrir o mês) pedem `exigirFatorRecente` (428). Fora do escopo e "não existe" dão a mesma resposta.

| Rota | Caminho | O que faz |
| --- | --- | --- |
| `FinCentrosCusto` | `financeiro/centros-custo/{acao?}` | a árvore com os saldos; o saldo de abertura (geral, 428); o estorno. **Ainda não existe** (24/11/2026): só as tabelas estão na 200; a regra e a rota nascem com o desenho do saldo de abertura (rodada 27) |
| `FinBlocos` | `financeiro/blocos/{acao?}` | a lista (filtro e páginas de 40), as folhas de um bloco, o livro; o lote da gráfica (geral); entregar e devolver, completa ou parcial (geral); a exceção da folha e desfazê-la (geral, com o motivo) |
| `FinLancamentos` | `financeiro/lancamentos/{acao?}` | a planilha do mês da congregação, salvar as linhas, a linha de lançar |
| `FinDizimoDigital` | `financeiro/dizimo-digital/{acao?}` e `meu-dizimo-digital` | informar (membro), ligar a uma folha, excluir com motivo |
| `FinRepasses` | `financeiro/repasses/{acao?}` | o pré-repasse, os comprovantes, conferir com o corte, fechar o relatório |
| `FinCaixa` | `financeiro/caixa/{acao?}` | o dia do caixa, receber, a espécie virou Pix, fechar o dia, o recibo |
| `FinSaldoCongregacoes` | `financeiro/saldo-congregacoes/{acao?}` | o extrato de cada congregação e a conta geral; o arquivo do extrato |
| `FinRateio` | `financeiro/rateio/{acao?}` | o que ratear, ratear, estornar |
| `FinTesouro` | `financeiro/tesouro/{acao?}` | os centros de custo da Geral, as saídas |
| `FinMural` | `financeiro/mural/{acao?}` | as folhas do mural do mês (50 nomes por folha) |
| `ConferirDocumentoFin` | `conferir-financeiro/{codigo}` | pública, com limitador: a página do QR diz se a folha ou o recibo existe e é aquele |
| `FinRelatorios`, `FinContador` | `financeiro/relatorios`, `financeiro/contador` | "Monte o seu gráfico"; o ano numa linha e o pacote do contador |

## 4. Os incrementos, em ordem de dependência

Cada um com uns 30 minutos de trabalho, commit e push no fim. A prova de todos: `npx jest` do que mudou, o roteiro
`tools/e2e-localdb/e2e-2NN-*.js` no LocalDB próprio, `npm run check` sem aviso e o build conferido, e o **par** (foto do
aprovado × foto do construído) em `C:/tmp/ieadespa-financeiro/pares/`, nos níveis geral, área e local, claro e escuro,
notebook e celular. Divergência volta para a construção; não vai para ele.

| # | O incremento | A tela aprovada que reproduz (rodada, `id`, opção) |
| --- | --- | --- |
| 1a | O modelo base (migração 200), a regra dos blocos e dos centros de custo, a rota `FinBlocos` e `FinCentrosCusto` (leitura e saldo de abertura) | — (servidor) |
| 1b | O módulo Financeiro na casca: a 2ª entrada do Svelte, o menu "por tipo de trabalho" e a 1ª tela | r13 `r13-fin-menu` op. 1 (o `FIN13`); r17 `r17-blocos` op. 1 |
| 2 | As folhas do bloco e o livro de entrada e saída (o lote da gráfica, entregar, devolver, o rastreio) | r17 `r17-blocos-folhas` op. 1; r17 `r17-blocos-livro` op. 1 |
| 3 | Lançar dízimos e ofertas: a planilha e a linha de lançar, "Este mês"/"Mês posterior", as folhas de outro mês, o dizimista do cadastro (migração 202) | r24 `r24-lancamento` op. 1 (na página r26) |
| 4 | O dízimo digital: o membro informa; ligar escolhendo a folha livre ou excluir com motivo; o lançar e o fechar impedidos até resolver (migração 203) | r22 `r22-dizimo-digital` op. 1 (a mais nova; r21 op. 1 e r20 op. 2 antes) |
| 5 | O caminho do repasse e o conferir: o pré-repasse por período, o corte com dia e hora, os comprovantes de Pix anexados, as despesas congregacionais (migração 204) | r20 `r20-repasse-fluxo` op. 1; r24 `r24-repasse-conferir` op. 2 sem a aba "Espécie e digital" (ver a pergunta 2) |
| 6 | O caixa único em 4 passos e o recibo (a folha do recebimento com o QR) (migração 205) | r21 `r21-caixa` op. 1; r20 `r20-folha-recebimento` op. 1 |
| 7 | Quanto cada congregação tem na Geral: o extrato sem mês e a conta geral (migração 206) | r26 `r26-saldo-congregacoes` op. 1 |
| 8 | O rateio em duas páginas, sozinho para cada centro de custo, com estorno (migração 207) | r21 `r21-rateio` op. 1 |
| 9 | O tesouro e as saídas de cada centro de custo; o que a congregação e a área veem dos 60% delas (migração 208) | r21 `r21-tesouro` op. 1 |
| 10 | A folha do mural: 50 nomes por folha, contínua, o QR e "folha 2 de 3" em cada folha, 3 assinaturas; a página do QR (migração 209) | r26 `r26-folha-mural` op. 1 |
| 11 | O relatório do mês fechado pelo Conselho Fiscal (a reabertura só com o voto e a autorização do Ministério) e "Minhas contribuições" na Minha vida | sem tela própria aprovada: perguntar antes (pergunta 4) |
| 12 | Relatórios: para onde vai o dinheiro e as tendências ("Monte o seu gráfico") | r20 `r20-relatorios` op. 3 |
| 13 | O contador: o ano numa linha e o resumo; a planilha no formato ITG 2002 | r21 `r21-contador` op. 1 |

**A peça comum do seletor de congregação** (r20 `r20-seletor` op. 1: a área primeiro, depois a congregação, com a procura) é
o item 1 do que falta em Membros: o agente de Membros a faz em `front/src/comum/`, e o Financeiro a usa a partir do
incremento 3. Até lá, a 1ª tela mostra o nível como no desenho (o cadeado "Vila Nova" no local, "Sede administrativa" na Geral).

**Fora da 1ª entrega** (decisão dele): departamentos e secretarias (com Missões), que continuam como hoje até nascer o módulo
de cada um; o resto do Financeiro do Regimento (orçamento, PDQ, patrimônio, imunidade...), que aparece no menu aprovado como
"em construção".

## 5. Homologação e produção

Cada incremento provado vai ao ramo `homolog` (antes: `git fetch`, `gh run list` para não cruzar com um deploy em curso;
conflito com o Membros se resolve sem perder nada dele) e se confere com `bash tools/conferir-deploy.sh <commit>` ("DEPLOY
OK"). A semeadura da homologação (`api/scripts/semear-homologacao.js`) ganha a massa fictícia do Financeiro a partir do
incremento 1b. A produção só com o OK dele, numa missão própria, com a troca das telas antigas em janeiro de 2027.

## 6. As perguntas de regra para ele (não se adivinha)

1. **O número do bloco.** O desenho calcula pela primeira folha (70.051 → bloco 1.401; 68.001 → 1.360), mas duas linhas da
   tela fogem disso (1.377 para 68.801 e 1.380 para 68.951). Vale a conta pela primeira folha?
2. **O conferir do repasse.** Na rodada 24 a escolha foi a opção 2 ("os 3 passos numa página"), com "não entendi nada dessas 3
   telas"; a 3ª parte virou "Quanto cada congregação tem na Geral" (r26). Vale a opção 2 da r24 sem a aba "Espécie e digital"?
3. **"Marcada em novembro" no lançamento.** Na folha do mural ele mandou tirar "(marcada em outubro)" e o fundo roxo; na tela
   de lançar (r24, aprovada "como está") a coluna "Referente a" ainda mostra "marcada em novembro". Fica no lançamento?
4. **O fechamento do mês pelo Conselho Fiscal e o saldo de abertura** não têm tela desenhada nas rodadas 20 a 26: desenhar
   antes (uma rodada curta) ou seguir a tela "Fechamento do mês" da rodada 17?
5. **As 5 dúvidas da rodada 20 ainda abertas** (a espécie da congregação vai para a conta dela ou para a geral; o retido fica
   em dinheiro ou é depositado; o Pix dos membros cai direto na geral; receitas acima de R$ 4,8 milhões e a ECD; mostrar
   "atrasada"): a maioria foi respondida nas rodadas 21 a 26 (ver o plano); as que sobrarem entram no incremento 5.

### As respostas dele (22/11/2026, antes da rodada 27)

1. **O número do bloco sai da primeira folha** (blocos de 50: a folha 70.051 é do bloco 1.401). Ninguém digita o número; as duas
   linhas do desenho que fugiam da conta ficam calculadas pela regra (68.801 → bloco 1.376; 68.951 → 1.379). Construído assim no 1a
   (`shared/finBlocos.js`, `numeroDoBloco`) e mostrado assim no 1b.
2. **"Conferir o repasse" volta redesenhado e simples na rodada 27** (a Tesouraria Geral recebe o que a congregação mandou, confere,
   aceita e dá o recibo do repasse, semanal ou mensal). O incremento 5 espera esse desenho; a opção 2 da r24 não se constrói.
3. **"Marcada em novembro" sai da tela de lançar** (coluna "Referente a"), igual ao mural. A folha de outro mês continua com a tarja
   "Mês posterior". Vale para o incremento 3 (o lançamento).
4. **O fechamento do mês e os saldos de abertura serão desenhados na rodada 27.** Nada dessas partes se constrói antes do desenho
   aprovado. Já se sabe: só o Conselho Fiscal fecha o mês, cada conselheiro vota com o próprio acesso e o mês fecha (ou reabre)
   pela maioria; a reabertura ainda precisa da autorização do Ministério, com a data; a Geral pode travar os lançamentos durante a
   auditoria. O saldo de abertura a Tesouraria Geral lança (pode ser negativo) com o comprovante e o Conselho Fiscal confere e
   confirma antes de valer (primeiro o Tesouro Geral e a Convenção).

### O que o incremento 1b decidiu na construção (sem mudar regra)

- **O menu** é o aprovado da rodada 17 (r17-blocos op. 1): os 7 grupos "por tipo de trabalho" com o resumo no alto de cada um, os
  blocos de recibo e os tipos de entrada e saída, filtrado por nível como no desenho (a Geral vê tudo). Só o grupo da tela aberta
  vem aberto. Os itens que as rodadas 18 a 26 acrescentaram (despesas congregacionais, caixa único, para o contador, saldo das
  congregações) entram no incremento da tela de cada um. Item ainda não construído abre o aviso "em construção".
- **A entrada:** o cartão do módulo passa a se chamar "Finanças" (o nome do desenho) e abre a aba nova `financas` (as telas Svelte).
  Quem só tem `tesouraria_departamental` continua na aba antiga `financeiro` (as Saídas do departamento): os departamentos ficam
  fora da 1ª entrega e continuam como hoje. O menu antigo fica escondido enquanto as telas novas estão abertas.
- **O CSS das telas Svelte** virou um arquivo só para todos os módulos (`app/svelte/telas.css`; antes `membros.css`): com
  `cssCodeSplit: false` o Vite junta o estilo de todas as entradas, e o estilo de cada peça é isolado pelo Svelte.
- **O nível no alto à direita** ("Sede administrativa", "Área 2", o cadeado "Vila Nova") aparece como no desenho, mas sem a seta de
  escolher: a escolha da congregação vem com a peça comum do seletor (r20-seletor), a partir do incremento 3.
- **A área vê o quadro do lote da gráfica**, como no desenho (o servidor do 1a dava "Seus blocos" a ela). A lista diz quem está
  vendo (`escopo`: a Geral, quantas congregações, a área e a congregação) para o título da página e o cabeçalho do módulo.
- **O bloco que ainda está na Tesouraria Geral** (só a Geral vê) aparece com a etiqueta "Na Geral" e o uso "chegou da gráfica dd/mm"
  ou "ainda na gráfica": o desenho só mostra blocos já entregues.
- **"Cadastrar lote da gráfica"** (Geral) mostra que o cadastro vem num próximo incremento. *Correção de 24/11/2026:* o desenho do
  formulário existe, sim: foi aprovado na rodada 27 (`r27-lote-grafica`; commit 34c792f, fontes em 1f7d51c), e a chegada com os números
  pulados na rodada 28 (`r28-lote-chegada`). Ainda não construído (o servidor do cadastro e da chegada já existe); entra num incremento
  próprio, com o par aprovado × construído.
- **As páginas** mostram só as que existem (o desenho repete "1 2 3 4 5" mesmo com 2 blocos); no celular, "Próxima página" só quando
  há próxima.

### O que o incremento 2 decidiu na construção (23/11/2026, sem mudar regra)

- **As abas "Folhas do bloco" e "Livro de entrada e saída"** são as aprovadas da rodada 17 (r17-blocos-folhas e r17-blocos-livro,
  opção 1), nos 3 níveis, claro e escuro, notebook e celular. A prova é `tools/front-financeiro/navegador.js`.
- **Folhas:** só a folha livre de um bloco que está com a congregação aceita a exceção; o bloco devolvido aparece só para consulta.
  A Geral e a área escolhem o bloco no alto (os entregues e os 50 devolvidos mais novos); a congregação vê o bloco em uso dela, sem
  seletor, como no desenho. No celular as primeiras folhas com destino viram uma linha, em dezenas (38 com destino → "1ª a 30ª").
- **Livro:** a devolução vai pela primeira folha do bloco que o rastreio achou (a pessoa pode digitar qualquer folha dele, com ou sem
  ponto); quem devolveu é alguém da lista do rastreio (quem levou o bloco e a liderança da congregação) ou "outra pessoa", com o nome
  escrito. O bloco que ainda está na Geral e o já devolvido mostram o rastreio, mas não se registram. A linha do livro segue o texto
  do desenho ("devolvido por Bela Vista", "pela congregação Sede"; todas as folhas lançadas = "50 conferidas").
- **Sem desenho, o menor desvio:** a folha **extraviada** usa o azul das notas (já aprovado) e entra na legenda só quando o bloco tem
  uma; o registro **"chegada" do lote** no livro escreve "Chegada: lote da gráfica, série 2026 · 100 blocos chegaram"; na congregação,
  "Seus blocos agora" conta o bloco cheio ainda não devolvido como "em uso" (como a aba Blocos).
- **"Registrar saída" (a entrega) não tem formulário aprovado:** o botão mostra o aviso de que vem num próximo incremento. O servidor
  da entrega já existe (`POST financeiro/blocos/entregar`).

### As regras dele de 23 e 24/11/2026 (a revisão do incremento 2, migração 201)

- **Desfazer a exceção da folha (23/11, vale):** só a Tesouraria Geral, escrevendo o motivo, nunca em bloco já devolvido nem em folha
  de uma entrega que já voltou; a folha lançada se corrige pelo lançamento. A linha sai de `FinFolhas` e vai inteira para
  `FinFolhasDesfeitas` (quem marcou e quando, o que era, quem desfez, quando e por quê), na mesma transação; a folha volta a ficar
  livre. Rota `POST financeiro/blocos/desfazer-folha`.
- **A devolução (24/11, no lugar da "devolução só de bloco cheio" de 23/11), com o detalhe da rodada 30:** a entrada leva a marca
  **completa** ou **parcial**, e nada se recusa por folha livre.
  - **Completa:** o bloco fecha. O recibo ainda não lançado passa normalmente (a folha sem destino continua com a congregação).
  - **Parcial:** a tesouraria informa a **primeira folha em branco** (o rastreio sugere: a seguinte à última folha com destino da
    entrega). Ela tem de ser da entrega e vir depois da última folha com destino. Dela até a 50ª, as folhas voltam **livres**; a
    folha sem destino antes dela continua com a congregação. O bloco fica na Tesouraria Geral, e a aba Blocos o mostra "parcial · N
    livres" (a API manda `parcial`, `livres` e `faixa`; o texto da tela vem com a r30 aprovada).
  - **A nova saída do bloco parcial** aceita só as folhas livres, começando pela primeira livre, e a data não vem antes da volta.
    Continuam a data da entrega não antes da chegada da gráfica, só congregação ativa e a recusa própria do bloco que já voltou.
  - **Quem recebe** vê as folhas usadas antes só para consulta (sem a observação de outra congregação) e só marca as da sua entrega.
    **Quem devolveu** continua vendo as suas folhas (até a anterior à primeira em branco), com o cabeçalho da entrega dela (a
    congregação, a data da entrega e a da volta, "fechado"), sem ver o que acontece com as livres depois.
  - **O livro:** a saída traz a faixa entregue; a entrada traz se foi parcial, a faixa que voltou livre (`faixaLivre`), a contagem só
    das folhas da entrega que ela fecha e os `pendentes` (as folhas da entrega sem destino). A contagem não muda quando o bloco sai de
    novo. Quem usou cada folha fica no histórico dela (`FinFolhas.SaidaId`).
  - **O banco confere** (CHECK): a saída tem a faixa; a entrada parcial tem a faixa que voltou livre e a completa não tem; toda entrada
    fecha uma saída, e uma saída se fecha uma vez só; toda folha com destino diz a entrega em que foi usada.
- **Para o lançamento (incremento 3):** a gravação da folha lançada trava a linha do bloco pela chave (`UPDLOCK, ROWLOCK`, na mesma
  ordem da exceção, do desfazer e da devolução), grava `SaidaId` = a saída em curso e só aceita folha da faixa da entrega em curso. As
  folhas sem destino de uma entrega que já voltou (os pendentes) hoje ninguém marca: quem lhes dá destino, e quando, é pergunta aberta.

### Perguntas abertas do incremento 2 (para ele)

1. O formulário de "Registrar saída" (entregar o bloco a uma congregação): desenhar numa rodada curta? Pela regra já falada, quem leva
   é o tesoureiro, o dirigente ou outra pessoa da congregação; a área só leva e o bloco nunca fica com ela.
2. A folha extraviada ficou no azul das notas: serve, ou ele quer outra cor?
3. No celular (todos os níveis) e na congregação (também no notebook) o desenho não tem o seletor do bloco: aparece o bloco em uso
   mais recente. Quando a congregação tem dois blocos abertos, ela precisa escolher?
4. (24/11) A folha sem destino de uma entrega que voltou em parte (o recibo ainda não lançado, que ficou com a congregação): quem lhe
   dá destino depois da volta, e quando? Hoje ninguém marca (nem a Geral); o lançamento do incremento 3 é o caminho natural.
5. (24/11) Quem recebe o bloco parcial vê as folhas usadas antes sem a observação de outra congregação; só a Geral vê todas. Serve?
6. (24/11) O bloco que voltou sem uso nenhum (a primeira em branco é a primeira folha da entrega) não aparece em "Folhas do bloco"
   para quem o devolveu (não há folha dele); no livro, a saída e a entrada continuam. Serve?
