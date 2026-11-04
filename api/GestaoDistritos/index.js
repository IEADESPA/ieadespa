// GestaoDistritos (v9.3 — Distrito e macroexpansão)
// Estatuto Art. 5º §5º; Regimento Art. 6-A, Art. 53-D, I, Art. 126-K a 126-N, Art. 126-P e Art. 144, II. Desenho em docs/plano/fase-9-entidades-vinculadas.md.
//
// A regra pura está em shared/distritos.js (testada); o banco em shared/distritosDb.js. Só a sessão de liderança (senha) com a permissão "distritos". O alcance:
//   - nível geral: vê todos os Distritos e registra os decretos da CLI (ativação e desativação), com a confirmação recente;
//   - Pastor Presidente em exercício (assento de Presidente na Diretoria Executiva): decreta e encerra a intervenção, com a confirmação recente;
//   - NIF (assento vigente no Conselho Fiscal): vê todos e analisa os balanços anuais;
//   - quem tem acesso de escopo de Distrito (Pastor Distrital, Interventor, Tesoureiro de Distrito): vê o dele e envia o balanço anual.
//
// ---- Leitura (GET /api/distritos/...) ----
//  catalogos               -> { gatilhos{}, motivos{}, medidas{}, statusBalanco{}, ufs[], limitePopulacao, papeis:{ geral, presidente, nif, distritos[] } }
//  painel                  -> { hoje, distritos[], total }
//  lista                   -> { distritos[] }
//  ficha?distritoId=       -> { distrito:{ ..., acoes } }
//  reunioes                -> { reunioes[] } as da CLI já realizadas e encerradas (só o nível geral)
//
// ---- Escrita (POST /api/distritos/...) ----
//  ativar       {distritoId, sessaoId, gatilho, cidade, uf, populacao?, fontePopulacao?, fundamentacao}   nível geral; confirmação recente (428)
//  desativar    {distritoId, sessaoId, motivo}                                                         nível geral; confirmação recente (428)
//  intervir     {distritoId, motivo, fundamentacao, interventorMembroId, bloqueioContas?, procuracao?, judicial?}   Presidente; 428
//  encerrar     {distritoId, resultado}                                                                Presidente; 428
//  balanco      {distritoId, ano, receitas, despesas, saldoFinal, observacoes?}                         escopo do Distrito
//  analisar     {balancoId, decisao:APROVAR|DEVOLVER, motivo?}                                         NIF
//
// Respostas: { sucesso:true, ... } · recusa de regra: 422 · 400 dado ruim · 403 sem permissão · 404 não achou.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const di = require("../shared/distritos");
const db = require("../shared/distritosDb");
const { UFS } = require("../shared/entidadesVinculadas");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, r) {
  context.res = { status: r.sucesso ? 200 : (r.proibido ? 403 : (r.naoExiste ? 404 : 422)), body: r };
}

// As ações de escrita, o identificador que cada uma exige e se pede a confirmação recente (chave do aparelho ou código por e-mail).
const ESCRITA = {
  ativar: { id: "distritoId", fator: true }, desativar: { id: "distritoId", fator: true },
  intervir: { id: "distritoId", fator: true }, encerrar: { id: "distritoId", fator: true },
  balanco: { id: "distritoId", fator: false }, analisar: { id: "balancoId", fator: false }
};

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  if (!auth.ehSessaoDeLideranca(usuario)) return erro(context, 403, SEM_PERMISSAO);
  const visao = auth.visaoDaPermissao(usuario, "distritos");
  if (!visao) return erro(context, 403, SEM_PERMISSAO);

  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};
  const hoje = hojeBrasilia();
  const por = usuario.membroId;

  const pool = await getPool();
  try {
    const alcance = await db.montarAlcance(pool, { membroId: por, geral: esc.ehGeral(visao), hoje });

    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = { status: 200, body: { sucesso: true, gatilhos: di.GATILHOS, motivos: di.MOTIVOS_INTERVENCAO, medidas: di.MEDIDAS, statusBalanco: di.STATUS_BALANCO,
          ufs: UFS, limitePopulacao: di.LIMITE_POPULACAO,
          papeis: { geral: alcance.geral, presidente: alcance.presidente, nif: alcance.nif, distritos: [...alcance.distritos] } } };
        return;
      }
      if (acao === "painel") { context.res = { status: 200, body: { sucesso: true, ...(await db.painel(pool, { alcance, hoje })) } }; return; }
      if (acao === "lista") { context.res = { status: 200, body: { sucesso: true, distritos: await db.listarDistritos(pool, { alcance, hoje }) } }; return; }
      if (acao === "ficha") {
        const distritoId = di.idDe(consulta.distritoId == null ? null : String(consulta.distritoId));
        if (!distritoId) return erro(context, 400, "Informe distritoId.");
        const distrito = await db.detalharDistrito(pool, { distritoId, alcance, hoje });
        if (!distrito) return erro(context, 404, "Distrito não encontrado.");
        context.res = { status: 200, body: { sucesso: true, distrito } };
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
    const def = Object.prototype.hasOwnProperty.call(ESCRITA, acao) ? ESCRITA[acao] : null;
    if (!def) return erro(context, 404, "Ação inválida.");
    // quem não pode fazer o ato é recusado antes de pedir a confirmação recente
    if ((acao === "ativar" || acao === "desativar") && !alcance.geral) return erro(context, 403, "O decreto da CLI é registrado pelo nível geral.");
    if ((acao === "intervir" || acao === "encerrar") && !alcance.presidente) return erro(context, 403, "Só o Pastor Presidente em exercício faz este ato (Regimento, Art. 126-L, I, e Art. 126-P, II).");
    if (def.fator && !auth.exigirFatorRecente(req, context)) return;
    const id = di.idDe(corpo[def.id]);
    if (!id) return erro(context, 400, `Informe ${def.id}.`);
    const base = { dados: corpo, por, hoje, alcance };
    let r;
    switch (acao) {
      case "ativar": r = await db.ativar(pool, { ...base, distritoId: id }); break;
      case "desativar": r = await db.desativar(pool, { ...base, distritoId: id }); break;
      case "intervir": r = await db.intervir(pool, { ...base, distritoId: id }); break;
      case "encerrar": r = await db.encerrarIntervencao(pool, { ...base, distritoId: id }); break;
      case "balanco": r = await db.enviarBalanco(pool, { ...base, distritoId: id }); break;
      case "analisar": r = await db.analisarBalanco(pool, { ...base, balancoId: id }); break;
      default: return erro(context, 404, "Ação inválida.");
    }
    resposta(context, r);
  } catch (e) {
    context.log.error("[GestaoDistritos]", e.message);
    erro(context, 500, "Erro interno ao processar o ato do Distrito.");
  }
};
