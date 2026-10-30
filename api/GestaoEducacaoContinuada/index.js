// GestaoEducacaoContinuada (v8.6 — Educação continuada; Regimento Art. 68 §3º e Art. 70 §3º). Regra em shared/educacaoContinuada.js; banco em shared/educacaoContinuadaDb.js.
//  GET  painel                          (nível geral de "afm")  as edições da reciclagem, os exames e as pessoas obrigadas (obreiros e a Câmara), com a situação de cada uma
//  GET  edicao?edicaoId=                (nível geral de "afm")  os resultados de uma edição da reciclagem
//  GET  exame?exameId=                  (nível geral de "afm")  os resultados de um exame
//  POST edicao                          (nível geral de "afm")  body:{data, cargaHoraria, frequenciaMinimaPct, observacao?} — a edição do ano (uma por ano; de novo = corrige)
//  POST resultados-reciclagem           (nível geral de "afm")  body:{edicaoId, itens:[{membroId, resultado, horasPresentes}]}
//  POST exame                           (nível geral de "afm")  body:{tipo: BIENAL|REPESCAGEM, data, exameOrigemId?, observacao?}
//  POST resultados-exame                (nível geral de "afm")  body:{exameId, itens:[{membroId, resultado, justificativa?}]}
//  GET  pessoa?membroId=                ("pessoas" no território, ou o nível geral de "afm")  o histórico de formação de uma pessoa (o perfil)
//  GET  minha                           (a própria pessoa)       o meu histórico de formação e a minha situação
// Ninguém registra o próprio resultado. Sem sessão: 401.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { exigirGeral, ehGeral, pessoaAlcancavel } = require("../shared/escopoRotas");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const regra = require("../shared/educacaoContinuada");
const db = require("../shared/educacaoContinuadaDb");

const LIMITE_ITENS = 500;
function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, "Não encontrado.");
  const status = resultado.sucesso ? statusOk : resultado.mudou ? 409 : 422;
  const { naoExiste, mudou, ...corpo } = resultado;
  context.res = { status, body: corpo };
}

module.exports = async function (context, req) {
  if (!auth.exigirLogin(req, context)) return;   // a sessão antes de tudo: nem a ação desconhecida responde a quem não entrou
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const query = req.query || {};

  if (acao === "minha" && metodo === "GET") {
    const usuario = auth.exigirLogin(req, context);
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { sucesso: true, ...(await db.historicoDe(await getPool(), usuario.membroId, { comJustificativa: true })) } };
    return;
  }
  if (acao === "pessoa" && metodo === "GET") {
    const usuario = auth.exigirAlgumaPermissao(req, context, ["pessoas", "afm"]);
    if (!usuario) return;
    const pool = await getPool();
    // a AFM do nível geral vê qualquer obreiro; a liderança com "pessoas" vê quem está no seu território
    const visaoAfm = auth.visaoDaPermissao(usuario, "afm");
    const geralAfm = !!visaoAfm && ehGeral(visaoAfm);
    const visaoPessoas = auth.visaoDaPermissao(usuario, "pessoas");
    const p = geralAfm ? await require("../shared/escopoRotas").carregarPessoa(pool, query.membroId) : visaoPessoas ? await pessoaAlcancavel(pool, visaoPessoas, query.membroId) : null;
    if (!p) return erro(context, 404, "Matrícula não encontrada.");
    context.res = { status: 200, body: { sucesso: true, ...(await db.historicoDe(pool, p.membroId)) } };
    return;
  }

  const atos = ["painel", "edicao", "exame", "resultados-reciclagem", "resultados-exame"];
  if (!atos.includes(acao)) return erro(context, 404, "Ação inválida.");
  const usuario = exigirGeral(req, context, "afm");
  if (!usuario) return;
  const pool = await getPool();
  const hojeIso = hojeBrasilia();

  if (metodo === "GET") {
    if (acao === "painel") { context.res = { status: 200, body: { sucesso: true, ...(await db.painel(pool, { hojeIso })) } }; return; }
    if (acao === "edicao") {
      const id = auth.idDeRota(query.edicaoId);
      if (!id) return erro(context, 404, "Edição não encontrada.");
      const itens = await db.resultadosDaEdicao(pool, id);
      if (!itens) return erro(context, 404, "Edição não encontrada.");
      context.res = { status: 200, body: { sucesso: true, itens } };
      return;
    }
    if (acao === "exame") {
      const id = auth.idDeRota(query.exameId);
      if (!id) return erro(context, 404, "Exame não encontrado.");
      const itens = await db.resultadosDoExame(pool, id);
      if (!itens) return erro(context, 404, "Exame não encontrado.");
      context.res = { status: 200, body: { sucesso: true, itens } };
      return;
    }
    return erro(context, 404, "Ação inválida.");
  }
  if (metodo !== "POST") return erro(context, 404, "Ação inválida.");
  if (acao === "edicao") {
    const v = regra.validarEdicao(corpo, hojeIso);
    if (!v.valido) return erro(context, 400, v.mensagem);
    return resposta(context, await db.salvarEdicao(pool, { edicao: v.edicao, por: usuario.membroId }));
  }
  if (acao === "exame") {
    const v = regra.validarExame(corpo, hojeIso);
    if (!v.valido) return erro(context, 400, v.mensagem);
    return resposta(context, await db.salvarExame(pool, { exame: v.exame, por: usuario.membroId }), 201);
  }
  const itens = Array.isArray(corpo.itens) ? corpo.itens : null;
  if (!itens || !itens.length || itens.length > LIMITE_ITENS) return erro(context, 400, `Envie de 1 a ${LIMITE_ITENS} resultados.`);
  if (acao === "resultados-reciclagem") {
    const id = auth.idDeRota(corpo.edicaoId);
    if (!id) return erro(context, 404, "Edição não encontrada.");
    return resposta(context, await db.registrarResultadosReciclagem(pool, { edicaoId: id, itens, por: usuario.membroId }));
  }
  const id = auth.idDeRota(corpo.exameId);
  if (!id) return erro(context, 404, "Exame não encontrado.");
  return resposta(context, await db.registrarResultadosExame(pool, { exameId: id, itens, por: usuario.membroId }));
};
