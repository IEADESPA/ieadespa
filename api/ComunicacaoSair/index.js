// ComunicacaoSair (v7.12) — o link "não quero mais receber" do e-mail de comunicado, SEM login (quem clica pode não lembrar a senha; a saída tem de ser fácil: LGPD art. 8º, § 5º).
//  GET  ?t=<link assinado>     -> { valido, rotulo?, texto?, jaSaiu? }     (só lê: os "pré-visualizadores" de link dos e-mails não descadastram ninguém)
//  POST body:{ t }             -> { sucesso, rotulo, jaEstava }            (o botão da página app/sair.html grava o "não", com o endereço de quem clicou)
// O link assinado (shared/comunicacao.js, assinarSaida) é a prova: vale para uma pessoa, uma categoria e o e-mail; a convocação oficial não tem link (não se sai dela).
// Limitador por origem; nenhuma resposta diz quem é a pessoa.
const { getPool } = require("../shared/db");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");
const { ipDoCliente } = require("../shared/origemConexao");
const { resolverSegredo } = require("../shared/segredoSessao");
const db = require("../shared/comunicacaoDb");

const limitador = criarLimitador({ janelaMs: 60000, maximo: 20 });

module.exports = async function (context, req) {
  const res = (status, body) => { context.res = { status, headers: { "Cache-Control": "no-store", "Content-Type": "application/json" }, body }; };
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) { context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas tentativas. Aguarde um minuto." } }; return; }
  const token = req.method === "GET" ? (req.query || {}).t : (req.body && typeof req.body === "object" ? req.body.t : null);
  if (typeof token !== "string" || !token || token.length > 400) return res(400, { sucesso: false, valido: false, mensagem: "Link incompleto. Abra de novo o link do e-mail." });
  try {
    const segredo = resolverSegredo();
    const pool = await getPool();
    if (req.method === "GET") {
      const r = await db.consultarSaida(pool, { token, segredo });
      return res(r.valido ? 200 : 404, r.valido ? { sucesso: true, ...r } : { sucesso: false, valido: false, mensagem: "Este link não vale mais. Mude suas escolhas em Meu Painel → Comunicações." });
    }
    if (req.method !== "POST") return res(405, { sucesso: false, mensagem: "Método não suportado." });
    const r = await db.confirmarSaida(pool, { token, segredo, ip: ipDoCliente(req.headers || {}) });
    if (r.invalido) return res(404, { sucesso: false, valido: false, mensagem: "Este link não vale mais. Mude suas escolhas em Meu Painel → Comunicações." });
    if (r.limite) return res(429, { sucesso: false, mensagem: "Tente de novo em instantes." });
    return res(200, { sucesso: true, rotulo: r.rotulo, jaEstava: r.jaEstava });
  } catch (e) {
    context.log.error("[COMUNICACAO] saída:", e && e.message);
    return res(500, { sucesso: false, mensagem: "Erro interno. Tente de novo." });
  }
};
