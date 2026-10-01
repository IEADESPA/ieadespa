// RegistrarTentativaContato
// Registra uma tentativa de contato com o membro por um Canal Oficial de Comunicação
// (Estatuto Art. 12 §2º) — pré-requisito para poder abrir um procedimento de Abandono
// Digital (precisa de ao menos 2 tentativas em canais distintos). Exige a permissão
// "disciplina" (mesma CLI que cuida do Abandono Material).
// POST /api/tentativas-contato -> body: { membroId, canalId, dataTentativa?, observacao? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const canais = require("../shared/canais");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { membroId, canalId, dataTentativa, observacao } = req.body || {};
  if (!membroId || !canalId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId e canalId." } };
    return;
  }

  const pool = await getPool();
  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  // v7.3 — só vale contato individual por canal institucional ativo (e-mail, telefone/WhatsApp institucional,
  // o próprio sistema). Grupo e rede social não notificam um membro: não contam (Estatuto Art. 12 §2º).
  const canal = await pool.request().input("id", sql.Int, canalId).query(`SELECT CanalId, Ativo, Plataforma, Categoria FROM CanaisOficiaisComunicacao WHERE CanalId = @id`);
  const linhaCanal = canal.recordset[0];
  if (!linhaCanal || !canais.contaParaAbandono({ ativo: !!linhaCanal.Ativo, plataforma: linhaCanal.Plataforma, categoria: linhaCanal.Categoria })) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Canal Oficial de Comunicação inválido, inativo ou que não serve para contato individual (grupos e redes sociais não contam como tentativa de contato)." } };
    return;
  }

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("canalId", sql.Int, canalId)
    .input("dataTentativa", sql.Date, dataTentativa || null)
    .input("observacao", sql.NVarChar(300), observacao || null)
    .input("registradoPor", sql.Int, usuario.membroId)
    .query(`
      INSERT INTO TentativasContatoAbandono (MembroId, CanalId, DataTentativa, Observacao, RegistradoPor)
      OUTPUT INSERTED.TentativaId
      VALUES (@membroId, @canalId, COALESCE(@dataTentativa, CAST(SYSUTCDATETIME() AS DATE)), @observacao, @registradoPor)
    `);
  const tentativaId = result.recordset[0].TentativaId;

  await registrarAuditoria({
    tabela: "TentativasContatoAbandono",
    registroId: tentativaId,
    acao: "Registrou tentativa de contato (Abandono Digital)",
    usuarioId: usuario.membroId,
    dadosDepois: { membroId, canalId, dataTentativa, observacao }
  });

  context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Tentativa de contato registrada.", tentativaId } };
};
