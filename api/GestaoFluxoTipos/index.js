// GestaoFluxoTipos (vB.3 — Motor de workflow genérico)
// Catálogo declarativo: tipo de fluxo → etapas (ordem, responsável por
// permissão+nível territorial mínimo, prazo/SLA). Restrito a nível Global —
// desenhar um fluxo novo é decisão de governança do sistema inteiro, não de
// um módulo. As etapas são definidas junto na criação do tipo (a ordem
// delas é o próprio desenho do fluxo, não faz sentido editar avulso depois
// que instâncias já existem rodando nele).
// GET  /api/fluxo-tipos           -> catálogo completo, com etapas aninhadas
// POST /api/fluxo-tipos           -> { chave, nome, etapas: [{ ordem, nome, responsavelPermissao, responsavelNivelMinimo?, prazoDias }] }
// PUT  /api/fluxo-tipos/{chave}   -> { ativo }
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

const NIVEIS_VALIDOS = ["CONGREGACAO", "AREA", "REGIAO", "QUADRANTE", "DISTRITO", "GLOBAL"];

module.exports = async function (context, req) {
  const chave = context.bindingData.chave;
  const usuario = auth.exigirNivelGlobal(req, context);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !chave) {
    const tipos = (await pool.request().query(`SELECT Chave AS chave, Nome AS nome, Ativo AS ativo FROM TiposFluxo ORDER BY Nome`)).recordset;
    const etapas = (await pool.request().query(`
      SELECT TipoFluxo AS tipoFluxo, Ordem AS ordem, Nome AS nome, ResponsavelPermissao AS responsavelPermissao,
             ResponsavelNivelMinimo AS responsavelNivelMinimo, PrazoDias AS prazoDias
      FROM FluxoEtapas ORDER BY TipoFluxo, Ordem
    `)).recordset;
    const catalogo = tipos.map(t => ({ ...t, etapas: etapas.filter(e => e.tipoFluxo === t.chave) }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: catalogo };
    return;
  }

  if (req.method === "POST" && !chave) {
    const { chave: novaChave, nome, etapas } = req.body || {};
    if (!novaChave || !novaChave.trim() || !nome || !nome.trim() || !Array.isArray(etapas) || etapas.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe chave, nome e ao menos 1 etapa." } };
      return;
    }
    for (const e of etapas) {
      if (!e.ordem || !e.nome || !e.responsavelPermissao || !e.prazoDias) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Cada etapa exige: ordem, nome, responsavelPermissao, prazoDias." } };
        return;
      }
      if (e.responsavelNivelMinimo && !NIVEIS_VALIDOS.includes(e.responsavelNivelMinimo)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: `Nível inválido: ${e.responsavelNivelMinimo}. Use ${NIVEIS_VALIDOS.join(", ")}.` } };
        return;
      }
    }
    const existente = await pool.request().input("chave", sql.NVarChar(60), novaChave).query(`SELECT 1 FROM TiposFluxo WHERE Chave = @chave`);
    if (existente.recordset.length > 0) {
      context.res = { status: 409, body: { sucesso: false, mensagem: "Já existe um tipo de fluxo com essa chave." } };
      return;
    }
    await pool.request().input("chave", sql.NVarChar(60), novaChave).input("nome", sql.NVarChar(150), nome)
      .query(`INSERT INTO TiposFluxo (Chave, Nome) VALUES (@chave, @nome)`);
    for (const e of etapas) {
      await pool.request()
        .input("tipoFluxo", sql.NVarChar(60), novaChave).input("ordem", sql.Int, e.ordem).input("nome", sql.NVarChar(150), e.nome)
        .input("responsavelPermissao", sql.NVarChar(60), e.responsavelPermissao)
        .input("responsavelNivelMinimo", sql.NVarChar(20), e.responsavelNivelMinimo || null)
        .input("prazoDias", sql.Int, e.prazoDias)
        .query(`INSERT INTO FluxoEtapas (TipoFluxo, Ordem, Nome, ResponsavelPermissao, ResponsavelNivelMinimo, PrazoDias)
                VALUES (@tipoFluxo, @ordem, @nome, @responsavelPermissao, @responsavelNivelMinimo, @prazoDias)`);
    }
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Tipo de fluxo criado.", chave: novaChave } };
    return;
  }

  if (req.method === "PUT" && chave) {
    const { ativo } = req.body || {};
    if (typeof ativo !== "boolean") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe ativo (booleano)." } };
      return;
    }
    const existente = await pool.request().input("chave", sql.NVarChar(60), chave).query(`SELECT 1 FROM TiposFluxo WHERE Chave = @chave`);
    if (existente.recordset.length === 0) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Tipo de fluxo não encontrado." } };
      return;
    }
    await pool.request().input("chave", sql.NVarChar(60), chave).input("ativo", sql.Bit, ativo)
      .query(`UPDATE TiposFluxo SET Ativo = @ativo WHERE Chave = @chave`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: ativo ? "✅ Tipo de fluxo ativado." : "✅ Tipo de fluxo desativado." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
