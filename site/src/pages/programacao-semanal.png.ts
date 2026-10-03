import sharp from "sharp";
import { siteConfig } from "@/config/site";
import { DAY_LABEL, OCCURRENCE_LABEL, getAllProgramacao, groupByDay } from "@/lib/programacao";

const WIDTH = 1080;
const HEIGHT = 1920;

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] as string);

const MARGIN_X = 90;
const MAX_TEXT_WIDTH = WIDTH - MARGIN_X * 2;

/**
 * Quebra de linha aproximada: sem medir texto de verdade (não há um
 * navegador aqui, só SVG→PNG), estima a largura pela quantidade de
 * caracteres — suficiente pra evitar que uma linha longa (ex. "Último
 * domingo do mês: Ceia do Senhor...") saia cortada pela lateral da imagem,
 * que foi o bug real relatado.
 */
function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const avgCharWidth = fontSize * 0.55;
  const maxChars = Math.max(10, Math.floor(maxWidth / avgCharWidth));
  const words = text.split(" ");
  const lines: string[] = [];
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

export async function GET() {
  const programacao = await getAllProgramacao();
  const schedule = groupByDay(programacao);

  const DAY_FONT_SIZE = 34;
  const ITEM_FONT_SIZE = 30;
  const DAY_LINE_HEIGHT = 44;
  const ITEM_LINE_HEIGHT = 40;
  const GROUP_GAP = 28;

  // Quebra cada linha antes de somar altura, senão um item que precisa de
  // 2-3 linhas seria contado como se coubesse numa só.
  const wrappedSchedule = schedule.map((group) => ({
    day: group.day,
    items: group.items.map((item) => {
      const label = item.occurrence ? `${OCCURRENCE_LABEL[item.occurrence]}: ${item.title}` : item.title;
      return wrapText(label, ITEM_FONT_SIZE, MAX_TEXT_WIDTH);
    }),
  }));

  let contentHeight = 0;
  for (const group of wrappedSchedule) {
    contentHeight += DAY_LINE_HEIGHT;
    for (const lines of group.items) contentHeight += lines.length * ITEM_LINE_HEIGHT;
    contentHeight += GROUP_GAP;
  }

  const headerBottom = 260;
  const footerTop = HEIGHT - 140;
  const availableHeight = footerTop - headerBottom;

  // Se mesmo quebrando linha o conteúdo não coubesse na altura fixa do
  // story (formato 1080x1920, não dá pra crescer), encolhe tudo
  // proporcionalmente em vez de cortar o final da lista — nunca menos que
  // 70% do tamanho original, pra não ficar ilegível.
  const scale = Math.max(0.7, Math.min(1, availableHeight / contentHeight));
  const dayFontSize = DAY_FONT_SIZE * scale;
  const itemFontSize = ITEM_FONT_SIZE * scale;
  const dayLineHeight = DAY_LINE_HEIGHT * scale;
  const itemLineHeight = ITEM_LINE_HEIGHT * scale;
  const groupGap = GROUP_GAP * scale;
  const scaledContentHeight = contentHeight * scale;

  let y = headerBottom + Math.max(40, (availableHeight - scaledContentHeight) / 2) + 40;

  const rows: string[] = [];

  for (const group of wrappedSchedule) {
    rows.push(
      `<text x="${MARGIN_X}" y="${y}" font-family="sans-serif" font-size="${dayFontSize}" font-weight="700" fill="#d9b34f">${escapeXml(DAY_LABEL[group.day])}</text>`,
    );
    y += dayLineHeight;

    for (const lines of group.items) {
      for (const line of lines) {
        rows.push(`<text x="${MARGIN_X}" y="${y}" font-family="sans-serif" font-size="${itemFontSize}" fill="#f4f1e6">${escapeXml(line)}</text>`);
        y += itemLineHeight;
      }
    }
    y += groupGap;
  }

  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a1220" />
      <text x="90" y="160" font-family="sans-serif" font-size="56" font-weight="700" fill="#f4f1e6">${escapeXml(siteConfig.name)}</text>
      <text x="90" y="220" font-family="sans-serif" font-size="34" fill="#a7adba">Programação semanal</text>
      <line x1="90" y1="260" x2="${WIDTH - 90}" y2="260" stroke="#33456b" stroke-width="2" />
      ${rows.join("\n")}
      <text x="90" y="${HEIGHT - 80}" font-family="sans-serif" font-size="28" fill="#a7adba">${escapeXml(siteConfig.siteUrl.replace("https://", ""))}</text>
    </svg>
  `;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'inline; filename="programacao-semanal.png"',
    },
  });
}
