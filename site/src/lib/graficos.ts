import type { jsPDF } from "jspdf";

export interface ContagemOpcao {
  rotulo: string;
  total: number;
}

const CORES: [number, number, number][] = [
  [217, 179, 79], // ouro
  [15, 27, 51], // marinho
  [58, 125, 122], // verde-azulado
  [163, 71, 92], // vinho
  [92, 122, 58], // verde-oliva
  [122, 92, 58], // marrom
];

function corHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function escapeHtmlG(value: string) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/**
 * Conta quantas inscrições marcaram cada opção de uma pergunta de seleção
 * (única ou múltipla — múltipla vem como valores separados por vírgula).
 * Só considera as opções cadastradas na pergunta, mais um bucket "Sem
 * resposta" quando existir gente que não respondeu.
 */
export function contarRespostas(pergunta: { opcoes: string[] | null }, valores: (string | undefined)[]): ContagemOpcao[] {
  const opcoes = pergunta.opcoes ?? [];
  const contagem = new Map(opcoes.map((o) => [o, 0]));
  let semResposta = 0;

  for (const valor of valores) {
    const limpo = (valor ?? "").trim();
    if (!limpo) {
      semResposta += 1;
      continue;
    }
    limpo
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((v) => {
        contagem.set(v, (contagem.get(v) ?? 0) + 1);
      });
  }

  const resultado: ContagemOpcao[] = opcoes.map((rotulo) => ({ rotulo, total: contagem.get(rotulo) ?? 0 }));
  if (semResposta > 0) resultado.push({ rotulo: "Sem resposta", total: semResposta });
  return resultado;
}

/** Gráfico de barras em SVG inline, pra exibir no painel (via innerHTML). */
export function graficoBarrasSvg(contagens: ContagemOpcao[], largura = 460): string {
  const alturaLinha = 34;
  const alturaTotal = Math.max(contagens.length * alturaLinha, alturaLinha);
  const total = contagens.reduce((soma, c) => soma + c.total, 0);
  const maxTotal = Math.max(...contagens.map((c) => c.total), 1);
  const larguraTrilha = largura - 4;

  const barras = contagens
    .map((c, i) => {
      const y = i * alturaLinha;
      const pct = total ? Math.round((c.total / total) * 100) : 0;
      const larguraBarra = c.total > 0 ? Math.max((c.total / maxTotal) * larguraTrilha, 4) : 0;
      const cor = corHex(CORES[i % CORES.length]);
      return `
        <text x="0" y="${y + 13}" font-size="12" font-weight="600" fill="currentColor">${escapeHtmlG(c.rotulo)}</text>
        <text x="${largura}" y="${y + 13}" font-size="12" font-weight="700" text-anchor="end" fill="${cor}">${c.total} · ${pct}%</text>
        <rect x="0" y="${y + 19}" width="${larguraTrilha}" height="10" rx="5" fill="currentColor" fill-opacity="0.1" />
        <rect x="0" y="${y + 19}" width="${larguraBarra}" height="10" rx="5" fill="${cor}" />
      `;
    })
    .join("");

  return `<svg viewBox="0 0 ${largura} ${alturaTotal}" width="100%" height="${alturaTotal}" xmlns="http://www.w3.org/2000/svg">${barras}</svg>`;
}

/**
 * Mesmo gráfico de barras, desenhado direto no PDF do relatório (vetor,
 * sem lista de respostas individuais — só a proporção agregada). Retorna
 * o novo cursor Y, já depois do gráfico.
 */
export function desenharGraficoBarrasPDF(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  titulo: string,
  contagens: ContagemOpcao[],
): number {
  let cursorY = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text(titulo, x, cursorY);
  cursorY += 16;

  const total = contagens.reduce((soma, c) => soma + c.total, 0);
  const maxTotal = Math.max(...contagens.map((c) => c.total), 1);
  const larguraTrilha = largura - 90;

  contagens.forEach((c, i) => {
    const pct = total ? Math.round((c.total / total) * 100) : 0;
    const larguraBarra = c.total > 0 ? Math.max((c.total / maxTotal) * larguraTrilha, 3) : 0;
    const cor = CORES[i % CORES.length];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(60);
    doc.text(c.rotulo, x, cursorY, { maxWidth: larguraTrilha });

    doc.setFillColor(230, 230, 230);
    doc.roundedRect(x, cursorY + 4, larguraTrilha, 8, 4, 4, "F");
    if (larguraBarra > 0) {
      doc.setFillColor(...cor);
      doc.roundedRect(x, cursorY + 4, larguraBarra, 8, 4, 4, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...cor);
    doc.text(`${c.total} · ${pct}%`, x + largura - 6, cursorY + 11, { align: "right" });

    cursorY += 20;
  });

  return cursorY + 12;
}
