// FichasRepetidas (FASE 10, v10.1b passo 6, 18/11/2026) — JUNTAR FICHAS REPETIDAS e as PENDÊNCIAS DE CADASTRO (migração 179). Exige a permissão "pessoas".
// GET  /api/fichas-repetidas                     -> as duplas possivelmente repetidas no escopo (mesmo nome e nascimento, ou marcadas), as duas no escopo
// GET  /api/fichas-repetidas/comparar?a=&b=      -> só o que é diferente, quem fica (a mais antiga), o que impede, a prévia do que muda e a "versão"
// POST /api/fichas-repetidas/juntar              -> { a, b, escolhas: { campo: "FICA" | "SAI" }, versao } — junta numa transação (409 se as fichas mudaram)
// POST /api/fichas-repetidas/nao-sao-a-mesma     -> { a, b, nota? } — tira a dupla da lista (e resolve a marcação, se houver)
// POST /api/fichas-repetidas/marcar              -> { a, b, nota? } — marca como possível repetida (bloqueia a carteirinha física das duas)
// GET  /api/fichas-repetidas/juncoes             -> as junções feitas no escopo (para conferir; a Geral desfaz em até 30 dias)
// POST /api/fichas-repetidas/desfazer            -> { juncaoId, motivo } — só a Secretaria Geral
// GET  /api/fichas-repetidas/pendencias?membroId= -> as pendências de cadastro abertas da ficha (repetida, número, arrolamento)
// POST /api/fichas-repetidas/conferir-numero     -> { pendenciaId, nota } — o número da ficha foi conferido
// GET  /api/fichas-repetidas/alerta              -> (Secretaria Geral) quantos cadastros a acertar antes da assembleia geral, sem nome de ninguém
// ESCOPO: a regra do CPF repetido — as duas fichas no escopo de quem junta (a congregação, a área); fora disso, só a Secretaria Geral. Fora do escopo e
// inexistente respondem igual ("não encontrada"). O CPF nunca sai inteiro e o motivo de uma saída disciplinar só para quem tem "disciplina" (shared/juntarFichas.js).
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { pessoaAlcancavel, ehGeral } = require("../shared/escopoRotas");
const db = require("../shared/juntarFichasDb");
const { criarLimitador } = require("../shared/limiteTaxa");
const nivelDoCargo = require("../shared/nivelDoCargo");

// juntar e desfazer mexem em muitas tabelas: no máximo 10 por minuto por pessoa (por instância)
const limitador = criarLimitador({ janelaMs: 60000, maximo: 10 });
const semCache = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const corpoDe = (req) => (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {});
// Juntar ou desfazer mexe no acesso da pessoa (a ficha que sai perde as sessões, os cargos mudam de matrícula e o e-mail escolhido pode trocar): com cargo de
// liderança vigente, só a secretaria do nível do cargo (ou de cima), com a confirmação recente (428). A regra do acesso parte 3 (25 e 26/11/2026).
const MSG_NIVEL_JUNTAR = "Esta pessoa tem cargo de liderança de nível acima do seu: só a secretaria do nível do cargo (ou de cima) junta as fichas dela.";

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  const q = req.query || {};
  const pool = await getPool();
  const responder = (r) => { const { status, ...corpo } = r; context.res = { status: status || 200, headers: semCache, body: corpo }; };

  if (metodo === "GET" && acao === "") {
    const itens = await db.listarCandidatos(pool, usuario, { limite: 200 });
    responder({ sucesso: true, itens, total: itens.length });
    return;
  }
  if (metodo === "GET" && acao === "comparar") {
    responder(await db.comparar(pool, usuario, q.a, q.b));
    return;
  }
  if (metodo === "GET" && acao === "juncoes") {
    responder({ sucesso: true, itens: await db.listarJuncoes(pool, usuario, { limite: 50 }), diasParaDesfazer: db.DIAS_DESFAZER });
    return;
  }
  if (metodo === "GET" && acao === "pendencias") {
    const alvo = await pessoaAlcancavel(pool, usuario, q.membroId);
    if (!alvo) { responder({ sucesso: false, status: 200, mensagem: "Matrícula não encontrada." }); return; }
    responder({ sucesso: true, membroId: alvo.membroId, pendencias: await db.pendenciasDaFicha(pool, usuario, alvo.membroId),
      impressaoFisicaBloqueada: await db.bloqueiaImpressaoFisica(() => pool.request(), alvo.membroId) });
    return;
  }
  if (metodo === "GET" && acao === "alerta") {
    if (!ehGeral(usuario)) { responder({ sucesso: false, status: 403, mensagem: "Só a Secretaria Geral vê o alerta do campo inteiro." }); return; }
    const contagem = await db.contarPendenciasGerais(() => pool.request());
    responder({ sucesso: true, contagem, ...db.textoDoAlerta(contagem) });
    return;
  }
  if (metodo === "POST" && ["juntar", "desfazer"].includes(acao)) {
    const lim = limitador.registrar(`p${usuario.membroId}`);
    if (!lim.permitido) {
      context.res = { status: 429, headers: { ...semCache, "Retry-After": String(lim.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas junções seguidas. Aguarde um minuto." } };
      return;
    }
    const corpo = corpoDe(req);
    // a conferência vem DEPOIS do escopo: fora do escopo e inexistente seguem para a camada, que responde "não encontrada" como antes
    let fichas = [];
    if (acao === "juntar") {
      const pa = await pessoaAlcancavel(pool, usuario, corpo.a), pb = await pessoaAlcancavel(pool, usuario, corpo.b);
      if (pa && pb && pa.membroId !== pb.membroId) fichas = [pa.membroId, pb.membroId];
    } else if (ehGeral(usuario)) {
      const juncaoId = auth.idDeRota(corpo.juncaoId);
      const j = juncaoId ? (await pool.request().input("id", sql.Int, juncaoId).query(`SELECT MatriculaFica, MatriculaSai FROM JuncoesFichas WHERE JuncaoId = @id`)).recordset[0] : null;
      if (j) fichas = [Number(j.MatriculaFica), Number(j.MatriculaSai)];
    }
    for (const membroId of fichas) if (!(await nivelDoCargo.conferirAtoSobreLideranca(pool, sql, req, context, usuario, membroId, MSG_NIVEL_JUNTAR))) return;
    responder(acao === "juntar" ? await db.juntar(pool, usuario, corpo) : await db.desfazer(pool, usuario, corpo));
    return;
  }
  if (metodo === "POST" && acao === "nao-sao-a-mesma") { responder(await db.decidirDupla(pool, usuario, corpoDe(req), "NAO_E_A_MESMA")); return; }
  if (metodo === "POST" && acao === "marcar") { responder(await db.decidirDupla(pool, usuario, corpoDe(req), "MARCAR")); return; }
  if (metodo === "POST" && acao === "conferir-numero") { responder(await db.resolverNumero(pool, usuario, corpoDe(req))); return; }

  context.res = { status: 405, headers: semCache, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
};
