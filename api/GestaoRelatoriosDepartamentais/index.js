// GestaoRelatoriosDepartamentais (v5.2 formulário dinâmico + v5.3 fluxo de
// aprovação). Fonte: protótipo conceitual `relatorios-departamentos` (ver
// README FASE 5) + pesquisa no Regimento sobre Região/Quadrante/Distrito
// (delegados via Pastor de Área, sem ação direta — por isso o fluxo real é
// só 2 camadas: Área → Geral, com retificação por GLOBAL).
//
// GET  /api/relatorios-departamentais?departamentoId=&schema=1        -> schema vigente do depto
// GET  /api/relatorios-departamentais?congregacaoId=&departamentoId=&mes=&ano= -> lista (filtrada por escopo)
// GET  /api/relatorios-departamentais/{id}                             -> detalhe (schema+valores+eventos+integração+contribuintes+trilha)
// POST /api/relatorios-departamentais                                  -> body: {congregacaoId, departamentoId, mesReferencia, anoReferencia} -> obtém ou cria o rascunho
// PUT  /api/relatorios-departamentais/{id}                             -> body: {valores?, valoresSemanais?, eventos?, integracao?, contribuintes?} -> só em RASCUNHO
// POST /api/relatorios-departamentais/{id}/{acao}                      -> acao: enviar | aprovar-area | comentar | corrigir | aprovar-geral | retificar
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const rd = require("../shared/relatoriosDepartamentais");
const td = require("../shared/tesourariaDepartamental");

const SELECT_RELATORIO_BASE = `
  SELECT r.RelatorioDepartamentalId AS relatorioDepartamentalId, r.CongregacaoId AS congregacaoId,
         cong.Nome AS congregacaoNome, r.DepartamentoId AS departamentoId,
         dep.Sigla AS departamentoSigla, dep.Nome AS departamentoNome,
         r.MesReferencia AS mesReferencia, r.AnoReferencia AS anoReferencia,
         r.SchemaRelatorioId AS schemaRelatorioId, r.Status AS status, r.Atrasado AS atrasado,
         r.EventosLocal AS eventosLocal, r.EventosArea AS eventosArea, r.EventosGeral AS eventosGeral,
         r.IntegracaoConversao AS integracaoConversao, r.IntegracaoReconciliacao AS integracaoReconciliacao,
         r.IntegracaoDeOutraIgreja AS integracaoDeOutraIgreja, r.ValorManualParaGeral AS valorManualParaGeral,
         r.ValorParaGeral AS valorParaGeral, r.ValorParaLocal AS valorParaLocal
  FROM RelatoriosDepartamentais r
  JOIN Congregacoes cong ON cong.CongregacaoId = r.CongregacaoId
  JOIN Departamentos dep ON dep.DepartamentoId = r.DepartamentoId`;

