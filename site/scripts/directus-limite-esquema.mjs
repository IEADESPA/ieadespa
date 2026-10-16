#!/usr/bin/env node
// Prepara o Directus para o LIMITE DE PEDIDOS das camisetas (16/10/2026). Repetível: confere o que já existe antes de criar, nunca apaga nem altera nada que já esteja lá.
//
//   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node site/scripts/directus-limite-esquema.mjs [--simular]
//
// O que cria:
//  1) camiseta_grupos.limite_total (inteiro, vazio = sem limite) e camiseta_grupos.limites_tamanho (JSON {"M": 40, …}, vazio = sem limite por tamanho);
//  2) a coleção camiseta_controle: o "livro de senhas" dos pedidos de cada campanha. Cada pedido que entra com limite ligado grava junto, NA MESMA transação, uma linha
//     com chave única "<campanha>:<número>". Dois pedidos disputando a mesma vaga pedem a mesma chave e o banco recusa um deles: é isso que impede que passe do limite
//     mesmo com muita gente pedindo ao mesmo tempo. Linha ligada ao pedido (alias `controle` no pedido, apagar o pedido NÃO apaga a linha: o livro só cresce) e à
//     campanha (apagar a campanha apaga as linhas);
//  3) a permissão do "Gestor de Camisetas" para ler e criar nessa coleção (a venda de balcão grava com o token da própria pessoa).
// Nenhum segredo é impresso.
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

// 1) campos do grupo
console.log("1) camiseta_grupos");
const doGrupo = (await campos("camiseta_grupos")) || [];
if (!doGrupo.includes("limite_total")) {
  await fazer("camiseta_grupos.limite_total", "POST", "/fields/camiseta_grupos", {
    field: "limite_total", type: "integer",
    meta: { interface: "input", width: "half", note: "Máximo de peças do lote aberto (todos os tamanhos juntos). Vazio = sem limite.", options: { min: 0 } },
    schema: { is_nullable: true },
  });
} else console.log("  já existe camiseta_grupos.limite_total");
if (!doGrupo.includes("limites_tamanho")) {
  await fazer("camiseta_grupos.limites_tamanho", "POST", "/fields/camiseta_grupos", {
    field: "limites_tamanho", type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: 'Máximo de peças do lote aberto por tamanho, ex.: {"M": 40, "G": 30}. Tamanho que não aparece aqui não tem limite próprio.' },
    schema: { is_nullable: true },
  });
} else console.log("  já existe camiseta_grupos.limites_tamanho");

// 2) o livro de senhas
console.log("2) camiseta_controle");
const doControle = await campos("camiseta_controle");
if (!doControle) {
  await fazer("coleção camiseta_controle", "POST", "/collections", {
    collection: "camiseta_controle",
    meta: { icon: "format_list_numbered", hidden: true, note: "Livro de senhas dos pedidos de cada campanha: serve só para o limite de pedidos nunca passar do número definido. Não editar à mão." },
    schema: {},
    fields: [
      { field: "id", type: "integer", meta: { hidden: true, readonly: true, interface: "input" }, schema: { is_primary_key: true, has_auto_increment: true } },
      { field: "grupo", type: "integer", meta: { interface: "input" }, schema: { is_nullable: false } },
      { field: "pedido", type: "integer", meta: { interface: "input" }, schema: { is_nullable: true } },
      { field: "n", type: "integer", meta: { interface: "input" }, schema: { is_nullable: false } },
      { field: "chave", type: "string", meta: { interface: "input" }, schema: { is_nullable: false, is_unique: true } },
      { field: "pecas", type: "integer", meta: { interface: "input" }, schema: { is_nullable: true } },
      { field: "date_created", type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true }, schema: {} },
    ],
  });
} else console.log("  já existe a coleção camiseta_controle");

const relacoes = (await dx("GET", "/relations")).data || [];
const temRelacao = (colecao, campo) => relacoes.some((x) => x.collection === colecao && x.field === campo);
if (!temRelacao("camiseta_controle", "grupo")) {
  await fazer("relação camiseta_controle.grupo → camiseta_grupos (apagar a campanha apaga as linhas)", "POST", "/relations", {
    collection: "camiseta_controle", field: "grupo", related_collection: "camiseta_grupos", meta: { one_field: null }, schema: { on_delete: "CASCADE" },
  });
} else console.log("  já existe a relação da campanha");
if (!temRelacao("camiseta_controle", "pedido")) {
  if (!(await campos("camiseta_pedidos") || []).includes("controle")) {
    await fazer("campo-lista camiseta_pedidos.controle", "POST", "/fields/camiseta_pedidos", {
      field: "controle", type: "alias", meta: { special: ["o2m"], interface: "list-o2m", hidden: true, note: "Senha do pedido no limite do lote (ver camiseta_controle)." },
    });
  }
  await fazer("relação camiseta_controle.pedido → camiseta_pedidos (apagar o pedido NÃO apaga a linha)", "POST", "/relations", {
    collection: "camiseta_controle", field: "pedido", related_collection: "camiseta_pedidos", meta: { one_field: "controle" }, schema: { on_delete: "SET NULL" },
  });
} else console.log("  já existe a relação do pedido");

// 3) permissão do Gestor de Camisetas
console.log("3) permissões do Gestor de Camisetas");
const politicas = (await dx("GET", "/policies?filter[name][_eq]=Gestor%20de%20Camisetas&fields=id,name&limit=2")).data || [];
if (politicas.length !== 1) console.log(`  política "Gestor de Camisetas" não encontrada de forma única (${politicas.length}); nada feito aqui`);
else {
  const politica = politicas[0].id;
  const existentes = (await dx("GET", `/permissions?filter[policy][_eq]=${politica}&filter[collection][_eq]=camiseta_controle&fields=action&limit=20`)).data || [];
  for (const acao of ["read", "create"]) {
    if (existentes.some((p) => p.action === acao)) { console.log(`  já existe ${acao}`); continue; }
    await fazer(`permissão ${acao} em camiseta_controle`, "POST", "/permissions", { policy: politica, collection: "camiseta_controle", action: acao, fields: ["*"], permissions: {}, validation: {} });
  }
}
console.log(SIMULAR ? "\n(simulação: nada foi alterado)" : "\nPronto.");
