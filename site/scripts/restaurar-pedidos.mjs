// Restaura pedidos de camiseta excluídos em massa, a partir do arquivo de cópia que o painel baixa antes de apagar ("pedidos-excluidos-<campanha>-<data>.json"; 16/10/2026).
// Devolve cada coisa ao seu lugar, com os MESMOS números: primeiro os pedidos, depois os itens e as respostas (que apontam para o pedido).
//
// Uso (segredos só em variáveis de ambiente, nunca em texto no repositório; nada disso é impresso):
//   DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... node site/scripts/restaurar-pedidos.mjs caminho/do/arquivo.json [--conferir]
//   --conferir   só confere o arquivo e diz o que seria restaurado, sem gravar nada.
//
// Recusa restaurar se QUALQUER pedido do arquivo já existir (evita duplicar): quem quer restaurar só uma parte edita o arquivo tirando o que já voltou. Se faltar a pergunta de uma
// resposta (a pergunta foi apagada depois), as respostas dessa pergunta são puladas e contadas no fim.
import { readFileSync } from "node:fs";

const VERSAO = 1;
const LOTE = 50;

function sair(msg, codigo = 1) { console.error(msg); process.exit(codigo); }

const [caminho, ...opcoes] = process.argv.slice(2);
if (!caminho) sair("Uso: node site/scripts/restaurar-pedidos.mjs arquivo.json [--conferir]", 2);
const soConferir = opcoes.includes("--conferir");
const URL_DX = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
if (!URL_DX || !TOKEN) sair("DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN são obrigatórios (variáveis de ambiente).", 2);

let copia;
try { copia = JSON.parse(readFileSync(caminho, "utf8")); } catch { sair("Não consegui ler o arquivo (não existe ou não é JSON).", 2); }
if (!copia || copia.versao !== VERSAO || !Array.isArray(copia.pedidos) || !Array.isArray(copia.itens) || !Array.isArray(copia.respostas)) {
  sair("Arquivo de cópia desconhecido (não é uma cópia de exclusão de pedidos deste painel).", 2);
}
const idsValidos = (lista) => lista.every((x) => x && Number.isInteger(x.id) && x.id > 0);
if (!idsValidos(copia.pedidos) || !idsValidos(copia.itens) || !idsValidos(copia.respostas)) sair("A cópia tem registro sem número: não vou restaurar.", 2);
const pedidoIds = new Set(copia.pedidos.map((p) => p.id));
if (copia.itens.some((i) => !pedidoIds.has(i.pedido)) || copia.respostas.some((r) => !pedidoIds.has(r.pedido))) sair("A cópia tem item ou resposta de um pedido que não está nela: não vou restaurar.", 2);

const cab = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
async function dx(metodo, caminhoApi, corpo) {
  const r = await fetch(URL_DX + caminhoApi, { method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j.data, erro: j.errors?.[0]?.message };
}
const fatias = (lista, n) => { const f = []; for (let i = 0; i < lista.length; i += n) f.push(lista.slice(i, i + n)); return f; };

console.log(`Cópia de ${copia.geradoEm} da campanha #${copia.campanha?.id} (${copia.campanha?.nome}): ${copia.pedidos.length} pedido(s), ${copia.itens.length} item(ns), ${copia.respostas.length} resposta(s).`);

// 1) nenhum pedido pode já existir
const existentes = [];
for (const parte of fatias([...pedidoIds], 100)) {
  const r = await dx("GET", `/items/camiseta_pedidos?filter[id][_in]=${parte.join(",")}&fields=id&limit=-1`);
  if (!r.ok) sair(`Não consegui conferir os pedidos no Directus (HTTP ${r.status}).`);
  existentes.push(...(r.data || []).map((x) => x.id));
}
if (existentes.length) sair(`${existentes.length} pedido(s) da cópia JÁ EXISTEM (ex.: #${existentes.slice(0, 5).join(", #")}): não vou restaurar para não duplicar. Tire do arquivo o que já voltou.`);

// 2) as perguntas das respostas ainda existem?
const perguntas = [...new Set(copia.respostas.map((r) => r.pergunta).filter((x) => Number.isInteger(x)))];
const perguntasVivas = new Set();
for (const parte of fatias(perguntas, 100)) {
  const r = await dx("GET", `/items/perguntas_camiseta?filter[id][_in]=${parte.join(",")}&fields=id&limit=-1`);
  if (!r.ok) sair(`Não consegui conferir as perguntas no Directus (HTTP ${r.status}).`);
  for (const x of r.data || []) perguntasVivas.add(x.id);
}
const respostasRestauraveis = copia.respostas.filter((r) => perguntasVivas.has(r.pergunta));
const puladas = copia.respostas.length - respostasRestauraveis.length;
console.log(`Pode restaurar: ${copia.pedidos.length} pedido(s), ${copia.itens.length} item(ns), ${respostasRestauraveis.length} resposta(s)${puladas ? ` (${puladas} resposta(s) pulada(s): a pergunta não existe mais)` : ""}.`);
if (soConferir) { console.log("(--conferir: nada foi gravado)"); process.exit(0); }

// 3) grava, na ordem: pedidos, itens, respostas
const etapas = [["camiseta_pedidos", copia.pedidos], ["camiseta_itens_pedido", copia.itens], ["respostas_pedido_camiseta", respostasRestauraveis]];
for (const [colecao, lista] of etapas) {
  let feitos = 0;
  for (const parte of fatias(lista, LOTE)) {
    const r = await dx("POST", `/items/${colecao}`, parte);
    if (!r.ok) sair(`FALHOU em ${colecao} depois de ${feitos} de ${lista.length} (HTTP ${r.status}: ${r.erro || "sem detalhe"}). NÃO rode de novo sem conferir o que já voltou (o script recusa pedidos que já existem).`);
    feitos += parte.length;
  }
  console.log(`  ${colecao}: ${feitos} restaurado(s)`);
}
console.log("Pronto.");
