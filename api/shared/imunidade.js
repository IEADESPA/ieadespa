// shared/imunidade.js (v4.20)
// Painel de Imunidade Tributária (CF Art. 150, VI, "b" + CTN Art. 14):
//   - Semáforo dos 3 requisitos, CALCULADO NA LEITURA:
//     (I) não distribuir patrimônio/renda — pagamentos a ministros fora de
//         rubrica válida (cruza Fornecedores.CpfCnpj com Prebendados.Cpf);
//     (II) aplicar recursos integralmente no País — fornecedores estrangeiros;
//     (III) escrituração formal — % de lançamentos com comprovante anexado.
//   - Alerta de conflito de interesses (pagamento a ministro aprovado por
//     parente — cruza VinculosFamiliares com SaidaAprovacoes).
//   - Carga tributária embutida (LC 214/2025 — IBS/CBS não recuperável).
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

const RUBRICAS_VALIDAS = ["PREBENDA_PASTORAL", "AUXILIO_MORADIA", "AUXILIO_TRANSPORTE", "AUXILIO_SAUDE", "AUXILIO_OUTROS"];

async function calcularSemaforo(pool, sql) {
  // (I) pagamentos a ministros (CPF casa com Prebendados).
  const ministros = await pool.request().query(`
    SELECT s.SaidaId AS saidaId, s.Valor AS valor, s.Tipo AS tipo, s.Status AS status,
           f.Nome AS fornecedor, f.CpfCnpj AS cpfCnpj, m.Nome AS ministro
    FROM SaidasTesouraria s
    JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
    JOIN Prebendados p ON p.Cpf = f.CpfCnpj
    JOIN MembroReferencia m ON m.MembroId = p.MembroId
    WHERE s.Status IN ('APROVADA', 'PAGA')
  `);
  const foraRubrica = ministros.recordset.filter(s => !RUBRICAS_VALIDAS.includes(s.tipo));

  // (II) remessas ao exterior.
  const exterior = await pool.request().query(`
    SELECT s.SaidaId AS saidaId, s.Valor AS valor, f.Nome AS fornecedor
    FROM SaidasTesouraria s JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
    WHERE f.Estrangeiro = 1 AND s.Status IN ('APROVADA', 'PAGA')
  `);

  // (III) % de lançamentos confirmados com comprovante.
  const escrit = await pool.request().query(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN ComprovanteUrl IS NOT NULL THEN 1 ELSE 0 END) AS comComprovante
    FROM LancamentosTesouraria WHERE Status = 'ATIVO' AND StatusConfirmacao = 'CONFIRMADO'
  `);
  const total = Number(escrit.recordset[0].total);
  const comComprovante = Number(escrit.recordset[0].comComprovante);
  const pctComprovante = total > 0 ? Math.round(comComprovante / total * 100) : 100;

  const okI = foraRubrica.length === 0;
  const okII = exterior.recordset.length === 0;
  const okIII = pctComprovante >= 90;
  const semaforoGeral = (okI && okII && okIII) ? "VERDE" : "ATENCAO";

  return {
    semaforoGeral,
    requisitoI: { rotulo: "Não distribuir patrimônio/renda", ok: okI, pagamentosAMinistros: ministros.recordset.length, foraRubrica },
    requisitoII: { rotulo: "Aplicar recursos integralmente no País", ok: okII, remessasExterior: exterior.recordset },
    requisitoIII: { rotulo: "Escrituração em livros formais (comprovante)", ok: okIII, pctComprovante, totalLancamentos: total, comComprovante }
  };
}

async function conflitosInteresse(pool, sql) {
  const res = await pool.request().query(`
    SELECT s.SaidaId AS saidaId, s.Valor AS valor, f.Nome AS fornecedor, m.Nome AS ministro,
           ma.Nome AS aprovadorNome, ma.MembroId AS aprovadorId
    FROM SaidasTesouraria s
    JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
    JOIN Prebendados p ON p.Cpf = f.CpfCnpj
    JOIN MembroReferencia m ON m.MembroId = p.MembroId
    JOIN SaidaAprovacoes a ON a.SaidaId = s.SaidaId
    JOIN MembroReferencia ma ON ma.MembroId = a.AprovadoPor
    WHERE s.Status IN ('APROVADA', 'PAGA')
      AND EXISTS (SELECT 1 FROM VinculosFamiliares v WHERE v.MembroId = p.MembroId AND v.MembroParenteId = a.AprovadoPor)
    ORDER BY s.Valor DESC
  `);
  return res.recordset;
}

async function cargaTributaria(pool, sql, ano) {
  const res = await pool.request().input("ano", sql.Int, ano).query(`
    SELECT s.SaidaId AS saidaId, s.Descricao AS descricao, s.Valor AS valor, s.TributosEmbutidos AS tributosEmbutidos, f.Nome AS fornecedor
    FROM SaidasTesouraria s JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
    WHERE s.TributosEmbutidos IS NOT NULL AND YEAR(s.SolicitadoEm) = @ano
    ORDER BY s.TributosEmbutidos DESC
  `);
  const totalCompras = round2(res.recordset.reduce((a, r) => a + Number(r.valor), 0));
  const totalTributos = round2(res.recordset.reduce((a, r) => a + Number(r.tributosEmbutidos), 0));
  return {
    ano,
    itens: res.recordset,
    totalCompras,
    totalTributosEmbutidos: totalTributos,
    pctCargaEmbutida: totalCompras > 0 ? round2(totalTributos / totalCompras * 100) : 0
  };
}

module.exports = { calcularSemaforo, conflitosInteresse, cargaTributaria, round2 };
