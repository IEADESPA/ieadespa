// GestaoNotificacaoRegras (vB.2 — Motor de notificações)
// Catálogo declarativo: evento/prazo (o detector já implementado em
// shared/notificacaoDetectores.js) -> público-alvo (permissão + nível) ->
// canal. Restrito a nível Global (mexe em quem recebe o quê do sistema
// inteiro, não é configuração de um módulo só).
// GET /api/notificacao-regras       -> catálogo completo
// PUT /api/notificacao-regras/{chave} -> { ativa?, canalEmail?, titulo? }
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const chave = context.bindingData.chave;
  // Institucional (mexe em quem recebe o quê no sistema inteiro): só o nível GERAL (papel Global E escopo de todas as congregações) com a permissão de administrar acesso
  // — a tela fica na aba Permissões. Antes era só "nível Global": qualquer papel Global (Tesoureiro, Líder de Consagrações...) passava.
  const usuario = exigirGeral(req, context, "permissoes");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !chave) {
    const result = await pool.request().query(`
      SELECT Chave AS chave, Titulo AS titulo, Categoria AS categoria, PermissaoAlvo AS permissaoAlvo,
             NivelAlvo AS nivelAlvo, CanalEmail AS canalEmail, Obrigatoria AS obrigatoria, Ativa AS ativa
      FROM NotificacaoRegras ORDER BY Categoria, Titulo
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "PUT" && chave) {
    const { ativa, canalEmail, titulo } = req.body || {};
    if (titulo != null && (typeof titulo !== "string" || titulo.length > 150)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Título inválido (texto de até 150 caracteres)." } };
      return;
    }
    const existente = await pool.request().input("chave", sql.NVarChar(60), chave).query(`SELECT Ativa, CanalEmail, Titulo FROM NotificacaoRegras WHERE Chave = @chave`);
    if (existente.recordset.length === 0) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Regra não encontrada." } };
      return;
    }
    const antes = existente.recordset[0];
    await pool.request()
      .input("chave", sql.NVarChar(60), chave)
      .input("ativa", sql.Bit, typeof ativa === "boolean" ? ativa : null)
      .input("canalEmail", sql.Bit, typeof canalEmail === "boolean" ? canalEmail : null)
      .input("titulo", sql.NVarChar(150), titulo || null)
      .query(`
        UPDATE NotificacaoRegras SET
          Ativa = COALESCE(@ativa, Ativa),
          CanalEmail = COALESCE(@canalEmail, CanalEmail),
          Titulo = COALESCE(@titulo, Titulo)
        WHERE Chave = @chave
      `);
    await registrarAuditoria({
      tabela: "NotificacaoRegras", registroId: null, acao: "Alterou regra de notificação", usuarioId: usuario.membroId,
      dadosAntes: { chave, ativa: antes.Ativa, canalEmail: antes.CanalEmail, titulo: antes.Titulo },
      dadosDepois: { chave, ativa: typeof ativa === "boolean" ? ativa : antes.Ativa, canalEmail: typeof canalEmail === "boolean" ? canalEmail : antes.CanalEmail, titulo: titulo || antes.Titulo }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Regra de notificação atualizada." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a chave da regra para atualizar, ou nenhuma para listar o catálogo." } };
};
