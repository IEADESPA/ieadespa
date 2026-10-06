// "Versão" do conteúdo do Directus que o site mostra (06/10/2026).
//
// Por que existe: o site é estático e só muda quando é remontado. O Flow do
// Directus "Publicar site (avisar GitHub)" dependia de um token pessoal do
// GitHub, que venceu em silêncio (401 desde antes de 06/10; a última
// remontagem automática foi em 01/10) — e criar outro token exige a tela do
// GitHub, em inglês, que o responsável não quer ter que operar. Este script
// resolve sem token nenhum: o fluxo `site-conteudo-sync.yml` roda a cada 15
// minutos com o token do próprio robô do repositório, calcula esta versão e,
// se ela mudou desde a última remontagem, manda remontar o site.
//
// Como calcula: baixa o CONTEÚDO de cada coleção que o site lê (todos os
// campos, em ordem de id) e faz um hash de tudo. A maioria das coleções deste
// Directus não tem campo de "última alteração" (`date_updated`), então contar
// itens ou olhar datas não enxergaria uma edição — por exemplo, desativar uma
// campanha de camiseta não muda a contagem. Com o conteúdo inteiro no hash,
// qualquer mudança muda a versão. São coleções pequenas (centenas de itens no
// total); a cada 15 minutos isso é desprezível. Lê com o token de admin
// (segredo do GitHub `DIRECTUS_ADMIN_TOKEN`, já usado pelos avisos) para não
// depender do que está liberado ao público.
//
// Uso: DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... node site/scripts/conteudo-versao.mjs
// Saída: uma linha com 16 caracteres hexadecimais (e, com --v, o detalhe por coleção).
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

// A mesma lista do Flow do Directus (o que, mudando, muda o site), mais as
// coleções de camiseta/evento que o site lê em tempo de build.
export const COLECOES = [
  "configuracoes", "mensagens", "noticias", "eventos", "sessoes_evento", "perguntas_evento", "cupons_desconto",
  "ministerios", "orgao_membros", "orgao_categorias", "galeria", "historia", "programacao", "visitantes",
  "relatorios", "faq", "depoimentos", "enquetes", "camiseta_grupos", "perguntas_camiseta",
];

// O Directus (plano B1) devolve 503 de vez em quando sob rajada: até 3 tentativas, com pausa,
// e no máximo 4 coleções ao mesmo tempo — isto roda a cada 15 min, não precisa correr.
async function buscar(url) {
  let ultimo;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (res.status < 500) return res;
    ultimo = res;
    await new Promise((r) => setTimeout(r, 800 * tentativa));
  }
  return ultimo;
}

async function lerColecao(colecao) {
  // `configuracoes` é "singleton" (um registro só, sem lista) — o Directus devolve um objeto.
  const res = await buscar(`${DIRECTUS_URL}/items/${colecao}?fields=*&sort=id&limit=-1`);
  if (res.status === 403 || res.status === 404) return { colecao, erro: res.status }; // coleção que não existe mais: conta como vazia
  if (!res.ok) throw new Error(`${colecao}: HTTP ${res.status}`);
  const dados = (await res.json()).data;
  const itens = Array.isArray(dados) ? dados : dados ? [dados] : [];
  const texto = JSON.stringify(itens);
  return { colecao, n: itens.length, hash: createHash("sha256").update(texto).digest("hex").slice(0, 12), bytes: texto.length };
}

async function emLotes(itens, tamanho, fn) {
  const saida = [];
  for (let i = 0; i < itens.length; i += tamanho) saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  return saida;
}

export async function versaoConteudo() {
  if (!DIRECTUS_URL || !TOKEN) throw new Error("DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN são obrigatórios");
  const partes = await emLotes(COLECOES, 4, lerColecao);
  const resumo = partes.map((p) => `${p.colecao}=${p.erro ? "x" : `${p.n}@${p.hash}`}`).join("|");
  const versao = createHash("sha256").update(resumo).digest("hex").slice(0, 16);
  return { versao, resumo, partes };
}

const executadoDireto = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) {
  const { versao, partes } = await versaoConteudo();
  if (process.argv.includes("--v")) for (const p of partes) console.error(`${p.colecao.padEnd(20)} ${p.erro ? "erro " + p.erro : `${String(p.n).padStart(5)} itens, ${String(Math.round(p.bytes / 1024)).padStart(4)} KB, hash ${p.hash}`}`);
  console.log(versao);
}
