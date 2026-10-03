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
const { confirmarCodigo, MENSAGEM_FALHA } = require("../shared/codigoAcesso");
const { lerPin } = require("../shared/pinMembro");
const auth = require("../shared/auth");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

// Contenção por origem (por instância), além do limite de tentativas por código (shared/codigoAcesso.js).
const limitador = criarLimitador({ janelaMs: 60000, maximo: 60 });

module.exports = async function (context, req) {
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." } };
    return;
  }
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const matricula = auth.idDeRota(corpo.matricula);
  const codigo = typeof corpo.codigo === "string" ? corpo.codigo.trim() : "";
  if (!matricula || !codigo) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe matrícula e código." } };
    return;
  }
  const pool = await getPool();
  const membro = (await pool.request().input("id", sql.Int, matricula).query(
    `SELECT MembroId, Nome FROM MembroReferencia WHERE MembroId = @id AND Status = 'ATIVO'`
  )).recordset[0];
  if (!membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: MENSAGEM_FALHA } }; // a MESMA mensagem de qualquer falha de código — não confirma se a matrícula existe
    return;
  }

  const resultado = await confirmarCodigo(pool, membro.MembroId, codigo);
  if (!resultado.valido) {
    context.res = { status: 200, body: { sucesso: false, mensagem: resultado.mensagem } };
    return;
  }

  // fecho da v7.5 — `via: "CODIGO"` na sessão: quem entrou pelo código do e-mail (esqueci o PIN / primeiro acesso) escolhe o PIN novo sem informar o antigo.
  // `precisaCriarPin`: ainda não tem PIN, ou só tem o provisório — a tela manda criar antes de abrir o painel.
  const pin = await lerPin(pool, membro.MembroId);
  const precisaCriarPin = !pin || pin.provisorio;
  const dispositivoInfo = (req.headers && (req.headers["user-agent"] || req.headers["User-Agent"])) || null;
  const token = await auth.criarSessao(pool, sql, {
    membroId: membro.MembroId, nome: membro.Nome, tipo: "Membro (autoatendimento)",
    nivel: null, escopoCongregacoes: [], permissoes: [], termosPendentes: [], via: "CODIGO"
  }, dispositivoInfo);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, token, nome: membro.Nome, tipo: "Membro (autoatendimento)", nivel: null, permissoes: [], matricula: membro.MembroId, precisaCriarPin }
  };
};