async function montarDetalheRelatorio(pool, linha) {
  const schemaInfoResult = await pool.request().input("schemaId", sql.Int, linha.schemaRelatorioId).query(`
    SELECT d.Tipo AS tipoDepartamento FROM SchemasRelatorioDepartamental s
    JOIN Departamentos d ON d.DepartamentoId = s.DepartamentoId WHERE s.SchemaRelatorioId = @schemaId`);
  const tipoDepartamento = schemaInfoResult.recordset[0] ? schemaInfoResult.recordset[0].tipoDepartamento : null;
  const camposAutomaticos = tipoDepartamento === "DEPARTAMENTO" ? rd.CAMPOS_AUTOMATICOS_AFILIACAO : {};

  const camposResult = await pool.request().input("schemaId", sql.Int, linha.schemaRelatorioId).query(`
    SELECT CampoFormularioId AS campoFormularioId, NomeCampo AS nomeCampo, Rotulo AS rotulo,
           Grupo AS grupo, Comportamento AS comportamento, TipoDado AS tipoDado,
           PermiteSemanal AS permiteSemanal, Ordem AS ordem
    FROM CamposFormularioDepartamental WHERE SchemaRelatorioId = @schemaId ORDER BY Ordem`);
  const campos = camposResult.recordset.map(c => ({
    ...c, permiteSemanal: !!c.permiteSemanal,
    automatico: Object.prototype.hasOwnProperty.call(camposAutomaticos, c.nomeCampo)
  }));
  const permiteSemanal = campos.some(c => c.permiteSemanal);

  const valoresResult = await pool.request().input("id", sql.Int, linha.relatorioDepartamentalId).query(`
    SELECT c.NomeCampo AS nomeCampo, v.NumeroDomingo AS numeroDomingo, v.Valor AS valor
    FROM ValoresCampoRelatorioDepartamental v
    JOIN CamposFormularioDepartamental c ON c.CampoFormularioId = v.CampoFormularioId
    WHERE v.RelatorioDepartamentalId = @id`);

  let valores = {};
  const valoresSemanais = {};
  for (const v of valoresResult.recordset) {
    if (v.numeroDomingo == null) {
      valores[v.nomeCampo] = v.valor;
    } else {
      if (!valoresSemanais[v.nomeCampo]) valoresSemanais[v.nomeCampo] = {};
      valoresSemanais[v.nomeCampo][v.numeroDomingo] = v.valor;
    }
  }
  // Campo semanal: o valor do mês é SEMPRE a soma das semanas lançadas —
  // nunca um número guardado à parte que possa divergir da soma real.
  for (const campo of campos) {
    if (campo.permiteSemanal) valores[campo.nomeCampo] = rd.somarValoresSemanais(valoresSemanais[campo.nomeCampo] || {});
  }

  // v5.5 — nos 4 departamentos de faixa etária/gênero, Congregados/Membros
  // em Comunhão/Membros sem Comunhão NUNCA vêm do que foi digitado — são
  // sempre a contagem ao vivo do cadastro de membros (shared/
  // relatoriosDepartamentais.js), pra nunca divergir do cadastro real.
  if (Object.keys(camposAutomaticos).length > 0) {
    const contagemAutomatica = await rd.contagemAfiliadosDepartamento(pool, linha.departamentoId, linha.congregacaoId);
    valores = rd.aplicarContagemAutomatica(campos, valores, contagemAutomatica);
  }

  const contribuintesResult = await pool.request().input("id", sql.Int, linha.relatorioDepartamentalId).query(`
    SELECT ContribuinteId AS contribuinteId, Nome AS nome, Valor AS valor, Ordem AS ordem
    FROM ContribuintesMensalidadeDepartamental WHERE RelatorioDepartamentalId = @id ORDER BY Ordem`);

  const trilhaResult = await pool.request().input("id", sql.Int, linha.relatorioDepartamentalId).query(`
    SELECT a.NivelAprovador AS nivelAprovador, a.Acao AS acao, a.Comentario AS comentario,
           a.CriadoEm AS criadoEm, m.Nome AS nomeMembro
    FROM AprovacoesRelatorioDepartamental a
    JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE a.RelatorioDepartamentalId = @id ORDER BY a.CriadoEm ASC`);

  const valorTotalFinanceiro = rd.calcularValorTotalFinanceiro(campos, valores);
  // v5.4 — rateio linha a linha. Congelado (ValorParaGeral/ValorParaLocal)
  // desde APROVADO_GERAL/RETIFICADO: é o número oficial que a Tesouraria
  // usa — nunca recalculado, mesmo que o perfil de rateio mude depois.
  // Antes disso (RASCUNHO/ENVIADO/APROVADO_AREA) é só prévia ao vivo.
  const perfilRateio = await td.buscarPerfilRateio(pool, linha.departamentoId);
  const congelado = linha.valorParaGeral !== null && linha.valorParaGeral !== undefined;
  const rateio = congelado
    ? { paraGeral: linha.valorParaGeral, paraLocal: linha.valorParaLocal }
    : (perfilRateio ? td.calcularRateio(perfilRateio, valorTotalFinanceiro, linha.valorManualParaGeral) : { paraGeral: null, paraLocal: null });

  return {
    ...linha,
    schema: { campos, permiteSemanal, camposEventos: rd.CAMPOS_EVENTOS, camposIntegracao: rd.CAMPOS_INTEGRACAO },
    valores,
    valorTotalFinanceiro,
    rateio: { ...rateio, congelado, metodo: perfilRateio ? perfilRateio.metodo : null, precisaValorManual: !congelado && !!perfilRateio && perfilRateio.metodo === "VARIAVEL_MANUAL" },
    valoresSemanais,
    eventos: { local: linha.eventosLocal, area: linha.eventosArea, geral: linha.eventosGeral },
    integracao: {
      conversao: linha.integracaoConversao, reconciliacao: linha.integracaoReconciliacao,
      deOutraIgreja: linha.integracaoDeOutraIgreja,
      total: rd.calcularTotalIntegracao({ conversao: linha.integracaoConversao, reconciliacao: linha.integracaoReconciliacao, deOutraIgreja: linha.integracaoDeOutraIgreja })
    },
    contribuintes: contribuintesResult.recordset,
    trilha: trilhaResult.recordset
  };
}

