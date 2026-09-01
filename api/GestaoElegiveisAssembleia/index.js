// GestaoElegiveisAssembleia
// Lista de elegíveis da Assembleia Geral (capacidade eleitoral ativa, Art. 23
// §1º) — CALCULADA a partir de MembroReferencia (idade, admissão, dízimo),
// nunca uma marcação manual (não existe coluna "ElegivelAssembleia" no
// schema — ver api/shared/estatuto.js e a regra do Art. 7º §1º no README).
// A importação por Excel é o mesmo upsert de matrícula+nome que a tela de
// Pessoas já faz (GestaoPessoas) — o parse do .xlsx acontece no navegador
// (SheetJS), aqui só chega o JSON já extraído: [{ matricula, nome }].
// GET  /api/assembleia/elegiveis           -> lista os elegíveis atuais (calculado)
// POST /api/assembleia/elegiveis/importar  -> body: { linhas: [{ matricula, nome }] }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "assembleia");
  if (!usuario) return;

  const acao = context.bindingData.acao;
  const method = req.method;
  const pool = await getPool();

  // ---- GET /assembleia/elegiveis: listar ----
  if (method === "GET" && !acao) {
    const result = await pool.request().query(`
      SELECT m.MembroId AS membroId, m.Nome AS nome, m.Status AS status, c.Nome AS congregacao,
             CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento,
             CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
             m.DizimistaFiel AS dizimistaFiel, m.SituacaoMembro AS situacaoMembro
      FROM MembroReferencia m
      LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    `);
    const elegiveis = result.recordset
      .filter(m => estatuto.calcularCapacidadeEleitoral(m).capacidadeAtiva)
      .map(m => Object.assign({}, m, { capacidade: estatuto.calcularCapacidadeEleitoral(m) }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: elegiveis };
    return;
  }

  // ---- POST /assembleia/elegiveis/importar: upsert em massa (matrícula + nome) ----
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

    let incluidos = 0;
    let atualizados = 0;
    for (const linha of linhasValidas) {
      const membroId = Number(linha.matricula);
      const nome = String(linha.nome).trim();
      const existente = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
      if (existente.recordset.length > 0) {
        await pool.request().input("id", sql.Int, membroId).input("nome", sql.NVarChar(200), nome)
          .query(`UPDATE MembroReferencia SET Nome = @nome WHERE MembroId = @id`);
        atualizados++;
      } else {
        await pool.request().input("id", sql.Int, membroId).input("nome", sql.NVarChar(200), nome)
          .query(`INSERT INTO MembroReferencia (MembroId, Nome, Status) VALUES (@id, @nome, 'ATIVO')`);
        incluidos++;
      }
    }
    const resumo = { incluidos, atualizados };

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
        mensagem: `✅ Importação concluída: ${resumo.incluidos} incluídos, ${resumo.atualizados} atualizados. A elegibilidade é recalculada automaticamente pelo Estatuto (idade, admissão e dízimo).`,
        resumo
      }
    };
    return;
  }

  context.res = { status: 405, body: { erro: "Método/rota não suportado." } };
};
