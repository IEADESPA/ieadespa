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
// começam zerados, por isso nem entram no resultado aqui. Campos
// `automatico` (v5.5) também ficam de fora — nunca copiam do mês anterior
// porque são sempre recalculados ao vivo do cadastro de membros na leitura,
// nunca herdados de um valor congelado.
function camposParaPrePreencher(camposSchema) {
  return camposSchema.filter(c => c.comportamento === "ESTADO" && !c.automatico);
}

// v5.5 — os 4 departamentos por faixa etária/gênero (Tipo='DEPARTAMENTO':
// UCADESPA/UMADESPA/USADESPA/UHADESPA) têm 3 campos que já existem prontos
// no cadastro de membros — nunca deveriam ser digitados de novo, senão o
// líder local reconta à mão e diverge do cadastro real. Mapa nomeCampo ->
// SituacoesMembro.Sigla (mesmo catálogo usado em todo o resto do sistema).
const CAMPOS_AUTOMATICOS_AFILIACAO = {
  congregados: "CONGREGADO",
  membrosEmComunhao: "EM_COMUNHAO",
  membrosSemComunhao: "SEM_COMUNHAO"
};

// Conta, ao vivo, quantos MembroReferencia ativos daquela congregação estão
// afiliados àquele departamento, por situação — é isso que substitui a
// digitação manual de "Congregados"/"Membros em Comunhão"/"Membros sem
// Comunhão" nos 4 departamentos de faixa etária/gênero.
async function contagemAfiliadosDepartamento(pool, departamentoId, congregacaoId) {
  const result = await pool.request().input("depId", sql.Int, departamentoId).input("congId", sql.Int, congregacaoId).query(`
    SELECT SituacaoMembro AS situacaoMembro, COUNT(*) AS total
    FROM MembroReferencia
    WHERE DepartamentoId = @depId AND CongregacaoId = @congId AND Status = 'ATIVO'
    GROUP BY SituacaoMembro
  `);
  const porSituacao = {};
  result.recordset.forEach(r => { porSituacao[r.situacaoMembro] = r.total; });
  const valores = {};
  for (const [nomeCampo, situacao] of Object.entries(CAMPOS_AUTOMATICOS_AFILIACAO)) {
    valores[nomeCampo] = porSituacao[situacao] || 0;
  }
  return valores;
}

// Sobrescreve, nos campos que o próprio schema realmente tem, o valor
// calculado ao vivo — nunca inventa um campo que o departamento não usa
// (ex: UCADESPA não tem membrosEmComunhao/membrosSemComunhao, só congregados).
function aplicarContagemAutomatica(camposSchema, valores, contagemAutomatica) {
  const resultado = { ...valores };
  for (const campo of camposSchema) {
    if (Object.prototype.hasOwnProperty.call(contagemAutomatica, campo.nomeCampo)) {
      resultado[campo.nomeCampo] = contagemAutomatica[campo.nomeCampo];
    }
  }
  return resultado;
}

