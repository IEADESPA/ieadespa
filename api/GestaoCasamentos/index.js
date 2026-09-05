// GestaoCasamentos (v1.9 — Reg. Art. 83)
// Registro de casamentos ministrados pela igreja — hoje só o batismo tem rastro
// (MembroReferencia.DataBatismo), casamento não tinha lugar nenhum. Mesmo
// esqueleto de GestaoVinculosFamiliares. Exige a permissão "pessoas".
// GET    /api/casamentos?membroId=123 -> casamentos de uma pessoa (ou todos, sem o filtro)
// POST   /api/casamentos              -> body: { membroId, membroConjugeId?, nomeConjuge?,
//                                                 celebrante?, modalidade, dataHabilitacaoCivil?,
//                                                 dataCasamento, registradoCartorio?, dataRegistroCartorio? }
// DELETE /api/casamentos/{id}
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

// Fixo em código, não catálogo editável por tela — mesmo espírito de CAUSAS_SAIDA
// e FORMAS_ADMISSAO em GestaoPessoas.
const MODALIDADES = ["CIVIL_E_RELIGIOSO", "SOMENTE_RELIGIOSO"];

// Validade da habilitação civil: 90 dias, vedado celebrar nos últimos 5 dias
// (Reg. Art. 83) — janela válida pra celebrar vai de 0 a 85 dias após a
// habilitação. Isso é registro histórico feito pela Secretaria, não um portão de
// permissão: fora da janela, só avisa, não bloqueia.
function avisoJanelaHabilitacao(dataHabilitacaoCivil, dataCasamento) {
  if (!dataHabilitacaoCivil) return null;
  const habilitacao = new Date(dataHabilitacaoCivil);
  const casamento = new Date(dataCasamento);
  const dias = Math.round((casamento - habilitacao) / (1000 * 60 * 60 * 24));
  if (dias < 0) return "⚠️ A data do casamento é anterior à data de habilitação civil.";
  if (dias > 85) return "⚠️ O casamento caiu nos últimos 5 dias da validade da habilitação civil (90 dias) ou fora dela — Reg. Art. 83.";
  return null;
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRota = context.bindingData.id;
  const pool = await getPool();

  // ---- GET: listar casamentos (de uma pessoa, ou todos) ----
  if (method === "GET") {
    const membroId = (req.query || {}).membroId;
    const filtro = membroId ? "WHERE c.MembroId = @membroId" : "";
    const request = pool.request();
    if (membroId) request.input("membroId", sql.Int, membroId);
    const result = await request.query(`
      SELECT c.CasamentoId AS casamentoId, c.MembroId AS membroId, m.Nome AS nome,
             c.MembroConjugeId AS membroConjugeId, mc.Nome AS nomeMembroConjuge, c.NomeConjuge AS nomeConjuge,
             c.Celebrante AS celebrante, c.Modalidade AS modalidade,
             CONVERT(varchar(10), c.DataHabilitacaoCivil, 120) AS dataHabilitacaoCivil,
             CONVERT(varchar(10), c.DataCasamento, 120) AS dataCasamento,
             c.RegistradoCartorio AS registradoCartorio,
             CONVERT(varchar(10), c.DataRegistroCartorio, 120) AS dataRegistroCartorio
      FROM Casamentos c
      JOIN MembroReferencia m ON m.MembroId = c.MembroId
      LEFT JOIN MembroReferencia mc ON mc.MembroId = c.MembroConjugeId
      ${filtro}
      ORDER BY c.DataCasamento DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  // ---- POST: criar ----
  if (method === "POST") {
    const {
      membroId, membroConjugeId, nomeConjuge, celebrante, modalidade,
      dataHabilitacaoCivil, dataCasamento, registradoCartorio, dataRegistroCartorio
    } = req.body || {};

    if (!membroId || !modalidade || !dataCasamento) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, modalidade, dataCasamento." } };
      return;
    }
    if (!MODALIDADES.includes(modalidade)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Modalidade inválida. Use uma de: ${MODALIDADES.join(", ")}.` } };
      return;
    }
    if (!membroConjugeId && !String(nomeConjuge || "").trim()) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe o cônjuge: a matrícula (se for membro) ou ao menos o nome." } };
      return;
    }
    if (membroConjugeId && Number(membroConjugeId) === Number(membroId)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "O cônjuge não pode ser a mesma pessoa." } };
      return;
    }

    const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    if (membroConjugeId) {
      const conjuge = await pool.request().input("id", sql.Int, membroConjugeId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
      if (conjuge.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula do cônjuge não encontrada." } };
        return;
      }
    }

    const result = await pool.request()
      .input("membroId", sql.Int, membroId)
      .input("membroConjugeId", sql.Int, membroConjugeId || null)
      .input("nomeConjuge", sql.NVarChar(200), String(nomeConjuge || "").trim() || null)
      .input("celebrante", sql.NVarChar(200), String(celebrante || "").trim() || null)
      .input("modalidade", sql.NVarChar(30), modalidade)
      .input("dataHabilitacaoCivil", sql.Date, dataHabilitacaoCivil || null)
      .input("dataCasamento", sql.Date, dataCasamento)
      .input("registradoCartorio", sql.Bit, registradoCartorio === true)
      .input("dataRegistroCartorio", sql.Date, dataRegistroCartorio || null)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`
        INSERT INTO Casamentos (MembroId, MembroConjugeId, NomeConjuge, Celebrante, Modalidade,
                                 DataHabilitacaoCivil, DataCasamento, RegistradoCartorio, DataRegistroCartorio, CriadoPor)
        OUTPUT INSERTED.CasamentoId
        VALUES (@membroId, @membroConjugeId, @nomeConjuge, @celebrante, @modalidade,
                @dataHabilitacaoCivil, @dataCasamento, @registradoCartorio, @dataRegistroCartorio, @criadoPor)`);
    const casamentoId = result.recordset[0].CasamentoId;

    await registrarAuditoria({
      tabela: "Casamentos",
      registroId: casamentoId,
      acao: "Registrou casamento",
      usuarioId: usuario.membroId,
      dadosDepois: { membroId, membroConjugeId, nomeConjuge, modalidade, dataCasamento }
    });

    const aviso = avisoJanelaHabilitacao(dataHabilitacaoCivil, dataCasamento);
    context.res = {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Casamento registrado." + (aviso ? ` ${aviso}` : ""), casamentoId, aviso }
    };
    return;
  }

  // ---- DELETE: remover (correção de lançamento) ----
  if (method === "DELETE") {
    if (!idRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/casamentos/{id}" } };
      return;
    }
    const antes = await pool.request().input("id", sql.Int, idRota).query(`SELECT MembroId, DataCasamento FROM Casamentos WHERE CasamentoId = @id`);
    const del = await pool.request().input("id", sql.Int, idRota).query(`DELETE FROM Casamentos WHERE CasamentoId = @id`);
    if (del.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Casamento não encontrado." } };
      return;
    }
    await registrarAuditoria({ tabela: "Casamentos", registroId: Number(idRota), acao: "Removeu registro de casamento", usuarioId: usuario.membroId, dadosAntes: antes.recordset[0] });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Registro removido." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