// Grava valores/eventos/integração/contribuintes — usado tanto pelo PUT
// (Líder Local editando o próprio RASCUNHO) quanto pela ação CORRIGIR
// (Líder Geral ajustando um relatório já ENVIADO/APROVADO_AREA, v5.3).
async function gravarValores(pool, idRota, schemaRelatorioId, { valores, valoresSemanais, eventos, integracao, contribuintes, valorManualParaGeral }) {
  const tipoResult = await pool.request().input("schemaId", sql.Int, schemaRelatorioId).query(`
    SELECT d.Tipo AS tipoDepartamento FROM SchemasRelatorioDepartamental s
    JOIN Departamentos d ON d.DepartamentoId = s.DepartamentoId WHERE s.SchemaRelatorioId = @schemaId`);
  const camposAutomaticosGravar = (tipoResult.recordset[0] && tipoResult.recordset[0].tipoDepartamento === "DEPARTAMENTO")
    ? rd.CAMPOS_AUTOMATICOS_AFILIACAO : {};
  const camposResult = await pool.request().input("schemaId", sql.Int, schemaRelatorioId).query(
    `SELECT CampoFormularioId AS campoFormularioId, NomeCampo AS nomeCampo, PermiteSemanal AS permiteSemanal FROM CamposFormularioDepartamental WHERE SchemaRelatorioId = @schemaId`);
  const camposPorNome = Object.fromEntries(camposResult.recordset.map(c => [c.nomeCampo, c]));

  // v5.4 — VARIAVEL_MANUAL: quem lança o relatório decide, naquele mês,
  // quanto sobe pro geral (o resto vai pra local por subtração, nunca os
  // dois digitados separado).
  if (valorManualParaGeral !== undefined) {
    await pool.request().input("id", sql.Int, idRota).input("valor", sql.Decimal(14, 2), valorManualParaGeral === null ? null : Number(valorManualParaGeral) || 0)
      .query(`UPDATE RelatoriosDepartamentais SET ValorManualParaGeral = @valor, AtualizadoEm = SYSUTCDATETIME() WHERE RelatorioDepartamentalId = @id`);
  }

  if (valores && typeof valores === "object") {
    for (const [nomeCampo, valor] of Object.entries(valores)) {
      const campo = camposPorNome[nomeCampo];
      if (!campo || campo.permiteSemanal) continue; // semanal só grava via valoresSemanais
      // v5.5 — Congregados/Membros em Comunhão/Membros sem Comunhão (nos 4
      // deptos de faixa etária/gênero) nunca são gravados como digitados —
      // são sempre recalculados do cadastro de membros na leitura. Mesmo
      // que o front mande um valor (não deveria, o campo é readonly lá),
      // o backend recusa persistir — defesa em profundidade.
      if (Object.prototype.hasOwnProperty.call(camposAutomaticosGravar, nomeCampo)) continue;
      await pool.request()
        .input("relId", sql.Int, idRota).input("campoId", sql.Int, campo.campoFormularioId).input("valor", sql.Decimal(14, 2), Number(valor) || 0)
        .query(`MERGE ValoresCampoRelatorioDepartamental AS alvo
                USING (SELECT @relId AS RelatorioDepartamentalId, @campoId AS CampoFormularioId) AS origem
                ON alvo.RelatorioDepartamentalId = origem.RelatorioDepartamentalId AND alvo.CampoFormularioId = origem.CampoFormularioId AND alvo.NumeroDomingo IS NULL
                WHEN MATCHED THEN UPDATE SET Valor = @valor
                WHEN NOT MATCHED THEN INSERT (RelatorioDepartamentalId, CampoFormularioId, NumeroDomingo, Valor) VALUES (@relId, @campoId, NULL, @valor);`);
    }
  }

  if (valoresSemanais && typeof valoresSemanais === "object") {
    for (const [nomeCampo, porDomingo] of Object.entries(valoresSemanais)) {
      const campo = camposPorNome[nomeCampo];
      if (!campo || !campo.permiteSemanal) continue;
      for (const [domingoStr, valor] of Object.entries(porDomingo || {})) {
        const domingo = Number(domingoStr);
        if (domingo < 1 || domingo > 5) continue;
        await pool.request()
          .input("relId", sql.Int, idRota).input("campoId", sql.Int, campo.campoFormularioId)
          .input("domingo", sql.Int, domingo).input("valor", sql.Decimal(14, 2), Number(valor) || 0)
          .query(`MERGE ValoresCampoRelatorioDepartamental AS alvo
                  USING (SELECT @relId AS RelatorioDepartamentalId, @campoId AS CampoFormularioId, @domingo AS NumeroDomingo) AS origem
                  ON alvo.RelatorioDepartamentalId = origem.RelatorioDepartamentalId AND alvo.CampoFormularioId = origem.CampoFormularioId AND alvo.NumeroDomingo = origem.NumeroDomingo
                  WHEN MATCHED THEN UPDATE SET Valor = @valor
                  WHEN NOT MATCHED THEN INSERT (RelatorioDepartamentalId, CampoFormularioId, NumeroDomingo, Valor) VALUES (@relId, @campoId, @domingo, @valor);`);
      }
    }
  }

  if (eventos && typeof eventos === "object") {
    await pool.request().input("id", sql.Int, idRota)
      .input("local", sql.Int, Number(eventos.local) || 0).input("area", sql.Int, Number(eventos.area) || 0).input("geral", sql.Int, Number(eventos.geral) || 0)
      .query(`UPDATE RelatoriosDepartamentais SET EventosLocal = @local, EventosArea = @area, EventosGeral = @geral, AtualizadoEm = SYSUTCDATETIME() WHERE RelatorioDepartamentalId = @id`);
  }

  if (integracao && typeof integracao === "object") {
    await pool.request().input("id", sql.Int, idRota)
      .input("conversao", sql.Int, Number(integracao.conversao) || 0)
      .input("reconciliacao", sql.Int, Number(integracao.reconciliacao) || 0)
      .input("deOutraIgreja", sql.Int, Number(integracao.deOutraIgreja) || 0)
      .query(`UPDATE RelatoriosDepartamentais SET IntegracaoConversao = @conversao, IntegracaoReconciliacao = @reconciliacao, IntegracaoDeOutraIgreja = @deOutraIgreja, AtualizadoEm = SYSUTCDATETIME() WHERE RelatorioDepartamentalId = @id`);
  }

  if (Array.isArray(contribuintes)) {
    await pool.request().input("id", sql.Int, idRota).query(`DELETE FROM ContribuintesMensalidadeDepartamental WHERE RelatorioDepartamentalId = @id`);
    let ordem = 1;
    for (const c of contribuintes) {
      if (!c || !c.nome || !String(c.nome).trim()) continue;
      await pool.request()
        .input("relId", sql.Int, idRota).input("nome", sql.NVarChar(150), String(c.nome).trim())
        .input("valor", sql.Decimal(14, 2), Number(c.valor) || 0).input("ordem", sql.Int, ordem++)
        .query(`INSERT INTO ContribuintesMensalidadeDepartamental (RelatorioDepartamentalId, Nome, Valor, Ordem) VALUES (@relId, @nome, @valor, @ordem)`);
    }
  }
}

