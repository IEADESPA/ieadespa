#!/usr/bin/env node
// Prepara o Directus para a TRAVA DE VAGAS E DE CUPOM das inscrições em evento (16/10/2026). Repetível: confere o que já existe antes de criar, nunca apaga nem altera nada que já esteja lá.
//
//   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node site/scripts/directus-vagas-esquema.mjs [--simular]
//
// Cria a coleção `evento_controle`: o "livro de senhas" das inscrições de cada evento. A inscrição que depende de um limite (vagas do evento ou usos do cupom) grava junto, NA MESMA
// transação, uma linha com chave única "<evento>:<número>" (o número é "a última senha do evento + 1"). Duas inscrições disputando a mesma vaga pedem a mesma chave e o banco recusa
// uma delas: é isso que impede passar do limite com muita gente se inscrevendo ao mesmo tempo (ver `site/api/src/lib/vagasEvento.js`). A linha fica ligada à inscrição (alias
// `controle` em `inscricoes_eventos`; apagar a inscrição NÃO apaga a linha: o livro só cresce) e ao evento (apagar o evento apaga as linhas). Só o servidor do site grava (token de
// administrador): nenhuma permissão nova. Nenhum segredo é impresso.
const URL_BASE = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN || "";
const SIMULAR = process.argv.includes("--simular");
if (!URL_BASE || !TOKEN) { console.error("DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN são obrigatórios (variáveis de ambiente)."); process.exit(2); }

async function dx(metodo, caminho, corpo) {
  const r = await fetch(URL_BASE + caminho, { method: metodo, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j.data, erro: (j.errors || []).map((e) => e.message).join("; ") };
}
const fazer = async (titulo, metodo, caminho, corpo) => {
  if (SIMULAR) { console.log(`  [simular] ${titulo}`); return { ok: true }; }
  const r = await dx(metodo, caminho, corpo);
  console.log(`  ${r.ok ? "criado " : "FALHOU "} ${titulo}${r.ok ? "" : ` (${r.status}: ${r.erro})`}`);
  if (!r.ok) process.exitCode = 1;
  return r;
};
const campos = async (colecao) => { const r = await dx("GET", `/fields/${colecao}`); return r.ok ? r.data.map((f) => f.field) : null; };

console.log("evento_controle");
if (!(await campos("evento_controle"))) {
  await fazer("coleção evento_controle", "POST", "/collections", {
    collection: "evento_controle",
    meta: { icon: "format_list_numbered", hidden: true, note: "Livro de senhas das inscrições de cada evento: serve só para o limite de vagas e de cupom nunca passar do número. Não editar à mão." },
    schema: {},
    fields: [
      { field: "id", type: "integer", meta: { hidden: true, readonly: true, interface: "input" }, schema: { is_primary_key: true, has_auto_increment: true } },
      { field: "evento", type: "integer", meta: { interface: "input" }, schema: { is_nullable: false } },
      { field: "inscricao", type: "integer", meta: { interface: "input" }, schema: { is_nullable: true } },
      { field: "n", type: "integer", meta: { interface: "input" }, schema: { is_nullable: false } },
      { field: "chave", type: "string", meta: { interface: "input" }, schema: { is_nullable: false, is_unique: true } },
      { field: "pessoas", type: "integer", meta: { interface: "input" }, schema: { is_nullable: true } },
      { field: "date_created", type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true }, schema: {} },
    ],
  });
} else console.log("  já existe a coleção evento_controle");

const relacoes = (await dx("GET", "/relations")).data || [];
const temRelacao = (colecao, campo) => relacoes.some((x) => x.collection === colecao && x.field === campo);
if (!temRelacao("evento_controle", "evento")) {
  await fazer("relação evento_controle.evento → eventos (apagar o evento apaga as linhas)", "POST", "/relations", {
    collection: "evento_controle", field: "evento", related_collection: "eventos", meta: { one_field: null }, schema: { on_delete: "CASCADE" },
  });
} else console.log("  já existe a relação do evento");
if (!temRelacao("evento_controle", "inscricao")) {
  if (!((await campos("inscricoes_eventos")) || []).includes("controle")) {
    await fazer("campo-lista inscricoes_eventos.controle", "POST", "/fields/inscricoes_eventos", {
      field: "controle", type: "alias", meta: { special: ["o2m"], interface: "list-o2m", hidden: true, note: "Senha da inscrição no limite de vagas/cupom (ver evento_controle)." },
    });
  }
  await fazer("relação evento_controle.inscricao → inscricoes_eventos (apagar a inscrição NÃO apaga a linha)", "POST", "/relations", {
    collection: "evento_controle", field: "inscricao", related_collection: "inscricoes_eventos", meta: { one_field: "controle" }, schema: { on_delete: "SET NULL" },
  });
} else console.log("  já existe a relação da inscrição");
console.log(SIMULAR ? "\n(simulação: nada foi alterado)" : "\nPronto.");
