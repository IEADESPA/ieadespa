// shared/conferenciaPagamento.js — as conferências de QUALQUER pagamento de Saída, num lugar só.
//
// Antes, só o pagamento comum (GestaoSaidas, ação PAGAR) conferia a tutela, o saldo do centro de custo, o Fundo PDQ suspenso e os dados bancários do
// fornecedor; a remessa bancária (GestaoRemessasBancarias) e o retorno do banco (ProcessarRetornoRemessa) pagavam sem repetir nada disso. Entre a aprovação e
// o envio as condições mudam (tutela aplicada depois, saldo gasto por outro pagamento, Fundo suspenso, dado bancário trocado), então a conferência roda DE NOVO
// no instante em que o dinheiro vai sair: ao gerar a remessa, ao confirmar o retorno e ao pagar na mão — sempre pelo mesmo código, para as três vias não se afastarem.
//
// O que se confere (a ordem é a do pagamento comum, e o resultado traz TODOS os motivos, não só o primeiro):
//   0. [retorno do banco] o valor que o banco diz ter pago é IGUAL ao da Saída, em centavos inteiros; valor ausente ou ilegível no arquivo conta como diferente (falha fechada);
//   1. a Saída está APROVADA (a alçada de valor, os quatro olhos e a segregação de funções foram cumpridos na aprovação; "APROVADA" é o selo disso);
//   2. o fornecedor existe, está ATIVO (Fornecedores.Ativo; vazio = ativo, para a Saída antiga) e os dados bancários dele estão CONFIRMADOS (quem trocou o dado nunca confirma a
//      própria troca) — a solicitação já barrava fornecedor inativo na criação, mas ele pode ser desativado entre a aprovação e o pagamento;
//   3. [remessa] o fornecedor tem banco, agência e conta preenchidos (sem isso o arquivo do banco não monta);
//   4. Fundo PDQ não suspenso pelo Pastor Presidente (centro de custo PDQ);
//   5. a congregação não está sob tutela — Extensão da Tenda tem o caixa local recolhido (centro LOCAL e DEPTO_*);
//   6. o saldo do centro de custo cobre o valor — e, quando pedido, já descontando o que está RESERVADO em remessas ainda sem retorno (e o que a própria
//      geração em andamento já separou), para duas remessas/dois pagamentos não gastarem o mesmo dinheiro;
//   7. a campanha de origem do gasto (fundo restrito) não foi cancelada;
//   8. [pagamento na mão] a Saída não está numa remessa aguardando retorno (o banco pagaria e a Tesouraria pagaria de novo).
// O escopo de quem opera (podeOperarCentroCusto/estaNoEscopo) e o comprovante continuam na rota: não dependem do estado do dinheiro.
//
// Tudo recebe `exec` (algo com `.request()`): o pool, ou { request: () => new sql.Request(transaction) } para rodar DENTRO da transação do chamador,
// debaixo da trava de aplicação "PagamentoSaida" (financeiroSeguro.obterTrava) — é ela que serializa quem lê o saldo e quem grava o pagamento.
const tesouraria = require("./tesouraria");
const psc = require("./psc");

const MOTIVOS = {
  VALOR_PAGO_DIFERENTE: "VALOR_PAGO_DIFERENTE",
  VALOR_PAGO_NAO_INFORMADO: "VALOR_PAGO_NAO_INFORMADO",
  SAIDA_NAO_APROVADA: "SAIDA_NAO_APROVADA",
  CATEGORIA_DESCONHECIDA: "CATEGORIA_DESCONHECIDA",
  FORNECEDOR_INATIVO: "FORNECEDOR_INATIVO",
  FORNECEDOR_NAO_CONFIRMADO: "FORNECEDOR_NAO_CONFIRMADO",
  DADOS_BANCARIOS_INCOMPLETOS: "DADOS_BANCARIOS_INCOMPLETOS",
  FUNDO_PDQ_SUSPENSO: "FUNDO_PDQ_SUSPENSO",
  SOB_TUTELA: "SOB_TUTELA",
  SALDO_INSUFICIENTE: "SALDO_INSUFICIENTE",
  CAMPANHA_CANCELADA: "CAMPANHA_CANCELADA",
  EM_REMESSA_PENDENTE: "EM_REMESSA_PENDENTE"
};

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const centroComCongregacao = (centroCusto) => centroCusto === "LOCAL" || !!tesouraria.centroCustoDepartamental(centroCusto);
const chaveSaldo = (centroCusto, congregacaoId) => (centroComCongregacao(centroCusto) ? `${centroCusto}|${Number(congregacaoId)}` : String(centroCusto));
const nomeDoCentro = (centroCusto) => (centroCusto === "GERAL" ? "Geral" : centroCusto === "PDQ" ? "PDQ" : "Local");
const brl = (n) => Number(n).toFixed(2);

