// shared/consolidadoDepartamental.js (v5.5.1 — Consolidado de Campo)
// O relatório mensal (v5.2/v5.3) responde "como foi o mês do UCADESPA na
// Congregação X"; este módulo responde a pergunta inversa: "como está a
// Congregação X (ou a Área Y, ou o Campo inteiro) neste mês, olhando os 8
// departamentos juntos?" — o retrato eclesiástico que o Regimento pede.
const { sql } = require("./db");

const NIVEIS_VALIDOS = ["congregacao", "area", "campo"];
const STATUS_NAO_PENDENTE = ["ENVIADO", "APROVADO_AREA", "APROVADO_GERAL", "RETIFICADO"];

// Pendência é calculada, nunca marcada à mão: sem relatório nenhum, ou
// relatório ainda em RASCUNHO (o líder local nem enviou), conta como
// pendente — só ENVIADO ou além entra na soma do consolidado (números que
// ainda estão em rascunho podem mudar, não são "o mês", ainda).
function relatorioEstaPendente(status) {
  return !status || status === "RASCUNHO";
}

// Mesmo princípio de `resolverEscopoCongregacoes` (shared/escopo.js), aqui
// devolvendo CongregacaoId (não nome) porque a agregação é por id.
async function resolverCongregacoesDoNivel(pool, nivel, id) {
  if (nivel === "congregacao") return [Number(id)];
  if (nivel === "area") {
    const r = await pool.request().input("areaId", sql.Int, id).query(`SELECT CongregacaoId FROM Congregacoes WHERE AreaId = @areaId AND Ativa = 1`);
    return r.recordset.map(row => row.CongregacaoId);
  }
  const r = await pool.request().query(`SELECT CongregacaoId FROM Congregacoes WHERE Ativa = 1`);
  return r.recordset.map(row => row.CongregacaoId);
}

function totaisVazios() {
  return {
    eventosLocal: 0, eventosArea: 0, eventosGeral: 0,
    integracaoConversao: 0, integracaoReconciliacao: 0, integracaoDeOutraIgreja: 0,
    valorParaGeral: 0, valorParaLocal: 0
  };
}

// Cruza TODAS as congregações do escopo × os 8 departamentos — nunca soma
// silenciosamente quem não mandou relatório: aparece como pendência, não
// como zero invisível (um mês incompleto não pode se passar por completo).
function agregarConsolidado(linhas) {
  const porDepartamentoMap = new Map();
  const pendencias = [];
  const totais = totaisVazios();

  for (const linha of linhas) {
    if (!porDepartamentoMap.has(linha.departamentoId)) {
      porDepartamentoMap.set(linha.departamentoId, {
        departamentoId: linha.departamentoId, sigla: linha.sigla, nome: linha.nome,
        totalCongregacoes: 0, totalEnviados: 0, totalPendentes: 0,
        ...totaisVazios()
      });
    }
    const dep = porDepartamentoMap.get(linha.departamentoId);
    dep.totalCongregacoes += 1;

    if (relatorioEstaPendente(linha.status)) {
      dep.totalPendentes += 1;
      pendencias.push({
        departamentoId: linha.departamentoId, sigla: linha.sigla,
        congregacaoId: linha.congregacaoId, congregacaoNome: linha.congregacaoNome,
        status: linha.status || "NAO_INICIADO"
      });
      continue;
    }

    dep.totalEnviados += 1;
    for (const campo of Object.keys(totaisVazios())) {
      const valor = Number(linha[campo]) || 0;
      dep[campo] += valor;
      totais[campo] += valor;
    }
  }

  return { porDepartamento: [...porDepartamentoMap.values()], totais, pendencias };
}

async function consolidarPorDepartamento(pool, congregacaoIds, mesReferencia, anoReferencia) {
  if (congregacaoIds.length === 0) return { porDepartamento: [], totais: totaisVazios(), pendencias: [] };

  const request = pool.request().input("mes", sql.Int, mesReferencia).input("ano", sql.Int, anoReferencia);
  const placeholders = congregacaoIds.map((id, i) => { request.input(`cong${i}`, sql.Int, id); return `@cong${i}`; }).join(",");
  const result = await request.query(`
    SELECT d.DepartamentoId AS departamentoId, d.Sigla AS sigla, d.Nome AS nome,
           c.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
           r.Status AS status,
           r.EventosLocal AS eventosLocal, r.EventosArea AS eventosArea, r.EventosGeral AS eventosGeral,
           r.IntegracaoConversao AS integracaoConversao, r.IntegracaoReconciliacao AS integracaoReconciliacao,
           r.IntegracaoDeOutraIgreja AS integracaoDeOutraIgreja,
           r.ValorParaGeral AS valorParaGeral, r.ValorParaLocal AS valorParaLocal
    FROM Congregacoes c
    CROSS JOIN Departamentos d
    LEFT JOIN RelatoriosDepartamentais r ON r.DepartamentoId = d.DepartamentoId AND r.CongregacaoId = c.CongregacaoId
      AND r.MesReferencia = @mes AND r.AnoReferencia = @ano
    WHERE c.CongregacaoId IN (${placeholders}) AND d.Ativo = 1
    ORDER BY d.Numero, c.Nome
  `);
  return agregarConsolidado(result.recordset);
}

// Comparativo mês a mês/ano a ano (docs/08 do protótipo) — só relatórios já
// ENVIADOS ou além entram (mesmo critério de "não pendente" acima). Devolve
// em ordem cronológica (mais antigo primeiro), pronto pra série histórica.
async function historicoConsolidado(pool, congregacaoIds, quantidadePeriodos) {
  if (congregacaoIds.length === 0) return [];
  const request = pool.request().input("quantidade", sql.Int, quantidadePeriodos);
  const placeholders = congregacaoIds.map((id, i) => { request.input(`cong${i}`, sql.Int, id); return `@cong${i}`; }).join(",");
  const result = await request.query(`
    SELECT TOP (@quantidade) MesReferencia AS mesReferencia, AnoReferencia AS anoReferencia,
           COUNT(*) AS totalRelatorios,
           ISNULL(SUM(EventosLocal + EventosArea + EventosGeral), 0) AS totalEventos,
           ISNULL(SUM(IntegracaoConversao + IntegracaoReconciliacao + IntegracaoDeOutraIgreja), 0) AS totalIntegracao,
           ISNULL(SUM(ValorParaGeral), 0) AS totalParaGeral,
           ISNULL(SUM(ValorParaLocal), 0) AS totalParaLocal
    FROM RelatoriosDepartamentais
    WHERE CongregacaoId IN (${placeholders}) AND Status IN ('${STATUS_NAO_PENDENTE.join("','")}')
    GROUP BY AnoReferencia, MesReferencia
    ORDER BY AnoReferencia DESC, MesReferencia DESC
  `);
  return result.recordset.reverse();
}

module.exports = {
  NIVEIS_VALIDOS, STATUS_NAO_PENDENTE,
  relatorioEstaPendente, resolverCongregacoesDoNivel, agregarConsolidado,
  consolidarPorDepartamento, historicoConsolidado, totaisVazios
};
