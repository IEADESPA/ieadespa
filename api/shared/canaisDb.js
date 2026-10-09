// shared/canaisDb.js (v7.3 — Canais Oficiais e Comunicação)
//
// A parte com banco. Toda decisão de regra (o que é canal oficial, o relógio das 24 horas, a
// conformidade, a sucessão) está em shared/canais.js, pura e testada; aqui só se carrega, se chama
// o motor e se grava, com auditoria. Funções devolvem { sucesso, mensagem, ... }; recusa de regra
// é sucesso:false (o handler a mostra como 422).
//
// O sistema não tira nada de dentro do WhatsApp ou do Instagram: registra o aviso, corre o
// relógio, avisa quem administra e guarda a prova da remoção.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const canais = require("./canais");
// v7.7 — a regra pura do ministério com menores (rótulos, máscara das pendências e texto do aviso). O banco dele (ministerioMenoresDb.js) importa ESTE arquivo no
// topo: por isso ele só é carregado sob demanda, dentro das funções (aptidaoMenoresDb), nunca aqui em cima — senão há ciclo.
const mm = require("./ministerioMenores");

const LIMITE_LISTA = 500;
const CONFERENCIA_DIAS_PADRAO = 180;
const TROCA_DIAS_PADRAO = 2;
const DIAS_SEM_ADMINISTRADOR_TOLERADOS = 3;

const limpar = (v) => String(v == null ? "" : v).trim();
const removerPrefixoNumerico = (nome) => String(nome || "").replace(/^\d+\s*-\s*/, "");

// DATETIME2 chega como Date (driver) ou texto sem fuso (ponte de teste): sempre UTC.
function emMs(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  const t = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : s.replace(" ", "T") + "Z");
  return Number.isNaN(t) ? null : t;
}
const isoInstante = (v) => { const ms = emMs(v); return ms == null ? null : new Date(ms).toISOString(); };
const isoData = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const arred1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------
// Contexto territorial e prazos
// ---------------------------------------------------------------

async function carregarContexto(pool) {
  const [cg, ar, dp] = await Promise.all([
    pool.request().query(`SELECT CongregacaoId, Nome, AreaId, Ativa FROM Congregacoes`),
    pool.request().query(`SELECT AreaId, Nome FROM Areas`),
    pool.request().query(`SELECT DepartamentoId, Sigla, Nome FROM Departamentos`)
  ]);
  const congregacoes = new Map(cg.recordset.map(c => [c.CongregacaoId, { id: c.CongregacaoId, nome: c.Nome, nomeExibicao: removerPrefixoNumerico(c.Nome), areaId: c.AreaId, ativa: !!c.Ativa }]));
  const areas = new Map(ar.recordset.map(a => [a.AreaId, { id: a.AreaId, nome: a.Nome }]));
  const departamentos = new Map(dp.recordset.map(d => [d.DepartamentoId, { id: d.DepartamentoId, sigla: d.Sigla, nome: d.Nome }]));
  const congregacoesDaArea = (areaId) => [...congregacoes.values()].filter(c => c.areaId === areaId).map(c => c.id);
  return { congregacoes, areas, departamentos, congregacoesDaArea };
}

async function lerPrazoDias(pool, sigla, padrao) {
  const r = await pool.request().input("sigla", sql.NVarChar(40), sigla).query(`SELECT TOP 1 Dias FROM Prazos WHERE Sigla = @sigla AND Ativo = 1`);
  const n = r.recordset[0] ? Number(r.recordset[0].Dias) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : padrao;
}

// ---------------------------------------------------------------
// Canais — leitura
// ---------------------------------------------------------------

function textoDoEscopo(r, ctx) {
  if (r.Escopo === "CONGREGACAO") { const c = ctx.congregacoes.get(r.CongregacaoId); return c ? `Congregação ${c.nomeExibicao}` : "Congregação"; }
  if (r.Escopo === "AREA") { const a = ctx.areas.get(r.AreaId); return a ? `Área ${a.nome}` : "Área"; }
  if (r.Escopo === "DEPARTAMENTO") { const d = ctx.departamentos.get(r.DepartamentoId); return d ? `Departamento ${d.sigla}` : "Departamento"; }
  return canais.ESCOPOS.CAMPO;
}

function mapearCanal(r, ctx) {
  const plat = canais.PLATAFORMAS[r.Plataforma];
  const cong = r.CongregacaoId ? ctx.congregacoes.get(r.CongregacaoId) : null;
  const area = r.AreaId ? ctx.areas.get(r.AreaId) : null;
  const dep = r.DepartamentoId ? ctx.departamentos.get(r.DepartamentoId) : null;
  const canal = {
    canalId: r.CanalId, sigla: r.Sigla, nome: r.Nome,
    plataforma: r.Plataforma || null, rotuloPlataforma: plat ? plat.rotulo : "Plataforma não informada",
    categoria: r.Categoria, rotuloCategoria: (canais.CATEGORIAS_CANAL[r.Categoria] || {}).rotulo || r.Categoria,
    temaFocado: r.TemaFocado || null, rotuloTema: r.TemaFocado ? (canais.TEMAS_FOCADOS[r.TemaFocado] || {}).rotulo : null,
    identificador: r.Identificador || null,
    vinculoInstitucional: r.VinculoInstitucional || null, rotuloVinculo: r.VinculoInstitucional ? canais.VINCULOS[r.VinculoInstitucional] : null,
    declaradoInstitucionalEm: isoInstante(r.DeclaracaoInstitucionalEm),
    escopo: r.Escopo, rotuloEscopo: textoDoEscopo(r, ctx),
    congregacaoId: r.CongregacaoId || null, congregacaoNome: cong ? cong.nomeExibicao : null,
    areaId: r.AreaId || null, areaNome: area ? area.nome : null,
    departamentoId: r.DepartamentoId || null, departamentoNome: dep ? dep.nome : null,
    incluiMenores: !!r.IncluiMenores, responsavelAcessoMembroId: r.ResponsavelAcessoMembroId || null, publicoNoSite: !!r.PublicoNoSite, descricao: r.Descricao || null,
    custodiaSecretaria: !!r.CustodiaSecretaria, ultimaTrocaCredencialEm: isoData(r.UltimaTrocaCredencialEm),
    ativo: !!r.Ativo, vigenteDesde: isoData(r.VigenteDesde), vigenteAte: isoData(r.VigenteAte), desativadoMotivo: r.DesativadoMotivo || null,
    registradoEm: isoInstante(r.RegistradoEm)
  };
  canal.link = canais.linkDoCanal(canal.plataforma, r.IdentificadorNormalizado);
  canal.contaParaAbandono = canais.contaParaAbandono(canal);
  canal.exigeCustodia = canal.plataforma ? canais.exigeCustodia(canal) : false;
  canal.cadastroIncompleto = !canal.plataforma || !canal.identificador || !canal.vinculoInstitucional || !canal.declaradoInstitucionalEm;
  return canal;
}

async function carregarCanais(pool, ctx, { incluirInativos = false, canalId = null } = {}) {
  const req = pool.request();
  const cond = [];
  if (!incluirInativos) cond.push("Ativo = 1");
  if (canalId) { req.input("canalId", sql.Int, canalId); cond.push("CanalId = @canalId"); }
  const r = await req.query(`SELECT TOP ${LIMITE_LISTA} * FROM CanaisOficiaisComunicacao ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY Ativo DESC, Nome`);
  return r.recordset.map(x => mapearCanal(x, ctx));
}

async function buscarCanal(pool, canalId, ctx) {
  if (!Number.isInteger(Number(canalId)) || Number(canalId) <= 0) return null;
  return (await carregarCanais(pool, ctx, { incluirInativos: true, canalId: Number(canalId) }))[0] || null;
}

// ---------------------------------------------------------------
// Estado de cada canal (administradores, conferência, trocas, ocorrências vencidas)
// ---------------------------------------------------------------

// v7.7 — canal que inclui menores: o estado ganha, em cada administrador, `aptoMenores` (habilitado para servir com menores) e `adulto` (idade conhecida, 18 anos ou
// mais), e, no canal, `responsavelAcesso` ({ membroId, nome, ativo, adulto } | null). Só os canais ATIVOS que incluem menores pagam esse custo: a habilitação de cada
// administrador é calculada na leitura (várias consultas), então nunca se calcula para quem não precisa. `comoMenores` ({ responsavelAcessoMembroId }, só junto de
// `canalId`) trata o canal como se já incluísse menores — é como se confere, ANTES de gravar, se ligar a marca deixaria o grupo irregular. O nome do responsável é só para a gestão.
async function carregarEstadoDosCanais(pool, { canalId = null, hoje = hojeBrasilia(), comoMenores = null } = {}) {
  const filtro = (col) => canalId ? `AND ${col} = @canalId` : "";
  const q = (texto) => { const req = pool.request(); if (canalId) req.input("canalId", sql.Int, canalId); return req.query(texto); };
  const [adm, conf, trocas, venc, menores] = await Promise.all([
    q(`SELECT a.AdminId, a.CanalId, a.MembroId, m.Nome AS MembroNome, a.Papel, a.TermoVersaoAceita, a.TermoAceitoEm, a.DesignadoEm
       FROM CanalAdministradores a JOIN MembroReferencia m ON m.MembroId = a.MembroId WHERE a.EncerradoEm IS NULL ${filtro("a.CanalId")}`),
    q(`SELECT CanalId, ConferenciaId, ConferidoEm, Resultado, ItensJson, Observacao FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY CanalId ORDER BY ConferidoEm DESC, ConferenciaId DESC) AS rn FROM CanalConferencias WHERE 1 = 1 ${filtro("CanalId")}
       ) x WHERE rn = 1`),
    q(`SELECT TrocaId, CanalId, Motivo, MembroReferenciaId, PrazoEm FROM CanalTrocasCredencial WHERE ResolvidaEm IS NULL ${filtro("CanalId")}`),
    q(`SELECT CanalId, COUNT(*) AS n FROM CanalOcorrencias WHERE Status = 'ABERTA' AND PrazoRemocaoEm < SYSUTCDATETIME() ${filtro("CanalId")} GROUP BY CanalId`),
    q(`SELECT CanalId, ResponsavelAcessoMembroId FROM CanaisOficiaisComunicacao WHERE Ativo = 1 AND IncluiMenores = 1 ${filtro("CanalId")}`)
  ]);
  const estado = new Map();
  const obter = (id) => { if (!estado.has(id)) estado.set(id, { administradores: [], ultimaConferencia: null, trocasAbertas: [], ocorrenciasVencidas: 0, termoVersao: canais.TERMO_VERSAO }); return estado.get(id); };
  for (const a of adm.recordset) obter(a.CanalId).administradores.push({ adminId: a.AdminId, membroId: a.MembroId, nome: a.MembroNome, papel: a.Papel, termoVersaoAceita: a.TermoVersaoAceita, termoAceitoEm: isoInstante(a.TermoAceitoEm), designadoEm: isoInstante(a.DesignadoEm) });
  for (const c of conf.recordset) obter(c.CanalId).ultimaConferencia = { conferenciaId: c.ConferenciaId, em: isoInstante(c.ConferidoEm), resultado: c.Resultado, itens: c.ItensJson ? JSON.parse(c.ItensJson) : {}, observacao: c.Observacao || null };
  for (const t of trocas.recordset) obter(t.CanalId).trocasAbertas.push({ trocaId: t.TrocaId, motivo: t.Motivo, membroReferenciaId: t.MembroReferenciaId, prazoEm: isoData(t.PrazoEm) });
  for (const o of venc.recordset) obter(o.CanalId).ocorrenciasVencidas = o.n;
  const comMenores = new Map(menores.recordset.map(m => [m.CanalId, m.ResponsavelAcessoMembroId || null]));
  if (canalId && comoMenores) comMenores.set(Number(canalId), comoMenores.responsavelAcessoMembroId || null);
  if (comMenores.size) await completarEstadoMenores(pool, [...comMenores].map(([id, responsavelId]) => ({ estado: obter(id), responsavelId })), { hoje });
  return { estado, obter: (id) => estado.get(id) || { administradores: [], ultimaConferencia: null, trocasAbertas: [], ocorrenciasVencidas: 0, termoVersao: canais.TERMO_VERSAO } };
}

// A habilitação para servir com menores é do ministerioMenoresDb, que importa este arquivo no topo: carregado aqui sob demanda (sem ciclo).
function aptidaoMenoresDb() { return require("./ministerioMenoresDb"); }

