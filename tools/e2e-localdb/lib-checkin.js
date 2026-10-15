// lib-checkin.js — ajudantes dos roteiros do check-in infantil da v7.10 (e2e-18 a e2e-22). Requer: node -r shim-mssql.js
// O que há aqui: o cenário (congregações, equipes e quem faz o quê), a criação de serviço "agora" (horário de Brasília = UTC menos 3 h, gravado SEM fuso), de criança e de
// responsável, as chamadas ao handler real (com os registros de log CAPTURADOS, para provar que o código nunca vai para log), o retrato das tabelas do check-in e a limpeza entre roteiros.
const fs = require("fs");
const L = require("./lib");
const { q, um, escalar, GERAL, LIDER, PIN, sessao, IP_PUBLICO, API, path } = L;

const CK = require(path.join(API, "GestaoCheckinInfantil/index.js"));
const CONSENT = require(path.join(API, "GestaoConsentimentoMenor/index.js"));
const VOLUNT = require(path.join(API, "GestaoVoluntariado/index.js"));
const LGPD = require(path.join(API, "MeusDadosLGPD/index.js"));
const AGENDADOR = require(path.join(API, "NotificacoesAgendador/index.js"));
const db = require(path.join(API, "shared/checkinInfantilDb.js"));
const ckRegra = require(path.join(API, "shared/checkinInfantil.js"));
const hoje = L.hojeBr();

const HAB = ["habilitacao_voluntarios"];
const TABELAS_CK = ["CheckinInfantilRegistros", "CheckinInfantilEventos", "CheckinInfantilVoluntarios", "CheckinInfantilAutorizados", "CheckinInfantilAutorizadosVisita", "CheckinInfantilSaude", "CheckinInfantilSegundasVias"];

// O cenário gravado pelo e2e-18 (cenario-checkin.json) e, na falta dele, o que dá para ler do banco pelos nomes (a base "cenario-protecao" tem as equipes da v7.7).
function cenario() {
  const f = path.join(__dirname, "cenario-checkin.json");
  if (!fs.existsSync(f)) throw new Error("cenario-checkin.json não existe: rode e2e-18-checkin-setup.js (BASE=cenario-checkin bash rodar.sh roteiro ...)");
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

// ---------------------------------------------------------------- sessões
// Voluntário comum e responsável: sessão de PIN (não é liderança). A liderança: senha + fator recente (chave de acesso), como o Meu Painel emite.
const pin = (id) => PIN(id);
const gestao = (membroId, congregacoes) => LIDER(membroId, HAB, congregacoes);
const geral = (membroId = 1001) => GERAL(membroId, HAB);
const semFator = (membroId, congregacoes) => sessao(membroId, { via: "SENHA", nivel: congregacoes === "TODAS" ? "GLOBAL" : "CONGREGACAO", escopoCongregacoes: congregacoes, permissoes: HAB });

// ---------------------------------------------------------------- chamadas ao handler real, com o log capturado
const LOGS = [];
const erroOriginal = console.error;
const erroFatal = (...a) => erroOriginal.apply(console, a);                 // o catch final dos roteiros usa este: console.error passa a ser capturado abaixo
const textoLog = (x) => (x instanceof Error ? `${x.message}\n${x.stack}` : typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })());
const registrar = (...a) => { LOGS.push(a.map(textoLog).join(" ")); };
for (const m of ["error", "warn", "info", "debug"]) console[m] = (...a) => registrar(...a);       // o console.log fica livre: é por ele que ok()/fim() mostram as falhas

async function chamarH(handler, { acao, metodo = "GET", query = {}, corpo, token, headers = {}, ligado = {} } = {}) {
  const log = Object.assign(registrar, { error: registrar, info: registrar, warn: registrar, verbose: registrar });
  const ctx = { bindingData: { acao, ...ligado }, log };
  const qs = {};
  for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);
  const h = { ...headers }; if (token) h["x-auth-token"] = token;
  await handler(ctx, { method: metodo, query: qs, body: corpo, headers: h });
  return ctx.res || { status: 0, body: null };
}
const ckGet = (acao, token, query) => chamarH(CK, { acao, metodo: "GET", token, query });
const ckPost = (acao, token, corpo, headers) => chamarH(CK, { acao, metodo: "POST", token, corpo, headers });
const consGet = (acao, token, query) => chamarH(CONSENT, { acao, metodo: "GET", token, query });
const consPost = (acao, token, corpo, headers = IP_PUBLICO) => chamarH(CONSENT, { acao, metodo: "POST", token, corpo, headers });
const volPost = (acao, token, corpo) => chamarH(VOLUNT, { acao, metodo: "POST", token, corpo });
const meusDados = (matricula, token) => chamarH(LGPD, { acao: undefined, metodo: "GET", token, ligado: { matricula: String(matricula) } });
// A rotina agendada completa (todas as retenções e detectores), com o segredo de rotina do teste.
async function rotinaDiaria() {
  process.env.CRON_SECRET = process.env.CRON_SECRET || "segredo-cron-so-do-teste-e2e";
  return chamarH(AGENDADOR, { acao: undefined, metodo: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET }, corpo: {} });
}

