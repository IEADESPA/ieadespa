// shared/relatoriosDepartamentais.js (v5.2 — Relatórios Departamentais,
// formulário dinâmico). Fonte: protótipo conceitual `relatorios-departamentos`
// (planilhas reais dos 8 departamentos/secretarias, ver README FASE 5).
//
// Eventos e Integração são idênticos nos 8 departamentos — por isso vivem
// como colunas fixas em RelatoriosDepartamentais (migração 092), não como
// CamposFormularioDepartamental repetidos por tipo. Este módulo só descreve
// esse bloco compartilhado (pro front renderizar sempre igual) e resolve o
// schema/pré-preenchimento por departamento.
const { sql } = require("./db");

const GRUPOS_VALIDOS = ["CONTAGEM", "ACOES", "FINANCEIRO"];
const COMPORTAMENTOS_VALIDOS = ["ESTADO", "FLUXO"];

// Bloco Eventos (Local/Área/Geral) — mesma estrutura nos 8 departamentos.
const CAMPOS_EVENTOS = [
  { nomeCampo: "eventosLocal", rotulo: "Eventos — Local", coluna: "EventosLocal" },
  { nomeCampo: "eventosArea", rotulo: "Eventos — Área", coluna: "EventosArea" },
  { nomeCampo: "eventosGeral", rotulo: "Eventos — Geral", coluna: "EventosGeral" }
];

// Bloco Integração (Conversão/Reconciliação/De Outra Igreja) — idem.
const CAMPOS_INTEGRACAO = [
  { nomeCampo: "integracaoConversao", rotulo: "Integração — Conversão", coluna: "IntegracaoConversao" },
  { nomeCampo: "integracaoReconciliacao", rotulo: "Integração — Reconciliação", coluna: "IntegracaoReconciliacao" },
  { nomeCampo: "integracaoDeOutraIgreja", rotulo: "Integração — De Outra Igreja", coluna: "IntegracaoDeOutraIgreja" }
];

function calcularTotalIntegracao({ conversao, reconciliacao, deOutraIgreja }) {
  return (Number(conversao) || 0) + (Number(reconciliacao) || 0) + (Number(deOutraIgreja) || 0);
}

// EBD — único departamento com granularidade semanal (1º ao 5º domingo).
// Soma simples: o total do mês é sempre a soma das semanas lançadas, nunca
// um valor digitado à parte (evita os dois números divergirem).
function somarValoresSemanais(valoresPorDomingo) {
  return [1, 2, 3, 4, 5].reduce((soma, n) => soma + (Number(valoresPorDomingo && valoresPorDomingo[n]) || 0), 0);
}

// "Total do Local" (bloco Financeiro) = soma de tudo que a congregação
// arrecadou naquele mês pro departamento (Mensalidades + Ofertas +
// Contribuições + Campanhas + Outros — os nomes exatos variam por
// departamento, mas o grupo é sempre "FINANCEIRO"). É a base sobre a qual
// o rateio (v5.4) calcula o repasse local/geral — por isso soma TODO campo
// do grupo FINANCEIRO, sem lista fixa de nomes (nenhum departamento fica
// de fora por usar um nome de campo diferente).
function calcularValorTotalFinanceiro(camposSchema, valores) {
  return camposSchema
    .filter(c => c.grupo === "FINANCEIRO")
    .reduce((soma, c) => soma + (Number(valores[c.nomeCampo]) || 0), 0);
}

// Fórmulas padrão da EBD — identidade aritmética direta do nome do campo
// (Total de Presença = Presentes + Visitantes; percentuais sobre Matriculados).
function calcularIndicadoresEbd({ alunosPresentes, alunosAusentes, alunosMatriculados, visitantes }) {
  const presentes = Number(alunosPresentes) || 0;
  const ausentes = Number(alunosAusentes) || 0;
  const matriculados = Number(alunosMatriculados) || 0;
  const totalPresenca = presentes + (Number(visitantes) || 0);
  return {
    totalPresenca,
    percentualPresenca: matriculados > 0 ? Number(((presentes / matriculados) * 100).toFixed(1)) : null,
    percentualAusencia: matriculados > 0 ? Number(((ausentes / matriculados) * 100).toFixed(1)) : null
  };
}

