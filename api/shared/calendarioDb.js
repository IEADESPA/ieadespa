// shared/calendarioDb.js (v7.2 — Calendário Oficial e Agenda Unificada)
//
// A parte com banco do calendário. Toda decisão de regra (conflito, prevalência,
// consolidação, validação) está em shared/calendario.js, pura e testada; aqui só
// se carrega a pauta, chama o motor e grava o resultado, com auditoria.
//
// O ciclo de uma data (Regimento Art. 154 §2º):
//   PROPOSTO  ──(consolidação da Secretaria)──►  DEFERIDO | INDEFERIDO
//   DEFERIDO  ──(homologação do ano pela CLI)──►  HOMOLOGADO  (Direito Adquirido)
// Proposta que chega DEPOIS de 15/jan, remarcação e evento de Nível 1 não esperam
// a consolidação: são avaliados na hora contra a pauta. Só HOMOLOGADO vai para o site.
const crypto = require("crypto");
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const cal = require("./calendario");

const LIMITE_LISTA = 500;
const LIMITE_JANELA_AGENDA_DIAS = 366;

const removerPrefixoNumerico = (nome) => String(nome || "").replace(/^\d+\s*-\s*/, "");
const limpar = (v) => String(v == null ? "" : v).trim();

// ---------------------------------------------------------------
// Catálogo de tipos e contexto territorial
// ---------------------------------------------------------------

function mapearTipo(r, compativeis) {
  return {
    tipoId: r.TipoId, codigo: r.Codigo, nome: r.Nome, nivel: r.Nivel, rotuloNivel: cal.ROTULO_NIVEL[r.Nivel],
    abrangenciasPermitidas: String(r.AbrangenciasPermitidas || "").split(",").map(s => s.trim()).filter(Boolean),
    fechaCongregacoes: !!r.FechaCongregacoes, festividade: !!r.Festividade, publicoNoSite: !!r.PublicoNoSite,
    antecedenciaMinimaHoras: r.AntecedenciaMinimaHoras, registraPresencaDirigente: !!r.RegistraPresencaDirigente,
    artigoRef: r.ArtigoRef, ordem: r.Ordem, ativo: !!r.Ativo, compativeis: compativeis || []
  };
}

async function listarTipos(pool, { incluirInativos = false } = {}) {
  const tipos = (await pool.request().query(`
    SELECT TipoId, Codigo, Nome, Nivel, AbrangenciasPermitidas, FechaCongregacoes, Festividade, PublicoNoSite,
           AntecedenciaMinimaHoras, RegistraPresencaDirigente, ArtigoRef, Ordem, Ativo
    FROM CalendarioTiposEvento ${incluirInativos ? "" : "WHERE Ativo = 1"} ORDER BY Nivel, Ordem, Nome
  `)).recordset;
  const pares = (await pool.request().query(`
    SELECT a.Codigo AS De, b.Codigo AS Para FROM CalendarioTiposCompativeis x
    JOIN CalendarioTiposEvento a ON a.TipoId = x.TipoId JOIN CalendarioTiposEvento b ON b.TipoId = x.CompativelId
  `)).recordset;
  return tipos.map(t => mapearTipo(t, pares.filter(p => p.De === t.Codigo).map(p => p.Para)));
}

async function buscarTipo(pool, tipoId) {
  const todos = await listarTipos(pool, { incluirInativos: true });
  return todos.find(t => t.tipoId === Number(tipoId)) || null;
}

async function buscarTipoPorCodigo(pool, codigo) {
  const todos = await listarTipos(pool, { incluirInativos: true });
  return todos.find(t => t.codigo === codigo) || null;
}

async function criarTipo(pool, { dados, membroId }) {
  const existe = await pool.request().input("c", sql.NVarChar(50), dados.codigo).query(`SELECT TipoId FROM CalendarioTiposEvento WHERE Codigo = @c`);
  if (existe.recordset.length) return { sucesso: false, mensagem: "Já existe um tipo com esse código." };
  const ordem = (await pool.request().input("n", sql.TinyInt, dados.nivel).input("base", sql.Int, dados.nivel * 10)
    .query(`SELECT ISNULL(MAX(Ordem), @base) + 1 AS o FROM CalendarioTiposEvento WHERE Nivel = @n`)).recordset[0].o;
  const r = await pool.request()
    .input("codigo", sql.NVarChar(50), dados.codigo).input("nome", sql.NVarChar(150), dados.nome).input("nivel", sql.TinyInt, dados.nivel)
    .input("abr", sql.NVarChar(40), dados.abrangenciasPermitidas).input("fecha", sql.Bit, dados.fechaCongregacoes).input("festa", sql.Bit, dados.festividade)
    .input("publico", sql.Bit, dados.publicoNoSite).input("antec", sql.Int, dados.antecedenciaMinimaHoras).input("presenca", sql.Bit, dados.registraPresencaDirigente)
    .input("art", sql.NVarChar(80), dados.artigoRef).input("ordem", sql.Int, ordem)
    .query(`
      INSERT INTO CalendarioTiposEvento (Codigo, Nome, Nivel, AbrangenciasPermitidas, FechaCongregacoes, Festividade, PublicoNoSite, AntecedenciaMinimaHoras, RegistraPresencaDirigente, ArtigoRef, Ordem)
      OUTPUT INSERTED.TipoId VALUES (@codigo, @nome, @nivel, @abr, @fecha, @festa, @publico, @antec, @presenca, @art, @ordem)
    `);
  const tipoId = r.recordset[0].TipoId;
  await registrarAuditoria({ tabela: "CalendarioTiposEvento", registroId: tipoId, acao: "TIPO_CRIADO", usuarioId: membroId, dadosAntes: null, dadosDepois: dados });
  return { sucesso: true, mensagem: `Tipo "${dados.nome}" criado (Nível ${dados.nivel}).`, tipoId };
}

async function atualizarTipo(pool, { tipoId, dados, ativo, membroId }) {
  const antes = await buscarTipo(pool, tipoId);
  if (!antes) return { sucesso: false, mensagem: "Tipo não encontrado." };
  const novoAtivo = ativo == null ? antes.ativo : !!ativo;
  await pool.request().input("id", sql.Int, antes.tipoId)
    .input("nome", sql.NVarChar(150), dados.nome).input("nivel", sql.TinyInt, dados.nivel).input("abr", sql.NVarChar(40), dados.abrangenciasPermitidas)
    .input("fecha", sql.Bit, dados.fechaCongregacoes).input("festa", sql.Bit, dados.festividade).input("publico", sql.Bit, dados.publicoNoSite)
    .input("antec", sql.Int, dados.antecedenciaMinimaHoras).input("presenca", sql.Bit, dados.registraPresencaDirigente).input("art", sql.NVarChar(80), dados.artigoRef)
    .input("ativo", sql.Bit, novoAtivo)
    .query(`
      UPDATE CalendarioTiposEvento SET Nome = @nome, Nivel = @nivel, AbrangenciasPermitidas = @abr, FechaCongregacoes = @fecha, Festividade = @festa,
             PublicoNoSite = @publico, AntecedenciaMinimaHoras = @antec, RegistraPresencaDirigente = @presenca, ArtigoRef = @art, Ativo = @ativo
      WHERE TipoId = @id
    `);
  await registrarAuditoria({ tabela: "CalendarioTiposEvento", registroId: antes.tipoId, acao: "TIPO_ATUALIZADO", usuarioId: membroId, dadosAntes: antes, dadosDepois: { ...dados, ativo: novoAtivo } });
  return { sucesso: true, mensagem: "Tipo atualizado. Vale para as propostas daqui em diante; os eventos já registrados guardam o nível do dia em que foram propostos." };
}

// Congregações e Áreas num formato que o motor entende (areaDe) e que o escopo
// de quem propõe consulta.
async function carregarContextoTerritorial(pool) {
  const congregacoes = (await pool.request().query(`SELECT CongregacaoId, Nome, Slug, AreaId, Ativa FROM Congregacoes`)).recordset;
  const areas = (await pool.request().query(`SELECT AreaId, Nome FROM Areas`)).recordset;
  const mapa = new Map(congregacoes.map(c => [c.CongregacaoId, { id: c.CongregacaoId, nome: c.Nome, nomePublico: removerPrefixoNumerico(c.Nome), slug: c.Slug, areaId: c.AreaId, ativa: !!c.Ativa }]));
  const mapaAreas = new Map(areas.map(a => [a.AreaId, a.Nome]));
  return {
    congregacoes: mapa,
    areas: mapaAreas,
    areaDe: (id) => (mapa.has(id) ? mapa.get(id).areaId : null),
    congregacoesDaArea: (areaId) => congregacoes.filter(c => c.AreaId === areaId && c.Ativa).map(c => c.CongregacaoId),
    sedeId: (congregacoes.find(c => c.Slug === "sede") || {}).CongregacaoId || null
  };
}

// ---------------------------------------------------------------
// Eventos: leitura e mapeamento
// ---------------------------------------------------------------

const SELECT_EVENTO = `
  SELECT e.EventoId, e.Ano, e.TipoId, t.Codigo AS TipoCodigo, t.Nome AS TipoNome, t.Festividade, t.FechaCongregacoes, t.RegistraPresencaDirigente,
         e.Nivel, e.Titulo, e.Descricao,
         CONVERT(varchar(10), e.DataInicio, 23) AS DataInicio, CONVERT(varchar(10), e.DataFim, 23) AS DataFim,
         CONVERT(varchar(5), e.HoraInicio, 108) AS HoraInicio, CONVERT(varchar(5), e.HoraFim, 108) AS HoraFim,
         e.Abrangencia, e.CongregacaoId, c.Nome AS CongregacaoNome, e.Local, e.OrgaoId, e.DepartamentoId,
         e.Origem, e.RegraChave, e.Status, e.Tardia, e.RemarcacaoDeEventoId, e.MotivoIndeferimento, e.DetalheDecisao,
         e.PrevalecidoPorEventoId, e.PropostoPorMembroId, mp.Nome AS PropostoPorNome,
         CONVERT(varchar(23), e.PropostaEm, 126) AS PropostaEm,
         e.DecididoPorMembroId, CONVERT(varchar(23), e.DecididoEm, 126) AS DecididoEm, CONVERT(varchar(23), e.HomologadoEm, 126) AS HomologadoEm,
         CONVERT(varchar(23), e.CanceladoEm, 126) AS CanceladoEm, e.MotivoCancelamento, e.SlugSite, e.PublicoNoSite
  FROM CalendarioEventos e
  JOIN CalendarioTiposEvento t ON t.TipoId = e.TipoId
  LEFT JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
  LEFT JOIN MembroReferencia mp ON mp.MembroId = e.PropostoPorMembroId
`;

