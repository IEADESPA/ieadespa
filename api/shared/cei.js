// shared/cei.js (v3.1)
// Busca os dados objetivos usados por estatuto.avaliarElegibilidadeCEI —
// só query, nenhuma regra aqui (regra fica em estatuto.js, puro e sem banco,
// mesmo padrão do resto do projeto).
const estatuto = require("./estatuto");

async function dadosElegibilidadeCEI(pool, sql, membroId) {
  const membroResult = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @id`);
  const cargoMinisterial = membroResult.recordset[0] ? membroResult.recordset[0].CargoMinisterial : null;

  // Trava 8-A: o tempo de Presbítero vem do histórico de cargos da v8.2 (o primeiro dia como Presbítero, ou acima — quem já é Evangelista ou Pastor passou por lá),
  // que cobre também quem veio por nomeação, outra convenção ou o cadastro antigo; sem histórico, vale a consagração concluída como antes.
  const consagracaoResult = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT COALESCE(
      (SELECT CONVERT(varchar(10), MIN(h.Desde), 120) FROM CargosMinisteriaisHistorico h WHERE h.MembroId = @id AND h.Cargo IN (N'PRESBITERO', N'EVANGELISTA', N'PASTOR')),
      (SELECT TOP 1 CONVERT(varchar(10), DataConclusao, 120) FROM Consagracoes WHERE MembroId = @id AND Status = 'CONCLUIDO' AND Assunto LIKE '%Presb%' ORDER BY DataConclusao DESC)
    ) AS dataConclusao
  `);
  const dataConsagracaoPresbitero = consagracaoResult.recordset[0] ? consagracaoResult.recordset[0].dataConclusao : null;
  const diasDesdeConsagracao = dataConsagracaoPresbitero ? estatuto.diasDesde(dataConsagracaoPresbitero) : null;
  const anosDesdeConsagracaoPresbitero = diasDesdeConsagracao !== null ? diasDesdeConsagracao / 365 : null;

  const afmResult = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT TOP 1 NivelEscolaridade AS nivelEscolaridade, StatusMatricula AS statusMatricula,
           -- Trava 8-A: a cerimônia "usa" o CHM (a marca da matrícula zera na promoção), mas o certificado continua válido — a habilitação conta pelos dois
           CASE WHEN CertificadoHabilitacao = 1 OR EXISTS (SELECT 1 FROM CertificadosEmitidos ce WHERE ce.MembroId = @id AND ce.Natureza = N'CHM' AND (ce.RevogadoEm IS NULL OR (ce.MotivoRevogacao LIKE N'Usado na consagração%' AND ce.MotivoRevogacao NOT LIKE N'%Perdeu o efeito%')))
                THEN 1 ELSE 0 END AS certificadoHabilitacao
    FROM Matriculas_AFM
    WHERE MembroId = @id
    ORDER BY MatriculaId DESC
  `);
  const afm = afmResult.recordset[0] || null;
  // v8.1: a matrícula inativa (desmatriculado por faltas ou reprovação) não habilita — Regimento Art. 72 exige a Matrícula Ativa
  // v8.7: o nível vem também do histórico escolar (o curso que cursa ou concluiu)
  const doHistorico = ((await require("./seminarioDb").niveisHistorico(pool, [membroId])).get(Number(membroId)) || []).map((p) => p.nivel);
  const afmAvancadoComCertificado = !!(afm && afm.statusMatricula !== "INATIVA" &&
    [afm.nivelEscolaridade, ...doHistorico].some((n) => ["AVANCADO", "BACHAREL"].includes(n)) &&
    afm.certificadoHabilitacao);

  const hoje = new Date().toISOString().slice(0, 10);
  const disciplinaResult = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT TOP 1 ProcessoId FROM ProcessosDisciplinares
    WHERE MembroId = @id AND Resultado IN ('SANCAO', 'EXCLUSAO') AND CEIRecusouEm IS NULL
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
