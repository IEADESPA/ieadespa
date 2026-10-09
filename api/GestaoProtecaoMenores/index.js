// GestaoProtecaoMenores (v7.8 — Incidentes, notificação obrigatória e escuta protegida)
// ECA Art. 13 e Art. 245 (comunicar a suspeita ao Conselho Tutelar; multa pela omissão); Lei 13.431/2017 (escuta protegida: a Igreja acolhe e encaminha, não inquire);
// Regimento Art. 133 §5º; LGPD arts. 11 e 14.
//
// Toda a regra está em shared/protecaoMenores.js (pura, testada); o banco, em shared/protecaoDb.js. O afastamento cautelar do envolvido vale em todas as escalas, convites,
// trocas e rodízios das equipes com menores porque entra na MESMA aptidão da v7.7 (bloqueio reservado INCIDENTE_EM_APURACAO).
//
// ---- De qualquer pessoa logada (inclusive PIN) ---------------------------------------------------------------------------------------------------
//  GET  catalogos     -> { niveis[], orgaos[], formas[], quemRelatou[], resultados[], decisoes[], contatosDeAjuda[], roteiroEscuta[], naoFaca[], horasPrazo, papeis:{gestao,geral} }
//  GET  meus          -> { incidentes[{protocolo,nivelRotulo,dataOcorrencia,situacao,registradoEm}] }      (só o que a própria pessoa registrou, sem relato nem andamento)
//  POST registrar     body:{nivel,dataOcorrencia,congregacaoId,equipeId?,onde?,descricao,envolvidoMembroId?,envolvidoNome?,relatadoPor?,relato?,conhecidoHaHoras?}
// ---- Gestão (permissão protecao_menores, sessão de liderança; o Dirigente só enxerga a sua congregação) -----------------------------------------------
//  GET  incidentes?status=ABERTO|ENCERRADO   -> { incidentes[] }       GET incidente?incidenteId=  -> { detalhe }
//  POST relato        body:{incidenteId}          -> lê o relato (confirmação reforçada; cada leitura fica registrada)
//  POST comunicacao   body:{incidenteId,orgao,forma,comunicadoEm,protocoloExterno?,referenciaArquivo?,observacao?}
//  POST adendo        body:{incidenteId,texto}    POST reclassificar  body:{incidenteId,nivelNovo,motivo,relatadoPor?,relato?}   (para "suspeita de violência" pede a confirmação reforçada)
// ---- Nível geral (Diretoria e Comitê de Proteção) ------------------------------------------------------------------------------------------------
//  POST cautelar-decidir  body:{incidenteId,envolvidoId,decisao,observacao}   (confirmação reforçada)      POST encerrar  body:{incidenteId,resultado,providencia}   (confirmação reforçada)
//  POST vincular-envolvido body:{incidenteId,membroId}   liga uma pessoa do cadastro ao envolvido registrado só por nome (confirmação reforçada)
//  GET  padroes   GET comite   GET relatorio-anual?ano=
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim · 403 sem permissão · 404 não achou (incidente que não existe,
// que está fora do escopo ou em que a pessoa é envolvida recebem a MESMA resposta) · 429 limite de registros.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const vol = require("../shared/voluntariado");
const pm = require("../shared/protecaoMenores");
const db = require("../shared/protecaoDb");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";
const NAO_ACHOU = "Incidente não encontrado.";
const idDe = vol.inteiroPositivo;        // estrito: "0x10", "1e1", true e [5] não são identificadores

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (resultado && resultado.naoExiste) return erro(context, 404, NAO_ACHOU);
  context.res = { status: resultado.sucesso ? statusOk : (resultado.limite ? 429 : 422), body: resultado };
}
const lista = (obj) => Object.entries(obj).map(([codigo, rotulo]) => ({ codigo, rotulo: typeof rotulo === "object" ? rotulo.rotulo : rotulo, ...(typeof rotulo === "object" && rotulo.descricao ? { descricao: rotulo.descricao } : {}) }));

// Nada daqui fica em cache (lista, detalhe, padrões, relatório: tudo é dado de proteção de criança).
module.exports = async function (context, req) {
  await principal(context, req);
  if (context.res) context.res.headers = { "Cache-Control": "no-store", ...(context.res.headers || {}) };
};

