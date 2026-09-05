// GestaoLicencasCandidatura (v1.9 — Reg. Art. 157 §2º)
// Licença Eclesiástica automática por candidatura política: obreiro candidato
// entra em licença 90 dias antes do pleito e perde o púlpito (mesmo racional de
// qualquer outro fluxo de saída — shared/vacancia.js); a Diretoria decide o
// retorno pós-eleição, não é automático. Status próprio no catálogo StatusMembro
// (LICENCA_CANDIDATURA), distinto do LICENÇA genérico (v1.6). Exige "pessoas".
// GET  /api/licencas-candidatura?membroId=123 -> lista (de uma pessoa, ou todas)
// POST /api/licencas-candidatura              -> cria: body { membroId, dataPleito }
// POST /api/licencas-candidatura/{id}         -> registra o retorno: body { retornou, observacao? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const vacancia = require("../shared/vacancia");

// Mesma lista de GestaoPessoas (STATUS_TERMINAIS) — entrar em licença não faz
// sentido pra quem já saiu de vez.
const STATUS_TERMINAIS = ["DESLIGADO", "FALECIDO"];
const DIAS_ANTECEDENCIA = 90;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRota = context.bindingData.id;
  const pool = await getPool();

  // ---- GET: listar ----
  if (method === "GET") {
    const membroId = (req.query || {}).membroId;
    const filtro = membroId ? "WHERE l.MembroId = @membroId" : "";
    const request = pool.request();
    if (membroId) request.input("membroId", sql.Int, membroId);
    const result = await request.query(`
      SELECT l.LicencaId AS licencaId, l.MembroId AS membroId, m.Nome AS nome,
             CONVERT(varchar(10), l.DataPleito, 120) AS dataPleito,
             CONVERT(varchar(10), l.DataInicioLicenca, 120) AS dataInicioLicenca,
             l.Status AS status,
             CONVERT(varchar(10), l.DataRetornoDecidida, 120) AS dataRetornoDecidida,
             l.ObservacaoRetorno AS observacaoRetorno
      FROM LicencasCandidatura l
      JOIN MembroReferencia m ON m.MembroId = l.MembroId
      ${filtro}
      ORDER BY l.DataPleito DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  // ---- POST sem id: criar (entra em licença) ----
  if (method === "POST" && !idRota) {
    const { membroId, dataPleito } = req.body || {};
    if (!membroId || !dataPleito) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, dataPleito." } };
      return;
    }
    const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId, Status FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    if (STATUS_TERMINAIS.includes(membro.recordset[0].Status)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta pessoa já saiu do rol de membros — não é possível registrar licença por candidatura." } };
      return;
    }

    const dataInicio = new Date(dataPleito);
    dataInicio.setDate(dataInicio.getDate() - DIAS_ANTECEDENCIA);
    const dataInicioLicenca = dataInicio.toISOString().slice(0, 10);

    const result = await pool.request()
      .input("membroId", sql.Int, membroId)
      .input("dataPleito", sql.Date, dataPleito)
      .input("dataInicioLicenca", sql.Date, dataInicioLicenca)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`
        INSERT INTO LicencasCandidatura (MembroId, DataPleito, DataInicioLicenca, CriadoPor)
        OUTPUT INSERTED.LicencaId
        VALUES (@membroId, @dataPleito, @dataInicioLicenca, @criadoPor)`);
    const licencaId = result.recordset[0].LicencaId;

    await pool.request().input("id", sql.Int, membroId).query(`UPDATE MembroReferencia SET Status = 'LICENCA_CANDIDATURA' WHERE MembroId = @id`);
    await vacancia.encerrarVinculos(pool, sql, membroId, "LICENCA_CANDIDATURA");

    await registrarAuditoria({
      tabela: "LicencasCandidatura",
      registroId: licencaId,
      acao: "Registrou licença por candidatura política",
      usuarioId: usuario.membroId,
      dadosDepois: { membroId, dataPleito, dataInicioLicenca }
    });

    context.res = {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Licença por candidatura registrada — a pessoa perdeu Assentos/Liderança/Cargo até a Diretoria decidir o retorno.", licencaId }
    };
    return;
  }

  // ---- POST com id: registrar o retorno (decidido pela Diretoria) ----
  if (method === "POST" && idRota) {
    const { retornou, observacao } = req.body || {};
    if (retornou === undefined || retornou === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe retornou (true/false)." } };
      return;
    }
    const licenca = await pool.request().input("id", sql.Int, idRota).query(`SELECT MembroId, Status FROM LicencasCandidatura WHERE LicencaId = @id`);
    if (licenca.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Licença não encontrada." } };
      return;
    }
    if (licenca.recordset[0].Status !== "EM_LICENCA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta licença já teve o retorno registrado." } };
      return;
    }
    const membroId = licenca.recordset[0].MembroId;
    const statusFinal = retornou ? "RETORNOU" : "NAO_RETORNOU";
    const hojeISO = new Date().toISOString().slice(0, 10);

    await pool.request()
      .input("id", sql.Int, idRota)
      .input("status", sql.NVarChar(20), statusFinal)
      .input("dataRetornoDecidida", sql.Date, hojeISO)
      .input("observacao", sql.NVarChar(300), observacao || null)
      .query(`UPDATE LicencasCandidatura SET Status = @status, DataRetornoDecidida = @dataRetornoDecidida, ObservacaoRetorno = @observacao WHERE LicencaId = @id`);

    if (retornou) {
      // Cargo/Assentos não voltam sozinhos — reatribuição é manual na tela de
      // Pessoas, igual já é hoje pra qualquer pessoa reativada.
      await pool.request().input("id", sql.Int, membroId).query(`UPDATE MembroReferencia SET Status = 'ATIVO' WHERE MembroId = @id`);
    }

    await registrarAuditoria({
      tabela: "LicencasCandidatura",
      registroId: Number(idRota),
      acao: retornou ? "Registrou retorno de licença por candidatura" : "Registrou não retorno de licença por candidatura",
      usuarioId: usuario.membroId,
      dadosDepois: { retornou, observacao }
    });

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: retornou ? "✅ Retorno registrado — status voltou para ATIVO." : "✅ Registrado: a pessoa não retornou." }
    };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