// ---------------------------------------------------------------- dados do cenário
const nascimentoParaIdade = (idade, diasAlemDoAniversario = 40) => {
  const [a, m, d] = hoje.split("-").map(Number);
  const dt = new Date(Date.UTC(a - idade, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - diasAlemDoAniversario);
  return dt.toISOString().slice(0, 10);
};
const iso = (s) => new Date(`${s}T00:00:00Z`);

async function membro({ id, nome, nasc, cong, telefone = null, email = null, situacao = "EM_COMUNHAO" }) {
  if (await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId = @id", { id })) return id;
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Telefone, Email) VALUES (@id, @n, @c, 'ATIVO', @si, @nasc, @adm, @tel, @em)",
    { id, n: nome, c: cong, si: situacao, nasc: nasc ? iso(nasc) : null, adm: iso("2016-01-01"), tel: telefone, em: email || `p${id}@exemplo.org` });
  return id;
}
const adulto = (id, nome, cong, extra = {}) => membro({ id, nome, nasc: "1985-05-05", cong, telefone: `11 9${String(id).padStart(4, "0")}-${String(1000 + (id % 9000))}`, ...extra });
// Criança membro com a idade pedida (completa há 40 dias, para a idade não virar no meio do roteiro). `resp`: [[matriculaDoResponsavel, vinculo]] (já cadastrados como adultos).
async function crianca({ id, nome, idade, cong, resp = [] }) {
  await membro({ id, nome, nasc: nascimentoParaIdade(idade), cong });
  for (const [r, vinculo] of resp) await responsavel(id, r, vinculo || "MAE");
  return id;
}
async function responsavel(menorId, respId, vinculo = "MAE", por = 1001) {
  await q("INSERT INTO VoluntariadoResponsaveis (MenorMembroId, ResponsavelMembroId, Vinculo, Documento, RegistradoPorMembroId) VALUES (@m, @r, @v, @d, @p)",
    { m: menorId, r: respId, v: vinculo, d: "RG conferido pela Secretaria (teste)", p: por });
  return (await escalar("SELECT MAX(ResponsavelId) FROM VoluntariadoResponsaveis WHERE MenorMembroId = @m AND ResponsavelMembroId = @r", { m: menorId, r: respId }));
}
// Serviço publicado em "agora de Brasília" + `minutos` (a janela do check-in é de 60 minutos antes a 5 horas depois do horário).
async function servico(cong, { minutos = 0, status = "PUBLICADA", desc = "Culto E2E check-in" } = {}) {
  return (await q("INSERT INTO EscalasServicos (CongregacaoId, DataHora, Descricao, Status, PublicadaEm) VALUES (@c, DATEADD(MINUTE, @m, DATEADD(HOUR, -3, SYSUTCDATETIME())), @d, @s, CASE WHEN @s = 'PUBLICADA' THEN SYSUTCDATETIME() END); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id",
    { c: cong, m: minutos, d: desc, s: status }))[0].id;
}
const alocar = async (sv, eq, membros, status = "CONFIRMADO") => { for (const m of membros) await q("INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status) VALUES (@s, @e, @m, @st)", { s: sv, e: eq, m, st: status }); };
// Serviço agora + escala + todos entram na sala (pelo handler real). Devolve { sv }.
async function abrirSala(cong, eq, voluntarios, opcoes = {}) {
  const sv = await servico(cong, opcoes);
  await alocar(sv, eq, voluntarios);
  for (const v of voluntarios) {
    const r = await ckPost("entrar-na-sala", pin(v), { servicoId: sv, equipeId: eq });
    if (![200, 201].includes(r.status)) throw new Error(`abrirSala: ${v} não entrou (${r.status} ${JSON.stringify(r.body)})`);
  }
  return sv;
}
const visitante = (nome, idade, extra = {}) => ({ visitante: { nome, nascimento: nascimentoParaIdade(idade), ...extra } });
const trouxeLivre = (nome = "Tia Visitante Silva", extra = {}) => ({ nome, parentesco: "TIO", documento: "RG", contato: "(11) 98888-7777", ...extra });
const checkin = (token, sv, eq, criancas, trouxe, extra = {}) => ckPost("checkin", token, { servicoId: sv, equipeId: eq, criancas, trouxe, ...extra });
const codigosDe = (r) => ((r.body && r.body.etiquetas) || []).map((e) => e.etiqueta.codigo);
const registrosDe = (r) => ((r.body && r.body.etiquetas) || []).map((e) => e.registroId);
// Um código bem formado que NÃO é o da criança (errado de propósito).
const codigoErradoDe = (certo) => { const alfa = ckRegra.ALFABETO_CODIGO; let c; do { c = Array.from({ length: 6 }, () => alfa[Math.floor(Math.random() * alfa.length)]).join(""); } while (c === certo); return c; };