// `linhas`: [{ estado (o objeto de estado do canal, já com os administradores), responsavelId | null }]. Uma leitura de habilitação para TODOS os administradores
// de todos esses canais e uma leitura dos responsáveis: o custo não cresce com o número de canais.
async function completarEstadoMenores(pool, linhas, { hoje }) {
  const adminIds = [...new Set(linhas.flatMap(l => l.estado.administradores.map(a => a.membroId)))];
  const aptidoes = adminIds.length ? await aptidaoMenoresDb().aptidaoEmLote(pool, adminIds, { hoje }) : new Map();
  const responsavelIds = [...new Set(linhas.map(l => l.responsavelId).filter(Boolean))];
  const responsaveis = new Map();
  if (responsavelIds.length) {
    const req = pool.request();
    const lista = responsavelIds.map((id, i) => { req.input(`r${i}`, sql.Int, id); return `@r${i}`; }).join(",");
    for (const m of (await req.query(`SELECT MembroId, Nome, Status, DataNascimento FROM MembroReferencia WHERE MembroId IN (${lista})`)).recordset) responsaveis.set(m.MembroId, m);
  }
  for (const l of linhas) {
    for (const a of l.estado.administradores) {
      const ap = aptidoes.get(a.membroId);
      a.aptoMenores = !!(ap && ap.apto);
      a.adulto = !!(ap && ap.contaComoAdulto);
    }
    const m = l.responsavelId ? responsaveis.get(l.responsavelId) : null;
    const idade = m ? idadeEmAnos(m.DataNascimento, hoje) : null;
    l.estado.responsavelAcesso = l.responsavelId ? { membroId: l.responsavelId, nome: m ? m.Nome : null, ativo: !!m && m.Status === "ATIVO", adulto: idade != null && idade >= 18 } : null;
  }
}

function conformidadeDe(canal, estadoCanal, { hoje, conferenciaDias }) {
  return canais.conformidadeDoCanal(
    { plataforma: canal.plataforma, categoria: canal.categoria, identificador: canal.identificador, ativo: canal.ativo, custodiaSecretaria: canal.custodiaSecretaria, incluiMenores: canal.incluiMenores, responsavelAcessoMembroId: canal.responsavelAcessoMembroId },
    estadoCanal, { hoje, conferenciaDias }
  );
}

async function listarCanais(pool, ctx, { incluirInativos = false, hoje = hojeBrasilia() } = {}) {
  const [lista, st, confDias] = await Promise.all([
    carregarCanais(pool, ctx, { incluirInativos }),
    carregarEstadoDosCanais(pool, { hoje }),
    lerPrazoDias(pool, "CANAIS_CONFERENCIA_DIAS", CONFERENCIA_DIAS_PADRAO)
  ]);
  return lista.map(c => {
    const e = st.obter(c.canalId);
    const conf = conformidadeDe(c, e, { hoje, conferenciaDias: confDias });
    return { ...c, situacao: conf.situacao, pendencias: conf.pendencias, administradoresAtivos: e.administradores.length, ultimaConferencia: e.ultimaConferencia ? { em: e.ultimaConferencia.em, resultado: e.ultimaConferencia.resultado } : null };
  });
}

async function detalharCanal(pool, canalId, ctx, { hoje = hojeBrasilia(), agoraMs = Date.now(), verAutor = true } = {}) {
  const canal = await buscarCanal(pool, canalId, ctx);
  if (!canal) return null;
  const [st, confDias, historico, ocorrencias] = await Promise.all([
    carregarEstadoDosCanais(pool, { canalId: canal.canalId, hoje }),
    lerPrazoDias(pool, "CANAIS_CONFERENCIA_DIAS", CONFERENCIA_DIAS_PADRAO),
    pool.request().input("canalId", sql.Int, canal.canalId).query(`
      SELECT TOP 10 c.ConferenciaId, c.ConferidoEm, c.Resultado, c.ItensJson, c.Observacao, m.Nome AS PorNome
      FROM CanalConferencias c JOIN MembroReferencia m ON m.MembroId = c.ConferidoPorMembroId WHERE c.CanalId = @canalId ORDER BY c.ConferidoEm DESC, c.ConferenciaId DESC`),
    carregarOcorrencias(pool, ctx, { canalId: canal.canalId, limite: 10, verAutor, agoraMs })
  ]);
  const e = st.obter(canal.canalId);
  const conf = conformidadeDe(canal, e, { hoje, conferenciaDias: confDias });
  return {
    canal, situacao: conf.situacao, pendencias: conf.pendencias,
    // Em canal com menores, cada administrador traz `aptoMenores` e `adulto` (só os dois sim/não, nunca o motivo) e o canal traz o responsável com acesso (com nome: esta rota é só da gestão).
    administradores: e.administradores, trocasAbertas: e.trocasAbertas,
    responsavelAcesso: canal.incluiMenores ? (e.responsavelAcesso || null) : null,
    conferencias: historico.recordset.map(c => ({ conferenciaId: c.ConferenciaId, em: isoInstante(c.ConferidoEm), resultado: c.Resultado, itens: c.ItensJson ? JSON.parse(c.ItensJson) : {}, observacao: c.Observacao || null, porNome: c.PorNome })),
    itensConferencia: canais.itensDeConferencia(canal),
    ocorrenciasRecentes: ocorrencias,
    orientacoes: {
      modeloTermoDeUso: canal.categoria === "GRUPO_OFICIAL" ? canais.modeloTermoDeUso() : null,
      avisoAtencao: canal.categoria === "GRUPO_FOCADO" ? canais.AVISO_ATENCAO : null
    }
  };
}

// ---------------------------------------------------------------
// Canais — escrita
// ---------------------------------------------------------------

async function buscarContatosPessoais(pool, plataforma, normalizado) {
  const cfg = canais.PLATAFORMAS[plataforma];
  if (!cfg) return [];
  if (cfg.tipoIdent === "telefone") {
    const ult8 = String(normalizado).replace(/\D/g, "").slice(-8);
    const r = await pool.request().input("ult8", sql.NVarChar(8), ult8).query(`
      SELECT MembroId, Telefone FROM MembroReferencia
      WHERE Telefone IS NOT NULL AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Telefone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', ''), 8) = @ult8`);
    return r.recordset.map(m => ({ membroId: m.MembroId, telefone: m.Telefone }));
  }
  if (cfg.tipoIdent === "email") {
    const r = await pool.request().input("email", sql.NVarChar(150), String(normalizado).toLowerCase()).query(`
      SELECT MembroId, Email FROM MembroReferencia WHERE Email IS NOT NULL AND LOWER(LTRIM(RTRIM(Email))) = @email`);
    return r.recordset.map(m => ({ membroId: m.MembroId, email: m.Email }));
  }
  return [];
}

// Valida referências do escopo e as vedações que dependem do banco (Art. 12 e duplicidade).
async function conferirRegrasDoBanco(pool, ctx, dados, { canalId = null } = {}) {
  if (dados.escopo === "CONGREGACAO" && !ctx.congregacoes.has(dados.congregacaoId)) return "Congregação não encontrada.";
  if (dados.escopo === "AREA" && !ctx.areas.has(dados.areaId)) return "Área não encontrada.";
  if (dados.escopo === "DEPARTAMENTO" && !ctx.departamentos.has(dados.departamentoId)) return "Departamento não encontrado.";

  const contatos = await buscarContatosPessoais(pool, dados.plataforma, dados.identificadorNormalizado);
  const pessoal = canais.acharContatoPessoal(dados.plataforma, dados.identificadorNormalizado, contatos);
  if (pessoal) {
    return `Este ${canais.PLATAFORMAS[dados.plataforma].tipoIdent === "email" ? "e-mail" : "número"} está cadastrado como contato pessoal do membro de matrícula ${pessoal.membroId}. Conta, número ou perfil pessoal NÃO pode ser canal oficial (Estatuto Art. 12): use um canal em nome da IEADESPA.`;
  }

  const req = pool.request().input("plataforma", sql.NVarChar(20), dados.plataforma).input("norm", sql.NVarChar(200), dados.identificadorNormalizado);
  if (canalId) req.input("canalId", sql.Int, canalId);
  const dup = await req.query(`SELECT TOP 1 CanalId, Nome FROM CanaisOficiaisComunicacao WHERE Ativo = 1 AND Plataforma = @plataforma AND IdentificadorNormalizado = @norm ${canalId ? "AND CanalId <> @canalId" : ""}`);
  if (dup.recordset[0]) return `Já existe um canal ativo com este identificador: “${dup.recordset[0].Nome}”.`;
  return null;
}

function mensagemDeErroDoBanco(e) {
  if (e && (e.number === 2601 || e.number === 2627)) return "Já existe um canal ativo com este identificador.";
  return null;
}

