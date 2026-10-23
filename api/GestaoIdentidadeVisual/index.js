// GestaoIdentidadeVisual (v7.14 — Identidade Visual Anual: Regimento Art. 159 § 1º; Art. 126-Q, II — só o nível Geral define a identidade)
// Decisões do responsável: 22/10/2026 — a Secretaria cadastra os temas já usados; vota todo membro apto e em comunhão pelo Meu Painel; pedidos de uniforme FORA (aba Camisetas
// do site). 23/10/2026 — o ciclo é aberto pela Diretoria; o processo de 2026 (identidade 2027) é feito fora do sistema.
//
// Toda a regra está em shared/identidadeVisual.js (pura, testada); o banco, em shared/identidadeVisualDb.js. A votação é uma Enquete (GestaoEnquetes: o membro vota em
// POST /api/enquetes/{id}/votar, pela tela de Meu Painel).
//
// ---- De qualquer pessoa logada (inclusive PIN) ---------------------------------------------------------------------------------------------------
//  GET  catalogos            -> { papeis:{gestao}, fases, criterios, ocasioes, limites }
//  GET  meu                  -> a etapa do ciclo (com as datas), as minhas sugestões, a votação, as cores, as minhas artes, o resultado, a identidade vigente
//  GET  imagem?arteId=       -> { url } assinada por 1 hora (a minha arte; a escolhida de um ciclo encerrado; a Diretoria vê todas)
//  POST sugerir              body:{texto}                   POST retirar-sugestao body:{sugestaoId}
//  POST arte                 body:{imagemBase64, tipo, titulo?, descricao?}     POST retirar-arte body:{arteId}
// ---- Diretoria (permissão identidade_visual, nível Geral, sessão de liderança) ------------------------------------------------------------------
//  GET  painel   GET ciclo?cicloId=   GET temas
//  POST abrir-ciclo body:{anoAlvo}     POST cancelar-ciclo body:{cicloId}
//  POST tema body:{temaUsadoId?, ano, tema}     POST excluir-tema body:{temaUsadoId}
//  POST triar body:{sugestaoId, decisao: FINALISTA|DESCARTADA|ENVIADA, textoAjustado?, criterio?, observacao?}   (aprovar finalista: confirmação reforçada)
//  POST abrir-votacao body:{cicloId}   (confirmação reforçada; no dia 22 ela também abre sozinha)
//  POST desempate body:{sugestaoId, motivo}   (confirmação reforçada)
//  POST cor body:{cicloId, ordem, nome, hex}     POST excluir-cor body:{corId}     POST recusar-arte body:{arteId, motivo}
//  POST resultado body:{cicloId, arteId, corId, dataCulto, ocasiao, votosVencedor, presentes?, ata?}   (confirmação reforçada)
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 · 400 dado ruim · 403 sem permissão · 404 não achou (o que não existe e o que a pessoa não pode
// ver recebem a MESMA resposta) · 409 mudou enquanto isso · 428 confirmação reforçada · 429 ocupado.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const vol = require("../shared/voluntariado");
const iv = require("../shared/identidadeVisual");
const db = require("../shared/identidadeVisualDb");
const { criarLimitador } = require("../shared/limiteTaxa");

const SEM_PERMISSAO = "Isto é da Diretoria (nível Geral) que conduz a escolha da identidade visual. Fale com quem administra as Permissões.";
const NAO_ACHOU = "Não encontrado.";
const idDe = vol.inteiroPositivo;
// por pessoa: sugestão e arte não viram enxurrada (cada imagem tem até 5 MB)
const limiteSugestoes = criarLimitador({ janelaMs: 10 * 60000, maximo: 20 });
const limiteArtes = criarLimitador({ janelaMs: 60 * 60000, maximo: 10 });

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, NAO_ACHOU);
  const status = resultado.sucesso ? statusOk : resultado.proibido ? 403 : resultado.mudou ? 409 : resultado.limite ? 429 : 422;
  const { naoExiste, proibido, ...corpo } = resultado;
  context.res = { status, body: corpo };
}