async function buscarSchemaVigente(pool, departamentoId) {
  const schemaResult = await pool.request().input("depId", sql.Int, departamentoId).query(`
    SELECT TOP 1 s.SchemaRelatorioId AS schemaRelatorioId, s.DepartamentoId AS departamentoId,
           s.RotuloPapelLocal AS rotuloPapelLocal, d.Tipo AS tipoDepartamento
    FROM SchemasRelatorioDepartamental s
    JOIN Departamentos d ON d.DepartamentoId = s.DepartamentoId
    WHERE s.DepartamentoId = @depId AND s.DataVigenciaFim IS NULL
    ORDER BY s.DataVigenciaInicio DESC
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
  // v5.5 — só os 4 departamentos de faixa etária/gênero (Tipo='DEPARTAMENTO')
  // puxam do cadastro de membros; as 4 secretarias transversais continuam
  // 100% digitadas (não têm o mesmo tipo de campo — ex: Família conta
  // famílias, não membros individuais).
  const camposAutomaticos = schema.tipoDepartamento === "DEPARTAMENTO" ? CAMPOS_AUTOMATICOS_AFILIACAO : {};
  const campos = camposResult.recordset.map(c => ({
    ...c, permiteSemanal: !!c.permiteSemanal,
    automatico: Object.prototype.hasOwnProperty.call(camposAutomaticos, c.nomeCampo)
  }));
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
// v5.8 (item 4) — REABRIR some junto de RETIFICAR: os dois são "poder sobre
// relatório já fechado", os dois exigem GLOBAL (mesmo vocabulário que o
// resto do sistema usa pra "Presidente/Secretário Geral" — ver
// auth.js::exigirNivelGlobal, GestaoTesourariaDepartamental, GestaoEscalas).
const NIVEIS_POR_ACAO = {
  ENVIAR: ["CONGREGACAO", "GLOBAL"],
  APROVAR_AREA: ["AREA", "GLOBAL"],
  COMENTAR: ["AREA", "DEPARTAMENTO", "GLOBAL"],
  CORRIGIR: ["DEPARTAMENTO", "GLOBAL"],
  APROVAR_GERAL: ["DEPARTAMENTO", "GLOBAL"],
  RETIFICAR: ["GLOBAL"],
  REABRIR: ["GLOBAL"]
};

function nivelAutorizadoParaAcao(acao, nivel) {
  return (NIVEIS_POR_ACAO[acao] || []).includes(nivel);
}

// Máquina de estados pura — de que status pra que ação é permitida, e pra
// qual status vai. COMENTAR e CORRIGIR não fecham fase (o relatório pode
// levar comentário/correção mais de uma vez antes de qualquer aprovação).
// REABRIR x RETIFICAR — os dois partem de um relatório já fechado
// (APROVADO_GERAL/RETIFICADO), mas resolvem problemas diferentes: RETIFICAR
// corrige o valor SEM reabrir o fluxo (o relatório continua fechado,
// permanece RETIFICADO — usado quando o ajuste já é definitivo, ex: erro de
// digitação óbvio); REABRIR devolve o relatório pra ENVIADO, reentrando no
// funil de aprovação normal (Área -> Geral) do zero — usado quando o
// relatório precisa ser reexaminado de verdade, não só corrigido num campo.
// Por isso REABRIR é o único das duas ações que a v5.8 exige com
// justificativa obrigatória (ver justificativaValida) — RETIFICAR já existia
// desde a v5.3 com comentário opcional, e continua assim.
const TRANSICOES_POR_ACAO = {
  ENVIAR: { de: ["RASCUNHO"], para: "ENVIADO" },
  APROVAR_AREA: { de: ["ENVIADO"], para: "APROVADO_AREA" },
  COMENTAR: { de: ["ENVIADO", "APROVADO_AREA"], para: null },
  CORRIGIR: { de: ["ENVIADO", "APROVADO_AREA"], para: null },
  APROVAR_GERAL: { de: ["ENVIADO", "APROVADO_AREA"], para: "APROVADO_GERAL" },
  RETIFICAR: { de: ["APROVADO_GERAL", "RETIFICADO"], para: "RETIFICADO" },
  REABRIR: { de: ["APROVADO_GERAL", "RETIFICADO"], para: "ENVIADO" }
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

// v5.8 (item 4) — validação de forma da justificativa de reabertura, mesmo
// padrão de shared/habilitacaoVoluntarios.js::validarDesligamento (motivo
// obrigatório, sem mínimo de tamanho arbitrário): a trilha (v5.3 já grava
// toda ação em AprovacoesRelatorioDepartamental, lida como "trilha" no
// detalhe do relatório) só vale a pena auditar se REABRIR não puder ser
// feito sem explicar por quê — as outras ações do fluxo continuam com
// comentário opcional, só essa exige.
function justificativaValida(justificativa) {
  return !!(justificativa && String(justificativa).trim());
}

module.exports = {
  GRUPOS_VALIDOS, COMPORTAMENTOS_VALIDOS, CAMPOS_EVENTOS, CAMPOS_INTEGRACAO,
  calcularTotalIntegracao, calcularValorTotalFinanceiro, somarValoresSemanais, calcularIndicadoresEbd,
  camposParaPrePreencher, buscarSchemaVigente, buscarValoresParaPrePreencher,
  STATUS_VALIDOS, NIVEIS_POR_ACAO, nivelAutorizadoParaAcao, resolverTransicao,
  calcularPrazoEnvio, relatorioEstaAtrasado, justificativaValida,
  CAMPOS_AUTOMATICOS_AFILIACAO, contagemAfiliadosDepartamento, aplicarContagemAutomatica
};
