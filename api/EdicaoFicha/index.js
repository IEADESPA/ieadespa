// EdicaoFicha (FASE 10, v10.1b passo 5, 18/11/2026) — a ficha da pessoa editada CAMPO A CAMPO pela secretaria, e o HISTÓRICO de alterações da ficha.
// GET  /api/pessoas/{membroId}/ficha/campos       -> cada campo com o valor (CPF mascarado), se quem vê pode mudar e por quê não; a tabela "quem muda o quê"
// POST /api/pessoas/{membroId}/ficha/campo        -> { campo, valor, valorLido } grava UM campo (409 se a ficha mudou desde que a tela leu)
// GET  /api/pessoas/{membroId}/ficha/alteracoes   -> ?pagina=1&porPagina=30 — quem mudou o quê e quando (lido da trilha; CPF, e-mail e telefone mascarados)
// As regras moram em shared/edicaoFicha.js e a gravação em shared/edicaoFichaDb.js. A tela de hoje (o cadastro completo, GestaoPessoas) continua até as telas
// novas (passo 7) trocarem por esta.
// ESCOPO: só abre quem tem "pessoas" e alcança a congregação da pessoa (shared/escopoRotas.js); fora do escopo (ou matrícula malformada) a resposta é a mesma de
// "Matrícula não encontrada". O motivo de uma saída disciplinar, no histórico, só para quem tem "disciplina" com a pessoa no escopo DESSA permissão.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { pessoaAlcancavel, noEscopoDaPessoa } = require("../shared/escopoRotas");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { enviarEmailNotificacao } = require("../shared/notificacaoEmail");
const regras = require("../shared/edicaoFicha");
const db = require("../shared/edicaoFichaDb");

const NAO_ENCONTRADA = { sucesso: false, mensagem: "Matrícula não encontrada." };
const POR_PAGINA_MAX = 100;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;
  const acao = context.bindingData && context.bindingData.acao;
  const metodo = String(req.method || "GET").toUpperCase();
  const pool = await getPool();
  const alvo = await pessoaAlcancavel(pool, usuario, context.bindingData && context.bindingData.membroId);
  if (!alvo) {
    context.res = { status: 200, body: NAO_ENCONTRADA };
    return;
  }
  const membroId = alvo.membroId;
  const semCache = { "Content-Type": "application/json", "Cache-Control": "no-store" };

  if (metodo === "GET" && acao === "campos") {
    const ficha = await db.lerFicha(() => pool.request(), membroId);
    if (!ficha) { context.res = { status: 200, body: NAO_ENCONTRADA }; return; }
    const papel = regras.papelNaFicha(usuario);
    context.res = { status: 200, headers: semCache, body: { sucesso: true, membroId, papel, emProcessoDeCargo: ficha.emProcessoDeCargo,
      campos: db.camposParaSecretaria(ficha, papel, Number(membroId) === Number(usuario.membroId), await db.opcoesDaFicha(() => pool.request(), ficha)), quemMudaOQue: regras.tabelaDePapeis(), outrosCaminhos: regras.OUTRO_CAMINHO } };
    return;
  }

  if (metodo === "GET" && acao === "alteracoes") {
    const q = req.query || {};
    const pagina = Math.max(1, Math.min(10000, parseInt(q.pagina, 10) || 1));
    const porPagina = Math.max(1, Math.min(POR_PAGINA_MAX, parseInt(q.porPagina, 10) || 30));
    const vDisciplina = auth.visaoDaPermissao(usuario, "disciplina");
    const podeDisciplina = !!(vDisciplina && noEscopoDaPessoa(vDisciplina, alvo.congregacaoNome, alvo.extensaoNome));
    const h = await db.lerAlteracoes(pool, membroId, { pagina, porPagina, podeDisciplina });
    context.res = { status: 200, headers: semCache, body: { sucesso: true, membroId, ...h } };
    return;
  }

  if (metodo === "POST" && acao === "campo") {
    const corpo = req.body && typeof req.body === "object" ? req.body : {};
    const chave = typeof corpo.campo === "string" ? corpo.campo : "";
    if (!chave) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o campo." } };
      return;
    }
    const valorLido = Object.prototype.hasOwnProperty.call(corpo, "valorLido") ? corpo.valorLido : undefined;
    const r = await db.gravarCampoSecretaria(pool, { visao: usuario, membroId, chave, valor: corpo.valor, valorLido, hoje: hojeBrasilia() });
    const { status, emailAnterior, ...corpoResposta } = r;
    // o e-mail é por onde chega o código de acesso: quem perdeu o endereço antigo precisa saber que ele mudou (a mesma regra do cadastro completo)
    if (r.sucesso && emailAnterior) {
      try {
        await enviarEmailNotificacao({ email: emailAnterior, titulo: "O e-mail do seu cadastro na IEADESPA foi alterado",
          mensagem: `O e-mail do cadastro da matrícula ${membroId} foi alterado pela Secretaria. Se foi você quem pediu, não há nada a fazer; se não foi, avise a Secretaria da sua congregação.` });
      } catch (e) { context.log.error("Falha ao avisar o e-mail antigo:", e.message); }
    }
    context.res = { status: status || 200, headers: semCache, body: corpoResposta };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
};
