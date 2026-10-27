#!/usr/bin/env node
// Prepara o Directus para o REENVIO do mural de oração (Trava de Revisão 7-C, 23/10/2026). Repetível: confere o que já existe antes de criar, nunca apaga nada.
//
//   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node site/scripts/directus-mural-pendente-esquema.mjs [--simular]
//
// 1. Cria o campo `mural_oracao.sistema_pendente` (texto curto, escondido, vazio por padrão): a marca do pedido que o sistema da Igreja NÃO confirmou (fora do ar, banco
//    acordando, chave recusada). Guarda a escolha original de quem pediu — PUBLICO ou CONFIDENCIAL — porque, sem a resposta do sistema, o pedido vira confidencial por padrão
//    (o risco é desconhecido). A Function `EnviarPedidoMural` reenvia até 2 pendentes a cada envio novo que o sistema responde (ver o cabeçalho dela).
// 2. Marca como pendente (CONFIDENCIAL) o pedido CONFIDENCIAL antigo que ainda tem o texto no Directus: no próximo reenvio o sistema o reconhece pelo número do item (sem
//    gravar nem avisar de novo, se já o tinha) e o texto sai do Directus — fica só no sistema (Cuidado pastoral → Pedidos de oração, nível geral).
// Só o servidor do site grava (token de administrador): nenhuma permissão nova. Nenhum segredo é impresso.
const URL_BASE = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN || "";
const SIMULAR = process.argv.includes("--simular");
const GUARDADO = "(pedido guardado no sistema da Igreja: Cuidado pastoral → Pedidos de oração, nível geral)";
if (!URL_BASE || !TOKEN) { console.error("DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN são obrigatórios (variáveis de ambiente)."); process.exit(2); }

async function dx(metodo, caminho, corpo) {
  const r = await fetch(URL_BASE + caminho, { method: metodo, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j.data, erro: (j.errors || []).map((e) => e.message).join("; ") };
}
const fazer = async (titulo, metodo, caminho, corpo) => {
  if (SIMULAR) { console.log(`  [simular] ${titulo}`); return { ok: true }; }
  const r = await dx(metodo, caminho, corpo);
  console.log(`  ${r.ok ? "feito  " : "FALHOU "} ${titulo}${r.ok ? "" : ` (${r.status}: ${r.erro})`}`);
  if (!r.ok) process.exitCode = 1;
  return r;
};
const campos = async (colecao) => { const r = await dx("GET", `/fields/${colecao}`); return r.ok ? r.data.map((f) => f.field) : null; };

console.log("mural_oracao.sistema_pendente");
const existentes = await campos("mural_oracao");
if (!existentes) { console.error("A coleção mural_oracao não existe neste Directus."); process.exit(1); }
if (!existentes.includes("sistema_pendente")) {
  await fazer("campo mural_oracao.sistema_pendente", "POST", "/fields/mural_oracao", {
    field: "sistema_pendente", type: "string",
    meta: { hidden: true, readonly: true, interface: "input", note: "Pedido que o sistema da Igreja ainda não confirmou (PUBLICO ou CONFIDENCIAL = a escolha de quem pediu). O site reenvia sozinho. Não editar." },
    schema: { is_nullable: true, max_length: 12, default_value: null }
  });
} else console.log("  já existe");

console.log("pedidos confidenciais antigos com o texto ainda no Directus");
const antigos = await dx("GET", `/items/mural_oracao?filter[confidencial][_eq]=true&filter[sistema_pendente][_null]=true&fields=id,texto&limit=-1`);
if (!antigos.ok) { console.log(`  não foi possível listar (${antigos.status}: ${antigos.erro})`); process.exitCode = 1; }
else {
  const comTexto = (antigos.data || []).filter((x) => x.texto && x.texto !== GUARDADO);
  console.log(`  ${comTexto.length} a marcar para reenvio`);
  for (const x of comTexto) await fazer(`marcar o pedido ${x.id} para reenvio`, "PATCH", `/items/mural_oracao/${x.id}`, { sistema_pendente: "CONFIDENCIAL" });
}
