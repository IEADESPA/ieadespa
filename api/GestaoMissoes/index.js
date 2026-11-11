// GestaoMissoes (v9.4 — Missões: campos, missionários e prestação de contas)
// Regimento Art. 23 e 24 §2º, Art. 43 e 44, Art. 126-N, I, Art. 133-C §2º e Art. 134 §6º, I. Desenho em docs/plano/fase-9-entidades-vinculadas.md.
//
// A regra pura está em shared/missoes.js (testada); o banco em shared/missoesDb.js. Só a sessão de liderança (senha) com a permissão "missoes" — ou quem compõe a
// CME (calculada: o Secretário de Missões e os Pastores de Área). O alcance vem do banco, nunca do bilhete:
//   - nível geral (papel Global com "missoes"): tudo, e registra a decisão da CLI;
//   - SEMIADESPA (o Secretário de Missões ou o Líder Geral dela): os campos, os pedidos de envio, os relatórios de campo e o encerramento;
//   - CME: vê e dá o parecer sobre o envio (nunca o de quem pediu);
//   - Pastor Presidente em exercício (assento de Presidente na Diretoria Executiva): concorda ou recusa e reajusta o sustento, com a confirmação recente;
//   - Tesouraria Geral (permissão "financeiro" do nível geral, mesmo sem "missoes"): vê a prévia e gera o sustento do mês, com a confirmação recente — e nada mais
//     (revisão de 05/11/2026: quem paga não lança o relatório que levanta a suspensão nem registra a decisão da CLI).
//
// ---- Leitura (GET /api/missoes/...) ----
//  catalogos            -> { abrangencias[], divulgacoes[], periodicidades[], fontes[], status[], pareceres[], resultados[], resultadosPresidente[], ufs[], congregacoes[],
//                            fornecedores[], campos[], papeis:{ geral, semiadespa, cme, presidente, tesouraria } }
//  painel               -> { hoje, ano, totais{}, porAbrangencia[], parecerVencido[], emParecer[], aguardandoCLI[], aguardandoPresidente[], relatoriosAtrasados[], suspensos[], pagosSemRelatorio[] }
//  campos?todos=1       -> { campos[] }
//  envios?status=       -> { envios[] }
//  envio?envioId=       -> { envio:{ ..., valores[], geracoes[], periodos[], relatorios[], acoes } }
//  sustento?mes=AAAA-MM -> { mes, linhas[], totais{}, podeGerar }
//  mural                -> { ano, campos[], camposRestritos, missionariosRestritos, totais{} }
//  reunioes             -> { reunioes[] } as da CLI já realizadas e encerradas (o nível geral e o Presidente)
//
// ---- Escrita (POST /api/missoes/...) ----
//  campo              {nome, pais?, uf?, cidade?, zonaRural?, congregacaoMantenedoraId?, divulgacao?, descricao?}          SEMIADESPA ou nível geral
//  campo-editar       {campoId, versao, ...}                                                                                SEMIADESPA ou nível geral
//  campo-encerrar     {campoId, motivo}                                                                                      SEMIADESPA ou nível geral
//  envio              {campoId, membroId, sustento, fonte?, congregacaoFonteId?, fornecedorId?, documentoBase64?, documentoMime?, periodicidade, divulgarNome?, justificativa}
//  parecer            {envioId, parecer, fundamentacao}                                                                      CME
//  decidir            {envioId, resultado, sessaoId, urgencia?, motivo?}                                                     nível geral; confirmação recente (428)
//  presidente         {envioId, resultado:CONCORDA|RECUSA, motivo?}                                                          Presidente; confirmação recente (428)
//  desistir           {envioId, motivo}                                                                                      quem pediu ou o nível geral
//  encerrar           {envioId, motivo, ultimoMes}                                                                           SEMIADESPA ou nível geral
//  reajustar          {envioId, desdeMes, sustento, fonte?, congregacaoFonteId?, fornecedorId?, motivo, sessaoId? (CLI do aumento), documentoBase64?, documentoMime?}   Presidente; 428
//  relatorio          {envioId, periodoInicio, batismos, conversoes, discipulado, atividades, pedidos?, anexoBase64?, anexoMime?}            SEMIADESPA ou nível geral
//  divulgacao         {envioId, divulgarNome:true|false}                                                                     SEMIADESPA ou nível geral (LGPD Art. 8º §5º)
//  relatorio-corrigir {relatorioId, batismos, conversoes, discipulado, atividades, pedidos?, anexoBase64?, anexoMime?}                     SEMIADESPA ou nível geral
//  gerar              {mesReferencia}                                                                                        Tesouraria Geral; 428
//
// Respostas: { sucesso:true, ... } · recusa de regra: 422 · 400 dado ruim · 403 sem permissão · 404 não achou.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const mi = require("../shared/missoes");
const db = require("../shared/missoesDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";
const SEM_ALCANCE = "Missões é da SEMIADESPA, da CME, do Pastor Presidente e do nível geral.";
// o que a Tesouraria Geral sem outro papel em Missões pode pedir
const SO_TESOURARIA = new Set(["GET catalogos", "GET sustento", "POST gerar"]);

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, r) {
  context.res = { status: r.sucesso ? 200 : (r.proibido ? 403 : (r.naoExiste ? 404 : 422)), body: r };
}

