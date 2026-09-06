// shared/cei.js (v3.1)
// Busca os dados objetivos usados por estatuto.avaliarElegibilidadeCEI —
// só query, nenhuma regra aqui (regra fica em estatuto.js, puro e sem banco,
// mesmo padrão do resto do projeto).
const estatuto = require("./estatuto");

async function dadosElegibilidadeCEI(pool, sql, membroId) {
  const membroResult = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @id`);
  const cargoMinisterial = membroResult.recordset[0] ? membroResult.recordset[0].CargoMinisterial : null;

  const consagracaoResult = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT TOP 1 CONVERT(varchar(10), DataConclusao, 120) AS dataConclusao
    FROM Consagracoes
    WHERE MembroId = @id AND Status = 'CONCLUIDO' AND Assunto LIKE '%Presb%'
    ORDER BY DataConclusao DESC
  `);
  const dataConsagracaoPresbitero = consagracaoResult.recordset[0] ? consagracaoResult.recordset[0].dataConclusao : null;
  const diasDesdeConsagracao = dataConsagracaoPresbitero ? estatuto.diasDesde(dataConsagracaoPresbitero) : null;
  const anosDesdeConsagracaoPresbitero = diasDesdeConsagracao !== null ? diasDesdeConsagracao / 365 : null;

  const afmResult = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT TOP 1 NivelEscolaridade AS nivelEscolaridade, CertificadoHabilitacao AS certificadoHabilitacao
    FROM Matriculas_AFM
    WHERE MembroId = @id
    ORDER BY MatriculaId DESC
  `);
  const afm = afmResult.recordset[0] || null;
  const afmAvancadoComCertificado = !!(afm &&
    ["AVANCADO", "BACHAREL"].includes(afm.nivelEscolaridade) &&
    afm.certificadoHabilitacao);

  const hoje = new Date().toISOString().slice(0, 10);
  const disciplinaResult = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT TOP 1 ProcessoId FROM ProcessosDisciplinares
    WHERE MembroId = @id AND Resultado IN ('SANCAO', 'EXCLUSAO')
      AND DataAbertura >= DATEADD(year, -10, CAST('${hoje}' AS DATE))
  `);
  const disciplinaRigorosaUltimos10Anos = disciplinaResult.recordset.length > 0;

  return {
    cargoMinisterial,
    anosDesdeConsagracaoPresbitero,
    afmAvancadoComCertificado,
    disciplinaRigorosaUltimos10Anos
  };
}

module.exports = { dadosElegibilidadeCEI };
