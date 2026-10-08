// lib.js — ajudantes do roteiro ponta a ponta (descartável). Requer: node -r shim-mssql.js
const path = require("path");
const API = path.resolve(__dirname, "..", "..", "api");
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "segredo-so-do-teste-e2e-" + "x".repeat(24);
const sql = require("mssql");
const auth = require(path.join(API, "shared/auth.js"));

let pool;
async function obterPool() { if (!pool) pool = await sql.connect("x"); return pool; }

// Consulta direta (para montar cenário e para conferir o que ficou no banco).
async function q(texto, params = {}) {
  const p = await obterPool();
  const r = p.request();
  for (const [nome, v] of Object.entries(params)) {
    if (v instanceof Date) r.input(nome, sql.DateTime2, v);
    else if (typeof v === "number") r.input(nome, sql.Int, v);
    else if (typeof v === "boolean") r.input(nome, sql.Bit, v);
    else r.input(nome, sql.NVarChar(sql.MAX), v);
  }
  return (await r.query(texto)).recordset;
}
const um = async (t, p) => (await q(t, p))[0];
const escalar = async (t, p) => { const l = await um(t, p); return l ? Object.values(l)[0] : null; };

let total = 0, falhas = 0;
const falhasLista = [];
function ok(cond, descricao, detalhe) {
  total++;
  if (!cond) { falhas++; falhasLista.push(descricao); console.log(`  ✗ ${descricao}${detalhe !== undefined ? ` — ${typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe)}` : ""}`); }
  else if (process.env.E2E_LISTA) console.log(`  ✓ ${descricao}`);
}
function fim(rotulo) {
  console.log(`\n${rotulo}: ${total - falhas}/${total} verificações ok${falhas ? ` — ${falhas} FALHA(S)` : ""}`);
  if (falhas) { console.log("Falhas:"); for (const f of falhasLista) console.log(`  - ${f}`); }
  if (shimEncerrar()) { /* ok */ }
  process.exitCode = falhas ? 1 : 0;
}
function shimEncerrar() { try { sql.__encerrar(); return true; } catch { return false; } }

const contexto = (ligado) => ({ bindingData: ligado || {}, log: { error() { }, info() { }, warn() { }, verbose() { } } });
// Chama o handler REAL como o HTTP faria: a query string chega SEMPRE em texto.
async function chamar(handler, { acao, metodo = "GET", query = {}, corpo, token, headers = {} } = {}) {
  const ctx = contexto({ acao });
  const qs = {};
  for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);
  const h = { ...headers }; if (token) h["x-auth-token"] = token;
  await handler(ctx, { method: metodo, query: qs, body: corpo, headers: h });
  return ctx.res || { status: 0, body: null };
}
const GET = (h, acao, token, query) => chamar(h, { acao, metodo: "GET", token, query });
// O hash do Termo que a TELA mostraria: vem de Meu Painel (termoParaAceitar.hash), do mesmo jeito que o navegador o lê.
async function termoHashDo(h, token, vinculoId) {
  const r = await chamar(h, { acao: "meu-painel", metodo: "GET", token });
  const v = ((r.body && r.body.vinculos) || []).find((x) => Number(x.vinculoId) === Number(vinculoId));
  return v && v.termoParaAceitar ? v.termoParaAceitar.hash : undefined;
}
// No aceite digital, o roteiro envia o hash que a tela mostrou, salvo se o corpo já trouxer o seu (para testar o hash velho ou forjado).
const POST = async (h, acao, token, corpo, headers) => {
  if (acao === "aceitar-termo" && corpo && typeof corpo === "object" && !("termoHash" in corpo) && corpo.vinculoId != null) {
    const hash = await termoHashDo(h, token, corpo.vinculoId);
    if (hash) corpo = { ...corpo, termoHash: hash };
  }
  return chamar(h, { acao, metodo: "POST", token, corpo, headers });
};

// Sessões. `geral`: papel GLOBAL com escopo de todas as congregações (concessão única).
const sessao = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const GERAL = (membroId, permissoes) => sessao(membroId, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const LIDER = (membroId, permissoes, escopo, nivel = "CONGREGACAO") => sessao(membroId, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel, escopoCongregacoes: escopo, permissoes });
const PIN = (membroId) => sessao(membroId, { via: "PIN" });

const IP_PUBLICO = { "x-forwarded-for": "9.9.9.9, 177.8.9.10:443, 10.0.0.1:80" };
const hojeBr = () => require(path.join(API, "shared/dataBrasilia.js")).hojeBrasilia();

// Lixo de toda espécie para tentar quebrar qualquer campo: tipos errados, texto enorme, tag, SQL, nulo, controle, datas impossíveis.
const LIXO = [null, undefined, true, false, 0, -1, 1.5, 2 ** 40, "", " ", "abc", "0x10", "1e1", [], [1], {}, { a: 1 }, "x".repeat(5000), "<img src=x onerror=alert(1)>", "'; DROP TABLE SetoresTecnicos; --", "' OR 1=1 --", "\u0000", "a\u0000b", "😀", "‮evil", "0001-01-01", "9999-12-31", "2026-02-30", "2026-13-45", "20261008", "NaN"];
// Um retrato do estado das tabelas dos Setores Técnicos e da vistoria (contagem + soma de verificação): se uma chamada recusada mexeu em algo, muda.
async function retrato() {
  const t = ['SetoresTecnicos', 'SetoresTecnicosMembros', 'SetoresTecnicosAdesoes', 'SetoresTecnicosIntervencoes', 'VistoriasAntecedentes', 'VistoriasDocumentos', 'VistoriasAnulacoes', 'Notificacoes', 'AuditLog'];
  const partes = [];
  for (const n of t) partes.push(JSON.stringify(await um('SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ' + n)));
  return partes.join('|');
}
// Para cada campo e cada lixo: a chamada nunca pode dar 500, a resposta tem de ser de um status esperado e, se foi recusada (>= 400), o banco fica IGUAL.
async function fuzz(rotulo, handler, { acao, metodo = 'POST', token, base, campos, aceitos = [200, 201, 400, 401, 403, 404, 422, 428], chamarCom }) {
  let chamadas = 0, quebras = [], mudancas = [];
  for (const campo of campos) for (const lixo of LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = chamarCom ? await chamarCom(corpo) : (metodo === 'GET' ? await chamar(handler, { acao, metodo, token, query: corpo }) : await chamar(handler, { acao, metodo, token, corpo }));
    chamadas++;
    if (r.status === 500 || !aceitos.includes(r.status)) quebras.push(rotulo + '.' + campo + ' = ' + JSON.stringify(lixo).slice(0, 40) + ' -> ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(rotulo + '.' + campo + ' = ' + JSON.stringify(lixo).slice(0, 40) + ' (' + r.status + ') mexeu no banco');
    if (r.body && typeof r.body === 'object' && /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules/i.test(JSON.stringify(r.body))) quebras.push(rotulo + '.' + campo + ' vazou texto interno: ' + JSON.stringify(r.body).slice(0, 160));
  }
  ok(quebras.length === 0, rotulo + ': ' + chamadas + ' chamadas com lixo, nenhuma 500 nem vazamento', quebras.slice(0, 5));
  ok(mudancas.length === 0, rotulo + ': chamada recusada nunca altera o banco', mudancas.slice(0, 5));
}

module.exports = { termoHashDo, LIXO, retrato, fuzz, API, sql, auth, q, um, escalar, ok, fim, chamar, GET, POST, sessao, GERAL, LIDER, PIN, IP_PUBLICO, hojeBr, obterPool, falhasLista, shimEncerrar, path };
