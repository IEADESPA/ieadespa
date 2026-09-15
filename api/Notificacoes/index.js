// Notificacoes (vB.2 — Motor de notificações)
// Central de avisos do usuário logado — nunca mostra notificação de outra
// matrícula, mesmo pra quem tem nível Global (é "minha" central, não uma
// tela de auditoria; isso já existe em GestaoAuditoria).
// GET /api/notificacoes                 -> lista (?status=abertas|arquivadas|todas, default abertas)
// GET /api/notificacoes/contagem        -> { naoLidas }
// GET /api/notificacoes/digest          -> [{ categoria, total, maisRecente }]
// PUT /api/notificacoes/{id}            -> { acao: 'LER' | 'ARQUIVAR' | 'DESARQUIVAR' }
// PUT /api/notificacoes/marcar-todas-lidas
// PUT /api/notificacoes/preferencias    -> { categoria, emailAtivo }
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { montarDigest } = require("../shared/notificacaoMotor");

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const pool = await getPool();
  const idNumerico = recurso && /^\d+$/.test(recurso) ? Number(recurso) : null;

  if (req.method === "GET" && !recurso) {
    const status = (req.query && req.query.status) || "abertas";
    let filtro = "AND Arquivada = 0";
    if (status === "arquivadas") filtro = "AND Arquivada = 1";
    if (status === "todas") filtro = "";
    const result = await pool.request().input("membroId", sql.Int, usuario.membroId).query(`
      SELECT NotificacaoId AS notificacaoId, Titulo AS titulo, Mensagem AS mensagem, Categoria AS categoria,
             Lida AS lida, Arquivada AS arquivada, CriadaEm AS criadaEm
      FROM Notificacoes
      WHERE DestinatarioMembroId = @membroId ${filtro}
      ORDER BY Lida ASC, CriadaEm DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && recurso === "contagem") {
    const result = await pool.request().input("membroId", sql.Int, usuario.membroId).query(`
      SELECT COUNT(*) AS naoLidas FROM Notificacoes WHERE DestinatarioMembroId = @membroId AND Lida = 0 AND Arquivada = 0
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { naoLidas: result.recordset[0].naoLidas } };
    return;
  }

  if (req.method === "GET" && recurso === "digest") {
    const digest = await montarDigest(pool, usuario.membroId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: digest };
    return;
  }

  if (req.method === "PUT" && recurso === "marcar-todas-lidas") {
    await pool.request().input("membroId", sql.Int, usuario.membroId).query(`
      UPDATE Notificacoes SET Lida = 1, LidaEm = SYSUTCDATETIME()
      WHERE DestinatarioMembroId = @membroId AND Lida = 0
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Todas as notificações foram marcadas como lidas." } };
    return;
  }

  if (req.method === "PUT" && recurso === "preferencias") {
    const { categoria, emailAtivo } = req.body || {};
    if (!categoria || typeof emailAtivo !== "boolean") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe categoria e emailAtivo (booleano)." } };
      return;
    }
    await pool.request()
      .input("membroId", sql.Int, usuario.membroId)
      .input("categoria", sql.NVarChar(40), categoria)
      .input("emailAtivo", sql.Bit, emailAtivo)
      .query(`
        MERGE NotificacaoPreferencias AS destino
        USING (SELECT @membroId AS MembroId, @categoria AS Categoria) AS origem
        ON destino.MembroId = origem.MembroId AND destino.Categoria = origem.Categoria
        WHEN MATCHED THEN UPDATE SET EmailAtivo = @emailAtivo, AtualizadoEm = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (MembroId, Categoria, EmailAtivo) VALUES (@membroId, @categoria, @emailAtivo);
      `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: emailAtivo ? "✅ E-mail reativado para essa categoria." : "✅ E-mail desativado para essa categoria." } };
    return;
  }

  if (req.method === "PUT" && idNumerico) {
    const { acao } = req.body || {};
    if (!["LER", "ARQUIVAR", "DESARQUIVAR"].includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use LER, ARQUIVAR ou DESARQUIVAR." } };
      return;
    }
    const dona = await pool.request().input("id", sql.Int, idNumerico).query(`SELECT DestinatarioMembroId FROM Notificacoes WHERE NotificacaoId = @id`);
    if (dona.recordset.length === 0 || dona.recordset[0].DestinatarioMembroId !== usuario.membroId) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Notificação não encontrada." } };
      return;
    }
    const query = acao === "LER" ? "UPDATE Notificacoes SET Lida = 1, LidaEm = SYSUTCDATETIME() WHERE NotificacaoId = @id"
      : acao === "ARQUIVAR" ? "UPDATE Notificacoes SET Arquivada = 1, ArquivadaEm = SYSUTCDATETIME() WHERE NotificacaoId = @id"
      : "UPDATE Notificacoes SET Arquivada = 0, ArquivadaEm = NULL WHERE NotificacaoId = @id";
    await pool.request().input("id", sql.Int, idNumerico).query(query);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Notificação atualizada." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: contagem, digest, marcar-todas-lidas, preferencias ou o id da notificação." } };
};
