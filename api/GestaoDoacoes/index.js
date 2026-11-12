// GestaoDoacoes (v4.22 — Doações, Integridade e PLD-FT, itens 1 e 2)
// Lei 9.613/1998 + GAFI Recomendação 8: OSFL é setor de risco de PLD-FT, e o
// ponto sensível é a movimentação EM ESPÉCIE. O limite de identificação
// obrigatória do doador vem do catálogo de valores monetários (v4.17,
// sigla LIMITE_IDENTIFICACAO_DOADOR) — nunca hardcoded aqui. Toda doação
// já nasce com recibo numerado (protocolo local DOA-{ano}-{sequencial};
// será substituído pelo protocolo único da vB.4 quando essa fase existir).
// Doação em espécie acima do limite, ou fracionada (mesmo doador, mesmo
// mês, soma acima do limite em parcelas individualmente menores), gera
// sinalização automática no NIF (v4.12) — o NIF passa a ter dado de
// entrada real, não só de saída.
// GET  /api/doacoes -> lista
// GET  /api/doacoes/alertas -> doações que geraram sinalização NIF
// POST /api/doacoes -> { congregacaoId?, valor, formaPagamento, dataRecebimento, doadorNome?, doadorCpfCnpj? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const FORMAS_PAGAMENTO = ["ESPECIE", "PIX", "TRANSFERENCIA", "CHEQUE", "OUTROS"];

