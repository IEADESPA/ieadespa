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

// Fórmulas padrão da EBD — só as que são identidade aritmética direta do
// nome do campo (Total de Presença = Presentes + Visitantes; percentuais
// sobre Matriculados). "Total do Local" dos outros 7 departamentos fica de
// fora de propósito: sem a planilha física em mãos pra confirmar quais
// campos entram na soma, calcular errado seria pior que não calcular.
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

module.exports = {
  GRUPOS_VALIDOS, COMPORTAMENTOS_VALIDOS, CAMPOS_EVENTOS, CAMPOS_INTEGRACAO,
  calcularTotalIntegracao, somarValoresSemanais, calcularIndicadoresEbd,
  camposParaPrePreencher, buscarSchemaVigente, buscarValoresParaPrePreencher
};
