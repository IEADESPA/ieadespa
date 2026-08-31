// GestaoElegiveisAssembleia
// Lista contínua de elegíveis da Assembleia Geral (membro em comunhão, apto a
// votar e ser votado) e importação por Excel — o parse do .xlsx acontece no
// navegador (SheetJS), aqui só chega o JSON já extraído: [{ matricula, nome }].
// Cada importação é a fonte da verdade: quem estava elegível e não veio nesta
// leva perde a elegibilidade (ver mockDb.importarElegiveisAssembleia).
// GET  /api/assembleia/elegiveis           -> lista os elegíveis atuais
// POST /api/assembleia/elegiveis/importar  -> body: { linhas: [{ matricula, nome }] }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "assembleia");
  if (!usuario) return;

  const acao = context.bindingData.acao;
  const method = req.method;

  // ---- GET /assembleia/elegiveis: listar ----
  if (method === "GET" && !acao) {
    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // const result = await pool.request().query(`
    //   SELECT m.MembroId, m.Nome, c.Nome AS Congregacao FROM MembroReferencia m
    //   LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    //   WHERE m.ElegivelAssembleia = 1 ORDER BY m.Nome
    // `);
    // context.res = { status: 200, body: result.recordset };
    // return;

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: mockDb.listarElegiveisAssembleia()
    };
    return;
  }

  // ---- POST /assembleia/elegiveis/importar: substitui a lista de elegíveis ----
  if (method === "POST" && acao === "importar") {
    const linhas = (req.body || {}).linhas;
    if (!Array.isArray(linhas) || linhas.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Envie ao menos uma linha { matricula, nome }." } };
      return;
    }
    const linhasValidas = linhas.filter(l => l && Number(l.matricula) > 0 && String(l.nome || "").trim());
    if (linhasValidas.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma linha válida (matrícula numérica + nome) encontrada na planilha." } };
      return;
    }

    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // await pool.request().query(`UPDATE MembroReferencia SET ElegivelAssembleia = 0`);
    // for (const linha of linhasValidas) {
    //   await pool.request().input("id", sql.Int, linha.matricula).input("nome", sql.NVarChar, linha.nome)
    //     .query(`
    //       MERGE MembroReferencia AS alvo
    //       USING (SELECT @id AS MembroId) AS origem ON alvo.MembroId = origem.MembroId
    //       WHEN MATCHED THEN UPDATE SET Nome = @nome, ElegivelAssembleia = 1
    //       WHEN NOT MATCHED THEN INSERT (MembroId, Nome, Status, ElegivelAssembleia) VALUES (@id, @nome, 'ATIVO', 1);
    //     `);
    // }

    const resumo = mockDb.importarElegiveisAssembleia(linhasValidas);

    await registrarAuditoria({
      tabela: "MembroReferencia",
      registroId: 0,
      acao: "Importou elegíveis da Assembleia Geral",
      usuarioId: usuario.membroId,
      dadosDepois: resumo
    });

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        mensagem: `✅ Importação concluída: ${resumo.incluidos} incluídos, ${resumo.atualizados} atualizados, ${resumo.removidosDaElegibilidade} perderam elegibilidade.`,
        resumo
      }
    };
    return;
  }

  context.res = { status: 405, body: { erro: "Método/rota não suportado." } };
};
