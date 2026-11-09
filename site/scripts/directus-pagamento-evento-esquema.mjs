#!/usr/bin/env node
// Prepara o Directus para o "Como pagar" dos eventos (09/11/2026). Repetível: confere o que já existe antes de criar, nunca apaga nada.
//
//   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node site/scripts/directus-pagamento-evento-esquema.mjs [--simular]
//   (com o segredo só no processo:  sops exec-env site/secrets.env 'DIRECTUS_URL=https://… node site/scripts/directus-pagamento-evento-esquema.mjs')
//
// O que cria (só acrescenta):
//   eventos + pagamento_config (JSON: a chave Pix com o nome que o banco mostra e/ou o contato de quem recebe em dinheiro, e um recado),
//             preenchido pela aba "Pagamento" do painel de eventos e lido pelo site por `src/lib/pagamentoEvento.ts` (normalizarPagamento).
//
// Permissões: o campo é PÚBLICO de propósito (é o que a página do evento mostra para quem vai pagar). Onde a leitura de `eventos` (pública
// ou da equipe) ou a alteração (equipe) usa uma LISTA de campos em vez de "*", o campo entra na lista — senão o site não o enxerga ou o
// painel não o grava. Hoje (conferido em 09/11/2026) todas usam "*": o script só confere e diz.
// Nenhum segredo é impresso.
const URL_BASE = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN || "";
const SIMULAR = process.argv.includes("--simular");
if (!URL_BASE || !TOKEN) {
  console.error("DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN são obrigatórios (variáveis de ambiente).");
  process.exit(2);
}

async function dx(metodo, caminho, corpo) {
  const r = await fetch(URL_BASE + caminho, { method: metodo, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j.data, erro: (j.errors || []).map((e) => e.message).join("; ") };
}
const fazer = async (titulo, metodo, caminho, corpo) => {
  if (SIMULAR) {
    console.log(`  [simular] ${titulo}`);
    return { ok: true };
  }
  const r = await dx(metodo, caminho, corpo);
  console.log(`  ${r.ok ? "feito  " : "FALHOU "} ${titulo}${r.ok ? "" : ` (${r.status}: ${r.erro})`}`);
  if (!r.ok) process.exitCode = 1;
  return r;
};

const CAMPO = {
  field: "pagamento_config",
  type: "json",
  meta: {
    interface: "input-code",
    options: { language: "json" },
    note: "Como pagar a inscrição (painel do evento, aba Pagamento): Pix (tipo, chave, nome que o banco mostra) e/ou dinheiro (quem recebe, telefone, onde). PÚBLICO: aparece na página do evento.",
  },
  schema: { is_nullable: true },
};

console.log(`Directus: ${URL_BASE}${SIMULAR ? " (simulando: nada é gravado)" : ""}`);

console.log("== campo ==");
const existentes = await dx("GET", "/fields/eventos");
if (!existentes.ok) {
  console.error(`Não consegui ler os campos de eventos (${existentes.status}: ${existentes.erro}).`);
  process.exit(1);
}
if (existentes.data.some((f) => f.field === CAMPO.field)) console.log(`  eventos.${CAMPO.field}: já existe`);
else await fazer(`eventos.${CAMPO.field} (json)`, "POST", "/fields/eventos", CAMPO);

console.log("== permissões ==");
const politicas = await dx("GET", "/policies?fields=id,name,admin_access&limit=-1");
const permissoes = await dx("GET", "/permissions?filter[collection][_eq]=eventos&fields=id,policy,action,fields&limit=-1");
if (!politicas.ok || !permissoes.ok) {
  console.error("Não consegui ler as políticas/permissões.");
  process.exit(1);
}
const nomeDa = (id) => (id ? politicas.data.find((p) => p.id === id)?.name ?? id : "PÚBLICO");
const ehAdmin = (id) => Boolean(id && politicas.data.find((p) => p.id === id)?.admin_access);
for (const p of permissoes.data.filter((x) => (x.action === "read" || x.action === "update") && !ehAdmin(x.policy))) {
  if (p.action === "update" && !p.policy) {
    console.log(`  ATENÇÃO: o PÚBLICO pode alterar eventos — isso não devia existir (nada feito aqui; confira no Directus).`);
    process.exitCode = 1;
    continue;
  }
  const lista = p.fields || [];
  if (lista.includes("*")) {
    console.log(`  "${nomeDa(p.policy)}" eventos.${p.action}: todos os campos (nada a acrescentar)`);
    continue;
  }
  if (lista.includes(CAMPO.field)) {
    console.log(`  "${nomeDa(p.policy)}" eventos.${p.action}: já tem o campo`);
    continue;
  }
  await fazer(`"${nomeDa(p.policy)}" eventos.${p.action}: + ${CAMPO.field}`, "PATCH", `/permissions/${p.id}`, { fields: [...lista, CAMPO.field] });
}
console.log(process.exitCode ? "Terminou com algo a conferir (ver acima)." : "Pronto.");
