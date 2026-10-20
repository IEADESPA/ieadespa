// Passo DEPOIS do `astro build`: traz para dentro do site as imagens que o HTML montado pede ao Directus.
//
// Por quê: cada visitante de uma página com imagem fazia o Directus (1 núcleo) redimensionar e entregar a imagem
// (0,3 a 1,4 s de CPU cada); com ~60 visitantes por minuto ele satura. Aqui o site baixa cada imagem UMA vez, na montagem,
// grava em dist/media/<hash do conteúdo>.<ext> e reescreve o HTML para /media/... (servido pela hospedagem estática,
// com cache de 1 ano porque o nome muda quando o conteúdo muda — ver public/staticwebapp.config.json).
//
// Garantias (a montagem NUNCA falha por causa deste passo — qualquer problema deixa a URL original do Directus):
//   - download com falha, tempo esgotado ou resposta que não é imagem: aquela URL fica como está e o resto segue;
//   - SVG não é trazido (um SVG aberto direto no nosso domínio executaria script); tipo de imagem desconhecido também não;
//   - teto de 120 MB no total: passou, o resto fica no Directus e o resumo avisa;
//   - HTML sem URL do Directus não é nem reescrito (byte a byte igual);
//   - o HTML é lido e gravado byte a byte (latin1), então nada fora das URLs muda;
//   - nada de segredo: os downloads são públicos (sem token) e só o endereço público das imagens aparece no resumo.
//
// og:image / twitter:image (e o JSON-LD) viram URL ABSOLUTA com a origem do site (quem lê é um robô de fora); o resto fica
// relativo (/media/...). Como rodar (de dentro de site/):  node scripts/localizar-imagens.mjs  [--dist=pasta] [--directus=url] [--origem=url] [--teto-mb=120]
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TETO_BYTES = 120 * 1024 * 1024;
export const CONCORRENCIA = 4;
export const TEMPO_LIMITE_MS = 30_000;
export const TENTATIVAS = 2;
export const PASTA_MEDIA = "media";

// Tipo da resposta -> extensão. Só o que a hospedagem serve com o tipo certo e é seguro abrir direto no nosso domínio.
const EXTENSOES = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
  "image/gif": "gif",
};

export const extensaoDoTipo = (tipo) => EXTENSOES[String(tipo || "").split(";")[0].trim().toLowerCase()] || null;

// ---------------------------------------------------------------------------------------------------------------------
// Achar as URLs
// ---------------------------------------------------------------------------------------------------------------------

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// O "&" da query pode vir escapado (&amp; no HTML, & em JSON/JS). Outras entidades (&quot; &#39; &lt;...) terminam a URL.
const SEPARADOR = "(?:&amp;|&#0*38;|&#x0*26;|\\\\u0026|&(?![A-Za-z#][A-Za-z0-9]*;))";
const CARACTERE_QUERY = "[A-Za-z0-9_=%.~+\\-:@!*/$]";
const NOME_OPCIONAL = "(?:/[A-Za-z0-9_.~%-]+)?";

const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Regex NOVA (tem estado) que acha `<directus>/assets/<uuid>[/nome][?query]`. Sem grupos de captura. */
export function regexDeImagens(directusUrl) {
  const base = escaparRegex(String(directusUrl).replace(/\/+$/, ""));
  return new RegExp(`${base}/assets/${UUID}(?![0-9a-z-])${NOME_OPCIONAL}(?:\\?(?:${SEPARADOR}|${CARACTERE_QUERY})*)?`, "gi");
}