// v5.4 (correção) — congela ValorParaGeral/ValorParaLocal no momento da
// aprovação geral/retificação, com o perfil de rateio VIGENTE nesse
// instante. Isso é o que torna o relatório uma fonte confiável pra
// `shared/tesouraria.js::saldoCentroCusto` (DEPTO_*) e pro fechamento de
// `TesourariasDepartamento` — mudar o perfil de rateio depois não altera
// relatórios já aprovados.
async function congelarRateio(pool, idRota, schemaRelatorioId, departamentoId) {
  const camposResult = await pool.request().input("schemaId", sql.Int, schemaRelatorioId).query(`
    SELECT CampoFormularioId AS campoFormularioId, NomeCampo AS nomeCampo, Grupo AS grupo, PermiteSemanal AS permiteSemanal
    FROM CamposFormularioDepartamental WHERE SchemaRelatorioId = @schemaId`);
  const campos = camposResult.recordset;

  const valoresResult = await pool.request().input("id", sql.Int, idRota).query(`
    SELECT c.NomeCampo AS nomeCampo, v.NumeroDomingo AS numeroDomingo, v.Valor AS valor
    FROM ValoresCampoRelatorioDepartamental v
    JOIN CamposFormularioDepartamental c ON c.CampoFormularioId = v.CampoFormularioId
    WHERE v.RelatorioDepartamentalId = @id`);
  const valores = {};
  const valoresSemanais = {};
  for (const v of valoresResult.recordset) {
    if (v.numeroDomingo == null) valores[v.nomeCampo] = v.valor;
    else { if (!valoresSemanais[v.nomeCampo]) valoresSemanais[v.nomeCampo] = {}; valoresSemanais[v.nomeCampo][v.numeroDomingo] = v.valor; }
  }
  for (const campo of campos) {
    if (campo.permiteSemanal) valores[campo.nomeCampo] = rd.somarValoresSemanais(valoresSemanais[campo.nomeCampo] || {});
  }

  const valorTotalFinanceiro = rd.calcularValorTotalFinanceiro(campos, valores);
  const linhaAtual = await pool.request().input("id", sql.Int, idRota).query(`SELECT ValorManualParaGeral AS valorManualParaGeral FROM RelatoriosDepartamentais WHERE RelatorioDepartamentalId = @id`);
  const perfil = await td.buscarPerfilRateio(pool, departamentoId);
  const { paraGeral, paraLocal } = perfil
    ? td.calcularRateio(perfil, valorTotalFinanceiro, linhaAtual.recordset[0].valorManualParaGeral)
    : { paraGeral: 0, paraLocal: valorTotalFinanceiro };

  await pool.request().input("id", sql.Int, idRota)
    .input("paraGeral", sql.Decimal(14, 2), paraGeral).input("paraLocal", sql.Decimal(14, 2), paraLocal === null ? null : paraLocal)
    .query(`UPDATE RelatoriosDepartamentais SET ValorParaGeral = @paraGeral, ValorParaLocal = @paraLocal, AtualizadoEm = SYSUTCDATETIME() WHERE RelatorioDepartamentalId = @id`);
}