function mapearEvento(r, { compativeisPorCodigo, areasDoEvento, ctx } = {}) {
  const areaIds = (areasDoEvento && areasDoEvento.get(r.EventoId)) || [];
  return {
    id: r.EventoId, eventoId: r.EventoId, ano: r.Ano, tipoId: r.TipoId,
    tipo: {
      codigo: r.TipoCodigo, nome: r.TipoNome, festividade: !!r.Festividade, fechaCongregacoes: !!r.FechaCongregacoes,
      registraPresencaDirigente: !!r.RegistraPresencaDirigente, compativeis: (compativeisPorCodigo && compativeisPorCodigo.get(r.TipoCodigo)) || []
    },
    nivel: r.Nivel, rotuloNivel: cal.ROTULO_NIVEL[r.Nivel],
    titulo: r.Titulo, descricao: r.Descricao, dataInicio: r.DataInicio, dataFim: r.DataFim, horaInicio: r.HoraInicio, horaFim: r.HoraFim,
    abrangencia: r.Abrangencia, congregacaoId: r.CongregacaoId, congregacaoNome: r.CongregacaoNome ? removerPrefixoNumerico(r.CongregacaoNome) : null,
    areaIds, areaNomes: ctx ? areaIds.map(a => ctx.areas.get(a)).filter(Boolean) : [],
    local: r.Local, orgaoId: r.OrgaoId, departamentoId: r.DepartamentoId,
    origem: r.Origem, regraChave: r.RegraChave, status: r.Status, tardia: !!r.Tardia,
    remarcacaoDeEventoId: r.RemarcacaoDeEventoId, motivoIndeferimento: r.MotivoIndeferimento,
    rotuloMotivo: r.MotivoIndeferimento ? cal.ROTULO_MOTIVO[r.MotivoIndeferimento] : null, detalheDecisao: r.DetalheDecisao,
    prevalecidoPorEventoId: r.PrevalecidoPorEventoId,
    propostoPorMembroId: r.PropostoPorMembroId, propostoPorNome: r.PropostoPorNome || null,
    propostaEm: r.PropostaEm ? `${r.PropostaEm}Z` : null,
    decididoPorMembroId: r.DecididoPorMembroId, decididoEm: r.DecididoEm ? `${r.DecididoEm}Z` : null,
    homologadoEm: r.HomologadoEm ? `${r.HomologadoEm}Z` : null, canceladoEm: r.CanceladoEm ? `${r.CanceladoEm}Z` : null,
    motivoCancelamento: r.MotivoCancelamento, slugSite: r.SlugSite, publicoNoSite: !!r.PublicoNoSite
  };
}

async function carregarCompativeis(pool) {
  const pares = (await pool.request().query(`
    SELECT a.Codigo AS De, b.Codigo AS Para FROM CalendarioTiposCompativeis x
    JOIN CalendarioTiposEvento a ON a.TipoId = x.TipoId JOIN CalendarioTiposEvento b ON b.TipoId = x.CompativelId
  `)).recordset;
  const mapa = new Map();
  for (const p of pares) { if (!mapa.has(p.De)) mapa.set(p.De, []); mapa.get(p.De).push(p.Para); }
  return mapa;
}

// Carrega eventos por filtro. `filtros`: { ano, de, ate, status[], eventoId, propostoPor, nivel, limite }.
async function carregarEventos(pool, filtros = {}, ctx) {
  const request = pool.request();
  let where = "1=1";
  if (filtros.eventoId) { request.input("eventoId", sql.Int, filtros.eventoId); where += " AND e.EventoId = @eventoId"; }
  if (filtros.ano) { request.input("ano", sql.SmallInt, filtros.ano); where += " AND e.Ano = @ano"; }
  if (filtros.de) { request.input("de", sql.Date, filtros.de); where += " AND e.DataFim >= @de"; }
  if (filtros.ate) { request.input("ate", sql.Date, filtros.ate); where += " AND e.DataInicio <= @ate"; }
  if (filtros.status && filtros.status.length) {
    const marcadores = filtros.status.map((s, i) => { request.input(`st${i}`, sql.NVarChar(12), s); return `@st${i}`; });
    where += ` AND e.Status IN (${marcadores.join(", ")})`;
  }
  if (filtros.propostoPor) { request.input("prop", sql.Int, filtros.propostoPor); where += " AND e.PropostoPorMembroId = @prop"; }
  if (filtros.nivel) { request.input("nivel", sql.TinyInt, filtros.nivel); where += " AND e.Nivel = @nivel"; }
  if (filtros.congregacaoId) { request.input("cong", sql.Int, filtros.congregacaoId); where += " AND e.CongregacaoId = @cong"; }
  const topo = filtros.limite ? `TOP (${Number(filtros.limite)}) ` : "";
  const linhas = (await request.query(`${SELECT_EVENTO.replace("SELECT ", `SELECT ${topo}`)} WHERE ${where} ORDER BY e.DataInicio, e.HoraInicio, e.EventoId`)).recordset;
  if (linhas.length === 0) return [];

  const ids = linhas.map(l => l.EventoId);
  const areasDoEvento = new Map();
  // IN com parâmetros em lotes (limite de ~2100 por consulta).
  for (let i = 0; i < ids.length; i += 500) {
    const lote = ids.slice(i, i + 500);
    const req = pool.request();
    const marcadores = lote.map((id, k) => { req.input(`id${k}`, sql.Int, id); return `@id${k}`; });
    const r = await req.query(`SELECT EventoId, AreaId FROM CalendarioEventoAreas WHERE EventoId IN (${marcadores.join(", ")})`);
    for (const x of r.recordset) { if (!areasDoEvento.has(x.EventoId)) areasDoEvento.set(x.EventoId, []); areasDoEvento.get(x.EventoId).push(x.AreaId); }
  }
  const compativeisPorCodigo = await carregarCompativeis(pool);
  return linhas.map(l => mapearEvento(l, { compativeisPorCodigo, areasDoEvento, ctx }));
}

async function buscarEvento(pool, eventoId, ctx) {
  const lista = await carregarEventos(pool, { eventoId }, ctx);
  return lista[0] || null;
}

// A pauta que disputa data com um evento: tudo que está ATIVO na janela dele
// (com folga de uma semana de cada lado para a trava de fim de semana).
async function carregarPautaAtiva(pool, { dataInicio, dataFim }, ctx) {
  return carregarEventos(pool, {
    de: cal.somarDias(dataInicio, -7), ate: cal.somarDias(dataFim, 7), status: cal.STATUS_ATIVOS
  }, ctx);
}

// ---------------------------------------------------------------
// Ano do calendário
// ---------------------------------------------------------------

function mapearAno(r) {
  return {
    ano: r.Ano, status: r.Status, prazoPropostas: r.PrazoPropostas, cicloGeradoEm: r.CicloGeradoEm,
    consolidadoPorMembroId: r.ConsolidadoPorMembroId, consolidadoEm: r.ConsolidadoEm,
    homologadoPorMembroId: r.HomologadoPorMembroId, homologadoEm: r.HomologadoEm, ataReferencia: r.AtaReferencia
  };
}

const SELECT_ANO = `
  SELECT Ano, Status, CONVERT(varchar(10), PrazoPropostas, 23) AS PrazoPropostas, CONVERT(varchar(23), CicloGeradoEm, 126) AS CicloGeradoEm,
         ConsolidadoPorMembroId, CONVERT(varchar(23), ConsolidadoEm, 126) AS ConsolidadoEm,
         HomologadoPorMembroId, CONVERT(varchar(23), HomologadoEm, 126) AS HomologadoEm, AtaReferencia
  FROM CalendarioAnos
`;

async function lerAno(pool, ano) {
  const r = await pool.request().input("ano", sql.SmallInt, ano).query(`${SELECT_ANO} WHERE Ano = @ano`);
  return r.recordset[0] ? mapearAno(r.recordset[0]) : null;
}

function validarAnoCalendario(ano, hoje) {
  const a = Number(ano);
  if (!Number.isInteger(a) || a < 2000 || a > 2200) return { valido: false, mensagem: "Informe um ano válido." };
  const atual = Number(hoje.slice(0, 4));
  if (a < atual - 1) return { valido: false, mensagem: "Anos muito antigos não se abrem." };
  if (a > atual + 2) return { valido: false, mensagem: "O calendário só se planeja até dois anos à frente." };
  return { valido: true, ano: a };
}

// Cria o ano se ainda não existe (15/jan como prazo). Idempotente.
async function garantirAno(pool, ano, membroId) {
  const existente = await lerAno(pool, ano);
  if (existente) return existente;
  try {
    await pool.request().input("ano", sql.SmallInt, ano).input("prazo", sql.Date, cal.prazoPropostasDoAno(ano))
      .query(`INSERT INTO CalendarioAnos (Ano, PrazoPropostas) VALUES (@ano, @prazo)`);
    await registrarAuditoria({ tabela: "CalendarioAnos", registroId: ano, acao: "ANO_ABERTO", usuarioId: membroId, dadosAntes: null, dadosDepois: { ano, prazoPropostas: cal.prazoPropostasDoAno(ano) } });
  } catch (e) {
    if (!(e && (e.number === 2627 || e.number === 2601))) throw e; // outro pedido abriu ao mesmo tempo: segue
  }
  return lerAno(pool, ano);
}

