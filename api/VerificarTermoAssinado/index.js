// VerificarTermoAssinado (vB.6 — Assinatura eletrônica interna com trilha)
// Recomputa o hash do texto ATUAL do catálogo (shared/termos.js) e compara
// com o hash gravado no momento da assinatura (TermosAssinados.HashConteudo,
// vB.6) — é a checagem de integridade de verdade, não só "existe uma linha
// na tabela". Detecta duas coisas que uma trilha sem hash nunca pegaria:
// catálogo mudou o texto sem trocar VersaoTermo (inconsistência real), ou
// a versão assinada já foi substituída por uma mais nova.
// GET /api/termos-assinados/{id}/verificar — o próprio signatário, ou quem audita (permissão
// `auditoria` ou `protecaodedados`) no nível GERAL (papel GLOBAL e escopo TODAS). Qualquer outra
// pessoa recebe a MESMA resposta de assinatura que não existe: a rota não serve de sonda de id.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { TERMOS } = require("../shared/termos");
const { avaliarIntegridadeTermo } = require("../shared/assinaturaInterna");
const { ehGeral } = require("../shared/escopoRotas");

const naoEncontrada = () => ({ status: 404, body: { sucesso: false, mensagem: "Assinatura não encontrada." } });

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const id = auth.idDeRota(context.bindingData.id);
  if (!id) { context.res = naoEncontrada(); return; }

  try {
    const pool = await getPool();
    const termo = (await pool.request().input("id", sql.Int, id).query(`
      SELECT t.TermoAssinadoId, t.MembroId, m.Nome AS membroNome, t.TipoTermo, t.VersaoTermo, t.HashConteudo,
             CONVERT(varchar(33), t.DataAssinatura, 126) AS dataAssinatura
      FROM TermosAssinados t JOIN MembroReferencia m ON m.MembroId = t.MembroId
      WHERE t.TermoAssinadoId = @id
    `)).recordset[0];

    // v7.6 — o nível geral tem de vir de uma concessão que tenha a permissão de auditoria/proteção de dados (não de outro cargo ou delegação).
    const auditoria = ehGeral(auth.visaoDaPermissao(usuario, ["auditoria", "protecaodedados"]));
    if (!termo || (Number(termo.MembroId) !== Number(usuario.membroId) && !auditoria)) {
      context.res = naoEncontrada();
      return;
    }

    const integridade = avaliarIntegridadeTermo({
      catalogoTermo: Object.prototype.hasOwnProperty.call(TERMOS, termo.TipoTermo) ? TERMOS[termo.TipoTermo] : undefined,
      hashConteudo: termo.HashConteudo, versaoTermo: termo.VersaoTermo
    });

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        membroNome: termo.membroNome, tipoTermo: termo.TipoTermo, versaoTermo: termo.VersaoTermo, dataAssinatura: termo.dataAssinatura,
        integridade
      }
    };
  } catch (e) {
    context.log.error("[VerificarTermoAssinado] erro:", e);
    context.res = { status: 500, body: { sucesso: false, mensagem: "Erro interno ao verificar a assinatura." } };
  }
};
