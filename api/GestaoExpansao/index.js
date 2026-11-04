// GestaoExpansao (v9.2 — Expansão: Extensões da Tenda, emancipação e nova congregação)
// Estatuto Art. 5º §§2º, 3º e 5º; Regimento Art. 23 (CME), Art. 24 §2º, Art. 104-B, I, e Art. 109-A. Desenho em docs/plano/fase-9-entidades-vinculadas.md.
//
// A regra pura está em shared/expansao.js (testada); o banco em shared/expansaoDb.js. Só a sessão de liderança (senha). Entra quem tem a permissão "expansao" OU
// compõe a CME (calculada: o Secretário de Missões e os Pastores de Área — shared/comissoes.js). O alcance:
//   - nível geral (papel GLOBAL com escopo de todas): vê e faz tudo; é o único que pede nova congregação e registra a decisão da CLI;
//   - CME: vê todos os pedidos e emite o parecer (não sobre o pedido que ela mesma fez);
//   - os demais (Dirigente, Pastor de Área): só o que é das congregações que o escopo deles cobre POR INTEIRO (o escopo de uma Extensão não alcança a Mãe).
//
// ---- Leitura (GET /api/expansao/...) ----
//  catalogos                    -> { tipos[], status[], pareceres[], resultados[], ufs[], prazoParecerDias, maes[], extensoes[], areas[], papeis:{ geral, cme } }
//  painel                       -> { hoje, parecerVencido[], emParecer[], aguardandoCLI[], extensoesComPendencia[], congregacoesSemDirigente[], cme:{ membros[], semSecretario, secretarioSemAcesso[] } }
//  pedidos?status=              -> { pedidos[] }
//  pedido?pedidoId=             -> { pedido:{ ..., acoes:{ parecer, decidir, desistir } } }
//  extensoes?todas=1            -> { extensoes[] }
//  extensao-historico?extensaoId= -> { encarregados[] }
//  reunioes                     -> { reunioes[] } as da CLI já realizadas e encerradas
//
// ---- Escrita (POST /api/expansao/...) ----
//  pedido       {tipo, nome, endereco?, bairro?, cidade?, uf?, justificativa, congregacaoMaeId?, encarregadoMembroId?, extensaoId?, areaId?}   -> 201
//  parecer      {pedidoId, parecer:FAVORAVEL|CONTRARIO, fundamentacao}       só a CME
//  decidir      {pedidoId, sessaoId, resultado:APROVADO|REJEITADO, urgencia?, motivo?}   só o nível geral; pede a confirmação recente (428)
//  desistir     {pedidoId, motivo}                                            quem pediu ou o nível geral
//  encarregado  {extensaoId, membroId, motivo}                                o Dirigente da Mãe ou o nível geral
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 · 400 dado ruim · 403 sem permissão · 404 não achou.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const ex = require("../shared/expansao");
const db = require("../shared/expansaoDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, r, statusOk = 200) {
  context.res = { status: r.sucesso ? statusOk : (r.proibido ? 403 : (r.naoExiste ? 404 : 422)), body: r };
}