async function listarAnos(pool, { hoje = hojeBrasilia() } = {}) {
  const anos = (await pool.request().query(`${SELECT_ANO} ORDER BY Ano DESC`)).recordset.map(mapearAno);
  const contagens = (await pool.request().query(`SELECT Ano, Status, COUNT(*) AS n FROM CalendarioEventos GROUP BY Ano, Status`)).recordset;
  return anos.map(a => {
    const porStatus = {};
    for (const c of contagens.filter(x => x.Ano === a.ano)) porStatus[c.Status] = c.n;
    return { ...a, eventos: porStatus, prazoVencido: hoje > a.prazoPropostas };
  });
}

// ---------------------------------------------------------------
// Escrita de eventos
// ---------------------------------------------------------------

async function inserirEvento(executor, d) {
  const req = new sql.Request(executor)
    .input("ano", sql.SmallInt, d.ano).input("tipoId", sql.Int, d.tipoId).input("nivel", sql.TinyInt, d.nivel)
    .input("titulo", sql.NVarChar(200), d.titulo).input("descricao", sql.NVarChar(1000), d.descricao)
    .input("ini", sql.Date, d.dataInicio).input("fim", sql.Date, d.dataFim)
    .input("hi", sql.VarChar(8), d.horaInicio).input("hf", sql.VarChar(8), d.horaFim)
    .input("abr", sql.NVarChar(12), d.abrangencia).input("cong", sql.Int, d.congregacaoId)
    .input("local", sql.NVarChar(200), d.local).input("orgao", sql.Int, d.orgaoId || null).input("dep", sql.Int, d.departamentoId || null)
    .input("origem", sql.NVarChar(10), d.origem || "PROPOSTA").input("chave", sql.NVarChar(60), d.regraChave || null)
    .input("status", sql.NVarChar(12), d.status).input("tardia", sql.Bit, !!d.tardia)
    .input("remarca", sql.Int, d.remarcacaoDeEventoId || null).input("proponente", sql.Int, d.propostoPorMembroId || null)
    .input("slug", sql.NVarChar(150), d.slugSite || null).input("publico", sql.Bit, !!d.publicoNoSite)
    .input("propostaEm", sql.NVarChar(30), d.propostaEm || null)
    .input("decididoPor", sql.Int, d.decididoPorMembroId || null);
  const r = await req.query(`
    INSERT INTO CalendarioEventos (Ano, TipoId, Nivel, Titulo, Descricao, DataInicio, DataFim, HoraInicio, HoraFim, Abrangencia, CongregacaoId, Local,
                                   OrgaoId, DepartamentoId, Origem, RegraChave, Status, Tardia, RemarcacaoDeEventoId, PropostoPorMembroId, SlugSite, PublicoNoSite,
                                   PropostaEm, DecididoPorMembroId, DecididoEm, HomologadoEm)
    OUTPUT INSERTED.EventoId
    VALUES (@ano, @tipoId, @nivel, @titulo, @descricao, @ini, @fim, @hi, @hf, @abr, @cong, @local,
            @orgao, @dep, @origem, @chave, @status, @tardia, @remarca, @proponente, @slug, @publico,
            ISNULL(CAST(@propostaEm AS DATETIME2(3)), SYSUTCDATETIME()), @decididoPor,
            CASE WHEN @status IN ('DEFERIDO', 'HOMOLOGADO', 'INDEFERIDO') THEN SYSUTCDATETIME() ELSE NULL END,
            CASE WHEN @status = 'HOMOLOGADO' THEN SYSUTCDATETIME() ELSE NULL END)
  `);
  const eventoId = r.recordset[0].EventoId;
  for (const areaId of d.areaIds || []) {
    await new sql.Request(executor).input("e", sql.Int, eventoId).input("a", sql.Int, areaId)
      .query(`INSERT INTO CalendarioEventoAreas (EventoId, AreaId) VALUES (@e, @a)`);
  }
  return eventoId;
}

async function atualizarDecisao(executor, eventoId, { status, motivo, detalhe, prevalecidoPorId, decididoPor, homologado }) {
  await new sql.Request(executor)
    .input("id", sql.Int, eventoId).input("status", sql.NVarChar(12), status).input("motivo", sql.NVarChar(30), motivo || null)
    .input("detalhe", sql.NVarChar(600), detalhe ? String(detalhe).slice(0, 600) : null).input("prev", sql.Int, prevalecidoPorId || null)
    .input("por", sql.Int, decididoPor || null).input("hom", sql.Bit, !!homologado)
    .query(`
      UPDATE CalendarioEventos SET Status = @status, MotivoIndeferimento = @motivo, DetalheDecisao = @detalhe, PrevalecidoPorEventoId = @prev,
             DecididoPorMembroId = @por, DecididoEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME(),
             HomologadoEm = CASE WHEN @hom = 1 THEN SYSUTCDATETIME() ELSE HomologadoEm END
      WHERE EventoId = @id
    `);
}

// Monta o evento "como o motor o vê" a partir dos dados validados (ainda sem id).
function eventoParaMotor(dados, tipo, extra = {}) {
  return {
    id: extra.id ?? null, nivel: tipo.nivel,
    tipo: { codigo: tipo.codigo, festividade: tipo.festividade, fechaCongregacoes: tipo.fechaCongregacoes, compativeis: tipo.compativeis },
    titulo: dados.titulo, dataInicio: dados.dataInicio, dataFim: dados.dataFim, horaInicio: dados.horaInicio, horaFim: dados.horaFim,
    abrangencia: dados.abrangencia, congregacaoId: dados.congregacaoId, areaIds: dados.areaIds || [],
    propostaEm: extra.propostaEm || new Date().toISOString(), status: extra.status || "PROPOSTO", tardia: !!extra.tardia, origem: extra.origem || "PROPOSTA"
  };
}

// Pré-checagem para a tela: o que aconteceria com esta data agora? Nada é gravado.
async function verificarProposta(pool, { dados, tipo, ctx, hoje = hojeBrasilia() }) {
  const ano = Number(dados.dataInicio.slice(0, 4));
  const anoRow = await lerAno(pool, ano);
  const prazo = anoRow ? anoRow.prazoPropostas : cal.prazoPropostasDoAno(ano);
  const tardia = cal.propostaEhTardia({ nivel: tipo.nivel, origem: "PROPOSTA", hoje, prazoPropostas: prazo });
  const imediata = tardia || tipo.nivel === 1;
  const proposta = eventoParaMotor(dados, tipo, { tardia });
  const pauta = await carregarPautaAtiva(pool, dados, ctx);
  const avaliacao = cal.avaliarProposta(proposta, pauta, ctx, { tardia });
  const sugestoes = avaliacao.veredito === "RECUSADA" ? cal.sugerirDatasLivres(proposta, pauta, ctx, { hoje }) : [];
  return {
    ano, prazoPropostas: prazo, tardia, decisaoImediata: imediata, veredito: avaliacao.veredito, motivo: avaliacao.motivo || null,
    rotuloMotivo: avaliacao.motivo ? cal.ROTULO_MOTIVO[avaliacao.motivo] : null, detalhe: avaliacao.detalhe || null,
    conflitos: avaliacao.conflitos.map(c => ({
      eventoId: c.evento.id, titulo: c.evento.titulo, nivel: c.evento.nivel, status: c.evento.status,
      dataInicio: c.evento.dataInicio, dataFim: c.evento.dataFim, motivoConflito: c.motivoConflito
    })),
    sugestoes,
    mensagem: avaliacao.veredito === "LIVRE"
      ? (imediata ? "Data livre — o evento será deferido na hora." : "Sem choque por enquanto. A decisão sai na consolidação da Secretaria, depois de 15 de janeiro, pela ordem de chegada e pelo nível.")
      : avaliacao.veredito === "ABSORVE"
        ? "Evento de Nível 1: absorve os de nível inferior que coincidem (eles terão de ser remarcados)."
        : (imediata ? `Não cabe: ${avaliacao.detalhe}` : `Há choque hoje com a pauta; a decisão final sai na consolidação. ${avaliacao.detalhe}`)
  };
}

