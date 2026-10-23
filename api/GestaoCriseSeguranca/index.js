// GestaoCriseSeguranca (v7.15 — Gestão de crise e porta-voz único; segurança da congregação)
// Regimento Art. 161-B (Política de Porta-Voz Único: §§ 1º e 2º); contrato de 23/10/2026 em docs/plano/fase-7-saude-eventos-e-comunicacao.md ("## v7.15").
//
// Toda a regra está em shared/criseSeguranca.js (pura, testada); o banco, em shared/criseSegurancaDb.js. O aviso da crise vai pela comunicação da v7.12 (categoria CRISE): o
// sininho na hora, o celular na primeira rodada e o e-mail pela fila (ComunicacaoFila, 100 por hora). A rotina diária (equipe de quem saiu, retenção) e os avisos da segurança
// rodam dentro de NotificacoesAgendador, às 7h.
//
// ---- Qualquer sessão de LIDERANÇA (PIN e código não entram) ----------------------------------------------------------------------------------------
//  GET  faixa        -> { ativa, criseId?, desde?, portaVoz?:{tipo,nome,contato}, souPortaVoz? }     (leve: toda tela da liderança mostra a faixa da crise ativa)
//  GET  catalogos    -> { portaVoz, canais, situacoes, tiposSimulado, itensVistoria, resultados, funcoes, contatosEmergencia, limites, papeis:{crise,seguranca,geralSeguranca} }
//  GET  demandas     -> { gestor, criseAtivaId, demandas[] }   (o nível geral da crise e o porta-voz veem todas; os outros, as que registraram)
//  POST demanda      body:{veiculo,contato,pedido,prazo?,corrigeDemandaId?}     (o pedido da imprensa que chegou ao líder: é assim que ele encaminha)
//  POST responder    body:{demandaId,situacao:RESPONDIDA|RECUSADA,resposta,substituiRespostaId?}     (nível geral da crise ou porta-voz)
//  POST manifestacao body:{criseId,dataHora,canal,quemFalou,resumo,link?,documento?,autorizadoPor,corrigeManifestacaoId?}     (nível geral da crise ou porta-voz)
//  GET  crise?criseId=     (nível geral da crise, ou o porta-voz da crise ativa)
// ---- Nível geral com crise_gestao (Presidente e Secretário Geral) ------------------------------------------------------------------------------------
//  GET  crises     POST abrir body:{motivo,portaVoz:{tipo,nome?,contato,ato?,membroId?}}     POST porta-voz body:{criseId,portaVoz}     POST encerrar body:{criseId,resumo}
//  (abrir, porta-voz e encerrar pedem a confirmação reforçada: chave do aparelho ou código por e-mail)     POST continuar-aviso   (mais uma rodada da fila do aviso)
// ---- Permissão seguranca_congregacao (Dirigente, Pastor de Área e o nível geral; cada um no seu território) ------------------------------------------
//  GET  seguranca                         -> { congregacoes[] }   (painel: alertas de plano, simulado, vistoria, pendências, AVCB e seguro)
//  GET  congregacao?congregacaoId=        -> plano atual e versões, simulados, vistorias com os itens, equipe, imóveis
//  POST plano body:{congregacaoId,rotasEvacuacao,pontosEncontro,contatosLocais?,responsaveis,versaoAtual}     POST simulado body:{congregacaoId,data,tipo,participantes,duracaoMinutos,correuBem?,melhorar?}
//  POST vistoria body:{congregacaoId,data,itens[{item,resultado,pendencia?}],observacoes?}     POST resolver-pendencia body:{vistoriaItemId,como}
//  POST anular-simulado body:{simuladoId,motivo}     POST anular-vistoria body:{vistoriaId,motivo}
//  POST buscar-membros body:{congregacaoId,q}     POST equipe body:{congregacaoId,membroId,funcao,desde,ate?}     POST sair-equipe body:{equipeId}
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 · 400 dado ruim · 403 sem permissão · 404 não achou (o que não existe e o que a pessoa não
// alcança recebem a MESMA resposta) · 409 mudou enquanto isso · 428 confirmação reforçada · 429 ocupado ou muitas tentativas.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const vol = require("../shared/voluntariado");
const cs = require("../shared/criseSeguranca");
const db = require("../shared/criseSegurancaDb");
const { criarLimitador } = require("../shared/limiteTaxa");

const SO_LIDERANCA = "Isto é da liderança: entre com a sua senha de liderança.";
const SEM_CRISE = "Isto é do nível geral da crise (Presidente e Secretário Geral).";
const SEM_SEGURANCA = "Isto é da segurança da congregação (Dirigente, Pastor de Área e nível geral). Fale com quem administra as Permissões.";
const NAO_ACHOU = "Não encontrado.";
const idDe = vol.inteiroPositivo;        // estrito: "0x10", "1e1", true e [5] não são identificadores
// por pessoa: o pedido da imprensa é raro (o banco também limita a 30 em 24 horas); a busca de membros cruza o cadastro
const limiteDemanda = criarLimitador({ janelaMs: 10 * 60000, maximo: 10 });
const limiteBusca = criarLimitador({ janelaMs: 60000, maximo: 30 });
const limiteContinuar = criarLimitador({ janelaMs: 60000, maximo: 4 });

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, NAO_ACHOU);
  const status = resultado.sucesso ? statusOk : resultado.proibido ? 403 : resultado.mudou ? 409 : resultado.limite ? 429 : 422;
  const { naoExiste, proibido, ...corpo } = resultado;
  context.res = { status, body: corpo };
}
const lista = (obj) => Object.entries(obj).map(([codigo, rotulo]) => ({ codigo, rotulo: typeof rotulo === "object" ? rotulo.rotulo : rotulo, ...(typeof rotulo === "object" && rotulo.dica ? { dica: rotulo.dica } : {}) }));

