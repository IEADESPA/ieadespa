// shim-mssql.js — troca o módulo "mssql" por uma ponte para o SQL Server LocalDB (PowerShell + System.Data.SqlClient). Uso: node -r ./shim-mssql.js script.js
// Descartável: não vai para o repositório. O driver Node não conecta no LocalDB (sem TCP) e o msnodesqlv8 não tem binário para esta versão do Node.
const Module = require("module");
const path = require("path");
const { spawn } = require("child_process");
const readline = require("readline");

const PS1 = path.join(__dirname, "ponte.ps1");
let ponte = null;
// A cadeia de conexão padrão é a do LocalDB "psc7" (banco ieadespa_local); outra instância: defina E2E_CS antes de rodar.
if (!process.env.E2E_CS) process.env.E2E_CS = "Server=(localdb)\\psc7;Database=ieadespa_local;Integrated Security=true;Connect Timeout=30";

class Ponte {
  constructor() {
    this.seq = 0;
    this.pendentes = new Map();
    this.pronto = new Promise((resolve, reject) => { this._ok = resolve; this._falha = reject; });
    this.proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PS1], { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stderr.on("data", (d) => { if (process.env.E2E_VERBOSO) process.stderr.write(`[ponte] ${d}`); });
    this.proc.on("exit", (codigo) => { for (const p of this.pendentes.values()) p.reject(new Error(`ponte encerrada (${codigo})`)); this._falha(new Error(`ponte encerrada (${codigo})`)); });
    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on("line", (linha) => {
      let msg;
      try { msg = JSON.parse(linha); } catch { if (process.env.E2E_VERBOSO) console.error("[ponte] linha ilegível:", linha.slice(0, 200)); return; }
      if (msg.pronto) { this._ok(); return; }
      const p = this.pendentes.get(msg.id);
      if (p) { this.pendentes.delete(msg.id); p.resolve(msg); }
    });
  }
  async enviar(pedido) {
    await this.pronto;
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pendentes.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ id, ...pedido }) + "\n");
    });
  }
  encerrar() { try { this.proc.stdin.end(); this.proc.kill(); } catch { /* já morreu */ } }
}
function obterPonte() { if (!ponte) ponte = new Ponte(); return ponte; }

// Tipos: sql.Int, sql.NVarChar(30), sql.Decimal(10, 2)...
const TIPOS = {};
const tipo = (nome) => {
  if (!TIPOS[nome]) { const f = (...args) => ({ __tipo: nome, args }); f.__tipo = nome; f.args = []; TIPOS[nome] = f; }
  return TIPOS[nome];
};
const normalizarTipo = (t) => ({ nome: t.__tipo, args: t.args || [] });

function paraValor(valor, nomeTipo) {
  if (valor === undefined || valor === null) return null;
  if (nomeTipo === "Date" || nomeTipo === "DateTime" || nomeTipo === "DateTime2") return valor instanceof Date ? valor.toISOString() : String(valor);
  if (nomeTipo === "Bit") return valor === true || valor === 1 || valor === "1" || valor === "true";
  if (nomeTipo === "Int" || nomeTipo === "SmallInt" || nomeTipo === "TinyInt" || nomeTipo === "BigInt" || nomeTipo === "Decimal" || nomeTipo === "Float") return Number(valor);
  return String(valor);
}

class ErroSql extends Error { constructor(m, numero) { super(m); this.number = numero; this.code = "EREQUEST"; this.name = "RequestError"; } }

class Request {
  constructor(origem) { this._params = []; this._ouvintes = {}; this._ponte = obterPonte(); this._transacao = origem && origem.__transacao ? origem : null; }
  input(nome, a, b) {
    let t, valor;
    if (b === undefined && typeof a !== "function" && !(a && a.__tipo)) { valor = a; t = { nome: typeof a === "number" ? (Number.isInteger(a) ? "Int" : "Float") : typeof a === "boolean" ? "Bit" : a instanceof Date ? "DateTime2" : "NVarChar", args: [] }; }
    else { t = normalizarTipo(a); valor = b; }
    const p = { nome, tipo: t.nome, valor: paraValor(valor, t.nome) };
    if (t.nome === "NVarChar" || t.nome === "VarChar" || t.nome === "Char" || t.nome === "NChar") p.tam = typeof t.args[0] === "number" ? t.args[0] : -1;
    if (t.nome === "Decimal") { p.prec = t.args[0]; p.escala = t.args[1]; }
    this._params.push(p);
    return this;
  }
  on(evento, fn) { (this._ouvintes[evento] = this._ouvintes[evento] || []).push(fn); return this; }
  async query(texto) {
    const r = await this._ponte.enviar({ op: "query", sql: texto, params: this._params });
    if (!r.ok) throw new ErroSql(r.erro.mensagem, r.erro.numero);
    for (const m of r.mensagens || []) for (const fn of this._ouvintes.info || []) fn({ message: m });
    const recordsets = r.conjuntos.map((c) => {
      const linhas = c.linhas.map((l) => {
        const o = {};
        c.colunas.forEach((nome, i) => { let v = l[i]; if (v != null && c.datas.includes(i)) v = new Date(v); o[nome] = v; });
        return o;
      });
      linhas.columns = c.colunas;
      return linhas;
    });
    return { recordset: recordsets[0] || [], recordsets, rowsAffected: r.afetadas || [] };
  }
}

class Transaction {
  constructor(pool) { this.__transacao = true; this._pool = pool; this._ponte = obterPonte(); }
  async begin() { const r = await this._ponte.enviar({ op: "begin" }); if (!r.ok) throw new ErroSql(r.erro.mensagem, r.erro.numero); }
  async commit() { const r = await this._ponte.enviar({ op: "commit" }); if (!r.ok) throw new ErroSql(r.erro.mensagem, r.erro.numero); }
  async rollback() { const r = await this._ponte.enviar({ op: "rollback" }); if (!r.ok) throw new ErroSql(r.erro.mensagem, r.erro.numero); }
}

const pool = { connected: true, request: () => new Request(null), close: async () => { if (ponte) ponte.encerrar(); ponte = null; }, transaction: () => new Transaction(pool) };
const shim = new Proxy({
  connect: async () => { await obterPonte().pronto; return pool; },
  close: async () => { if (ponte) ponte.encerrar(); ponte = null; },
  Request, Transaction, MAX: -1,
  ConnectionPool: class { constructor() { return pool; } },
  __encerrar: () => { if (ponte) ponte.encerrar(); ponte = null; }
}, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? tipo(prop) : undefined)) });

const original = Module._load;
Module._load = function (pedido, ...resto) {
  if (pedido === "mssql") return shim;
  return original.call(this, pedido, ...resto);
};
module.exports = shim;
process.on("exit", () => { if (ponte) ponte.encerrar(); });
