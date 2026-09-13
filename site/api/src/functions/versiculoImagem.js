const { app } = require("@azure/functions");
const sharp = require("sharp");
const { permitir, ipDoPedido } = require("../lib/rateLimit");

/*
 * URL pública do site — não é segredo (é o próprio domínio público), então
 * fica como constante direta, igual `DIRECTUS_URL` em `src/lib/directus.ts`
 * no projeto Astro, em vez de depender de uma variável de ambiente que
 * precisaria ser configurada à parte no Azure só pra isso.
 */
const SITE_URL = "https://www.ieadespa.org.br";

const WIDTH = 1080;
const HEIGHT = 1920;

const escapeXml = (value) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/*
 * Mesma quebra de linha aproximada (por contagem de caracteres, sem medir
 * texto de verdade) já usada em `programacao-semanal.png.ts` — só que aqui
 * o texto é centralizado, não alinhado à esquerda.
 */
function wrapText(text, fontSize, maxWidth) {
  const avgCharWidth = fontSize * 0.52;
  const maxChars = Math.max(10, Math.floor(maxWidth / avgCharWidth));
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/*
 * Mesmo critério de período do dia do `index.astro` (madrugada/manhã/tarde/
 * noite) e mesmo índice determinístico por dia (`epochDays % tamanho`) — pra
 * a imagem gerada aqui bater exatamente com o versículo mostrado na home
 * nesse mesmo dia, calculado sempre em horário de Brasília, não no fuso do
 * servidor da função.
 */
function periodoAtual() {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()),
  );
  if (hora < 6) return "madrugada";
  if (hora < 12) return "manha";
  if (hora < 18) return "tarde";
  return "noite";
}

async function versiculoDoDia() {
  const periodo = periodoAtual();
  const res = await fetch(`${SITE_URL}/versiculos-${periodo}.json`);
  if (!res.ok) throw new Error(`Falha ao buscar versículos: ${res.status}`);
  const balde = await res.json();
  const epochDays = Math.floor(Date.now() / 86400000);
  return balde[epochDays % balde.length];
}

app.http("versiculo-imagem", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "versiculo-imagem",
  handler: async (request) => {
    const chave = `versiculo-imagem:${ipDoPedido(request)}`;
    if (!permitir(chave)) {
      return { status: 429, body: "Muitas tentativas. Aguarde alguns minutos." };
    }

    let verse;
    try {
      verse = await versiculoDoDia();
    } catch {
      return { status: 502, body: "Não foi possível gerar a imagem agora." };
    }
    if (!verse) return { status: 404, body: "Nenhum versículo encontrado." };

    const MARGIN_X = 100;
    const MAX_TEXT_WIDTH = WIDTH - MARGIN_X * 2;
    const TEXT_FONT_SIZE = 52;
    const TEXT_LINE_HEIGHT = 74;

    let lines = wrapText(verse.t, TEXT_FONT_SIZE, MAX_TEXT_WIDTH);
    let fontSize = TEXT_FONT_SIZE;
    let lineHeight = TEXT_LINE_HEIGHT;

    // Versículo raro que mesmo quebrado não cabe na altura disponível:
    // encolhe proporcionalmente (nunca menos que 65%), mesmo princípio já
    // usado no card de programação semanal.
    const availableHeight = HEIGHT * 0.55;
    if (lines.length * lineHeight > availableHeight) {
      const scale = Math.max(0.65, availableHeight / (lines.length * lineHeight));
      fontSize *= scale;
      lineHeight *= scale;
      lines = wrapText(verse.t, fontSize, MAX_TEXT_WIDTH);
    }

    // Centralizado na faixa de conteúdo disponível (abaixo do cabeçalho de
    // marca, acima do rodapé com a URL) — não na tela inteira, senão o bloco
    // de texto sobra puxado pra cima, com espaço vazio demais embaixo.
    const CONTENT_TOP = 300;
    const CONTENT_BOTTOM = HEIGHT - 160;
    const contentCenter = (CONTENT_TOP + CONTENT_BOTTOM) / 2;
    const textBlockHeight = lines.length * lineHeight;
    const textStartY = contentCenter - textBlockHeight / 2;

    const textRows = lines
      .map(
        (line, index) =>
          `<text x="${WIDTH / 2}" y="${textStartY + index * lineHeight}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="${fontSize}" fill="#f4f1e6">${escapeXml(line)}</text>`,
      )
      .join("\n");

    const refY = textStartY + textBlockHeight + 60;

    const svg = `
      <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a1220" />
        <text x="${WIDTH / 2}" y="200" text-anchor="middle" font-family="sans-serif" font-size="46" font-weight="700" fill="#f4f1e6">IEADESPA</text>
        <text x="${WIDTH / 2}" y="250" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#a7adba">Versículo do dia</text>
        <text x="${WIDTH / 2}" y="${textStartY - 90}" text-anchor="middle" font-family="Georgia, serif" font-size="120" fill="#33456b">&#8220;</text>
        ${textRows}
        <text x="${WIDTH / 2}" y="${refY}" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="700" fill="#d9b34f">${escapeXml(verse.r)}</text>
        <line x1="${WIDTH / 2 - 60}" y1="${refY + 50}" x2="${WIDTH / 2 + 60}" y2="${refY + 50}" stroke="#33456b" stroke-width="2" />
        <text x="${WIDTH / 2}" y="${HEIGHT - 80}" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#a7adba">${SITE_URL.replace("https://", "")}</text>
      </svg>
    `;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();

    return {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="versiculo-do-dia.png"',
        // Uma hora de cache: o versículo só muda de período em período (a
        // cada ~6h), não a cada request — evita gerar a mesma imagem de
        // novo pra quem compartilhar/recarregar em seguida.
        "Cache-Control": "public, max-age=3600",
      },
      body: png,
    };
  },
});
