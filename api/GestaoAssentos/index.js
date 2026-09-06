// GestaoAssentos
// Cadeiras institucionais: quem ocupa assento em qual órgão (Assembleia, CLI,
// Diretoria, CEI, Conselho Fiscal). É a base que faltava pra composição mista da
// CLI (shared/universo.js já lê Assentos por Função, mas nada os criava) e pro
// card "Meus Órgãos" do Meu Painel (ver MinhaFrequencia). Exige a permissão
// "pessoas" (mesma da aba Órgãos, onde essa gestão fica embutida na tela).
//
// Cargo eletivo/nomeado tem mandato com prazo — se a Secretaria informar
// duracaoMeses ao criar, DataTerminoPrevisao é calculada (mesmo raciocínio do
// Processo Disciplinar, v0.2): vencimento lido na hora, sem job/timer, nunca
// fecha a cadeira sozinho (só deixa de contar pro universo do órgão — ver
// shared/universo.js — até alguém confirmar/renovar/encerrar formalmente).
//
// GET  /api/assentos?orgaoId=&membroId=&incluirEncerrados=1
// POST /api/assentos                  body: { membroId, orgaoId, tipoAssento, cargoOuFuncao?, dataInicio?, duracaoMeses? }
// POST /api/assentos/{id}/encerrar    body: { motivoEncerramento? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { CARGOS_DIRETORIA, ORGAOS_INCOMPATIVEIS, validarIncompatibilidadeExecutiva, cargoJaOcupado } = require("../shared/diretoria");

const TIPOS_VALIDOS = ["ORDENACAO", "FUNCAO"];

const SELECT_ASSENTO = `
  SELECT a.AssentoId AS assentoId, a.MembroId AS membroId, m.Nome AS nome,
         a.OrgaoId AS orgaoId, o.Nome AS orgaoNome, a.TipoAssento AS tipoAssento,
         a.CargoOuFuncao AS cargoOuFuncao, CONVERT(varchar(10), a.DataInicio, 120) AS dataInicio,
         CONVERT(varchar(10), a.DataTerminoPrevisao, 120) AS dataTerminoPrevisao,
         CONVERT(varchar(10), a.DataFim, 120) AS dataFim, a.MotivoEncerramento AS motivoEncerramento
  FROM Assentos a
  JOIN MembroReferencia m ON m.MembroId = a.MembroId
  JOIN Orgaos o ON o.OrgaoId = a.OrgaoId`;