async function principal(context, req) {
  const sessao = auth.exigirLogin(req, context);
  if (!sessao) return;
  // PIN ou código nunca valem como liderança (e não têm permissão alguma): a gestão só existe em sessão de liderança.
  const lideranca = auth.ehSessaoDeLideranca(sessao);
  const visao = lideranca ? auth.visaoDaPermissao(sessao, db.PERMISSAO) : null;
  const gestao = !!visao && auth.temPermissao(visao, db.PERMISSAO);
  const geral = gestao && esc.ehGeral(visao);
  const ver = { membroId: sessao.membroId, geral, podeVerCongregacao: (nome) => !!visao && auth.estaNoEscopo(visao, nome) };

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};

  // Identificador que chega de fora: inteiro positivo escrito direito; o resto é 400 (nunca vira consulta ao banco).
  for (const campo of ["incidenteId", "envolvidoId", "congregacaoId", "equipeId", "envolvidoMembroId", "membroId"]) {
    for (const origem of [corpo, consulta]) {
      if (campo in origem && origem[campo] != null && origem[campo] !== "" && !idDe(origem[campo])) return erro(context, 400, `${campo} inválido.`);
    }
  }
  const EXIGE_GESTAO = ["incidentes", "incidente", "relato", "comunicacao", "adendo", "reclassificar"];
  const EXIGE_GERAL = ["cautelar-decidir", "encerrar", "vincular-envolvido", "padroes", "comite", "relatorio-anual"];

  try {
    if (EXIGE_GESTAO.includes(acao) && !gestao) return erro(context, 403, SEM_PERMISSAO);
    if (EXIGE_GERAL.includes(acao) && !geral) return erro(context, 403, SEM_PERMISSAO);

    // =============================== Leitura ===============================
    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = {
          status: 200,
          body: {
            sucesso: true, horasPrazo: pm.HORAS_PRAZO,
            niveis: lista(pm.NIVEIS), orgaos: lista(pm.ORGAOS), formas: lista(pm.FORMAS_COMUNICACAO), quemRelatou: lista(pm.QUEM_RELATOU), resultados: lista(pm.RESULTADOS_ENCERRAMENTO), decisoes: lista(pm.DECISOES_CAUTELAR),
            contatosDeAjuda: pm.CONTATOS_DE_AJUDA, roteiroEscuta: pm.ROTEIRO_ESCUTA, naoFaca: pm.NAO_FACA, papeis: { gestao, geral }
          }
        };
        return;
      }
      if (acao === "meus") { context.res = { status: 200, body: { sucesso: true, incidentes: await db.meusIncidentes(pool, sessao.membroId) } }; return; }
      if (acao === "incidentes") {
        const status = consulta.status === "ABERTO" || consulta.status === "ENCERRADO" ? consulta.status : null;
        context.res = { status: 200, body: { sucesso: true, agora: new Date().toISOString(), incidentes: await db.listarIncidentes(pool, { ver, status }) } };
        return;
      }
      if (acao === "incidente") {
        const incidenteId = idDe(consulta.incidenteId);
        if (!incidenteId) return erro(context, 400, "Informe incidenteId.");
        const d = await db.detalheIncidente(pool, incidenteId, { ver });
        if (!d) return erro(context, 404, NAO_ACHOU);
        context.res = { status: 200, body: { sucesso: true, agora: new Date().toISOString(), ...d } };
        return;
      }
      if (acao === "padroes") { context.res = { status: 200, body: { sucesso: true, padroes: await db.padroes(pool, { verMembroId: sessao.membroId }) } }; return; }
      if (acao === "comite") { context.res = { status: 200, body: { sucesso: true, comite: await db.comiteComposicao(pool) } }; return; }
      if (acao === "relatorio-anual") {
        const ano = consulta.ano != null && consulta.ano !== "" ? Number(consulta.ano) : undefined;
        context.res = { status: 200, body: { sucesso: true, relatorio: await db.relatorioAnual(pool, { ano }) } };
        return;
      }
      return erro(context, 404, "Ação inválida.");
    }

    // =============================== Escrita ===============================
    if (metodo !== "POST") return erro(context, 405, "Método não permitido.");
    // só estas ações aceitam POST (as de leitura, como "padroes", respondem 404 a um POST: nada de cair no ramo que pede incidenteId)
    if (!["registrar", "relato", "comunicacao", "adendo", "reclassificar", "cautelar-decidir", "encerrar", "vincular-envolvido"].includes(acao)) return erro(context, 404, "Ação inválida.");

    if (acao === "registrar") { resposta(context, await db.registrarIncidente(pool, { dados: corpo, registrante: { membroId: sessao.membroId } }), 201); return; }

    const incidenteId = idDe(corpo.incidenteId);
    if (EXIGE_GESTAO.includes(acao) || EXIGE_GERAL.includes(acao)) {
      if (!incidenteId) return erro(context, 400, "Informe incidenteId.");
      if (acao === "relato") {
        // O relato é dado sensível de criança: a confirmação reforçada vem ANTES de qualquer consulta (e a leitura fica registrada).
        if (!auth.exigirFatorRecente(req, context)) return;
        const r = await db.lerRelato(pool, incidenteId, { ver });
        if (!r) return erro(context, 404, NAO_ACHOU);
        context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { sucesso: true, ...r } };
        return;
      }
      if (acao === "comunicacao") { resposta(context, await db.registrarComunicacao(pool, { incidenteId, dados: corpo, ver }), 201); return; }
      if (acao === "adendo") { resposta(context, await db.adicionarAdendo(pool, { incidenteId, texto: corpo.texto, ver }), 201); return; }
      if (acao === "reclassificar") {
        // Transformar um registro em "suspeita de violência" afasta a pessoa envolvida na hora: é ato de peso, com a confirmação reforçada (a quebra de política para quase-acidente não pede)
        if (corpo.nivelNovo === "ALEGACAO" && !auth.exigirFatorRecente(req, context)) return;
        resposta(context, await db.reclassificarIncidente(pool, { incidenteId, dados: corpo, ver })); return;
      }
      if (acao === "vincular-envolvido") {
        const membroId = idDe(corpo.membroId);
        if (!membroId) return erro(context, 400, "Informe membroId.");
        if (!auth.exigirFatorRecente(req, context)) return;
        resposta(context, await db.vincularEnvolvido(pool, { incidenteId, membroId, ver }));
        return;
      }
      // Os atos do nível geral pedem a confirmação reforçada da vD.4 (chave de acesso ou código por e-mail, até 10 minutos).
      if (acao === "cautelar-decidir") {
        const envolvidoId = idDe(corpo.envolvidoId);
        if (!envolvidoId) return erro(context, 400, "Informe envolvidoId.");
        if (!auth.exigirFatorRecente(req, context)) return;
        resposta(context, await db.decidirCautelar(pool, { incidenteId, envolvidoId, dados: corpo, ver }));
        return;
      }
      if (acao === "encerrar") {
        if (!auth.exigirFatorRecente(req, context)) return;
        resposta(context, await db.encerrarIncidente(pool, { incidenteId, dados: corpo, ver }));
        return;
      }
    }
    return erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoProtecaoMenores] erro:", e);
    erro(context, 500, "Erro interno ao processar a proteção de crianças.");
  }
}
