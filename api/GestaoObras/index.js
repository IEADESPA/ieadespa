// GestaoObras (v4.24 — Obras, licenciamento e inauguração de templos)
// Ficha de obra por congregação: pedra fundamental (Art. 87 §1º), orçamento
// (amarrado ao Contas a Pagar/v4.5 via ObraMarcos.SaidaId e à alçada
// patrimonial da v4.11) e cronograma físico-financeiro (GestaoObraMarcos).
// A ação INAUGURAR é uma TRAVA REAL, não aviso (Art. 87 §2º, I): exige
// AVCB e Alvará/Habite-se vigentes (ImoveisSituacaoFiscal, v4.21/v4.24),
// checklist de placa sem nome de doador/político (§3º) e, se obra nova,
// confirmação de eficiência energética (Art. 162-A §2º).
// GET  /api/obras?congregacaoId= -> lista
// GET  /api/obras/{id} -> detalhe + marcos
// POST /api/obras -> { congregacaoId, bemId?, titulo, ehObraNova?, orcamentoPrevisto, dataInicioPrevista, dataFimPrevista }
// PUT  /api/obras/{id} -> { acao: 'MARCAR_PEDRA_FUNDAMENTAL'|'PARALISAR'|'RETOMAR'|'CONCLUIR'|'CONFIRMAR_PLACA'|'CONFIRMAR_EFICIENCIA_ENERGETICA'|'INAUGURAR', ... }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const ACOES = ["MARCAR_PEDRA_FUNDAMENTAL", "PARALISAR", "RETOMAR", "CONCLUIR", "CONFIRMAR_PLACA", "CONFIRMAR_EFICIENCIA_ENERGETICA", "INAUGURAR"];

