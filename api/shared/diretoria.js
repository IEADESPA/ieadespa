// shared/diretoria.js (v2.5)
// Diretoria Executiva — Art. 29 (composição), Art. 32 (vacância/sucessão),
// Art. 38 §3º, II (incompatibilidade com CEI/Conselho Fiscal). Reaproveita
// Assentos (mandato via duracaoMeses já calculado — Art. 30) e o padrão de
// prazo calculado na leitura (estatuto.diasDesde), sem tabela nova.
const estatuto = require("./estatuto");

// Art. 29 — 10 cargos de preenchimento obrigatório, 1 ocupante ativo por vez
// cada. ordemSucessao só existe pros 4 Vice-Presidentes (Art. 32).
const CARGOS_DIRETORIA = {
  PRESIDENTE: { rotulo: "Presidente", ordemSucessao: null },
  VICE_PRESIDENTE_1: { rotulo: "1º Vice-Presidente", ordemSucessao: 1 },
  VICE_PRESIDENTE_2: { rotulo: "2º Vice-Presidente", ordemSucessao: 2 },
  VICE_PRESIDENTE_3: { rotulo: "3º Vice-Presidente", ordemSucessao: 3 },
  VICE_PRESIDENTE_4: { rotulo: "4º Vice-Presidente", ordemSucessao: 4 },
  SECRETARIO_1: { rotulo: "1º Secretário", ordemSucessao: null },
  SECRETARIO_2: { rotulo: "2º Secretário", ordemSucessao: null },
  SECRETARIO_3: { rotulo: "3º Secretário", ordemSucessao: null },
  TESOUREIRO_1: { rotulo: "1º Tesoureiro", ordemSucessao: null },
  TESOUREIRO_2: { rotulo: "2º Tesoureiro", ordemSucessao: null }
};

// Art. 43 §1º — 3 titulares + até 3 suplentes, mandato coincide com o da
// Diretoria. Mesmo padrão "1 titular por cargo fixo" da Diretoria.
const CARGOS_CONSELHO_FISCAL = {
  TITULAR_1: { rotulo: "1º Titular" },
  TITULAR_2: { rotulo: "2º Titular" },
  TITULAR_3: { rotulo: "3º Titular" },
  SUPLENTE_1: { rotulo: "1º Suplente" },
  SUPLENTE_2: { rotulo: "2º Suplente" },
  SUPLENTE_3: { rotulo: "3º Suplente" }
};

// Catálogo de cargos fixos por órgão — usado genericamente em GestaoAssentos
// pra validar cargoOuFuncao e o cap de 1 ocupante ativo por cargo.
const CATALOGOS_CARGOS_POR_ORGAO = {
  DIRETORIA_EXECUTIVA: CARGOS_DIRETORIA,
  CONSELHO_FISCAL: CARGOS_CONSELHO_FISCAL
};

// Art. 38 §3º, II — "é vedado o acúmulo de cargos entre o CEI, a Diretoria
// Executiva e o Conselho Fiscal". Incompatibilidade de 3 vias, só entre
// esses 3 — nenhum outro órgão é afetado.
const ORGAOS_INCOMPATIVEIS = ["DIRETORIA_EXECUTIVA", "CONSELHO_FISCAL", "CEI"];

const DIAS_INDICACAO_CIADSETA = 90; // Art. 32 §2º
const DIAS_AGE_APOS_PRAZO = 30;     // Art. 32 §3º