// Propõe um evento. `dados` já validados (cal.validarProposta). Decisão imediata para
// proposta tardia, remarcação e Nível 1; senão fica PROPOSTO até a consolidação.
async function propor(pool, { dados, tipo, ctx, membroId, remarcacaoDe, hoje = hojeBrasilia() }) {
  const ano = Number(dados.dataInicio.slice(0, 4));
  const anoRow = await garantirAno(pool, ano, membroId);
  if (!anoRow) return { sucesso: false, mensagem: "Não foi possível abrir o ano do calendário." };

  let tardia = cal.propostaEhTardia({ nivel: tipo.nivel, origem: "PROPOSTA", hoje, prazoPropostas: anoRow.prazoPropostas });
  let propostaEm = null;
  if (remarcacaoDe) {
    // Remarcação por derrota/absorção herda o carimbo (Direito Adquirido Temporal) e a condição de prazo do original.
    if (!["INDEFERIDO", "ABSORVIDO"].includes(remarcacaoDe.status) || remarcacaoDe.motivoIndeferimento === "ESGOTAMENTO_PAUTA") {
      return { sucesso: false, mensagem: "Só se remarca um evento indeferido por choque ou absorvido — e nunca o indeferido por Esgotamento de Pauta (sem direito a recurso)." };
    }
    tardia = !!remarcacaoDe.tardia;
    propostaEm = remarcacaoDe.propostaEm ? remarcacaoDe.propostaEm.replace("Z", "") : null;
  }
  // Ano já homologado não tem mais consolidação: toda proposta nova é avaliada na hora
  // (senão ficaria PROPOSTA para sempre).
  const anoHomologado = anoRow.status === "HOMOLOGADO";
  const imediata = tardia || tipo.nivel === 1 || !!remarcacaoDe || anoHomologado;

  const proposta = eventoParaMotor(dados, tipo, { tardia, propostaEm: propostaEm ? `${propostaEm}Z` : undefined });
  let avaliacao = null;
  if (imediata) {
    const pauta = await carregarPautaAtiva(pool, dados, ctx);
    avaliacao = cal.avaliarProposta(proposta, pauta, ctx, { tardia: tardia && !remarcacaoDe });
  }

  const status = !imediata ? "PROPOSTO"
    : avaliacao.veredito === "RECUSADA" ? "INDEFERIDO"
    : anoHomologado ? "HOMOLOGADO" : "DEFERIDO";

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let eventoId;
  const absorvidos = [];
  try {
    eventoId = await inserirEvento(transaction, {
      ano, tipoId: tipo.tipoId, nivel: tipo.nivel, ...dados, origem: "PROPOSTA", status, tardia,
      remarcacaoDeEventoId: remarcacaoDe ? remarcacaoDe.id : null, propostoPorMembroId: membroId, propostaEm
    });
    if (status === "INDEFERIDO") {
      await atualizarDecisao(transaction, eventoId, { status, motivo: avaliacao.motivo, detalhe: avaliacao.detalhe, prevalecidoPorId: avaliacao.prevalecidoPorId, decididoPor: null });
    }
    if (imediata && avaliacao.veredito === "ABSORVE") {
      for (const vitima of avaliacao.absorvidos) {
        const acquired = vitima.status === "HOMOLOGADO";
        await atualizarDecisao(transaction, vitima.id, {
          status: acquired ? "ABSORVIDO" : "INDEFERIDO", motivo: acquired ? "ABSORVIDO_NIVEL_1" : "CONFLITO_HIERARQUIA",
          detalhe: `${cal.ROTULO_MOTIVO[acquired ? "ABSORVIDO_NIVEL_1" : "CONFLITO_HIERARQUIA"]}: "${dados.titulo}" (${cal.formatarDataBr(dados.dataInicio)}). Escolha outra data.`,
          prevalecidoPorId: eventoId, decididoPor: membroId
        });
        absorvidos.push(vitima.id);
      }
    }
    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch { /* já encerrada */ }
    throw e;
  }
  await registrarAuditoria({
    tabela: "CalendarioEventos", registroId: eventoId, acao: "EVENTO_PROPOSTO", usuarioId: membroId, dadosAntes: null,
    dadosDepois: { tipo: tipo.codigo, nivel: tipo.nivel, dataInicio: dados.dataInicio, dataFim: dados.dataFim, abrangencia: dados.abrangencia, status, tardia, absorvidos }
  });
  for (const id of absorvidos) {
    await registrarAuditoria({ tabela: "CalendarioEventos", registroId: id, acao: "EVENTO_ABSORVIDO_NIVEL_1", usuarioId: membroId, dadosAntes: null, dadosDepois: { porEvento: eventoId } });
  }

  const evento = await buscarEvento(pool, eventoId, ctx);
  const sugestoes = status === "INDEFERIDO" ? cal.sugerirDatasLivres(proposta, await carregarPautaAtiva(pool, dados, ctx), ctx, { hoje }) : [];
  let mensagem;
  if (status === "PROPOSTO") mensagem = `Proposta registrada às ${new Date(evento.propostaEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — esse carimbo desempata eventos do mesmo nível. A decisão sai na consolidação da Secretaria, depois de 15 de janeiro.`;
  else if (status === "INDEFERIDO") mensagem = `Não foi possível agendar: ${evento.detalheDecisao}`;
  else if (absorvidos.length) mensagem = `Evento de Nível 1 ${anoHomologado ? "homologado" : "deferido"}. ${absorvidos.length} evento(s) de nível inferior foram absorvidos e precisam ser remarcados.`;
  else mensagem = anoHomologado ? "Evento aceito e homologado: entra no Calendário Oficial." : "Evento deferido. Entra no Calendário Oficial quando a CLI homologar o ano.";
  return { sucesso: status !== "INDEFERIDO", mensagem, evento, absorvidos, sugestoes, eventoId };
}

// Consolidação da Secretaria: hierarquia + ordem de chegada sobre TODAS as propostas
// ainda movíveis do ano. Pode ser repetida até a homologação.
async function consolidarAno(pool, { ano, membroId, ctx }) {
  const anoRow = await lerAno(pool, ano);
  if (!anoRow) return { sucesso: false, mensagem: "Esse ano ainda não foi aberto no calendário." };
  if (anoRow.status === "HOMOLOGADO") return { sucesso: false, mensagem: "O ano já foi homologado — as datas são Direito Adquirido. Novas propostas são avaliadas na hora." };
  // As datas que a norma já fixa (Ceia, CLI, Conselho Fiscal, CEI) têm de estar na pauta ANTES da disputa:
  // são elas que fazem as propostas de nível inferior que caem no mesmo dia perderem.
  if (!anoRow.cicloGeradoEm) return { sucesso: false, mensagem: `Gere o ciclo mensal de ${ano} (Ceia, CLI, Conselho Fiscal e CEI) antes de consolidar — sem ele, as propostas não são confrontadas com as datas fixadas pelo Regimento.` };

  const movel = await carregarEventos(pool, { ano, status: ["PROPOSTO", "DEFERIDO"] }, ctx);
  const fixos = (await carregarEventos(pool, { de: `${ano}-01-01`, ate: `${ano}-12-31`, status: ["HOMOLOGADO"] }, ctx));
  const decisoes = cal.consolidar(movel, fixos, ctx);
  const porId = new Map(movel.map(e => [e.id, e]));

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const resumo = { deferidos: 0, indeferidos: 0, mantidos: 0 };
  const novosIndeferidos = [];
  try {
    for (const d of decisoes) {
      const atual = porId.get(d.eventoId);
      const mudou = atual.status !== d.status || (d.status === "INDEFERIDO" && atual.motivoIndeferimento !== d.motivo);
      if (!mudou) { resumo.mantidos++; continue; }
      await atualizarDecisao(transaction, d.eventoId, {
        status: d.status, motivo: d.motivo, detalhe: d.detalhe, prevalecidoPorId: d.prevalecidoPorId, decididoPor: membroId
      });
      if (d.status === "DEFERIDO") resumo.deferidos++; else { resumo.indeferidos++; novosIndeferidos.push(atual); }
    }
    await new sql.Request(transaction).input("ano", sql.SmallInt, ano).input("por", sql.Int, membroId || null).query(`
      UPDATE CalendarioAnos SET Status = 'CONSOLIDADO', ConsolidadoPorMembroId = @por, ConsolidadoEm = SYSUTCDATETIME() WHERE Ano = @ano AND Status <> 'HOMOLOGADO'
    `);
    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch { /* já encerrada */ }
    throw e;
  }
  await registrarAuditoria({ tabela: "CalendarioAnos", registroId: ano, acao: "ANO_CONSOLIDADO", usuarioId: membroId, dadosAntes: { status: anoRow.status }, dadosDepois: { status: "CONSOLIDADO", ...resumo } });
  return {
    sucesso: true,
    mensagem: `Calendário ${ano} consolidado: ${decisoes.length} evento(s) analisado(s) — ${resumo.deferidos} deferido(s) agora, ${resumo.indeferidos} indeferido(s) por choque, ${resumo.mantidos} sem mudança. Os indeferidos foram avisados para escolher outra data.`,
    ...resumo, analisados: decisoes.length,
    listaIndeferidos: novosIndeferidos.map(e => ({ eventoId: e.id, titulo: e.titulo }))
  };
}

async function homologarAno(pool, { ano, ata, membroId, hoje = hojeBrasilia() }) {
  const anoRow = await lerAno(pool, ano);
  if (!anoRow) return { sucesso: false, mensagem: "Esse ano ainda não foi aberto no calendário." };
  if (anoRow.status === "HOMOLOGADO") return { sucesso: false, mensagem: "Esse calendário já foi homologado." };
  if (anoRow.status !== "CONSOLIDADO") return { sucesso: false, mensagem: "A Secretaria precisa consolidar o calendário antes da homologação." };
  // A CLI homologa na primeira reunião administrativa do ano (§2º, III): depois do prazo das propostas.
  if (hoje <= anoRow.prazoPropostas) return { sucesso: false, mensagem: `O prazo das propostas (${cal.formatarDataBr(anoRow.prazoPropostas)}) ainda não venceu — homologar antes tiraria das lideranças o direito de planejar.` };
  const texto = limpar(ata);
  if (texto.length < 3 || texto.length > 150) return { sucesso: false, mensagem: "Informe a ata da CLI que aprova o calendário (de 3 a 150 caracteres)." };
  const pendentes = (await pool.request().input("ano", sql.SmallInt, ano).query(`SELECT COUNT(*) AS n FROM CalendarioEventos WHERE Ano = @ano AND Status = 'PROPOSTO'`)).recordset[0].n;
  if (pendentes > 0) return { sucesso: false, mensagem: `Ainda há ${pendentes} proposta(s) sem decisão — consolide de novo ou indefira antes de homologar.` };

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let homologados;
  try {
    const marcar = await new sql.Request(transaction).input("ano", sql.SmallInt, ano).query(`
      UPDATE CalendarioEventos SET Status = 'HOMOLOGADO', HomologadoEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME()
      WHERE Ano = @ano AND Status = 'DEFERIDO'
    `);
    homologados = marcar.rowsAffected[0] || 0;
    const virou = await new sql.Request(transaction).input("ano", sql.SmallInt, ano).input("por", sql.Int, membroId || null).input("ata", sql.NVarChar(150), texto).query(`
      UPDATE CalendarioAnos SET Status = 'HOMOLOGADO', HomologadoPorMembroId = @por, HomologadoEm = SYSUTCDATETIME(), AtaReferencia = @ata
      WHERE Ano = @ano AND Status = 'CONSOLIDADO'
    `);
    if (virou.rowsAffected[0] !== 1) { await transaction.rollback(); return { sucesso: false, mensagem: "O calendário mudou de estado enquanto você homologava — recarregue a tela." }; }
    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch { /* já encerrada */ }
    throw e;
  }
  await registrarAuditoria({ tabela: "CalendarioAnos", registroId: ano, acao: "ANO_HOMOLOGADO", usuarioId: membroId, dadosAntes: { status: "CONSOLIDADO" }, dadosDepois: { status: "HOMOLOGADO", ata: texto, eventosHomologados: homologados } });
  return {
    sucesso: true,
    mensagem: `Calendário ${ano} homologado: ${homologados} evento(s) agora são Direito Adquirido e entram no Calendário Oficial (os públicos seguem para o site em até alguns minutos).`,
    homologados
  };
}