/** A URL como o navegador a pediria: &amp; / &#38; / &#x26; / & viram "&". É a chave de deduplicação. */
export const normalizarUrl = (bruto) => bruto.replace(/&amp;|&#0*38;|&#x0*26;|\\u0026/gi, "&");

/** Todas as URLs do Directus que aparecem no texto (HTML, <style>, JSON-LD, atributos), na ordem, já normalizadas. */
export const extrairUrls = (html, directusUrl) => Array.from(html.matchAll(regexDeImagens(directusUrl)), (m) => normalizarUrl(m[0]));

// ---------------------------------------------------------------------------------------------------------------------
// Reescrever o HTML
// ---------------------------------------------------------------------------------------------------------------------

const REGEX_META = /<meta\b[^>]*>/gi;
const REGEX_META_IMAGEM = /\b(?:property|name)\s*=\s*["']?(?:og:image(?::url|:secure_url)?|twitter:image(?::src)?)["']?(?=[\s/>])/i;
const REGEX_JSON_LD = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>[\s\S]*?<\/script>/gi;

/**
 * Troca cada URL do Directus que está no `mapa` (url normalizada -> "/media/arquivo.ext") pelo caminho local.
 * og:image, twitter:image e JSON-LD recebem a URL absoluta (`origem` + caminho); o resto fica relativo.
 * URL que não está no mapa (download falhou, teto, não era imagem) fica exatamente como estava.
 */
export function reescreverHtml(html, { directusUrl, origem, mapa }) {
  let trocas = 0;
  const base = String(origem || "").replace(/\/+$/, "");
  const trocar = (absoluta) => (achado) => {
    const alvo = mapa.get(normalizarUrl(achado));
    if (!alvo) return achado;
    trocas++;
    return absoluta ? base + alvo : alvo;
  };
  let saida = html.replace(REGEX_META, (tag) => (REGEX_META_IMAGEM.test(tag) ? tag.replace(regexDeImagens(directusUrl), trocar(true)) : tag));
  saida = saida.replace(REGEX_JSON_LD, (bloco) => bloco.replace(regexDeImagens(directusUrl), trocar(true)));
  saida = saida.replace(regexDeImagens(directusUrl), trocar(false));
  return { html: saida, trocas };
}

// ---------------------------------------------------------------------------------------------------------------------
// Baixar
// ---------------------------------------------------------------------------------------------------------------------

const dormirPadrao = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function descartarCorpo(resposta) {
  try {
    await resposta.body?.cancel();
  } catch {
    // já fechado
  }
}

/** Lê o corpo aos pedaços e desiste assim que passar de `maxBytes` (não carrega um arquivo gigante na memória). */
async function lerCorpo(resposta, maxBytes) {
  const leitor = resposta.body?.getReader();
  if (!leitor) return { buffer: Buffer.from(await resposta.arrayBuffer()) };
  const pedacos = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await leitor.cancel().catch(() => {});
      return { grande: true };
    }
    pedacos.push(value);
  }
  return { buffer: Buffer.concat(pedacos) };
}

const motivoDoErro = (erro) => {
  if (erro?.name === "TimeoutError" || erro?.name === "AbortError") return "tempo esgotado";
  return `erro de rede (${erro?.cause?.code || erro?.code || erro?.name || "desconhecido"})`;
};

/**
 * Baixa UMA imagem. Devolve { ok: true, buffer, tipo, ext } ou { ok: false, motivo }. Nunca lança.
 * 2 tentativas (rede, tempo esgotado, 5xx, 429); 404/403 e "não é imagem" não repetem. Só vale se o tipo começa com image/
 * e é um dos que sabemos servir. `maxBytes` é o que ainda cabe no teto.
 */
export async function baixarImagem(url, { fetchFn = fetch, tempoMs = TEMPO_LIMITE_MS, tentativas = TENTATIVAS, maxBytes = TETO_BYTES, esperaMs = 1500, dormir = dormirPadrao } = {}) {
  let motivo = "falha desconhecida";
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const resposta = await fetchFn(url, { signal: AbortSignal.timeout(tempoMs), headers: { Accept: "image/*" } });
      if (!resposta.ok) {
        motivo = `HTTP ${resposta.status}`;
        await descartarCorpo(resposta);
        if (resposta.status < 500 && resposta.status !== 429 && resposta.status !== 408) return { ok: false, motivo };
      } else {
        const tipo = String(resposta.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        if (!tipo.startsWith("image/")) {
          await descartarCorpo(resposta);
          return { ok: false, motivo: `a resposta não é imagem (${tipo || "sem tipo"})` };
        }
        const ext = extensaoDoTipo(tipo);
        if (!ext) {
          await descartarCorpo(resposta);
          return { ok: false, motivo: `tipo de imagem não trazido para o site (${tipo})` };
        }
        const declarado = Number(resposta.headers.get("content-length"));
        if (Number.isFinite(declarado) && declarado > maxBytes) {
          await descartarCorpo(resposta);
          return { ok: false, motivo: "não cabe no teto de tamanho", teto: true };
        }
        const corpo = await lerCorpo(resposta, maxBytes);
        if (corpo.grande) return { ok: false, motivo: "não cabe no teto de tamanho", teto: true };
        if (corpo.buffer.length === 0) return { ok: false, motivo: "resposta vazia" };
        return { ok: true, buffer: corpo.buffer, tipo, ext };
      }
    } catch (erro) {
      motivo = motivoDoErro(erro);
    }
    if (tentativa < tentativas) await dormir(esperaMs);
  }
  return { ok: false, motivo };
}

