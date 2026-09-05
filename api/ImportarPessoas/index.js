// ImportarPessoas (v1.8)
// Endpoint "burro" de propósito: a decisão de duplicata (matrícula exata ou nome
// muito parecido) já foi tomada no navegador, numa tela de revisão linha a linha —
// aqui só chega o que o operador confirmou. Mesmo padrão de parsing client-side
// (SheetJS) já usado em GestaoElegiveisAssembleia.
// POST /api/pessoas/importar -> body: { linhas: [{ membroId, nome, situacaoMembro, sobrescrever }] }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const pool = await getPool();
  const linhas = (req.body || {}).linhas;
  if (!Array.isArray(linhas) || linhas.length === 0) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Envie ao menos uma linha { membroId, nome, situacaoMembro }." } };
    return;
  }

  const linhasValidas = linhas.filter(l => l && Number(l.membroId) > 0 && String(l.nome || "").trim());
  if (linhasValidas.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma linha válida (matrícula numérica + nome) encontrada." } };
    return;
  }

  const situacoesResult = await pool.request().query(`SELECT Sigla FROM SituacoesMembro`);
  const situacoesValidas = new Set(situacoesResult.recordset.map(s => s.Sigla));

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  for (const linha of linhasValidas) {
    const membroId = Number(linha.membroId);
    const nome = String(linha.nome).trim();
    const situacaoMembro = situacoesValidas.has(linha.situacaoMembro) ? linha.situacaoMembro : null;

    const existente = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    const existia = existente.recordset.length > 0;

    if (existia && !linha.sobrescrever) {
      // Proteção redundante: o front já deveria ter filtrado isso na tela de revisão,
      // mas o backend não confia cegamente no que vem do cliente.
      ignorados++;
      continue;
    }

    if (existia) {
      const request = pool.request().input("id", sql.Int, membroId).input("nome", sql.NVarChar(200), nome);
      if (situacaoMembro) {
        await request.input("situacaoMembro", sql.NVarChar(30), situacaoMembro)
          .query(`UPDATE MembroReferencia SET Nome = @nome, SituacaoMembro = @situacaoMembro WHERE MembroId = @id`);
      } else {
        await request.query(`UPDATE MembroReferencia SET Nome = @nome WHERE MembroId = @id`);
      }
      atualizados++;
    } else {
      await pool.request()
        .input("id", sql.Int, membroId)
        .input("nome", sql.NVarChar(200), nome)
        .input("situacaoMembro", sql.NVarChar(30), situacaoMembro || "EM_COMUNHAO")
        .query(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro) VALUES (@id, @nome, 'ATIVO', @situacaoMembro)`);
      criados++;
    }
  }

  const resumo = { criados, atualizados, ignorados };
  await registrarAuditoria({
    tabela: "MembroReferencia",
    registroId: 0,
    acao: "Importou pessoas em lote (planilha)",
    usuarioId: usuario.membroId,
    dadosDepois: resumo
  });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      mensagem: `✅ Importação concluída: ${criados} criados, ${atualizados} atualizados, ${ignorados} ignorados.`,
      resumo
    }
  };
};