// Fornecedor desativado? Só `Ativo = 0/false` conta: vazio (NULL, coluna ainda não preenchida numa Saída antiga) ou ausente da consulta = ativo, para não travar pagamento antigo.
const fornecedorInativo = (ativo) => ativo === false || ativo === 0 || ativo === "0";

// Valor em REAIS (DECIMAL de duas casas, como vem do banco) para CENTAVOS inteiros, sem multiplicar float: o texto de duas casas é partido e remontado. Valor que não é número
// finito devolve null (quem chama trata como "não deu para conferir").
function centavosDe(valor) {
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === "" || !Number.isFinite(n)) return null;
  const [inteiro, fracao] = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? -1 : 1) * (Number(inteiro) * 100 + Number(fracao));
}
const reaisDe = (centavos) => (centavos / 100).toFixed(2);

// A Saída como a conferência a entende (nomes em minúsculo; as rotas selecionam com estes apelidos).
// `travar`: lê a linha com UPDLOCK/HOLDLOCK (dentro de transação) para ninguém cancelar/pagar a mesma Saída por baixo enquanto se decide.
async function carregarSaida(exec, sql, saidaId, { travar = false } = {}) {
  const r = await exec.request().input("saidaId", sql.Int, saidaId).query(`
    SELECT sa.SaidaId AS saidaId, sa.CongregacaoId AS congregacaoId, sa.Valor AS valor, sa.Status AS status, sa.Tipo AS tipo, sa.CampanhaId AS campanhaId,
           cs.CentroCusto AS centroCusto, sa.FornecedorId AS fornecedorId, f.Nome AS fornecedorNome, f.Ativo AS fornecedorAtivo, f.DadosBancariosConfirmados AS dadosBancariosConfirmados,
           f.Banco AS banco, f.Agencia AS agencia, f.Conta AS conta
    FROM SaidasTesouraria sa ${travar ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
    LEFT JOIN CategoriasSaida cs ON cs.Codigo = sa.Tipo
    LEFT JOIN Fornecedores f ON f.FornecedorId = sa.FornecedorId
    WHERE sa.SaidaId = @saidaId
  `);
  return r.recordset[0] || null;
}

// Quanto do centro de custo já está comprometido com pagamentos que o banco já pagou e ainda não foram tratados (item DIVERGENTE: o dinheiro saiu, mas a Saída não
// virou PAGA) e — com `incluirPendentes` — com os que o banco está processando (item PENDENTE de remessa, Saída ainda APROVADA). Sem isso o saldo, que só enxerga Saída
// PAGA, seria gasto duas vezes. `ignorarSaidaId`: a própria Saída que está sendo conferida não conta contra si mesma.
async function reservadoEmRemessas(exec, sql, centroCusto, congregacaoId, ignorarSaidaId, { incluirPendentes = true } = {}) {
  const requisicao = exec.request().input("centroCusto", sql.NVarChar(20), centroCusto).input("ignorar", sql.Int, ignorarSaidaId || 0);
  let filtroCongregacao = "";
  if (centroComCongregacao(centroCusto)) { requisicao.input("congregacaoId", sql.Int, congregacaoId); filtroCongregacao = "AND sr.CongregacaoId = @congregacaoId"; }
  const pendentes = incluirPendentes ? "(ri.Status = 'PENDENTE' AND sr.Status = 'APROVADA') OR " : "";
  const r = await requisicao.query(`
    SELECT ISNULL(SUM(sr.Valor), 0) AS total
    FROM RemessaItens ri
    JOIN SaidasTesouraria sr ON sr.SaidaId = ri.SaidaId
    JOIN CategoriasSaida cr ON cr.Codigo = sr.Tipo
    WHERE cr.CentroCusto = @centroCusto AND sr.SaidaId <> @ignorar ${filtroCongregacao}
      AND (${pendentes}ri.Status = 'DIVERGENTE')
  `);
  return round2(Number(r.recordset[0] ? r.recordset[0].total : 0));
}

// A Saída está num item de remessa aguardando o retorno do banco (ou já paga pelo banco e a tratar)?
async function emRemessaPendente(exec, sql, saidaId) {
  const r = await exec.request().input("saidaId", sql.Int, saidaId)
    .query(`SELECT TOP 1 ri.RemessaItemId AS remessaItemId FROM RemessaItens ri WHERE ri.SaidaId = @saidaId AND ri.Status IN ('PENDENTE', 'DIVERGENTE')`);
  return r.recordset.length > 0;
}