// ---------------------------------------------------------------------------------------------------------------------
// Baixar tudo (com teto) e montar o mapa url -> caminho local
// ---------------------------------------------------------------------------------------------------------------------

/**
 * `baixar(url, { maxBytes })` -> { ok, buffer, ext, motivo, teto };  `gravar(nome, buffer)` grava em dist/media.
 * Concorrência fixa, URLs em ordem alfabética (o resultado não depende da pressa de cada download), deduplicação por
 * URL e por conteúdo (duas URLs que devolvem os mesmos bytes viram UM arquivo e contam UMA vez no teto).
 */
export async function localizarImagens(urls, { baixar, gravar, concorrencia = CONCORRENCIA, teto = TETO_BYTES } = {}) {
  const lista = [...new Set(urls)].sort();
  const mapa = new Map();
  const arquivos = new Map(); // nome -> bytes (só os gravados com sucesso)
  const escritas = new Map(); // nome -> gravação em andamento ou feita
  const falhas = [];
  const foraDoTeto = [];
  let bytes = 0;
  let tetoAtingido = false;
  let proxima = 0;

  async function trabalhar() {
    for (;;) {
      const url = lista[proxima++];
      if (url === undefined) return;
      if (tetoAtingido) {
        foraDoTeto.push(url);
        continue;
      }
      let resultado;
      try {
        resultado = await baixar(url, { maxBytes: Math.max(0, teto - bytes) });
      } catch (erro) {
        resultado = { ok: false, motivo: motivoDoErro(erro) };
      }
      if (!resultado || !resultado.ok) {
        if (resultado?.teto) {
          tetoAtingido = true;
          foraDoTeto.push(url);
        } else falhas.push({ url, motivo: resultado?.motivo || "falha desconhecida" });
        continue;
      }
      const nome = `${createHash("sha256").update(resultado.buffer).digest("hex").slice(0, 32)}.${resultado.ext}`;
      const tamanho = resultado.buffer.length;
      // A reserva no teto e o registro da gravação acontecem ANTES de qualquer espera: com 4 trabalhadores, dois downloads que
      // terminam juntos não passam pelo teto nem gravam o mesmo conteúdo duas vezes.
      let escrita = escritas.get(nome);
      const criador = !escrita;
      if (criador) {
        if (bytes + tamanho > teto) {
          tetoAtingido = true;
          foraDoTeto.push(url);
          continue;
        }
        bytes += tamanho;
        escrita = Promise.resolve().then(() => gravar(nome, resultado.buffer));
        escritas.set(nome, escrita);
      }
      try {
        await escrita;
      } catch (erro) {
        if (criador) bytes -= tamanho;
        falhas.push({ url, motivo: `não consegui gravar (${erro?.code || erro?.name || "erro"})` });
        continue;
      }
      arquivos.set(nome, tamanho);
      mapa.set(url, `/${PASTA_MEDIA}/${nome}`);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concorrencia, lista.length || 1)) }, trabalhar));
  return { mapa, falhas, foraDoTeto, bytes, arquivos: arquivos.size, distintas: lista.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pastas, configuração e fluxo principal
// ---------------------------------------------------------------------------------------------------------------------

/** Todos os .html de uma pasta, recursivamente (não entra em dist/media). */
export async function listarHtml(pasta) {
  const achados = [];
  async function andar(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (dir === pasta && item.name === PASTA_MEDIA) continue;
        await andar(caminho);
      } else if (item.isFile() && item.name.toLowerCase().endsWith(".html")) achados.push(caminho);
    }
  }
  await andar(pasta);
  return achados.sort();
}

