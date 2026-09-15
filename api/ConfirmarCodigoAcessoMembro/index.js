// ConfirmarCodigoAcessoMembro (vB.5 — Login simplificado pro membro comum)
// Passo 2: confere o código e emite uma sessão de verdade — mesmo
// mecanismo de shared/auth.js::criarSessao que Lideranca já usa, só que
// com permissoes vazias e nivel nulo (as rotas administrativas continuam
// batendo 403 sozinhas, exigirPermissao/exigirNivelGlobal não abrem
// exceção pra ninguém). Termos de Confidencialidade (v2.7) não se aplicam
// aqui: são sobre acessar DADO DE OUTRA PESSOA como Secretaria, e uma
// sessão de autoatendimento nunca tem permissão pra isso.
// POST /api/membro/confirmar-codigo -> { matricula, codigo }
const { getPool, sql } = require("../shared/db");
const { confirmarCodigo } = require("../shared/codigoAcesso");
const auth = require("../shared/auth");

module.exports = async function (context, req) {
  const matricula = Number((req.body || {}).matricula);
  const codigo = String((req.body || {}).codigo || "").trim();
  if (!matricula || !codigo) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe matrícula e código." } };
    return;
  }
  const pool = await getPool();
  const membro = (await pool.request().input("id", sql.Int, matricula).query(
    `SELECT MembroId, Nome FROM MembroReferencia WHERE MembroId = @id AND Status = 'ATIVO'`
  )).recordset[0];
  if (!membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Código incorreto." } }; // mesma mensagem de "código errado" — não confirma se a matrícula existe
    return;
  }

  const resultado = await confirmarCodigo(pool, membro.MembroId, codigo);
  if (!resultado.valido) {
    context.res = { status: 200, body: { sucesso: false, mensagem: resultado.mensagem } };
    return;
  }

  const dispositivoInfo = (req.headers && (req.headers["user-agent"] || req.headers["User-Agent"])) || null;
  const token = await auth.criarSessao(pool, sql, {
    membroId: membro.MembroId, nome: membro.Nome, tipo: "Membro (autoatendimento)",
    nivel: null, escopoCongregacoes: [], permissoes: [], termosPendentes: []
  }, dispositivoInfo);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, token, nome: membro.Nome, tipo: "Membro (autoatendimento)", nivel: null, permissoes: [], matricula: membro.MembroId }
  };
};
