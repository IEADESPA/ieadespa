// GestaoEntidadesVinculadas (v9.1 — Entidades vinculadas: hospitais, escolas, ONGs e associações com CNPJ próprio)
// Estatuto Art. 64 a 68 (Capítulo XIII), Art. 18, VII, "b", e 19, Art. 33, IV, Art. 76 §2º; Regimento Art. 47-A e 153. Desenho em docs/plano/fase-9-entidades-vinculadas.md.
//
// A regra pura está em shared/entidadesVinculadas.js (testada); o banco em shared/entidadesVinculadasDb.js. Tudo é do âmbito GERAL: toda ação exige a sessão de
// liderança com a permissão "entidades_vinculadas" no nível geral (papel GLOBAL com escopo de todas as congregações). Decretar e encerrar a intervenção exigem, além
// disso, ser o Pastor Presidente em exercício (a cadeira de Presidente na Diretoria Executiva — Estatuto Art. 65 §2º). Sem a permissão: 403 antes de qualquer busca.
// Cada pedido começa marcando como "perdeu a eficácia" a intervenção decretada cujo prazo de 15 dias passou sem ratificação (Reg. Art. 47-A §2º).
//
// ---- Leitura (GET /api/entidades-vinculadas/...) -------------------------------------------------
//  catalogos   -> { naturezas[], funcoes[], motivosEncerramento[], motivosIntervencao[], periodicidades[], resultadosApreciacao[], resultadosCF[], resultadosAG[], destinos[],
//                   ufs[], prazos:{ ratificacaoDias, manifestacaoDias }, papeis:{ presidente } }
//  painel      -> { hoje, intervencoesCorrendo[], apuracoes[], prestacoesAtrasadas[], aguardandoApreciacao[], cfPendente[], propostas[], aguardandoAG[], indicacoes[],
//                   mandatosVencidos[], semGestor[] }
//  entidades?status=       -> { entidades[{ ...entidade, intervencao, atrasadas[], aguardandoApreciacao[], cfPendente[], indicadosAguardando, mandatosVencidos, pendenciaGestor }] }
//  entidade?entidadeId=    -> { entidade:{ ...entidade, formacoesExigidas[], dirigentes[], intervencoes[], periodos[], emIntervencao, pendencias[] } }
//  tipos?todos=1           -> { tipos[{ tipoId, nome, natureza, naturezaRotulo, ativo, entidades, formacoes[] }] }
//  reunioes?orgao=CLI|AG   -> { reunioes[{ sessaoId, data, descricao }] }  as já realizadas e encerradas (a CLI sem o Seminário e sem a que "não conta")
//
// ---- Escrita (POST /api/entidades-vinculadas/...) ------------------------------------------------
//  tipo                  {nome, natureza, formacoes[]}                          -> 201
//  tipo-editar           {tipoId, nome, natureza, formacoes[], ativo}
//  entidade              {razaoSocial, nomeFantasia?, cnpj, tipoId, finalidade, municipio?, uf?}   -> 201 (nasce PROPOSTA)
//  entidade-editar       {entidadeId, ...os mesmos (CNPJ e tipo só enquanto proposta)}
//  vinculo-aprovar       {entidadeId, sessaoId}           a CLI aprovou (Art. 64, par. único): ATIVA
//  vinculo-nao-aprovar   {entidadeId, motivo}
//  assembleia            {entidadeId, sessaoId, resultado:RATIFICADA|NAO_RATIFICADA, observacao?}   a criação ou a extinção (Art. 18, VII, "b")
//  prestacao-config      {entidadeId, periodicidade, prazoEntregaDias}
//  dirigente-indicar     {entidadeId, funcao, funcaoDescricao?, membroId?|nomeExterno?, formacao?, registroProfissional?, remunerado?, declaracaoParentesco?, indicacaoAto,
//                         indicadoEm, mandatoAte?}   -> 201
//  dirigente-homologar   {dirigenteId, sessaoId}
//  dirigente-recusar     {dirigenteId, sessaoId, observacao?}
//  dirigente-encerrar    {dirigenteId, motivo, data, observacao?}
//  apuracao-abrir        {entidadeId, motivo, fatos}      -> 201
//  apuracao-notificar    {intervencaoId, notificadoEm, forma}
//  apuracao-manifestacao {intervencaoId, manifestacaoEm, resumo}
//  apuracao-arquivar     {intervencaoId, motivo}
//  apuracao-reabrir      {intervencaoId}                  depois da caducidade ou da não ratificação -> 201
//  intervencao-decretar  {intervencaoId, fundamentacao, urgencia?, urgenciaJustificativa?, interventorMembroId?|interventorNome?, afastaDiretoria?}   (só o Pastor Presidente)
//  intervencao-ratificar {intervencaoId, sessaoId, resultado:RATIFICADA|NAO_RATIFICADA, observacao?}   (não quem decretou)
//  intervencao-defesa    {intervencaoId, defesaEm, referencia}
//  intervencao-encerrar  {intervencaoId, motivo}          (só o Pastor Presidente)
//  intervencao-assembleia {intervencaoId, sessaoId, resultado, observacao?}   a Assembleia sobre a destituição que a ratificação produziu (Art. 18, VII, "c")
// Decretar e encerrar a intervenção exigem, além disso, a confirmação recente de quem é (chave de acesso ou código por e-mail; 428 sem ela), como os atos da crise.
//  prestacao-registrar   {entidadeId, periodo, entregueEm, relatorioAtividades:true, balancoAuditado:true, auditoriaOrgao, observacao?}
//  prestacao-apreciar    {prestacaoId, sessaoId, resultado, observacao?}
//  prestacao-cf          {prestacaoId, verificadaEm, resultado:SEM_CONFUSAO|IRREGULARIDADE, observacao?}
//  extinguir             {entidadeId, sessaoId, destinoPatrimonio, destinatarioNome, destinatarioCnpj?, bensComodato?, matrizMantemAssistencia?}
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim · 403 sem permissão · 404 não achou.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const ev = require("../shared/entidadesVinculadas");
const db = require("../shared/entidadesVinculadasDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";
const lista = (obj) => Object.entries(obj).map(([codigo, rotulo]) => ({ codigo, rotulo }));

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, r, statusOk = 200) {
  context.res = { status: r.sucesso ? statusOk : (r.proibido ? 403 : (r.naoExiste ? 404 : 422)), body: r };
}