// Gera o que a norma já fixa (Ceia, CLI, NIF, CEI). Idempotente por RegraChave.
async function gerarCicloDoAno(pool, { ano, membroId, ctx, hoje = hojeBrasilia() }) {
  const anoRow = await garantirAno(pool, ano, membroId);
  if (anoRow.status === "HOMOLOGADO") {
    // Ano já homologado: o ciclo ainda pode ser gerado (se esqueceram), mas entra já homologado e absorve o que estiver no caminho.
  }
  const regras = cal.gerarCicloAnual(ano);
  const tipos = new Map((await listarTipos(pool, { incluirInativos: true })).map(t => [t.codigo, t]));
  const orgaos = new Map((await pool.request().query(`SELECT OrgaoId, Sigla FROM Orgaos`)).recordset.map(o => [o.Sigla, o.OrgaoId]));
  const existentes = new Set((await pool.request().input("ano", sql.SmallInt, ano).query(`SELECT RegraChave FROM CalendarioEventos WHERE Ano = @ano AND RegraChave IS NOT NULL`)).recordset.map(r => r.RegraChave));
  const criados = [];
  const ignorados = [];
  for (const r of regras) {
    if (existentes.has(r.regraChave)) continue;
    const tipo = tipos.get(r.tipoCodigo);
    if (!tipo) { ignorados.push(`${r.regraChave}: tipo ${r.tipoCodigo} não existe`); continue; }
    let congregacaoId = null;
    if (r.abrangencia === "CONGREGACAO") {
      congregacaoId = ctx.sedeId;
      if (!congregacaoId) { ignorados.push(`${r.regraChave}: não há congregação com o identificador "sede"`); continue; }
    }
    const dados = {
      titulo: r.titulo, descricao: r.descricao, dataInicio: r.dataInicio, dataFim: r.dataFim, horaInicio: r.horaInicio, horaFim: r.horaFim,
      abrangencia: r.abrangencia, congregacaoId, areaIds: [], local: r.local, orgaoId: orgaos.get(r.orgaoSigla) || null, publicoNoSite: r.publico
    };
    const proposta = eventoParaMotor(dados, tipo, { origem: "REGRA" });
    let status = anoRow.status === "HOMOLOGADO" ? "HOMOLOGADO" : "DEFERIDO";
    let avaliacao = null;
    if (anoRow.status === "HOMOLOGADO") {
      avaliacao = cal.avaliarProposta(proposta, await carregarPautaAtiva(pool, dados, ctx), ctx);
      if (avaliacao.veredito === "RECUSADA") status = "INDEFERIDO";
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const eventoId = await inserirEvento(transaction, {
        ano, tipoId: tipo.tipoId, nivel: tipo.nivel, ...dados, origem: "REGRA", regraChave: r.regraChave, status, tardia: false, propostoPorMembroId: membroId
      });
      if (status === "INDEFERIDO") await atualizarDecisao(transaction, eventoId, { status, motivo: avaliacao.motivo, detalhe: avaliacao.detalhe, prevalecidoPorId: avaliacao.prevalecidoPorId, decididoPor: null });
      if (avaliacao && avaliacao.veredito === "ABSORVE") {
        for (const v of avaliacao.absorvidos) {
          const acquired = v.status === "HOMOLOGADO";
          await atualizarDecisao(transaction, v.id, {
            status: acquired ? "ABSORVIDO" : "INDEFERIDO", motivo: acquired ? "ABSORVIDO_NIVEL_1" : "CONFLITO_HIERARQUIA",
            detalhe: `${cal.ROTULO_MOTIVO[acquired ? "ABSORVIDO_NIVEL_1" : "CONFLITO_HIERARQUIA"]}: "${dados.titulo}" (${cal.formatarDataBr(dados.dataInicio)}). Escolha outra data.`,
            prevalecidoPorId: eventoId, decididoPor: membroId
          });
        }
      }
      await transaction.commit();
      criados.push(r.regraChave);
    } catch (e) {
      try { await transaction.rollback(); } catch { /* já encerrada */ }
      if (e && (e.number === 2627 || e.number === 2601)) continue; // gerado ao mesmo tempo por outro pedido
      throw e;
    }
  }
  await pool.request().input("ano", sql.SmallInt, ano).query(`UPDATE CalendarioAnos SET CicloGeradoEm = SYSUTCDATETIME() WHERE Ano = @ano`);
  await registrarAuditoria({ tabela: "CalendarioAnos", registroId: ano, acao: "CICLO_GERADO", usuarioId: membroId, dadosAntes: null, dadosDepois: { criados: criados.length, jaExistiam: regras.length - criados.length - ignorados.length, ignorados: ignorados.length } });
  return {
    sucesso: true,
    mensagem: criados.length
      ? `Ciclo de ${ano} gerado: ${criados.length} evento(s) novo(s) (Ceia, CLI, Conselho Fiscal e CEI).${ignorados.length ? ` ${ignorados.length} não puderam ser criados.` : ""}`
      : `O ciclo de ${ano} já estava gerado.${ignorados.length ? ` ${ignorados.length} não puderam ser criados.` : ""}`,
    criados: criados.length, ignorados
  };
}

// ---------------------------------------------------------------
// Decisões sobre um evento
// ---------------------------------------------------------------

const rotuloStatus = (s) => ({ PROPOSTO: "aguardando consolidação", DEFERIDO: "deferido", HOMOLOGADO: "homologado", INDEFERIDO: "indeferido", ABSORVIDO: "absorvido", CANCELADO: "cancelado" }[s] || String(s).toLowerCase());

// Secretaria: defere uma proposta que ainda não foi decidida, se a data estiver livre.
async function deferirEvento(pool, { evento, membroId, ctx }) {
  if (evento.status !== "PROPOSTO") return { sucesso: false, mensagem: `Este evento está ${rotuloStatus(evento.status)} — só se defere o que aguarda decisão.` };
  const pauta = await carregarPautaAtiva(pool, evento, ctx);
  const aval = cal.avaliarProposta(evento, pauta, ctx, { tardia: evento.tardia && !evento.remarcacaoDeEventoId });
  if (aval.veredito !== "LIVRE") return { sucesso: false, mensagem: `Não dá para deferir: ${aval.detalhe || "a data absorve outros eventos — use a consolidação."}`, conflitos: aval.conflitos.map(c => ({ eventoId: c.evento.id, titulo: c.evento.titulo })) };
  const ano = await lerAno(pool, evento.ano);
  const novo = ano && ano.status === "HOMOLOGADO" ? "HOMOLOGADO" : "DEFERIDO";
  await atualizarDecisao(pool, evento.id, { status: novo, decididoPor: membroId, homologado: novo === "HOMOLOGADO" });
  await registrarAuditoria({ tabela: "CalendarioEventos", registroId: evento.id, acao: "EVENTO_DEFERIDO", usuarioId: membroId, dadosAntes: { status: evento.status }, dadosDepois: { status: novo } });
  return { sucesso: true, mensagem: novo === "HOMOLOGADO" ? "Evento deferido e homologado." : "Evento deferido." };
}

function validarMotivo(motivo, rotulo = "o motivo") {
  const t = limpar(motivo);
  if (t.length < 10) return { valido: false, mensagem: `Informe ${rotulo} (mínimo 10 caracteres).` };
  if (t.length > 500) return { valido: false, mensagem: `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} passa de 500 caracteres.` };
  return { valido: true, texto: t };
}

async function indeferirEvento(pool, { evento, motivo, membroId }) {
  if (!["PROPOSTO", "DEFERIDO"].includes(evento.status)) return { sucesso: false, mensagem: `Este evento está ${rotuloStatus(evento.status)} — só se indefere o que ainda não foi homologado.` };
  const m = validarMotivo(motivo, "o motivo do indeferimento");
  if (!m.valido) return { sucesso: false, mensagem: m.mensagem };
  await atualizarDecisao(pool, evento.id, { status: "INDEFERIDO", motivo: "DECISAO_SECRETARIA", detalhe: m.texto, decididoPor: membroId });
  await registrarAuditoria({ tabela: "CalendarioEventos", registroId: evento.id, acao: "EVENTO_INDEFERIDO", usuarioId: membroId, dadosAntes: { status: evento.status }, dadosDepois: { status: "INDEFERIDO", motivo: m.texto } });
  return { sucesso: true, mensagem: "Evento indeferido. O proponente foi avisado." };
}

async function cancelarEvento(pool, { evento, motivo, membroId }) {
  if (["CANCELADO", "INDEFERIDO", "ABSORVIDO"].includes(evento.status)) return { sucesso: false, mensagem: `Este evento já está ${rotuloStatus(evento.status)}.` };
  const m = validarMotivo(motivo, "o motivo do cancelamento");
  if (!m.valido) return { sucesso: false, mensagem: m.mensagem };
  const r = await pool.request().input("id", sql.Int, evento.id).input("por", sql.Int, membroId || null).input("motivo", sql.NVarChar(500), m.texto).input("de", sql.NVarChar(12), evento.status).query(`
    UPDATE CalendarioEventos SET Status = 'CANCELADO', CanceladoPorMembroId = @por, CanceladoEm = SYSUTCDATETIME(), MotivoCancelamento = @motivo, AtualizadoEm = SYSUTCDATETIME()
    WHERE EventoId = @id AND Status = @de
  `);
  if (r.rowsAffected[0] !== 1) return { sucesso: false, mensagem: "O evento mudou de estado enquanto você cancelava — recarregue a tela." };
  await registrarAuditoria({ tabela: "CalendarioEventos", registroId: evento.id, acao: "EVENTO_CANCELADO", usuarioId: membroId, dadosAntes: { status: evento.status }, dadosDepois: { status: "CANCELADO", motivo: m.texto } });
  return { sucesso: true, mensagem: "Evento cancelado. A data volta a ficar livre." };
}

