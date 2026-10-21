// GestaoCuidadoPastoral (v7.11 — Cuidado pastoral: filas com responsável, prazo e sigilo)
// Regimento Art. 128 §5º, II, b (Busca Ativa do visitante em 48 horas), Art. 85 §3º, I (visita nunca a sós), Art. 132 (sigilo hierarquizado e as anotações pastorais saem com o membro);
// LGPD arts. 7º, 11 e 18.
//
// Toda a regra está em shared/cuidadoPastoral.js (pura, testada); o banco, em shared/cuidadoPastoralDb.js. A rotina diária (detecção, escada, apagar notas de quem saiu, retenção)
// roda dentro de NotificacoesAgendador, às 7h, com as outras.
//
// ---- De qualquer pessoa logada (inclusive PIN) ---------------------------------------------------------------------------------------------------
//  GET  catalogos       -> { tipos[], formas[], desfechosConclusao[], desfechosCancelamento[], niveisNota[], categorias[], paraQuem[], degraus[], contatosDeAjuda[], papeis:{gestao,geral} }
//  GET  meus            -> { itens[] }   (os acompanhamentos de que a pessoa é responsável; nunca os que são SOBRE ela)
//  GET  meus-pedidos    -> { oracao[], visitas[] }   (só os que a própria pessoa fez, com a situação)
//  GET  boletim-meu     -> { linhas[] }   (o boletim de oração da congregação da pessoa: só linhas sem nome)
//  POST pedir-oracao    body:{categoria,texto,podeBoletim,querContato?,paraQuem?}     POST pedir-visita  body:{motivo,hospital?,contato?}
//  GET  item?itemId=    POST contato body:{itemId,forma,conseguiu,acompanhante?,observacao?,data?}    POST concluir body:{itemId,desfecho,observacao?}   (liderança ou responsável)
//  GET  notas?membroId=|itemId=     POST nota body:{membroId|itemId,nivel,texto,retificaNotaId?}     POST abrir-nota body:{notaId}  ("somente pastor": confirmação reforçada)
//  GET  leituras?notaId=            (quem abriu a nota: quem a escreveu e o nível geral)
// ---- Liderança (permissão cuidado_pastoral, sessão de liderança; cada um no seu território) ------------------------------------------------------
//  GET  fila?situacao=ABERTOS|VENCIDOS|SEM_RESPONSAVEL|URGENTES|ENCERRADOS&congregacaoId=&tipo=     GET painel     GET congregacoes
//  GET  pedidos?situacao=AGUARDANDO|RISCO|APROVADOS|TODOS&congregacaoId=     GET boletim?congregacaoId=
//  POST abrir body:{tipo,congregacaoId,membroId?|pessoaNome+pessoaContato,motivo?,responsavelMembroId?,urgente?}     POST atribuir body:{itemId,responsavelMembroId}
//  POST adiar body:{itemId,novoPrazo,motivo}     POST cancelar body:{itemId,desfecho,motivo}     POST buscar-pessoas body:{congregacaoId,q}
//  POST registrar-pedido body:{congregacaoId,membroId?|solicitanteNome+solicitanteContato?,categoria,texto,podeBoletim,querContato?,paraQuem?}
//  POST moderar body:{pedidoId,decisao:APROVAR|NAO_PUBLICAR,textoBoletim?}     POST risco body:{pedidoId,marcar,motivo?} (desmarcar: confirmação reforçada)
//  POST acompanhar-pedido body:{pedidoId}
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim · 403 sem permissão · 404 não achou (o que não existe e o
// que a pessoa não pode ver — inclusive o item ou a nota SOBRE ela — recebem a MESMA resposta) · 409 mudou enquanto isso · 428 confirmação reforçada · 429 limite.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const vol = require("../shared/voluntariado");
const cp = require("../shared/cuidadoPastoral");
const db = require("../shared/cuidadoPastoralDb");

const SEM_PERMISSAO = "Isto é da liderança do cuidado pastoral. Fale com quem administra as Permissões.";
const NAO_ACHOU = "Não encontrado.";
const idDe = vol.inteiroPositivo;        // estrito: "0x10", "1e1", true e [5] não são identificadores

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, NAO_ACHOU);
  const status = resultado.sucesso ? statusOk : resultado.proibido ? 403 : resultado.mudou ? 409 : resultado.limite ? 429 : 422;
  const { naoExiste, proibido, ...corpo } = resultado;
  context.res = { status, body: corpo };
}
const lista = (obj) => Object.entries(obj).map(([codigo, rotulo]) => ({ codigo, rotulo: typeof rotulo === "object" ? rotulo.rotulo : rotulo, ...(typeof rotulo === "object" && rotulo.descricao ? { descricao: rotulo.descricao } : {}) }));