// As ações de escrita e o identificador que cada uma exige no corpo.
const ESCRITA = { "pedido": null, "parecer": "pedidoId", "decidir": "pedidoId", "desistir": "pedidoId", "encarregado": "extensaoId" };

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  if (!auth.ehSessaoDeLideranca(usuario)) return erro(context, 403, SEM_PERMISSAO);

  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};
  const hoje = hojeBrasilia();
  const por = usuario.membroId;

  const pool = await getPool();
  try {
    const visao = auth.visaoDaPermissao(usuario, "expansao");
    const cme = (await db.composicaoCME(pool)).some((m) => Number(m.membroId) === Number(por));
    if (!visao && !cme) return erro(context, 403, SEM_PERMISSAO);
    const concessoes = visao ? auth.concessoesDaVisao(visao) : [];
    const alcance = {
      geral: !!visao && esc.ehGeral(visao),
      cme,
      // a congregação inteira por um cargo TERRITORIAL (o Dirigente, o Pastor de Área...): o escopo de uma Extensão é mais estreito que a Mãe e não conta, e o de um
      // departamento (o Secretário de Missões, um Líder Geral) vale para o campo todo só no departamento dele — não alcança congregação (revisão de 04/11/2026)
      cobreMae: (nome) => concessoes.some((c) => !c.escopoExtensaoNome && c.nivel !== "DEPARTAMENTO" && auth.estaNoEscopo(c, nome)),
      // o Dirigente da Mãe: o cargo de nível Congregação com ela no escopo (escolhe o Encarregado, "de confiança do Dirigente Local" — Regimento Art. 109-A, I)
      dirigeMae: (nome) => concessoes.some((c) => !c.escopoExtensaoNome && c.nivel === "CONGREGACAO" && auth.estaNoEscopo(c, nome))
    };

    if (metodo === "GET") {
      if (acao === "catalogos") { context.res = { status: 200, body: { sucesso: true, ...(await db.catalogos(pool, { alcance })) } }; return; }
      if (acao === "painel") { context.res = { status: 200, body: { sucesso: true, ...(await db.painel(pool, { alcance, hoje })) } }; return; }
      if (acao === "pedidos") {
        const status = consulta.status == null || consulta.status === "" ? null : String(consulta.status).toUpperCase();
        if (status && !ex.STATUS[status]) return erro(context, 400, "status inválido.");
        context.res = { status: 200, body: { sucesso: true, pedidos: await db.listarPedidos(pool, { alcance, hoje, status }) } };
        return;
      }
      if (acao === "pedido") {
        const pedidoId = ex.idDe(consulta.pedidoId == null ? null : String(consulta.pedidoId));
        if (!pedidoId) return erro(context, 400, "Informe pedidoId.");
        const pedido = await db.detalharPedido(pool, { pedidoId, alcance, hoje, membroId: por });
        if (!pedido) return erro(context, 404, "Pedido não encontrado.");
        context.res = { status: 200, body: { sucesso: true, pedido } };
        return;
      }
      if (acao === "extensoes") {
        const todas = consulta.todas === "1" || consulta.todas === "true";
        context.res = { status: 200, body: { sucesso: true, extensoes: await db.listarExtensoes(pool, { alcance, todas }) } };
        return;
      }
      if (acao === "extensao-historico") {
        const extensaoId = ex.idDe(consulta.extensaoId == null ? null : String(consulta.extensaoId));
        if (!extensaoId) return erro(context, 400, "Informe extensaoId.");
        // o histórico (com o motivo de cada saída) é de quem cuida da Mãe — a CME de outra Área não o lê
        const visivel = (await db.listarExtensoes(pool, { alcance, todas: true })).some((e) => e.extensaoId === extensaoId && e.podeVerHistorico);
        if (!visivel) return erro(context, 404, "Extensão não encontrada.");
        context.res = { status: 200, body: { sucesso: true, encarregados: await db.historicoEncarregados(pool, extensaoId) } };
        return;
      }
      if (acao === "reunioes") {
        if (!alcance.geral) return erro(context, 403, esc.MSG_GERAL);
        context.res = { status: 200, body: { sucesso: true, reunioes: await db.reunioesEncerradas(pool, "CLI", hoje) } };
        return;
      }
      return erro(context, 404, "Ação inválida.");
    }

    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");
    if (!Object.prototype.hasOwnProperty.call(ESCRITA, acao)) return erro(context, 404, "Ação inválida.");
    if (acao === "decidir" && !alcance.geral) return erro(context, 403, esc.MSG_GERAL);
    if (acao === "decidir" && !auth.exigirFatorRecente(req, context)) return;
    const campoId = ESCRITA[acao];
    const id = campoId ? ex.idDe(corpo[campoId]) : null;
    if (campoId && !id) return erro(context, 400, `Informe ${campoId}.`);
    const base = { dados: corpo, por, hoje, alcance };
    let r;
    switch (acao) {
      case "pedido": r = await db.criarPedido(pool, base); break;
      case "parecer": r = await db.emitirParecer(pool, { ...base, pedidoId: id }); break;
      case "decidir": r = await db.decidir(pool, { ...base, pedidoId: id, sid: usuario.sid }); break;
      case "desistir": r = await db.desistir(pool, { ...base, pedidoId: id }); break;
      case "encarregado": r = await db.trocarEncarregado(pool, { ...base, extensaoId: id }); break;
      default: return erro(context, 404, "Ação inválida.");
    }
    resposta(context, r, acao === "pedido" ? 201 : 200);
  } catch (e) {
    context.log.error("[GestaoExpansao]", e.message);
    erro(context, 500, "Erro interno ao processar o pedido de expansão.");
  }
};
