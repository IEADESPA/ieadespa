// GestaoPoliticasRetencao (vB.6 — Arquivo institucional com tabela de
// temporalidade). PoliticasRetencao (v0.1) era só catálogo — sem CRUD
// nenhum até aqui (as 5 linhas seed continuavam sendo as únicas possíveis).
// Restrito a nível Global: mudar prazo de retenção é decisão de governança
// e compliance/LGPD, não de módulo.
// GET  /api/politicas-retencao       -> catálogo completo
// POST /api/politicas-retencao       -> { categoria, baseLegal, diasRetencao? }
// PUT  /api/politicas-retencao/{id}  -> { baseLegal?, diasRetencao?, ativo? }
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

// Prazo de retenção alimenta rotinas que APAGAM/minimizam dado pessoal (GestaoCartas "processar" lê a política dos ex-membros): zero ou negativo apagaria na hora. Inteiro de 1 dia a
// 100 anos, ou null (= indeterminado).
const DIAS_MAXIMO = 36500;
function diasValido(v) { return v === null || (Number.isInteger(v) && v >= 1 && v <= DIAS_MAXIMO); }   // Number.isInteger não converte: "30", true e [30] são recusados
const MSG_DIAS = `diasRetencao deve ser um número inteiro de 1 a ${DIAS_MAXIMO} (ou vazio para indeterminado).`;

module.exports = async function (context, req) {
  // Institucional (retenção/LGPD da igreja toda): só o nível GERAL (papel Global E escopo de todas as congregações). Ler: qualquer geral logado (a tela de Arquivos usa as categorias);
  // gravar: além disso, a permissão de administrar acesso ou a do Encarregado de Dados (a mesma tela é usada na aba Proteção de Dados). Antes: qualquer papel "Global".
  const escrita = req.method !== "GET";
  const usuario = exigirGeral(req, context, escrita ? ["permissoes", "protecaodedados"] : null);
  if (!usuario) return;
  const pool = await getPool();
  const idBruto = context.bindingData.id;
  const id = idBruto === undefined || idBruto === null ? undefined : auth.idDeRota(idBruto);
  if (idBruto !== undefined && idBruto !== null && !id) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Política não encontrada." } };
    return;
  }

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT PoliticaId AS politicaId, Categoria AS categoria, BaseLegal AS baseLegal, DiasRetencao AS diasRetencao, Ativo AS ativo
      FROM PoliticasRetencao ORDER BY Categoria
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && !id) {
    const { categoria, baseLegal, diasRetencao } = req.body || {};
    if (typeof categoria !== "string" || !categoria.trim() || typeof baseLegal !== "string" || !baseLegal.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe categoria e baseLegal." } };
      return;
    }
    const dias = diasRetencao === undefined ? null : diasRetencao;
    if (!diasValido(dias)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: MSG_DIAS } };
      return;
    }
    const existente = await pool.request().input("categoria", sql.NVarChar(60), categoria.trim()).query(`SELECT 1 FROM PoliticasRetencao WHERE Categoria = @categoria`);
    if (existente.recordset.length > 0) {
      context.res = { status: 409, body: { sucesso: false, mensagem: "Já existe uma política com essa categoria." } };
      return;
    }
    const criada = await pool.request()
      .input("categoria", sql.NVarChar(60), categoria.trim()).input("baseLegal", sql.NVarChar(300), baseLegal.trim())
      .input("diasRetencao", sql.Int, dias)
      .query(`INSERT INTO PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) OUTPUT INSERTED.PoliticaId VALUES (@categoria, @baseLegal, @diasRetencao)`);
    await registrarAuditoria({
      tabela: "PoliticasRetencao", registroId: criada.recordset[0].PoliticaId, acao: "Criou política de retenção", usuarioId: usuario.membroId,
      dadosDepois: { categoria: categoria.trim(), baseLegal: baseLegal.trim(), diasRetencao: dias }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Política de retenção criada.", politicaId: criada.recordset[0].PoliticaId } };
    return;
  }

  if (req.method === "PUT" && id) {
    const { baseLegal, diasRetencao, ativo } = req.body || {};
    if ((baseLegal != null && (typeof baseLegal !== "string" || baseLegal.length > 300)) || (diasRetencao !== undefined && !diasValido(diasRetencao))) {
      context.res = { status: 400, body: { sucesso: false, mensagem: diasRetencao !== undefined && !diasValido(diasRetencao) ? MSG_DIAS : "baseLegal inválida (texto de até 300 caracteres)." } };
      return;
    }
    const existente = await pool.request().input("id", sql.Int, id).query(`SELECT BaseLegal, DiasRetencao, Ativo FROM PoliticasRetencao WHERE PoliticaId = @id`);
    if (existente.recordset.length === 0) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Política não encontrada." } };
      return;
    }
    const antes = existente.recordset[0];
    await pool.request()
      .input("id", sql.Int, id)
      .input("baseLegal", sql.NVarChar(300), baseLegal || null)
      .input("diasRetencao", sql.Int, diasRetencao !== undefined ? diasRetencao : null)
      .input("temDiasRetencao", sql.Bit, diasRetencao !== undefined ? 1 : 0)
      .input("ativo", sql.Bit, typeof ativo === "boolean" ? ativo : null)
      .query(`
        UPDATE PoliticasRetencao SET
          BaseLegal = COALESCE(@baseLegal, BaseLegal),
          DiasRetencao = CASE WHEN @temDiasRetencao = 1 THEN @diasRetencao ELSE DiasRetencao END,
          Ativo = COALESCE(@ativo, Ativo)
        WHERE PoliticaId = @id
      `);
    await registrarAuditoria({
      tabela: "PoliticasRetencao", registroId: id, acao: "Alterou política de retenção", usuarioId: usuario.membroId,
      dadosAntes: { baseLegal: antes.BaseLegal, diasRetencao: antes.DiasRetencao, ativo: antes.Ativo },
      dadosDepois: { baseLegal: baseLegal || antes.BaseLegal, diasRetencao: diasRetencao !== undefined ? diasRetencao : antes.DiasRetencao, ativo: typeof ativo === "boolean" ? ativo : antes.Ativo }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Política de retenção atualizada." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