async function registrarAprovacao(pool, { relatorioDepartamentalId, nivelAprovador, acao, comentario, membroId }) {
  await pool.request()
    .input("relId", sql.Int, relatorioDepartamentalId).input("nivel", sql.NVarChar(20), nivelAprovador)
    .input("acao", sql.NVarChar(30), acao).input("comentario", sql.NVarChar(1000), comentario || null)
    .input("membroId", sql.Int, membroId)
    .query(`INSERT INTO AprovacoesRelatorioDepartamental (RelatorioDepartamentalId, NivelAprovador, Acao, Comentario, MembroId)
            VALUES (@relId, @nivel, @acao, @comentario, @membroId)`);
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "relatorios_departamentais");
  if (!usuario) return;

  const idRota = context.bindingData.id;
  const pool = await getPool();

  // ---- GET: schema vigente de um departamento (sem id na rota) ----
  if (req.method === "GET" && !idRota && req.query && req.query.schema) {
    const departamentoId = Number(req.query.departamentoId);
    if (!departamentoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe departamentoId." } };
      return;
    }
    const schema = await rd.buscarSchemaVigente(pool, departamentoId);
    if (!schema) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Departamento sem formulário configurado ainda." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: schema };
    return;
  }

  // ---- GET: lista (filtrada por escopo territorial + departamento) ----
  if (req.method === "GET" && !idRota) {
    const { congregacaoId, departamentoId, mes, ano } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (congregacaoId) { request.input("congregacaoId", sql.Int, congregacaoId); where += " AND r.CongregacaoId = @congregacaoId"; }
    if (departamentoId) { request.input("departamentoId", sql.Int, departamentoId); where += " AND r.DepartamentoId = @departamentoId"; }
    if (mes) { request.input("mes", sql.Int, mes); where += " AND r.MesReferencia = @mes"; }
    if (ano) { request.input("ano", sql.Int, ano); where += " AND r.AnoReferencia = @ano"; }
    const result = await request.query(`${SELECT_RELATORIO_BASE} WHERE ${where} ORDER BY r.AnoReferencia DESC, r.MesReferencia DESC`);
    const lista = result.recordset
      .filter(r => auth.estaNoEscopo(usuario, r.congregacaoNome) && auth.podeDepartamento(usuario, r.departamentoId));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  // ---- GET: detalhe de um relatório ----
  if (req.method === "GET" && idRota) {
    const result = await pool.request().input("id", sql.Int, idRota).query(`${SELECT_RELATORIO_BASE} WHERE r.RelatorioDepartamentalId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Relatório não encontrado." } };
      return;
    }
    const linha = result.recordset[0];
    if (!auth.estaNoEscopo(usuario, linha.congregacaoNome) || !auth.podeDepartamento(usuario, linha.departamentoId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    const detalhe = await montarDetalheRelatorio(pool, linha);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: detalhe };
    return;
  }

  // ---- POST: obtém ou cria o rascunho do período (idempotente) ----
  if (req.method === "POST" && !idRota) {
    const { congregacaoId, departamentoId, mesReferencia, anoReferencia } = req.body || {};
    const mes = Number(mesReferencia), ano = Number(anoReferencia);
    if (!congregacaoId || !departamentoId || !mes || !ano || mes < 1 || mes > 12) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, departamentoId, mesReferencia (1-12), anoReferencia." } };
      return;
    }

    const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
    if (cong.recordset.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Congregação não encontrada." } };
      return;
    }
    if (!auth.estaNoEscopo(usuario, cong.recordset[0].Nome) || !auth.podeDepartamento(usuario, departamentoId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }

    const existente = await pool.request()
      .input("congId", sql.Int, congregacaoId).input("depId", sql.Int, departamentoId)
      .input("mes", sql.Int, mes).input("ano", sql.Int, ano)
      .query(`${SELECT_RELATORIO_BASE} WHERE r.CongregacaoId = @congId AND r.DepartamentoId = @depId AND r.MesReferencia = @mes AND r.AnoReferencia = @ano`);
    if (existente.recordset.length > 0) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: await montarDetalheRelatorio(pool, existente.recordset[0]) };
      return;
    }

    const schema = await rd.buscarSchemaVigente(pool, departamentoId);
    if (!schema) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Departamento sem formulário configurado — fale com quem administra Catálogos." } };
      return;
    }

    const inserido = await pool.request()
      .input("congId", sql.Int, congregacaoId).input("depId", sql.Int, departamentoId)
      .input("mes", sql.Int, mes).input("ano", sql.Int, ano)
      .input("schemaId", sql.Int, schema.schemaRelatorioId).input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO RelatoriosDepartamentais (CongregacaoId, DepartamentoId, MesReferencia, AnoReferencia, SchemaRelatorioId, CriadoPor)
              OUTPUT INSERTED.RelatorioDepartamentalId
              VALUES (@congId, @depId, @mes, @ano, @schemaId, @criadoPor)`);
    const novoId = inserido.recordset[0].RelatorioDepartamentalId;

    // Pré-preenchimento: campos ESTADO herdam o valor do último relatório
    // enviado desta congregação+departamento (mesmo espírito de IR
    // pré-preenchido) — campos FLUXO nascem sem linha (0 na leitura).
    const prePreenchido = await rd.buscarValoresParaPrePreencher(pool, { congregacaoId, departamentoId, antesDeMes: mes, antesDeAno: ano });
    const camposPorNome = Object.fromEntries(schema.campos.map(c => [c.nomeCampo, c]));
    for (const [nomeCampo, valor] of Object.entries(prePreenchido)) {
      const campo = camposPorNome[nomeCampo];
      if (!campo || campo.permiteSemanal) continue; // campo semanal não pré-preenche linha mensal solta
      await pool.request()
        .input("relId", sql.Int, novoId).input("campoId", sql.Int, campo.campoFormularioId).input("valor", sql.Decimal(14, 2), valor)
        .query(`INSERT INTO ValoresCampoRelatorioDepartamental (RelatorioDepartamentalId, CampoFormularioId, NumeroDomingo, Valor) VALUES (@relId, @campoId, NULL, @valor)`);
    }

    await registrarAuditoria({
      tabela: "RelatoriosDepartamentais", registroId: novoId,
      acao: `Abriu rascunho de relatório (${cong.recordset[0].Nome}, depto ${departamentoId}, ${mes}/${ano})`,
      usuarioId: usuario.membroId, dadosDepois: { congregacaoId, departamentoId, mesReferencia: mes, anoReferencia: ano }
    });

    const criado = await pool.request().input("id", sql.Int, novoId).query(`${SELECT_RELATORIO_BASE} WHERE r.RelatorioDepartamentalId = @id`);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: await montarDetalheRelatorio(pool, criado.recordset[0]) };
    return;
  }

  // ---- PUT: edita valores (só enquanto RASCUNHO) ----
  if (req.method === "PUT" && idRota) {
    const result = await pool.request().input("id", sql.Int, idRota).query(`${SELECT_RELATORIO_BASE} WHERE r.RelatorioDepartamentalId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Relatório não encontrado." } };
      return;
    }
    const linha = result.recordset[0];
    if (!auth.estaNoEscopo(usuario, linha.congregacaoNome) || !auth.podeDepartamento(usuario, linha.departamentoId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    if (linha.status !== "RASCUNHO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Relatório já enviado — não pode mais ser editado aqui (fluxo de aprovação: v5.3)." } };
      return;
    }

    await gravarValores(pool, idRota, linha.schemaRelatorioId, req.body || {});

    await registrarAuditoria({
      tabela: "RelatoriosDepartamentais", registroId: Number(idRota),
      acao: "Atualizou valores do rascunho de relatório departamental", usuarioId: usuario.membroId,
      dadosDepois: req.body || {}
    });

    const atualizado = await pool.request().input("id", sql.Int, idRota).query(`${SELECT_RELATORIO_BASE} WHERE r.RelatorioDepartamentalId = @id`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: await montarDetalheRelatorio(pool, atualizado.recordset[0]) };
    return;
  }

  // ---- POST: ações do fluxo de aprovação (v5.3) ----
  // enviar | aprovar-area | comentar | corrigir | aprovar-geral | retificar
  if (req.method === "POST" && idRota && context.bindingData.acao) {
    const acaoRota = String(context.bindingData.acao).toUpperCase().replace(/-/g, "_");
    const MAPA_ACAO = {
      ENVIAR: "ENVIAR", APROVAR_AREA: "APROVAR_AREA", COMENTAR: "COMENTAR",
      CORRIGIR: "CORRIGIR", APROVAR_GERAL: "APROVAR_GERAL", RETIFICAR: "RETIFICAR"
    };
    const acao = MAPA_ACAO[acaoRota];
    if (!acao) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida: ${context.bindingData.acao}.` } };
      return;
    }

    const result = await pool.request().input("id", sql.Int, idRota).query(`${SELECT_RELATORIO_BASE} WHERE r.RelatorioDepartamentalId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Relatório não encontrado." } };
      return;
    }
    const linha = result.recordset[0];
    if (!auth.estaNoEscopo(usuario, linha.congregacaoNome) || !auth.podeDepartamento(usuario, linha.departamentoId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    if (!rd.nivelAutorizadoParaAcao(acao, usuario.nivel)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: `Seu papel (${usuario.nivel}) não pode executar "${acao}" — fale com quem administra as Permissões.` } };
      return;
    }
    const transicao = rd.resolverTransicao(acao, linha.status);
    if (!transicao.ok) {
      context.res = { status: 200, body: { sucesso: false, mensagem: transicao.mensagem } };
      return;
    }

    const { comentario } = req.body || {};

    // CORRIGIR e RETIFICAR podem trazer novos valores junto com a ação —
    // é exatamente o poder que o Líder Geral/Presidente têm (docs/03: não
    // há comprovante anexado, então é assim que se ajusta o que o líder
    // local lançou errado).
    if (acao === "CORRIGIR" || acao === "RETIFICAR") {
      await gravarValores(pool, idRota, linha.schemaRelatorioId, req.body || {});
    }

    // v5.4 (correção) — APROVAR_GERAL/RETIFICAR CONGELAM o rateio
    // (ValorParaGeral/ValorParaLocal): é o momento em que o relatório se
    // torna "oficial" pra Tesouraria. Sem congelar, mudar o perfil de
    // rateio depois mudaria retroativamente o valor de relatórios antigos
    // — o mesmo tipo de bug que a versão vigente do Texto Mestre (vB.15)
    // já existe pra evitar.
    if (acao === "APROVAR_GERAL" || acao === "RETIFICAR") {
      await congelarRateio(pool, idRota, linha.schemaRelatorioId, linha.departamentoId);
    }

    if (acao === "ENVIAR") {
      const atrasado = rd.relatorioEstaAtrasado(linha.mesReferencia, linha.anoReferencia, new Date().toISOString().slice(0, 10));
      await pool.request().input("id", sql.Int, idRota).input("status", sql.NVarChar(20), transicao.novoStatus)
        .input("atrasado", sql.Bit, atrasado)
        .query(`UPDATE RelatoriosDepartamentais SET Status = @status, Atrasado = @atrasado, DataEnvio = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME() WHERE RelatorioDepartamentalId = @id`);
    } else if (transicao.novoStatus !== linha.status) {
      await pool.request().input("id", sql.Int, idRota).input("status", sql.NVarChar(20), transicao.novoStatus)
        .query(`UPDATE RelatoriosDepartamentais SET Status = @status, AtualizadoEm = SYSUTCDATETIME() WHERE RelatorioDepartamentalId = @id`);
    } else {
      await pool.request().input("id", sql.Int, idRota)
        .query(`UPDATE RelatoriosDepartamentais SET AtualizadoEm = SYSUTCDATETIME() WHERE RelatorioDepartamentalId = @id`);
    }

    await registrarAprovacao(pool, {
      relatorioDepartamentalId: Number(idRota), nivelAprovador: usuario.nivel, acao,
      comentario, membroId: usuario.membroId
    });
    await registrarAuditoria({
      tabela: "RelatoriosDepartamentais", registroId: Number(idRota),
      acao: `${acao} (relatório departamental, ${linha.mesReferencia}/${linha.anoReferencia})`,
      usuarioId: usuario.membroId, dadosAntes: { status: linha.status }, dadosDepois: { status: transicao.novoStatus }
    });

    const atualizado = await pool.request().input("id", sql.Int, idRota).query(`${SELECT_RELATORIO_BASE} WHERE r.RelatorioDepartamentalId = @id`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: await montarDetalheRelatorio(pool, atualizado.recordset[0]) };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