// Campos ESTADO pré-preenchem com o valor do último relatório enviado
// daquela congregação+departamento (o líder só corrige o que mudou, mesmo
// espírito de declaração de IR pré-preenchida); campos FLUXO sempre
// começam zerados, por isso nem entram no resultado aqui.
function camposParaPrePreencher(camposSchema) {
  return camposSchema.filter(c => c.comportamento === "ESTADO");
}

async function buscarSchemaVigente(pool, departamentoId) {
  const schemaResult = await pool.request().input("depId", sql.Int, departamentoId).query(`
    SELECT TOP 1 SchemaRelatorioId AS schemaRelatorioId, DepartamentoId AS departamentoId,
           RotuloPapelLocal AS rotuloPapelLocal
    FROM SchemasRelatorioDepartamental
    WHERE DepartamentoId = @depId AND DataVigenciaFim IS NULL
    ORDER BY DataVigenciaInicio DESC
  `);
  const schema = schemaResult.recordset[0];
  if (!schema) return null;

  const camposResult = await pool.request().input("schemaId", sql.Int, schema.schemaRelatorioId).query(`
    SELECT CampoFormularioId AS campoFormularioId, NomeCampo AS nomeCampo, Rotulo AS rotulo,
           Grupo AS grupo, Comportamento AS comportamento, TipoDado AS tipoDado,
           PermiteSemanal AS permiteSemanal, Ordem AS ordem
    FROM CamposFormularioDepartamental
    WHERE SchemaRelatorioId = @schemaId
    ORDER BY Ordem
  `);
  const campos = camposResult.recordset.map(c => ({ ...c, permiteSemanal: !!c.permiteSemanal }));
  return {
    ...schema,
    // "O schema tem modo semanal" nunca é digitado à parte — é sempre
    // calculado a partir dos próprios campos, pra nunca destoar deles.
    permiteSemanal: campos.some(c => c.permiteSemanal),
    campos,
    camposEventos: CAMPOS_EVENTOS,
    camposIntegracao: CAMPOS_INTEGRACAO
  };
}

// Busca o relatório anterior (mesma congregação+departamento, período mais
// recente antes do informado) e devolve só os valores dos campos ESTADO —
// é isso que vira pré-preenchimento do rascunho novo.
async function buscarValoresParaPrePreencher(pool, { congregacaoId, departamentoId, antesDeMes, antesDeAno }) {
  const anterior = await pool.request()
    .input("congId", sql.Int, congregacaoId)
    .input("depId", sql.Int, departamentoId)
    .input("ano", sql.Int, antesDeAno)
    .input("mes", sql.Int, antesDeMes)
    .query(`
      SELECT TOP 1 RelatorioDepartamentalId AS relatorioDepartamentalId
      FROM RelatoriosDepartamentais
      WHERE CongregacaoId = @congId AND DepartamentoId = @depId
        AND (AnoReferencia < @ano OR (AnoReferencia = @ano AND MesReferencia < @mes))
      ORDER BY AnoReferencia DESC, MesReferencia DESC
    `);
  const relatorioAnteriorId = anterior.recordset[0] ? anterior.recordset[0].relatorioDepartamentalId : null;
  if (!relatorioAnteriorId) return {};

  const valores = await pool.request().input("id", sql.Int, relatorioAnteriorId).query(`
    SELECT c.NomeCampo AS nomeCampo, v.Valor AS valor
    FROM ValoresCampoRelatorioDepartamental v
    JOIN CamposFormularioDepartamental c ON c.CampoFormularioId = v.CampoFormularioId
    WHERE v.RelatorioDepartamentalId = @id AND v.NumeroDomingo IS NULL AND c.Comportamento = 'ESTADO'
  `);
  const mapa = {};
  valores.recordset.forEach(v => { mapa[v.nomeCampo] = v.valor; });
  return mapa;
}

// ============================================================
// v5.3 — Fluxo de aprovação (2 camadas: Área → Geral, + retificação GLOBAL).
//
// Pesquisa no Regimento (ver README FASE 5): Região (CRA+TER) e Quadrante
// (CEQ) são colegiados representados por DELEGAÇÃO — o Pastor de Área fala
// por eles (Art. 104-B), não agem direto sobre Congregação/Departamento;
// Distrito é só FASE 9 (macroexpansão). Por isso o fluxo real é 2 camadas,
// não mais — mas `NivelAprovador` (migração 094) já usa o mesmo vocabulário
// de `Lideranca.EscopoTipo`, pronto pra um nível novo (REGIAO/QUADRANTE/
// DISTRITO) plugar aqui sem redesenho, no dia em que a FASE 9 os ativar.
// ============================================================

