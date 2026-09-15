// shared/notificacoes.js
// Motor genérico de notificações (vB.2). Não é módulo de negócio nenhum —
// é reaproveitado por qualquer detector (shared/notificacaoDetectores.js)
// e pela Function que o usuário lê (Notificacoes) e configura (GestaoNotificacaoRegras).
const { sql } = require("./db");

// Quem tem a permissão (e, se pedido, o nível) de uma regra — mesmo padrão
// de junção Lideranca+Papeis+MembroReferencia já usado em shared/universo.js
// e no LoginSecretaria, só filtrando por Papeis.Permissoes em vez de listar
// todo mundo. Mandato vencido (AtivoAte) não recebe.
async function resolverDestinatariosPorPermissao(pool, { permissao, nivel }) {
  const request = pool.request().input("permissao", sql.NVarChar(60), `%,${permissao},%`);
  let filtroNivel = "";
  if (nivel) {
    request.input("nivel", sql.NVarChar(20), nivel);
    filtroNivel = "AND p.Nivel = @nivel";
  }
  const result = await request.query(`
    SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, m.Email AS email
    FROM Lideranca l
    JOIN Papeis p ON p.PapelId = l.PapelId
    JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE (',' + p.Permissoes + ',') LIKE @permissao
      AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
      ${filtroNivel}
  `);
  return result.recordset;
}

// Idempotente por origem (RegraChave + destinatário + referência) — rodar o
// avaliador de novo sobre o mesmo fato gerador nunca duplica notificação.
// Retorna { criada, notificacaoId } — criada=false quando já existia (não é erro).
async function criarNotificacao(pool, { regraChave, destinatarioMembroId, titulo, mensagem, categoria, referenciaTabela, referenciaId }) {
  const existe = await pool.request()
    .input("regraChave", sql.NVarChar(60), regraChave)
    .input("destinatarioMembroId", sql.Int, destinatarioMembroId)
    .input("referenciaTabela", sql.NVarChar(60), referenciaTabela || null)
    .input("referenciaId", sql.Int, referenciaId != null ? referenciaId : null)
    .query(`
      SELECT NotificacaoId FROM Notificacoes
      WHERE RegraChave = @regraChave AND DestinatarioMembroId = @destinatarioMembroId
        AND ISNULL(ReferenciaTabela, '') = ISNULL(@referenciaTabela, '')
        AND ISNULL(ReferenciaId, -1) = ISNULL(@referenciaId, -1)
    `);
  if (existe.recordset.length > 0) return { criada: false, notificacaoId: existe.recordset[0].NotificacaoId };

  const inserida = await pool.request()
    .input("regraChave", sql.NVarChar(60), regraChave)
    .input("destinatarioMembroId", sql.Int, destinatarioMembroId)
    .input("titulo", sql.NVarChar(200), titulo)
    .input("mensagem", sql.NVarChar(1000), mensagem)
    .input("categoria", sql.NVarChar(40), categoria)
    .input("referenciaTabela", sql.NVarChar(60), referenciaTabela || null)
    .input("referenciaId", sql.Int, referenciaId != null ? referenciaId : null)
    .query(`
      INSERT INTO Notificacoes (RegraChave, DestinatarioMembroId, Titulo, Mensagem, Categoria, ReferenciaTabela, ReferenciaId)
      OUTPUT INSERTED.NotificacaoId
      VALUES (@regraChave, @destinatarioMembroId, @titulo, @mensagem, @categoria, @referenciaTabela, @referenciaId)
    `);
  return { criada: true, notificacaoId: inserida.recordset[0].NotificacaoId };
}

async function marcarEmailEnviado(pool, notificacaoId) {
  await pool.request().input("id", sql.Int, notificacaoId)
    .query(`UPDATE Notificacoes SET EnviadaEmail = 1, EnviadaEmailEm = SYSUTCDATETIME() WHERE NotificacaoId = @id`);
}

// Opt-out por categoria (NotificacaoPreferencias) — regra Obrigatoria ignora.
// Sem linha em NotificacaoPreferencias = ativo por padrão (opt-out, não opt-in).
async function podeReceberEmail(pool, membroId, categoria, obrigatoria) {
  if (obrigatoria) return true;
  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("categoria", sql.NVarChar(40), categoria)
    .query(`SELECT EmailAtivo FROM NotificacaoPreferencias WHERE MembroId = @membroId AND Categoria = @categoria`);
  if (result.recordset.length === 0) return true;
  return !!result.recordset[0].EmailAtivo;
}

module.exports = { resolverDestinatariosPorPermissao, criarNotificacao, marcarEmailEnviado, podeReceberEmail };
