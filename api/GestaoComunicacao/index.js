// GestaoComunicacao (v7.12 — Comunicação: consentimento por canal e categoria, modelos aprovados, envio por grupo, registro de entrega)
// LGPD arts. 7º, I, 8º e 11; Estatuto (a convocação oficial é obrigação de comunicação). Decisões de 22/10/2026: sem WhatsApp e sem SMS; nenhum grupo pelo dízimo.
//
// Toda a regra está em shared/comunicacao.js (pura, testada); o banco, em shared/comunicacaoDb.js. A fila de e-mail e de celular roda em ComunicacaoFila (a cada 15 minutos)
// e na rodada diária das 7h; o link "não quero mais receber" do e-mail, em ComunicacaoSair (sem login).
//
// ---- De qualquer pessoa logada (inclusive PIN) ---------------------------------------------------------------------------------------------------
//  GET  catalogos          -> { categorias[], canais[], papeis:{gestao,geral} }
//  GET  preferencias       -> { categorias[{categoria,rotulo,descricao,obrigatoria,texto?,versao?,hash?,canais{EMAIL,PUSH}}], canais[], temEmail, aparelhos }
//  POST preferencias       body:{ mudancas:[{canal,categoria,concedido,hash}] }   (o "sim" só com a impressão digital do texto mostrado)
//  GET  meus-comunicados   -> { comunicados[] }        POST ciencia body:{envioId}   ("Recebi a convocação")
// ---- Liderança (permissão comunicacao, sessão de liderança; cada um no seu território) ------------------------------------------------------------
//  GET  modelos     POST modelo body:{chave?,categoria,titulo,corpo} (nível geral)     POST aprovar-modelo body:{modeloId} (nível geral; confirmação reforçada)
//  POST arquivar-modelo body:{modeloId} (nível geral; o rascunho é apagado)
//  GET  opcoes      POST previa body:{categoria,criterios}     GET grupos     POST grupo body:{nome,criterios}     POST excluir-grupo body:{audienciaId}
//  POST enviar body:{modeloId,criterios} (confirmação reforçada)     GET envios     GET envio?envioId=     POST cancelar body:{envioId}
//  POST ficha body:{membroId,canal,categoria,concedido,dataFicha}   (o consentimento que a pessoa deu numa ficha em papel)
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 · 400 dado ruim · 403 sem permissão · 404 não achou (o que não existe e o que a pessoa não pode
// ver recebem a MESMA resposta) · 409 mudou enquanto isso · 428 confirmação reforçada · 429 ocupado.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const vol = require("../shared/voluntariado");
const cm = require("../shared/comunicacao");
const db = require("../shared/comunicacaoDb");
const { ipDoCliente } = require("../shared/origemConexao");

const SEM_PERMISSAO = "Isto é da liderança que envia comunicados. Fale com quem administra as Permissões.";
const NAO_ACHOU = "Não encontrado.";
const idDe = vol.inteiroPositivo;

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, NAO_ACHOU);
  const status = resultado.sucesso ? statusOk : resultado.proibido ? 403 : resultado.mudou ? 409 : resultado.limite ? 429 : 422;
  const { naoExiste, proibido, ...corpo } = resultado;
  context.res = { status, body: corpo };
}

// Nada daqui fica em cache: consentimento, nomes e telefones de quem não foi alcançado.
module.exports = async function (context, req) {
  await principal(context, req);
  if (context.res) context.res.headers = { "Cache-Control": "no-store", ...(context.res.headers || {}) };
};