function comSituacaoEfetiva(assento, hoje) {
  let situacaoEfetiva = "ATIVA";
  if (assento.dataFim) situacaoEfetiva = "ENCERRADA";
  else if (assento.dataTerminoPrevisao && assento.dataTerminoPrevisao < hoje) situacaoEfetiva = "MANDATO_VENCIDO";
  return Object.assign({}, assento, { situacaoEfetiva });
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const id = context.bindingData.id;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  if (req.method === "GET") {
    const { orgaoId, membroId, incluirEncerrados } = req.query || {};
    const request = pool.request();
    const condicoes = [];
    if (!incluirEncerrados) condicoes.push("a.DataFim IS NULL");
    if (orgaoId) { request.input("orgaoId", sql.Int, orgaoId); condicoes.push("a.OrgaoId = @orgaoId"); }
    if (membroId) { request.input("membroId", sql.Int, membroId); condicoes.push("a.MembroId = @membroId"); }
    const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
    const result = await request.query(`${SELECT_ASSENTO} ${where} ORDER BY o.Nome, m.Nome`);
    const hoje = new Date().toISOString().slice(0, 10);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset.map(a => comSituacaoEfetiva(a, hoje)) };
    return;
  }

  if (req.method === "POST" && id && acao === "encerrar") {
    const { motivoEncerramento } = req.body || {};
    const antes = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM Assentos WHERE AssentoId = @id`);
    if (!antes.recordset[0]) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Cadeira não encontrada." } };
      return;
    }
    if (antes.recordset[0].DataFim) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Essa cadeira já foi encerrada." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(200), motivoEncerramento || null)
      .query(`UPDATE Assentos SET DataFim = CAST(SYSUTCDATETIME() AS DATE), MotivoEncerramento = @motivo WHERE AssentoId = @id`);
    await registrarAuditoria({
      tabela: "Assentos", registroId: Number(id), acao: "Encerrou cadeira", usuarioId: usuario.membroId,
      dadosAntes: antes.recordset[0], dadosDepois: { motivoEncerramento: motivoEncerramento || null }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Cadeira encerrada." } };
    return;
  }

  if (req.method === "POST" && !id) {
    const { membroId, orgaoId, tipoAssento, cargoOuFuncao, dataInicio, duracaoMeses } = req.body || {};
    if (!membroId || !orgaoId || !tipoAssento || !TIPOS_VALIDOS.includes(tipoAssento)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: membroId, orgaoId, tipoAssento (${TIPOS_VALIDOS.join(" ou ")}).` } };
      return;
    }
    const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    const orgao = await pool.request().input("id", sql.Int, orgaoId).query(`SELECT OrgaoId, Sigla FROM Orgaos WHERE OrgaoId = @id`);
    if (orgao.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão inválido." } };
      return;
    }
    const orgaoSigla = orgao.recordset[0].Sigla;

    // Art. 38 §3º, II — incompatibilidade Diretoria/Conselho Fiscal/CEI.
    if (ORGAOS_INCOMPATIVEIS.includes(orgaoSigla)) {
      const incompat = await validarIncompatibilidadeExecutiva(pool, sql, membroId, orgaoSigla);
      if (incompat.bloqueado) {
        context.res = { status: 200, body: { sucesso: false, mensagem: incompat.mensagem } };
        return;
      }
    }

    // Art. 29 — os 10 cargos da Diretoria são fixos, 1 ocupante ativo por vez.
    if (orgaoSigla === "DIRETORIA_EXECUTIVA") {
      if (!cargoOuFuncao || !CARGOS_DIRETORIA[cargoOuFuncao]) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Cargo inválido. Use um de: ${Object.keys(CARGOS_DIRETORIA).join(", ")}.` } };
        return;
      }
      if (await cargoJaOcupado(pool, sql, orgaoId, cargoOuFuncao)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Já existe alguém ocupando ${CARGOS_DIRETORIA[cargoOuFuncao].rotulo} (Art. 29 — 1 titular por cargo).` } };
        return;
      }
    }

    const result = await pool.request()
      .input("membroId", sql.Int, membroId)
      .input("orgaoId", sql.Int, orgaoId)
      .input("tipoAssento", sql.NVarChar(30), tipoAssento)
      .input("cargoOuFuncao", sql.NVarChar(100), cargoOuFuncao || null)
      .input("dataInicio", sql.Date, dataInicio || null)
      .input("duracaoMeses", sql.Int, duracaoMeses || null)
      .query(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio, DataTerminoPrevisao)
              OUTPUT INSERTED.AssentoId
              VALUES (@orgaoId, @membroId, @tipoAssento, @cargoOuFuncao,
                      COALESCE(@dataInicio, CAST(SYSUTCDATETIME() AS DATE)),
                      CASE WHEN @duracaoMeses IS NULL THEN NULL ELSE DATEADD(month, @duracaoMeses, COALESCE(@dataInicio, CAST(SYSUTCDATETIME() AS DATE))) END)`);
    const assentoId = result.recordset[0].AssentoId;

    await registrarAuditoria({
      tabela: "Assentos", registroId: assentoId, acao: "Criou cadeira", usuarioId: usuario.membroId,
      dadosDepois: { membroId, orgaoId, tipoAssento, cargoOuFuncao: cargoOuFuncao || null, duracaoMeses: duracaoMeses || null }
    });

    const criado = await pool.request().input("id", sql.Int, assentoId).query(`${SELECT_ASSENTO} WHERE a.AssentoId = @id`);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Cadeira criada.", assento: criado.recordset[0] } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método/rota não suportado." } };
};
