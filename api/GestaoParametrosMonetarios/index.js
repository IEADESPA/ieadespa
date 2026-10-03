// GestaoParametrosMonetarios (v4.17 — Anexo de Parâmetros Monetários)
// Art. 65: valores monetários fixos corrigidos automaticamente a cada 12
// meses por IPCA/salário-mínimo. Art. 162-C §§1-2: fixados por Resolução
// Normativa da CLI; a Secretaria Geral mantém o "Anexo Único".
// INSTITUCIONAL/CONFIG (valem para a igreja inteira): todos os métodos são só do nível geral (papel Global com escopo de todas as congregações).
// GET  /api/parametros-monetarios -> valores (correção calculada na leitura)
// POST /api/parametros-monetarios -> { sigla, nome, valor, indexador?, unidade?, resolucaoId? }
// PUT  /api/parametros-monetarios -> { valorId, acao: 'CORRIGIR', percentual?, novoValor?, resolucaoId? }
// POST /api/parametros-monetarios/corrigir-todos -> { percentual, resolucaoId? }
// GET  /api/parametros-monetarios/resolucoes
// POST /api/parametros-monetarios/resolucoes -> { numero, dataResolucao, assunto }
// GET  /api/parametros-monetarios/anexo -> "Anexo Único" consolidado
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { numeroEntre, dataIso, textoAte, afetadas, MAX_DECIMAL_12_2 } = require("../shared/entradaFinanceira");

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const INDEXADORES = ["IPCA", "SALARIO_MINIMO"];
// Correção anual por IPCA/salário-mínimo: acima disso é erro de digitação, não correção.
const PERCENTUAL_MAXIMO = 100;

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
function recusar400(context, mensagem) {
  context.res = { status: 400, body: { sucesso: false, mensagem } };
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();
  const hoje = new Date();

  const SELECT_BASE = `
    SELECT v.ValorId AS valorId, v.Sigla AS sigla, v.Nome AS nome, v.Valor AS valor, v.Indexador AS indexador,
           v.Unidade AS unidade, v.ResolucaoId AS resolucaoId, r.Numero AS resolucaoNumero, r.DataResolucao AS resolucaoData,
           CONVERT(varchar(10), v.DataUltimaCorrecao, 120) AS dataUltimaCorrecao, v.Ativo AS ativo
    FROM ValoresMonetarios v LEFT JOIN ResolucoesNormativas r ON r.ResolucaoId = v.ResolucaoId
  `;

  // Resolução opcional do corpo: ausente → null; presente e malformada → undefined (a rota recusa com 400).
  const resolucaoOpcional = (v) => (v === undefined || v === null || v === "" ? null : (auth.idDeRota(v) || undefined));

  if (req.method === "GET" && recurso === "resolucoes") {
    const result = await pool.request().query(`SELECT * FROM ResolucoesNormativas ORDER BY DataResolucao DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "resolucoes") {
    const { numero, dataResolucao, assunto } = req.body || {};
    const numeroOk = textoAte(numero, 30), assuntoOk = textoAte(assunto, 300), data = dataIso(dataResolucao);
    if (!numeroOk || !assuntoOk || !data) {
      return recusar400(context, "Campos obrigatórios: numero (até 30 caracteres), dataResolucao (AAAA-MM-DD), assunto (até 300 caracteres).");
    }
    const criada = await pool.request().input("numero", sql.NVarChar(30), numeroOk).input("data", sql.Date, data)
      .input("assunto", sql.NVarChar(300), assuntoOk).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ResolucoesNormativas (Numero, DataResolucao, Assunto, RegistradoPor) OUTPUT INSERTED.ResolucaoId VALUES (@numero, @data, @assunto, @por)`);
    await registrarAuditoria({
      tabela: "ResolucoesNormativas", registroId: criada.recordset[0].ResolucaoId, acao: "Registrou Resolução Normativa", usuarioId: usuario.membroId,
      dadosDepois: { numero: numeroOk, dataResolucao: data, assunto: assuntoOk }
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
    const pct = numeroEntre(percentual, 0.0001, PERCENTUAL_MAXIMO);
    if (pct === null) {
      return recusar400(context, `Informe percentual maior que zero e de até ${PERCENTUAL_MAXIMO}% (variação do IPCA/salário-mínimo).`);
    }
    const resolucao = resolucaoOpcional(resolucaoId);
    if (resolucao === undefined) return recusar400(context, "resolucaoId inválido.");
    // UMA instrução só: ou todos os valores ativos são corrigidos, ou nenhum (antes era um laço, e um estouro no meio deixava a tabela corrigida pela metade).
    let corrigidos;
    try {
      const r = await pool.request().input("pct", sql.Decimal(9, 4), pct).input("data", sql.Date, hoje.toISOString().slice(0, 10)).input("resolucao", sql.Int, resolucao)
        .query(`UPDATE ValoresMonetarios SET Valor = ROUND(Valor * (1 + @pct / 100.0), 2), DataUltimaCorrecao = @data, ResolucaoId = ISNULL(@resolucao, ResolucaoId) WHERE Ativo = 1`);
      corrigidos = afetadas(r);
    } catch (erro) {
      // Estouro de DECIMAL(12,2) (arithmetic overflow, 8115) ou resolução inexistente (547): nada foi alterado.
      if (erro && (erro.number === 8115 || erro.number === 547)) {
        return recusar400(context, "Não foi possível aplicar a correção: algum valor passaria do limite, ou a resolução não existe. Nada foi alterado.");
      }
      throw erro;
    }
    await registrarAuditoria({
      tabela: "ValoresMonetarios", registroId: 0, acao: "Corrigiu todos os valores monetários", usuarioId: usuario.membroId,
      dadosDepois: { percentual: pct, corrigidos }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ ${corrigidos} valor(es) corrigido(s) em ${pct}%.` } };
    return;
  }

  if (req.method === "POST" && !recurso) {
    const { sigla, nome, valor, indexador, unidade, resolucaoId } = req.body || {};
    const siglaOk = textoAte(sigla, 40), nomeOk = textoAte(nome, 150), valorOk = numeroEntre(valor, 0, MAX_DECIMAL_12_2);
    if (!siglaOk || !nomeOk || valorOk === null) {
      return recusar400(context, "Campos obrigatórios: sigla (até 40), nome (até 150), valor (zero ou mais).");
    }
    const unidadeOk = unidade === undefined || unidade === null || unidade === "" ? "R$" : textoAte(unidade, 10);
    if (!unidadeOk) return recusar400(context, "unidade: até 10 caracteres.");
    const resolucao = resolucaoOpcional(resolucaoId);
    if (resolucao === undefined) return recusar400(context, "resolucaoId inválido.");
    // A sigla é a chave de uso do sistema (ex.: GestaoDoacoes lê LIMITE_IDENTIFICACAO_DOADOR pela sigla): não pode haver duas iguais.
    const igual = await pool.request().input("sigla", sql.NVarChar(40), siglaOk).query(`SELECT ValorId FROM ValoresMonetarios WHERE Sigla = @sigla`);
    if (igual.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe um valor monetário com essa sigla." } };
      return;
    }
    const criado = await pool.request().input("sigla", sql.NVarChar(40), siglaOk).input("nome", sql.NVarChar(150), nomeOk)
      .input("valor", sql.Decimal(12, 2), valorOk).input("indexador", sql.NVarChar(20), INDEXADORES.includes(indexador) ? indexador : "IPCA")
      .input("unidade", sql.NVarChar(10), unidadeOk).input("resolucao", sql.Int, resolucao)
      .query(`INSERT INTO ValoresMonetarios (Sigla, Nome, Valor, Indexador, Unidade, ResolucaoId) OUTPUT INSERTED.ValorId VALUES (@sigla, @nome, @valor, @indexador, @unidade, @resolucao)`);
    await registrarAuditoria({
      tabela: "ValoresMonetarios", registroId: criado.recordset[0].ValorId, acao: "Registrou valor monetário", usuarioId: usuario.membroId,
      dadosDepois: { sigla: siglaOk, nome: nomeOk, valor: valorOk }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Valor monetário registrado.", valorId: criado.recordset[0].ValorId } };
    return;
  }

  if (req.method === "PUT" && !recurso) {
    const { valorId: valorBruto, acao, percentual, novoValor, resolucaoId } = req.body || {};
    const valorId = auth.idDeRota(valorBruto);
    if (!valorId || acao !== "CORRIGIR") {
      return recusar400(context, "Informe valorId e acao: 'CORRIGIR'.");
    }
    const resolucao = resolucaoOpcional(resolucaoId);
    if (resolucao === undefined) return recusar400(context, "resolucaoId inválido.");
    const atual = await pool.request().input("id", sql.Int, valorId).query(`SELECT * FROM ValoresMonetarios WHERE ValorId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Valor não encontrado." } };
      return;
    }
    let novo = null;
    if (novoValor !== undefined && novoValor !== null && novoValor !== "") {
      novo = numeroEntre(novoValor, 0, MAX_DECIMAL_12_2);
    } else if (percentual !== undefined && percentual !== null && percentual !== "" && Number(percentual) !== 0) {
      const pct = numeroEntre(percentual, -PERCENTUAL_MAXIMO, PERCENTUAL_MAXIMO);
      novo = pct === null ? null : round2(Number(atual.recordset[0].Valor) * (1 + pct / 100));
      if (novo !== null && (novo < 0 || novo > MAX_DECIMAL_12_2)) novo = null;
    }
    if (novo === null) {
      return recusar400(context, "Informe percentual ou novoValor válido.");
    }
    await pool.request().input("id", sql.Int, valorId).input("valor", sql.Decimal(12, 2), novo)
      .input("data", sql.Date, hoje.toISOString().slice(0, 10)).input("resolucao", sql.Int, resolucao)
      .query(`UPDATE ValoresMonetarios SET Valor = @valor, DataUltimaCorrecao = @data, ResolucaoId = ISNULL(@resolucao, ResolucaoId) WHERE ValorId = @id`);
    await registrarAuditoria({
      tabela: "ValoresMonetarios", registroId: valorId, acao: "Corrigiu valor monetário", usuarioId: usuario.membroId,
      dadosAntes: atual.recordset[0], dadosDepois: { novoValor: novo, percentual: percentual || null }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Valor corrigido." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: resolucoes, anexo ou corrigir-todos." } };
};
