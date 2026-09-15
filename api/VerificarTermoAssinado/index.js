// VerificarTermoAssinado (vB.6 — Assinatura eletrônica interna com trilha)
// Recomputa o hash do texto ATUAL do catálogo (shared/termos.js) e compara
// com o hash gravado no momento da assinatura (TermosAssinados.HashConteudo,
// vB.6) — é a checagem de integridade de verdade, não só "existe uma linha
// na tabela". Detecta duas coisas que uma trilha sem hash nunca pegaria:
// catálogo mudou o texto sem trocar VersaoTermo (inconsistência real), ou
// a versão assinada já foi substituída por uma mais nova.
// GET /api/termos-assinados/{id}/verificar — o próprio signatário ou nível Global.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { TERMOS } = require("../shared/termos");
const { avaliarIntegridadeTermo } = require("../shared/assinaturaInterna");

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const id = context.bindingData.id;
  const pool = await getPool();

  const termo = (await pool.request().input("id", sql.Int, id).query(`
    SELECT t.TermoAssinadoId, t.MembroId, m.Nome AS membroNome, t.TipoTermo, t.VersaoTermo, t.HashConteudo,
           CONVERT(varchar(33), t.DataAssinatura, 126) AS dataAssinatura
    FROM TermosAssinados t JOIN MembroReferencia m ON m.MembroId = t.MembroId
    WHERE t.TermoAssinadoId = @id
  `)).recordset[0];
  if (!termo) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Assinatura não encontrada." } };
    return;
  }
  if (termo.MembroId !== usuario.membroId && usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Você só pode verificar a própria assinatura." } };
    return;
  }

  const integridade = avaliarIntegridadeTermo({
    catalogoTermo: TERMOS[termo.TipoTermo], hashConteudo: termo.HashConteudo, versaoTermo: termo.VersaoTermo
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
};
