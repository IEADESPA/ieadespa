// GestaoSetoresTecnicos (v7.6 — Setores Técnicos, voluntariado profissional)
// Regimento Art. 48 a 52 (os 20 Setores, o Termo de Adesão e o poder de polícia técnica); Lei 9.608/1998.
//
// Toda a regra está em shared/setoresTecnicos.js (pura, testada); o banco, em shared/setoresTecnicosDb.js. Os setores são do âmbito GERAL: as ações de
// administração exigem a permissão E o nível geral (papel GLOBAL com escopo de todas as congregações).
//
// Permissões (as três são novas e vêm só para a Diretoria Executiva — Presidente e Secretário Geral —, migração 142):
//   "setores_tecnicos"     catálogo, vínculos, aprovação de candidaturas, Termo (ficha/mensagem) e a visão de todos os atos cautelares;
//   "setores_ratificacao"  a Diretoria Executiva: ratificar ou revogar as interdições e os pedidos de remoção, e levantar uma interdição.
// Sem permissão nenhuma, qualquer pessoa logada (inclusive por PIN), sobre si mesma: se candidatar, aceitar o Termo, sair, e — se serve ATIVO num setor com o
// poder — emitir interdição (Engenharia, Segurança) ou pedido de remoção de postagem (Comunicação). O LÍDER (sessão de liderança) vê e atende os atos da sua congregação.
//
// ---- Leitura (GET /api/setores-tecnicos/...) -----------------------------------------------------
//  catalogos          -> { statusVinculo[], motivosEncerramento[], tiposAto[], motivosInterdicao[], motivosRemocao[], statusAto[], formasRegistroManual[], canaisMensageria[],
//                          aceite, regras:{ maxAtosAbertos, maxAtosPorDia }, papeis:{ gestao, diretoria, lider } }                                      (login)
//  setores            -> { setores[{setorId,codigo,inciso,nome,competencia,profissoes,conselhoClasse,exigeRegistro,podeInterditar,podeSolicitarRemocao,ativo,ordem,
//                          profissionais,emAnalise,instalado,situacao}] }   o catálogo com QUANTOS servem (nunca quem); a gestão vê também os desativados            (login)
//  meu-painel         -> { condicao:{pode,mensagem?}, vinculos[{...vinculo, termoParaAceitar?}], setoresParaCandidatura[], poderes:{interdicao[],remocao[]}, atos[] }   (login)
//  termo?vinculoId=   -> { vinculo, termo:{versao,titulo,setor,itens[{codigo,base,texto}],aceite,hash,especificos[]} }   o dono do vínculo ou a gestão          (login)
//  vinculos?setorId=&status=                                -> { vinculos[{vinculoId,setorNome,membroId,membroNome,status,formacao,registro,termo|null,...}] }   (setores_tecnicos, geral)
//  atos?tipo=&status=&abertos=1&congregacaoId=              -> { atos[{intervencaoId,tipo,status,...,acoes[]}] }                    (setores_tecnicos ou setores_ratificacao, geral)
//  atos-da-congregacao?congregacaoId=                       -> { atos[...] } os atos da congregação, para o líder cujo escopo a alcança                          (sessão de liderança)
//  ato?intervencaoId=                                       -> { ato }  quem emitiu, a gestão, a Diretoria ou o líder da congregação; os outros recebem 404           (login)
//  canais?congregacaoId=                                    -> { canais[{canalId,nome,plataforma,identificador}] } onde está a postagem  (quem serve com poder de remoção, ou a gestão/Diretoria)
//
// ---- Escrita (POST /api/setores-tecnicos/...) ----------------------------------------------------
//  setor              body:{nome, competencia, profissoes?, conselhoClasse?, inciso?, exigeRegistro?, podeInterditar?, podeSolicitarRemocao?, ordem?}   (setores_tecnicos, geral) -> 201
//  setor-editar       body:{setorId, ...mesmos campos}                                                                                                   (setores_tecnicos, geral)
//  setor-ativo        body:{setorId, ativo:true|false}                                                                                                   (setores_tecnicos, geral)
//  candidatar         body:{setorId, formacao, conselhoSigla?, registroNumero?}          a própria pessoa se candidata                                    (login) -> 201
//  indicar            body:{membroId, setorId, formacao, conselhoSigla?, registroNumero?} a administração indica; o vínculo espera o Termo                  (setores_tecnicos, geral) -> 201
//  aprovar            body:{vinculoId}                                                    CANDIDATO -> AGUARDANDO_TERMO (ninguém aprova a própria)         (setores_tecnicos, geral)
//  recusar            body:{vinculoId, observacao?}                                                                                                      (setores_tecnicos, geral)
//  encerrar           body:{vinculoId, tipoMotivo:SAIDA_PROPRIA|DESLIGAMENTO|MUDANCA|OUTRO, observacao?}                                                 (setores_tecnicos, geral)
//  sair               body:{vinculoId}                                                    a pessoa sai quando quiser (Art. 133 §7º)                        (login)
//  aceitar-termo      body:{vinculoId, aceito:true} -> o aceite digital: versão, hash do texto, IP, data e hora. Sem IP identificável, recusa.            (login, o dono do vínculo)
//  registrar-termo    body:{vinculoId, forma:FICHA_FISICA|MENSAGERIA, dataAceite, referencia, canal?:EMAIL|WHATSAPP}                                     (setores_tecnicos, geral)
//  interdicao         body:{setorId?, congregacaoId, motivo:RISCO_DESABAMENTO|FALHA_ELETRICA_GRAVE, objeto, descricao, referencia?} -> 201                 (login; serve ATIVO em setor que interdita)
//  pedido-remocao     body:{setorId?, congregacaoId, canalId?, motivo:ERRO_GROSSEIRO|DIREITO_AUTORAL|DOUTRINA_IMAGEM, objeto?, referencia:<link>, descricao} -> 201   (login; serve ATIVO em setor que pede remoção)
//  decidir            body:{intervencaoId, decisao:RATIFICAR|REVOGAR, observacao?}  (revogar exige motivo; quem emitiu não decide)                         (setores_ratificacao, geral)
//  levantar           body:{intervencaoId, observacao}   interdição: o risco foi sanado                                                                  (quem emitiu, enquanto serve no setor; ou a Diretoria)
//  atender            body:{intervencaoId, observacao?}  pedido de remoção: a postagem saiu                                                              (quem cuida da rede, o líder da congregação, a gestão ou a Diretoria — não quem emitiu)
//  cancelar           body:{intervencaoId, observacao}   pedido de remoção: quem emitiu desiste                                                          (quem emitiu)
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim · 403 sem permissão · 404 não achou.
// Quem não tem a permissão recebe 403 ANTES de qualquer busca; quem não tem relação com um ato recebe 404, igual a "não existe".
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const vol = require("../shared/voluntariado");
const st = require("../shared/setoresTecnicos");
const db = require("../shared/setoresTecnicosDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";
const ATO_NAO_ACHADO = "Ato não encontrado.";

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  context.res = { status: resultado.sucesso ? statusOk : (resultado.proibido ? 403 : 422), body: resultado };
}
const lista = (obj) => Object.entries(obj).map(([codigo, rotulo]) => ({ codigo, rotulo }));
const idDe = vol.inteiroPositivo;        // estrito: "0x10", "1e1", true e [5] não são identificadores

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  // A visão da sessão SÓ com as concessões daquela permissão, e só se uma delas é do nível geral (papel GLOBAL com escopo de todas as congregações).
  // Sessão de PIN ou de código é de MEMBRO (serve para os dados da própria pessoa) e nunca vale como liderança, mesmo que a pessoa também tenha cargo.
  const lideranca = auth.ehSessaoDeLideranca(usuario);
  const soGeral = (visao) => (lideranca && visao && esc.ehGeral(visao) ? visao : null);
  const gestao = soGeral(auth.visaoDaPermissao(usuario, "setores_tecnicos"));
  const diretoria = soGeral(auth.visaoDaPermissao(usuario, "setores_ratificacao"));
  // O líder: sessão de liderança (senha), de nível territorial (o líder geral de departamento não cuida de prédio nem de rede); vale a congregação do escopo dele.
  const visaoLider = lideranca ? auth.restringirVisao(usuario, (c) => !!c.nivel && c.nivel !== "DEPARTAMENTO") : null;
  const lider = (nomeDaCongregacao) => !!visaoLider && auth.estaNoEscopo(visaoLider, nomeDaCongregacao);

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};
  const hoje = hojeBrasilia();
  const acessoDe = () => db.contextoDeAcesso(pool, { membroId: usuario.membroId, diretoria: !!diretoria, gestao: !!gestao, lider });

  // Quem tem relação com o ato o vê: quem emitiu, a gestão, a Diretoria, o líder da congregação e quem administra a rede do pedido. Os outros recebem 404.
  const veAto = (ato, acesso) => Number(ato.emitidaPorMembroId) === Number(usuario.membroId) || !!gestao || !!diretoria || lider(ato.congregacaoNome)
    || (ato.canalId != null && acesso.canaisAdministrados.has(Number(ato.canalId)));

  const EXIGE_GESTAO = ["vinculos", "setor", "setor-editar", "setor-ativo", "indicar", "aprovar", "recusar", "encerrar", "registrar-termo"];
  const EXIGE_DIRETORIA = ["decidir"];

  try {
    if (EXIGE_GESTAO.includes(acao) && !gestao) return erro(context, 403, SEM_PERMISSAO);
    if (EXIGE_DIRETORIA.includes(acao) && !diretoria) return erro(context, 403, SEM_PERMISSAO);

    // =============================== Leitura ===============================
    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = {
          status: 200,
          body: {
            sucesso: true,
            statusVinculo: lista(st.STATUS_VINCULO), motivosEncerramento: lista(st.MOTIVOS_ENCERRAMENTO).filter(m => m.codigo !== "RECUSADO"), tiposAto: lista(st.TIPOS_ATO),
            motivosInterdicao: lista(st.MOTIVOS_INTERDICAO), motivosRemocao: lista(st.MOTIVOS_REMOCAO), statusAto: lista(st.STATUS_ATO),
            formasRegistroManual: vol.FORMAS_REGISTRO_MANUAL.map(c => ({ codigo: c, rotulo: vol.FORMAS_ADESAO[c] })), canaisMensageria: lista(vol.CANAIS_MENSAGERIA),
            aceite: st.TERMO_SETOR_ACEITE, regras: { maxAtosAbertos: st.MAX_ATOS_ABERTOS_POR_EMITENTE, maxAtosPorDia: st.MAX_ATOS_POR_DIA },
            papeis: { gestao: !!gestao, diretoria: !!diretoria, lider: !!visaoLider }
          }
        };
        return;
      }

      if (acao === "setores") {
        context.res = { status: 200, body: { sucesso: true, setores: await db.listarCatalogo(pool, { todos: !!gestao }) } };
        return;
      }

      if (acao === "meu-painel") {
        context.res = { status: 200, body: { sucesso: true, ...(await db.meuPainel(pool, { membroId: usuario.membroId, hoje })) } };
        return;
      }

      if (acao === "termo") {
        const vinculoId = idDe(consulta.vinculoId);
        if (!vinculoId) return erro(context, 400, "Informe vinculoId.");
        const r = await db.termoDoVinculo(pool, { vinculoId, membroId: usuario.membroId, gestao: !!gestao });
        context.res = { status: r.sucesso ? 200 : 404, body: r };
        return;
      }

      if (acao === "vinculos") {
        const setorId = consulta.setorId == null || consulta.setorId === "" ? null : idDe(consulta.setorId);
        if (consulta.setorId != null && consulta.setorId !== "" && !setorId) return erro(context, 400, "setorId inválido.");
        const status = consulta.status == null || consulta.status === "" ? null : String(consulta.status).toUpperCase();
        if (status && !st.STATUS_VINCULO[status]) return erro(context, 400, "status inválido.");
        context.res = { status: 200, body: { sucesso: true, vinculos: await db.listarVinculos(pool, { setorId, status }) } };
        return;
      }

      if (acao === "atos") {
        if (!gestao && !diretoria) return erro(context, 403, SEM_PERMISSAO);
        const tipo = consulta.tipo == null || consulta.tipo === "" ? null : String(consulta.tipo).toUpperCase();
        if (tipo && !st.TIPOS_ATO[tipo]) return erro(context, 400, "tipo inválido.");
        const status = consulta.status == null || consulta.status === "" ? null : String(consulta.status).toUpperCase();
        if (status && !st.STATUS_ATO[status]) return erro(context, 400, "status inválido.");
        let congregacaoNomes = null;
        if (consulta.congregacaoId != null && consulta.congregacaoId !== "") {
          const id = idDe(consulta.congregacaoId);
          if (!id) return erro(context, 400, "congregacaoId inválido.");
          const nome = await congregacaoNome(pool, id);
          congregacaoNomes = nome ? [nome] : [];
        }
        const acesso = await acessoDe();
        context.res = { status: 200, body: { sucesso: true, atos: await db.listarAtos(pool, { tipo, status, abertos: consulta.abertos === "1" || consulta.abertos === "true", congregacaoNomes, acesso }) } };
        return;
      }

      if (acao === "atos-da-congregacao") {
        const congregacaoId = idDe(consulta.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        // Fora do escopo (ou congregação que não existe) responde igual: a rota não serve de sonda.
        const nome = await congregacaoNome(pool, congregacaoId);
        if (!visaoLider || !nome || !lider(nome)) return erro(context, 403, "Esta consulta é dos líderes da congregação.");
        const acesso = await acessoDe();
        context.res = { status: 200, body: { sucesso: true, atos: await db.listarAtos(pool, { congregacaoNomes: [nome], acesso }) } };
        return;
      }

      if (acao === "ato") {
        const intervencaoId = idDe(consulta.intervencaoId);
        if (!intervencaoId) return erro(context, 400, "Informe intervencaoId.");
        const acesso = await acessoDe();
        const ato = await db.detalharAto(pool, { intervencaoId, acesso });
        if (!ato || !veAto(ato, acesso)) return erro(context, 404, ATO_NAO_ACHADO);
        context.res = { status: 200, body: { sucesso: true, ato } };
        return;
      }

      if (acao === "canais") {
        const congregacaoId = idDe(consulta.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        if (!gestao && !diretoria && (await db.vinculosQueEmitem(pool, { membroId: usuario.membroId, tipo: "REMOCAO_POSTAGEM" })).length === 0) return erro(context, 403, SEM_PERMISSAO);
        context.res = { status: 200, body: { sucesso: true, canais: await db.canaisDaCongregacao(pool, congregacaoId) } };
        return;
      }

      return erro(context, 404, "Ação inválida.");
    }

    // =============================== Escrita ===============================
    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");

    // ---- catálogo (gestão) ----
    if (acao === "setor") { resposta(context, await db.criarSetor(pool, { dados: corpo, por: usuario.membroId }), 201); return; }
    if (acao === "setor-editar" || acao === "setor-ativo") {
      const setorId = idDe(corpo.setorId);
      if (!setorId) return erro(context, 400, "Informe setorId.");
      if (acao === "setor-ativo") {
        if (typeof corpo.ativo !== "boolean") return erro(context, 400, "Informe ativo (true/false).");
        resposta(context, await db.alterarAtivoSetor(pool, { setorId, ativo: corpo.ativo, por: usuario.membroId }));
      } else resposta(context, await db.editarSetor(pool, { setorId, dados: corpo, por: usuario.membroId }));
      return;
    }

    // ---- vínculo ----
    if (acao === "candidatar") { resposta(context, await db.candidatar(pool, { membroId: usuario.membroId, dados: corpo, hoje }), 201); return; }
    if (acao === "indicar") { resposta(context, await db.indicar(pool, { dados: corpo, por: usuario.membroId, hoje }), 201); return; }
    if (["aprovar", "recusar", "encerrar", "sair", "aceitar-termo", "registrar-termo"].includes(acao)) {
      const vinculoId = idDe(corpo.vinculoId);
      if (!vinculoId) return erro(context, 400, "Informe vinculoId.");
      if (acao === "aprovar") resposta(context, await db.aprovar(pool, { vinculoId, por: usuario.membroId }));
      else if (acao === "recusar") resposta(context, await db.recusarCandidatura(pool, { vinculoId, observacao: corpo.observacao, por: usuario.membroId }));
      else if (acao === "encerrar") resposta(context, await db.encerrarVinculo(pool, { vinculoId, dados: corpo, por: usuario.membroId }));
      else if (acao === "sair") resposta(context, await db.sairDoSetor(pool, { vinculoId, membroId: usuario.membroId }));
      else if (acao === "aceitar-termo") {
        resposta(context, await db.aceitarTermo(pool, { vinculoId, membroId: usuario.membroId, aceito: corpo.aceito, ip: vol.extrairIp(req.headers), cadeia: vol.cadeiaDeCabecalhos(req.headers), hoje }), 201);
      } else resposta(context, await db.registrarTermoManual(pool, { vinculoId, dados: corpo, por: usuario.membroId, hoje }), 201);
      return;
    }

    // ---- atos cautelares ----
    if (acao === "interdicao") { resposta(context, await db.emitirInterdicao(pool, { membroId: usuario.membroId, dados: corpo, hoje }), 201); return; }
    if (acao === "pedido-remocao") { resposta(context, await db.emitirPedidoRemocao(pool, { membroId: usuario.membroId, dados: corpo, hoje }), 201); return; }

    if (["decidir", "levantar", "atender", "cancelar"].includes(acao)) {
      const intervencaoId = idDe(corpo.intervencaoId);
      if (!intervencaoId) return erro(context, 400, "Informe intervencaoId.");
      const acesso = await acessoDe();
      // 404 igual para o que não existe e para o que a pessoa não tem relação alguma (a decisão da Diretoria já passou pelo 403 acima).
      const ato = await db.detalharAto(pool, { intervencaoId, acesso });
      if (!ato || !veAto(ato, acesso)) return erro(context, 404, ATO_NAO_ACHADO);
      if (acao === "decidir") resposta(context, await db.decidirAto(pool, { intervencaoId, dados: corpo, por: usuario.membroId, acesso, hoje }));
      else resposta(context, await db.fecharAto(pool, { intervencaoId, acao: acao.toUpperCase(), dados: corpo, por: usuario.membroId, acesso, hoje }));
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoSetoresTecnicos] erro:", e);
    erro(context, 500, "Erro interno ao processar os Setores Técnicos.");
  }
};

async function congregacaoNome(pool, congregacaoId) {
  const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  return r.recordset[0] ? r.recordset[0].Nome : null;
}