const STATUS_VALIDOS = ["RASCUNHO", "ENVIADO", "APROVADO_AREA", "APROVADO_GERAL", "RETIFICADO"];

// Nível mínimo (mesmo vocabulário de Lideranca.EscopoTipo/Papeis.Nivel) que
// autoriza cada ação. GLOBAL sempre pode tudo — Presidente/Secretário Geral
// têm a última palavra sobre qualquer relatório (docs do protótipo, v5.3).
const NIVEIS_POR_ACAO = {
  ENVIAR: ["CONGREGACAO", "GLOBAL"],
  APROVAR_AREA: ["AREA", "GLOBAL"],
  COMENTAR: ["AREA", "DEPARTAMENTO", "GLOBAL"],
  CORRIGIR: ["DEPARTAMENTO", "GLOBAL"],
  APROVAR_GERAL: ["DEPARTAMENTO", "GLOBAL"],
  RETIFICAR: ["GLOBAL"]
};

function nivelAutorizadoParaAcao(acao, nivel) {
  return (NIVEIS_POR_ACAO[acao] || []).includes(nivel);
}

// Máquina de estados pura — de que status pra que ação é permitida, e pra
// qual status vai. COMENTAR e CORRIGIR não fecham fase (o relatório pode
// levar comentário/correção mais de uma vez antes de qualquer aprovação).
const TRANSICOES_POR_ACAO = {
  ENVIAR: { de: ["RASCUNHO"], para: "ENVIADO" },
  APROVAR_AREA: { de: ["ENVIADO"], para: "APROVADO_AREA" },
  COMENTAR: { de: ["ENVIADO", "APROVADO_AREA"], para: null },
  CORRIGIR: { de: ["ENVIADO", "APROVADO_AREA"], para: null },
  APROVAR_GERAL: { de: ["ENVIADO", "APROVADO_AREA"], para: "APROVADO_GERAL" },
  RETIFICAR: { de: ["APROVADO_GERAL", "RETIFICADO"], para: "RETIFICADO" }
};

function resolverTransicao(acao, statusAtual) {
  const regra = TRANSICOES_POR_ACAO[acao];
  if (!regra) return { ok: false, mensagem: `Ação desconhecida: ${acao}.` };
  if (!regra.de.includes(statusAtual)) {
    return { ok: false, mensagem: `Não é possível "${acao}" um relatório com status "${statusAtual}".` };
  }
  return { ok: true, novoStatus: regra.para || statusAtual };
}

// Prazo de envio (docs/06 do protótipo: "tipicamente até o mês seguinte")
// — último dia do mês seguinte ao mês de referência do relatório.
function calcularPrazoEnvio(mesReferencia, anoReferencia) {
  const mesSeguinte = mesReferencia === 12 ? 1 : mesReferencia + 1;
  const anoSeguinte = mesReferencia === 12 ? anoReferencia + 1 : anoReferencia;
  const ultimoDia = new Date(anoSeguinte, mesSeguinte, 0).getDate(); // "dia 0" do mês seguinte = último dia dele
  return `${anoSeguinte}-${String(mesSeguinte).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
}

// Envio fora do prazo é PERMITIDO, só marca atrasado (docs/06) — nunca
// bloqueia o envio em si.
function relatorioEstaAtrasado(mesReferencia, anoReferencia, dataEnvio) {
  const prazo = calcularPrazoEnvio(mesReferencia, anoReferencia);
  const envio = String(dataEnvio || "").slice(0, 10);
  return envio > prazo;
}

module.exports = {
  GRUPOS_VALIDOS, COMPORTAMENTOS_VALIDOS, CAMPOS_EVENTOS, CAMPOS_INTEGRACAO,
  calcularTotalIntegracao, calcularValorTotalFinanceiro, somarValoresSemanais, calcularIndicadoresEbd,
  camposParaPrePreencher, buscarSchemaVigente, buscarValoresParaPrePreencher,
  STATUS_VALIDOS, NIVEIS_POR_ACAO, nivelAutorizadoParaAcao, resolverTransicao,
  calcularPrazoEnvio, relatorioEstaAtrasado
};