// Cria um conferidor: guarda em memória o que já consultou (tutela por congregação, suspensão do PDQ, saldo por centro, campanha) para um lote de Saídas não repetir
// as mesmas consultas, e o que o lote já separou (`reservar`). Vale só dentro da trava: um conferidor por geração de remessa, por pagamento ou por item de retorno.
//   reservas — o que se desconta do saldo além das Saídas já PAGAS:
//     "todas"      (geração de remessa e pagamento na mão): o que está reservado em remessas ainda sem retorno E o que o banco já pagou e está a tratar (DIVERGENTE);
//     "divergentes" (retorno do banco): só o que o banco já pagou e está a tratar — os itens PENDENTES não entram, porque o que se confirma agora é justamente um deles;
//     "nenhuma"    : só o saldo calculado.
function criarConferidor(exec, sql, { reservas = "nenhuma" } = {}) {
  let suspensaoPdq;
  const tutelas = new Map();
  const saldos = new Map();
  const campanhas = new Map();
  const separadoNoLote = new Map();

  async function suspensaoDoPdq() {
    if (suspensaoPdq === undefined) suspensaoPdq = (await tesouraria.suspensaoAtivaFundoPdq(exec, sql)) || null;
    return suspensaoPdq;
  }
  async function tutelaDe(congregacaoId) {
    if (!tutelas.has(congregacaoId)) tutelas.set(congregacaoId, await psc.consultarTutela(exec, congregacaoId));
    return tutelas.get(congregacaoId);
  }
  async function saldoDe(centroCusto, congregacaoId) {
    const chave = chaveSaldo(centroCusto, congregacaoId);
    if (!saldos.has(chave)) saldos.set(chave, await tesouraria.saldoCentroCusto(exec, sql, centroCusto, congregacaoId));
    return saldos.get(chave);
  }
  async function statusDaCampanha(campanhaId) {
    if (!campanhas.has(campanhaId)) {
      const r = await exec.request().input("id", sql.Int, campanhaId).query(`SELECT Status FROM Campanhas WHERE CampanhaId = @id`);
      campanhas.set(campanhaId, r.recordset.length === 0 ? null : r.recordset[0].Status);
    }
    return campanhas.get(campanhaId);
  }

  // `opcoes.exigirContaBancaria`: banco/agência/conta preenchidos (remessa). `opcoes.verificarRemessaPendente`: a Saída não está em remessa aguardando retorno (pagamento na mão).
  // `opcoes.valorPagoBanco` ({ centavos, problema }, só no retorno do banco): o que o arquivo do banco diz ter pago, em centavos inteiros; `problema` ("AUSENTE" | "ILEGIVEL")
  // marca o campo que o arquivo não trouxe ou não deu para ler. Sem esta opção (pagamento na mão, remessa) o valor não é comparado: ainda não há o que o banco tenha pago.
  async function conferir(saida, opcoes = {}) {
    const motivos = [];
    const barra = (codigo, mensagem) => motivos.push({ codigo, mensagem });
    if (opcoes.valorPagoBanco) {
      // Falha fechada: valor que o arquivo não trouxe (ou veio ilegível) NUNCA vale como "igual" — o dinheiro pode ter saído por outro valor e só o extrato do banco diz.
      const { centavos, problema } = opcoes.valorPagoBanco;
      const esperado = centavosDe(saida.valor);
      if (problema === "ILEGIVEL") {
        barra(MOTIVOS.VALOR_PAGO_NAO_INFORMADO, "O arquivo de retorno trouxe o valor pago ilegível — confira o extrato do banco antes de reconhecer este pagamento.");
      } else if (problema || !Number.isSafeInteger(centavos)) {
        barra(MOTIVOS.VALOR_PAGO_NAO_INFORMADO, "O arquivo de retorno não informou o valor efetivamente pago — confira o extrato do banco antes de reconhecer este pagamento.");
      } else if (esperado === null || centavos !== esperado) {
        barra(MOTIVOS.VALOR_PAGO_DIFERENTE, `Valor pago pelo banco diferente do valor da Saída (pago R$ ${reaisDe(centavos)}, esperado R$ ${esperado === null ? "?" : reaisDe(esperado)}) — confira o extrato do banco.`);
      }
    }
    if (saida.status !== "APROVADA") {
      barra(MOTIVOS.SAIDA_NAO_APROVADA, `Só é possível pagar uma solicitação já aprovada (situação atual: ${saida.status}).`);
    }
    if (!saida.centroCusto) {
      // Sem a categoria não há como saber de qual saldo sai o dinheiro nem se a congregação está sob tutela: falha fechada.
      barra(MOTIVOS.CATEGORIA_DESCONHECIDA, "A categoria desta Saída não foi encontrada — não dá para conferir o saldo do centro de custo nem a tutela. Corrija o cadastro de categorias.");
    }
    if (saida.fornecedorId && fornecedorInativo(saida.fornecedorAtivo)) {
      barra(MOTIVOS.FORNECEDOR_INATIVO, "Fornecedor inativo: reative o cadastro ou use outro fornecedor.");
    }
    if (!saida.fornecedorId || !saida.dadosBancariosConfirmados) {
      barra(MOTIVOS.FORNECEDOR_NAO_CONFIRMADO, "Os dados bancários deste fornecedor mudaram e ainda não foram confirmados — não é possível pagar agora.");
    }
    if (opcoes.exigirContaBancaria && !(saida.banco && saida.agencia && saida.conta)) {
      barra(MOTIVOS.DADOS_BANCARIOS_INCOMPLETOS, "O fornecedor não tem banco, agência e conta preenchidos — sem isso o arquivo do banco não pode ser montado.");
    }
    if (saida.centroCusto === "PDQ") {
      const suspensao = await suspensaoDoPdq();
      if (suspensao) {
        barra(MOTIVOS.FUNDO_PDQ_SUSPENSO, `O Fundo de Execução Estratégica (PDQ) está suspenso pelo Pastor Presidente desde ${new Date(suspensao.SuspensoEm).toLocaleDateString("pt-BR")} — não é possível pagar agora.`);
      }
    }
    if (saida.centroCusto && (saida.centroCusto === "LOCAL" || tesouraria.centroCustoDepartamental(saida.centroCusto))) {
      const tutela = await tutelaDe(saida.congregacaoId);
      if (tutela.sobTutela) barra(MOTIVOS.SOB_TUTELA, tutela.mensagem);
    }
    if (saida.centroCusto) {
      const saldoReal = await saldoDe(saida.centroCusto, saida.congregacaoId);
      let reservado = 0;
      if (reservas !== "nenhuma") {
        reservado = await reservadoEmRemessas(exec, sql, saida.centroCusto, saida.congregacaoId, saida.saidaId, { incluirPendentes: reservas === "todas" });
        reservado = round2(reservado + (separadoNoLote.get(chaveSaldo(saida.centroCusto, saida.congregacaoId)) || 0));
      }
      const disponivel = round2(saldoReal - reservado);
      if (Number(saida.valor) > disponivel) {
        const sufixo = reservado > 0 ? `, já descontados R$ ${brl(reservado)} reservados para pagamentos em remessa bancária` : "";
        barra(MOTIVOS.SALDO_INSUFICIENTE, `Saldo insuficiente no Centro de Custo ${nomeDoCentro(saida.centroCusto)} (disponível: R$ ${brl(disponivel)}${sufixo}).`);
      }
    }
    if (saida.campanhaId) {
      const statusCampanha = await statusDaCampanha(saida.campanhaId);
      if (statusCampanha === null || statusCampanha === "CANCELADA") {
        barra(MOTIVOS.CAMPANHA_CANCELADA, "A campanha de origem deste gasto foi cancelada — não é possível pagar.");
      }
    }
    if (opcoes.verificarRemessaPendente && (await emRemessaPendente(exec, sql, saida.saidaId))) {
      barra(MOTIVOS.EM_REMESSA_PENDENTE, "Esta Saída já está numa remessa bancária aguardando o retorno do banco — processe o retorno (ou trate a divergência) antes de pagá-la de outro jeito, para o mesmo valor não sair duas vezes.");
    }
    return { ok: motivos.length === 0, motivos };
  }

  // A Saída entrou no lote: o saldo dela fica separado para as próximas conferências do MESMO lote.
  function reservar(saida) {
    const chave = chaveSaldo(saida.centroCusto, saida.congregacaoId);
    separadoNoLote.set(chave, round2((separadoNoLote.get(chave) || 0) + Number(saida.valor)));
  }

  return { conferir, reservar };
}

// Os motivos viram um texto só (frases em sequência) quando precisam caber numa coluna de texto; `limite` corta no tamanho da coluna.
function resumirMotivos(motivos, limite = 300) {
  const texto = motivos.map(m => m.mensagem).join(" ");
  return texto.length <= limite ? texto : texto.slice(0, limite - 1) + "…";
}

module.exports = { MOTIVOS, carregarSaida, reservadoEmRemessas, emRemessaPendente, criarConferidor, resumirMotivos, chaveSaldo, centavosDe, fornecedorInativo };