// v7.7 — o responsável com acesso ao grupo (pai, mãe ou tutor de um dos menores) é membro ATIVO e ADULTO (idade conhecida, 18 anos completos). As mensagens não citam
// nome: quem indica pode estar digitando a matrícula de alguém de outra congregação, e o que o sistema devolve não pode virar consulta de cadastro alheio.
async function conferirResponsavelDeAcesso(pool, membroId, { hoje = hojeBrasilia() } = {}) {
  const m = (await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId, Status, DataNascimento FROM MembroReferencia WHERE MembroId = @id`)).recordset[0];
  // UMA mensagem para os três casos (não existe, não está ativo, não é adulto): quem tem canais_gestao digita matrículas de qualquer congregação, e três mensagens virariam um
  // oráculo de cadastro alheio.
  const RECUSA = "Essa matrícula não pode ser indicada como responsável com acesso: precisa ser de um membro ATIVO e adulto (18 anos completos).";
  if (!m || m.Status !== "ATIVO") return RECUSA;
  const idade = idadeEmAnos(m.DataNascimento, hoje);
  if (idade == null || idade < 18) return RECUSA;
  return null;
}

// Recusa de regra do grupo com menores (vira 422): a mensagem junta as pendências em português simples e a lista delas vai junto, para a tela e para o teste.
function recusaMenores(introducao, pendencias) {
  return { sucesso: false, mensagem: `${introducao} ${pendencias.map(p => p.mensagem).join(" ")}`.trim(), pendencias };
}

// Ligar "inclui menores" num canal que JÁ tem administradores: só passa se, com o canal já tratado como grupo com menores, a regra estiver cumprida (dois adultos
// habilitados com o Termo aceito, todo administrador habilitado e responsável com acesso — o indicado nesta mesma gravação conta). Canal ainda SEM administradores
// pode ligar: não há quem habilitar agora, ele fica IRREGULAR até cumprir (e designar já exige quem esteja habilitado). Devolve a recusa ou null.
async function recusaDeLigarMenores(pool, canal, responsavelAcessoMembroId, { hoje }) {
  const st = await carregarEstadoDosCanais(pool, { canalId: canal.canalId, hoje, comoMenores: { responsavelAcessoMembroId } });
  const e = st.obter(canal.canalId);
  if (e.administradores.length === 0) return null;
  const pend = canais.pendenciasDeMenores({ incluiMenores: true, responsavelAcessoMembroId }, e);
  if (pend.length === 0) return null;
  return recusaMenores("Este canal já tem administradores, e só pode passar a incluir crianças e adolescentes se a regra do grupo com menores já estiver cumprida.", pend);
}

async function criarCanal(pool, ctx, d, { membroId }) {
  const v = canais.validarCanal(d, { criando: true });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const dados = v.dados;
  const recusa = await conferirRegrasDoBanco(pool, ctx, dados);
  if (recusa) return { sucesso: false, mensagem: recusa };
  // v7.7: o responsável com acesso é conferido ANTES de gravar. Canal novo com menores e ainda SEM administradores é permitido (não há quem designar ainda): nasce IRREGULAR até cumprir.
  if (dados.responsavelAcessoMembroId) {
    const recusaResp = await conferirResponsavelDeAcesso(pool, dados.responsavelAcessoMembroId);
    if (recusaResp) return { sucesso: false, mensagem: recusaResp };
  }

  let canalId;
  try {
    const r = await pool.request()
      .input("nome", sql.NVarChar(150), dados.nome).input("plataforma", sql.NVarChar(20), dados.plataforma).input("categoria", sql.NVarChar(20), dados.categoria)
      .input("tema", sql.NVarChar(30), dados.temaFocado).input("ident", sql.NVarChar(200), dados.identificador).input("norm", sql.NVarChar(200), dados.identificadorNormalizado)
      .input("vinculo", sql.NVarChar(12), dados.vinculoInstitucional).input("por", sql.Int, membroId || null)
      .input("escopo", sql.NVarChar(14), dados.escopo).input("cong", sql.Int, dados.congregacaoId).input("area", sql.Int, dados.areaId).input("dep", sql.Int, dados.departamentoId)
      .input("menores", sql.Bit, dados.incluiMenores).input("resp", sql.Int, dados.responsavelAcessoMembroId).input("publico", sql.Bit, dados.publicoNoSite).input("custodia", sql.Bit, dados.custodiaSecretaria)
      .input("descricao", sql.NVarChar(500), dados.descricao).input("hoje", sql.Date, hojeBrasilia())
      .query(`
        INSERT INTO CanaisOficiaisComunicacao (Sigla, Nome, Ativo, Plataforma, Categoria, TemaFocado, Identificador, IdentificadorNormalizado, VinculoInstitucional,
          DeclaracaoInstitucionalPorMembroId, DeclaracaoInstitucionalEm, Escopo, CongregacaoId, AreaId, DepartamentoId, IncluiMenores, ResponsavelAcessoMembroId, PublicoNoSite, CustodiaSecretaria,
          Descricao, VigenteDesde, RegistradoPorMembroId)
        OUTPUT INSERTED.CanalId
        VALUES (N'CANAL', @nome, 1, @plataforma, @categoria, @tema, @ident, @norm, @vinculo, @por, SYSUTCDATETIME(), @escopo, @cong, @area, @dep, @menores, @resp, @publico, @custodia, @descricao, @hoje, @por)`);
    canalId = r.recordset[0].CanalId;
    await pool.request().input("id", sql.Int, canalId).query(`UPDATE CanaisOficiaisComunicacao SET Sigla = LEFT(Plataforma, 22) + N'_' + CONVERT(NVARCHAR(10), CanalId) WHERE CanalId = @id`);
  } catch (e) {
    const m = mensagemDeErroDoBanco(e);
    if (m) return { sucesso: false, mensagem: m };
    throw e;
  }
  await registrarAuditoria({ tabela: "CanaisOficiaisComunicacao", registroId: canalId, acao: "CANAL_REGISTRADO", usuarioId: membroId, dadosDepois: { ...dados, canalId } });
  const canal = await buscarCanal(pool, canalId, ctx);
  const aviso = dados.incluiMenores ? " Como inclui crianças e adolescentes, o canal fica IRREGULAR até ter ao menos dois administradores adultos habilitados e um responsável com acesso." : "";
  return { sucesso: true, mensagem: `Canal “${dados.nome}” registrado. Designe os administradores e peça que aceitem o Termo de Dever de Moderação.${aviso}`, canalId, canal };
}

async function atualizarCanal(pool, ctx, canalId, d, { membroId }) {
  const atual = await buscarCanal(pool, canalId, ctx);
  if (!atual) return { sucesso: false, mensagem: "Canal não encontrado." };
  const tem = (k) => Object.prototype.hasOwnProperty.call(d, k);

  // Mescla o que veio com o que já existe e valida o conjunto. O canal legado (sem plataforma ou sem
  // identificador) é completado por aqui: nesse caso a declaração de titularidade precisa ser dada agora.
  const declarado = d.declaracaoInstitucional === true || !!atual.declaradoInstitucionalEm;
  const mesclado = {
    nome: tem("nome") ? d.nome : atual.nome,
    plataforma: tem("plataforma") ? d.plataforma : atual.plataforma,
    categoria: tem("categoria") ? d.categoria : atual.categoria,
    temaFocado: tem("temaFocado") ? d.temaFocado : atual.temaFocado,
    identificador: tem("identificador") ? d.identificador : atual.identificador,
    vinculoInstitucional: tem("vinculoInstitucional") ? d.vinculoInstitucional : atual.vinculoInstitucional,
    declaracaoInstitucional: declarado,
    escopo: tem("escopo") ? d.escopo : atual.escopo,
    congregacaoId: tem("congregacaoId") ? d.congregacaoId : atual.congregacaoId,
    areaId: tem("areaId") ? d.areaId : atual.areaId,
    departamentoId: tem("departamentoId") ? d.departamentoId : atual.departamentoId,
    incluiMenores: tem("incluiMenores") ? d.incluiMenores : atual.incluiMenores,
    responsavelAcessoMembroId: tem("responsavelAcessoMembroId") ? d.responsavelAcessoMembroId : atual.responsavelAcessoMembroId,
    publicoNoSite: tem("publicoNoSite") ? d.publicoNoSite : atual.publicoNoSite,
    custodiaSecretaria: tem("custodiaSecretaria") ? d.custodiaSecretaria : atual.custodiaSecretaria,
    descricao: tem("descricao") ? d.descricao : atual.descricao
  };
  const v = canais.validarCanal(mesclado, { criando: false });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const dados = v.dados;

  const mudouIdent = dados.plataforma !== atual.plataforma || dados.identificador !== atual.identificador;
  const mudouEscopo = dados.escopo !== atual.escopo || dados.congregacaoId !== atual.congregacaoId || dados.areaId !== atual.areaId || dados.departamentoId !== atual.departamentoId;
  if (mudouIdent || mudouEscopo || !atual.plataforma) {
    const recusa = await conferirRegrasDoBanco(pool, ctx, dados, { canalId: atual.canalId });
    if (recusa) return { sucesso: false, mensagem: recusa };
  }

  // v7.7 — só se confere o responsável QUANDO ele muda (um canal cujo responsável ficou inativo depois continua editável nos outros campos; a pendência já aparece na
  // conformidade). E ligar "inclui menores" num canal que já tem administradores exige a regra cumprida (dois adultos habilitados, responsável com acesso).
  const hoje = hojeBrasilia();
  if (dados.responsavelAcessoMembroId && dados.responsavelAcessoMembroId !== atual.responsavelAcessoMembroId) {
    const recusaResp = await conferirResponsavelDeAcesso(pool, dados.responsavelAcessoMembroId, { hoje });
    if (recusaResp) return { sucesso: false, mensagem: recusaResp };
  }
  if (dados.incluiMenores && !atual.incluiMenores && atual.ativo) {
    const recusaLigar = await recusaDeLigarMenores(pool, atual, dados.responsavelAcessoMembroId, { hoje });
    if (recusaLigar) return recusaLigar;
  }

  try {
    await pool.request().input("id", sql.Int, atual.canalId)
      .input("nome", sql.NVarChar(150), dados.nome).input("plataforma", sql.NVarChar(20), dados.plataforma).input("categoria", sql.NVarChar(20), dados.categoria)
      .input("tema", sql.NVarChar(30), dados.temaFocado).input("ident", sql.NVarChar(200), dados.identificador).input("norm", sql.NVarChar(200), dados.identificadorNormalizado)
      .input("vinculo", sql.NVarChar(12), dados.vinculoInstitucional).input("por", sql.Int, membroId || null)
      .input("escopo", sql.NVarChar(14), dados.escopo).input("cong", sql.Int, dados.congregacaoId).input("area", sql.Int, dados.areaId).input("dep", sql.Int, dados.departamentoId)
      .input("menores", sql.Bit, dados.incluiMenores).input("resp", sql.Int, dados.responsavelAcessoMembroId).input("publico", sql.Bit, dados.publicoNoSite).input("custodia", sql.Bit, dados.custodiaSecretaria)
      .input("descricao", sql.NVarChar(500), dados.descricao).input("declarouAgora", sql.Bit, !atual.declaradoInstitucionalEm)
      .query(`
        UPDATE CanaisOficiaisComunicacao SET Nome = @nome, Plataforma = @plataforma, Categoria = @categoria, TemaFocado = @tema, Identificador = @ident,
          IdentificadorNormalizado = @norm, VinculoInstitucional = @vinculo, Escopo = @escopo, CongregacaoId = @cong, AreaId = @area, DepartamentoId = @dep,
          IncluiMenores = @menores, ResponsavelAcessoMembroId = @resp, PublicoNoSite = @publico, CustodiaSecretaria = @custodia, Descricao = @descricao,
          DeclaracaoInstitucionalPorMembroId = CASE WHEN @declarouAgora = 1 THEN @por ELSE DeclaracaoInstitucionalPorMembroId END,
          DeclaracaoInstitucionalEm = CASE WHEN @declarouAgora = 1 THEN SYSUTCDATETIME() ELSE DeclaracaoInstitucionalEm END
        WHERE CanalId = @id`);
    if (!atual.plataforma) {
      await pool.request().input("id", sql.Int, atual.canalId).query(`UPDATE CanaisOficiaisComunicacao SET Sigla = LEFT(Plataforma, 22) + N'_' + CONVERT(NVARCHAR(10), CanalId) WHERE CanalId = @id AND Sigla NOT LIKE N'%[_]%'`);
    }
  } catch (e) {
    const m = mensagemDeErroDoBanco(e);
    if (m) return { sucesso: false, mensagem: m };
    throw e;
  }
  await registrarAuditoria({ tabela: "CanaisOficiaisComunicacao", registroId: atual.canalId, acao: "CANAL_ATUALIZADO", usuarioId: membroId, dadosAntes: atual, dadosDepois: dados });
  return { sucesso: true, mensagem: "Canal atualizado.", canal: await buscarCanal(pool, atual.canalId, ctx) };
}

// v7.7 — indica (ou retira, com `membroId` nulo) o responsável com acesso ao grupo de um canal que inclui menores. O canal já foi conferido no escopo de quem pede
// (GestaoCanais); aqui valem as regras do dado: canal ativo, que inclui menores, e responsável membro ATIVO e ADULTO. A auditoria guarda só matrículas.
async function definirResponsavelAcesso(pool, ctx, { canalId, membroId, por, hoje = hojeBrasilia() }) {
  const canal = await buscarCanal(pool, canalId, ctx);
  if (!canal) return { sucesso: false, mensagem: "Canal não encontrado." };
  if (!canal.ativo) return { sucesso: false, mensagem: "O canal está desativado." };
  if (!canal.incluiMenores) return { sucesso: false, mensagem: "Este canal não está marcado como “inclui crianças/adolescentes”: marque isso no cadastro do canal antes de indicar o responsável com acesso." };
  const novo = membroId == null ? null : canais.inteiroPositivoEstrito(membroId);
  if (membroId != null && !novo) return { sucesso: false, mensagem: "Informe a matrícula do responsável com acesso (número inteiro positivo)." };
  const atual = canal.responsavelAcessoMembroId || null;
  if (novo === atual) return { sucesso: false, mensagem: novo ? "Esta pessoa já é o responsável com acesso deste canal." : "Este canal já está sem responsável com acesso indicado." };
  if (novo) {
    const recusa = await conferirResponsavelDeAcesso(pool, novo, { hoje });
    if (recusa) return { sucesso: false, mensagem: recusa };
  }
  await pool.request().input("id", sql.Int, canal.canalId).input("resp", sql.Int, novo).query(`UPDATE CanaisOficiaisComunicacao SET ResponsavelAcessoMembroId = @resp WHERE CanalId = @id`);
  await registrarAuditoria({ tabela: "CanaisOficiaisComunicacao", registroId: canal.canalId, acao: "CANAL_RESPONSAVEL_ACESSO", usuarioId: por, dadosAntes: { responsavelAcessoMembroId: atual }, dadosDepois: { responsavelAcessoMembroId: novo } });
  return {
    sucesso: true, canalId: canal.canalId, responsavelAcessoMembroId: novo,
    mensagem: novo ? "Responsável com acesso indicado." : "Responsável com acesso retirado: o canal fica IRREGULAR até que outro seja indicado."
  };
}

async function desativarCanal(pool, ctx, canalId, motivo, { membroId }) {
  const canal = await buscarCanal(pool, canalId, ctx);
  if (!canal) return { sucesso: false, mensagem: "Canal não encontrado." };
  if (!canal.ativo) return { sucesso: false, mensagem: "O canal já está desativado." };
  const m = limpar(motivo);
  if (m.length < 5 || m.length > 300) return { sucesso: false, mensagem: "Informe o motivo da desativação (5 a 300 caracteres)." };
  const abertas = (await pool.request().input("id", sql.Int, canal.canalId).query(`SELECT COUNT(*) AS n FROM CanalOcorrencias WHERE CanalId = @id AND Status = 'ABERTA'`)).recordset[0].n;
  if (abertas > 0) return { sucesso: false, mensagem: `Há ${abertas} ocorrência(s) aberta(s) neste canal. Resolva-as antes de desativar.` };
  await pool.request().input("id", sql.Int, canal.canalId).input("motivo", sql.NVarChar(300), m).input("hoje", sql.Date, hojeBrasilia())
    .query(`UPDATE CanaisOficiaisComunicacao SET Ativo = 0, VigenteAte = @hoje, DesativadoMotivo = @motivo WHERE CanalId = @id`);
  await registrarAuditoria({ tabela: "CanaisOficiaisComunicacao", registroId: canal.canalId, acao: "CANAL_DESATIVADO", usuarioId: membroId, dadosAntes: { ativo: true }, dadosDepois: { ativo: false, motivo: m } });
  return { sucesso: true, mensagem: "Canal desativado. O histórico (inclusive as tentativas de contato já registradas) foi preservado." };
}

async function reativarCanal(pool, ctx, canalId, { membroId }) {
  const canal = await buscarCanal(pool, canalId, ctx);
  if (!canal) return { sucesso: false, mensagem: "Canal não encontrado." };
  if (canal.ativo) return { sucesso: false, mensagem: "O canal já está ativo." };
  if (canal.plataforma && canal.identificador) {
    const norm = (await pool.request().input("id", sql.Int, canal.canalId).query(`SELECT IdentificadorNormalizado FROM CanaisOficiaisComunicacao WHERE CanalId = @id`)).recordset[0];
    const recusa = await conferirRegrasDoBanco(pool, ctx, {
      plataforma: canal.plataforma, identificadorNormalizado: norm ? norm.IdentificadorNormalizado : null,
      escopo: canal.escopo, congregacaoId: canal.congregacaoId, areaId: canal.areaId, departamentoId: canal.departamentoId
    }, { canalId: canal.canalId });
    if (recusa) return { sucesso: false, mensagem: recusa };
  }
  try {
    await pool.request().input("id", sql.Int, canal.canalId).input("hoje", sql.Date, hojeBrasilia())
      .query(`UPDATE CanaisOficiaisComunicacao SET Ativo = 1, VigenteAte = NULL, DesativadoMotivo = NULL, VigenteDesde = @hoje WHERE CanalId = @id`);
  } catch (e) {
    const m = mensagemDeErroDoBanco(e);
    if (m) return { sucesso: false, mensagem: m };
    throw e;
  }
  await registrarAuditoria({ tabela: "CanaisOficiaisComunicacao", registroId: canal.canalId, acao: "CANAL_REATIVADO", usuarioId: membroId, dadosAntes: { ativo: false }, dadosDepois: { ativo: true } });
  return { sucesso: true, mensagem: "Canal reativado." };
}

// ---------------------------------------------------------------
// Notificação imediata (a Regra das 24 Horas não espera a rodada diária)
// ---------------------------------------------------------------

// `limiteDia` (opcional): no máximo esse tanto de avisos DESTA regra para a mesma pessoa em 24 horas; os seguintes não são criados (nem enviados por e-mail).
// Serve para a regra que alguém pode repetir de propósito contra uma pessoa (remover e reintegrar em ciclo): o fato continua registrado, só o aviso para.
// `aguardarEntrega: false`: não espera o serviço de e-mail confirmar a entrega de cada mensagem (só a aceitação) — para o aviso de um ato que não pode demorar.
async function notificarAgora(pool, { regraChave, destinatarios, mensagem, referenciaId, referenciaTabela, limiteDia = null, aguardarEntrega = true, deps = {} }) {
  try {
    const criar = deps.criarNotificacao || require("./notificacoes").criarNotificacao;
    const enviar = deps.enviarCanais || ((p, o) => require("./notificacaoMotor").enviarCanaisNotificacao(p, o));
    const regra = (await pool.request().input("chave", sql.NVarChar(60), regraChave).query(`SELECT * FROM NotificacaoRegras WHERE Chave = @chave AND Ativa = 1`)).recordset[0];
    if (!regra) return { criadas: 0 };
    const vistos = new Set();
    let criadas = 0, suprimidas = 0;
    for (const d of destinatarios || []) {
      if (!d || !d.membroId || vistos.has(d.membroId)) continue;
      vistos.add(d.membroId);
      if (limiteDia) {
        const hoje24 = (await pool.request().input("chave", sql.NVarChar(60), regraChave).input("dest", sql.Int, d.membroId)
          .query(`SELECT COUNT(*) AS n FROM Notificacoes WHERE RegraChave = @chave AND DestinatarioMembroId = @dest AND CriadaEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())`)).recordset[0];
        if (hoje24 && Number(hoje24.n) >= limiteDia) { suprimidas++; continue; }
      }
      const { criada, notificacaoId } = await criar(pool, {
        regraChave, destinatarioMembroId: d.membroId, titulo: regra.Titulo, mensagem: String(mensagem).slice(0, 1000),
        categoria: regra.Categoria, referenciaTabela, referenciaId
      });
      if (!criada) continue;
      criadas++;
      try { await enviar(pool, { regra, destinatarioMembroId: d.membroId, notificacaoId, titulo: regra.Titulo, mensagem, categoria: regra.Categoria, email: d.email, ...(aguardarEntrega === false ? { aguardarEntrega: false } : {}) }); }
      catch (e) { console.error("[CANAIS] falha ao enviar aviso:", e.message); }
    }
    return { criadas, suprimidas };
  } catch (e) {
    console.error("[CANAIS] falha ao notificar:", e.message);
    return { criadas: 0 };
  }
}

async function administradoresAtivosDoCanal(pool, canalId) {
  const r = await pool.request().input("canalId", sql.Int, canalId).query(`
    SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, m.Email AS email
    FROM CanalAdministradores a JOIN MembroReferencia m ON m.MembroId = a.MembroId WHERE a.CanalId = @canalId AND a.EncerradoEm IS NULL`);
  return r.recordset;
}

async function gestoresDeCanais(pool) {
  return require("./notificacoes").resolverDestinatariosPorPermissao(pool, { permissao: "canais_gestao" });
}

// ---------------------------------------------------------------
// Administradores e Termo de Dever de Moderação
// ---------------------------------------------------------------

function idadeEmAnos(nascimento, hoje) {
  if (!nascimento) return null;
  const n = isoData(nascimento);
  const [ya, ma, da] = n.split("-").map(Number);
  const [yb, mb, db] = hoje.split("-").map(Number);
  let anos = yb - ya;
  if (mb < ma || (mb === ma && db < da)) anos--;
  return anos;
}

async function designarAdministrador(pool, ctx, { canalId, membroId, papel, designadoPor, deps }) {
  const canal = await buscarCanal(pool, canalId, ctx);
  if (!canal) return { sucesso: false, mensagem: "Canal não encontrado." };
  if (!canal.ativo) return { sucesso: false, mensagem: "O canal está desativado." };
  const papelNorm = limpar(papel || "ADMINISTRADOR").toUpperCase();
  if (!canais.PAPEIS_ADMIN[papelNorm]) return { sucesso: false, mensagem: "Papel inválido: use Administrador ou Operador da conta." };
  const idMembro = Number(membroId);
  if (!Number.isInteger(idMembro) || idMembro <= 0) return { sucesso: false, mensagem: "Informe a matrícula de quem vai administrar." };
  const m = (await pool.request().input("id", sql.Int, idMembro).query(`SELECT MembroId, Nome, Status, DataNascimento FROM MembroReferencia WHERE MembroId = @id`)).recordset[0];
  if (!m) return { sucesso: false, mensagem: "Matrícula não encontrada." };
  if (m.Status !== "ATIVO") return { sucesso: false, mensagem: `${m.Nome} não está com a situação ATIVO no cadastro: só membro ativo administra um canal oficial.` };
  const idade = idadeEmAnos(m.DataNascimento, hojeBrasilia());
  if (idade != null && idade < 18) return { sucesso: false, mensagem: "O administrador responde solidariamente pelo canal (Art. 160, §1º, I): precisa ter 18 anos completos." };
  const ja = await pool.request().input("c", sql.Int, canal.canalId).input("m", sql.Int, idMembro).query(`SELECT AdminId FROM CanalAdministradores WHERE CanalId = @c AND MembroId = @m AND EncerradoEm IS NULL`);
  if (ja.recordset[0]) return { sucesso: false, mensagem: `${m.Nome} já é administrador deste canal.` };

  // v7.7 — canal que inclui crianças e adolescentes: só administra (ou opera) quem está habilitado para servir com menores. A recusa diz o que falta, mas pela máscara da
  // gestão: pendência com a Diretoria (restrição, comunicação em análise, cadastro nacional, fora de comunhão) aparece só como "pendência com a Diretoria", sem o motivo.
  if (canal.incluiMenores) {
    const ap = (await aptidaoMenoresDb().aptidaoEmLote(pool, [idMembro], { hoje: hojeBrasilia() })).get(idMembro);
    if (!ap || !ap.apto || !ap.contaComoAdulto) {
      const faltas = ap ? mm.mascararParaGestao(ap.bloqueios).map(b => (mm.ROTULO_BLOQUEIO[b.codigo] || "Pendência na habilitação").toLowerCase()) : [];
      return { sucesso: false, mensagem: `Este canal inclui crianças e adolescentes: só administra quem está habilitado para servir com menores (Lei 14.811/2024). Esta pessoa ainda não está habilitada${faltas.length ? ` — ${faltas.join("; ")}` : ""}. Peça que ela regularize em Meu Painel → Ministério com menores.` };
    }
  }

  let adminId;
  try {
    const r = await pool.request().input("c", sql.Int, canal.canalId).input("m", sql.Int, idMembro).input("papel", sql.NVarChar(14), papelNorm).input("por", sql.Int, designadoPor || null)
      .query(`INSERT INTO CanalAdministradores (CanalId, MembroId, Papel, DesignadoPorMembroId) OUTPUT INSERTED.AdminId VALUES (@c, @m, @papel, @por)`);
    adminId = r.recordset[0].AdminId;
  } catch (e) {
    if (e && (e.number === 2601 || e.number === 2627)) return { sucesso: false, mensagem: `${m.Nome} já é administrador deste canal.` };
    throw e;
  }
  await registrarAuditoria({ tabela: "CanalAdministradores", registroId: adminId, acao: "ADMIN_DESIGNADO", usuarioId: designadoPor, dadosDepois: { canalId: canal.canalId, membroId: idMembro, papel: papelNorm } });
  await notificarAgora(pool, {
    regraChave: "CANAIS_TERMO_PENDENTE", destinatarios: [{ membroId: idMembro, email: (await emailDe(pool, idMembro)) }],
    mensagem: `Você foi designado ${papelNorm === "OPERADOR" ? "operador da conta" : "administrador"} do canal “${canal.nome}”. Antes de atuar, leia e aceite o Termo de Dever de Moderação em Meu Painel → Canais (Regimento Art. 160).`,
    referenciaId: adminId * 1000 + canais.TERMO_VERSAO, referenciaTabela: "CanalAdministradores", deps
  });
  return { sucesso: true, mensagem: `${m.Nome} foi designado. A designação só vale de fato depois que a pessoa aceitar o Termo de Dever de Moderação.`, adminId };
}

async function emailDe(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`SELECT Email FROM MembroReferencia WHERE MembroId = @id`);
  return r.recordset[0] ? r.recordset[0].Email : null;
}

// `canalDesativando`: quem chama está encerrando as designações porque o canal inteiro está sendo desativado — aí não há grupo para proteger e a trava dos dois administradores não vale.
async function encerrarAdministrador(pool, ctx, { adminId, motivo, por, hoje = hojeBrasilia(), canalDesativando = false }) {
  const a = (await pool.request().input("id", sql.Int, Number(adminId)).query(`SELECT AdminId, CanalId, MembroId, Papel, EncerradoEm FROM CanalAdministradores WHERE AdminId = @id`)).recordset[0];
  if (!a) return { sucesso: false, mensagem: "Designação não encontrada." };
  if (a.EncerradoEm) return { sucesso: false, mensagem: "Esta designação já foi encerrada." };
  const m = limpar(motivo);
  if (m.length < 5 || m.length > 200) return { sucesso: false, mensagem: "Informe o motivo do encerramento (5 a 200 caracteres)." };
  // v7.7 — grupo ativo com crianças e adolescentes nunca fica com menos de dois administradores: designe o substituto ANTES de encerrar esta designação.
  // (Canal já desativado, ou sendo desativado agora, não tem grupo a proteger; desmarcar "inclui menores" também libera.)
  if (!canalDesativando) {
    const canal = await buscarCanal(pool, a.CanalId, ctx);
    if (canal && canal.ativo && canal.incluiMenores) {
      const ativos = Number((await pool.request().input("c", sql.Int, a.CanalId).query(`SELECT COUNT(*) AS n FROM CanalAdministradores WHERE CanalId = @c AND EncerradoEm IS NULL`)).recordset[0].n);
      if (ativos - 1 < canais.MENORES_ADMINISTRADORES_MINIMOS) {
        return recusaMenores("Este grupo inclui crianças e adolescentes e precisa manter pelo menos dois administradores.", [{
          codigo: "MENORES_SEM_SEGUNDO_ADULTO", gravidade: "ALTA",
          mensagem: `Hoje há ${ativos} designação(ões) ativa(s): designe antes o substituto, habilitado para servir com menores, e só então encerre esta designação.`,
          resumo: "há menos de dois administradores adultos com o Termo de Dever de Moderação aceito"
        }]);
      }
    }
  }
  await pool.request().input("id", sql.Int, a.AdminId).input("por", sql.Int, por || null).input("motivo", sql.NVarChar(200), m)
    .query(`UPDATE CanalAdministradores SET EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = @por, MotivoEncerramento = @motivo WHERE AdminId = @id`);
  await registrarAuditoria({ tabela: "CanalAdministradores", registroId: a.AdminId, acao: "ADMIN_ENCERRADO", usuarioId: por, dadosAntes: { canalId: a.CanalId, membroId: a.MembroId, papel: a.Papel }, dadosDepois: { motivo: m } });
  // Quem saiu pode ter a senha/o acesso: a Secretaria troca (Art. 160, §4º, I).
  const troca = await gerarTroca(pool, { canalId: a.CanalId, motivo: "SAIDA_ADMINISTRADOR", membroReferenciaId: a.MembroId, hoje, observacao: `Saída de ${a.Papel === "OPERADOR" ? "operador" : "administrador"}: ${m}`, por });
  return { sucesso: true, mensagem: troca.criada ? "Designação encerrada. Foi aberta a pendência de troca de senha/acesso do canal." : "Designação encerrada.", trocaId: troca.trocaId || null };
}

async function aceitarTermo(pool, { membroId, adminId = null, todos = false }) {
  if (!todos && !(Number.isInteger(Number(adminId)) && Number(adminId) > 0)) return { sucesso: false, mensagem: "Informe a designação (adminId) ou peça para aceitar todas." };
  const req = pool.request().input("m", sql.Int, membroId).input("v", sql.Int, canais.TERMO_VERSAO);
  let filtro = "";
  if (!todos) { req.input("a", sql.Int, Number(adminId)); filtro = "AND AdminId = @a"; }
  const pend = (await req.query(`SELECT AdminId, CanalId FROM CanalAdministradores WHERE MembroId = @m AND EncerradoEm IS NULL AND (TermoVersaoAceita IS NULL OR TermoVersaoAceita <> @v) ${filtro}`)).recordset;
  if (pend.length === 0) {
    if (!todos) {
      const existe = (await pool.request().input("m", sql.Int, membroId).input("a", sql.Int, Number(adminId)).query(`SELECT AdminId, TermoVersaoAceita FROM CanalAdministradores WHERE AdminId = @a AND MembroId = @m AND EncerradoEm IS NULL`)).recordset[0];
      if (!existe) return { sucesso: false, mensagem: "Designação não encontrada para a sua matrícula." };
      return { sucesso: false, mensagem: "Você já aceitou o termo vigente para este canal." };
    }
    return { sucesso: false, mensagem: "Não há termo pendente para a sua matrícula." };
  }
  let aceitos = 0;
  for (const p of pend) {
    await pool.request().input("id", sql.Int, p.AdminId).input("v", sql.Int, canais.TERMO_VERSAO).input("h", sql.NVarChar(64), canais.TERMO_HASH)
      .query(`UPDATE CanalAdministradores SET TermoVersaoAceita = @v, TermoHashAceito = @h, TermoAceitoEm = SYSUTCDATETIME() WHERE AdminId = @id`);
    await registrarAuditoria({ tabela: "CanalAdministradores", registroId: p.AdminId, acao: "TERMO_ACEITO", usuarioId: membroId, dadosDepois: { canalId: p.CanalId, versao: canais.TERMO_VERSAO, hash: canais.TERMO_HASH } });
    aceitos++;
  }
  return { sucesso: true, mensagem: aceitos === 1 ? "Termo aceito. Você já responde por este canal." : `Termo aceito em ${aceitos} canais.`, aceitos };
}

// Os canais que a pessoa administra, o estado do termo e o que tem aberto.
async function meusCanais(pool, ctx, membroId, { agoraMs = Date.now() } = {}) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT a.AdminId, a.CanalId, a.Papel, a.TermoVersaoAceita, a.TermoAceitoEm, a.DesignadoEm,
           (SELECT COUNT(*) FROM CanalOcorrencias o WHERE o.CanalId = a.CanalId AND o.Status = 'ABERTA') AS Abertas,
           (SELECT COUNT(*) FROM CanalOcorrencias o WHERE o.CanalId = a.CanalId AND o.Status = 'ABERTA' AND o.PrazoRemocaoEm < SYSUTCDATETIME()) AS Vencidas
    FROM CanalAdministradores a WHERE a.MembroId = @m AND a.EncerradoEm IS NULL ORDER BY a.DesignadoEm DESC`);
  const todos = await carregarCanais(pool, ctx, { incluirInativos: true });
  const porId = new Map(todos.map(c => [c.canalId, c]));
  const itens = r.recordset.filter(a => porId.has(a.CanalId)).map(a => {
    const c = porId.get(a.CanalId);
    return {
      adminId: a.AdminId, papel: a.Papel, rotuloPapel: canais.PAPEIS_ADMIN[a.Papel],
      termoAceito: a.TermoVersaoAceita === canais.TERMO_VERSAO, termoVersaoAceita: a.TermoVersaoAceita, termoAceitoEm: isoInstante(a.TermoAceitoEm), designadoEm: isoInstante(a.DesignadoEm),
      ocorrenciasAbertas: a.Abertas, ocorrenciasVencidas: a.Vencidas,
      canal: { canalId: c.canalId, nome: c.nome, rotuloPlataforma: c.rotuloPlataforma, rotuloCategoria: c.rotuloCategoria, rotuloEscopo: c.rotuloEscopo, ativo: c.ativo, descricao: c.descricao, temaFocado: c.temaFocado, rotuloTema: c.rotuloTema },
      orientacoes: {
        modeloTermoDeUso: c.categoria === "GRUPO_OFICIAL" ? canais.modeloTermoDeUso() : null,
        avisoAtencao: c.categoria === "GRUPO_FOCADO" ? canais.AVISO_ATENCAO : null,
        fraseRedirecionamento: canais.FRASE_REDIRECIONAMENTO
      }
    };
  });
  return { termo: canais.termoVigente(), canais: itens, termosPendentes: itens.filter(i => !i.termoAceito).length };
}

