// shared/comissoes.js
// Comissões Permanentes (Regimento, Art. 19-23) — CFO e CEP são 100%
// calculadas a partir de Assentos (mesmo princípio de composicaoCLI: nunca
// marcação manual quando dá pra derivar de outro dado real). CCJ é a única
// eleita pelo Plenário (Art. 19, I) — não deriva de nada, precisa de
// ComissaoMembros (migração 028).
const { sql } = require("./db");

// Art. 20 — Comissão de Finanças e Orçamento: titulares do Conselho Fiscal +
// 1º/2º Tesoureiro da Diretoria Executiva. "Tesoureiro" ainda é texto livre em
// Assentos.CargoOuFuncao (Diretoria não tem tela/catálogo próprio ainda — v2.5),
// por isso o match é por LIKE.
async function composicaoCFO(pool) {
  const result = await pool.request().query(`
    SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, a.CargoOuFuncao AS cargoOuFuncao, o.Sigla AS origemSigla
    FROM Assentos a
    JOIN MembroReferencia m ON m.MembroId = a.MembroId
    JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
    WHERE a.DataFim IS NULL
      AND (a.DataTerminoPrevisao IS NULL OR a.DataTerminoPrevisao >= CAST(SYSUTCDATETIME() AS DATE))
      AND (
        o.Sigla = 'CONSELHO_FISCAL'
        OR (o.Sigla = 'DIRETORIA_EXECUTIVA' AND a.CargoOuFuncao LIKE '%Tesoureiro%')
      )
  `);
  return result.recordset;
}

// Art. 21 — Comissão de Ética Parlamentar e Decoro: membros do CEI.
async function composicaoCEP(pool) {
  const result = await pool.request().query(`
    SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, a.CargoOuFuncao AS cargoOuFuncao
    FROM Assentos a
    JOIN MembroReferencia m ON m.MembroId = a.MembroId
    JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
    WHERE o.Sigla = 'CEI'
      AND a.DataFim IS NULL
      AND (a.DataTerminoPrevisao IS NULL OR a.DataTerminoPrevisao >= CAST(SYSUTCDATETIME() AS DATE))
  `);
  return result.recordset;
}

// Art. 19 — Comissão de Constituição, Justiça e Redação: 3 membros eleitos.
async function composicaoCCJ(pool) {
  const result = await pool.request().query(`
    SELECT c.ComissaoMembroId AS comissaoMembroId, m.MembroId AS membroId, m.Nome AS nome,
           CONVERT(varchar(10), c.DataInicio, 120) AS dataInicio
    FROM ComissaoMembros c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    WHERE c.Sigla = 'CCJ' AND c.DataFim IS NULL
    ORDER BY c.DataInicio
  `);
  return result.recordset;
}

// v4.8 (segunda parte) — mesmo padrão de cadastro manual da CCJ,
// generalizado por sigla: usado pela Comissão de Acompanhamento de
// Projetos / PMO Eclesiástico (Art. 30), sigla 'PMO', reaproveitando a
// mesma tabela ComissaoMembros (sem criar uma tabela nova por comissão).
async function composicaoPorSiglaEleita(pool, sigla) {
  const result = await pool.request().input("sigla", sql.NVarChar(10), sigla).query(`
    SELECT c.ComissaoMembroId AS comissaoMembroId, m.MembroId AS membroId, m.Nome AS nome,
           CONVERT(varchar(10), c.DataInicio, 120) AS dataInicio
    FROM ComissaoMembros c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    WHERE c.Sigla = @sigla AND c.DataFim IS NULL
    ORDER BY c.DataInicio
  `);
  return result.recordset;
}

// v8.1 — Art. 22 — Comissão de Doutrina e Educação Religiosa: o Reitor da AFM (calculado do cadastro da Reitoria, shared/afmDb.js) + 2 mestres de teologia da CLI
// (cadastro manual, mesmo padrão da CCJ, com a titulação). `idsNaCLI`: quem compõe a CLI hoje — o mestre que saiu da CLI aparece marcado (a vaga precisa ser recomposta).
async function composicaoCDER(pool, hojeIso, idsNaCLI) {
  const { reitorAtual } = require("./afmDb");
  const { situacao, reitor } = await reitorAtual(() => pool.request(), hojeIso);
  const result = await pool.request().query(`
    SELECT c.ComissaoMembroId AS comissaoMembroId, m.MembroId AS membroId, m.Nome AS nome, c.Qualificacao AS qualificacao,
           CONVERT(varchar(10), c.DataInicio, 120) AS dataInicio
    FROM ComissaoMembros c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    WHERE c.Sigla = 'CDER' AND c.DataFim IS NULL
    ORDER BY c.DataInicio
  `);
  const mestres = result.recordset.map(m => Object.assign({}, m, { foraDaCLI: !!idsNaCLI && !idsNaCLI.has(Number(m.membroId)) }));
  return { reitor: reitor ? { membroId: reitor.membroId, nome: reitor.nome, titulacao: reitor.titulacao } : null, situacaoReitor: situacao, mestres };
}

module.exports = { composicaoCFO, composicaoCEP, composicaoCCJ, composicaoPorSiglaEleita, composicaoCDER };
