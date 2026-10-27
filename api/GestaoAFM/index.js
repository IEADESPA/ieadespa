// GestaoAFM (v8.1 — Academia de Formação Ministerial e faltas da CLI)
// Estatuto Art. 15 §1º e Art. 27; Regimento Art. 22, 66 a 69, 72, 149 e 310. Regra pura em shared/afm.js; banco em shared/afmDb.js; desenho em
// docs/plano/fase-8-ministerial-afm.md. A exclusão da CLI e a desmatrícula por faltas NÃO têm rota: só o sistema as apura, a partir das presenças (ao encerrar a reunião, ao
// justificar ou corrigir uma presença, e na rotina diária).
//
// ---- De qualquer pessoa logada (inclusive PIN) ----------------------------------------------------------------------------------------------------
//  GET  catalogos        -> { motivosAceitos[], motivosVedados[], tiposSessaoCLI[], niveis[], limite }
//  GET  minha-situacao   -> { limite, cli:{naCLI,faltasSeguidas,excluidaEm}, afm:{status,nivel,...}|null }
// ---- Academia (permissão "afm"; ler respeita o território, os atos são do nível geral) ----------------------------------------------------------
//  GET  matriculas       -> { itens[] }              GET corpo-docente -> { reitoria:{situacao,reitor}, ativos[], encerrados[] }      GET sessoes-magnas -> { itens[] }
//  POST nivel            body:{membroId,nivel,concluido}
//  POST reprovar         body:{membroId,data,detalhe}            POST anular-reprovacao body:{membroId,motivo}
//  POST rematricular     body:{membroId,reciclagemAprovadaEm,observacao?}
//  POST nomear-reitor    body:{membroId,dataInicio,titulacao?,homologadoCLIEm?,homologacaoAto?}
//  POST homologar-reitor body:{data,ato}                 POST reconduzir-reitor body:{ano}
//  POST docente          body:{membroId,titulacao,dataInicio}     POST encerrar-corpo body:{corpoDocenteId,data,motivo}
// ---- CLI (permissões de reuniões; os atos são do nível geral) ----------------------------------------------------------------------------------
//  GET  faltas-cli       -> { limite, emRisco[], exclusoes[], inativosAFM[] }
//  POST comunicar-exclusao body:{exclusaoId,data}        POST readmitir body:{exclusaoId,data,ato}
//
// Respostas: { sucesso:true, ... } · recusa de regra 422 · dado ruim 400 · sem permissão 403 · não achou 404 · mudou enquanto isso 409.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const vol = require("../shared/voluntariado");
const afm = require("../shared/afm");
const db = require("../shared/afmDb");
const { composicaoCLI } = require("../shared/universo");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const PERMISSOES_CLI = ["reunioes", "assembleia", "cli"];
const idDe = vol.inteiroPositivo;

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, "Não encontrado.");
  const status = resultado.sucesso ? statusOk : resultado.mudou ? 409 : 422;
  const { naoExiste, ...corpo } = resultado;
  context.res = { status, body: corpo };
}
const lista = (obj) => Object.entries(obj).map(([codigo, v]) => (typeof v === "object" ? { codigo, ...v } : { codigo, rotulo: v }));

async function composicaoAtual(pool) {
  const orgao = (await pool.request().query(`SELECT OrgaoId FROM Orgaos WHERE Sigla = 'CLI'`)).recordset[0];
  return orgao ? composicaoCLI(pool, orgao.OrgaoId) : [];
}

// Matrícula e faltas são dado da pessoa: nada em cache.
module.exports = async function (context, req) {
  await principal(context, req);
  if (context.res) context.res.headers = { "Cache-Control": "no-store", ...(context.res.headers || {}) };
};

