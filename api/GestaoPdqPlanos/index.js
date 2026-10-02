// GestaoPdqPlanos (v4.8, segunda parte)
// Plano Diretor Quadrienal (PDQ, Regimento Art. 26-29) — sempre com
// EXATAMENTE 3 eixos estratégicos (validado aqui, não uma sugestão).
// Criar/editar é matéria da CLI (mesma permissão "cli" já usada em
// GestaoProjetos/GestaoComissoes/SucessaoPresidencial — não um novo
// conceito de autorização) ou do nível geral da Tesouraria (papel Global com
// escopo de todas as congregações); o `financeiro` local só LÊ (shared/pdqAcesso.js).
// GET  /api/pdq-planos -> lista (com contagem de eixos/metas/projetos)
// GET  /api/pdq-planos/{id} -> detalhe completo (eixos → metas → projetos)
// POST /api/pdq-planos -> { anoInicio, anoFim, titulo, eixos: [{nome, descricao?}] } (exatamente 3)
// PUT  /api/pdq-planos/{id} -> { status: 'EM_ELABORACAO'|'VIGENTE'|'ENCERRADO' }
const auth = require("../shared/auth");
const { exigirAcessoPdq } = require("../shared/pdqAcesso");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { inteiroEntre, textoAte, textoOpcionalAte, violouChaveUnica } = require("../shared/entradaFinanceira");

const STATUS = ["EM_ELABORACAO", "VIGENTE", "ENCERRADO"];
const QUANTIDADE_EIXOS_OBRIGATORIA = 3;

module.exports = async function (context, req) {
  const idBruto = context.bindingData.id;
  const usuario = exigirAcessoPdq(req, context);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !idBruto) {
    const result = await pool.request().query(`
      SELECT p.PlanoId AS planoId, p.AnoInicio AS anoInicio, p.AnoFim AS anoFim, p.Titulo AS titulo, p.Status AS status,
             (SELECT COUNT(*) FROM PdqEixos WHERE PlanoId = p.PlanoId) AS totalEixos,
             (SELECT COUNT(*) FROM PdqMetas m JOIN PdqEixos e ON e.EixoId = m.EixoId WHERE e.PlanoId = p.PlanoId) AS totalMetas
      FROM PdqPlanos p ORDER BY p.AnoInicio DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && idBruto) {
    const id = auth.idDeRota(idBruto);
    const plano = id ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM PdqPlanos WHERE PlanoId = @id`) : { recordset: [] };
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
    const { anoInicio: inicioBruto, anoFim: fimBruto, titulo, eixos } = req.body || {};
    if (!inicioBruto || !fimBruto || typeof titulo !== "string" || !titulo.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: anoInicio, anoFim, titulo." } };
      return;
    }
    const anoInicio = inteiroEntre(inicioBruto, 1900, 2200), anoFim = inteiroEntre(fimBruto, 1900, 2200), tituloOk = textoAte(titulo, 200);
    if (anoInicio === null || anoFim === null || anoFim < anoInicio || !tituloOk) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Confira anoInicio e anoFim (AAAA, fim não antes do início) e o título (até 200 caracteres)." } };
      return;
    }
    if (!Array.isArray(eixos) || eixos.length !== QUANTIDADE_EIXOS_OBRIGATORIA) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `O PDQ exige exatamente ${QUANTIDADE_EIXOS_OBRIGATORIA} eixos estratégicos (Regimento Art. 26-29) — informe ${QUANTIDADE_EIXOS_OBRIGATORIA}.` } };
      return;
    }
    const eixosOk = [];
    for (const e of eixos) {
      const nome = e && textoAte(e.nome, 200);
      const descricaoEixo = e ? textoOpcionalAte(e.descricao, 500) : null;
      if (!nome || descricaoEixo === null) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Cada eixo precisa de um nome (até 200 caracteres); a descrição, se houver, tem até 500." } };
        return;
      }
      eixosOk.push({ nome, descricao: descricaoEixo || null });
    }

    let criado;
    try {
      criado = await pool.request()
        .input("anoInicio", sql.Int, anoInicio).input("anoFim", sql.Int, anoFim).input("titulo", sql.NVarChar(200), tituloOk)
        .input("criadoPor", sql.Int, usuario.membroId)
        .query(`INSERT INTO PdqPlanos (AnoInicio, AnoFim, Titulo, CriadoPor) OUTPUT INSERTED.PlanoId VALUES (@anoInicio, @anoFim, @titulo, @criadoPor)`);
    } catch (erro) {
      // Chave única (AnoInicio, AnoFim): já existe plano para esse período.
      if (violouChaveUnica(erro)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe um plano PDQ para esse período." } };
        return;
      }
      throw erro;
    }
    const planoId = criado.recordset[0].PlanoId;

    for (const e of eixosOk) {
      await pool.request().input("planoId", sql.Int, planoId).input("nome", sql.NVarChar(200), e.nome).input("descricao", sql.NVarChar(500), e.descricao)
        .query(`INSERT INTO PdqEixos (PlanoId, Nome, Descricao) VALUES (@planoId, @nome, @descricao)`);
    }

    await registrarAuditoria({
      tabela: "PdqPlanos", registroId: planoId, acao: "Criou Plano Diretor Quadrienal", usuarioId: usuario.membroId,
      dadosDepois: { anoInicio, anoFim, titulo: tituloOk, eixos: eixosOk.map(e => e.nome) }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Plano PDQ ${anoInicio}-${anoFim} criado com ${eixosOk.length} eixos.`, planoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!idBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/pdq-planos/{id}" } };
      return;
    }
    const { status } = req.body || {};
    if (!STATUS.includes(status)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Status inválido. Use um de: ${STATUS.join(", ")}.` } };
      return;
    }
    const id = auth.idDeRota(idBruto);
    const antes = id ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM PdqPlanos WHERE PlanoId = @id`) : { recordset: [] };
    if (antes.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Plano PDQ não encontrado." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), status).query(`UPDATE PdqPlanos SET Status = @status WHERE PlanoId = @id`);
    await registrarAuditoria({
      tabela: "PdqPlanos", registroId: id, acao: "Atualizou status do Plano PDQ", usuarioId: usuario.membroId,
      dadosAntes: antes.recordset[0], dadosDepois: { status }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Plano PDQ atualizado." } };
    return;
  }
};
