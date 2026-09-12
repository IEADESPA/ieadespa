// GestaoCasaPastoral (v4.11 — item 6)
// Casa Pastoral como ativo com regra de ocupação (Reg. Art. 115): uso
// exclusivo do Dirigente Titular durante o mandato, vedada cessão a
// terceiros, destituição automática por uso irregular/"gato" de luz-água.
// Restrito a nível Global (é matéria de liderança).
// GET  /api/casa-pastoral -> lista de ocupações
// GET  /api/casa-pastoral/{id} -> detalhe
// POST /api/casa-pastoral -> { bemId, congregacaoId, ocupanteMembroId, dataInicio }
// PUT  /api/casa-pastoral/{id} -> { acao: 'ENCERRAR'|'DESTITUIR', motivo? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const ACOES = ["ENCERRAR", "DESTITUIR"];

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Ocupação da Casa Pastoral é matéria de liderança — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();

  const SELECT_BASE = `
    SELECT o.OcupacaoId AS ocupacaoId, o.BemId AS bemId, b.Descricao AS casaDescricao, o.CongregacaoId AS congregacaoId,
           c.Nome AS congregacaoNome, o.OcupanteMembroId AS ocupanteMembroId, m.Nome AS ocupanteNome,
           CONVERT(varchar(10), o.DataInicio, 120) AS dataInicio, CONVERT(varchar(10), o.DataFim, 120) AS dataFim,
           o.Status AS status, o.MotivoDestituicao AS motivoDestituicao
    FROM CasaPastoralOcupacoes o
    JOIN BensPatrimoniais b ON b.BemId = o.BemId
    JOIN Congregacoes c ON c.CongregacaoId = o.CongregacaoId
    JOIN MembroReferencia m ON m.MembroId = o.OcupanteMembroId
  `;

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`${SELECT_BASE} ORDER BY o.Status, o.DataInicio DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`${SELECT_BASE} WHERE o.OcupacaoId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Ocupação não encontrada." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset[0] };
    return;
  }

  if (req.method === "POST") {
    const { bemId, congregacaoId, ocupanteMembroId, dataInicio } = req.body || {};
    if (!bemId || !congregacaoId || !ocupanteMembroId || !dataInicio) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: bemId, congregacaoId, ocupanteMembroId, dataInicio." } };
      return;
    }
    const bem = await pool.request().input("id", sql.Int, bemId).query(`SELECT Tipo, Status FROM BensPatrimoniais WHERE BemId = @id`);
    if (bem.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Bem não encontrado." } };
      return;
    }
    if (bem.recordset[0].Tipo !== "CASA_PASTORAL") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este bem não é uma Casa Pastoral — a regra de ocupação (Reg. Art. 115) só se aplica a imóvel residencial eclesiástico." } };
      return;
    }
    const ativa = await pool.request().input("bemId", sql.Int, bemId).query(`SELECT OcupacaoId FROM CasaPastoralOcupacoes WHERE BemId = @bemId AND Status = 'ATIVA'`);
    if (ativa.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta Casa Pastoral já tem ocupação ativa — encerre a atual antes de registrar outra (uso exclusivo do Dirigente Titular)." } };
      return;
    }
    const criado = await pool.request()
      .input("bemId", sql.Int, bemId).input("cong", sql.Int, congregacaoId).input("ocupante", sql.Int, ocupanteMembroId)
      .input("dataInicio", sql.Date, dataInicio).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO CasaPastoralOcupacoes (BemId, CongregacaoId, OcupanteMembroId, DataInicio, RegistradoPor)
              OUTPUT INSERTED.OcupacaoId VALUES (@bemId, @cong, @ocupante, @dataInicio, @por)`);
    await registrarAuditoria({
      tabela: "CasaPastoralOcupacoes", registroId: criado.recordset[0].OcupacaoId, acao: "Registrou ocupação da Casa Pastoral", usuarioId: usuario.membroId,
      dadosDepois: { bemId, congregacaoId, ocupanteMembroId, dataInicio }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Ocupação da Casa Pastoral registrada (uso exclusivo do Dirigente Titular)." } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/casa-pastoral/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM CasaPastoralOcupacoes WHERE OcupacaoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Ocupação não encontrada." } };
      return;
    }
    const registro = atual.recordset[0];
    const { acao, motivo } = req.body || {};
    if (!ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }
    const novoStatus = acao === "DESTITUIR" ? "DESTITUIDA" : "ENCERRADA";
    if (acao === "DESTITUIR" && (!motivo || !motivo.trim())) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da destituição (ex: uso irregular, 'gato' de luz-água)." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), novoStatus)
      .input("motivo", sql.NVarChar(300), motivo || null)
      .query(`UPDATE CasaPastoralOcupacoes SET Status = @status, DataFim = CAST(SYSUTCDATETIME() AS DATE), MotivoDestituicao = @motivo WHERE OcupacaoId = @id`);
    await registrarAuditoria({
      tabela: "CasaPastoralOcupacoes", registroId: Number(id), acao: acao === "DESTITUIR" ? "Destituiu ocupação da Casa Pastoral" : "Encerrou ocupação da Casa Pastoral",
      usuarioId: usuario.membroId, dadosDepois: { motivo: motivo || null }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Ocupação ${acao === "DESTITUIR" ? "destituída" : "encerrada"}.` } };
    return;
  }
};