async function principal(context, req) {
  // A porta de sessão vem antes de tudo (até de ação desconhecida): sem sessão, sempre 401.
  if (!auth.exigirLogin(req, context)) return;
  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  for (const campo of ["membroId", "exclusaoId", "corpoDocenteId"]) {
    if (campo in corpo && corpo[campo] != null && corpo[campo] !== "" && !idDe(corpo[campo])) return erro(context, 400, `${campo} inválido.`);
  }
  const hoje = hojeBrasilia();
  const dataDe = (valor, rotulo) => afm.dataDoAto(valor, hoje, rotulo);

  // ---- qualquer pessoa logada ----
  if (metodo === "GET" && acao === "catalogos") {
    if (!auth.exigirLogin(req, context)) return;
    context.res = { status: 200, body: {
      sucesso: true, limite: afm.FALTAS_PARA_PERDA,
      motivosAceitos: lista(afm.MOTIVOS_ACEITOS), motivosVedados: lista(afm.MOTIVOS_VEDADOS), mensagemVedado: afm.MENSAGEM_VEDADO,
      tiposSessaoCLI: lista(afm.TIPOS_SESSAO_CLI), niveis: lista(afm.NIVEIS)
    } };
    return;
  }
  if (metodo === "GET" && acao === "minha-situacao") {
    const sessao = auth.exigirLogin(req, context);
    if (!sessao) return;
    const pool = await getPool();
    const s = await db.minhaSituacao(pool, sessao.membroId, { composicaoCLI: await composicaoAtual(pool) });
    if (!s) return erro(context, 404, "Não encontrado.");
    context.res = { status: 200, body: { sucesso: true, ...s } };
    return;
  }

  // ---- CLI: faltas e cadeiras ----
  if (acao === "faltas-cli" && metodo === "GET") {
    if (!auth.exigirAlgumaPermissao(req, context, PERMISSOES_CLI)) return;
    const pool = await getPool();
    context.res = { status: 200, body: { sucesso: true, ...(await db.painelFaltasCLI(pool, await composicaoAtual(pool))) } };
    return;
  }
  if (metodo === "POST" && (acao === "comunicar-exclusao" || acao === "readmitir")) {
    const usuario = esc.exigirGeral(req, context, PERMISSOES_CLI);
    if (!usuario) return;
    if (!idDe(corpo.exclusaoId)) return erro(context, 400, "Informe a exclusão.");
    const d = dataDe(corpo.data, acao === "readmitir" ? "a data da readmissão" : "a data da comunicação à CLI");
    if (!d.valido) return erro(context, 400, d.mensagem);
    const pool = await getPool();
    if (acao === "comunicar-exclusao") return resposta(context, await db.comunicarExclusao(pool, { exclusaoId: Number(corpo.exclusaoId), data: d.data, por: usuario.membroId }));
    const ato = afm.textoObrigatorio(corpo.ato, { minimo: 5, maximo: 300, rotulo: "O ato da readmissão (ata ou deliberação)" });
    if (!ato.valido) return erro(context, 400, ato.mensagem);
    return resposta(context, await db.readmitir(pool, { exclusaoId: Number(corpo.exclusaoId), data: d.data, ato: ato.texto, por: usuario.membroId }));
  }

  // ---- Academia: leitura ----
  if (metodo === "GET" && ["matriculas", "corpo-docente", "sessoes-magnas"].includes(acao)) {
    const usuario = auth.exigirPermissao(req, context, db.PERMISSAO);
    if (!usuario) return;
    const visao = auth.visaoDaPermissao(usuario, db.PERMISSAO);
    const pool = await getPool();
    if (acao === "matriculas") {
      const itens = (await db.listarMatriculas(pool)).filter((m) => auth.estaNoEscopo(visao, m.congregacao));
      context.res = { status: 200, body: { sucesso: true, geral: esc.ehGeral(visao), itens } };
      return;
    }
    if (acao === "corpo-docente") {
      const reitoria = await db.reitorAtual(() => pool.request(), hoje);
      const todos = await db.corpoDocente(pool, { incluirEncerrados: true });
      context.res = { status: 200, body: { sucesso: true, geral: esc.ehGeral(visao), reitoria, ativos: todos.filter((d) => !d.dataFim), encerrados: todos.filter((d) => d.dataFim) } };
      return;
    }
    context.res = { status: 200, body: { sucesso: true, itens: await db.sessoesMagnas(pool) } };
    return;
  }

  // ---- Academia: atos (nível geral) ----
  const ATOS = ["nivel", "reprovar", "anular-reprovacao", "rematricular", "nomear-reitor", "homologar-reitor", "reconduzir-reitor", "docente", "encerrar-corpo"];
  if (metodo === "POST" && ATOS.includes(acao)) {
    const usuario = esc.exigirGeral(req, context, db.PERMISSAO);
    if (!usuario) return;
    const por = usuario.membroId;
    const pool = await getPool();
    const membroId = idDe(corpo.membroId) ? Number(corpo.membroId) : null;

    if (acao === "nivel") {
      if (!membroId) return erro(context, 400, "Informe a matrícula.");
      return resposta(context, await db.definirNivel(pool, { membroId, nivel: corpo.nivel, concluido: corpo.concluido, por }));
    }
    if (acao === "reprovar") {
      if (!membroId) return erro(context, 400, "Informe a matrícula.");
      const d = dataDe(corpo.data, "a data da reprovação");
      if (!d.valido) return erro(context, 400, d.mensagem);
      const det = afm.textoObrigatorio(corpo.detalhe, { minimo: 10, maximo: 500, rotulo: "A avaliação em que reprovou" });
      if (!det.valido) return erro(context, 400, det.mensagem);
      return resposta(context, await db.registrarReprovacao(pool, { membroId, data: d.data, detalhe: det.texto, por }));
    }
    if (acao === "anular-reprovacao") {
      if (!membroId) return erro(context, 400, "Informe a matrícula.");
      const m = afm.textoObrigatorio(corpo.motivo, { minimo: 10, maximo: 300, rotulo: "O motivo da anulação" });
      if (!m.valido) return erro(context, 400, m.mensagem);
      return resposta(context, await db.anularReprovacao(pool, { membroId, motivo: m.texto, por }));
    }
    if (acao === "rematricular") {
      if (!membroId) return erro(context, 400, "Informe a matrícula.");
      return resposta(context, await db.rematricular(pool, { membroId, reciclagemAprovadaEm: corpo.reciclagemAprovadaEm, observacao: corpo.observacao, por }), 201);
    }
    if (acao === "nomear-reitor") {
      if (!membroId) return erro(context, 400, "Informe a matrícula.");
      const ini = dataDe(corpo.dataInicio, "a data da nomeação");
      if (!ini.valido) return erro(context, 400, ini.mensagem);
      let hom = null;
      let ato = null;
      if (corpo.homologadoCLIEm != null && corpo.homologadoCLIEm !== "") {
        const h = dataDe(corpo.homologadoCLIEm, "a data da homologação da CLI");
        if (!h.valido) return erro(context, 400, h.mensagem);
        const a = afm.textoObrigatorio(corpo.homologacaoAto, { minimo: 5, maximo: 300, rotulo: "O ato da homologação (ata da CLI)" });
        if (!a.valido) return erro(context, 400, a.mensagem);
        hom = h.data;
        ato = a.texto;
      }
      let titulacao = null;
      if (corpo.titulacao != null && corpo.titulacao !== "") {
        const t = afm.textoObrigatorio(corpo.titulacao, { minimo: 3, maximo: 150, rotulo: "A titulação" });
        if (!t.valido) return erro(context, 400, t.mensagem);
        titulacao = t.texto;
      }
      return resposta(context, await db.nomearReitor(pool, { membroId, dataInicio: ini.data, titulacao, homologadoCLIEm: hom, homologacaoAto: ato, por }), 201);
    }
    if (acao === "homologar-reitor") {
      const h = dataDe(corpo.data, "a data da homologação da CLI");
      if (!h.valido) return erro(context, 400, h.mensagem);
      const a = afm.textoObrigatorio(corpo.ato, { minimo: 5, maximo: 300, rotulo: "O ato da homologação (ata da CLI)" });
      if (!a.valido) return erro(context, 400, a.mensagem);
      return resposta(context, await db.homologarReitor(pool, { data: h.data, ato: a.texto, por }));
    }
    if (acao === "reconduzir-reitor") {
      const ano = typeof corpo.ano === "number" ? corpo.ano : /^\d{4}$/.test(String(corpo.ano || "")) ? Number(corpo.ano) : NaN;
      return resposta(context, await db.reconduzirReitor(pool, { ano, por }));
    }
    if (acao === "docente") {
      if (!membroId) return erro(context, 400, "Informe a matrícula.");
      const t = afm.textoObrigatorio(corpo.titulacao, { minimo: 3, maximo: 150, rotulo: "A titulação" });
      if (!t.valido) return erro(context, 400, t.mensagem);
      const ini = dataDe(corpo.dataInicio, "a data de entrada");
      if (!ini.valido) return erro(context, 400, ini.mensagem);
      return resposta(context, await db.cadastrarDocente(pool, { membroId, titulacao: t.texto, dataInicio: ini.data, por }), 201);
    }
    // encerrar-corpo
    if (!idDe(corpo.corpoDocenteId)) return erro(context, 400, "Informe quem sai.");
    const d = dataDe(corpo.data, "a data de saída");
    if (!d.valido) return erro(context, 400, d.mensagem);
    const m = afm.textoObrigatorio(corpo.motivo, { minimo: 5, maximo: 200, rotulo: "O motivo" });
    if (!m.valido) return erro(context, 400, m.mensagem);
    return resposta(context, await db.encerrarCorpoDocente(pool, { corpoDocenteId: Number(corpo.corpoDocenteId), data: d.data, motivo: m.texto, por }));
  }

  return erro(context, 400, "Ação desconhecida.");
}