async function buscarLimiteIdentificacao(pool) {
  const r = await pool.request().query(`SELECT Valor FROM ValoresMonetarios WHERE Sigla = 'LIMITE_IDENTIFICACAO_DOADOR' AND Ativo = 1`);
  return r.recordset.length > 0 ? Number(r.recordset[0].Valor) : 2000;
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Doações institucionais e PLD-FT são matéria da Tesouraria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && recurso === "alertas") {
    const result = await pool.request().query(`
      SELECT d.*, s.SinalizacaoId AS sinalizacaoId, s.Tipo AS tipoSinalizacao, s.Status AS statusSinalizacao
      FROM Doacoes d JOIN NifSinalizacoes s ON s.DoacaoId = d.DoacaoId
      ORDER BY d.CriadoEm DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && !recurso) {
    const limite = await buscarLimiteIdentificacao(pool);
    const result = await pool.request().query(`
      SELECT d.*, c.Nome AS congregacaoNome FROM Doacoes d
      LEFT JOIN Congregacoes c ON c.CongregacaoId = d.CongregacaoId ORDER BY d.DataRecebimento DESC
    `);
    const lista = result.recordset.filter(d => auth.estaNoEscopo(usuario, d.congregacaoNome)).map(d => ({
      doacaoId: d.DoacaoId, congregacaoId: d.CongregacaoId, congregacaoNome: d.congregacaoNome, valor: d.Valor,
      formaPagamento: d.FormaPagamento, dataRecebimento: d.DataRecebimento, doadorNome: d.DoadorNome, doadorCpfCnpj: d.DoadorCpfCnpj,
      numeroRecibo: d.NumeroRecibo, identificacaoObrigatoria: Number(d.Valor) >= limite
    }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (req.method === "POST" && !recurso) {
    const { congregacaoId, valor, formaPagamento, dataRecebimento, doadorNome, doadorCpfCnpj } = req.body || {};
    if (!valor || !formaPagamento || !dataRecebimento) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: valor, formaPagamento, dataRecebimento." } };
      return;
    }
    if (!FORMAS_PAGAMENTO.includes(formaPagamento)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `formaPagamento inválida. Use uma de: ${FORMAS_PAGAMENTO.join(", ")}.` } };
      return;
    }
    if (Number(valor) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valor deve ser maior que zero." } };
      return;
    }
    const limite = await buscarLimiteIdentificacao(pool);
    const acimaDoLimite = Number(valor) >= limite;
    if (acimaDoLimite && (!doadorNome || !doadorNome.trim() || !doadorCpfCnpj || !doadorCpfCnpj.trim())) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Doação de R$ ${Number(valor).toFixed(2)} está acima do limite de identificação obrigatória (R$ ${limite.toFixed(2)}, PLD-FT) — informe doadorNome e doadorCpfCnpj.` } };
      return;
    }

    // O número do recibo nasce dentro de uma transação que trava a faixa do ano (UPDLOCK + HOLDLOCK no índice único de NumeroRecibo): dois registros ao
    // mesmo tempo esperam um pelo outro e nunca pegam o mesmo número. O próximo é o MAIOR número do ano + 1 — antes era a CONTAGEM + 1, sem trava: dois
    // registros simultâneos (ou um buraco na sequência) davam o mesmo número e o índice único derrubava a gravação com erro 500 (achado pela massa da
    // homologação; correção aprovada pelo responsável em 12/11/2026).
    const ano = new Date(dataRecebimento).getFullYear();
    const prefixo = `DOA-${ano}-`;
    let doacaoId, numeroRecibo;
    const transacao = new sql.Transaction(pool);
    await transacao.begin();
    try {
      const seq = await new sql.Request(transacao).input("prefixo", sql.NVarChar(20), prefixo).query(`
        SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(NumeroRecibo, LEN(@prefixo) + 1, 20) AS INT)), 0) AS maior
        FROM Doacoes WITH (UPDLOCK, HOLDLOCK) WHERE NumeroRecibo LIKE @prefixo + '%'`);
      numeroRecibo = `${prefixo}${String((Number(seq.recordset[0].maior) || 0) + 1).padStart(5, "0")}`;
      const criada = await new sql.Request(transacao)
        .input("cong", sql.Int, congregacaoId || null).input("valor", sql.Decimal(12, 2), valor).input("forma", sql.NVarChar(20), formaPagamento)
        .input("data", sql.Date, dataRecebimento).input("nome", sql.NVarChar(200), doadorNome ? doadorNome.trim() : null)
        .input("cpfCnpj", sql.NVarChar(20), doadorCpfCnpj ? doadorCpfCnpj.trim() : null).input("recibo", sql.NVarChar(50), numeroRecibo)
        .input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO Doacoes (CongregacaoId, Valor, FormaPagamento, DataRecebimento, DoadorNome, DoadorCpfCnpj, NumeroRecibo, RegistradoPor)
                OUTPUT INSERTED.DoacaoId VALUES (@cong, @valor, @forma, @data, @nome, @cpfCnpj, @recibo, @por)`);
      doacaoId = criada.recordset[0].DoacaoId;
      await transacao.commit();
    } catch (erro) {
      try { await transacao.rollback(); } catch (e) { /* a transação já pode ter sido desfeita */ }
      throw erro;
    }

    // Doação em espécie acima do limite: sinalização automática (VALOR_ATIPICO).
    if (formaPagamento === "ESPECIE" && acimaDoLimite) {
      await pool.request().input("tipo", sql.NVarChar(30), "VALOR_ATIPICO")
        .input("descricao", sql.NVarChar(500), `Doação em espécie de R$ ${Number(valor).toFixed(2)} (recibo ${numeroRecibo}), acima do limite de identificação (R$ ${limite.toFixed(2)}).`)
        .input("doacaoId", sql.Int, doacaoId).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO NifSinalizacoes (Tipo, Descricao, DoacaoId, RegistradoPor) VALUES (@tipo, @descricao, @doacaoId, @por)`);
    }

    // Fracionamento: mesmo doador (CPF/CNPJ), mesmo mês, soma >= limite em
    // parcelas individualmente menores que o limite.
    if (doadorCpfCnpj && !acimaDoLimite) {
      const inicioMes = new Date(dataRecebimento); inicioMes.setDate(1);
      const fimMes = new Date(inicioMes); fimMes.setMonth(fimMes.getMonth() + 1);
      const soma = await pool.request().input("cpfCnpj", sql.NVarChar(20), doadorCpfCnpj.trim())
        .input("ini", sql.Date, inicioMes).input("fim", sql.Date, fimMes)
        .query(`SELECT SUM(Valor) AS total FROM Doacoes WHERE DoadorCpfCnpj = @cpfCnpj AND DataRecebimento >= @ini AND DataRecebimento < @fim`);
      const totalMes = Number(soma.recordset[0].total || 0);
      if (totalMes >= limite) {
        await pool.request().input("tipo", sql.NVarChar(30), "FRACIONAMENTO")
          .input("descricao", sql.NVarChar(500), `Possível fracionamento: doador ${doadorCpfCnpj.trim()} somou R$ ${totalMes.toFixed(2)} em doações no mês, em parcelas individualmente abaixo do limite (R$ ${limite.toFixed(2)}).`)
          .input("doacaoId", sql.Int, doacaoId).input("por", sql.Int, usuario.membroId)
          .query(`INSERT INTO NifSinalizacoes (Tipo, Descricao, DoacaoId, RegistradoPor) VALUES (@tipo, @descricao, @doacaoId, @por)`);
      }
    }

    await registrarAuditoria({
      tabela: "Doacoes", registroId: doacaoId, acao: "Registrou doação", usuarioId: usuario.membroId,
      dadosDepois: { valor, formaPagamento, numeroRecibo }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Doação registrada — recibo ${numeroRecibo}.`, doacaoId, numeroRecibo } };
  }
};
