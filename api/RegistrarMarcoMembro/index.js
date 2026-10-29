// RegistrarMarcoMembro
// Lança um marco manual na Linha do Tempo do membro (v1.6) — pra eventos que não têm
// onde morar hoje: conversão, ministério/igreja anterior, batismo no Espírito Santo.
// Lançamento normal de dado pastoral (permissão "pessoas") — diferente de CORRIGIR um
// marco já existente, que é restrito a nível Global (ver EditarMarcoMembro).
// POST /api/marcos-membro -> body: { membroId, tipo, descricao, dataMarco?, dataAproximada? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { pessoaAlcancavel, exigirGeral } = require("../shared/escopoRotas");
const { dataISOValida } = require("../shared/escopoFichas");

const TIPOS_MARCO = ["CONVERSAO", "MINISTERIO_ANTERIOR", "BATISMO_ESPIRITO_SANTO", "OUTRO"];

// ESCOPO: o marco entra na linha do tempo de uma PESSOA — só lança quem alcança a congregação dela (shared/escopoRotas.js); fora do escopo vale a mesma resposta de
// "Matrícula não encontrada".
// Trava 8-A: o batismo no Espírito Santo é requisito da escada (Diácono em diante, Regimento Art. 72, III, a) — só o nível geral lança, e nunca em si mesmo (a mesma
// regra de cargo, "no cargo desde", dízimo e sexo no cadastro).
const MARCO_DA_ESCADA = "BATISMO_ESPIRITO_SANTO";

module.exports = async function (context, req) {
  const daEscada = !!req.body && req.body.tipo === MARCO_DA_ESCADA;
  const usuario = daEscada ? exigirGeral(req, context, "pessoas") : auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const { membroId: membroIdBruto, tipo, descricao, dataMarco, dataAproximada } = req.body || {};
  if (!membroIdBruto || !tipo || !descricao || !String(descricao).trim()) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId, tipo e descrição." } };
    return;
  }
  if (!TIPOS_MARCO.includes(tipo)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo de marco inválido. Use um de: ${TIPOS_MARCO.join(", ")}.` } };
    return;
  }
  if (dataMarco && !dataISOValida(dataMarco)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "dataMarco inválida — use AAAA-MM-DD." } };
    return;
  }

  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, membroIdBruto);
  if (!pessoa) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  const membroId = pessoa.membroId;
  if (daEscada && Number(membroId) === Number(usuario.membroId)) {
    context.res = { status: 422, body: { sucesso: false, mensagem: "Ninguém lança o próprio batismo no Espírito Santo (conta para a escada ministerial): peça a outra pessoa do nível geral." } };
    return;
  }

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("tipo", sql.NVarChar(30), tipo)
    .input("descricao", sql.NVarChar(500), String(descricao).trim().slice(0, 500))
    .input("dataMarco", sql.Date, dataMarco || null)
    .input("dataAproximada", sql.Bit, dataAproximada === true)
    .input("criadoPor", sql.Int, usuario.membroId)
    .query(`
      INSERT INTO MarcosMembro (MembroId, Tipo, Descricao, DataMarco, DataAproximada, CriadoPor)
      OUTPUT INSERTED.MarcoId
      VALUES (@membroId, @tipo, @descricao, @dataMarco, @dataAproximada, @criadoPor)
    `);
  const marcoId = result.recordset[0].MarcoId;

  await registrarAuditoria({
    tabela: "MarcosMembro",
    registroId: marcoId,
    acao: "Registrou marco na linha do tempo",
    usuarioId: usuario.membroId,
    dadosDepois: { membroId, tipo, descricao, dataMarco, dataAproximada }
  });

  context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Marco registrado.", marcoId } };
};
