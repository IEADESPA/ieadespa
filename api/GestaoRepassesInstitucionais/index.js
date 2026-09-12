// GestaoRepassesInstitucionais (v4.15 — Repasses institucionais)
// Dízimo institucional (Art. 126-N, I): 10% da arrecadação líquida
// consolidada do Distrito (ou congregação/departamento) para a Sede Geral.
// Atraso de repasse é infração de intervenção (Art. 144, II) — calculado
// na leitura e sinalizado como alerta de compliance.
// GET  /api/repasses-institucionais -> lista (com atraso calculado)
// POST /api/repasses-institucionais -> { origemTipo, origemId, origemNome, mesReferencia, valorArrecadadoLiquido }
// PUT  /api/repasses-institucionais -> { repasseId, acao: 'REPASSAR' }
// GET  /api/repasses-institucionais/alertas -> repasses atrasados
// GET  /api/repasses-institucionais/parametros
// PUT  /api/repasses-institucionais/parametros -> { percentualDizimoInstitucional?, diasTolerancia? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const repasses = require("../shared/repassesInstitucionais");

const ORIGENS = ["CONGREGACAO", "DEPARTAMENTO", "DISTRITO"];

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Repasses institucionais são matéria da Tesouraria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();
  const hoje = new Date();

  if (req.method === "GET" && recurso === "parametros") {
    const p = await repasses.parametros(pool, sql);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { percentualDizimoInstitucional: p.PercentualDizimoInstitucional, diasTolerancia: p.DiasTolerancia } };
    return;
  }

  if (req.method === "PUT" && recurso === "parametros") {
    const { percentualDizimoInstitucional, diasTolerancia } = req.body || {};
    const antes = await repasses.parametros(pool, sql);
    const percentual = percentualDizimoInstitucional !== undefined ? percentualDizimoInstitucional : antes.PercentualDizimoInstitucional;
    const dias = diasTolerancia !== undefined ? diasTolerancia : antes.DiasTolerancia;
    if (percentual < 0 || percentual > 100) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "percentualDizimoInstitucional deve estar entre 0 e 100." } };
      return;
    }
    if (!Number.isInteger(Number(dias)) || dias < 0 || dias > 28) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "diasTolerancia deve ser um número inteiro entre 0 e 28." } };
      return;
    }
    await pool.request()
      .input("percentual", sql.Decimal(5, 2), percentual)
      .input("dias", sql.Int, dias)
      .query(`UPDATE ParametrosRepasseInstitucional SET PercentualDizimoInstitucional = @percentual, DiasTolerancia = @dias WHERE ParametroId = 1`);
    await registrarAuditoria({
      tabela: "ParametrosRepasseInstitucional", registroId: 1, acao: "Atualizou parâmetros de repasse institucional", usuarioId: usuario.membroId,
      dadosAntes: antes, dadosDepois: { percentualDizimoInstitucional: percentual, diasTolerancia: dias }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parâmetros atualizados." } };
    return;
  }

  if (req.method === "GET" && recurso === "alertas") {
    const p = await repasses.parametros(pool, sql);
    const result = await pool.request().query(`
      SELECT RepasseId AS repasseId, OrigemTipo AS origemTipo, OrigemId AS origemId, OrigemNome AS origemNome,
             MesReferencia AS mesReferencia, ValorRepasse AS valorRepasse, Status AS status
      FROM RepassesInstitucionais WHERE Status = 'PENDENTE' ORDER BY MesReferencia
    `);
    const atrasados = result.recordset.filter(r => repasses.estaAtrasado(r.mesReferencia, hoje, Number(p.DiasTolerancia)))
      .map(r => Object.assign({}, r, { atrasado: true }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: atrasados };
    return;
  }

  if (req.method === "GET" && !recurso) {
    const p = await repasses.parametros(pool, sql);
    const result = await pool.request().query(`
      SELECT RepasseId AS repasseId, OrigemTipo AS origemTipo, OrigemId AS origemId, OrigemNome AS origemNome,
             MesReferencia AS mesReferencia, ValorArrecadadoLiquido AS valorArrecadadoLiquido,
             Percentual AS percentual, ValorRepasse AS valorRepasse, Status AS status,
             CONVERT(varchar(33), DataRepasse, 126) AS dataRepasse
      FROM RepassesInstitucionais ORDER BY MesReferencia DESC, OrigemNome
    `);
    const lista = result.recordset.map(r => Object.assign({}, r, { atrasado: r.status === "PENDENTE" && repasses.estaAtrasado(r.mesReferencia, hoje, Number(p.DiasTolerancia)) }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (req.method === "POST" && !recurso) {
    const { origemTipo, origemId, origemNome, mesReferencia, valorArrecadadoLiquido } = req.body || {};
    if (!origemTipo || !ORIGENS.includes(origemTipo) || !origemId || !origemNome || !mesReferencia) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: origemTipo (${ORIGENS.join("|")}), origemId, origemNome, mesReferencia${origemTipo === "CONGREGACAO" ? "" : ", valorArrecadadoLiquido"}.` } };
      return;
    }
    // Trava de Revisão 4-A: para CONGREGACAO a arrecadação líquida vem do
    // fechamento mensal real da Tesouraria Local (nunca digitada — evita
    // divergência entre o valor reportado à Sede e o valor do fechamento).
    // DEPARTAMENTO/DISTRITO não têm fechamento eletrônico próprio ainda,
    // então continuam com digitação manual.
    let valorArrecadadoLiquidoFinal;
    if (origemTipo === "CONGREGACAO") {
      const arrecadacaoFechamento = await repasses.arrecadacaoLiquidaFechamento(pool, sql, origemId, mesReferencia);
      if (arrecadacaoFechamento === null) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Mês ainda não fechado na Tesouraria Local para esta congregação — feche o mês antes de registrar o repasse institucional." } };
        return;
      }
      valorArrecadadoLiquidoFinal = arrecadacaoFechamento;
    } else {
      if (!valorArrecadadoLiquido || Number(valorArrecadadoLiquido) <= 0) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "valorArrecadadoLiquido deve ser maior que zero." } };
        return;
      }
      valorArrecadadoLiquidoFinal = Number(valorArrecadadoLiquido);
    }
    const p = await repasses.parametros(pool, sql);
    const percentual = Number(p.PercentualDizimoInstitucional);
    const valorRepasse = repasses.calcularValorRepasse(valorArrecadadoLiquidoFinal, percentual);
    const existente = await pool.request().input("tipo", sql.NVarChar(20), origemTipo).input("origem", sql.Int, origemId).input("mes", sql.Char(7), mesReferencia)
      .query(`SELECT RepasseId FROM RepassesInstitucionais WHERE OrigemTipo = @tipo AND OrigemId = @origem AND MesReferencia = @mes`);
    if (existente.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe repasse para esta origem e mês." } };
      return;
    }
    const criado = await pool.request().input("tipo", sql.NVarChar(20), origemTipo).input("origem", sql.Int, origemId)
      .input("nome", sql.NVarChar(200), origemNome.trim()).input("mes", sql.Char(7), mesReferencia)
      .input("arrecadado", sql.Decimal(12, 2), valorArrecadadoLiquidoFinal).input("percentual", sql.Decimal(5, 2), percentual)
      .input("valor", sql.Decimal(12, 2), valorRepasse).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO RepassesInstitucionais (OrigemTipo, OrigemId, OrigemNome, MesReferencia, ValorArrecadadoLiquido, Percentual, ValorRepasse, RegistradoPor)
              OUTPUT INSERTED.RepasseId VALUES (@tipo, @origem, @nome, @mes, @arrecadado, @percentual, @valor, @por)`);
    await registrarAuditoria({
      tabela: "RepassesInstitucionais", registroId: criado.recordset[0].RepasseId, acao: "Registrou repasse institucional", usuarioId: usuario.membroId,
      dadosDepois: { origemTipo, origemId, origemNome, mesReferencia, valorArrecadadoLiquido: valorArrecadadoLiquidoFinal, percentual, valorRepasse }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Repasse institucional registrado (${percentual}% = R$ ${valorRepasse.toFixed(2)}).`, repasseId: criado.recordset[0].RepasseId } };
    return;
  }

  if (req.method === "PUT" && !recurso) {
    const { repasseId, acao } = req.body || {};
    if (acao !== "REPASSAR" || !repasseId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe repasseId e acao: 'REPASSAR'." } };
      return;
    }
    await pool.request().input("id", sql.Int, repasseId).input("por", sql.Int, usuario.membroId)
      .query(`UPDATE RepassesInstitucionais SET Status = 'REPASSADO', DataRepasse = SYSUTCDATETIME(), RepassadoPor = @por WHERE RepasseId = @id`);
    await registrarAuditoria({
      tabela: "RepassesInstitucionais", registroId: Number(repasseId), acao: "Confirmou repasse institucional", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Repasse confirmado." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: alertas ou parametros." } };
};

