// shared/consolidadoDepartamental.js (v5.5.1 — Consolidado de Campo;
// v5.8 — Região/Quadrante/Distrito, série histórica por campo e comparativo
// por porte)
// O relatório mensal (v5.2/v5.3) responde "como foi o mês do UCADESPA na
// Congregação X"; este módulo responde a pergunta inversa: "como está a
// Congregação X (ou a Área Y, ou o Campo inteiro) neste mês, olhando os 8
// departamentos juntos?" — o retrato eclesiástico que o Regimento pede.
//
// v5.8 (item 1) — mesmo vocabulário territorial de shared/escopo.js
// (QUERY_POR_TIPO): Área -> Região -> Quadrante -> Distrito é hierarquia de
// vínculo pai (migração 004), não colunas soltas em Congregacoes — por isso
// resolverCongregacoesDoNivel só precisa subir a cadeia com os mesmos
// subselects já usados lá, nunca reimplementar a hierarquia.
const { sql } = require("./db");

const NIVEIS_VALIDOS = ["congregacao", "area", "regiao", "quadrante", "distrito", "campo"];
const STATUS_NAO_PENDENTE = ["ENVIADO", "APROVADO_AREA", "APROVADO_GERAL", "RETIFICADO"];

// v5.8 (item 3) — "porte" não existe como cadastro hoje (nenhuma planilha do
// protótipo definia faixa); em vez de inventar uma classificação manual sem
// lastro, é derivado ao vivo da própria contagem de membros ativos
// (MembroReferencia, mesma fonte que os 4 departamentos de faixa etária já
// usam desde a v5.5) — nunca fica desatualizado, nunca depende de alguém
// lembrar de reclassificar. Limiares são julgamento documentado (sem
// referência normativa pra faixa "certa"): redondos, e ajustáveis aqui sem
// migração se a Diretoria calibrar diferente mais tarde.
const LIMITES_PORTE = { PEQUENA: 100, MEDIA: 300 };
function classificarPorte(totalMembrosAtivos) {
  const total = Number(totalMembrosAtivos) || 0;
  if (total < LIMITES_PORTE.PEQUENA) return "PEQUENA";
  if (total < LIMITES_PORTE.MEDIA) return "MEDIA";
  return "GRANDE";
}

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
  // v5.8 — Região/Quadrante/Distrito: mesma cadeia de vínculo pai que
  // shared/escopo.js::QUERY_POR_TIPO já usa pra resolver escopo de sessão,
  // só devolvendo CongregacaoId em vez de Nome (agregação é por id).
  if (nivel === "regiao") {
    const r = await pool.request().input("regiaoId", sql.Int, id).query(`
      SELECT CongregacaoId FROM Congregacoes WHERE Ativa = 1 AND AreaId IN (
        SELECT AreaId FROM Areas WHERE RegiaoId = @regiaoId
      )`);
    return r.recordset.map(row => row.CongregacaoId);
  }
  if (nivel === "quadrante") {
    const r = await pool.request().input("quadranteId", sql.Int, id).query(`
      SELECT CongregacaoId FROM Congregacoes WHERE Ativa = 1 AND AreaId IN (
        SELECT AreaId FROM Areas WHERE RegiaoId IN (
          SELECT RegiaoId FROM Regioes WHERE QuadranteId = @quadranteId
        )
      )`);
    return r.recordset.map(row => row.CongregacaoId);
  }
  if (nivel === "distrito") {
    const r = await pool.request().input("distritoId", sql.Int, id).query(`
      SELECT CongregacaoId FROM Congregacoes WHERE Ativa = 1 AND AreaId IN (
        SELECT AreaId FROM Areas WHERE RegiaoId IN (
          SELECT RegiaoId FROM Regioes WHERE QuadranteId IN (
            SELECT QuadranteId FROM Quadrantes WHERE DistritoId = @distritoId
          )
        )
      )`);
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

// v5.8 (item 2) — série histórica POR CAMPO do formulário (não por total
// agregado, que já é o que historicoConsolidado faz desde a v5.5.1): "o
// mesmo campo, mês a mês" só faz sentido dentro de um departamento (nomeCampo
// não é chave global — "outros"/"ofertas" se repetem em vários schemas com
// significado próprio em cada um). SUM(v.Valor) sem filtrar NumeroDomingo
// cobre os dois casos com a mesma query: campo semanal (EBD) tem uma linha
// por domingo lançado e soma igual ao mês; campo mensal tem uma linha só
// (NumeroDomingo NULL) — nunca precisa de union nem de calcular semanal à
// parte, o SUM já faz a coisa certa nos dois formatos de armazenamento.
async function serieHistoricaCampo(pool, congregacaoIds, departamentoId, nomeCampo, quantidadePeriodos) {
  if (congregacaoIds.length === 0 || !departamentoId || !nomeCampo) return [];
  const request = pool.request()
    .input("depId", sql.Int, departamentoId).input("nomeCampo", sql.NVarChar(60), nomeCampo)
    .input("quantidade", sql.Int, quantidadePeriodos);
  const placeholders = congregacaoIds.map((id, i) => { request.input(`cong${i}`, sql.Int, id); return `@cong${i}`; }).join(",");
  const result = await request.query(`
    SELECT TOP (@quantidade) r.AnoReferencia AS anoReferencia, r.MesReferencia AS mesReferencia,
           ISNULL(SUM(v.Valor), 0) AS total, COUNT(DISTINCT r.RelatorioDepartamentalId) AS totalRelatorios
    FROM RelatoriosDepartamentais r
    JOIN CamposFormularioDepartamental c ON c.SchemaRelatorioId = r.SchemaRelatorioId AND c.NomeCampo = @nomeCampo
    JOIN ValoresCampoRelatorioDepartamental v ON v.RelatorioDepartamentalId = r.RelatorioDepartamentalId AND v.CampoFormularioId = c.CampoFormularioId
    WHERE r.CongregacaoId IN (${placeholders}) AND r.DepartamentoId = @depId
      AND r.Status IN ('${STATUS_NAO_PENDENTE.join("','")}')
    GROUP BY r.AnoReferencia, r.MesReferencia
    ORDER BY r.AnoReferencia DESC, r.MesReferencia DESC
  `);
  return result.recordset.reverse();
}

// v5.8 (item 2, complemento) — comparação "ano a ano" pedida no checklist:
// mesmo mês-calendário (ex: todo mês de março) através dos anos, recortado
// de cima da série cronológica que serieHistoricaCampo já devolve — nunca
// uma segunda query, só outro corte do mesmo dado.
function filtrarMesmoMesCalendario(serie, mesReferencia) {
  return serie.filter(p => p.mesReferencia === Number(mesReferencia)).sort((a, b) => a.anoReferencia - b.anoReferencia);
}

// v5.8 (item 3) — agrega linhas já classificadas por porte (uma por
// congregação) em grupos PEQUENA/MEDIA/GRANDE, com a média de cada campo
// agregado dentro do grupo — é essa média por porte que vira a régua de
// comparação ("estou acima/abaixo do meu grupo"), sem comparar Sede com
// congregação pequena. Função pura, mesma separação de responsabilidade do
// resto do módulo (agregação testável sem banco).
const CAMPOS_COMPARATIVO_PORTE = ["totalMembrosAtivos", "totalEventos", "totalIntegracao", "valorParaGeral", "valorParaLocal"];
function agruparPorPorte(linhas) {
  const camposNumericos = CAMPOS_COMPARATIVO_PORTE;
  const grupos = new Map();
  for (const linha of linhas) {
    if (!grupos.has(linha.porte)) {
      grupos.set(linha.porte, { porte: linha.porte, totalCongregacoes: 0, congregacoes: [], medias: {} });
    }
    grupos.get(linha.porte).congregacoes.push(linha);
  }
  for (const grupo of grupos.values()) {
    grupo.totalCongregacoes = grupo.congregacoes.length;
    for (const campo of camposNumericos) {
      const soma = grupo.congregacoes.reduce((s, l) => s + (Number(l[campo]) || 0), 0);
      grupo.medias[campo] = grupo.totalCongregacoes > 0 ? Number((soma / grupo.totalCongregacoes).toFixed(2)) : 0;
    }
  }
  return [...grupos.values()];
}

// Busca membros ativos + totais do mês (todos os departamentos somados) por
// congregação do escopo pedido, classifica por porte e agrupa — é a query
// "de verdade" por trás de agruparPorPorte, na mesma separação leitura/
// agregação do resto do módulo (consolidarPorDepartamento/agregarConsolidado).
async function compararPorPorte(pool, congregacaoIds, mesReferencia, anoReferencia) {
  if (congregacaoIds.length === 0) return [];

  const requestTotais = pool.request().input("mes", sql.Int, mesReferencia).input("ano", sql.Int, anoReferencia);
  const placeholdersTotais = congregacaoIds.map((id, i) => { requestTotais.input(`cong${i}`, sql.Int, id); return `@cong${i}`; }).join(",");
  const totaisResult = await requestTotais.query(`
    SELECT c.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
           ISNULL(SUM(CASE WHEN r.Status IN ('${STATUS_NAO_PENDENTE.join("','")}') THEN r.EventosLocal + r.EventosArea + r.EventosGeral ELSE 0 END), 0) AS totalEventos,
           ISNULL(SUM(CASE WHEN r.Status IN ('${STATUS_NAO_PENDENTE.join("','")}') THEN r.IntegracaoConversao + r.IntegracaoReconciliacao + r.IntegracaoDeOutraIgreja ELSE 0 END), 0) AS totalIntegracao,
           ISNULL(SUM(CASE WHEN r.Status IN ('${STATUS_NAO_PENDENTE.join("','")}') THEN r.ValorParaGeral ELSE 0 END), 0) AS valorParaGeral,
           ISNULL(SUM(CASE WHEN r.Status IN ('${STATUS_NAO_PENDENTE.join("','")}') THEN r.ValorParaLocal ELSE 0 END), 0) AS valorParaLocal
    FROM Congregacoes c
    LEFT JOIN RelatoriosDepartamentais r ON r.CongregacaoId = c.CongregacaoId AND r.MesReferencia = @mes AND r.AnoReferencia = @ano
    WHERE c.CongregacaoId IN (${placeholdersTotais})
    GROUP BY c.CongregacaoId, c.Nome
  `);

  const requestMembros = pool.request();
  const placeholdersMembros = congregacaoIds.map((id, i) => { requestMembros.input(`cong${i}`, sql.Int, id); return `@cong${i}`; }).join(",");
  const membrosResult = await requestMembros.query(`
    SELECT CongregacaoId AS congregacaoId, COUNT(*) AS totalMembrosAtivos
    FROM MembroReferencia WHERE Status = 'ATIVO' AND CongregacaoId IN (${placeholdersMembros})
    GROUP BY CongregacaoId
  `);
  const membrosPorCongregacao = new Map(membrosResult.recordset.map(r => [r.congregacaoId, r.totalMembrosAtivos]));

  const linhas = totaisResult.recordset.map(l => {
    const totalMembrosAtivos = membrosPorCongregacao.get(l.congregacaoId) || 0;
    return {
      congregacaoId: l.congregacaoId, congregacaoNome: l.congregacaoNome,
      totalMembrosAtivos, porte: classificarPorte(totalMembrosAtivos),
      totalEventos: l.totalEventos, totalIntegracao: l.totalIntegracao,
      valorParaGeral: l.valorParaGeral, valorParaLocal: l.valorParaLocal
    };
  });
  return agruparPorPorte(linhas);
}

module.exports = {
  NIVEIS_VALIDOS, STATUS_NAO_PENDENTE, LIMITES_PORTE, CAMPOS_COMPARATIVO_PORTE,
  relatorioEstaPendente, resolverCongregacoesDoNivel, agregarConsolidado,
  consolidarPorDepartamento, historicoConsolidado, totaisVazios,
  classificarPorte, serieHistoricaCampo, filtrarMesmoMesCalendario,
  agruparPorPorte, compararPorPorte
};
