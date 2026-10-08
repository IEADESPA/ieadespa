// Peças comuns das baterias de teste do site (06/10/2026).
// Lê o ambiente de variáveis (nunca de arquivo, nunca imprime segredo).
function ambiente() {
  const SITE = (process.env.SITE_URL || "https://ieadespa.org.br").replace(/\/$/, "");
  const URL = process.env.DIRECTUS_URL;
  const TOK = process.env.DIRECTUS_ADMIN_TOKEN;
  const PEPPER = process.env.TELEFONE_CHAVE_SEGREDO;
  if (!URL || !TOK) { console.error("DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN são obrigatórios"); process.exit(2); }
  const h = { Authorization: "Bearer " + TOK, "Content-Type": "application/json" };
  const dx = async (m, q, b) => {
    const r = await fetch(URL + q, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: j.data, erro: j.errors?.[0]?.message };
  };
  const site = async (m, q, b) => {
    const t0 = Date.now();
    const r = await fetch(SITE + q, { method: m, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ms: Date.now() - t0, j };
  };
  return { SITE, URL, PEPPER, dx, site };
}

class Verificador {
  constructor(nome) { this.nome = nome; this.resultados = []; }
  ok(titulo, cond, detalhe) {
    this.resultados.push([Boolean(cond), titulo]);
    console.log((cond ? "OK   " : "FALHA"), titulo, detalhe || "");
  }
  fim() {
    const falhas = this.resultados.filter((r) => !r[0]).length;
    console.log(`\n${this.nome}: ${this.resultados.length - falhas}/${this.resultados.length} verificações OK`);
    process.exit(falhas ? 1 : 0);
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { ambiente, Verificador, esperar };
