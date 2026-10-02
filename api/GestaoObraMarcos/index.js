// GestaoObraMarcos (v4.24 — cronograma físico-financeiro da obra)
// Marco com percentual físico previsto x realizado e valor previsto x
// gasto real — mesmo espírito do motor de projetos do PDQ (v4.8). O gasto
// real, quando existir, vem de uma Saída já lançada e paga (v4.5),
// vinculada por SaidaId — nunca digitado à mão duas vezes.
// ESCOPO (dado da CONGREGAÇÃO dona da obra, ObrasTemplo.CongregacaoId): cada pessoa vê e mexe só nos marcos das obras das congregações do seu escopo. Obra de fora do
// escopo responde igual a obra que não existe. A Saída vinculada precisa existir, estar PAGA e ser da mesma congregação da obra.
// GET  /api/obra-marcos?obraId= -> lista
// POST /api/obra-marcos -> { obraId, descricao, dataPrevista, percentualFisicoPrevisto, valorPrevisto }
// PUT  /api/obra-marcos/{id} -> { percentualFisicoRealizado, dataConclusao?, saidaId? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { numeroEntre, dataIso, textoAte, MAX_DECIMAL_12_2 } = require("../shared/entradaFinanceira");

module.exports = async function (context, req) {
  const idBruto = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  // A obra (por id) com a congregação dela, se existir E estiver no escopo; senão null — o chamador devolve a resposta de "não existe".
  async function obraAlcancavel(obraBruto) {
    const obraId = auth.idDeRota(obraBruto);
    if (!obraId) return null;
    const r = await pool.request().input("id", sql.Int, obraId)
      .query(`SELECT o.ObraId, o.CongregacaoId, c.Nome AS congregacaoNome FROM ObrasTemplo o JOIN Congregacoes c ON c.CongregacaoId = o.CongregacaoId WHERE o.ObraId = @id`);
    const obra = r.recordset[0];
    return obra && auth.estaNoEscopo(usuario, obra.congregacaoNome) ? obra : null;
  }

  if (req.method === "GET" && !idBruto) {
    const { obraId } = req.query || {};
    if (!obraId || !auth.idDeRota(obraId)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe obraId." } };
      return;
    }
    // Obra inexistente ou de fora do escopo: lista vazia (o que a rota já devolvia para obra sem marcos).
    const obra = await obraAlcancavel(obraId);
    if (!obra) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: [] };
      return;
    }
    const result = await pool.request().input("obraId", sql.Int, obra.ObraId).query(`SELECT * FROM ObraMarcos WHERE ObraId = @obraId ORDER BY DataPrevista`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST") {
    const { obraId: obraBruto, descricao, dataPrevista, percentualFisicoPrevisto, valorPrevisto } = req.body || {};
    if (!obraBruto || typeof descricao !== "string" || !descricao.trim() || !dataPrevista || percentualFisicoPrevisto == null || !valorPrevisto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: obraId, descricao, dataPrevista, percentualFisicoPrevisto, valorPrevisto." } };
      return;
    }
    const desc = textoAte(descricao, 300);
    const data = dataIso(dataPrevista);
    const pct = numeroEntre(percentualFisicoPrevisto, 0, 100);
    const valor = numeroEntre(valorPrevisto, 0.01, MAX_DECIMAL_12_2);
    if (!desc || !data || pct === null || valor === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Confira a descrição (até 300 caracteres), a data (AAAA-MM-DD), o percentual (0 a 100) e o valor previsto (maior que zero)." } };
      return;
    }
    // Obra inexistente, malformada ou de fora do escopo: a mesma resposta.
    const obra = await obraAlcancavel(obraBruto);
    if (!obra) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Obra não encontrada." } };
      return;
    }
    const criado = await pool.request().input("obraId", sql.Int, obra.ObraId).input("desc", sql.NVarChar(300), desc)
      .input("data", sql.Date, data).input("pct", sql.Decimal(5, 2), pct)
      .input("valor", sql.Decimal(12, 2), valor).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ObraMarcos (ObraId, Descricao, DataPrevista, PercentualFisicoPrevisto, ValorPrevisto, RegistradoPor)
              OUTPUT INSERTED.MarcoId VALUES (@obraId, @desc, @data, @pct, @valor, @por)`);
    await registrarAuditoria({
      tabela: "ObraMarcos", registroId: criado.recordset[0].MarcoId, acao: "Criou marco do cronograma da obra", usuarioId: usuario.membroId,
      dadosDepois: { obraId: obra.ObraId, descricao: desc, dataPrevista: data, percentualFisicoPrevisto: pct, valorPrevisto: valor }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Marco criado.", marcoId: criado.recordset[0].MarcoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!idBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/obra-marcos/{id}" } };
      return;
    }
    // Marco inexistente, id malformado ou de obra fora do escopo: a mesma resposta.
    const id = auth.idDeRota(idBruto);
    const achado = id ? await pool.request().input("id", sql.Int, id).query(`
      SELECT m.*, o.CongregacaoId AS ObraCongregacaoId, c.Nome AS congregacaoNome
      FROM ObraMarcos m JOIN ObrasTemplo o ON o.ObraId = m.ObraId JOIN Congregacoes c ON c.CongregacaoId = o.CongregacaoId
      WHERE m.MarcoId = @id`) : { recordset: [] };
    if (achado.recordset.length === 0 || !auth.estaNoEscopo(usuario, achado.recordset[0].congregacaoNome)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Marco não encontrado." } };
      return;
    }
    const { congregacaoNome, ObraCongregacaoId, ...atual } = achado.recordset[0];
    const { percentualFisicoRealizado, dataConclusao, saidaId } = req.body || {};
    const pct = numeroEntre(percentualFisicoRealizado, 0, 100);
    if (percentualFisicoRealizado == null || pct === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe percentualFisicoRealizado (0 a 100)." } };
      return;
    }
    const conclusao = dataConclusao ? dataIso(dataConclusao) : null;
    if (dataConclusao && !conclusao) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "dataConclusao inválida (use AAAA-MM-DD)." } };
      return;
    }
    // Gasto real vem de uma Saída já PAGA e da MESMA congregação da obra (o cabeçalho sempre disse isso; agora é conferido). Uma mensagem só para qualquer falha: não
    // diz se a Saída existe ou é de outra congregação.
    let saidaVinculada = atual.SaidaId;
    if (saidaId) {
      const saida = auth.idDeRota(saidaId);
      const linha = saida ? (await pool.request().input("saidaId", sql.Int, saida)
        .query(`SELECT SaidaId, CongregacaoId, Status FROM SaidasTesouraria WHERE SaidaId = @saidaId`)).recordset[0] : null;
      if (!linha || linha.Status !== "PAGA" || Number(linha.CongregacaoId) !== Number(ObraCongregacaoId)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Saída inválida: precisa existir, estar paga e ser da mesma congregação da obra." } };
        return;
      }
      saidaVinculada = saida;
    }
    await pool.request().input("id", sql.Int, id).input("pct", sql.Decimal(5, 2), pct)
      .input("data", sql.Date, conclusao).input("saidaId", sql.Int, saidaVinculada || null)
      .query(`UPDATE ObraMarcos SET PercentualFisicoRealizado = @pct, DataConclusao = @data, SaidaId = @saidaId WHERE MarcoId = @id`);
    await registrarAuditoria({
      tabela: "ObraMarcos", registroId: id, acao: "Atualizou progresso do marco da obra", usuarioId: usuario.membroId,
      dadosAntes: atual, dadosDepois: { percentualFisicoRealizado: pct, dataConclusao: conclusao, saidaId: saidaVinculada || null }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Progresso do marco atualizado." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido." } };
};