// As ações de escrita, o identificador que cada uma exige (null = nenhum) e se pede a confirmação recente (chave do aparelho ou código por e-mail).
const ESCRITA = {
  campo: { id: null }, "campo-editar": { id: "campoId" }, "campo-encerrar": { id: "campoId" },
  // Trava 9-B: a decisão da CLI pede a confirmação recente, como na Expansão (v9.2) e nas Entidades (v9.1) — um envio pode ficar ativo só com ela
  envio: { id: null }, parecer: { id: "envioId" }, decidir: { id: "envioId", fator: true }, presidente: { id: "envioId", fator: true }, desistir: { id: "envioId" },
  encerrar: { id: "envioId" }, divulgacao: { id: "envioId" }, reajustar: { id: "envioId", fator: true }, relatorio: { id: "envioId" }, "relatorio-corrigir": { id: "relatorioId" },
  gerar: { id: null, fator: true }
};

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  if (!auth.ehSessaoDeLideranca(usuario)) return erro(context, 403, SEM_PERMISSAO);
  const visao = auth.visaoDaPermissao(usuario, "missoes");
  const visaoFinanceiro = auth.visaoDaPermissao(usuario, "financeiro");

  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};
  const hoje = hojeBrasilia();
  const por = usuario.membroId;

  const pool = await getPool();
  try {
    const alcance = await db.montarAlcance(pool, { membroId: por, geral: !!visao && esc.ehGeral(visao), tesouraria: !!visaoFinanceiro && esc.ehGeral(visaoFinanceiro), permissao: !!visao, hoje });
    // a permissão "missoes", compor a CME (como na Expansão) ou ser a Tesouraria Geral; e, com a permissão, ser de quem cuida de Missões
    if (!visao && !alcance.cme && !alcance.tesouraria) return erro(context, 403, SEM_PERMISSAO);
    if (!db.veMissoes(alcance)) {
      if (!alcance.tesouraria) return erro(context, 403, SEM_ALCANCE);
      if (!SO_TESOURARIA.has(`${metodo} ${acao}`)) return erro(context, 403, "A Tesouraria Geral vê aqui só a prévia e a geração do sustento do mês.");
    }

    if (metodo === "GET") {
      if (acao === "catalogos") { context.res = { status: 200, body: { sucesso: true, ...(await db.catalogos(pool, { alcance })) } }; return; }
      if (acao === "painel") { context.res = { status: 200, body: { sucesso: true, ...(await db.painel(pool, { alcance, hoje })) } }; return; }
      if (acao === "campos") {
        context.res = { status: 200, body: { sucesso: true, campos: await db.listarCampos(pool, { alcance, todos: consulta.todos === "1" || consulta.todos === "true" }) } };
        return;
      }
      if (acao === "envios") {
        const status = typeof consulta.status === "string" && mi.STATUS_ENVIO[consulta.status] ? consulta.status : null;
        context.res = { status: 200, body: { sucesso: true, envios: await db.listarEnvios(pool, { alcance, hoje, status, membroId: por }) } };
        return;
      }
      if (acao === "envio") {
        const envioId = mi.idDe(consulta.envioId == null ? null : String(consulta.envioId));
        if (!envioId) return erro(context, 400, "Informe envioId.");
        const envio = await db.detalharEnvio(pool, { envioId, alcance, hoje, membroId: por });
        if (!envio) return erro(context, 404, "Envio não encontrado.");
        context.res = { status: 200, body: { sucesso: true, envio } };
        return;
      }
      if (acao === "sustento") {
        const r = await db.previaSustento(pool, { mes: typeof consulta.mes === "string" && consulta.mes ? consulta.mes : mi.mesDe(hoje), hoje, alcance });
        resposta(context, r);
        return;
      }
      if (acao === "mural") { context.res = { status: 200, body: { sucesso: true, ...(await db.mural(pool, { hoje })) } }; return; }
      if (acao === "reunioes") {
        // Trava 9-B: o Presidente também (o aumento do sustento cita a reunião da CLI que o aprovou)
        if (!alcance.geral && !alcance.presidente) return erro(context, 403, esc.MSG_GERAL);
        context.res = { status: 200, body: { sucesso: true, reunioes: await db.reunioesEncerradas(pool, "CLI", hoje) } };
        return;
      }
      return erro(context, 404, "Ação inválida.");
    }

    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");
    const def = Object.prototype.hasOwnProperty.call(ESCRITA, acao) ? ESCRITA[acao] : null;
    if (!def) return erro(context, 404, "Ação inválida.");
    // quem não pode fazer o ato é recusado ANTES de pedir a confirmação recente (Trava 9-A)
    if ((acao === "presidente" || acao === "reajustar") && !alcance.presidente) return erro(context, 403, "Só o Pastor Presidente em exercício faz este ato (Regimento, Art. 44 §2º e Art. 134 §6º, I).");
    if (acao === "gerar" && !alcance.tesouraria) return erro(context, 403, "O sustento do mês é gerado pela Tesouraria Geral (a permissão \"financeiro\" do nível geral).");
    if (def.fator && !auth.exigirFatorRecente(req, context)) return;
    let id = null;
    if (def.id) {
      id = mi.idDe(corpo[def.id]);
      if (!id) return erro(context, 400, `Informe ${def.id}.`);
    }
    const base = { dados: corpo, por, hoje, alcance };
    let r;
    switch (acao) {
      case "campo": r = await db.criarCampo(pool, base); break;
      case "campo-editar": r = await db.editarCampo(pool, { ...base, campoId: id }); break;
      case "campo-encerrar": r = await db.encerrarCampo(pool, { ...base, campoId: id }); break;
      case "envio": r = await db.criarEnvio(pool, base); break;
      case "parecer": r = await db.emitirParecer(pool, { ...base, envioId: id }); break;
      case "decidir": r = await db.decidir(pool, { ...base, envioId: id }); break;
      case "presidente": r = await db.decidirPresidente(pool, { ...base, envioId: id }); break;
      case "desistir": r = await db.desistir(pool, { ...base, envioId: id }); break;
      case "encerrar": r = await db.encerrarEnvio(pool, { ...base, envioId: id }); break;
      case "divulgacao": r = await db.alterarDivulgacao(pool, { ...base, envioId: id }); break;
      case "reajustar": r = await db.reajustar(pool, { ...base, envioId: id }); break;
      case "relatorio": r = await db.registrarRelatorio(pool, { ...base, envioId: id }); break;
      case "relatorio-corrigir": r = await db.retificarRelatorio(pool, { ...base, relatorioId: id }); break;
      case "gerar": r = await db.gerarSustento(pool, base); break;
      default: return erro(context, 404, "Ação inválida.");
    }
    resposta(context, r);
  } catch (e) {
    context.log.error("[GestaoMissoes]", e.message);
    erro(context, 500, "Erro interno ao processar o ato de Missões.");
  }
};