// O texto de todas as linhas de todas as tabelas dadas (para procurar o que NÃO pode estar lá).
async function textoDasTabelas(extra = ["AuditLog", "Notificacoes"]) {
  let s = "";
  for (const t of [...TABELAS_CK, ...extra]) s += JSON.stringify(await q(`SELECT * FROM ${t}`));
  return s;
}
// Retrato do banco do check-in (contagem + soma de verificação): chamada recusada nunca pode mudar nada.
const TABELAS_RETRATO = [...TABELAS_CK, "Notificacoes", "AuditLog", "EscalasAlocacoes", "MinisterioMenoresConsentimentos", "VoluntariadoResponsaveis"];
async function retratoCk() {
  const p = [];
  for (const n of TABELAS_RETRATO) p.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${n}`)));
  return p.join("|");
}

// Lixo em cada campo de um corpo: nunca 500, status esperado, sem texto interno e, se recusado (>= 400), o banco do check-in fica IGUAL.
const LIXO = L.LIXO;
async function fuzzar(ok, rotulo, fazer, base, campos, aceitos = [200, 201, 400, 401, 403, 404, 409, 422, 428, 429]) {
  let chamadas = 0; const quebras = [], mudancas = [];
  for (const campo of campos) for (const lixo of LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retratoCk();
    const r = await fazer(corpo);
    chamadas++;
    const texto = r.body && typeof r.body === "object" ? JSON.stringify(r.body) : "";
    if (r.status === 500 || !aceitos.includes(r.status)) quebras.push(`${rotulo}.${campo} = ${JSON.stringify(lixo) === undefined ? "undefined" : JSON.stringify(lixo).slice(0, 40)} -> ${r.status} ${texto.slice(0, 120)}`);
    else if (r.status >= 400 && (await retratoCk()) !== antes) mudancas.push(`${rotulo}.${campo} = ${JSON.stringify(lixo) === undefined ? "undefined" : JSON.stringify(lixo).slice(0, 40)} (${r.status}) mexeu no banco`);
    if (/SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules|RAISERROR|CodigoHash/i.test(texto)) quebras.push(`${rotulo}.${campo} vazou texto interno: ${texto.slice(0, 100)}`);
  }
  ok(quebras.length === 0, `${rotulo}: ${chamadas} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 5));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 5));
}

// Fecha, por SQL, tudo o que um roteiro anterior deixou aberto (criança na sala, voluntário presente, segunda via esperando): cada roteiro parte de uma sala vazia.
async function limpar() {
  await q(`UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA', RetiradoEm = SYSUTCDATETIME(), RetiradoTipo = 'OUTRO', RetiradoNome = N'limpeza entre roteiros', RetiradoMembroId = NULL, RetiradoPorOperadorId = 1001, Divergente = 0
           WHERE Situacao <> 'RETIRADA'`);
  await q("UPDATE CheckinInfantilVoluntarios SET SaiuEm = SYSUTCDATETIME() WHERE SaiuEm IS NULL");
  await q("UPDATE CheckinInfantilSegundasVias SET CanceladaEm = SYSUTCDATETIME() WHERE ConfirmadaEm IS NULL AND CanceladaEm IS NULL");
}
// Torna um voluntário inapto (a habilitação venceu ontem) ou apto de novo (vale mais 500 dias): a aptidão é calculada na leitura.
const derrubarAptidao = (id) => q("UPDATE VoluntariosHabilitacao SET AptoValidoAte = DATEADD(DAY, -1, CAST(SYSUTCDATETIME() AS DATE)) WHERE MembroId = @m", { m: id });
const restaurarAptidao = (id) => q("UPDATE VoluntariosHabilitacao SET AptoValidoAte = DATEADD(DAY, 500, CAST(SYSUTCDATETIME() AS DATE)) WHERE MembroId = @m", { m: id });
const reg = (id) => um("SELECT * FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: id });
const eventos = (id) => q("SELECT Tipo, AtorMembroId, Detalhe FROM CheckinInfantilEventos WHERE RegistroId = @r ORDER BY EventoId", { r: id });
const notif = (regra) => q("SELECT NotificacaoId, DestinatarioMembroId d, ReferenciaId r, ReferenciaTabela t, Mensagem m FROM Notificacoes WHERE RegraChave = @r ORDER BY NotificacaoId", { r: regra });
const auditoria = (acao) => q("SELECT RegistroId, UsuarioId, DadosDepois FROM AuditLog WHERE Acao = @a ORDER BY AuditId", { a: acao });
const falha = async (texto, params) => { try { await q(texto, params); return null; } catch (e) { return String(e.message || e); } };

module.exports = {
  L, q, um, escalar, hoje, HAB, TABELAS_CK, cenario, pin, gestao, geral, semFator, LOGS, erroFatal, chamarH, ckGet, ckPost, consGet, consPost, volPost, meusDados, rotinaDiaria, CK, CONSENT, VOLUNT, db, ckRegra,
  nascimentoParaIdade, membro, adulto, crianca, responsavel, servico, alocar, abrirSala, visitante, trouxeLivre, checkin, codigosDe, registrosDe, codigoErradoDe,
  textoDasTabelas, retratoCk, fuzzar, limpar, derrubarAptidao, restaurarAptidao, reg, eventos, notif, auditoria, falha, IP_PUBLICO
};
