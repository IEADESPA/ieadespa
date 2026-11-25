// shared/transacaoCurta.js — a transação curta das regras do banco (api/CLAUDE.md, regra 7), para os atos que gravam em vários passos.
// SET XACT_ABORT ON em cada lote: o SET dentro de um lote com parâmetros (sp_executesql) vale só para aquele lote, então vai em todos; com ele, um erro no
// meio desfaz a transação inteira no servidor, mesmo que a resposta não chegue. Qualquer erro aqui desfaz tudo e sobe para quem chamou (a nova tentativa
// encontra o estado de antes, não um ato pela metade). Nada de e-mail, fetch ou espera lá dentro: o que for aviso fica para depois do commit.
const { sql } = require("./db");

// `fazer({ rq, executor, transacao, desistir })`:
//   rq()      — um pedido dentro da transação;
//   executor  — o mesmo em forma de pool ({ request }), para os módulos que recebem um pool (shared/vacancia.js, shared/delegacoes.js);
//   transacao — a transação do mssql (shared/auditoria.registrarAuditoriaNaTransacao);
//   desistir() — desfaz sem erro, para as recusas no meio (quem chama devolve a resposta da recusa).
// Devolve o que `fazer` devolver.
async function emTransacao(pool, fazer) {
  const transacao = new sql.Transaction(pool);
  await transacao.begin();
  let encerrada = false;
  const desistir = async () => {
    if (encerrada) return;
    encerrada = true;
    try { await transacao.rollback(); } catch (_) { /* o servidor já a desfez (XACT_ABORT) */ }
  };
  const rq = () => {
    const pedido = new sql.Request(transacao);
    const consultar = pedido.query.bind(pedido);
    pedido.query = (texto) => consultar(`SET XACT_ABORT ON;\n${texto}`);
    return pedido;
  };
  try {
    const resultado = await fazer({ rq, executor: { request: rq }, transacao, desistir });
    if (!encerrada) {
      encerrada = true;
      await transacao.commit();
    }
    return resultado;
  } catch (e) {
    await desistir();
    throw e;
  }
}

module.exports = { emTransacao };
