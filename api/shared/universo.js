// shared/universo.js
// Universo de "quem deveria estar presente" por órgão — mesma regra usada por
// RegistrarPresenca, EncerrarReuniao, ListarFrequencia e AbrirReuniao (pra
// detectar conflito de horário entre órgãos com gente em comum):
// - ASSEMBLEIA_GERAL: quem tem capacidade ativa (Art. 23 §1º) — calculado.
// - CLI: composição mista do Art. 15 — por Ordenação (CargoMinisterial =
//   PRESBITERO/EVANGELISTA/PASTOR, ATIVO) UNIÃO com Assentos por Função ativos
//   (Diretoria, Conselho Fiscal, CEI, Dirigente de Congregação, Líder Geral).
// - Demais órgãos: quem ocupa Assento ativo NAQUELE órgão especificamente
//   (Diretoria, Conselho Fiscal, CEI...) — assim que a Secretaria cadastrar a
//   composição real (aba Órgãos → Cadeiras), o universo passa a refletir isso
//   de verdade, em vez de "todo mundo ATIVO". Enquanto nenhuma cadeira estiver
//   cadastrada pra esse órgão, cai no padrão de sempre (todo mundo ATIVO —
//   ex: uma reunião aberta a todos os obreiros, sem composição fechada).
const { sql } = require("./db");
const estatuto = require("./estatuto");
const disciplina = require("./disciplina");

async function universoDoOrgao(pool, orgao) {
  if (!orgao) {
    const result = await pool.request().query(
      `SELECT MembroId AS membroId, Nome AS nome FROM MembroReferencia WHERE Status = 'ATIVO'`
    );
    return result.recordset;
  }

  if (orgao.sigla === "ASSEMBLEIA_GERAL") {
    const result = await pool.request().query(`
      SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao,
             m.Status AS status, m.SituacaoMembro AS situacaoMembro,
             CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento,
             CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
             m.DizimistaFiel AS dizimistaFiel
      FROM MembroReferencia m
      LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    `);
    // Sempre real, nunca mascarado — mesma razão de GestaoElegiveisAssembleia: este é
    // o universo de quem realmente pode votar, não uma tela de exibição.
    const idsSobDisciplina = await disciplina.membrosSobDisciplina(pool);
    const comFlag = result.recordset.map(m => Object.assign({}, m, { processoDisciplinarAtivo: idsSobDisciplina.has(m.membroId) }));
    return comFlag.filter(m => estatuto.calcularCapacidadeEleitoral(m).capacidadeAtiva);
  }

  if (orgao.sigla === "CLI") {
    const porOrdenacao = await pool.request().query(`
      SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao
      FROM MembroReferencia m
      LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      WHERE m.Status = 'ATIVO' AND m.CargoMinisterial IN ('PRESBITERO', 'EVANGELISTA', 'PASTOR')
    `);
    const idsPorOrdenacao = new Set(porOrdenacao.recordset.map(m => m.membroId));
    // Cadeira com mandato vencido (DataTerminoPrevisao no passado) para de contar
    // pro universo assim que vence, mesmo sem alguém ter formalmente encerrado a
    // cadeira (ver GestaoAssentos — "vencimento calculado na leitura").
    const porFuncao = await pool.request().input("orgaoId", sql.Int, orgao.orgaoId).query(`
      SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao
      FROM Assentos a
      JOIN MembroReferencia m ON m.MembroId = a.MembroId
      LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      WHERE a.OrgaoId = @orgaoId AND a.DataFim IS NULL
        AND (a.DataTerminoPrevisao IS NULL OR a.DataTerminoPrevisao >= CAST(SYSUTCDATETIME() AS DATE))
    `);
    return porOrdenacao.recordset.concat(porFuncao.recordset.filter(m => !idsPorOrdenacao.has(m.membroId)));
  }

  const porAssento = await pool.request().input("orgaoId", sql.Int, orgao.orgaoId).query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao
    FROM Assentos a
    JOIN MembroReferencia m ON m.MembroId = a.MembroId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE a.OrgaoId = @orgaoId AND a.DataFim IS NULL
      AND (a.DataTerminoPrevisao IS NULL OR a.DataTerminoPrevisao >= CAST(SYSUTCDATETIME() AS DATE))
  `);
  if (porAssento.recordset.length > 0) return porAssento.recordset;

  const result = await pool.request().query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE m.Status = 'ATIVO'
  `);
  return result.recordset;
}

module.exports = { universoDoOrgao };