async function papeisNoCanal(pool, canalId, membroId) {
  const r = await pool.request().input("c", sql.Int, canalId).input("m", sql.Int, membroId).query(`SELECT Papel, TermoVersaoAceita FROM CanalAdministradores WHERE CanalId = @c AND MembroId = @m AND EncerradoEm IS NULL`);
  return r.recordset.map(x => ({ papel: x.Papel, termoAceito: x.TermoVersaoAceita === canais.TERMO_VERSAO }));
}

// ---------------------------------------------------------------
// Ocorrências — Regra das 24 Horas
// ---------------------------------------------------------------

// `verAutor`: mostra quem avisou (só a gestão). `verInterno` (padrão sim): mostra o que a Igreja decidiu e escreveu sobre a ocorrência — como o membro foi advertido,
// a prova da remoção, quem removeu, o motivo de improcedência. Quem só AVISOU (o membro comum) vê o andamento (situação e prazo), nunca esses textos livres, que
// descrevem um terceiro.
function mapearOcorrencia(r, agoraMs, { verAutor, verInterno = true }) {
  const cat = canais.CATEGORIAS_OCORRENCIA[r.Categoria] || {};
  const relatadaEmMs = emMs(r.RelatadaEm);
  const prazoMs = emMs(r.PrazoRemocaoEm);
  const removidaMs = emMs(r.RemovidaEm);
  const sit = canais.situacaoDaOcorrencia({ status: r.Status, relatadaEmMs, prazoRemocaoEmMs: prazoMs, removidaEmMs: removidaMs }, agoraMs);
  const o = {
    ocorrenciaId: r.OcorrenciaId, canalId: r.CanalId, canalNome: r.CanalNome, canalPlataforma: r.CanalPlataforma || null,
    categoria: r.Categoria, rotuloCategoria: cat.rotulo || r.Categoria, artigo: cat.artigo || null, gravidade: cat.gravidade || "MEDIA",
    descricao: r.Descricao, linkEvidencia: r.LinkEvidencia || null,
    relatadaEm: isoInstante(r.RelatadaEm), prazoRemocaoEm: isoInstante(r.PrazoRemocaoEm),
    status: r.Status, rotuloStatus: canais.STATUS_OCORRENCIA[r.Status], fase: sit.fase, dentroDoPrazo: sit.dentroDoPrazo,
    horasRestantes: sit.horasRestantes != null ? arred1(sit.horasRestantes) : null, horasVencida: sit.horasVencida != null ? arred1(sit.horasVencida) : null,
    igrejaCorresponsavel: !!sit.igrejaCorresponsavel,
    removidaEm: isoInstante(r.RemovidaEm), remocaoRegistradaEm: isoInstante(r.RemocaoRegistradaEm),
    horasAteRemover: sit.horasAteRemover != null ? arred1(sit.horasAteRemover) : null,
    advertidoEm: isoInstante(r.AdvertenciaEm),
    decididaEm: isoInstante(r.DecididaEm),
    sugerirAdvertencia: !!cat.advertir
  };
  if (verInterno) {
    o.removidaPorNome = r.RemovidaPorNome || null;
    o.provaRemocao = r.ProvaRemocao || null; o.linkProva = r.LinkProva || null;
    o.advertenciaObs = r.AdvertenciaObs || null;
    o.motivoImprocedente = r.MotivoImprocedente || null;
  }
  if (verAutor) { o.relatadaPorMembroId = r.RelatadaPorMembroId; o.relatadaPorNome = r.RelatadaPorNome || null; }
  if (r.Status === "ABERTA") {
    o.orientacao = canais.orientacaoDaOcorrencia(r.Categoria);
    if (cat.tema) o.temaRedirecionamento = { tema: cat.tema, rotulo: canais.TEMAS_FOCADOS[cat.tema].rotulo, frase: canais.FRASE_REDIRECIONAMENTO };
  }
  return o;
}