function vigente(data, hoje) {
  return !!data && new Date(data) >= hoje;
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();
  const hoje = new Date();

  if (req.method === "GET" && !id) {
    const { congregacaoId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (congregacaoId) { request.input("cong", sql.Int, congregacaoId); where += " AND o.CongregacaoId = @cong"; }
    const result = await request.query(`
      SELECT o.*, c.Nome AS congregacaoNome FROM ObrasTemplo o
      JOIN Congregacoes c ON c.CongregacaoId = o.CongregacaoId WHERE ${where} ORDER BY o.CriadoEm DESC
    `);
    const obras = result.recordset.filter(o => auth.estaNoEscopo(usuario, o.congregacaoNome));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: obras };
    return;
  }

  if (req.method === "GET" && id) {
    const obra = await pool.request().input("id", sql.Int, id).query(`
      SELECT o.*, c.Nome AS congregacaoNome FROM ObrasTemplo o JOIN Congregacoes c ON c.CongregacaoId = o.CongregacaoId WHERE o.ObraId = @id
    `);
    if (obra.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Obra não encontrada." } };
      return;
    }
    if (!auth.estaNoEscopo(usuario, obra.recordset[0].congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    const marcos = await pool.request().input("obraId", sql.Int, id).query(`SELECT * FROM ObraMarcos WHERE ObraId = @obraId ORDER BY DataPrevista`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.assign({}, obra.recordset[0], { marcos: marcos.recordset }) };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, bemId, titulo, ehObraNova, orcamentoPrevisto, dataInicioPrevista, dataFimPrevista } = req.body || {};
    if (!congregacaoId || !titulo || !titulo.trim() || !orcamentoPrevisto || !dataInicioPrevista || !dataFimPrevista) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, titulo, orcamentoPrevisto, dataInicioPrevista, dataFimPrevista." } };
      return;
    }
    const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
    if (cong.recordset.length === 0 || !auth.estaNoEscopo(usuario, cong.recordset[0].Nome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    const criada = await pool.request().input("cong", sql.Int, congregacaoId).input("bemId", sql.Int, bemId || null)
      .input("titulo", sql.NVarChar(200), titulo.trim()).input("nova", sql.Bit, ehObraNova === false ? 0 : 1)
      .input("orcamento", sql.Decimal(12, 2), orcamentoPrevisto).input("inicio", sql.Date, dataInicioPrevista).input("fim", sql.Date, dataFimPrevista)
      .input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ObrasTemplo (CongregacaoId, BemId, Titulo, EhObraNova, OrcamentoPrevisto, DataInicioPrevista, DataFimPrevista, RegistradoPor)
              OUTPUT INSERTED.ObraId VALUES (@cong, @bemId, @titulo, @nova, @orcamento, @inicio, @fim, @por)`);
    await registrarAuditoria({
      tabela: "ObrasTemplo", registroId: criada.recordset[0].ObraId, acao: "Abriu ficha de obra", usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, titulo, orcamentoPrevisto }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Ficha de obra criada.", obraId: criada.recordset[0].ObraId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/obras/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`
      SELECT o.*, c.Nome AS congregacaoNome FROM ObrasTemplo o JOIN Congregacoes c ON c.CongregacaoId = o.CongregacaoId WHERE o.ObraId = @id
    `);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Obra não encontrada." } };
      return;
    }
    const obra = atual.recordset[0];
    if (!auth.estaNoEscopo(usuario, obra.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    const { acao } = req.body || {};
    if (!ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }

    if (acao === "MARCAR_PEDRA_FUNDAMENTAL") {
      const { dataPedraFundamental } = req.body || {};
      if (!dataPedraFundamental) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe dataPedraFundamental." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("data", sql.Date, dataPedraFundamental)
        .query(`UPDATE ObrasTemplo SET DataPedraFundamental = @data, Status = 'EM_ANDAMENTO' WHERE ObraId = @id`);
      await registrarAuditoria({ tabela: "ObrasTemplo", registroId: Number(id), acao: "Marcou pedra fundamental", usuarioId: usuario.membroId, dadosDepois: { dataPedraFundamental } });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Pedra fundamental registrada — obra em andamento." } };
      return;
    }

    if (acao === "PARALISAR" || acao === "RETOMAR" || acao === "CONCLUIR") {
      const novoStatus = acao === "PARALISAR" ? "PARALISADA" : acao === "RETOMAR" ? "EM_ANDAMENTO" : "CONCLUIDA";
      await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), novoStatus).query(`UPDATE ObrasTemplo SET Status = @status WHERE ObraId = @id`);
      await registrarAuditoria({ tabela: "ObrasTemplo", registroId: Number(id), acao: `Status da obra -> ${novoStatus}`, usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Obra marcada como ${novoStatus.toLowerCase()}.` } };
      return;
    }

    if (acao === "CONFIRMAR_PLACA") {
      const { nomesConfirmados, semDoadorPoliticoConfirmado } = req.body || {};
      if (!nomesConfirmados || !semDoadorPoliticoConfirmado) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Confirme os dois itens do checklist: nomesConfirmados e semDoadorPoliticoConfirmado (Art. 87 §3º)." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).query(`UPDATE ObrasTemplo SET PlacaNomesConfirmados = 1, PlacaSemDoadorPoliticoConfirmado = 1 WHERE ObraId = @id`);
      await registrarAuditoria({ tabela: "ObrasTemplo", registroId: Number(id), acao: "Confirmou checklist da placa de inauguração", usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Checklist da placa confirmado." } };
      return;
    }

    if (acao === "CONFIRMAR_EFICIENCIA_ENERGETICA") {
      await pool.request().input("id", sql.Int, id).query(`UPDATE ObrasTemplo SET EficienciaEnergeticaConfirmada = 1 WHERE ObraId = @id`);
      await registrarAuditoria({ tabela: "ObrasTemplo", registroId: Number(id), acao: "Confirmou eficiência energética da obra", usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Eficiência energética confirmada." } };
      return;
    }

    // INAUGURAR — trava real (Art. 87 §2º, I): sem AVCB e Alvará/Habite-se
    // vigentes o sistema recusa, não avisa. Placa (§3º) e eficiência
    // energética de obra nova (Art. 162-A §2º) também são pré-requisitos.
    if (obra.Status === "INAUGURADA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta obra já está inaugurada." } };
      return;
    }
    if (!obra.BemId) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Vincule o imóvel resultante (bemId) antes de inaugurar." } };
      return;
    }
    const situacao = await pool.request().input("bemId", sql.Int, obra.BemId).query(`SELECT AvcbVigenciaFim, AlvaraVigenciaFim FROM ImoveisSituacaoFiscal WHERE BemId = @bemId`);
    const s = situacao.recordset[0] || {};
    if (!vigente(s.AvcbVigenciaFim, hoje)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "⛔ Inauguração bloqueada: AVCB (Corpo de Bombeiros) ausente ou vencido (Art. 87 §2º, I). Cadastre em Financeiro → Imóveis." } };
      return;
    }
    if (!vigente(s.AlvaraVigenciaFim, hoje)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "⛔ Inauguração bloqueada: Alvará/Habite-se ausente ou vencido (Art. 87 §2º, I). Cadastre em Financeiro → Imóveis." } };
      return;
    }
    if (!obra.PlacaNomesConfirmados || !obra.PlacaSemDoadorPoliticoConfirmado) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "⛔ Inauguração bloqueada: checklist da placa de inauguração ainda não confirmado (Art. 87 §3º)." } };
      return;
    }
    if (obra.EhObraNova && !obra.EficienciaEnergeticaConfirmada) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "⛔ Inauguração bloqueada: eficiência energética de obra nova ainda não confirmada (Art. 162-A §2º)." } };
      return;
    }
    const { dataInauguracao } = req.body || {};
    await pool.request().input("id", sql.Int, id).input("data", sql.Date, dataInauguracao || hoje.toISOString().slice(0, 10)).input("por", sql.Int, usuario.membroId)
      .query(`UPDATE ObrasTemplo SET Status = 'INAUGURADA', DataInauguracao = @data, InauguradoPor = @por WHERE ObraId = @id`);
    await registrarAuditoria({ tabela: "ObrasTemplo", registroId: Number(id), acao: "Inaugurou o templo", usuarioId: usuario.membroId, dadosDepois: { dataInauguracao } });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Templo inaugurado — todos os requisitos do Art. 87 confirmados." } };
  }
};