// As ações de escrita e o identificador que cada uma exige no corpo (validado antes de ir ao banco).
const ESCRITA = {
  "tipo": null, "tipo-editar": "tipoId", "entidade": null, "entidade-editar": "entidadeId", "vinculo-aprovar": "entidadeId", "vinculo-nao-aprovar": "entidadeId",
  "assembleia": "entidadeId", "prestacao-config": "entidadeId", "dirigente-indicar": "entidadeId", "dirigente-homologar": "dirigenteId", "dirigente-recusar": "dirigenteId",
  "dirigente-encerrar": "dirigenteId", "apuracao-abrir": "entidadeId", "apuracao-notificar": "intervencaoId", "apuracao-manifestacao": "intervencaoId",
  "apuracao-arquivar": "intervencaoId", "apuracao-reabrir": "intervencaoId", "intervencao-decretar": "intervencaoId", "intervencao-ratificar": "intervencaoId",
  "intervencao-defesa": "intervencaoId", "intervencao-encerrar": "intervencaoId", "intervencao-assembleia": "intervencaoId", "prestacao-registrar": "entidadeId", "prestacao-apreciar": "prestacaoId",
  "prestacao-cf": "prestacaoId", "extinguir": "entidadeId"
};
const CRIA = new Set(["tipo", "entidade", "dirigente-indicar", "apuracao-abrir", "apuracao-reabrir"]);

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  // Só a sessão de liderança (senha) com a permissão no nível geral. A de PIN ou de código é de membro e nunca vale aqui.
  const lideranca = auth.ehSessaoDeLideranca(usuario);
  const visao = lideranca ? auth.visaoDaPermissao(usuario, "entidades_vinculadas") : null;
  if (!visao || !esc.ehGeral(visao)) return erro(context, 403, SEM_PERMISSAO);

  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};
  const hoje = hojeBrasilia();
  const por = usuario.membroId;

  const pool = await getPool();
  try {
    // a caducidade automática (Reg. Art. 47-A §2º) antes de qualquer leitura ou escrita
    await db.caducarVencidas(pool, { hoje });

    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = {
          status: 200,
          body: {
            sucesso: true, naturezas: lista(ev.NATUREZAS), funcoes: lista(ev.FUNCOES),
            motivosEncerramento: ev.MOTIVOS_ENCERRAMENTO_MANUAL.map((c) => ({ codigo: c, rotulo: ev.MOTIVOS_ENCERRAMENTO[c] })),
            motivosIntervencao: lista(ev.MOTIVOS_INTERVENCAO), periodicidades: lista(ev.PERIODICIDADES), resultadosApreciacao: lista(ev.RESULTADOS_APRECIACAO),
            resultadosCF: lista(ev.RESULTADOS_CF), resultadosAG: lista(ev.RESULTADOS_AG),
            destinos: Object.entries(ev.DESTINOS).map(([codigo, d]) => ({ codigo, rotulo: d.rotulo, naturezas: d.naturezas })), ufs: ev.UFS,
            prazos: { ratificacaoDias: ev.PRAZO_RATIFICACAO_DIAS, manifestacaoDias: ev.PRAZO_MANIFESTACAO_DIAS },
            papeis: { presidente: await db.ehPresidente(pool, por) }
          }
        };
        return;
      }
      if (acao === "painel") { context.res = { status: 200, body: { sucesso: true, ...(await db.painel(pool, { hoje })) } }; return; }
      if (acao === "entidades") {
        const status = consulta.status == null || consulta.status === "" ? null : String(consulta.status).toUpperCase();
        if (status && !ev.STATUS_ENTIDADE[status]) return erro(context, 400, "status inválido.");
        context.res = { status: 200, body: { sucesso: true, entidades: await db.listarEntidades(pool, { hoje, status }) } };
        return;
      }
      if (acao === "entidade") {
        const entidadeId = ev.idDe(consulta.entidadeId == null ? null : String(consulta.entidadeId));
        if (!entidadeId) return erro(context, 400, "Informe entidadeId.");
        const entidade = await db.detalharEntidade(pool, { entidadeId, hoje, membroId: por });
        if (!entidade) return erro(context, 404, "Entidade não encontrada.");
        context.res = { status: 200, body: { sucesso: true, entidade } };
        return;
      }
      if (acao === "tipos") {
        context.res = { status: 200, body: { sucesso: true, tipos: await db.listarTipos(pool, { todos: consulta.todos === "1" || consulta.todos === "true" }) } };
        return;
      }
      if (acao === "reunioes") {
        const orgao = String(consulta.orgao || "").toUpperCase();
        if (orgao !== "CLI" && orgao !== "AG") return erro(context, 400, "orgao: CLI ou AG.");
        context.res = { status: 200, body: { sucesso: true, reunioes: await db.reunioesEncerradas(pool, orgao, hoje) } };
        return;
      }
      return erro(context, 404, "Ação inválida.");
    }

    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");
    if (!Object.prototype.hasOwnProperty.call(ESCRITA, acao)) return erro(context, 404, "Ação inválida.");
    // Trava 9-A — quem não é o Pastor Presidente é recusado ANTES de pedir a confirmação recente (antes passava pela confirmação e só depois recebia o 403);
    // e a confirmação recente vale também nos outros atos de efeito grave: a ratificação (que destitui a diretoria), a extinção (o destino do patrimônio) e a
    // aprovação do vínculo pela CLI — o mesmo critério dos decretos dos Distritos e da decisão da Expansão
    if (["intervencao-decretar", "intervencao-encerrar"].includes(acao) && !(await db.ehPresidente(pool, por))) {
      return erro(context, 403, "Só o Pastor Presidente em exercício decreta e encerra a intervenção (Estatuto, Art. 65 §2º).");
    }
    if (["intervencao-decretar", "intervencao-encerrar", "intervencao-ratificar", "extinguir", "vinculo-aprovar"].includes(acao) && !auth.exigirFatorRecente(req, context)) return;
    const campoId = ESCRITA[acao];
    const id = campoId ? ev.idDe(corpo[campoId]) : null;
    if (campoId && !id) return erro(context, 400, `Informe ${campoId}.`);
    const base = { dados: corpo, por, hoje };
    let r;
    switch (acao) {
      case "tipo": r = await db.criarTipo(pool, base); break;
      case "tipo-editar": r = await db.editarTipo(pool, { ...base, tipoId: id }); break;
      case "entidade": r = await db.criarEntidade(pool, base); break;
      case "entidade-editar": r = await db.editarEntidade(pool, { ...base, entidadeId: id }); break;
      case "vinculo-aprovar": r = await db.aprovarVinculo(pool, { entidadeId: id, sessaoId: corpo.sessaoId, por, hoje }); break;
      case "vinculo-nao-aprovar": r = await db.naoAprovar(pool, { ...base, entidadeId: id }); break;
      case "assembleia": r = await db.registrarAssembleia(pool, { ...base, entidadeId: id }); break;
      case "prestacao-config": r = await db.configurarPrestacao(pool, { ...base, entidadeId: id }); break;
      case "dirigente-indicar": r = await db.indicarDirigente(pool, { ...base, entidadeId: id }); break;
      case "dirigente-homologar": r = await db.homologarDirigente(pool, { dirigenteId: id, sessaoId: corpo.sessaoId, por, hoje }); break;
      case "dirigente-recusar": r = await db.recusarDirigente(pool, { ...base, dirigenteId: id }); break;
      case "dirigente-encerrar": r = await db.encerrarDirigente(pool, { ...base, dirigenteId: id }); break;
      case "apuracao-abrir": r = await db.abrirApuracao(pool, { ...base, entidadeId: id }); break;
      case "apuracao-notificar": r = await db.registrarNotificacao(pool, { ...base, intervencaoId: id }); break;
      case "apuracao-manifestacao": r = await db.registrarManifestacao(pool, { ...base, intervencaoId: id }); break;
      case "apuracao-arquivar": r = await db.arquivarApuracao(pool, { ...base, intervencaoId: id }); break;
      case "apuracao-reabrir": r = await db.reabrirApuracao(pool, { intervencaoId: id, por, hoje }); break;
      case "intervencao-decretar": r = await db.decretar(pool, { ...base, intervencaoId: id }); break;
      case "intervencao-ratificar": r = await db.ratificar(pool, { ...base, intervencaoId: id }); break;
      case "intervencao-defesa": r = await db.registrarDefesa(pool, { ...base, intervencaoId: id }); break;
      case "intervencao-encerrar": r = await db.encerrarIntervencao(pool, { ...base, intervencaoId: id }); break;
      case "intervencao-assembleia": r = await db.registrarAssembleiaDestituicao(pool, { ...base, intervencaoId: id }); break;
      case "prestacao-registrar": r = await db.registrarPrestacao(pool, { ...base, entidadeId: id }); break;
      case "prestacao-apreciar": r = await db.apreciarPrestacao(pool, { ...base, prestacaoId: id }); break;
      case "prestacao-cf": r = await db.verificacaoConselhoFiscal(pool, { ...base, prestacaoId: id }); break;
      case "extinguir": r = await db.extinguir(pool, { ...base, entidadeId: id }); break;
      default: return erro(context, 404, "Ação inválida.");
    }
    resposta(context, r, CRIA.has(acao) ? 201 : 200);
  } catch (e) {
    context.log.error("[GestaoEntidadesVinculadas]", e.message);
    erro(context, 500, "Erro interno ao processar a entidade vinculada.");
  }
};