const SELECT_OCORRENCIA = `
  SELECT o.*, c.Nome AS CanalNome, c.Plataforma AS CanalPlataforma, mr.Nome AS RelatadaPorNome, mm.Nome AS RemovidaPorNome
  FROM CanalOcorrencias o
  JOIN CanaisOficiaisComunicacao c ON c.CanalId = o.CanalId
  JOIN MembroReferencia mr ON mr.MembroId = o.RelatadaPorMembroId
  LEFT JOIN MembroReferencia mm ON mm.MembroId = o.RemovidaPorMembroId`;

// filtros: status, canalId, canaisIds (lista permitida), relatadaPor. `verAutor` esconde/mostra quem relatou.
async function carregarOcorrencias(pool, ctx, { status = null, canalId = null, canaisIds = null, relatadaPor = null, ocorrenciaId = null, limite = 200, verAutor = false, verInterno = true, agoraMs = Date.now() } = {}) {
  const req = pool.request();
  const cond = [];
  if (status) { req.input("status", sql.NVarChar(14), status); cond.push("o.Status = @status"); }
  if (canalId) { req.input("canalId", sql.Int, canalId); cond.push("o.CanalId = @canalId"); }
  if (relatadaPor) { req.input("rel", sql.Int, relatadaPor); cond.push("o.RelatadaPorMembroId = @rel"); }
  if (ocorrenciaId) { req.input("oc", sql.Int, ocorrenciaId); cond.push("o.OcorrenciaId = @oc"); }
  if (Array.isArray(canaisIds)) {
    if (canaisIds.length === 0) return [];
    cond.push(`o.CanalId IN (${canaisIds.map(Number).filter(Number.isInteger).join(",") || "0"})`);
  }
  const r = await req.query(`${SELECT_OCORRENCIA} ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY CASE o.Status WHEN 'ABERTA' THEN 0 ELSE 1 END, o.PrazoRemocaoEm ASC, o.OcorrenciaId DESC OFFSET 0 ROWS FETCH NEXT ${Math.min(limite, LIMITE_LISTA)} ROWS ONLY`);
  return r.recordset.map(x => mapearOcorrencia(x, agoraMs, { verAutor, verInterno }));
}

async function buscarOcorrenciaBruta(pool, ocorrenciaId) {
  const r = await pool.request().input("id", sql.Int, Number(ocorrenciaId)).query(`SELECT * FROM CanalOcorrencias WHERE OcorrenciaId = @id`);
  return r.recordset[0] || null;
}

async function abrirOcorrencia(pool, ctx, d, { membroId, agoraMs = Date.now(), deps } = {}) {
  const v = canais.validarOcorrencia(d);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const dados = v.dados;
  const canal = await buscarCanal(pool, dados.canalId, ctx);
  if (!canal) return { sucesso: false, mensagem: "Canal não encontrado." };
  if (!canal.ativo) return { sucesso: false, mensagem: "Este canal está desativado." };

  const r = await pool.request()
    .input("canalId", sql.Int, canal.canalId).input("cat", sql.NVarChar(24), dados.categoria).input("desc", sql.NVarChar(500), dados.descricao)
    .input("link", sql.NVarChar(500), dados.linkEvidencia).input("por", sql.Int, membroId).input("horas", sql.Int, canais.PRAZO_REMOCAO_HORAS)
    .query(`
      DECLARE @t DATETIME2 = SYSUTCDATETIME();
      INSERT INTO CanalOcorrencias (CanalId, Categoria, Descricao, LinkEvidencia, RelatadaPorMembroId, RelatadaEm, PrazoRemocaoEm)
      OUTPUT INSERTED.OcorrenciaId, INSERTED.RelatadaEm, INSERTED.PrazoRemocaoEm
      VALUES (@canalId, @cat, @desc, @link, @por, @t, DATEADD(HOUR, @horas, @t))`);
  const ocorrenciaId = r.recordset[0].OcorrenciaId;
  await registrarAuditoria({ tabela: "CanalOcorrencias", registroId: ocorrenciaId, acao: "OCORRENCIA_ABERTA", usuarioId: membroId, dadosDepois: { canalId: canal.canalId, categoria: dados.categoria } });

  // Avisa na hora quem administra o canal; categorias graves e canal sem administrador avisam também a gestão.
  const cat = canais.CATEGORIAS_OCORRENCIA[dados.categoria];
  const admins = await administradoresAtivosDoCanal(pool, canal.canalId);
  const gestao = (cat.gravidade === "ALTA" || admins.length === 0) ? await gestoresDeCanais(pool) : [];
  const prazo = new Date(emMs(r.recordset[0].PrazoRemocaoEm));
  const quando = prazo.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const texto = `${cat.rotulo} no canal “${canal.nome}” (${cat.artigo}). Remova o conteúdo até ${quando} (24 horas) e registre a prova: a omissão torna a Igreja corresponsável. ${admins.length === 0 ? "ATENÇÃO: este canal está sem administrador designado." : ""}`.trim();
  const dest = [...admins, ...gestao];
  await notificarAgora(pool, { regraChave: "CANAIS_OCORRENCIA_NOVA", destinatarios: dest, mensagem: texto, referenciaId: ocorrenciaId, referenciaTabela: "CanalOcorrencias", deps });

  return {
    sucesso: true, ocorrenciaId,
    mensagem: admins.length ? "Aviso registrado. Os administradores do canal foram avisados e têm 24 horas para remover o conteúdo." : "Aviso registrado. O canal não tem administrador: a Secretaria foi avisada.",
    administradoresAvisados: admins.length, prazoRemocaoEm: isoInstante(r.recordset[0].PrazoRemocaoEm)
  };
}