// CLI: decisão excepcional (calamidade pública ou convocação de Nível 1 fora do fluxo) — tira um evento
// homologado/deferido da pauta, com resolução registrada. O proponente remarca herdando o carimbo.
async function absorverPorDecisaoDaCli(pool, { evento, motivo, resolucao, membroId }) {
  if (!["DEFERIDO", "HOMOLOGADO"].includes(evento.status)) return { sucesso: false, mensagem: `Este evento está ${rotuloStatus(evento.status)} — só se absorve o que está na pauta.` };
  const m = validarMotivo(motivo, "o motivo (calamidade pública, convocação de Nível 1...)");
  if (!m.valido) return { sucesso: false, mensagem: m.mensagem };
  const res = limpar(resolucao);
  if (res.length < 3 || res.length > 150) return { sucesso: false, mensagem: "Informe a resolução da CLI (de 3 a 150 caracteres)." };
  await atualizarDecisao(pool, evento.id, { status: "ABSORVIDO", motivo: "DECISAO_CLI", detalhe: `${m.texto} (${res})`, decididoPor: membroId });
  await registrarAuditoria({ tabela: "CalendarioEventos", registroId: evento.id, acao: "EVENTO_ABSORVIDO_CLI", usuarioId: membroId, dadosAntes: { status: evento.status }, dadosDepois: { status: "ABSORVIDO", motivo: m.texto, resolucao: res } });
  return { sucesso: true, mensagem: "Evento absorvido por decisão da CLI. O proponente foi avisado e pode remarcar, mantendo o carimbo original." };
}

// Campos que podem mudar sem mexer na data: o Direito Adquirido Temporal gruda no pedido de DATA.
async function atualizarDescritivo(pool, { evento, titulo, descricao, local, slugSite, publicoNoSite, membroId }) {
  if (["CANCELADO", "INDEFERIDO", "ABSORVIDO"].includes(evento.status)) return { sucesso: false, mensagem: `Este evento está ${rotuloStatus(evento.status)} e não se edita.` };
  const novoTitulo = titulo == null ? evento.titulo : limpar(titulo);
  if (novoTitulo.length < 3 || novoTitulo.length > 200) return { sucesso: false, mensagem: "O título deve ter de 3 a 200 caracteres." };
  const novaDescricao = descricao === undefined ? evento.descricao : (limpar(descricao) || null);
  if (novaDescricao && novaDescricao.length > 1000) return { sucesso: false, mensagem: "A descrição passa de 1000 caracteres." };
  const novoLocal = local === undefined ? evento.local : (limpar(local) || null);
  if (novoLocal && novoLocal.length > 200) return { sucesso: false, mensagem: "O local passa de 200 caracteres." };
  let novoSlug = evento.slugSite;
  if (slugSite !== undefined) {
    novoSlug = slugSite === null || limpar(slugSite) === "" ? null : limpar(slugSite).toLowerCase();
    if (novoSlug && !/^[a-z0-9][a-z0-9-]{0,148}$/.test(novoSlug)) return { sucesso: false, mensagem: "O identificador no site deve ter só letras minúsculas, números e hífen." };
  }
  const novoPublico = publicoNoSite === undefined ? evento.publicoNoSite : !!publicoNoSite;
  await pool.request().input("id", sql.Int, evento.id).input("t", sql.NVarChar(200), novoTitulo).input("d", sql.NVarChar(1000), novaDescricao)
    .input("l", sql.NVarChar(200), novoLocal).input("s", sql.NVarChar(150), novoSlug).input("p", sql.Bit, novoPublico)
    .query(`UPDATE CalendarioEventos SET Titulo = @t, Descricao = @d, Local = @l, SlugSite = @s, PublicoNoSite = @p, AtualizadoEm = SYSUTCDATETIME() WHERE EventoId = @id`);
  await registrarAuditoria({
    tabela: "CalendarioEventos", registroId: evento.id, acao: "EVENTO_ATUALIZADO", usuarioId: membroId,
    dadosAntes: { titulo: evento.titulo, local: evento.local, slugSite: evento.slugSite, publicoNoSite: evento.publicoNoSite },
    dadosDepois: { titulo: novoTitulo, local: novoLocal, slugSite: novoSlug, publicoNoSite: novoPublico }
  });
  return { sucesso: true, mensagem: "Evento atualizado. Data e horário não mudam: para mudar, cancele e proponha de novo." };
}

// ---------------------------------------------------------------
// Presença do dirigente na Ceia Geral (Art. 81 §1º, III, "b")
// ---------------------------------------------------------------

async function listarPresencasDirigente(pool, evento, ctx) {
  const registros = (await pool.request().input("e", sql.Int, evento.id).query(`
    SELECT p.CongregacaoId, p.Situacao, p.Justificativa, CONVERT(varchar(23), p.RegistradoEm, 126) AS RegistradoEm, m.Nome AS RegistradoPorNome
    FROM CalendarioPresencasDirigente p LEFT JOIN MembroReferencia m ON m.MembroId = p.RegistradoPorMembroId WHERE p.EventoId = @e
  `)).recordset;
  const porCong = new Map(registros.map(r => [r.CongregacaoId, r]));
  const linhas = [...ctx.congregacoes.values()].filter(c => c.ativa && c.slug !== "sede").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map(c => {
      const r = porCong.get(c.id);
      return {
        congregacaoId: c.id, congregacaoNome: c.nomePublico, situacao: r ? r.Situacao : "NAO_REGISTRADO",
        justificativa: r ? r.Justificativa : null, registradoEm: r ? `${r.RegistradoEm}Z` : null, registradoPorNome: r ? r.RegistradoPorNome : null
      };
    });
  const conta = (s) => linhas.filter(l => l.situacao === s).length;
  return {
    eventoId: evento.id, titulo: evento.titulo, data: evento.dataInicio, congregacoes: linhas,
    resumo: { presentes: conta("PRESENTE"), ausentesJustificadas: conta("AUSENTE_JUSTIFICADA"), ausentesInjustificadas: conta("AUSENTE_INJUSTIFICADA"), naoRegistradas: conta("NAO_REGISTRADO") }
  };
}

async function registrarPresencaDirigente(pool, { evento, congregacaoId, situacao, justificativa, membroId, ctx, hoje = hojeBrasilia() }) {
  if (!evento.tipo.registraPresencaDirigente) return { sucesso: false, mensagem: "Este tipo de evento não registra presença de dirigente." };
  if (!["HOMOLOGADO", "DEFERIDO"].includes(evento.status)) return { sucesso: false, mensagem: "Só se registra presença em evento que está na pauta." };
  if (evento.dataInicio > hoje) return { sucesso: false, mensagem: "O evento ainda não aconteceu." };
  const cong = ctx.congregacoes.get(Number(congregacaoId));
  if (!cong || !cong.ativa) return { sucesso: false, mensagem: "Congregação não encontrada." };
  if (!["PRESENTE", "AUSENTE_JUSTIFICADA", "AUSENTE_INJUSTIFICADA"].includes(situacao)) return { sucesso: false, mensagem: "Situação inválida." };
  const j = limpar(justificativa);
  if (situacao === "AUSENTE_JUSTIFICADA" && j.length < 10) return { sucesso: false, mensagem: "Ausência justificada exige a justificativa (médica ou de trabalho comprovada, mínimo 10 caracteres)." };
  if (j.length > 500) return { sucesso: false, mensagem: "A justificativa passa de 500 caracteres." };
  await pool.request().input("e", sql.Int, evento.id).input("c", sql.Int, cong.id).input("s", sql.NVarChar(24), situacao)
    .input("j", sql.NVarChar(500), j || null).input("por", sql.Int, membroId || null).query(`
      MERGE CalendarioPresencasDirigente AS alvo USING (SELECT @e AS EventoId, @c AS CongregacaoId) AS fonte
        ON alvo.EventoId = fonte.EventoId AND alvo.CongregacaoId = fonte.CongregacaoId
      WHEN MATCHED THEN UPDATE SET Situacao = @s, Justificativa = @j, RegistradoPorMembroId = @por, RegistradoEm = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (EventoId, CongregacaoId, Situacao, Justificativa, RegistradoPorMembroId) VALUES (@e, @c, @s, @j, @por);
    `);
  await registrarAuditoria({ tabela: "CalendarioEventos", registroId: evento.id, acao: "PRESENCA_DIRIGENTE_REGISTRADA", usuarioId: membroId, dadosAntes: null, dadosDepois: { congregacaoId: cong.id, situacao } });
  return {
    sucesso: true,
    mensagem: situacao === "AUSENTE_INJUSTIFICADA"
      ? "Ausência injustificada registrada. É fato passível de apuração disciplinar ética (Art. 81 §1º, III, \"b\") — a apuração segue o rito da FASE 3."
      : "Presença do dirigente registrada."
  };
}

// ---------------------------------------------------------------
// Agenda litúrgica (regras)
// ---------------------------------------------------------------

function mapearRegra(r) {
  return {
    id: r.RegraId, regraId: r.RegraId, dia: r.Dia, rotuloDia: cal.ROTULO_DIA[r.Dia], escopo: r.Escopo, ocorrencia: r.Ocorrencia,
    titulo: r.Titulo, horaInicio: r.HoraInicio, tipo: r.Tipo, departamentoSigla: r.DepartamentoSigla, artigoRef: r.ArtigoRef,
    resolucaoReferencia: r.ResolucaoReferencia, ordem: r.Ordem, ativo: !!r.Ativo
  };
}