/** O endereço do Directus e a origem do site, lidos da mesma fonte que o site usa (src/lib/directus.ts e src/config/site.ts). */
export async function lerConfiguracao(raizSite) {
  const directus = await readFile(path.join(raizSite, "src/lib/directus.ts"), "utf8");
  const site = await readFile(path.join(raizSite, "src/config/site.ts"), "utf8");
  return {
    directusUrl: /export const DIRECTUS_URL\s*=\s*"([^"]+)"/.exec(directus)?.[1] || null,
    origem: /\bsiteUrl:\s*"([^"]+)"/.exec(site)?.[1] || null,
  };
}

const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1).replace(".", ",");

/** O passo inteiro. Devolve um resumo e NUNCA lança (a montagem não pode falhar por causa dele). */
export async function executar({ dist, directusUrl, origem, baixar, teto = TETO_BYTES, log = console.log } = {}) {
  const resumo = { paginas: 0, paginasAlteradas: 0, distintas: 0, arquivos: 0, bytes: 0, falhas: [], foraDoTeto: [], trocas: 0, erro: null };
  try {
    if (!directusUrl || !origem) throw new Error("não achei o endereço do Directus ou a origem do site na configuração");
    const arquivosHtml = await listarHtml(dist);
    resumo.paginas = arquivosHtml.length;
    const urls = new Set();
    const comImagem = [];
    for (const arquivo of arquivosHtml) {
      const achadas = extrairUrls(await readFile(arquivo, "latin1"), directusUrl);
      if (achadas.length) {
        comImagem.push(arquivo);
        for (const url of achadas) urls.add(url);
      }
    }
    if (!urls.size) {
      log(`Imagens locais: nenhuma imagem do Directus nas ${resumo.paginas} páginas; nada a fazer.`);
      return resumo;
    }

    const pastaMedia = path.join(dist, PASTA_MEDIA);
    await mkdir(pastaMedia, { recursive: true });
    const gravar = (nome, buffer) => writeFile(path.join(pastaMedia, nome), buffer);
    const buscar = baixar || ((url, opcoes) => baixarImagem(url, opcoes));
    const feito = await localizarImagens([...urls], { baixar: buscar, gravar, teto });
    Object.assign(resumo, { distintas: feito.distintas, arquivos: feito.arquivos, bytes: feito.bytes, falhas: feito.falhas, foraDoTeto: feito.foraDoTeto });

    for (const arquivo of comImagem) {
      const original = await readFile(arquivo, "latin1");
      const { html, trocas } = reescreverHtml(original, { directusUrl, origem, mapa: feito.mapa });
      if (html !== original) {
        await writeFile(arquivo, html, "latin1");
        resumo.paginasAlteradas++;
        resumo.trocas += trocas;
      }
    }

    log(
      `Imagens locais: ${feito.arquivos} arquivo(s), ${megabytes(feito.bytes)} MB, a partir de ${feito.distintas} URL(s) distinta(s); ` +
        `${resumo.trocas} troca(s) em ${resumo.paginasAlteradas} de ${resumo.paginas} páginas; ${feito.falhas.length} falha(s).`,
    );
    for (const f of feito.falhas.slice(0, 10)) log(`  AVISO: ficou no Directus (${f.motivo}): ${f.url}`);
    if (feito.falhas.length > 10) log(`  AVISO: e mais ${feito.falhas.length - 10} falha(s).`);
    if (feito.foraDoTeto.length) {
      log(`  AVISO: teto de ${megabytes(teto)} MB atingido; ${feito.foraDoTeto.length} URL(s) ficaram no Directus (a montagem segue).`);
    }
  } catch (erro) {
    resumo.erro = erro?.message || String(erro);
    log(`Imagens locais: AVISO — passo interrompido (${resumo.erro}); o que não foi trocado continua apontando para o Directus. A montagem segue.`);
  }
  return resumo;
}

const argumento = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);

async function principal() {
  const raizSite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await lerConfiguracao(raizSite).catch(() => ({ directusUrl: null, origem: null }));
  const tetoMb = Number(argumento("teto-mb"));
  await executar({
    dist: path.resolve(argumento("dist") || path.join(raizSite, "dist")),
    directusUrl: argumento("directus") || config.directusUrl,
    origem: argumento("origem") || config.origem,
    teto: Number.isFinite(tetoMb) && tetoMb > 0 ? Math.round(tetoMb * 1024 * 1024) : TETO_BYTES,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  principal().catch((erro) => console.log(`Imagens locais: AVISO — ${erro?.message || erro}. A montagem segue.`));
}
