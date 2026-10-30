// RegistrarMarcoMembro
// Lança um marco manual na Linha do Tempo do membro (v1.6) — pra eventos que não têm
// onde morar hoje: conversão, ministério/igreja anterior, batismo no Espírito Santo.
// Lançamento normal de dado pastoral (permissão "pessoas") — diferente de CORRIGIR um
// marco já existente, que é restrito a nível Global (ver EditarMarcoMembro).
// POST /api/marcos-membro -> body: { membroId, tipo, descricao, dataMarco?, dataAproximada? }
// v8.5 — os tipos vêm do catálogo (TiposMarco; antes, uma lista fixa aqui): o tipo inativo não se lança, o "único" não se repete (Conversão, Curso de Discipulado...)
// e o "só do nível geral" (o batismo no Espírito Santo) só o nível geral lança, nunca em si mesmo. A data não é no futuro. Os marcos alimentam a trilha de discipulado.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { pessoaAlcancavel, exigirGeral } = require("../shared/escopoRotas");
const { dataISOValida } = require("../shared/escopoFichas");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const discipuladoDb = require("../shared/discipuladoDb");

// ESCOPO: o marco entra na linha do tempo de uma PESSOA — só lança quem alcança a congregação dela (shared/escopoRotas.js); fora do escopo vale a mesma resposta de
// "Matrícula não encontrada".
// Trava 8-A: o batismo no Espírito Santo é requisito da escada (Diácono em diante, Regimento Art. 72, III, a) — só o nível geral lança, e nunca em si mesmo (a mesma
// regra de cargo, "no cargo desde", dízimo e sexo no cadastro). v8.5: vale para todo tipo marcado "só do nível geral" no catálogo.

module.exports = async function (context, req) {
  let usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const { membroId: membroIdBruto, tipo, descricao, dataMarco, dataAproximada } = req.body || {};
  if (!membroIdBruto || !tipo || typeof tipo !== "string" || !descricao || !String(descricao).trim()) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId, tipo e descrição." } };
    return;
  }
  if (dataMarco && !dataISOValida(dataMarco)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "dataMarco inválida — use AAAA-MM-DD." } };
    return;
  }
  if (dataMarco && String(dataMarco).slice(0, 10) > hojeBrasilia()) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "A data do marco não pode ser no futuro." } };
    return;
  }

  const pool = await getPool();
  const tipoCat = await discipuladoDb.tipoMarco(pool, tipo);
  if (!tipoCat || !tipoCat.ativo) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Tipo de marco inválido (ou desativado no catálogo)." } };
    return;
  }
  const daEscada = tipoCat.soNivelGeral;
  if (daEscada) {
    usuario = exigirGeral(req, context, "pessoas");
    if (!usuario) return;
  }
  const pessoa = await pessoaAlcancavel(pool, usuario, membroIdBruto);
  if (!pessoa) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  const membroId = pessoa.membroId;
  if (daEscada && Number(membroId) === Number(usuario.membroId)) {
    context.res = { status: 422, body: { sucesso: false, mensagem: `Ninguém lança em si mesmo o marco "${tipoCat.nome}" (só do nível geral; o batismo no Espírito Santo conta para a escada ministerial): peça a outra pessoa do nível geral.` } };
    return;
  }

  // O "único" se confere dentro de uma transação com trava de faixa: dois cliques ao mesmo tempo não lançam duas conversões.
  const t = new sql.Transaction(pool);
  await t.begin();
  let marcoId;
  try {
    if (tipoCat.unico) {
      const ja = await new sql.Request(t).input("m", sql.Int, membroId).input("tipo", sql.NVarChar(30), tipoCat.codigo)
        .query(`SELECT TOP 1 MarcoId FROM MarcosMembro WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @m AND Tipo = @tipo`);
      if (ja.recordset.length) {
        await t.rollback();
        context.res = { status: 409, body: { sucesso: false, mensagem: `Esta pessoa já tem o marco "${tipoCat.nome}" (é único): corrija o que existe em vez de lançar outro.` } };
        return;
      }
    }
    const result = await new sql.Request(t)
      .input("membroId", sql.Int, membroId)
      .input("tipo", sql.NVarChar(30), tipoCat.codigo)
      .input("descricao", sql.NVarChar(500), String(descricao).trim().slice(0, 500))
      .input("dataMarco", sql.Date, dataMarco || null)
      .input("dataAproximada", sql.Bit, dataAproximada === true)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`
        INSERT INTO MarcosMembro (MembroId, Tipo, Descricao, DataMarco, DataAproximada, CriadoPor)
        OUTPUT INSERTED.MarcoId
        VALUES (@membroId, @tipo, @descricao, @dataMarco, @dataAproximada, @criadoPor)
      `);
    marcoId = result.recordset[0].MarcoId;
    await t.commit();
  } catch (e) {
    try { await t.rollback(); } catch (x) { /* já encerrada */ }
    throw e;
  }

  await registrarAuditoria({
    tabela: "MarcosMembro",
    registroId: marcoId,
    acao: "Registrou marco na linha do tempo",
    usuarioId: usuario.membroId,
    dadosDepois: { membroId, tipo, descricao, dataMarco, dataAproximada }
  });

  context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Marco registrado.", marcoId } };
};