async function registrarRemocao(pool, { ocorrenciaId, dados, membroId, agoraMs = Date.now() }) {
  const o = await buscarOcorrenciaBruta(pool, ocorrenciaId);
  if (!o) return { sucesso: false, mensagem: "Ocorrência não encontrada." };
  if (o.Status !== "ABERTA") return { sucesso: false, mensagem: "Esta ocorrência já foi encerrada." };
  const v = canais.validarRemocao(dados || {}, { relatadaEmMs: emMs(o.RelatadaEm), agoraMs });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const r = await pool.request().input("id", sql.Int, o.OcorrenciaId).input("em", sql.DateTime2, new Date(d.removidaEmMs)).input("por", sql.Int, membroId)
    .input("prova", sql.NVarChar(500), d.provaRemocao).input("link", sql.NVarChar(500), d.linkProva)
    .query(`UPDATE CanalOcorrencias SET Status = 'REMOVIDA', RemovidaEm = @em, RemocaoRegistradaEm = SYSUTCDATETIME(), RemovidaPorMembroId = @por, ProvaRemocao = @prova, LinkProva = @link
            WHERE OcorrenciaId = @id AND Status = 'ABERTA'`);
  if (r.rowsAffected && r.rowsAffected[0] === 0) return { sucesso: false, mensagem: "Esta ocorrência já foi encerrada." };
  const dentro = d.removidaEmMs <= emMs(o.PrazoRemocaoEm);
  const horas = arred1((d.removidaEmMs - emMs(o.RelatadaEm)) / canais.HORA_MS);
  await registrarAuditoria({ tabela: "CanalOcorrencias", registroId: o.OcorrenciaId, acao: "OCORRENCIA_REMOVIDA", usuarioId: membroId, dadosDepois: { dentroDoPrazo: dentro, horasAteRemover: horas } });
  return {
    sucesso: true, dentroDoPrazo: dentro, horasAteRemover: horas,
    mensagem: dentro ? `Remoção registrada: o conteúdo saiu em ${horas} h, dentro do prazo de 24 horas.` : `Remoção registrada, mas FORA do prazo de 24 horas (${horas} h): a Igreja esteve corresponsável nesse intervalo.`
  };
}

async function marcarImprocedente(pool, { ocorrenciaId, motivo, membroId }) {
  const o = await buscarOcorrenciaBruta(pool, ocorrenciaId);
  if (!o) return { sucesso: false, mensagem: "Ocorrência não encontrada." };
  if (o.Status !== "ABERTA") return { sucesso: false, mensagem: "Esta ocorrência já foi encerrada." };
  const m = limpar(motivo);
  if (m.length < 10 || m.length > 300) return { sucesso: false, mensagem: "Explique por que o conteúdo não é irregular (10 a 300 caracteres)." };
  await pool.request().input("id", sql.Int, o.OcorrenciaId).input("por", sql.Int, membroId).input("m", sql.NVarChar(300), m)
    .query(`UPDATE CanalOcorrencias SET Status = 'IMPROCEDENTE', DecididaPorMembroId = @por, DecididaEm = SYSUTCDATETIME(), MotivoImprocedente = @m WHERE OcorrenciaId = @id AND Status = 'ABERTA'`);
  await registrarAuditoria({ tabela: "CanalOcorrencias", registroId: o.OcorrenciaId, acao: "OCORRENCIA_IMPROCEDENTE", usuarioId: membroId, dadosDepois: { motivo: m } });
  return { sucesso: true, mensagem: "Ocorrência encerrada como improcedente." };
}

async function registrarAdvertencia(pool, { ocorrenciaId, observacao, membroId }) {
  const o = await buscarOcorrenciaBruta(pool, ocorrenciaId);
  if (!o) return { sucesso: false, mensagem: "Ocorrência não encontrada." };
  if (o.Status === "IMPROCEDENTE") return { sucesso: false, mensagem: "Ocorrência improcedente não tem advertência." };
  if (o.AdvertenciaEm) return { sucesso: false, mensagem: "A advertência já foi registrada." };
  const obs = limpar(observacao);
  if (obs.length < 5 || obs.length > 300) return { sucesso: false, mensagem: "Descreva como o membro foi advertido (5 a 300 caracteres)." };
  await pool.request().input("id", sql.Int, o.OcorrenciaId).input("por", sql.Int, membroId).input("obs", sql.NVarChar(300), obs)
    .query(`UPDATE CanalOcorrencias SET AdvertenciaEm = SYSUTCDATETIME(), AdvertenciaPorMembroId = @por, AdvertenciaObs = @obs WHERE OcorrenciaId = @id`);
  await registrarAuditoria({ tabela: "CanalOcorrencias", registroId: o.OcorrenciaId, acao: "OCORRENCIA_ADVERTENCIA", usuarioId: membroId, dadosDepois: { observacao: obs } });
  return { sucesso: true, mensagem: "Advertência registrada." };
}

// ---------------------------------------------------------------
// Credenciais — a Secretaria Geral é a dona das senhas (Art. 160, §4º, I)
// ---------------------------------------------------------------

async function gerarTroca(pool, { canalId, motivo, membroReferenciaId = null, observacao = null, por = null, hoje = hojeBrasilia(), deps }) {
  const dias = await lerPrazoDias(pool, "CANAIS_TROCA_CREDENCIAL_DIAS", TROCA_DIAS_PADRAO);
  const prazo = canais.somarDiasIso(hoje, dias);
  try {
    const r = await pool.request().input("c", sql.Int, canalId).input("mot", sql.NVarChar(24), motivo).input("m", sql.Int, membroReferenciaId).input("prazo", sql.Date, prazo).input("obs", sql.NVarChar(300), observacao ? String(observacao).slice(0, 300) : null)
      .query(`INSERT INTO CanalTrocasCredencial (CanalId, Motivo, MembroReferenciaId, PrazoEm, Observacao) OUTPUT INSERTED.TrocaId VALUES (@c, @mot, @m, @prazo, @obs)`);
    const trocaId = r.recordset[0].TrocaId;
    await registrarAuditoria({ tabela: "CanalTrocasCredencial", registroId: trocaId, acao: "TROCA_CREDENCIAL_GERADA", usuarioId: por, dadosDepois: { canalId, motivo, membroReferenciaId, prazoEm: prazo } });
    const nome = (await pool.request().input("c", sql.Int, canalId).query(`SELECT Nome FROM CanaisOficiaisComunicacao WHERE CanalId = @c`)).recordset[0];
    await notificarAgora(pool, {
      regraChave: "CANAIS_TROCA_CREDENCIAL", destinatarios: await gestoresDeCanais(pool),
      mensagem: `${canais.MOTIVOS_TROCA[motivo]}: ${nome ? `canal “${nome.Nome}”` : "canal oficial"}. Providencie até ${canais.somarDiasIso(hoje, dias).split("-").reverse().join("/")} e confirme no sistema.`,
      referenciaId: trocaId * 2, referenciaTabela: "CanalTrocasCredencial", deps
    });
    return { criada: true, trocaId, prazoEm: prazo };
  } catch (e) {
    if (e && (e.number === 2601 || e.number === 2627)) return { criada: false }; // já havia uma pendência aberta igual
    throw e;
  }
}

async function gerarTrocaManual(pool, ctx, { canalId, motivo, observacao, por }) {
  const canal = await buscarCanal(pool, canalId, ctx);
  if (!canal) return { sucesso: false, mensagem: "Canal não encontrado." };
  if (!canal.ativo) return { sucesso: false, mensagem: "O canal está desativado." };
  const m = limpar(motivo).toUpperCase();
  if (m !== "SUSPEITA_INVASAO" && m !== "ROTINA") return { sucesso: false, mensagem: "Motivo inválido: use Suspeita de invasão ou Troca de rotina." };
  const t = await gerarTroca(pool, { canalId: canal.canalId, motivo: m, observacao: limpar(observacao) || null, por });
  if (!t.criada) return { sucesso: false, mensagem: "Já existe uma pendência aberta com este motivo para o canal." };
  return { sucesso: true, mensagem: `Pendência aberta: ${canais.acaoDaTroca(canal)}.`, trocaId: t.trocaId };
}

async function listarTrocas(pool, ctx, { abertas = true, hoje = hojeBrasilia() } = {}) {
  const r = await pool.request().query(`
    SELECT t.TrocaId, t.CanalId, c.Nome AS CanalNome, c.Plataforma, t.Motivo, t.MembroReferenciaId, ms.Nome AS SaiuNome, t.GeradaEm, t.PrazoEm, t.Observacao,
           t.ResolvidaEm, mr.Nome AS ResolvidaPorNome, t.ObservacaoResolucao
    FROM CanalTrocasCredencial t JOIN CanaisOficiaisComunicacao c ON c.CanalId = t.CanalId
    LEFT JOIN MembroReferencia ms ON ms.MembroId = t.MembroReferenciaId LEFT JOIN MembroReferencia mr ON mr.MembroId = t.ResolvidaPorMembroId
    ${abertas ? "WHERE t.ResolvidaEm IS NULL" : ""} ORDER BY CASE WHEN t.ResolvidaEm IS NULL THEN 0 ELSE 1 END, t.PrazoEm, t.TrocaId DESC OFFSET 0 ROWS FETCH NEXT ${LIMITE_LISTA} ROWS ONLY`);
  return r.recordset.map(t => {
    const prazo = isoData(t.PrazoEm);
    return {
      trocaId: t.TrocaId, canalId: t.CanalId, canalNome: t.CanalNome, motivo: t.Motivo, rotuloMotivo: canais.MOTIVOS_TROCA[t.Motivo],
      acao: canais.acaoDaTroca({ plataforma: t.Plataforma }), saiuMembroId: t.MembroReferenciaId || null, saiuNome: t.SaiuNome || null,
      geradaEm: isoInstante(t.GeradaEm), prazoEm: prazo, vencida: !t.ResolvidaEm && prazo < hoje,
      observacao: t.Observacao || null, resolvidaEm: isoInstante(t.ResolvidaEm), resolvidaPorNome: t.ResolvidaPorNome || null, observacaoResolucao: t.ObservacaoResolucao || null
    };
  });
}

async function resolverTroca(pool, { trocaId, observacao, por }) {
  const t = (await pool.request().input("id", sql.Int, Number(trocaId)).query(`SELECT TrocaId, CanalId, ResolvidaEm FROM CanalTrocasCredencial WHERE TrocaId = @id`)).recordset[0];
  if (!t) return { sucesso: false, mensagem: "Pendência não encontrada." };
  if (t.ResolvidaEm) return { sucesso: false, mensagem: "Esta pendência já foi resolvida." };
  const obs = limpar(observacao);
  if (obs.length < 5 || obs.length > 300) return { sucesso: false, mensagem: "Registre o que foi feito (5 a 300 caracteres) — NUNCA escreva a senha aqui." };
  // Uma troca de senha cobre todas as pendências abertas daquele canal.
  const r = await pool.request().input("c", sql.Int, t.CanalId).input("por", sql.Int, por || null).input("obs", sql.NVarChar(300), obs)
    .query(`UPDATE CanalTrocasCredencial SET ResolvidaEm = SYSUTCDATETIME(), ResolvidaPorMembroId = @por, ObservacaoResolucao = @obs WHERE CanalId = @c AND ResolvidaEm IS NULL`);
  await pool.request().input("c", sql.Int, t.CanalId).input("por", sql.Int, por || null).input("hoje", sql.Date, hojeBrasilia())
    .query(`UPDATE CanaisOficiaisComunicacao SET UltimaTrocaCredencialEm = @hoje, UltimaTrocaPorMembroId = @por WHERE CanalId = @c`);
  const n = r.rowsAffected ? r.rowsAffected[0] : 1;
  await registrarAuditoria({ tabela: "CanalTrocasCredencial", registroId: t.TrocaId, acao: "TROCA_CREDENCIAL_RESOLVIDA", usuarioId: por, dadosDepois: { canalId: t.CanalId, pendenciasEncerradas: n } });
  return { sucesso: true, mensagem: n > 1 ? `Troca registrada. ${n} pendências do canal foram encerradas de uma vez.` : "Troca registrada.", encerradas: n };
}

const SQL_LIDERES_ATUAIS = `
  SELECT l.EscopoTipo, l.EscopoId, l.MembroId
  FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
  WHERE l.EscopoId IS NOT NULL AND (l.AtivoAte IS NULL OR l.AtivoAte >= @hoje)
    AND ((p.Nome = N'Dirigente de Congregação' AND l.EscopoTipo = 'CONGREGACAO')
      OR (p.Nome = N'Pastor de Área' AND l.EscopoTipo = 'AREA')
      OR (p.Nome LIKE N'Líder Geral de Departamento%' AND l.EscopoTipo = 'DEPARTAMENTO'))`;

