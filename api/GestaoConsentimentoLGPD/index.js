// GestaoConsentimentoLGPD (público — "Meu Painel", auto-atendimento por matrícula,
// mesmo modelo de acesso de MinhaFrequencia/SolicitarJustificativa)
// GET  /api/lgpd/consentimento/{matricula}  -> estado atual (mais recente) por Tipo
// POST /api/lgpd/consentimento/{matricula}  -> body: { tipo?, concedido, observacao? }
//      Grava um novo evento (trilha append-only: nunca sobrescreve o anterior).
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");

const TIPO_PADRAO = "DADOS_CONTATO";

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }

  const pool = await getPool();
  const membro = await pool.request().input("mat", sql.Int, matricula).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @mat`);
  if (membro.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  if (req.method === "GET") {
    const result = await pool.request().input("mat", sql.Int, matricula).query(`
      SELECT c.Tipo AS tipo, c.Concedido AS concedido, c.BaseLegal AS baseLegal, c.Observacao AS observacao,
             CONVERT(varchar(33), c.DataRegistro, 126) AS dataRegistro
      FROM ConsentimentosLGPD c
      WHERE c.MembroId = @mat AND c.ConsentimentoId IN (
        SELECT MAX(ConsentimentoId) FROM ConsentimentosLGPD WHERE MembroId = @mat GROUP BY Tipo
      )
      ORDER BY c.DataRegistro DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, consentimentos: result.recordset } };
    return;
  }

  if (req.method === "POST") {
    const { tipo, concedido, observacao, baseLegal, registradoPor } = req.body || {};
    if (concedido === undefined || concedido === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe concedido (true/false)." } };
      return;
    }
    const tipoFinal = tipo || TIPO_PADRAO;
    // registradoPor normalmente é a própria matrícula, mas um responsável legal pode
    // registrar o consentimento em nome de um menor (v1.7) que ainda não acessa o
    // Meu Painel sozinho — sem validação cruzada rígida contra VinculosFamiliares
    // nesta rodada: quem tem acesso físico ao Painel já está com a matrícula da criança.
    await pool.request()
      .input("mat", sql.Int, matricula)
      .input("tipo", sql.NVarChar(40), tipoFinal)
      .input("concedido", sql.Bit, concedido)
      .input("baseLegal", sql.NVarChar(40), baseLegal || "CONSENTIMENTO")
      .input("observacao", sql.NVarChar(300), observacao || null)
      .input("registradoPor", sql.Int, registradoPor || matricula)
      .query(`INSERT INTO ConsentimentosLGPD (MembroId, Tipo, Concedido, BaseLegal, Observacao, RegistradoPor)
              VALUES (@mat, @tipo, @concedido, @baseLegal, @observacao, @registradoPor)`);

    await registrarAuditoria({
      tabela: "ConsentimentosLGPD", registroId: Number(matricula),
      acao: concedido ? "Concedeu consentimento LGPD" : "Revogou consentimento LGPD",
      usuarioId: Number(matricula), dadosDepois: { tipo: tipoFinal, concedido }
    });

    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: concedido ? "✅ Consentimento registrado." : "✅ Consentimento revogado." }
    };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
