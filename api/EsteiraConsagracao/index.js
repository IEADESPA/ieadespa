// EsteiraConsagracao (v8.3 — Consagração e documentação; Regimento Art. 7º, III; 9º; 73; 74 e 75, I)
// As etapas da esteira que têm dono próprio (a regra está em shared/consagracao.js; o banco, em shared/consagracaoDb.js):
//  GET  cei                       (nível geral de "cei")  a fila do CEI: os processos que esperam parecer, com o que o formulário precisa saber
//  GET  parecer?consagracaoId=    (nível geral de "cei")  o parecer inteiro, com a fundamentação (sigilosa: só o CEI lê)
//  POST parecer                   (nível geral de "cei")  body:{consagracaoId, resultado, sabatinaEm, fundamentacao, sabatina?, escrutinio?, excecaoPastorNaoCasado?}
//  GET  reunioes-cli              (nível geral de "consagracoes")  as reuniões da CLI já encerradas (homologação de Presbítero, Evangelista e Pastor)
//  POST homologar                 (nível geral de "consagracoes")  body:{ids:[...], sessaoId?, ato?, data?}
//  POST taxa                      (nível geral de "consagracoes" ou "financeiro")  body:{consagracaoId, pagoEm, valor, forma} ou {consagracaoId, remover:true}
//  GET  taxas                     (nível geral de "consagracoes" ou "financeiro")  Trava 8-A: a lista da tesouraria (os aprovados pelo CEI, com a taxa e a cerimônia)
//  POST convencao                 (nível geral de "consagracoes")  Trava 8-A: body:{consagracaoId, data, ato} — a homologação da CIADSETA (Evangelista e Pastor, Art. 72, V, a)
//  POST converter-nomeacao        (nível geral de "consagracoes")  Trava 8-A: body:{consagracaoId, ato} — a indicação antiga a Evangelista/Pastor vira nomeação do Presidente
// Ninguém age no próprio processo. Fora do nível geral: 403. Processo inexistente ou id malformado: 404.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { exigirGeral } = require("../shared/escopoRotas");
const regra = require("../shared/consagracao");
const db = require("../shared/consagracaoDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, "Processo não encontrado.");
  const status = resultado.sucesso ? statusOk : resultado.mudou ? 409 : 422;
  const { naoExiste, mudou, ...corpo } = resultado;
  context.res = { status, body: corpo };
}

module.exports = async function (context, req) {
  if (!auth.exigirLogin(req, context)) return;   // a sessão antes de tudo: nem a ação desconhecida responde a quem não entrou
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const sessaoInteira = () => auth.exigirLoginIgnorandoTermos(req, {});

  if (acao === "cei" && metodo === "GET") {
    const usuario = exigirGeral(req, context, "cei");
    if (!usuario) return;
    context.res = { status: 200, body: { sucesso: true, itens: await db.filaDoCEI(await getPool(), usuario.membroId) } };
    return;
  }
  if (acao === "parecer" && metodo === "GET") {
    const usuario = exigirGeral(req, context, "cei");
    if (!usuario) return;
    const id = (req.query || {}).consagracaoId;
    if (!db.ehGuid(id)) return erro(context, 404, "Parecer não encontrado.");
    const parecer = await db.lerParecer(await getPool(), id, usuario.membroId);
    if (!parecer) return erro(context, 404, "Parecer não encontrado.");
    context.res = { status: 200, body: { sucesso: true, parecer } };
    return;
  }
  if (acao === "parecer" && metodo === "POST") {
    const usuario = exigirGeral(req, context, "cei");
    if (!usuario) return;
    if (!db.ehGuid(corpo.consagracaoId)) return erro(context, 404, "Processo não encontrado.");
    return resposta(context, await db.registrarParecer(await getPool(), { consagracaoId: corpo.consagracaoId, corpo, usuario, sessao: sessaoInteira() || usuario }));
  }
  if (acao === "reunioes-cli" && metodo === "GET") {
    if (!exigirGeral(req, context, "consagracoes")) return;
    context.res = { status: 200, body: { sucesso: true, itens: await db.reunioesCLIEncerradas(await getPool()) } };
    return;
  }
  if (acao === "homologar" && metodo === "POST") {
    const usuario = exigirGeral(req, context, "consagracoes");
    if (!usuario) return;
    const ids = Array.isArray(corpo.ids) ? [...new Set(corpo.ids.map((x) => String(x).toLowerCase()))] : [];
    if (!ids.length || ids.length > 100 || ids.some((x) => !db.ehGuid(x))) return erro(context, 400, "Marque de 1 a 100 processos para homologar.");
    if (corpo.sessaoId != null && corpo.sessaoId !== "" && !auth.idDeRota(corpo.sessaoId)) return erro(context, 400, "Reunião da CLI inválida.");
    return resposta(context, await db.homologar(await getPool(), {
      ids, sessaoId: corpo.sessaoId == null || corpo.sessaoId === "" ? null : auth.idDeRota(corpo.sessaoId), ato: corpo.ato, data: corpo.data, usuario, sessao: sessaoInteira() || usuario
    }));
  }
  if (acao === "taxa" && metodo === "POST") {
    const usuario = exigirGeral(req, context, ["consagracoes", "financeiro"]);
    if (!usuario) return;
    if (!db.ehGuid(corpo.consagracaoId)) return erro(context, 404, "Processo não encontrado.");
    let taxa = null;
    if (corpo.remover !== true) {
      const v = regra.validarTaxa(corpo, hojeBrasilia());
      if (!v.valido) return erro(context, 400, v.mensagem);
      taxa = v.taxa;
    }
    return resposta(context, await db.registrarTaxa(await getPool(), { consagracaoId: corpo.consagracaoId, taxa, usuario }));
  }
  if (acao === "taxas" && metodo === "GET") {
    const usuario = exigirGeral(req, context, ["consagracoes", "financeiro"]);
    if (!usuario) return;
    context.res = { status: 200, body: { sucesso: true, itens: await db.listarTaxas(await getPool(), usuario.membroId) } };
    return;
  }
  if ((acao === "convencao" || acao === "converter-nomeacao") && metodo === "POST") {
    const usuario = exigirGeral(req, context, "consagracoes");
    if (!usuario) return;
    if (!db.ehGuid(corpo.consagracaoId)) return erro(context, 404, "Processo não encontrado.");
    const pool = await getPool();
    if (acao === "convencao") return resposta(context, await db.registrarConvencao(pool, { consagracaoId: corpo.consagracaoId, data: corpo.data, ato: corpo.ato, usuario }));
    return resposta(context, await db.converterEmNomeacao(pool, { consagracaoId: corpo.consagracaoId, ato: corpo.ato, usuario }));
  }
  erro(context, 404, "Ação inválida.");
};
