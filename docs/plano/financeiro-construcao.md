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
| 200 | `FinFolhasOcorrencias` | a exceção de uma folha: cancelada, arrancada ou extraviada, com a observação (a folha lançada vem do lançamento) |
| 200 | `FinLivroBlocos` | o livro de entrada e saída: o cadastro do lote, a saída (entregue a quem, de qual congregação; a área só leva) e a entrada (devolvido por quem; recebe a Tesouraria Geral) |
| 201 | `FinLancamentos` | a folha preenchida: bloco, folha, dia, hora (sozinha), tipo (dízimo, oferta de culto, oferta voluntária), forma (espécie ou Pix), valor, a voluntária junto do dízimo, o dizimista (matrícula ou nome digitado), "Este mês" ou "Mês posterior" e o mês em que soma (calculado) |
| 201 | `FinRelatoriosMes` | o relatório do mês de cada congregação: a folha em que começa (a 1ª marcada "mês posterior" no mês anterior) e a última, a situação (aberto, mandado, conferido pela Geral, fechado pelo Conselho Fiscal), a reabertura só com o voto do Conselho e a autorização do Ministério |
| 202 | `FinDizimosDigitais` | o Pix que o membro informa; ligado a uma folha do bloco (quem liga escolhe a folha livre) ou excluído com o motivo (o membro é avisado) |
| 203 | `FinPreRepasses`, `FinComprovantesPix`, `FinDespesasCongregacionais` | o pré-repasse por período (corte com dia e hora), os comprovantes anexados (foto ou PDF), as despesas congregacionais (cadastra a congregação, aceita a Geral; obra só o Presidente) |
| 204 | `FinCaixaDias`, `FinCaixaMovimentos`, `FinRecibos` | o caixa único da Geral (abre e fecha; espécie e Pix separados; "a espécie virou Pix" com o comprovante; espécie zero no fim do dia) e o recibo com o código do QR |
| 205 | `FinExtratoBanco`, `FinExtratoCongregacao` | o arquivo do extrato da Cora (até a ligação automática) e o extrato de cada congregação na Geral (entra Pix e espécie; sai a parte da Geral quando o relatório fecha e a despesa dela paga pela Geral) |
| 206 | `FinPercentuaisRateio`, `FinRateios`, `FinRateioItens` | os percentuais com a data em que passam a valer (30/60/10 e o dízimo do pastor), o rateio (escolher → rateado) e o que entrou em cada um |
| 207 | `FinSaidas` | a saída de cada centro de custo (fornecedor da Igreja inteira, comprovante) |
| 208 | `FinDocumentos` | o código de validação de cada folha do mural e de cada recibo (o QR abre a página pública que diz se existe e é aquele) |

## 3. As rotas (todas com sessão e escopo desde o começo)

Uma pasta por rota em `api/` (`function.json` + `index.js`); a regra pura em `api/shared/fin<Tema>.js` e as consultas em
`api/shared/fin<Tema>Db.js`. Prefixo `/api/financeiro/...` (nenhuma rota antiga usa). A permissão é `financeiro`; o escopo
pela congregação do registro (`escopoRotas.congregacaoNoEscopo`); o que é da Igreja inteira (lote da gráfica, centros de
custo da Geral, percentuais, caixa, rateio) só no nível geral (`exigirGeral`); atos sensíveis (saldo de abertura, estorno,
reabrir o mês) pedem `exigirFatorRecente` (428). Fora do escopo e "não existe" dão a mesma resposta.

| Rota | Caminho | O que faz |
| --- | --- | --- |
| `FinCentrosCusto` | `financeiro/centros-custo/{acao?}` | a árvore com os saldos; o saldo de abertura (geral, 428); o estorno |
| `FinBlocos` | `financeiro/blocos/{acao?}` | a lista (filtro e páginas de 40), as folhas de um bloco, o livro; o lote da gráfica (geral); entregar e devolver (geral); a ocorrência da folha |
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
| 3 | Lançar dízimos e ofertas: a planilha e a linha de lançar, "Este mês"/"Mês posterior", as folhas de outro mês, o dizimista do cadastro (migração 201) | r24 `r24-lancamento` op. 1 (na página r26) |
| 4 | O dízimo digital: o membro informa; ligar escolhendo a folha livre ou excluir com motivo; o lançar e o fechar impedidos até resolver (migração 202) | r22 `r22-dizimo-digital` op. 1 (a mais nova; r21 op. 1 e r20 op. 2 antes) |
| 5 | O caminho do repasse e o conferir: o pré-repasse por período, o corte com dia e hora, os comprovantes de Pix anexados, as despesas congregacionais (migração 203) | r20 `r20-repasse-fluxo` op. 1; r24 `r24-repasse-conferir` op. 2 sem a aba "Espécie e digital" (ver a pergunta 2) |
| 6 | O caixa único em 4 passos e o recibo (a folha do recebimento com o QR) (migração 204) | r21 `r21-caixa` op. 1; r20 `r20-folha-recebimento` op. 1 |
| 7 | Quanto cada congregação tem na Geral: o extrato sem mês e a conta geral (migração 205) | r26 `r26-saldo-congregacoes` op. 1 |
| 8 | O rateio em duas páginas, sozinho para cada centro de custo, com estorno (migração 206) | r21 `r21-rateio` op. 1 |
| 9 | O tesouro e as saídas de cada centro de custo; o que a congregação e a área veem dos 60% delas (migração 207) | r21 `r21-tesouro` op. 1 |
| 10 | A folha do mural: 50 nomes por folha, contínua, o QR e "folha 2 de 3" em cada folha, 3 assinaturas; a página do QR (migração 208) | r26 `r26-folha-mural` op. 1 |
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