// Nada daqui fica em cache: o regime de crise, os pedidos da imprensa e a equipe de segurança.
module.exports = async function (context, req) {
  await principal(context, req);
  if (context.res) context.res.headers = { "Cache-Control": "no-store", ...(context.res.headers || {}) };
};

async function principal(context, req) {
  const sessao = auth.exigirLogin(req, context);
  if (!sessao) return;
  if (!auth.ehSessaoDeLideranca(sessao)) return erro(context, 403, SO_LIDERANCA);
  // A crise é do nível GERAL (concessão de nível Global com todas as congregações) com crise_gestao: uma delegação local da permissão não abre crise.
  const visaoCrise = auth.visaoDaPermissao(sessao, cs.PERMISSAO_CRISE);
  const crise = !!visaoCrise && esc.ehGeral(visaoCrise);
  // A segurança é TERRITORIAL: a concessão de uma Extensão e a de Departamento não entram (quem cuida do templo da Extensão é o Dirigente da congregação-mãe).
  const visaoSegBruta = auth.visaoDaPermissao(sessao, cs.PERMISSAO_SEGURANCA);
  const visaoSeg = visaoSegBruta ? auth.restringirVisao(visaoSegBruta, (c) => !c.escopoExtensaoNome && c.nivel !== "DEPARTAMENTO") : null;
  const seguranca = !!visaoSeg && auth.temPermissao(visaoSeg, cs.PERMISSAO_SEGURANCA);
  const geralSeguranca = seguranca && esc.ehGeral(visaoSeg);
  const ver = { membroId: sessao.membroId, crise, seguranca, geralSeguranca, podeVerCongregacao: (nome) => !!visaoSeg && auth.estaNoEscopo(visaoSeg, nome) };

  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};

  for (const campo of ["criseId", "demandaId", "congregacaoId", "simuladoId", "vistoriaId", "vistoriaItemId", "equipeId", "membroId", "substituiRespostaId", "corrigeDemandaId", "corrigeManifestacaoId"]) {
    for (const origem of [corpo, consulta]) {
      if (campo in origem && origem[campo] != null && origem[campo] !== "" && !idDe(origem[campo])) return erro(context, 400, `${campo} inválido.`);
    }
  }
  const LEITURAS = ["faixa", "catalogos", "demandas", "crise", "crises", "seguranca", "congregacao"];
  const ESCRITAS = ["demanda", "responder", "manifestacao", "abrir", "porta-voz", "encerrar", "continuar-aviso", "plano", "simulado", "vistoria", "resolver-pendencia",
    "anular-simulado", "anular-vistoria", "buscar-membros", "equipe", "sair-equipe"];
  const EXIGE_CRISE = ["crises", "abrir", "porta-voz", "encerrar", "continuar-aviso"];
  const EXIGE_SEGURANCA = ["seguranca", "congregacao", "plano", "simulado", "vistoria", "resolver-pendencia", "anular-simulado", "anular-vistoria", "buscar-membros", "equipe", "sair-equipe"];

  try {
    if (metodo !== "GET" && metodo !== "POST") return erro(context, 405, "Método não permitido.");
    if (metodo === "GET" && !LEITURAS.includes(acao)) return erro(context, 404, "Ação inválida.");
    if (metodo === "POST" && !ESCRITAS.includes(acao)) return erro(context, 404, "Ação inválida.");
    if (EXIGE_CRISE.includes(acao) && !crise) return erro(context, 403, SEM_CRISE);
    if (EXIGE_SEGURANCA.includes(acao) && !seguranca) return erro(context, 403, SEM_SEGURANCA);
    // abrir e encerrar o regime e trocar quem fala pela Igreja são atos sem volta, que avisam a liderança inteira: pedem a confirmação reforçada
    if (metodo === "POST" && ["abrir", "porta-voz", "encerrar"].includes(acao) && !auth.exigirFatorRecente(req, context)) return;
    const limitador = metodo === "POST" && acao === "demanda" ? limiteDemanda : metodo === "POST" && acao === "buscar-membros" ? limiteBusca : metodo === "POST" && acao === "continuar-aviso" ? limiteContinuar : null;
    if (limitador && !limitador.registrar(`m${sessao.membroId}`).permitido) return erro(context, 429, "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.");
    const pool = await getPool();

    // =============================== Leitura ===============================
    if (metodo === "GET") {
      if (acao === "faixa") { context.res = { status: 200, body: { sucesso: true, ...(await db.faixa(pool, { ver })) } }; return; }
      if (acao === "catalogos") {
        context.res = { status: 200, body: {
          sucesso: true, papeis: { crise, seguranca, geralSeguranca },
          portaVoz: lista(cs.PORTA_VOZ), canais: lista(cs.CANAIS_MANIFESTACAO), situacoes: lista(cs.SITUACOES_DEMANDA), tiposSimulado: lista(cs.TIPOS_SIMULADO),
          itensVistoria: lista(cs.ITENS_VISTORIA), resultados: lista(cs.RESULTADOS_ITEM), funcoes: lista(cs.FUNCOES_EQUIPE), contatosEmergencia: cs.CONTATOS_EMERGENCIA, limites: cs.MAX
        } };
        return;
      }
      if (acao === "demandas") { context.res = { status: 200, body: { sucesso: true, ...(await db.listarDemandas(pool, { ver })) } }; return; }
      if (acao === "crises") { context.res = { status: 200, body: { sucesso: true, crises: await db.listarCrises(pool, { ver }) } }; return; }
      if (acao === "crise") {
        const criseId = idDe(consulta.criseId);
        if (!criseId) return erro(context, 400, "Informe criseId.");
        const r = await db.detalheCrise(pool, { ver, criseId });
        if (r.naoExiste) return erro(context, 404, NAO_ACHOU);
        context.res = { status: 200, body: { sucesso: true, ...r } };
        return;
      }
      if (acao === "seguranca") { context.res = { status: 200, body: { sucesso: true, congregacoes: await db.painelSeguranca(pool, { ver }) } }; return; }
      if (acao === "congregacao") {
        const congregacaoId = idDe(consulta.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        const r = await db.detalheSeguranca(pool, { ver, congregacaoId });
        if (!r) return erro(context, 404, NAO_ACHOU);
        context.res = { status: 200, body: { sucesso: true, ...r } };
        return;
      }
    }

    // =============================== Escrita ===============================
    if (acao === "demanda") { resposta(context, await db.registrarDemanda(pool, { ver, dados: corpo }), 201); return; }
    if (acao === "responder") { resposta(context, await db.responderDemanda(pool, { ver, dados: corpo }), 201); return; }
    if (acao === "manifestacao") { resposta(context, await db.registrarManifestacao(pool, { ver, dados: corpo }), 201); return; }
    if (acao === "abrir") { resposta(context, await db.abrir(pool, { ver, dados: corpo }), 201); return; }
    if (acao === "porta-voz" || acao === "encerrar") {
      const criseId = idDe(corpo.criseId);
      if (!criseId) return erro(context, 400, "Informe criseId.");
      resposta(context, acao === "porta-voz" ? await db.designarPortaVoz(pool, { ver, criseId, dados: corpo }) : await db.encerrar(pool, { ver, criseId, dados: corpo }));
      return;
    }
    if (acao === "continuar-aviso") { resposta(context, await db.continuarAviso(pool, { ver })); return; }
    if (["plano", "simulado", "vistoria", "equipe"].includes(acao)) {
      const congregacaoId = idDe(corpo.congregacaoId);
      if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
      const fn = { plano: db.salvarPlano, simulado: db.registrarSimulado, vistoria: db.registrarVistoria, equipe: db.adicionarEquipe }[acao];
      resposta(context, await fn(pool, { ver, congregacaoId, dados: corpo }), 201);
      return;
    }
    if (acao === "anular-simulado" || acao === "anular-vistoria") {
      const id = idDe(acao === "anular-simulado" ? corpo.simuladoId : corpo.vistoriaId);
      if (!id) return erro(context, 400, "Informe o registro.");
      resposta(context, await db.anular(pool, { ver, tipo: acao === "anular-simulado" ? "SIMULADO" : "VISTORIA", id, dados: corpo }));
      return;
    }
    if (acao === "resolver-pendencia") {
      const vistoriaItemId = idDe(corpo.vistoriaItemId);
      if (!vistoriaItemId) return erro(context, 400, "Informe vistoriaItemId.");
      resposta(context, await db.resolverPendencia(pool, { ver, vistoriaItemId, dados: corpo }));
      return;
    }
    if (acao === "sair-equipe") {
      const equipeId = idDe(corpo.equipeId);
      if (!equipeId) return erro(context, 400, "Informe equipeId.");
      resposta(context, await db.encerrarEquipe(pool, { ver, equipeId }));
      return;
    }
    if (acao === "buscar-membros") {
      const congregacaoId = idDe(corpo.congregacaoId);
      if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
      const membros = await db.buscarMembros(pool, { ver, congregacaoId, q: corpo.q });
      if (!membros) return erro(context, 404, NAO_ACHOU);
      context.res = { status: 200, body: { sucesso: true, membros } };
      return;
    }
    return erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[CRISE] erro:", e && e.message);
    return erro(context, 500, "Erro interno.");
  }
}