// Compara quem lidera cada congregação, Área e departamento com o último estado conhecido. Se alguém
// SAIU, abre a pendência de troca de senha/acesso dos canais daquele escopo e dos que a pessoa
// administrava. Pega a troca por qualquer caminho (concessão, remoção, fim de mandato, medida cautelar).
// A primeira execução só registra o estado (não abre pendência para quem já estava).
async function sincronizarSucessoes(pool, { hoje = hojeBrasilia(), por = null, deps } = {}) {
  const atuais = (await pool.request().input("hoje", sql.Date, hoje).query(SQL_LIDERES_ATUAIS)).recordset;
  const snap = (await pool.request().query(`SELECT EscopoTipo, EscopoId, Assinatura FROM CanalLiderancaSnapshot`)).recordset;
  const chave = (t, i) => `${t}:${i}`;
  const porEscopo = new Map();
  for (const a of atuais) { const k = chave(a.EscopoTipo, a.EscopoId); if (!porEscopo.has(k)) porEscopo.set(k, { tipo: a.EscopoTipo, id: a.EscopoId, ids: [] }); porEscopo.get(k).ids.push(a.MembroId); }
  const snapPorChave = new Map(snap.map(s => [chave(s.EscopoTipo, s.EscopoId), s]));

  const escopos = new Map();
  for (const [k, v] of porEscopo) escopos.set(k, { tipo: v.tipo, id: v.id, assinatura: canais.assinaturaDeMatriculas(v.ids) });
  for (const s of snap) { const k = chave(s.EscopoTipo, s.EscopoId); if (!escopos.has(k)) escopos.set(k, { tipo: s.EscopoTipo, id: s.EscopoId, assinatura: "" }); }

  const resumo = { verificados: escopos.size, iniciados: 0, mudancas: 0, pendenciasGeradas: 0 };
  for (const [k, e] of escopos) {
    const antes = snapPorChave.get(k);
    if (!antes) {
      await pool.request().input("t", sql.NVarChar(14), e.tipo).input("i", sql.Int, e.id).input("a", sql.NVarChar(400), e.assinatura)
        .query(`INSERT INTO CanalLiderancaSnapshot (EscopoTipo, EscopoId, Assinatura) VALUES (@t, @i, @a)`);
      resumo.iniciados++;
      continue;
    }
    if (antes.Assinatura === e.assinatura) continue;
    const cmp = canais.compararSucessao(antes.Assinatura, e.assinatura);
    await pool.request().input("t", sql.NVarChar(14), e.tipo).input("i", sql.Int, e.id).input("a", sql.NVarChar(400), e.assinatura)
      .query(`UPDATE CanalLiderancaSnapshot SET Assinatura = @a, AtualizadoEm = SYSUTCDATETIME() WHERE EscopoTipo = @t AND EscopoId = @i`);
    resumo.mudancas++;
    await registrarAuditoria({ tabela: "CanalLiderancaSnapshot", registroId: e.id, acao: "LIDERANCA_SUCESSAO_DETECTADA", usuarioId: por, dadosAntes: { escopo: e.tipo, assinatura: antes.Assinatura }, dadosDepois: { assinatura: e.assinatura, sairam: cmp.sairam, entraram: cmp.entraram } });
    if (cmp.sairam.length === 0) continue;

    const coluna = { CONGREGACAO: "CongregacaoId", AREA: "AreaId", DEPARTAMENTO: "DepartamentoId" }[e.tipo];
    if (!coluna) continue;
    const doEscopo = (await pool.request().input("tipo", sql.NVarChar(14), e.tipo).input("i", sql.Int, e.id).query(`SELECT CanalId FROM CanaisOficiaisComunicacao WHERE Ativo = 1 AND Escopo = @tipo AND ${coluna} = @i`)).recordset.map(c => c.CanalId);
    for (const saiu of cmp.sairam) {
      const comoAdmin = (await pool.request().input("m", sql.Int, saiu).query(`SELECT DISTINCT a.CanalId FROM CanalAdministradores a JOIN CanaisOficiaisComunicacao c ON c.CanalId = a.CanalId WHERE a.MembroId = @m AND a.EncerradoEm IS NULL AND c.Ativo = 1`)).recordset.map(c => c.CanalId);
      for (const canalId of new Set([...doEscopo, ...comoAdmin])) {
        const t = await gerarTroca(pool, { canalId, motivo: "SUCESSAO_LIDERANCA", membroReferenciaId: saiu, hoje, observacao: `Saiu da liderança (${e.tipo.toLowerCase()} ${e.id}): matrícula ${saiu}.`, por, deps });
        if (t.criada) resumo.pendenciasGeradas++;
      }
    }
  }
  return resumo;
}

// ---------------------------------------------------------------
// Conferências e transmissão
// ---------------------------------------------------------------

async function registrarConferencia(pool, ctx, { canalId, itens, observacao, por }) {
  const canal = await buscarCanal(pool, canalId, ctx);
  if (!canal) return { sucesso: false, mensagem: "Canal não encontrado." };
  if (!canal.ativo) return { sucesso: false, mensagem: "O canal está desativado." };
  const av = canais.avaliarConferencia(canal, itens);
  if (!av.valido) return { sucesso: false, mensagem: av.mensagem, faltando: av.faltando };
  const obs = limpar(observacao);
  if (obs.length > 300) return { sucesso: false, mensagem: "A observação aceita até 300 caracteres." };
  if (av.resultado === "IRREGULAR" && obs.length < 5) return { sucesso: false, mensagem: "Conferência com irregularidade: descreva o que precisa ser corrigido (observação obrigatória)." };
  const r = await pool.request().input("c", sql.Int, canal.canalId).input("por", sql.Int, por).input("json", sql.NVarChar(sql.MAX), JSON.stringify(av.itens)).input("res", sql.NVarChar(10), av.resultado).input("obs", sql.NVarChar(300), obs || null)
    .query(`INSERT INTO CanalConferencias (CanalId, ConferidoPorMembroId, ItensJson, Resultado, Observacao) OUTPUT INSERTED.ConferenciaId VALUES (@c, @por, @json, @res, @obs)`);
  const conferenciaId = r.recordset[0].ConferenciaId;
  await registrarAuditoria({ tabela: "CanalConferencias", registroId: conferenciaId, acao: "CANAL_CONFERIDO", usuarioId: por, dadosDepois: { canalId: canal.canalId, resultado: av.resultado, irregulares: av.irregulares } });
  return { sucesso: true, conferenciaId, resultado: av.resultado, irregulares: av.irregulares, mensagem: av.resultado === "CONFORME" ? "Conferência registrada: canal em conformidade." : "Conferência registrada com irregularidade — o canal fica marcado até a próxima conferência conforme." };
}

async function listarTransmissao(pool, ctx) {
  const r = await pool.request().query(`SELECT t.*, m.Nome AS ConferidoPorNome FROM CongregacaoTransmissao t LEFT JOIN MembroReferencia m ON m.MembroId = t.ConferidoPorMembroId`);
  const porCong = new Map(r.recordset.map(x => [x.CongregacaoId, x]));
  return [...ctx.congregacoes.values()].filter(c => c.ativa).sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao, "pt-BR")).map(c => {
    const t = porCong.get(c.id);
    const linha = t ? { transmite: !!t.Transmite, placaAvisoInstaladaEm: isoData(t.PlacaAvisoInstaladaEm), areaCegaSituacao: t.AreaCegaSituacao, areaCegaDescricao: t.AreaCegaDescricao || null } : null;
    const av = canais.avaliarTransmissao(linha);
    return {
      congregacaoId: c.id, congregacaoNome: c.nomeExibicao, areaId: c.areaId, areaNome: c.areaId && ctx.areas.get(c.areaId) ? ctx.areas.get(c.areaId).nome : null,
      informada: !!t, transmite: linha ? linha.transmite : null, placaAvisoInstaladaEm: linha ? linha.placaAvisoInstaladaEm : null,
      areaCegaSituacao: linha ? linha.areaCegaSituacao : null, rotuloAreaCega: linha ? canais.AREA_CEGA_SITUACOES[linha.areaCegaSituacao] : null, areaCegaDescricao: linha ? linha.areaCegaDescricao : null,
      conferidoEm: t ? isoInstante(t.ConferidoEm) : null, conferidoPorNome: t ? t.ConferidoPorNome || null : null,
      situacao: av.situacao, pendencias: av.pendencias
    };
  });
}

async function salvarTransmissao(pool, ctx, d, { por }) {
  const v = canais.validarTransmissao(d);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const x = v.dados;
  const cong = ctx.congregacoes.get(x.congregacaoId);
  if (!cong) return { sucesso: false, mensagem: "Congregação não encontrada." };
  await pool.request().input("c", sql.Int, x.congregacaoId).input("t", sql.Bit, x.transmite).input("placa", sql.Date, x.placaAvisoInstaladaEm)
    .input("area", sql.NVarChar(24), x.areaCegaSituacao).input("desc", sql.NVarChar(300), x.areaCegaDescricao).input("por", sql.Int, por || null)
    .query(`
      MERGE CongregacaoTransmissao AS alvo USING (SELECT @c AS CongregacaoId) AS fonte ON alvo.CongregacaoId = fonte.CongregacaoId
      WHEN MATCHED THEN UPDATE SET Transmite = @t, PlacaAvisoInstaladaEm = @placa, AreaCegaSituacao = @area, AreaCegaDescricao = @desc, ConferidoPorMembroId = @por, ConferidoEm = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (CongregacaoId, Transmite, PlacaAvisoInstaladaEm, AreaCegaSituacao, AreaCegaDescricao, ConferidoPorMembroId) VALUES (@c, @t, @placa, @area, @desc, @por);`);
  await registrarAuditoria({ tabela: "CongregacaoTransmissao", registroId: x.congregacaoId, acao: "TRANSMISSAO_REGISTRADA", usuarioId: por, dadosDepois: x });
  const av = canais.avaliarTransmissao({ transmite: x.transmite, placaAvisoInstaladaEm: x.placaAvisoInstaladaEm, areaCegaSituacao: x.areaCegaSituacao });
  return { sucesso: true, situacao: av.situacao, pendencias: av.pendencias, mensagem: av.situacao === "CONFORME" ? "Registrado: a congregação está em conformidade com o Art. 160, §2º." : av.situacao === "NAO_SE_APLICA" ? "Registrado: a congregação não transmite os cultos." : "Registrado, com pendências a resolver." };
}

// ---------------------------------------------------------------
// Cobertura e resumo (o painel da Secretaria)
// ---------------------------------------------------------------

async function montarCobertura(pool, ctx, { hoje = hojeBrasilia(), filtrarCanal = () => true, filtrarCongregacao = () => true } = {}) {
  // Os contadores de ocorrências e de trocas pendentes vêm POR CANAL e só somam os canais que quem pede alcança (filtrarCanal): antes eram totais da igreja inteira,
  // e um gestor local via o número de ocorrências abertas de canais que não são dele. Inativos entram na conta (como antes), por isso a lista aqui é a completa.
  const [todosCanais, st, confDias, transmissao, ocAbertas, trocas] = await Promise.all([
    carregarCanais(pool, ctx, { incluirInativos: true }),
    carregarEstadoDosCanais(pool, { hoje }),
    lerPrazoDias(pool, "CANAIS_CONFERENCIA_DIAS", CONFERENCIA_DIAS_PADRAO),
    listarTransmissao(pool, ctx),
    pool.request().query(`SELECT CanalId, COUNT(*) AS abertas, SUM(CASE WHEN PrazoRemocaoEm < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS vencidas FROM CanalOcorrencias WHERE Status = 'ABERTA' GROUP BY CanalId`),
    pool.request().query(`SELECT CanalId, COUNT(*) AS abertas, SUM(CASE WHEN PrazoEm < CAST(SYSUTCDATETIME() AS DATE) THEN 1 ELSE 0 END) AS vencidas FROM CanalTrocasCredencial WHERE ResolvidaEm IS NULL GROUP BY CanalId`)
  ]);
  const lista = todosCanais.filter(c => c.ativo);
  const idsAlcancados = new Set(todosCanais.filter(filtrarCanal).map(c => c.canalId));
  const somar = (linhas) => linhas.filter(l => idsAlcancados.has(l.CanalId))
    .reduce((s, l) => ({ abertas: s.abertas + (l.abertas || 0), vencidas: s.vencidas + (l.vencidas || 0) }), { abertas: 0, vencidas: 0 });
  const visiveis = lista.filter(filtrarCanal);
  const avaliados = visiveis.map(c => {
    const e = st.obter(c.canalId);
    const conf = conformidadeDe(c, e, { hoje, conferenciaDias: confDias });
    return { ...c, situacao: conf.situacao, pendencias: conf.pendencias, administradoresAtivos: e.administradores.length };
  });
  const congregacoes = transmissao.filter(t => filtrarCongregacao(t.congregacaoId)).map(t => {
    const locais = avaliados.filter(c => c.escopo === "CONGREGACAO" && c.congregacaoId === t.congregacaoId && c.categoria !== "GRUPO_FOCADO");
    return { ...t, canaisProprios: locais.length, semCanal: locais.length === 0 };
  });
  const termosPendentes = avaliados.reduce((s, c) => s + (st.obter(c.canalId).administradores.filter(a => Number(a.termoVersaoAceita) !== canais.TERMO_VERSAO).length), 0);
  const oc = somar(ocAbertas.recordset);
  const tr = somar(trocas.recordset);
  return {
    resumo: {
      canaisAtivos: avaliados.length,
      regulares: avaliados.filter(c => c.situacao === "REGULAR").length,
      atencao: avaliados.filter(c => c.situacao === "ATENCAO").length,
      irregulares: avaliados.filter(c => c.situacao === "IRREGULAR").length,
      cadastrosIncompletos: avaliados.filter(c => c.cadastroIncompleto).length,
      semAdministrador: avaliados.filter(c => c.pendencias.some(p => p.codigo === "SEM_ADMINISTRADOR")).length,
      menoresIrregulares: avaliados.filter(c => c.pendencias.some(p => canais.CODIGOS_PENDENCIA_MENORES.includes(p.codigo))).length,
      termosPendentes,
      ocorrenciasAbertas: oc.abertas, ocorrenciasVencidas: oc.vencidas,
      trocasPendentes: tr.abertas, trocasVencidas: tr.vencidas,
      congregacoesSemCanal: congregacoes.filter(c => c.semCanal).length,
      transmissaoPendente: congregacoes.filter(c => c.situacao === "PENDENTE" || c.situacao === "NAO_INFORMADA").length
    },
    canaisComPendencia: avaliados.filter(c => c.situacao !== "REGULAR").sort((a, b) => (a.situacao === "IRREGULAR" ? 0 : 1) - (b.situacao === "IRREGULAR" ? 0 : 1) || a.nome.localeCompare(b.nome, "pt-BR"))
      .map(c => ({ canalId: c.canalId, nome: c.nome, rotuloPlataforma: c.rotuloPlataforma, rotuloEscopo: c.rotuloEscopo, situacao: c.situacao, pendencias: c.pendencias })),
    congregacoes
  };
}

