// CompletarCadastro (FASE 10, as sobras de Membros, 19/11/2026) — a página PÚBLICA em que a própria pessoa completa o pré-cadastro pelo link do e-mail
// (shared/preCadastroPessoa.js, migração 183). Sem login: o código do link é o segredo (24 bytes aleatórios; só o resumo fica no banco), vale 7 dias e uma vez só.
//  GET  /api/completar-cadastro/{codigo}   -> { nome (só o primeiro), falta: ["cpf", "dataNascimento", ...] }
//  POST /api/completar-cadastro/{codigo}   -> body { cpf?, dataNascimento?, sexo?, estadoCivil? } (só o que faltava)
// Código errado, vencido, já usado ou cadastro já resolvido: a MESMA resposta (404). A resposta de quem completou é sempre a mesma: nunca revela se o CPF já
// existe numa ficha (a fila trata a repetição). 20 leituras por minuto por origem (por instância — shared/limiteTaxa.js).
const { getPool } = require("../shared/db");
const pessoa = require("../shared/preCadastroPessoa");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

const limitador = criarLimitador({ janelaMs: 60000, maximo: 20 });
const NAO = { sucesso: false, mensagem: "Este link não vale mais (venceu, já foi usado ou o cadastro já foi resolvido). Fale com a secretaria da sua congregação." };

module.exports = async function (context, req) {
  const cab = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  const res = (status, body) => { context.res = { status, headers: cab, body }; };
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) { context.res = { status: 429, headers: { ...cab, "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas tentativas seguidas. Aguarde um minuto." } }; return; }
  const codigo = String((context.bindingData && context.bindingData.codigo) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  try {
    const pool = await getPool();
    if (metodo === "GET") {
      const r = await pessoa.ler(pool, codigo);
      return r ? res(200, { sucesso: true, ...r }) : res(404, NAO);
    }
    if (metodo === "POST") {
      const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
      const r = await pessoa.completar(pool, { token: codigo, campos: corpo });
      if (r.naoExiste) return res(404, NAO);
      return res(r.sucesso ? 200 : 422, r);
    }
    return res(405, { sucesso: false, mensagem: "Método não suportado." });
  } catch (e) {
    context.log.error("[CompletarCadastro] erro:", e && e.message);
    return res(500, { sucesso: false, mensagem: "Não foi possível agora. Tente de novo em instantes." });
  }
};