// Nada daqui fica em cache: nome de quem é acompanhado, nota pastoral e pedido de oração são dado sensível.
module.exports = async function (context, req) {
  await principal(context, req);
  if (context.res) context.res.headers = { "Cache-Control": "no-store", ...(context.res.headers || {}) };
};

async function principal(context, req) {
  const sessao = auth.exigirLogin(req, context);
  if (!sessao) return;
  // PIN ou código nunca valem como liderança (e não têm permissão alguma): a liderança só existe em sessão de liderança.
  const lideranca = auth.ehSessaoDeLideranca(sessao);
  const visao = lideranca ? auth.visaoDaPermissao(sessao, db.PERMISSAO) : null;
  const gestao = !!visao && auth.temPermissao(visao, db.PERMISSAO);
  const geral = gestao && esc.ehGeral(visao);
  const ver = { membroId: sessao.membroId, gestao, geral, podeVerCongregacao: (nome) => !!visao && auth.estaNoEscopo(visao, nome) };

  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};

  // Identificador que chega de fora: inteiro positivo escrito direito; o resto é 400 (nunca vira consulta ao banco).
  for (const campo of ["itemId", "membroId", "congregacaoId", "responsavelMembroId", "notaId", "pedidoId", "retificaNotaId"]) {
    for (const origem of [corpo, consulta]) {
      if (campo in origem && origem[campo] != null && origem[campo] !== "" && !idDe(origem[campo])) return erro(context, 400, `${campo} inválido.`);
    }
  }
  const EXIGE_GESTAO = ["fila", "painel", "congregacoes", "pedidos", "boletim", "abrir", "atribuir", "adiar", "cancelar", "buscar-pessoas", "registrar-pedido", "moderar", "risco", "acompanhar-pedido"];
  const LEITURAS = ["catalogos", "meus", "meus-pedidos", "boletim-meu", "item", "notas", "leituras", "fila", "painel", "congregacoes", "pedidos", "boletim"];
  const ESCRITAS = ["pedir-oracao", "pedir-visita", "contato", "concluir", "nota", "abrir-nota", "abrir", "atribuir", "adiar", "cancelar", "buscar-pessoas", "registrar-pedido", "moderar", "risco", "acompanhar-pedido"];

  try {
    if (EXIGE_GESTAO.includes(acao) && !gestao) return erro(context, 403, SEM_PERMISSAO);
    if (metodo === "GET" && !LEITURAS.includes(acao)) return erro(context, 404, "Ação inválida.");
    if (metodo === "POST" && !ESCRITAS.includes(acao)) return erro(context, 404, "Ação inválida.");
    if (metodo !== "GET" && metodo !== "POST") return erro(context, 405, "Método não permitido.");
    const pool = await getPool();

    // =============================== Leitura ===============================
    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = { status: 200, body: {
          sucesso: true, papeis: { gestao, geral },
          tipos: Object.entries(cp.TIPOS).map(([codigo, t]) => ({ codigo, rotulo: t.rotulo, descricao: t.descricao, manual: cp.TIPOS_ABERTURA_MANUAL.includes(codigo), soMembro: cp.TIPOS_SO_MEMBRO.includes(codigo) })),
          formas: lista(cp.FORMAS_CONTATO), formasPresenciais: cp.FORMAS_PRESENCIAIS, desfechosConclusao: lista(cp.DESFECHOS_CONCLUSAO), desfechosCancelamento: lista(cp.DESFECHOS_CANCELAMENTO),
          niveisNota: lista(cp.NIVEIS_NOTA), categorias: lista(cp.CATEGORIAS_ORACAO), paraQuem: lista(cp.PARA_QUEM), degraus: lista(cp.DEGRAUS), contatosDeAjuda: cp.CONTATOS_DE_AJUDA,
          limites: { motivo: cp.MAX_MOTIVO, observacao: cp.MAX_OBSERVACAO, nota: cp.MAX_NOTA, pedido: cp.MAX_PEDIDO, boletim: cp.MAX_BOLETIM, nome: cp.MAX_NOME, contato: cp.MAX_CONTATO,
            adiarDias: cp.MAX_ADIAR_DIAS, contatoRetroativoDias: cp.CONTATO_RETROATIVO_DIAS }
        } };
        return;
      }
      if (acao === "meus") { context.res = { status: 200, body: { sucesso: true, agora: new Date().toISOString(), itens: await db.meusItens(pool, sessao.membroId) } }; return; }
      if (acao === "meus-pedidos") { context.res = { status: 200, body: { sucesso: true, ...(await db.meusPedidos(pool, sessao.membroId)) } }; return; }
      if (acao === "boletim-meu") { context.res = { status: 200, body: { sucesso: true, linhas: await db.boletim(pool, { membroId: sessao.membroId }) } }; return; }
      if (acao === "item") {
        const itemId = idDe(consulta.itemId);
        if (!itemId) return erro(context, 400, "Informe itemId.");
        const d = await db.detalheItem(pool, itemId, { ver });
        if (!d) return erro(context, 404, NAO_ACHOU);
        context.res = { status: 200, body: { sucesso: true, ...d } };
        return;
      }
      if (acao === "notas") {
        const membroId = idDe(consulta.membroId), itemId = idDe(consulta.itemId);
        if (!membroId === !itemId) return erro(context, 400, "Informe membroId ou itemId.");
        const notas = await db.listarNotas(pool, membroId ? { membroId } : { itemId }, { ver });
        if (!notas) return erro(context, 404, NAO_ACHOU);
        context.res = { status: 200, body: { sucesso: true, notas } };
        return;
      }
      if (acao === "leituras") {
        const notaId = idDe(consulta.notaId);
        if (!notaId) return erro(context, 400, "Informe notaId.");
        const leituras = await db.leiturasDaNota(pool, notaId, { ver });
        if (!leituras) return erro(context, 404, NAO_ACHOU);
        context.res = { status: 200, body: { sucesso: true, leituras } };
        return;
      }
      if (acao === "fila") {
        const filtros = { situacao: typeof consulta.situacao === "string" ? consulta.situacao : undefined, congregacaoId: idDe(consulta.congregacaoId), tipo: typeof consulta.tipo === "string" ? consulta.tipo : undefined };
        context.res = { status: 200, body: { sucesso: true, agora: new Date().toISOString(), itens: await db.listarFila(pool, { ver, filtros }) } };
        return;
      }
      if (acao === "painel") { context.res = { status: 200, body: { sucesso: true, congregacoes: await db.painel(pool, { ver }) } }; return; }
      if (acao === "congregacoes") { context.res = { status: 200, body: { sucesso: true, congregacoes: await db.congregacoesDoTerritorio(pool, { ver }) } }; return; }
      if (acao === "pedidos") {
        const situacao = ["AGUARDANDO", "RISCO", "APROVADOS", "TODOS"].includes(consulta.situacao) ? consulta.situacao : "AGUARDANDO";
        context.res = { status: 200, body: { sucesso: true, pedidos: await db.listarPedidos(pool, { ver, situacao, congregacaoId: idDe(consulta.congregacaoId) }) } };
        return;
      }
      if (acao === "boletim") { context.res = { status: 200, body: { sucesso: true, linhas: await db.boletim(pool, { ver, congregacaoId: idDe(consulta.congregacaoId) }) } }; return; }
    }

    // =============================== Escrita ===============================
    if (acao === "pedir-oracao") { resposta(context, await db.pedirOracao(pool, { dados: corpo, membroId: sessao.membroId }), 201); return; }
    if (acao === "pedir-visita") { resposta(context, await db.pedirVisita(pool, { dados: corpo, membroId: sessao.membroId }), 201); return; }
    if (acao === "nota") { resposta(context, await db.escreverNota(pool, { dados: corpo, ver }), 201); return; }
    if (acao === "abrir-nota") {
      const notaId = idDe(corpo.notaId);
      if (!notaId) return erro(context, 400, "Informe notaId.");
      const cab = await db.notaLegivel(pool, notaId, { ver });
      if (!cab) return erro(context, 404, NAO_ACHOU);
      // a nota "somente pastor" é aconselhamento: a confirmação reforçada vem ANTES do texto (e a abertura fica registrada)
      if (cab.pedeFator && !auth.exigirFatorRecente(req, context)) return;
      const n = await db.lerNota(pool, notaId, { ver });
      if (!n) return erro(context, 404, NAO_ACHOU);
      context.res = { status: 200, body: { sucesso: true, nota: n } };
      return;
    }
    if (acao === "abrir") { resposta(context, await db.abrirItem(pool, { dados: corpo, ver }), 201); return; }
    if (acao === "buscar-pessoas") {
      const congregacaoId = idDe(corpo.congregacaoId);
      if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
      const pessoas = await db.buscarPessoas(pool, { ver, congregacaoId, q: corpo.q });
      if (!pessoas) return erro(context, 404, NAO_ACHOU);
      context.res = { status: 200, body: { sucesso: true, pessoas } };
      return;
    }
    if (acao === "registrar-pedido") { resposta(context, await db.registrarPedidoRecebido(pool, { dados: corpo, ver }), 201); return; }

    if (["moderar", "risco", "acompanhar-pedido"].includes(acao)) {
      const pedidoId = idDe(corpo.pedidoId);
      if (!pedidoId) return erro(context, 400, "Informe pedidoId.");
      if (acao === "moderar") { resposta(context, await db.moderar(pool, { pedidoId, dados: corpo, ver })); return; }
      if (acao === "acompanhar-pedido") { resposta(context, await db.acompanharPedido(pool, { pedidoId, ver }), 201); return; }
      // desmarcar um sinal de risco é o ato mais delicado da fila (tira o pedido do atendimento urgente): pede a confirmação reforçada
      if (corpo.marcar === false && !auth.exigirFatorRecente(req, context)) return;
      resposta(context, await db.marcarRisco(pool, { pedidoId, dados: corpo, ver }));
      return;
    }

    const itemId = idDe(corpo.itemId);
    if (!itemId) return erro(context, 400, "Informe itemId.");
    if (acao === "contato") { resposta(context, await db.registrarContato(pool, { itemId, dados: corpo, ver }), 201); return; }
    if (acao === "concluir") { resposta(context, await db.concluir(pool, { itemId, dados: corpo, ver })); return; }
    if (acao === "cancelar") { resposta(context, await db.cancelar(pool, { itemId, dados: corpo, ver })); return; }
    if (acao === "adiar") { resposta(context, await db.adiar(pool, { itemId, dados: corpo, ver })); return; }
    if (acao === "atribuir") {
      const responsavelMembroId = idDe(corpo.responsavelMembroId);
      if (!responsavelMembroId) return erro(context, 400, "Informe responsavelMembroId.");
      resposta(context, await db.atribuir(pool, { itemId, responsavelMembroId, ver }));
      return;
    }
    return erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoCuidadoPastoral] erro:", e);
    erro(context, 500, "Erro interno ao processar o cuidado pastoral.");
  }
}
