import type { jsPDF } from "jspdf";

const OURO: [number, number, number] = [217, 179, 79];
const MARINHO: [number, number, number] = [15, 27, 51];
const CINZA: [number, number, number] = [90, 98, 112];

/**
 * Desenha um crachá dentro do retângulo dado (x, y, largura, altura) —
 * permite montar 1 por página (autoatendimento) ou 4 por página em lote
 * (2x2, com linha de corte), do mesmo jeito que a igreja já imprime hoje.
 */
export function desenharCracha(
  doc: jsPDF,
  rect: { x: number; y: number; largura: number; altura: number },
  params: { nome: string; eventoTitulo: string; tema: string | null; logo: string | null },
) {
  const { x, y, largura, altura } = rect;
  const { nome, eventoTitulo, tema, logo } = params;
  const margemInterna = 14;

  doc.setDrawColor(...MARINHO);
  doc.setLineWidth(0.5);
  doc.rect(x, y, largura, altura);

  // Cabeçalho.
  const alturaCabecalho = 34;
  doc.setFillColor(...MARINHO);
  doc.rect(x, y, largura, alturaCabecalho, "F");
  if (logo) doc.addImage(logo, "PNG", x + margemInterna, y + 5, 22, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("IEADESPA", x + margemInterna + (logo ? 28 : 0), y + 15, { maxWidth: largura - margemInterna * 2 - (logo ? 28 : 0) });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Igreja Evangélica Assembleia de Deus", x + margemInterna + (logo ? 28 : 0), y + 24, {
    maxWidth: largura - margemInterna * 2 - (logo ? 28 : 0),
  });

  let cursorY = y + alturaCabecalho + 16;

  doc.setTextColor(...MARINHO);
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  const linhasTitulo = doc.splitTextToSize(eventoTitulo, largura - margemInterna * 2);
  doc.text(linhasTitulo, x + largura / 2, cursorY, { align: "center" });
  cursorY += linhasTitulo.length * 14 + 4;

  if (tema) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    const linhasTema = doc.splitTextToSize(tema, largura - margemInterna * 2);
    doc.text(linhasTema, x + largura / 2, cursorY, { align: "center" });
    cursorY += linhasTema.length * 10 + 8;
  }

  // Caixa de identificação — já vem com o nome, sem precisar escrever à mão.
  // Posicionada por volta de 60% da altura da célula, não colada no rodapé,
  // pra não sobrar um vão vazio grande no meio do crachá.
  const caixaY = Math.max(cursorY + 24, y + altura * 0.58);
  const caixaAltura = 34;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...CINZA);
  doc.text("IDENTIFICAÇÃO", x + largura / 2, caixaY - 8, { align: "center" });
  doc.setDrawColor(...MARINHO);
  doc.setLineWidth(0.75);
  doc.roundedRect(x + margemInterna, caixaY, largura - margemInterna * 2, caixaAltura, 3, 3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...MARINHO);
  const nomeAjustado = doc.splitTextToSize(nome.toUpperCase(), largura - margemInterna * 2 - 10);
  doc.text(nomeAjustado.slice(0, 2), x + largura / 2, caixaY + caixaAltura / 2 + (nomeAjustado.length > 1 ? -3 : 4), {
    align: "center",
  });

  // Rodapé decorativo.
  const alturaRodape = 12;
  doc.setFillColor(...OURO);
  doc.rect(x, y + altura - alturaRodape, largura, alturaRodape, "F");
}
