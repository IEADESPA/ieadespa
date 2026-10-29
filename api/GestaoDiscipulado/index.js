// GestaoDiscipulado (v8.5 — Trilha de discipulado; Regimento Art. 70 §4º e §5º, Art. 80, IV, Art. 128). Regra em shared/discipulado.js; banco em shared/discipuladoDb.js.
//  GET  catalogo                         ("pessoas", qualquer nível)  as etapas, os tipos de marco, as fontes e as trilhas de formação (o formulário do marco usa os tipos)
//  POST etapa                            (nível geral de "pessoas")   body:{etapaId?, chave, nome, descricao?, ordem, fonte, tipoMarco?, trilhaId?, geraAcompanhamento, ativa, preRequisitos}
//  POST tipo-marco                       (nível geral de "pessoas")   body:{codigo, nome, descricao?, unico, soNivelGeral, ativo}
//  GET  funil?diasParado=                ("pessoas", no território)   o funil de cada congregação do território (o nível geral vê todas)
//  GET  parados?congregacaoId=&etapaId=  ("pessoas", no território)   quem está parado antes daquela etapa, com o nome
//  GET  pessoa?membroId=                 ("pessoas", no território)   a caminhada de uma pessoa (o perfil)
//  GET  minha                            (a própria pessoa)            a minha caminhada (Meu Painel)
// Fora do território: a mesma resposta de "não encontrada". Sem sessão: 401.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { exigirGeral, pessoaAlcancavel, noEscopoDaPessoa, congregacaoNoEscopo } = require("../shared/escopoRotas");
const regra = require("../shared/discipulado");
const db = require("../shared/discipuladoDb");

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, "Não encontrada.");
  const status = resultado.sucesso ? statusOk : resultado.mudou ? 409 : 422;
  const { naoExiste, mudou, ...corpo } = resultado;
  context.res = { status, body: corpo };
}
const diasParadoDe = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 7 && n <= 730 ? n : regra.DIAS_PARADO_PADRAO; };

module.exports = async function (context, req) {
  if (!auth.exigirLogin(req, context)) return;   // a sessão antes de tudo: nem a ação desconhecida responde a quem não entrou
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const query = req.query || {};

  if (acao === "minha" && metodo === "GET") {
    const usuario = auth.exigirLogin(req, context);
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { sucesso: true, caminhada: await db.caminhadaDe(await getPool(), usuario.membroId) } };
    return;
  }
  if (acao === "catalogo" && metodo === "GET") {
    if (!auth.exigirPermissao(req, context, "pessoas")) return;
    context.res = { status: 200, body: { sucesso: true, ...(await db.catalogo(await getPool())) } };
    return;
  }
  if ((acao === "etapa" || acao === "tipo-marco") && metodo === "POST") {
    const usuario = exigirGeral(req, context, "pessoas");
    if (!usuario) return;
    if (acao === "etapa") {
      const v = regra.validarEtapa(corpo);
      if (!v.valido) return erro(context, 400, v.mensagem);
      return resposta(context, await db.salvarEtapa(await getPool(), { etapa: v.etapa, por: usuario.membroId }), v.etapa.etapaId ? 200 : 201);
    }
    const v = regra.validarTipoMarco(corpo);
    if (!v.valido) return erro(context, 400, v.mensagem);
    return resposta(context, await db.salvarTipoMarco(await getPool(), { tipo: v.tipo, por: usuario.membroId }));
  }
  if (["funil", "parados", "pessoa"].includes(acao) && metodo === "GET") {
    const usuario = auth.exigirPermissao(req, context, "pessoas");
    if (!usuario) return;
    const pool = await getPool();
    if (acao === "pessoa") {
      const p = await pessoaAlcancavel(pool, usuario, query.membroId);
      if (!p) return erro(context, 404, "Matrícula não encontrada.");
      context.res = { status: 200, body: { sucesso: true, caminhada: await db.caminhadaDe(pool, p.membroId) } };
      return;
    }
    const diasParado = diasParadoDe(query.diasParado);
    if (acao === "funil") {
      context.res = { status: 200, body: { sucesso: true, ...(await db.funil(pool, { noEscopo: (nome) => noEscopoDaPessoa(usuario, nome, null), diasParado })) } };
      return;
    }
    const congregacaoId = auth.idDeRota(query.congregacaoId);
    const etapaId = auth.idDeRota(query.etapaId);
    if (!congregacaoId || !etapaId || !(await congregacaoNoEscopo(pool, usuario, congregacaoId))) return erro(context, 404, "Congregação não encontrada.");
    context.res = { status: 200, body: { sucesso: true, itens: await db.parados(pool, { congregacaoId, etapaId, diasParado }) } };
    return;
  }
  erro(context, 404, "Ação inválida.");
};