// ---------------------------------------------------------------
// Para o Abandono Digital e para o site
// ---------------------------------------------------------------

// `comIdentificador`: o número/e-mail do canal só vai para quem trabalha com o Abandono Digital ou com os canais (a rota decide); os demais veem só o nome.
async function listarParaContato(pool, ctx, { comIdentificador = false } = {}) {
  return (await carregarCanais(pool, ctx, { incluirInativos: false })).filter(c => c.contaParaAbandono)
    .map(c => ({
      canalId: c.canalId, nome: c.nome, rotuloPlataforma: c.rotuloPlataforma,
      ...(comIdentificador ? { identificador: c.identificador } : {}),
      cadastroIncompleto: c.cadastroIncompleto
    }));
}

// O que o SITE pode mostrar: só canal ativo, marcado como público, com identificador. Nada interno.
async function canaisPublicos(pool, ctx) {
  const lista = await carregarCanais(pool, ctx, { incluirInativos: false });
  const ordemEscopo = { CAMPO: 0, AREA: 1, DEPARTAMENTO: 2, CONGREGACAO: 3 };
  return lista.filter(c => c.publicoNoSite && !c.incluiMenores && c.plataforma && c.identificador && c.categoria !== "GRUPO_FOCADO")
    .sort((a, b) => ordemEscopo[a.escopo] - ordemEscopo[b.escopo] || a.nome.localeCompare(b.nome, "pt-BR"))
    .map(c => ({
      id: c.canalId, nome: c.nome, plataforma: c.plataforma, rotuloPlataforma: c.rotuloPlataforma, categoria: c.categoria,
      identificador: c.identificador, link: c.link, escopo: c.escopo, rotuloEscopo: c.rotuloEscopo,
      congregacaoNome: c.congregacaoNome, areaNome: c.areaNome, departamentoNome: c.departamentoNome, descricao: c.descricao
    }));
}

// ---------------------------------------------------------------
// Fatos para o motor de notificações (vB.2)
// ---------------------------------------------------------------

const formatarDataHora = (v) => new Date(emMs(v)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const mesIndice = (hoje) => (Number(hoje.slice(0, 4)) - 2026) * 12 + Number(hoje.slice(5, 7));

// Prazo de 24 h vencido sem a remoção: avisa quem administra E a gestão.
async function detectarOcorrenciasVencidas(pool) {
  const r = await pool.request().query(`
    SELECT o.OcorrenciaId, o.CanalId, o.Categoria, o.PrazoRemocaoEm, c.Nome AS CanalNome
    FROM CanalOcorrencias o JOIN CanaisOficiaisComunicacao c ON c.CanalId = o.CanalId WHERE o.Status = 'ABERTA' AND o.PrazoRemocaoEm < SYSUTCDATETIME()`);
  if (r.recordset.length === 0) return [];
  const gestao = await gestoresDeCanais(pool);
  const fatos = [];
  for (const o of r.recordset) {
    const admins = await administradoresAtivosDoCanal(pool, o.CanalId);
    fatos.push({
      referenciaId: o.OcorrenciaId, destinatarios: [...admins, ...gestao],
      fatoGerador: `O prazo de 24 horas venceu em ${formatarDataHora(o.PrazoRemocaoEm)} e o conteúdo (${(canais.CATEGORIAS_OCORRENCIA[o.Categoria] || {}).rotulo || o.Categoria}) continua no canal “${o.CanalNome}”: a Igreja está corresponsável (Art. 160, §1º, II). Remova e registre a prova no sistema.`
    });
  }
  return fatos;
}

// Designado que ainda não aceitou o termo vigente.
async function detectarTermosPendentes(pool) {
  const r = await pool.request().input("v", sql.Int, canais.TERMO_VERSAO).query(`
    SELECT a.AdminId, a.MembroId, m.Nome, m.Email, c.Nome AS CanalNome
    FROM CanalAdministradores a JOIN MembroReferencia m ON m.MembroId = a.MembroId JOIN CanaisOficiaisComunicacao c ON c.CanalId = a.CanalId
    WHERE a.EncerradoEm IS NULL AND c.Ativo = 1 AND (a.TermoVersaoAceita IS NULL OR a.TermoVersaoAceita <> @v)`);
  return r.recordset.map(x => ({
    referenciaId: x.AdminId * 1000 + canais.TERMO_VERSAO, destinatarios: [{ membroId: x.MembroId, nome: x.Nome, email: x.Email }],
    fatoGerador: `Você é administrador do canal “${x.CanalNome}” mas ainda não aceitou o Termo de Dever de Moderação vigente. Aceite em Meu Painel → Canais (Regimento Art. 160, §1º, I).`
  }));
}

// Pendência de troca de senha/acesso: um aviso quando abre e outro quando vence o prazo.
async function detectarTrocasCredencial(pool, { hoje = hojeBrasilia() } = {}) {
  const r = await pool.request().query(`
    SELECT t.TrocaId, t.Motivo, t.PrazoEm, c.Nome AS CanalNome, c.Plataforma
    FROM CanalTrocasCredencial t JOIN CanaisOficiaisComunicacao c ON c.CanalId = t.CanalId WHERE t.ResolvidaEm IS NULL AND c.Ativo = 1`);
  const fatos = [];
  for (const t of r.recordset) {
    const prazo = isoData(t.PrazoEm);
    const acao = canais.acaoDaTroca({ plataforma: t.Plataforma });
    fatos.push({ referenciaId: t.TrocaId * 2, fatoGerador: `${canais.MOTIVOS_TROCA[t.Motivo]}: ${acao} — canal “${t.CanalNome}”, até ${prazo.split("-").reverse().join("/")}.` });
    if (prazo < hoje) fatos.push({ referenciaId: t.TrocaId * 2 + 1, fatoGerador: `PRAZO VENCIDO (${prazo.split("-").reverse().join("/")}): ${acao} — canal “${t.CanalNome}”. Senha em mãos de quem saiu é risco para a Igreja (Art. 160, §4º, I).` });
  }
  return fatos;
}

// Canal que exige administrador e não tem nenhum com o termo vigente aceito (depois de uma tolerância).
async function detectarSemAdministrador(pool, { hoje = hojeBrasilia() } = {}) {
  const [lista, st] = await Promise.all([
    pool.request().query(`SELECT CanalId, Nome, Plataforma, Categoria, RegistradoEm FROM CanaisOficiaisComunicacao WHERE Ativo = 1 AND Plataforma IS NOT NULL`),
    carregarEstadoDosCanais(pool)
  ]);
  const idx = mesIndice(hoje) % 1000;
  const fatos = [];
  for (const c of lista.recordset) {
    const exige = canais.categoriaExigeGrupo(c.Categoria) || canais.exigeCustodia({ plataforma: c.Plataforma });
    if (!exige) continue;
    const idadeDias = canais.diasEntreIso(isoInstante(c.RegistradoEm).slice(0, 10), hoje);
    if (idadeDias < DIAS_SEM_ADMINISTRADOR_TOLERADOS) continue;
    const comTermo = st.obter(c.CanalId).administradores.filter(a => Number(a.termoVersaoAceita) === canais.TERMO_VERSAO);
    if (comTermo.length > 0) continue;
    fatos.push({ referenciaId: c.CanalId * 1000 + idx, fatoGerador: `O canal “${c.Nome}” não tem nenhum administrador com o Termo de Dever de Moderação aceito: ninguém responde por ele (Art. 160, §1º, I).` });
  }
  return fatos;
}

// v7.7 — canal ATIVO que inclui crianças e adolescentes e está fora da regra (menos de dois administradores adultos com o Termo aceito, administrador sem habilitação para
// servir com menores, ou sem responsável com acesso). Um aviso por MÊS por canal enquanto durar, a quem administra o canal e à gestão de canais (destinatários sem repetição:
// quem é as duas coisas recebe uma vez). O texto traz só o que está errado, em português simples — nunca o motivo da falta de habilitação de ninguém. A referência é
// canal * 10000 + o número do mês: dentro do INT do banco para qualquer canal que a igreja venha a ter.
async function detectarCanaisComMenoresIrregulares(pool, { hoje = hojeBrasilia() } = {}) {
  const lista = (await pool.request().query(`SELECT CanalId, Nome, ResponsavelAcessoMembroId FROM CanaisOficiaisComunicacao WHERE Ativo = 1 AND IncluiMenores = 1`)).recordset;
  if (lista.length === 0) return [];
  const st = await carregarEstadoDosCanais(pool, { hoje });
  const idx = mesIndice(hoje) % 10000;
  let gestao = null;
  const fatos = [];
  for (const c of lista) {
    const pend = canais.pendenciasDeMenores({ incluiMenores: true, responsavelAcessoMembroId: c.ResponsavelAcessoMembroId || null }, st.obter(c.CanalId));
    if (pend.length === 0) continue;
    gestao = gestao || await gestoresDeCanais(pool);
    const admins = await administradoresAtivosDoCanal(pool, c.CanalId);
    const vistos = new Set();
    const destinatarios = [...admins, ...gestao].filter(d => d && d.membroId && !vistos.has(d.membroId) && vistos.add(d.membroId));
    fatos.push({
      referenciaId: c.CanalId * 10000 + idx, destinatarios,
      fatoGerador: mm.textoCanalIrregular({ canalNome: c.Nome, problemas: pend.map(p => p.resumo) })
    });
  }
  return fatos;
}

// Conferência vencida (ou nunca feita, depois de uma semana de cadastro): um aviso por semestre.
async function detectarConferenciasVencidas(pool, { hoje = hojeBrasilia() } = {}) {
  const [lista, st, confDias] = await Promise.all([
    pool.request().query(`SELECT CanalId, Nome, RegistradoEm FROM CanaisOficiaisComunicacao WHERE Ativo = 1 AND Plataforma IS NOT NULL`),
    carregarEstadoDosCanais(pool),
    lerPrazoDias(pool, "CANAIS_CONFERENCIA_DIAS", CONFERENCIA_DIAS_PADRAO)
  ]);
  const semestre = ((Number(hoje.slice(0, 4)) - 2026) * 2 + (Number(hoje.slice(5, 7)) > 6 ? 1 : 0)) % 1000;
  const fatos = [];
  for (const c of lista.recordset) {
    const conf = st.obter(c.CanalId).ultimaConferencia;
    const ref = conf ? String(conf.em).slice(0, 10) : isoInstante(c.RegistradoEm).slice(0, 10);
    const dias = canais.diasEntreIso(ref, hoje);
    if (conf ? dias <= confDias : dias <= 7) continue;
    fatos.push({
      referenciaId: c.CanalId * 1000 + semestre,
      fatoGerador: conf ? `O canal “${c.Nome}” foi conferido pela última vez há ${dias} dias (limite: ${confDias}). Faça a conferência de conformidade.` : `O canal “${c.Nome}” ainda não passou por nenhuma conferência de conformidade.`
    });
  }
  return fatos;
}

module.exports = {
  LIMITE_LISTA, emMs, isoInstante, carregarContexto, lerPrazoDias,
  mapearCanal, carregarCanais, buscarCanal, listarCanais, detalharCanal, carregarEstadoDosCanais,
  buscarContatosPessoais, criarCanal, atualizarCanal, definirResponsavelAcesso, desativarCanal, reativarCanal,
  notificarAgora, administradoresAtivosDoCanal, gestoresDeCanais,
  designarAdministrador, encerrarAdministrador, aceitarTermo, meusCanais, papeisNoCanal,
  carregarOcorrencias, abrirOcorrencia, registrarRemocao, marcarImprocedente, registrarAdvertencia, buscarOcorrenciaBruta, mapearOcorrencia,
  gerarTroca, gerarTrocaManual, listarTrocas, resolverTroca, sincronizarSucessoes,
  registrarConferencia, listarTransmissao, salvarTransmissao, montarCobertura,
  listarParaContato, canaisPublicos,
  detectarOcorrenciasVencidas, detectarTermosPendentes, detectarTrocasCredencial, detectarSemAdministrador, detectarConferenciasVencidas, detectarCanaisComMenoresIrregulares
};
