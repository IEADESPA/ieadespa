// shared/tesourariaDepartamental.js (v5.4 — Tesouraria Central por
// Departamento + Rateio). Fonte: protótipo conceitual
// `relatorios-departamentos` (docs/04-05, ver README FASE 5).
//
// Financeiro EXCLUSIVO do departamento — NÃO integra com
// SaidasTesouraria/RateioGeralValores da FASE 4 (decisão do usuário, ver
// migração 095). Por isso este módulo reaproveita o PRINCÍPIO de
// `shared/tesouraria.js::saldoCentroCusto` (saldo = liberado − pago,
// sempre calculado) sem chamar a função literal, que opera sobre os
// livros da FASE 4.
const { sql } = require("./db");

const METODOS_VALIDOS = ["INTEGRAL_GERAL", "INTEGRAL_LOCAL", "MENSALIDADE_FIXA", "PERCENTUAL", "VARIAVEL_MANUAL"];
const MODOS_ENTRADA_VALIDOS = ["BRUTO_CALCULADO", "LIQUIDO_MANUAL"];

// Rateio linha a linha (camada 1) — nunca digitado à mão, sempre derivado
// do método configurado no PerfilRateioDepartamental daquele departamento.
// `paraLocal` pode vir `null`: em LIQUIDO_MANUAL o valor bruto e a parcela
// que ficou local nunca passam pelo sistema (docs/04) — reportar 0 seria
// fabricar um número que ninguém mediu.
function calcularRateio(perfil, valorTotalFinanceiro, valorManualParaGeral) {
  const total = Number(valorTotalFinanceiro) || 0;
  const { metodo, percentualGeral, modoEntrada } = perfil;

  if (metodo === "INTEGRAL_GERAL") return { paraGeral: total, paraLocal: 0 };
  if (metodo === "INTEGRAL_LOCAL") return { paraGeral: 0, paraLocal: total };

  if (metodo === "VARIAVEL_MANUAL") {
    const geral = Number(valorManualParaGeral) || 0;
    return { paraGeral: geral, paraLocal: Math.round((total - geral) * 100) / 100 };
  }

  // PERCENTUAL e MENSALIDADE_FIXA compartilham o mesmo cálculo de divisão
  // — a fração que sobe é o `percentualGeral` configurado no perfil (pra
  // MENSALIDADE_FIXA, é a fração combinada com aquele departamento, ex.
  // USADESPA); não duplica fórmula pros dois métodos.
  if (metodo === "PERCENTUAL" || metodo === "MENSALIDADE_FIXA") {
    if (modoEntrada === "LIQUIDO_MANUAL") {
      return { paraGeral: total, paraLocal: null };
    }
    const pct = Number(percentualGeral) || 0;
    const geral = Math.round(total * (pct / 100) * 100) / 100;
    return { paraGeral: geral, paraLocal: Math.round((total - geral) * 100) / 100 };
  }

  return { paraGeral: 0, paraLocal: total };
}

// Art. 49, I — acima do limite parametrizado, a despesa exige autorização
// por escrito do Pastor Presidente/1º Secretário (nível GLOBAL).
function precisaAutorizacao(valor, limite) {
  return (Number(valor) || 0) > (Number(limite) || 0);
}

function calcularSaldoMes({ saldoTransportado, movimentacaoGeralMes, suporteSecretariaGeral, totalDespesas }) {
  const saldo = (Number(saldoTransportado) || 0) + (Number(movimentacaoGeralMes) || 0)
    - (Number(suporteSecretariaGeral) || 0) - (Number(totalDespesas) || 0);
  return Math.round(saldo * 100) / 100;
}

function mesAnteriorReferencia(mesReferencia, anoReferencia) {
  return mesReferencia === 1 ? { mes: 12, ano: anoReferencia - 1 } : { mes: mesReferencia - 1, ano: anoReferencia };
}

async function buscarPerfilRateio(pool, departamentoId) {
  const result = await pool.request().input("depId", sql.Int, departamentoId).query(`
    SELECT p.PerfilRateioId AS perfilRateioId, p.SchemaRelatorioId AS schemaRelatorioId,
           p.Metodo AS metodo, p.PercentualGeral AS percentualGeral, p.ModoEntrada AS modoEntrada,
           p.SuporteSecretariaGeralHabilitado AS suporteSecretariaGeralHabilitado,
           p.ValorSuporteSecretariaGeral AS valorSuporteSecretariaGeral, p.Confirmado AS confirmado
    FROM PerfisRateioDepartamental p
    JOIN SchemasRelatorioDepartamental s ON s.SchemaRelatorioId = p.SchemaRelatorioId
    WHERE s.DepartamentoId = @depId AND s.DataVigenciaFim IS NULL
  `);
  const perfil = result.recordset[0];
  if (!perfil) return null;
  return { ...perfil, suporteSecretariaGeralHabilitado: !!perfil.suporteSecretariaGeralHabilitado, confirmado: !!perfil.confirmado };
}

// Saldo transportado do novo fechamento = SaldoMes do fechamento anterior
// mais recente (0 se for o primeiro fechamento do departamento — nunca
// fabrica saldo histórico que não foi calculado por este sistema).
async function buscarUltimoFechamento(pool, departamentoId, antesDeMes, antesDeAno) {
  const result = await pool.request()
    .input("depId", sql.Int, departamentoId).input("mes", sql.Int, antesDeMes).input("ano", sql.Int, antesDeAno)
    .query(`
      SELECT TOP 1 SaldoMes AS saldoMes, MesReferencia AS mesReferencia, AnoReferencia AS anoReferencia
      FROM TesourariasDepartamento
      WHERE DepartamentoId = @depId AND (AnoReferencia < @ano OR (AnoReferencia = @ano AND MesReferencia < @mes))
      ORDER BY AnoReferencia DESC, MesReferencia DESC
    `);
  return result.recordset[0] || null;
}

// Reg. Art. 133-C §2º — "a não apresentação do balancete mensal bloqueia
// imediatamente a liberação de novos recursos". Calculado na leitura: só
// bloqueia se o departamento já tinha relatório antes/no mês anterior (ou
// seja, já estava em operação) e esse mês anterior ainda não foi fechado.
// Departamento sem nenhuma atividade anterior não tem o que "não entregar".
async function balanceteBloqueado(pool, departamentoId, mesReferencia, anoReferencia) {
  const { mes, ano } = mesAnteriorReferencia(mesReferencia, anoReferencia);

  const primeiraAtividade = await pool.request().input("depId", sql.Int, departamentoId).query(`
    SELECT MIN(AnoReferencia * 100 + MesReferencia) AS chave FROM RelatoriosDepartamentais WHERE DepartamentoId = @depId
  `);
  const chavePrimeira = primeiraAtividade.recordset[0].chave;
  const chaveAnterior = ano * 100 + mes;
  if (chavePrimeira === null || chaveAnterior < chavePrimeira) return false;

  const fechamento = await pool.request().input("depId", sql.Int, departamentoId).input("mes", sql.Int, mes).input("ano", sql.Int, ano)
    .query(`SELECT TOP 1 1 AS existe FROM TesourariasDepartamento WHERE DepartamentoId = @depId AND MesReferencia = @mes AND AnoReferencia = @ano`);
  return fechamento.recordset.length === 0;
}

module.exports = {
  METODOS_VALIDOS, MODOS_ENTRADA_VALIDOS,
  calcularRateio, precisaAutorizacao, calcularSaldoMes, mesAnteriorReferencia,
  buscarPerfilRateio, buscarUltimoFechamento, balanceteBloqueado
};
