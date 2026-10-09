// GestaoMinisterioMenores (v7.7 — Habilitação para Ministério com Menores)
// Lei 14.811/2024 (art. 59-A do ECA); Regimento Art. 133 §5º (vistoria e dever de auto-denúncia); LGPD art. 14.
//
// Toda a regra está em shared/ministerioMenores.js (pura, testada); o banco, em shared/ministerioMenoresDb.js. A decisão "esta pessoa pode servir com menores HOJE?" é
// calculada na leitura (esteira da v5.7 + certidões do Termo de Vistoria da v7.6 + treinamento + ficha + política + 6 meses...) e vale em todas as escalas, convites,
// trocas e rodízios das equipes marcadas com contato com menores. As rotas de escala vivem em GestaoEscalas (publicar confere os dois adultos e a proporção;
// `criancas-previstas`), a marca da equipe em GestaoHabilitacaoVoluntarios e o consentimento do responsável em GestaoConsentimentoMenor.
//
// ---- Da própria pessoa (qualquer login, inclusive PIN) ----------------------------------------------------------------------------------------------
//  GET  catalogos            -> { faixas[{codigo,rotulo,criancasPorAdultoPadrao}], rotulosBloqueio{}, alertasDias[], tiposAutoDenuncia[], decisoesAutoDenuncia[], papeis:{gestao,geral,diretoria} }
//  GET  minha-situacao       -> { situacao:{ apto, contaComoAdulto, bloqueios[{codigo,mensagem}], validades{}, proximoVencimento, equipes[], habilitacaoAberta, politica, autoDenuncia } }
//  GET  politica             -> { politica:{versao,titulo,itens[{codigo,texto}],aceite,hash}, aceita }
//  POST aceitar-politica     body:{aceito:true, textoHash}     o aceite digital (versão, hash do texto mostrado, IP, instante); 422 com politicaMudou:true se o texto mudou
//  POST confirmar-ficha      body:{confirmo:true}              confirma que os dados cadastrais estão atualizados (vale 6 meses)
//  POST auto-denuncia        body:{tipo:INQUERITO_POLICIAL|PROCESSO_CRIMINAL|OUTRO_PROCEDIMENTO, dataCiencia:'AAAA-MM-DD', ciente:true}   Reg. Art. 133 §5º, V; só tipo e data
// ---- Gestão da congregação (permissão habilitacao_voluntarios, no escopo) ---------------------------------------------------------------------------
//  GET  painel?congregacaoId=  -> { resumo, porCongregacao[], voluntarios[{membroId,nome,congregacaoNome,equipes[],status:APTO|VENCENDO|BLOQUEADO,bloqueios[],proximoVencimento,validades}] }
//  GET  painel-geral           -> o mesmo, do campo inteiro (só o nível geral: a Secretaria Geral)
//  POST equipe-faixa           body:{equipeId, faixa|null}   a faixa etária da equipe (proporção adulto/criança)
//  POST registrar-politica     body:{membroId, referencia}   aceite da política em ficha assinada (quem registra não é quem aceita)
//  POST confirmar-ficha-pessoa body:{membroId, confirmo:true} a Secretaria confirma a ficha de um voluntário depois de conferir os dados
// ---- Diretoria Executiva e Conselho de Ética (permissão vistoria_antecedentes, nível geral, sessão de liderança) -------------------------------------
//  GET  auto-denuncias?abertas=1                        -> { autoDenuncias[{autoDenunciaId,nome,tipo,situacao:AGUARDANDO_DECISAO|MANTIDO|AFASTADO|LIBERADO,...}] }
//  POST auto-denuncia-decidir  body:{autoDenunciaId, decisao:MANTIDO|AFASTADO_PREVENTIVAMENTE, observacao}   pede a confirmação reforçada (428)
//  POST auto-denuncia-liberar  body:{autoDenunciaId, observacao}                                            levanta o afastamento preventivo; pede a confirmação reforçada (428)
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim · 403 sem permissão · 404 não achou.
// Quem não tem a permissão recebe 403 ANTES de qualquer busca; pessoa inexistente e pessoa fora do escopo recebem o mesmo 404.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const vol = require("../shared/voluntariado");
const mm = require("../shared/ministerioMenores");
const db = require("../shared/ministerioMenoresDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";
const idDe = vol.inteiroPositivo;        // estrito: "0x10", "1e1", true e [5] não são identificadores

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  context.res = { status: resultado.sucesso ? statusOk : (resultado.proibido ? 403 : 422), body: resultado };
}
const lista = (obj) => Object.entries(obj).map(([codigo, rotulo]) => ({ codigo, rotulo }));

