// GestaoParametrosMonetarios (v4.17 — Anexo de Parâmetros Monetários)
// Art. 65: valores monetários fixos corrigidos automaticamente a cada 12
// meses por IPCA/salário-mínimo. Art. 162-C §§1-2: fixados por Resolução
// Normativa da CLI; a Secretaria Geral mantém o "Anexo Único".
// GET  /api/parametros-monetarios -> valores (correção calculada na leitura)
// POST /api/parametros-monetarios -> { sigla, nome, valor, indexador?, unidade?, resolucaoId? }
// PUT  /api/parametros-monetarios -> { valorId, acao: 'CORRIGIR', percentual?, novoValor?, resolucaoId? }
// POST /api/parametros-monetarios/corrigir-todos -> { percentual, resolucaoId? }
// GET  /api/parametros-monetarios/resolucoes
// POST /api/parametros-monetarios/resolucoes -> { numero, dataResolucao, assunto }
// GET  /api/parametros-monetarios/anexo -> "Anexo Único" consolidado
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const INDEXADORES = ["IPCA", "SALARIO_MINIMO"];

function proximaCorrecao(data) {
  if (!data) return null;
  const d = new Date(data);
  return `${d.getFullYear() + 1}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function correcaoVencida(data, hoje) {
  const prox = proximaCorrecao(data);
  if (!prox) return false;
  return new Date(prox) < hoje;
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Parâmetros monetários são matéria da Secretaria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();
  const hoje = new Date();

  const SELECT_BASE = `
    SELECT v.ValorId AS valorId, v.Sigla AS sigla, v.Nome AS nome, v.Valor AS valor, v.Indexador AS indexador,
           v.Unidade AS unidade, v.ResolucaoId AS resolucaoId, r.Numero AS resolucaoNumero, r.DataResolucao AS resolucaoData,
           CONVERT(varchar(10), v.DataUltimaCorrecao, 120) AS dataUltimaCorrecao, v.Ativo AS ativo
    FROM ValoresMonetarios v LEFT JOIN ResolucoesNormativas r ON r.ResolucaoId = v.ResolucaoId
  `;

  if (req.method === "GET" && recurso === "resolucoes") {
    const result = await pool.request().query(`SELECT * FROM ResolucoesNormativas ORDER BY DataResolucao DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "resolucoes") {
    const { numero, dataResolucao, assunto } = req.body || {};
    if (!numero || !numero.trim() || !dataResolucao || !assunto || !assunto.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: numero, dataResolucao, assunto." } };
      return;
    }
    const criada = await pool.request().input("numero", sql.NVarChar(30), numero.trim()).input("data", sql.Date, dataResolucao)
      .input("assunto", sql.NVarChar(300), assunto.trim()).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ResolucoesNormativas (Numero, DataResolucao, Assunto, RegistradoPor) OUTPUT INSERTED.ResolucaoId VALUES (@numero, @data, @assunto, @por)`);
    await registrarAuditoria({
      tabela: "ResolucoesNormativas", registroId: criada.recordset[0].ResolucaoId, acao: "Registrou Resolução Normativa", usuarioId: usuario.membroId,
      dadosDepois: { numero, dataResolucao, assunto }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Resolução Normativa registrada.", resolucaoId: criada.recordset[0].ResolucaoId } };
    return;
  }

  if (req.method === "GET" && recurso === "anexo") {
    const result = await pool.request().query(`${SELECT_BASE} WHERE v.Ativo = 1 ORDER BY v.Nome`);
    const itens = result.recordset.map(v => Object.assign({}, v, {
      proximaCorrecao: proximaCorrecao(v.dataUltimaCorrecao),
      correcaoVencida: correcaoVencida(v.dataUltimaCorrecao, hoje)
    }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { anexoUnico: true, itens } };
    return;
  }

  if (req.method === "GET" && !recurso) {
    const result = await pool.request().query(`${SELECT_BASE} ORDER BY v.Nome`);
    const lista = result.recordset.map(v => Object.assign({}, v, {
      proximaCorrecao: proximaCorrecao(v.dataUltimaCorrecao),
      correcaoVencida: correcaoVencida(v.dataUltimaCorrecao, hoje)
    }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (req.method === "POST" && recurso === "corrigir-todos") {
    const { percentual, resolucaoId } = req.body || {};
    if (!percentual || Number(percentual) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe percentual maior que zero (variação do IPCA/salário-mínimo)." } };
      return;
    }
    const result = await pool.request().query(`SELECT ValorId, Valor FROM ValoresMonetarios WHERE Ativo = 1`);
    let corrigidos = 0;
    for (const v of result.recordset) {
      const novo = round2(Number(v.Valor) * (1 + Number(percentual) / 100));
      await pool.request().input("id", sql.Int, v.ValorId).input("valor", sql.Decimal(12, 2), novo)
        .input("data", sql.Date, hoje.toISOString().slice(0, 10)).input("resolucao", sql.Int, resolucaoId || null)
        .query(`UPDATE ValoresMonetarios SET Valor = @valor, DataUltimaCorrecao = @data, ResolucaoId = ISNULL(@resolucao, ResolucaoId) WHERE ValorId = @id`);
      corrigidos++;
    }
    await registrarAuditoria({
      tabela: "ValoresMonetarios", registroId: 0, acao: "Corrigiu todos os valores monetários", usuarioId: usuario.membroId,
      dadosDepois: { percentual, corrigidos }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ ${corrigidos} valor(es) corrigido(s) em ${percentual}%.` } };
    return;
  }

  if (req.method === "POST" && !recurso) {
    const { sigla, nome, valor, indexador, unidade, resolucaoId } = req.body || {};
    if (!sigla || !sigla.trim() || !nome || !nome.trim() || valor === undefined) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: sigla, nome, valor." } };
      return;
    }
    const criado = await pool.request().input("sigla", sql.NVarChar(40), sigla.trim()).input("nome", sql.NVarChar(150), nome.trim())
      .input("valor", sql.Decimal(12, 2), valor).input("indexador", sql.NVarChar(20), INDEXADORES.includes(indexador) ? indexador : "IPCA")
      .input("unidade", sql.NVarChar(10), unidade || "R$").input("resolucao", sql.Int, resolucaoId || null)
      .query(`INSERT INTO ValoresMonetarios (Sigla, Nome, Valor, Indexador, Unidade, ResolucaoId) OUTPUT INSERTED.ValorId VALUES (@sigla, @nome, @valor, @indexador, @unidade, @resolucao)`);
    await registrarAuditoria({
      tabela: "ValoresMonetarios", registroId: criado.recordset[0].ValorId, acao: "Registrou valor monetário", usuarioId: usuario.membroId,
      dadosDepois: { sigla, nome, valor }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Valor monetário registrado.", valorId: criado.recordset[0].ValorId } };
    return;
  }

  if (req.method === "PUT" && !recurso) {
    const { valorId, acao, percentual, novoValor, resolucaoId } = req.body || {};
    if (!valorId || acao !== "CORRIGIR") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe valorId e acao: 'CORRIGIR'." } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, valorId).query(`SELECT * FROM ValoresMonetarios WHERE ValorId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Valor não encontrado." } };
      return;
    }
    let novo = novoValor !== undefined ? Number(novoValor) : (percentual ? round2(Number(atual.recordset[0].Valor) * (1 + Number(percentual) / 100)) : null);
    if (novo === null || Number(novo) < 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe percentual ou novoValor válido." } };
      return;
    }
    await pool.request().input("id", sql.Int, valorId).input("valor", sql.Decimal(12, 2), novo)
      .input("data", sql.Date, hoje.toISOString().slice(0, 10)).input("resolucao", sql.Int, resolucaoId || null)
      .query(`UPDATE ValoresMonetarios SET Valor = @valor, DataUltimaCorrecao = @data, ResolucaoId = ISNULL(@resolucao, ResolucaoId) WHERE ValorId = @id`);
    await registrarAuditoria({
      tabela: "ValoresMonetarios", registroId: Number(valorId), acao: "Corrigiu valor monetário", usuarioId: usuario.membroId,
      dadosAntes: atual.recordset[0], dadosDepois: { novoValor: novo, percentual: percentual || null }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Valor corrigido." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: resolucoes, anexo ou corrigir-todos." } };
};