async function listarRegrasLiturgicas(pool, { incluirInativas = false } = {}) {
  const r = await pool.request().query(`
    SELECT RegraId, Dia, Escopo, Ocorrencia, Titulo, HoraInicio, Tipo, DepartamentoSigla, ArtigoRef, ResolucaoReferencia, Ordem, Ativo
    FROM AgendaLiturgicaRegras ${incluirInativas ? "" : "WHERE Ativo = 1"} ORDER BY Ordem, RegraId
  `);
  return r.recordset.map(mapearRegra);
}

function validarResolucao(resolucao) {
  const t = limpar(resolucao);
  if (t.length < 3 || t.length > 150) return { valido: false, mensagem: "Informe a autorização da CLI para alterar a agenda litúrgica (Art. 79, parágrafo único) — de 3 a 150 caracteres." };
  return { valido: true, texto: t };
}

async function criarRegraLiturgica(pool, { dados, resolucao, membroId }) {
  const res = validarResolucao(resolucao);
  if (!res.valido) return { sucesso: false, mensagem: res.mensagem };
  const ordem = (await pool.request().query(`SELECT ISNULL(MAX(Ordem), 0) + 1 AS o FROM AgendaLiturgicaRegras`)).recordset[0].o;
  const r = await pool.request()
    .input("dia", sql.NVarChar(20), dados.dia).input("escopo", sql.NVarChar(14), dados.escopo).input("oc", sql.NVarChar(10), dados.ocorrencia)
    .input("titulo", sql.NVarChar(200), dados.titulo).input("hora", sql.NVarChar(5), dados.horaInicio).input("tipo", sql.NVarChar(14), dados.tipo)
    .input("dep", sql.NVarChar(30), dados.departamentoSigla).input("res", sql.NVarChar(150), res.texto).input("ordem", sql.Int, ordem)
    .query(`
      INSERT INTO AgendaLiturgicaRegras (Dia, Escopo, Ocorrencia, Titulo, HoraInicio, Tipo, DepartamentoSigla, ResolucaoReferencia, Ordem)
      OUTPUT INSERTED.RegraId VALUES (@dia, @escopo, @oc, @titulo, @hora, @tipo, @dep, @res, @ordem)
    `);
  const regraId = r.recordset[0].RegraId;
  await registrarAuditoria({ tabela: "AgendaLiturgicaRegras", registroId: regraId, acao: "REGRA_LITURGICA_CRIADA", usuarioId: membroId, dadosAntes: null, dadosDepois: { ...dados, resolucao: res.texto } });
  return { sucesso: true, mensagem: "Regra da agenda litúrgica criada. O site a mostra em alguns minutos.", regraId };
}

async function atualizarRegraLiturgica(pool, { regraId, dados, ativo, resolucao, membroId }) {
  const res = validarResolucao(resolucao);
  if (!res.valido) return { sucesso: false, mensagem: res.mensagem };
  const antes = (await listarRegrasLiturgicas(pool, { incluirInativas: true })).find(r => r.regraId === Number(regraId));
  if (!antes) return { sucesso: false, mensagem: "Regra não encontrada." };
  const d = dados ? { ...dados } : { dia: antes.dia, escopo: antes.escopo, ocorrencia: antes.ocorrencia, titulo: antes.titulo, horaInicio: antes.horaInicio, tipo: antes.tipo, departamentoSigla: antes.departamentoSigla };
  const novoAtivo = ativo == null ? antes.ativo : ativo;
  await pool.request().input("id", sql.Int, antes.regraId)
    .input("dia", sql.NVarChar(20), d.dia).input("escopo", sql.NVarChar(14), d.escopo).input("oc", sql.NVarChar(10), d.ocorrencia)
    .input("titulo", sql.NVarChar(200), d.titulo).input("hora", sql.NVarChar(5), d.horaInicio).input("tipo", sql.NVarChar(14), d.tipo)
    .input("dep", sql.NVarChar(30), d.departamentoSigla).input("res", sql.NVarChar(150), res.texto).input("ativo", sql.Bit, novoAtivo)
    .query(`
      UPDATE AgendaLiturgicaRegras SET Dia = @dia, Escopo = @escopo, Ocorrencia = @oc, Titulo = @titulo, HoraInicio = @hora, Tipo = @tipo,
             DepartamentoSigla = @dep, ResolucaoReferencia = @res, Ativo = @ativo, AtualizadoEm = SYSUTCDATETIME()
      WHERE RegraId = @id
    `);
  await registrarAuditoria({ tabela: "AgendaLiturgicaRegras", registroId: antes.regraId, acao: "REGRA_LITURGICA_ATUALIZADA", usuarioId: membroId, dadosAntes: antes, dadosDepois: { ...d, ativo: novoAtivo, resolucao: res.texto } });
  return { sucesso: true, mensagem: "Regra atualizada. O site a mostra em alguns minutos." };
}

// ---------------------------------------------------------------
// Agenda unificada
// ---------------------------------------------------------------

// Eventos cujo território inclui a congregação.
function eventoAlcancaCongregacao(e, congregacao, ctx) {
  if (e.abrangencia === "CAMPO") return true;
  if (e.abrangencia === "CONGREGACAO") return e.congregacaoId === congregacao.id;
  return congregacao.areaId != null && (e.areaIds || []).includes(congregacao.areaId);
}

async function montarAgenda(pool, { de, ate, congregacaoId, camadas, veTudo, veSessoes, ctx }) {
  if (!cal.dataIsoValida(de) || !cal.dataIsoValida(ate) || ate < de) return { sucesso: false, mensagem: "Intervalo de datas inválido." };
  if (cal.diasEntre(de, ate) + 1 > LIMITE_JANELA_AGENDA_DIAS) return { sucesso: false, mensagem: "Intervalo de no máximo 1 ano." };
  const quer = (c) => !camadas || camadas.includes(c);
  const congregacao = congregacaoId ? ctx.congregacoes.get(Number(congregacaoId)) : null;
  if (congregacaoId && !congregacao) return { sucesso: false, mensagem: "Congregação não encontrada." };

  const itens = [];
  const statusVisiveis = veTudo ? ["PROPOSTO", "DEFERIDO", "HOMOLOGADO", "INDEFERIDO", "ABSORVIDO"] : ["HOMOLOGADO"];
  let eventos = await carregarEventos(pool, { de, ate, status: statusVisiveis }, ctx);
  if (congregacao) eventos = eventos.filter(e => eventoAlcancaCongregacao(e, congregacao, ctx));

  if (quer("OFICIAL")) {
    for (const e of eventos) {
      itens.push({
        camada: "OFICIAL", eventoId: e.id, data: e.dataInicio, dataFim: e.dataFim, hora: e.horaInicio, horaFim: e.horaFim,
        titulo: e.titulo, descricao: e.descricao, nivel: e.nivel, rotuloNivel: e.rotuloNivel, tipo: e.tipo.codigo, tipoNome: e.tipo.nome,
        status: e.status, abrangencia: e.abrangencia, congregacaoId: e.congregacaoId, congregacaoNome: e.congregacaoNome, areaNomes: e.areaNomes,
        local: e.local, origem: e.origem, publicoNoSite: e.publicoNoSite, rotuloMotivo: e.rotuloMotivo
      });
    }
  }

  if (quer("LITURGIA")) {
    const regras = await listarRegrasLiturgicas(pool);
    const oficiais = eventos.filter(e => e.status === "HOMOLOGADO");
    const dias = cal.diasEntre(de, ate);
    // Sem congregação escolhida, mostra as duas grades (Sede e congregações).
    const locais = congregacao ? [congregacao.slug === "sede" ? "SEDE" : "CONGREGACAO"] : ["SEDE", "CONGREGACAO"];
    for (let i = 0; i <= dias; i++) {
      const data = cal.somarDias(de, i);
      const doDia = oficiais.filter(e => e.dataInicio <= data && e.dataFim >= data);
      for (const local of locais) {
        const grade = cal.absorverLiturgia(cal.agendaLiturgicaDoDia(regras, data, local), doDia, local);
        for (const g of grade) {
          itens.push({
            camada: "LITURGIA", data, dataFim: data, hora: g.horaInicio, titulo: g.titulo, tipo: g.tipo, dia: g.dia, rotuloDia: g.rotuloDia,
            escopo: g.escopo, local: local === "SEDE" ? "Sede" : "Congregações", departamentoSigla: g.departamentoSigla,
            absorvido: g.absorvido, absorvidoPor: g.absorvidoPor || null, fechada: !!g.fechada, cobertoPor: g.cobertoPor || null
          });
        }
      }
    }
    // O que for "TODAS" aparece uma vez só quando as duas grades são mostradas.
    if (!congregacao) {
      const vistos = new Set();
      for (let i = itens.length - 1; i >= 0; i--) {
        const it = itens[i];
        if (it.camada !== "LITURGIA" || it.escopo !== "TODAS") continue;
        const chave = `${it.data}|${it.dia}|${it.titulo}|${it.absorvido}|${it.fechada}`;
        if (vistos.has(chave)) itens.splice(i, 1); else { vistos.add(chave); it.local = "Sede e congregações"; }
      }
    }
  }

  if (quer("SESSAO") && veSessoes) {
    const sessoes = (await pool.request().input("de", sql.Date, de).input("ate", sql.Date, ate).query(`
      SELECT s.SessaoId, COALESCE(s.Descricao, o.Nome, ol.Nome) AS Titulo, COALESCE(o.Nome, ol.Nome) AS OrgaoNome, s.TipoSessao, s.Status,
             CONVERT(varchar(10), COALESCE(s.DataPrevista, s.DataSessao), 23) AS Data
      FROM Sessoes s LEFT JOIN Orgaos o ON o.OrgaoId = s.OrgaoId LEFT JOIN OrgaosLocais ol ON ol.OrgaoLocalId = s.OrgaoLocalId
      WHERE COALESCE(s.DataPrevista, s.DataSessao) BETWEEN @de AND @ate
    `)).recordset;
    for (const s of sessoes) {
      itens.push({ camada: "SESSAO", sessaoId: s.SessaoId, data: s.Data, dataFim: s.Data, hora: null, titulo: s.Titulo, orgaoNome: s.OrgaoNome, tipoSessao: s.TipoSessao, status: s.Status });
    }
  }

  const ordemCamada = { OFICIAL: 0, SESSAO: 1, LITURGIA: 2 };
  itens.sort((a, b) => a.data.localeCompare(b.data) || String(a.hora || "99:99").localeCompare(String(b.hora || "99:99")) || ordemCamada[a.camada] - ordemCamada[b.camada]);
  return { sucesso: true, de, ate, congregacaoId: congregacao ? congregacao.id : null, itens };
}

