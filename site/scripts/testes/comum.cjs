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

// Um PDF mínimo e VÁLIDO (uma página em branco de 3x3 pontos, com a tabela de referências nos deslocamentos certos), para os
// testes de envio de arquivo (o painel de conteúdo aceita PDF de relatório; o servidor confere o tipo do arquivo).
function pdfMinimo() {
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 3 3] >>",
  ];
  let corpo = "%PDF-1.4\n";
  const deslocamentos = [];
  objetos.forEach((o, i) => {
    deslocamentos.push(corpo.length);
    corpo += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const d of deslocamentos) corpo += `${String(d).padStart(10, "0")} 00000 n \n`;
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corpo, "latin1");
}

module.exports = { ambiente, Verificador, esperar, pdfMinimo };