// Retorna { bloqueado, mensagem } — chamado de GestaoAssentos antes de criar
// um Assento em qualquer um dos 3 órgãos incompatíveis.
async function validarIncompatibilidadeExecutiva(pool, sql, membroId, orgaoSiglaAlvo) {
  if (!ORGAOS_INCOMPATIVEIS.includes(orgaoSiglaAlvo)) return { bloqueado: false };
  const outros = ORGAOS_INCOMPATIVEIS.filter(s => s !== orgaoSiglaAlvo);
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT o.Sigla AS sigla
    FROM Assentos a
    JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
    WHERE a.MembroId = @membroId AND a.DataFim IS NULL
      AND o.Sigla IN ('${outros.join("','")}')
  `);
  if (result.recordset.length === 0) return { bloqueado: false };
  const conflito = result.recordset[0].sigla;
  return {
    bloqueado: true,
    mensagem: `Não é possível: essa pessoa já tem assento ativo em ${conflito} — é vedado o acúmulo de cargos entre CEI, Diretoria Executiva e Conselho Fiscal (Art. 38 §3º, II).`
  };
}

// Art. 29 — cargo único ativo por vez na Diretoria.
async function cargoJaOcupado(pool, sql, orgaoIdDiretoria, cargoSigla) {
  const result = await pool.request()
    .input("orgaoId", sql.Int, orgaoIdDiretoria)
    .input("cargo", sql.NVarChar(50), cargoSigla)
    .query(`SELECT TOP 1 AssentoId FROM Assentos WHERE OrgaoId = @orgaoId AND CargoOuFuncao = @cargo AND DataFim IS NULL`);
  return result.recordset.length > 0;
}

// Art. 32 — vacância/sucessão presidencial. Busca o Assento de PRESIDENTE mais
// recente: se ativo, não há vacância; se encerrado, calcula quem assume
// interinamente (próximo Vice ativo, na ordem; sem nenhum, cai pro CEI) e os
// prazos (90 dias indicação CIADSETA, +30 dias AGE) a partir da DataFim —
// mesmo princípio de prazo calculado na leitura já usado em Abandono/Cartas.
async function calcularSucessaoPresidencial(pool, sql, orgaoIdDiretoria, orgaoIdCEI) {
  const presidenteResult = await pool.request().input("orgaoId", sql.Int, orgaoIdDiretoria).query(`
    SELECT TOP 1 a.AssentoId AS assentoId, a.MembroId AS membroId, m.Nome AS nome,
           CONVERT(varchar(10), a.DataFim, 120) AS dataFim, a.DataFim AS dataFimRaw
    FROM Assentos a JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE a.OrgaoId = @orgaoId AND a.CargoOuFuncao = 'PRESIDENTE'
    ORDER BY a.DataInicio DESC
  `);
  const presidente = presidenteResult.recordset[0];

  if (presidente && !presidente.dataFimRaw) {
    return { vago: false, presidente: { membroId: presidente.membroId, nome: presidente.nome } };
  }

  // Sem ninguém jamais cadastrado como Presidente, ou o último foi encerrado: vago.
  const vicesResult = await pool.request().input("orgaoId", sql.Int, orgaoIdDiretoria).query(`
    SELECT a.CargoOuFuncao AS cargo, a.MembroId AS membroId, m.Nome AS nome
    FROM Assentos a JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE a.OrgaoId = @orgaoId AND a.DataFim IS NULL
      AND a.CargoOuFuncao IN ('VICE_PRESIDENTE_1','VICE_PRESIDENTE_2','VICE_PRESIDENTE_3','VICE_PRESIDENTE_4')
  `);
  const vicesPorOrdem = vicesResult.recordset
    .map(v => Object.assign({}, v, { ordem: CARGOS_DIRETORIA[v.cargo].ordemSucessao }))
    .sort((a, b) => a.ordem - b.ordem);

  let interino = vicesPorOrdem[0] || null;
  let viaCEI = false;
  if (!interino) {
    const ceiResult = await pool.request().input("orgaoId", sql.Int, orgaoIdCEI).query(`
      SELECT TOP 1 a.MembroId AS membroId, m.Nome AS nome
      FROM Assentos a JOIN MembroReferencia m ON m.MembroId = a.MembroId
      WHERE a.OrgaoId = @orgaoId AND a.DataFim IS NULL
      ORDER BY a.DataInicio
    `);
    interino = ceiResult.recordset[0] || null;
    viaCEI = true;
  }

  const dataFim = presidente ? presidente.dataFim : null;
  const diasDesdeVacancia = dataFim ? estatuto.diasDesde(dataFim) : null;
  const prazoIndicacaoVencido = diasDesdeVacancia !== null && diasDesdeVacancia > DIAS_INDICACAO_CIADSETA;
  const diasAposPrazoIndicacao = prazoIndicacaoVencido ? diasDesdeVacancia - DIAS_INDICACAO_CIADSETA : null;
  const prazoAgeVencido = diasAposPrazoIndicacao !== null && diasAposPrazoIndicacao > DIAS_AGE_APOS_PRAZO;

  return {
    vago: true,
    dataVacancia: dataFim,
    diasDesdeVacancia,
    interino: interino ? { membroId: interino.membroId, nome: interino.nome, viaCEI } : null,
    prazoIndicacaoCiadseta: { dias: DIAS_INDICACAO_CIADSETA, vencido: prazoIndicacaoVencido },
    prazoAge: prazoIndicacaoVencido ? { dias: DIAS_AGE_APOS_PRAZO, vencido: prazoAgeVencido } : null
  };
}

module.exports = {
  CARGOS_DIRETORIA,
  CARGOS_CONSELHO_FISCAL,
  CATALOGOS_CARGOS_POR_ORGAO,
  ORGAOS_INCOMPATIVEIS,
  validarIncompatibilidadeExecutiva,
  cargoJaOcupado,
  calcularSucessaoPresidencial
};