// ---------------------------------------------------------------
// API pública (site)
// ---------------------------------------------------------------

async function eventosPublicos(pool, ctx, { hoje = hojeBrasilia() } = {}) {
  const anoInicial = Number(hoje.slice(0, 4)) - 1;
  const eventos = await carregarEventos(pool, { de: `${anoInicial}-01-01`, status: ["HOMOLOGADO"] }, ctx);
  return eventos.filter(e => e.publicoNoSite).map(e => ({
    id: e.id, titulo: e.titulo, descricao: e.descricao || "",
    dataInicio: e.dataInicio, dataFim: e.dataFim === e.dataInicio ? null : e.dataFim,
    horaInicio: e.horaInicio, horaFim: e.horaFim, hora: cal.horaParaSite(e.horaInicio),
    nivel: e.nivel, tipo: e.tipo.codigo, tipoNome: e.tipo.nome, abrangencia: e.abrangencia,
    congregacaoId: e.congregacaoId, congregacaoNome: e.congregacaoNome, areas: e.areaNomes, local: e.local,
    slugSite: e.slugSite, origem: e.origem
  })).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio) || a.id - b.id);
}

async function liturgiaPublica(pool) {
  return cal.liturgiaParaSite(await listarRegrasLiturgicas(pool));
}

// A "versão" muda quando muda qualquer coisa que o site mostra. O sincronizador do
// GitHub compara esta com a que o site publicou e, se diferem, manda reconstruir.
// `canais` (v7.3) entra no hash só quando informado: sem ele o valor é o mesmo de antes da v7.3.
function calcularVersao(eventos, liturgia, canais) {
  return crypto.createHash("sha256").update(JSON.stringify({ eventos, liturgia, canais })).digest("hex").slice(0, 16);
}

async function pacotePublico(pool, ctx, opcoes) {
  const [eventos, liturgia] = await Promise.all([eventosPublicos(pool, ctx, opcoes), liturgiaPublica(pool)]);
  return { versao: calcularVersao(eventos, liturgia), eventos, liturgia };
}

// Tudo o que o site mostra: eventos oficiais, grade litúrgica e (v7.3) os canais oficiais públicos.
// A versão cobre os três — é a que o sincronizador compara com a que o site publicou.
async function pacotePublicoCompleto(pool, ctx, opcoes) {
  const base = await pacotePublico(pool, ctx, opcoes);
  let canais = [];
  try {
    const canaisDb = require("./canaisDb");
    canais = await canaisDb.canaisPublicos(pool, await canaisDb.carregarContexto(pool));
  } catch (e) {
    console.error("[AgendaPublica] canais indisponíveis:", e.message);
  }
  return { versao: calcularVersao(base.eventos, base.liturgia, canais), eventos: base.eventos, liturgia: base.liturgia, canais };
}

// Situação da sincronização com o site: a versão daqui contra a que o site publicou.
async function statusSincronizacaoSite(pool, ctx, { fetchImpl = globalThis.fetch, siteUrl = process.env.SITE_URL || "https://www.ieadespa.org.br" } = {}) {
  const { versao } = await pacotePublicoCompleto(pool, ctx);
  let versaoNoSite = null;
  let erro = null;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 8000);
  try {
    const resp = await fetchImpl(`${siteUrl}/agenda-versao.json?x=${Date.now()}`, { signal: controle.signal, headers: { "Cache-Control": "no-cache" } });
    if (resp.ok) versaoNoSite = (await resp.json()).versao || null;
    else erro = `O site respondeu ${resp.status}.`;
  } catch (e) {
    erro = "Não foi possível consultar o site agora.";
  } finally {
    clearTimeout(timer);
  }
  return { versaoSistema: versao, versaoSite: versaoNoSite, sincronizado: !!versaoNoSite && versaoNoSite === versao, erro, siteUrl };
}

// ---------------------------------------------------------------
// Fatos para o motor de notificações (vB.2)
// ---------------------------------------------------------------

// Quem tem a permissão de proposta e ainda não propôs nada no ano: aviso de 30 e de 7 dias do prazo.
async function detectarPrazoPropostas(pool, { janelaDias, hoje = hojeBrasilia() }) {
  const ano = Number(hoje.slice(0, 4));
  const fatos = [];
  for (const anoAlvo of [ano, ano + 1]) {
    const prazo = cal.prazoPropostasDoAno(anoAlvo);
    const faltam = cal.diasEntre(hoje, prazo);
    if (faltam < 0 || faltam > janelaDias) continue;
    const anoRow = await lerAno(pool, anoAlvo);
    if (anoRow && anoRow.status === "HOMOLOGADO") continue;
    const portadores = (await pool.request().input("perm", sql.NVarChar(60), "%,calendario_proposta,%").query(`
      SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, m.Email AS email
      FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN MembroReferencia m ON m.MembroId = l.MembroId
      WHERE (',' + p.Permissoes + ',') LIKE @perm AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
    `)).recordset;
    const jaPropuseram = new Set((await pool.request().input("ano", sql.SmallInt, anoAlvo).query(`
      SELECT DISTINCT PropostoPorMembroId AS id FROM CalendarioEventos WHERE Ano = @ano AND Origem = 'PROPOSTA' AND PropostoPorMembroId IS NOT NULL
    `)).recordset.map(r => r.id));
    for (const p of portadores) {
      if (jaPropuseram.has(p.membroId)) continue;
      fatos.push({
        referenciaId: anoAlvo * 100000 + p.membroId, destinatarios: [p],
        fatoGerador: `Faltam ${faltam} dia(s) para o prazo das propostas do calendário ${anoAlvo} (${cal.formatarDataBr(prazo)}). Quem não envia sua proposta até lá corre o risco de ficar sem a data no ano (Art. 154 §4º, III).`
      });
    }
  }
  return fatos;
}

async function detectarPropostasRecusadas(pool) {
  const r = await pool.request().query(`
    SELECT e.EventoId, e.Titulo, e.Status, CONVERT(varchar(10), e.DataInicio, 23) AS DataInicio, e.MotivoIndeferimento, e.DetalheDecisao,
           m.MembroId, m.Nome, m.Email
    FROM CalendarioEventos e JOIN MembroReferencia m ON m.MembroId = e.PropostoPorMembroId
    WHERE e.Status IN ('INDEFERIDO', 'ABSORVIDO') AND e.Origem = 'PROPOSTA' AND e.DecididoEm >= DATEADD(DAY, -30, SYSUTCDATETIME())
  `);
  return r.recordset.map(x => ({
    referenciaId: x.EventoId * 2 + (x.Status === "ABSORVIDO" ? 1 : 0),
    destinatarios: [{ membroId: x.MembroId, nome: x.Nome, email: x.Email }],
    fatoGerador: `${x.Status === "ABSORVIDO" ? "Seu evento foi absorvido" : "Sua proposta não foi aceita"}: "${x.Titulo}" (${cal.formatarDataBr(x.DataInicio)}). ${x.DetalheDecisao || (x.MotivoIndeferimento ? cal.ROTULO_MOTIVO[x.MotivoIndeferimento] : "")} Proponha outra data — a remarcação mantém o carimbo da proposta original.`
  }));
}

async function detectarParaConsolidar(pool, { hoje = hojeBrasilia() } = {}) {
  const r = await pool.request().query(`
    SELECT a.Ano, CONVERT(varchar(10), a.PrazoPropostas, 23) AS Prazo, COUNT(e.EventoId) AS Pendentes
    FROM CalendarioAnos a JOIN CalendarioEventos e ON e.Ano = a.Ano AND e.Status = 'PROPOSTO'
    WHERE a.Status <> 'HOMOLOGADO' GROUP BY a.Ano, a.PrazoPropostas
  `);
  return r.recordset.filter(x => hoje > x.Prazo).map(x => ({
    referenciaId: x.Ano,
    fatoGerador: `O prazo das propostas do calendário ${x.Ano} (${cal.formatarDataBr(x.Prazo)}) venceu e há ${x.Pendentes} proposta(s) aguardando a consolidação da Secretaria.`
  }));
}

async function detectarParaHomologar(pool) {
  const r = await pool.request().query(`SELECT Ano FROM CalendarioAnos WHERE Status = 'CONSOLIDADO'`);
  return r.recordset.map(x => ({
    referenciaId: x.Ano,
    fatoGerador: `O calendário ${x.Ano} foi consolidado pela Secretaria e aguarda a leitura e a aprovação da CLI em ata (Art. 154 §2º, III).`
  }));
}

module.exports = {
  LIMITE_LISTA, removerPrefixoNumerico,
  listarTipos, buscarTipo, buscarTipoPorCodigo, criarTipo, atualizarTipo, carregarContextoTerritorial,
  carregarEventos, buscarEvento, carregarPautaAtiva, mapearEvento,
  lerAno, garantirAno, listarAnos, validarAnoCalendario,
  verificarProposta, propor, consolidarAno, homologarAno, gerarCicloDoAno,
  deferirEvento, indeferirEvento, cancelarEvento, absorverPorDecisaoDaCli, atualizarDescritivo, validarMotivo,
  listarPresencasDirigente, registrarPresencaDirigente,
  listarRegrasLiturgicas, criarRegraLiturgica, atualizarRegraLiturgica,
  eventoAlcancaCongregacao, montarAgenda,
  eventosPublicos, liturgiaPublica, calcularVersao, pacotePublico, pacotePublicoCompleto, statusSincronizacaoSite,
  detectarPrazoPropostas, detectarPropostasRecusadas, detectarParaConsolidar, detectarParaHomologar
};