module.exports = async function (context, req) {
  const sessao = auth.exigirLogin(req, context);
  if (!sessao) return;
  // A visão só com as concessões daquela permissão; PIN ou código nunca valem como liderança (e não têm permissão alguma).
  const lideranca = auth.ehSessaoDeLideranca(sessao);
  const visaoHab = lideranca ? auth.visaoDaPermissao(sessao, "habilitacao_voluntarios") : null;
  const visaoDiretoria = lideranca ? auth.visaoDaPermissao(sessao, "vistoria_antecedentes") : null;
  const gestao = !!visaoHab && auth.temPermissao(visaoHab, "habilitacao_voluntarios");
  const geral = !!visaoHab && esc.ehGeral(visaoHab);
  const diretoria = !!visaoDiretoria && esc.ehGeral(visaoDiretoria);

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};
  const hoje = hojeBrasilia();

  // Identificador que chega de fora: inteiro positivo escrito direito; o resto é 400 (nunca vira consulta ao banco).
  for (const campo of ["membroId", "congregacaoId", "equipeId", "autoDenunciaId"]) {
    for (const origem of [corpo, consulta]) {
      if (campo in origem && origem[campo] != null && origem[campo] !== "" && !idDe(origem[campo])) return erro(context, 400, `${campo} inválido.`);
    }
  }

  const EXIGE_GESTAO = ["painel", "painel-geral", "equipe-faixa", "registrar-politica", "confirmar-ficha-pessoa"];
  const EXIGE_DIRETORIA = ["auto-denuncias", "auto-denuncia-decidir", "auto-denuncia-liberar"];

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
            faixas: Object.entries(mm.FAIXAS).map(([codigo, f]) => ({ codigo, rotulo: f.rotulo, criancasPorAdultoPadrao: f.padrao })),
            rotulosBloqueio: mm.ROTULO_BLOQUEIO, alertasDias: mm.ALERTAS_DIAS,
            tiposAutoDenuncia: lista(mm.TIPOS_AUTODENUNCIA), decisoesAutoDenuncia: lista(mm.DECISOES_AUTODENUNCIA),
            papeis: { gestao, geral, diretoria }
          }
        };
        return;
      }
      if (acao === "minha-situacao") {
        context.res = { status: 200, body: { sucesso: true, situacao: await db.minhaSituacao(pool, sessao.membroId, { hoje }) } };
        return;
      }
      if (acao === "politica") {
        const s = await db.minhaSituacao(pool, sessao.membroId, { hoje });
        context.res = { status: 200, body: { sucesso: true, politica: mm.politicaVigente(), aceita: s.politica.aceita } };
        return;
      }
      if (acao === "painel") {
        const congregacaoId = idDe(consulta.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        const nome = (await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`)).recordset[0];
        // congregação que não existe e congregação fora do escopo: a mesma resposta
        if (!nome || !auth.estaNoEscopo(visaoHab, nome.Nome)) return erro(context, 403, esc.FORA_DO_ESCOPO.mensagem);
        context.res = { status: 200, body: { sucesso: true, ...(await db.painel(pool, { congregacaoIds: [congregacaoId], reservado: diretoria, hoje })) } };
        return;
      }
      if (acao === "painel-geral") {
        if (!geral) return erro(context, 403, esc.MSG_GERAL || SEM_PERMISSAO);
        context.res = { status: 200, body: { sucesso: true, ...(await db.painel(pool, { congregacaoIds: null, reservado: diretoria, hoje })) } };
        return;
      }
      if (acao === "auto-denuncias") {
        context.res = { status: 200, body: { sucesso: true, autoDenuncias: await db.listarAutoDenuncias(pool, { abertas: String(consulta.abertas) === "1" }) } };
        return;
      }
      return erro(context, 404, "Ação inválida.");
    }

    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");

    // =============================== Da própria pessoa ===============================
    if (acao === "aceitar-politica") {
      resposta(context, await db.aceitarPolitica(pool, { membroId: sessao.membroId, aceito: corpo.aceito, textoHash: corpo.textoHash, ip: vol.extrairIp(req.headers), cadeia: vol.cadeiaDeCabecalhos(req.headers) }), 201);
      return;
    }
    if (acao === "confirmar-ficha") {
      resposta(context, await db.confirmarFicha(pool, { membroId: sessao.membroId, por: sessao.membroId, confirmo: corpo.confirmo }));
      return;
    }
    if (acao === "auto-denuncia") {
      resposta(context, await db.declararAutoDenuncia(pool, { membroId: sessao.membroId, dados: corpo, hoje }), 201);
      return;
    }

    // =============================== Gestão da congregação ===============================
    if (acao === "equipe-faixa") {
      const equipeId = idDe(corpo.equipeId);
      if (!equipeId) return erro(context, 400, "Informe equipeId.");
      const eq = (await pool.request().input("id", sql.Int, equipeId).query(`SELECT c.Nome AS CongregacaoNome FROM EscalasEquipes e JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId WHERE e.EquipeId = @id`)).recordset[0];
      // equipe que não existe e equipe fora do escopo: a mesma resposta
      if (!eq || !auth.estaNoEscopo(visaoHab, eq.CongregacaoNome)) return erro(context, 404, "Equipe não encontrada.");
      resposta(context, await db.definirFaixaEquipe(pool, { equipeId, faixa: corpo.faixa, por: sessao.membroId }));
      return;
    }
    if (acao === "registrar-politica" || acao === "confirmar-ficha-pessoa") {
      const membroId = idDe(corpo.membroId);
      if (!membroId) return erro(context, 400, "Informe membroId.");
      // pessoa que não existe e pessoa fora do escopo: a mesma resposta (as mensagens do banco citam o nome)
      const alvo = await esc.pessoaAlcancavel(pool, visaoHab, membroId);
      if (!alvo) return erro(context, 404, "Pessoa não encontrada.");
      if (acao === "registrar-politica") resposta(context, await db.registrarPoliticaManual(pool, { membroId, referencia: corpo.referencia, por: sessao.membroId }), 201);
      else resposta(context, await db.confirmarFicha(pool, { membroId, por: sessao.membroId, confirmo: corpo.confirmo }));
      return;
    }

    // =============================== Diretoria ===============================
    if (acao === "auto-denuncia-decidir" || acao === "auto-denuncia-liberar") {
      const autoDenunciaId = idDe(corpo.autoDenunciaId);
      if (!autoDenunciaId) return erro(context, 400, "Informe autoDenunciaId.");
      // Decidir sobre alguém é ato de peso: a confirmação reforçada da vD.4 (chave de acesso ou código por e-mail, até 10 minutos).
      if (!auth.exigirFatorRecente(req, context)) return;
      if (acao === "auto-denuncia-decidir") resposta(context, await db.decidirAutoDenuncia(pool, { autoDenunciaId, dados: corpo, por: sessao.membroId, hoje }));
      else resposta(context, await db.liberarAutoDenuncia(pool, { autoDenunciaId, dados: corpo, por: sessao.membroId }));
      return;
    }

    return erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoMinisterioMenores] erro:", e);
    erro(context, 500, "Erro interno ao processar o ministério com menores.");
  }
};