async function principal(context, req) {
  const sessao = auth.exigirLogin(req, context);
  if (!sessao) return;
  const lideranca = auth.ehSessaoDeLideranca(sessao);
  // Território: a concessão de uma Extensão e a de Departamento (que alcançariam a congregação-mãe inteira ou todas) não montam grupo.
  const visaoBruta = lideranca ? auth.visaoDaPermissao(sessao, db.PERMISSAO) : null;
  const visao = visaoBruta ? auth.restringirVisao(visaoBruta, (c) => !c.escopoExtensaoNome && c.nivel !== "DEPARTAMENTO") : null;
  const gestao = !!visao && auth.temPermissao(visao, db.PERMISSAO);
  const geral = gestao && esc.ehGeral(visao);
  const ver = { membroId: sessao.membroId, gestao, geral, podeVerCongregacao: (nome) => !!visao && auth.estaNoEscopo(visao, nome) };

  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};

  for (const campo of ["modeloId", "envioId", "audienciaId", "membroId"]) {
    for (const origem of [corpo, consulta]) {
      if (campo in origem && origem[campo] != null && origem[campo] !== "" && !idDe(origem[campo])) return erro(context, 400, `${campo} inválido.`);
    }
  }
  const LEITURAS = ["catalogos", "preferencias", "meus-comunicados", "modelos", "opcoes", "grupos", "envios", "envio"];
  const ESCRITAS = ["preferencias", "ciencia", "modelo", "aprovar-modelo", "arquivar-modelo", "previa", "grupo", "excluir-grupo", "enviar", "cancelar", "ficha"];
  const EXIGE_GESTAO = ["modelos", "opcoes", "grupos", "envios", "envio", "modelo", "aprovar-modelo", "arquivar-modelo", "previa", "grupo", "excluir-grupo", "enviar", "cancelar", "ficha"];

  try {
    if (metodo !== "GET" && metodo !== "POST") return erro(context, 405, "Método não permitido.");
    if (metodo === "GET" && !LEITURAS.includes(acao)) return erro(context, 404, "Ação inválida.");
    if (metodo === "POST" && !ESCRITAS.includes(acao)) return erro(context, 404, "Ação inválida.");
    if (EXIGE_GESTAO.includes(acao) && !gestao) return erro(context, 403, SEM_PERMISSAO);
    // aprovar o texto que fala pela Igreja e mandar a centenas de pessoas são atos sem volta: pedem a confirmação reforçada (chave do aparelho ou código)
    if (metodo === "POST" && (acao === "aprovar-modelo" || acao === "enviar") && !auth.exigirFatorRecente(req, context)) return;
    const pool = await getPool();

    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = { status: 200, body: { sucesso: true,
          categorias: Object.entries(cm.CATEGORIAS).map(([codigo, c]) => ({ codigo, rotulo: c.rotulo, descricao: c.descricao, obrigatoria: !!c.obrigatoria })),
          canais: Object.entries(cm.CANAIS).map(([codigo, rotulo]) => ({ codigo, rotulo })), situacoes: cm.SITUACOES, maxGrupo: db.MAX_GRUPO,
          papeis: { gestao, geral } } };
        return;
      }
      if (acao === "preferencias") { context.res = { status: 200, body: { sucesso: true, ...(await db.minhasPreferencias(pool, sessao.membroId)) } }; return; }
      if (acao === "meus-comunicados") { context.res = { status: 200, body: { sucesso: true, comunicados: await db.meusComunicados(pool, sessao.membroId) } }; return; }
      if (acao === "modelos") { context.res = { status: 200, body: { sucesso: true, modelos: await db.listarModelos(pool, { ver }) } }; return; }
      if (acao === "opcoes") { context.res = { status: 200, body: { sucesso: true, ...(await db.opcoes(pool, { ver })) } }; return; }
      if (acao === "grupos") { context.res = { status: 200, body: { sucesso: true, grupos: await db.listarGrupos(pool, { ver }) } }; return; }
      if (acao === "envios") { context.res = { status: 200, body: { sucesso: true, envios: await db.listarEnvios(pool, { ver }) } }; return; }
      if (acao === "envio") {
        const envioId = idDe(consulta.envioId);
        if (!envioId) return erro(context, 400, "Informe envioId.");
        const r = await db.relatorio(pool, { ver, envioId });
        if (r.naoExiste) return erro(context, 404, NAO_ACHOU);
        context.res = { status: 200, body: { sucesso: true, ...r } };
        return;
      }
    }

    if (acao === "preferencias") { resposta(context, await db.salvarPreferencias(pool, { membroId: sessao.membroId, dados: corpo, ip: ipDoCliente(req.headers || {}) })); return; }
    if (acao === "ciencia") {
      const envioId = idDe(corpo.envioId);
      if (!envioId) return erro(context, 400, "Informe envioId.");
      resposta(context, await db.darCiencia(pool, { membroId: sessao.membroId, envioId }));
      return;
    }
    if (acao === "modelo") { resposta(context, await db.salvarModelo(pool, { ver, dados: corpo }), 201); return; }
    if (acao === "aprovar-modelo" || acao === "arquivar-modelo") {
      const modeloId = idDe(corpo.modeloId);
      if (!modeloId) return erro(context, 400, "Informe modeloId.");
      resposta(context, acao === "aprovar-modelo" ? await db.aprovarModelo(pool, { ver, modeloId }) : await db.arquivarModelo(pool, { ver, modeloId }));
      return;
    }
    if (acao === "previa") { resposta(context, await db.previa(pool, { ver, dados: corpo })); return; }
    if (acao === "grupo") { resposta(context, await db.salvarGrupo(pool, { ver, dados: corpo }), 201); return; }
    if (acao === "excluir-grupo") {
      const audienciaId = idDe(corpo.audienciaId);
      if (!audienciaId) return erro(context, 400, "Informe audienciaId.");
      resposta(context, await db.excluirGrupo(pool, { ver, audienciaId }));
      return;
    }
    if (acao === "enviar") { resposta(context, await db.enviar(pool, { ver, dados: { ...corpo, modeloId: idDe(corpo.modeloId) } }), 201); return; }
    if (acao === "cancelar") {
      const envioId = idDe(corpo.envioId);
      if (!envioId) return erro(context, 400, "Informe envioId.");
      resposta(context, await db.cancelar(pool, { ver, envioId }));
      return;
    }
    if (acao === "ficha") { resposta(context, await db.registrarFicha(pool, { ver, dados: { ...corpo, membroId: idDe(corpo.membroId) } }), 201); return; }
    return erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[COMUNICACAO] erro:", e && e.message);
    return erro(context, 500, "Erro interno.");
  }
}
