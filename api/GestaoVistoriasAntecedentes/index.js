// GestaoVistoriasAntecedentes (v7.6 — Termo de Vistoria de antecedentes)
// Regimento Art. 133 §5º (idoneidade moral, antecedentes criminais e proteção de dados — LGPD); Lei 14.811/2024.
//
// Acesso EXCLUSIVO da Diretoria Executiva e do Conselho de Ética (§5º, IV, "a"): a permissão "vistoria_antecedentes" (nova, migração 142; vem só para o
// Presidente e o Secretário Geral, e o Conselho de Ética a recebe em Permissões) E o nível geral. Quem não tem recebe 403 antes de qualquer busca. O sistema
// nunca recebe a certidão: só o hash dela, calculado no aparelho de quem confere (§5º, IV, "b": nada de arquivo morto).
//
// ---- Leitura (GET /api/vistorias-antecedentes/...) -----------------------------------------------
//  catalogos          -> { motivos[{codigo,rotulo,base}], tiposDocumento[], resultados[], destinosOriginal[], maxDocumentos }
//  lista?membroId=    -> { vistorias[{vistoriaId,membroId,membroNome,motivo,funcao,comVulneraveis,dataVerificacao,resultado,parecer,destinoOriginal,assinadaPorNome,assinadaEm,
//                          documentos[{tipo,hash,dataEmissao}]}] }   sem membroId: as mais recentes de todos
//  vistoria?vistoriaId= -> { vistoria }
//  pendentes          -> { liderancas[{membroId,nome,congregacaoNome,cargos,ultimoResultado,recusou}] }   quem exerce liderança e ainda não tem Termo de Vistoria (II, "a")
//
// ---- Escrita (POST /api/vistorias-antecedentes/...) ----------------------------------------------
//  solicitar          body:{membroId, motivo?, funcao?}  avisa a pessoa de que a Diretoria solicita as certidões (I). Não cria registro.
//  lavrar             body:{membroId, motivo, funcao, comVulneraveis?, dataVerificacao, resultado:SEM_RESTRICAO|COM_RESTRICAO|RECUSA, parecer,
//                          destinoOriginal:DEVOLVIDO|DESCARTADO (menos na RECUSA), documentos:[{tipo, hash, dataEmissao}]} -> 201   o Termo de Vistoria, assinado por quem o lavra
//                          (nunca por quem foi vistoriado); não se altera nem se apaga. Pede a confirmação reforçada da vD.4 (428 se passou de 10 minutos).
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim · 403 sem permissão · 404 não achou.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const va = require("../shared/vistoriaAntecedentes");
const db = require("../shared/vistoriaAntecedentesDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "O Termo de Vistoria é da Diretoria Executiva e do Conselho de Ética. Fale com quem administra as Permissões.";

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  context.res = { status: resultado.sucesso ? statusOk : (resultado.proibido ? 403 : 422), body: resultado };
}
const idDe = va.inteiroPositivo;

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  // Sessão de PIN ou de código nunca vale aqui: é a liderança, entrando com a senha. E o nível geral: a visão só com as concessões que têm a permissão.
  const visao = auth.ehSessaoDeLideranca(usuario) ? auth.visaoDaPermissao(usuario, "vistoria_antecedentes") : null;
  if (!visao || !esc.ehGeral(visao)) return erro(context, 403, SEM_PERMISSAO);

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};

  try {
    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = {
          status: 200,
          body: {
            sucesso: true,
            motivos: Object.entries(va.MOTIVOS).map(([codigo, m]) => ({ codigo, rotulo: m.rotulo, base: m.base })),
            tiposDocumento: Object.entries(va.TIPOS_DOCUMENTO).map(([codigo, rotulo]) => ({ codigo, rotulo })),
            resultados: Object.entries(va.RESULTADOS).map(([codigo, rotulo]) => ({ codigo, rotulo })),
            destinosOriginal: Object.entries(va.DESTINOS_ORIGINAL).map(([codigo, rotulo]) => ({ codigo, rotulo })),
            maxDocumentos: va.MAX_DOCUMENTOS
          }
        };
        return;
      }
      if (acao === "lista") {
        let membroId = null;
        if (consulta.membroId != null && consulta.membroId !== "") {
          membroId = idDe(consulta.membroId);
          if (!membroId) return erro(context, 400, "membroId inválido.");
        }
        context.res = { status: 200, body: { sucesso: true, vistorias: await db.listarVistorias(pool, { membroId }) } };
        return;
      }
      if (acao === "vistoria") {
        const vistoriaId = idDe(consulta.vistoriaId);
        if (!vistoriaId) return erro(context, 400, "Informe vistoriaId.");
        const v = await db.detalharVistoria(pool, vistoriaId);
        if (!v) return erro(context, 404, "Termo de Vistoria não encontrado.");
        context.res = { status: 200, body: { sucesso: true, vistoria: v } };
        return;
      }
      if (acao === "pendentes") {
        context.res = { status: 200, body: { sucesso: true, liderancas: await db.liderancasSemVistoria(pool) } };
        return;
      }
      return erro(context, 404, "Ação inválida.");
    }

    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");

    if (acao === "solicitar") { resposta(context, await db.solicitarCertidoes(pool, { dados: corpo, por: usuario.membroId })); return; }
    if (acao === "lavrar") {
      // Assinar o Termo é um ato de peso (documento imutável sobre uma pessoa): pede a confirmação reforçada da vD.4 (chave de acesso ou código por e-mail, até 10 minutos).
      if (!auth.exigirFatorRecente(req, context)) return;
      resposta(context, await db.lavrarVistoria(pool, { dados: corpo, por: usuario.membroId, hoje: hojeBrasilia() }), 201);
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoVistoriasAntecedentes] erro:", e);
    erro(context, 500, "Erro interno ao processar a vistoria de antecedentes.");
  }
};