// Nada daqui fica em cache: a situação da pessoa, as artes com o nome do autor, os endereços assinados das imagens.
module.exports = async function (context, req) {
  await principal(context, req);
  if (context.res) context.res.headers = { "Cache-Control": "no-store", ...(context.res.headers || {}) };
};

async function principal(context, req) {
  const sessao = auth.exigirLogin(req, context);
  if (!sessao) return;
  const lideranca = auth.ehSessaoDeLideranca(sessao);
  const visao = lideranca ? auth.visaoDaPermissao(sessao, db.PERMISSAO) : null;
  // Art. 126-Q, II: só o nível Geral define a identidade — a permissão num papel de outro nível não abre nada
  const gestao = !!visao && auth.temPermissao(visao, db.PERMISSAO) && esc.ehGeral(visao);
  const ver = { membroId: sessao.membroId, gestao };

  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};

  for (const campo of ["cicloId", "sugestaoId", "arteId", "corId", "temaUsadoId"]) {
    for (const origem of [corpo, consulta]) {
      if (campo in origem && origem[campo] != null && origem[campo] !== "" && !idDe(origem[campo])) return erro(context, 400, `${campo} inválido.`);
    }
  }
  const LEITURAS = ["catalogos", "meu", "imagem", "painel", "ciclo", "temas"];
  const ESCRITAS = ["sugerir", "retirar-sugestao", "arte", "retirar-arte", "abrir-ciclo", "cancelar-ciclo", "tema", "excluir-tema", "triar", "abrir-votacao", "desempate", "cor",
    "excluir-cor", "recusar-arte", "resultado"];
  const EXIGE_GESTAO = ["painel", "ciclo", "temas", "abrir-ciclo", "cancelar-ciclo", "tema", "excluir-tema", "triar", "abrir-votacao", "desempate", "cor", "excluir-cor",
    "recusar-arte", "resultado"];

  try {
    if (metodo !== "GET" && metodo !== "POST") return erro(context, 405, "Método não permitido.");
    if (metodo === "GET" && !LEITURAS.includes(acao)) return erro(context, 404, "Ação inválida.");
    if (metodo === "POST" && !ESCRITAS.includes(acao)) return erro(context, 404, "Ação inválida.");
    if (EXIGE_GESTAO.includes(acao) && !gestao) return erro(context, 403, SEM_PERMISSAO);
    // aprovar o finalista que vai à votação de toda a Igreja, abrir a votação, decidir o empate e registrar a identidade oficial: confirmação reforçada (chave do aparelho ou código)
    const pedeFator = metodo === "POST" && (["abrir-votacao", "desempate", "resultado"].includes(acao) || (acao === "triar" && corpo.decisao === "FINALISTA"));
    if (pedeFator && !auth.exigirFatorRecente(req, context)) return;
    const limitador = metodo === "POST" && acao === "sugerir" ? limiteSugestoes : metodo === "POST" && acao === "arte" ? limiteArtes : null;
    if (limitador && !limitador.registrar(`m${sessao.membroId}`).permitido) return erro(context, 429, "Muitos envios seguidos. Espere alguns minutos e tente de novo.");
    const pool = await getPool();

    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = { status: 200, body: { sucesso: true, papeis: { gestao },
          fases: Object.entries(iv.FASES).map(([codigo, f]) => ({ codigo, rotulo: f.rotulo })), criterios: Object.values(iv.CRITERIOS),
          ocasioes: Object.entries(iv.OCASIOES).map(([codigo, rotulo]) => ({ codigo, rotulo })),
          limites: { sugestoes: iv.MAX_SUGESTOES, texto: iv.MAX_TEXTO, artes: iv.MAX_ARTES, imagemBytes: iv.MAX_IMAGEM_BYTES, cores: iv.MAX_CORES, finalistas: iv.MAX_FINALISTAS } } };
        return;
      }
      if (acao === "meu") { context.res = { status: 200, body: await db.painelMembro(pool, { membroId: sessao.membroId }) }; return; }
      if (acao === "imagem") {
        const arteId = idDe(consulta.arteId);
        if (!arteId) return erro(context, 400, "Informe arteId.");
        resposta(context, await db.imagemDaArte(pool, { membroId: sessao.membroId, gestao, arteId }));
        return;
      }
      if (acao === "painel") { context.res = { status: 200, body: await db.painelGestao(pool) }; return; }
      if (acao === "temas") { context.res = { status: 200, body: { sucesso: true, temas: await db.listarTemas(pool) } }; return; }
      if (acao === "ciclo") {
        const cicloId = idDe(consulta.cicloId);
        if (!cicloId) return erro(context, 400, "Informe cicloId.");
        resposta(context, await db.detalheCiclo(pool, { cicloId }));
        return;
      }
    }

    const exigir = (campo) => { const v = idDe(corpo[campo]); if (!v) erro(context, 400, `Informe ${campo}.`); return v; };
    if (acao === "sugerir") { resposta(context, await db.sugerir(pool, { membroId: sessao.membroId, texto: corpo.texto }), 201); return; }
    if (acao === "retirar-sugestao") { const id = exigir("sugestaoId"); if (!id) return; resposta(context, await db.retirarSugestao(pool, { membroId: sessao.membroId, sugestaoId: id })); return; }
    if (acao === "arte") { resposta(context, await db.enviarArte(pool, { membroId: sessao.membroId, dados: corpo }), 201); return; }
    if (acao === "retirar-arte") { const id = exigir("arteId"); if (!id) return; resposta(context, await db.retirarArte(pool, { membroId: sessao.membroId, arteId: id })); return; }
    if (acao === "abrir-ciclo") { resposta(context, await db.abrirCiclo(pool, { ver, anoAlvo: corpo.anoAlvo }), 201); return; }
    if (acao === "cancelar-ciclo") { const id = exigir("cicloId"); if (!id) return; resposta(context, await db.cancelarCiclo(pool, { ver, cicloId: id })); return; }
    if (acao === "tema") { resposta(context, await db.salvarTema(pool, { ver, dados: corpo }), corpo.temaUsadoId ? 200 : 201); return; }
    if (acao === "excluir-tema") { const id = exigir("temaUsadoId"); if (!id) return; resposta(context, await db.excluirTema(pool, { ver, temaUsadoId: id })); return; }
    if (acao === "triar") { const id = exigir("sugestaoId"); if (!id) return; resposta(context, await db.triar(pool, { ver, dados: { ...corpo, sugestaoId: id } })); return; }
    if (acao === "abrir-votacao") { const id = exigir("cicloId"); if (!id) return; resposta(context, await db.criarVotacao(pool, { cicloId: id, porMembroId: sessao.membroId }), 201); return; }
    if (acao === "desempate") { const id = exigir("sugestaoId"); if (!id) return; resposta(context, await db.desempatar(pool, { ver, dados: { ...corpo, sugestaoId: id } })); return; }
    if (acao === "cor") { const id = exigir("cicloId"); if (!id) return; resposta(context, await db.salvarCor(pool, { ver, cicloId: id, dados: corpo })); return; }
    if (acao === "excluir-cor") { const id = exigir("corId"); if (!id) return; resposta(context, await db.excluirCor(pool, { ver, corId: id })); return; }
    if (acao === "recusar-arte") { const id = exigir("arteId"); if (!id) return; resposta(context, await db.recusarArte(pool, { ver, arteId: id, motivo: corpo.motivo })); return; }
    if (acao === "resultado") {
      const cicloId = exigir("cicloId"); if (!cicloId) return;
      const arteId = exigir("arteId"); if (!arteId) return;
      const corId = exigir("corId"); if (!corId) return;
      resposta(context, await db.registrarResultado(pool, { ver, cicloId, dados: { ...corpo, arteId, corId } }), 201);
      return;
    }
    return erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[IDENTIDADE] erro:", e && e.message);
    return erro(context, 500, "Erro interno.");
  }
}
