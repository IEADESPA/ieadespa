// shared/cessaoEstorno.js — o que acontece com a COBRANÇA de uma cessão de templo quando a cessão é cancelada.
//
// Ao AUTORIZAR uma cessão onerosa nascem, juntas, uma Conta a Receber (ContasAReceber, Tipo CESSAO_TEMPLO) e uma Receita Acessória (ReceitasAcessorias, Tipo CESSAO_SALAO, com
// CessaoTemploId). Cancelar a cessão tem de desfazer as duas NA MESMA TRANSAÇÃO do cancelamento, senão a conta segue somando em "a receber", no balanço e no DRP como se a taxa
// ainda fosse chegar (receita sem lastro). Regras (decisão do responsável, 03/10/2026):
//   - conta ainda PREVISTA (nada foi recebido): vira CANCELADO, com o motivo "Cessão cancelada", quem e quando — some dos saldos a receber e do que for inadimplência;
//   - conta já CANCELADA (alguém a cancelou antes): nada a fazer, o cancelamento da cessão segue;
//   - conta RECEBIDA e o lançamento do recebimento ainda ATIVO: o cancelamento é BLOQUEADO (a cessão fica como está). Devolver o dinheiro ao solicitante é um ato financeiro à
//     parte; a mensagem descreve o caminho. Recebimento em parte não existe no sistema (CONFIRMAR é do valor inteiro) — se vier a existir, qualquer conta fora de PREVISTO
//     continua bloqueando;
//   - conta RECEBIDA cujo lançamento JÁ FOI CANCELADO pela Tesouraria (a devolução foi feita e o recebimento estornado do caixa): a conta também é cancelada, para a receita não ficar
//     de pé sem o dinheiro.
// A leitura da conta usa UPDLOCK/HOLDLOCK: um CONFIRMAR de recebimento simultâneo (GestaoContasReceber, que trava a mesma linha) espera este cancelamento ou o cancelamento espera
// o recebimento — nunca os dois passam, e nunca fica "cancelada com o dinheiro no caixa".
// `exec` é { request: () => new sql.Request(transaction) }: tudo roda dentro da transação do chamador.
const MOTIVO_PADRAO = "Cessão cancelada";

function motivoDoEstorno(motivoInformado, sufixo) {
  const base = typeof motivoInformado === "string" && motivoInformado.trim() ? `${MOTIVO_PADRAO}: ${motivoInformado.trim()}` : MOTIVO_PADRAO;
  const completo = sufixo ? `${base} (${sufixo})` : base;
  return completo.length <= 300 ? completo : completo.slice(0, 299) + "…";
}

const brl = (n) => Number(n).toFixed(2).replace(".", ",");

function mensagemDeRecebimento(conta) {
  const termo = conta.termoNumero ? ` — Termo nº ${conta.termoNumero}` : "";
  return `Esta cessão NÃO pôde ser cancelada: a taxa de zeladoria (R$ ${brl(conta.valor)}) já foi recebida e está lançada na Tesouraria${termo}. Devolver o valor ao solicitante é um ato financeiro à parte, `
    + "da Tesouraria, e a cessão não pode apagar uma receita que já entrou no caixa. O caminho: (1) devolva o valor ao solicitante e registre a saída com o comprovante; (2) cancele o lançamento do "
    + "recebimento em Tesouraria → Lançamentos (só é possível enquanto o mês não foi fechado; depois do fechamento, só por lançamento de ajuste da administração geral); (3) com o lançamento "
    + "cancelado, volte aqui e cancele a cessão — a cobrança é estornada junto. Enquanto isso a cessão fica como está.";
}

// Estorna a conta a receber da cessão. Devolve { estornou: boolean, situacaoAnterior } ou { bloqueado: true, mensagem } (o chamador desfaz a transação).
async function estornarCobranca(exec, sql, { contaReceberId, membroId, motivo }) {
  const lida = await exec.request().input("id", sql.Int, contaReceberId).query(`
    SELECT cr.ContaReceberId AS contaReceberId, cr.Status AS status, cr.Valor AS valor, cr.LancamentoId AS lancamentoId,
           l.Status AS lancamentoStatus, l.TermoNumero AS termoNumero
    FROM ContasAReceber cr WITH (UPDLOCK, HOLDLOCK)
    LEFT JOIN LancamentosTesouraria l ON l.LancamentoId = cr.LancamentoId
    WHERE cr.ContaReceberId = @id
  `);
  const conta = lida.recordset[0];
  if (!conta) {
    return { bloqueado: true, mensagem: "A conta a receber desta cessão não foi encontrada — o cancelamento não foi feito. Avise a equipe técnica." };
  }
  if (conta.status === "CANCELADO") return { estornou: false, situacaoAnterior: "CANCELADO" };

  let deQuem = null;
  let sufixo = null;
  if (conta.status === "PREVISTO") deQuem = "PREVISTO";
  else if (conta.status === "RECEBIDO" && conta.lancamentoStatus === "CANCELADO") { deQuem = "RECEBIDO"; sufixo = `recebimento já estornado: lançamento nº ${conta.lancamentoId} cancelado`; }
  if (!deQuem) return { bloqueado: true, mensagem: mensagemDeRecebimento(conta) };

  const cancelou = await exec.request().input("id", sql.Int, contaReceberId).input("de", sql.NVarChar(20), deQuem)
    .input("motivo", sql.NVarChar(300), motivoDoEstorno(motivo, sufixo)).input("por", sql.Int, membroId)
    .query(`UPDATE ContasAReceber SET Status = 'CANCELADO', MotivoCancelamento = @motivo, CanceladoPor = @por, CanceladoEm = SYSUTCDATETIME()
            WHERE ContaReceberId = @id AND Status = @de`);
  const linhas = cancelou && Array.isArray(cancelou.rowsAffected) ? Number(cancelou.rowsAffected[0] || 0) : 0;
  if (linhas === 0) return { bloqueado: true, mensagem: "A conta a receber mudou de situação enquanto a cessão era cancelada — nada foi alterado. Tente de novo." };
  return { estornou: true, situacaoAnterior: deQuem };
}

// A receita acessória que nasceu junto com a cobrança também sai (continua visível, marcada como cancelada — nada é apagado).
async function cancelarReceitasDaCessao(exec, sql, { cessaoId, membroId, motivo }) {
  const r = await exec.request().input("cessaoId", sql.Int, cessaoId).input("por", sql.Int, membroId).input("motivo", sql.NVarChar(300), motivoDoEstorno(motivo))
    .query(`UPDATE ReceitasAcessorias SET CanceladaEm = SYSUTCDATETIME(), CanceladaPor = @por, MotivoCancelamento = @motivo WHERE CessaoTemploId = @cessaoId AND CanceladaEm IS NULL`);
  return r && Array.isArray(r.rowsAffected) ? Number(r.rowsAffected[0] || 0) : 0;
}

module.exports = { MOTIVO_PADRAO, motivoDoEstorno, mensagemDeRecebimento, estornarCobranca, cancelarReceitasDaCessao };
