// GestaoPdqPlanos (v4.8, segunda parte)
// Plano Diretor Quadrienal (PDQ, Regimento Art. 26-29) — sempre com
// EXATAMENTE 3 eixos estratégicos (validado aqui, não uma sugestão).
// Criar/editar é matéria da CLI (mesma permissão "cli" já usada em
// GestaoProjetos/GestaoComissoes/SucessaoPresidencial — não um novo
// conceito de autorização).
// GET  /api/pdq-planos -> lista (com contagem de eixos/metas/projetos)
// GET  /api/pdq-planos/{id} -> detalhe completo (eixos → metas → projetos)
// POST /api/pdq-planos -> { anoInicio, anoFim, titulo, eixos: [{nome, descricao?}] } (exatamente 3)
// PUT  /api/pdq-planos/{id} -> { status: 'EM_ELABORACAO'|'VIGENTE'|'ENCERRADO' }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const STATUS = ["EM_ELABORACAO", "VIGENTE", "ENCERRADO"];
const QUANTIDADE_EIXOS_OBRIGATORIA = 3;

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirAlgumaPermissao(req, context, ["cli", "financeiro"]);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT p.PlanoId AS planoId, p.AnoInicio AS anoInicio, p.AnoFim AS anoFim, p.Titulo AS titulo, p.Status AS status,
             (SELECT COUNT(*) FROM PdqEixos WHERE PlanoId = p.PlanoId) AS totalEixos,
             (SELECT COUNT(*) FROM PdqMetas m JOIN PdqEixos e ON e.EixoId = m.EixoId WHERE e.PlanoId = p.PlanoId) AS totalMetas
      FROM PdqPlanos p ORDER BY p.AnoInicio DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const plano = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM PdqPlanos WHERE PlanoId = @id`);
    if (plano.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Plano PDQ não encontrado." } };
      return;
    }
    const eixos = await pool.request().input("id", sql.Int, id).query(`SELECT EixoId AS eixoId, Nome AS nome, Descricao AS descricao FROM PdqEixos WHERE PlanoId = @id ORDER BY EixoId`);
    for (const eixo of eixos.recordset) {
      const metas = await pool.request().input("eixoId", sql.Int, eixo.eixoId).query(`
        SELECT MetaId AS metaId, Descricao AS descricao, Indicador AS indicador, PrazoAno AS prazoAno, Status AS status, JustificativaTecnica AS justificativaTecnica
        FROM PdqMetas WHERE EixoId = @eixoId ORDER BY MetaId
      `);
      for (const meta of metas.recordset) {
        const projetos = await pool.request().input("metaId", sql.Int, meta.metaId).query(`
          SELECT ProjetoId AS projetoId, Nome AS nome, Descricao AS descricao, OrcamentoPrevisto AS orcamentoPrevisto,
                 CONVERT(varchar(10), CronogramaInicio, 120) AS cronogramaInicio, CONVERT(varchar(10), CronogramaFim, 120) AS cronogramaFim,
                 Status AS status,
                 CASE WHEN Status NOT IN ('CONCLUIDO', 'CANCELADO') AND CronogramaFim < CAST(SYSUTCDATETIME() AS DATE) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS atrasado
          FROM PdqProjetos WHERE MetaId = @metaId ORDER BY ProjetoId
        `);
        meta.projetos = projetos.recordset;
      }
      eixo.metas = metas.recordset;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.assign({}, plano.recordset[0], { eixos: eixos.recordset }) };
    return;
  }

  if (req.method === "POST") {
    const { anoInicio, anoFim, titulo, eixos } = req.body || {};
    if (!anoInicio || !anoFim || !titulo || !titulo.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: anoInicio, anoFim, titulo." } };
      return;
    }
    if (!Array.isArray(eixos) || eixos.length !== QUANTIDADE_EIXOS_OBRIGATORIA) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `O PDQ exige exatamente ${QUANTIDADE_EIXOS_OBRIGATORIA} eixos estratégicos (Regimento Art. 26-29) — informe ${QUANTIDADE_EIXOS_OBRIGATORIA}.` } };
      return;
    }
    for (const e of eixos) {
      if (!e.nome || !e.nome.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Cada eixo precisa de um nome." } };
        return;
      }
    }

    const criado = await pool.request()
      .input("anoInicio", sql.Int, anoInicio).input("anoFim", sql.Int, anoFim).input("titulo", sql.NVarChar(200), titulo.trim())
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO PdqPlanos (AnoInicio, AnoFim, Titulo, CriadoPor) OUTPUT INSERTED.PlanoId VALUES (@anoInicio, @anoFim, @titulo, @criadoPor)`);
    const planoId = criado.recordset[0].PlanoId;

    for (const e of eixos) {
      await pool.request().input("planoId", sql.Int, planoId).input("nome", sql.NVarChar(200), e.nome.trim()).input("descricao", sql.NVarChar(500), e.descricao || null)
        .query(`INSERT INTO PdqEixos (PlanoId, Nome, Descricao) VALUES (@planoId, @nome, @descricao)`);
    }

    await registrarAuditoria({
      tabela: "PdqPlanos", registroId: planoId, acao: "Criou Plano Diretor Quadrienal", usuarioId: usuario.membroId,
      dadosDepois: { anoInicio, anoFim, titulo, eixos: eixos.map(e => e.nome) }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Plano PDQ ${anoInicio}-${anoFim} criado com ${eixos.length} eixos.`, planoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/pdq-planos/{id}" } };
      return;
    }
    const { status } = req.body || {};
    if (!STATUS.includes(status)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Status inválido. Use um de: ${STATUS.join(", ")}.` } };
      return;
    }
    const antes = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM PdqPlanos WHERE PlanoId = @id`);
    if (antes.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Plano PDQ não encontrado." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), status).query(`UPDATE PdqPlanos SET Status = @status WHERE PlanoId = @id`);
    await registrarAuditoria({
      tabela: "PdqPlanos", registroId: Number(id), acao: "Atualizou status do Plano PDQ", usuarioId: usuario.membroId,
      dadosAntes: antes.recordset[0], dadosDepois: { status }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Plano PDQ atualizado." } };
    return;
  }
};
