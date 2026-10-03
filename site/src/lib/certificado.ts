import type { jsPDF } from "jspdf";

const SITE_FULL_NAME = "Igreja Evangélica Assembleia de Deus Ministério do Seta em Parauapebas/PA";

const OURO: [number, number, number] = [217, 179, 79];
const MARINHO: [number, number, number] = [15, 27, 51];
const CINZA: [number, number, number] = [90, 98, 112];

let logoDataUrl: string | null = null;

/** Carrega o logo como data URL uma única vez (reaproveitado por certificado a certificado). */
export async function carregarLogoCertificado(): Promise<string | null> {
  if (logoDataUrl) return logoDataUrl;
  try {
    const res = await fetch("/logo-icon.png");
    const blob = await res.blob();
    logoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return logoDataUrl;
  } catch {
    return null;
  }
}

/**
 * Desenha um certificado (moldura dourada, logo, nome, texto) na página atual
 * do documento — quem chama decide se é a única página ou uma de várias
 * (baixar todos os certificados de um evento vira um PDF de várias páginas).
 */
export function desenharCertificado(
  doc: jsPDF,
  params: {
    nome: string;
    eventoTitulo: string;
    eventoPeriodo: string;
    logo: string | null;
    /** Opcional — quando informado (junto com `eventoSlug`), imprime uma
     * linha de verificação pública de autenticidade (Fase 21): qualquer
     * terceiro, sem precisar do telefone de quem se inscreveu, pode
     * conferir se este certificado é mesmo verdadeiro. */
    codigo?: string;
    eventoSlug?: string;
    siteUrl?: string;
  },
) {
  const { nome, eventoTitulo, eventoPeriodo, logo, codigo, eventoSlug, siteUrl } = params;
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margem = 28;

  doc.setFillColor(250, 248, 242);
  doc.rect(0, 0, largura, altura, "F");
  doc.setDrawColor(...OURO);
  doc.setLineWidth(2.5);
  doc.rect(margem, margem, largura - margem * 2, altura - margem * 2);
  doc.setLineWidth(0.75);
  doc.rect(margem + 8, margem + 8, largura - (margem + 8) * 2, altura - (margem + 8) * 2);

  if (logo) doc.addImage(logo, "PNG", largura / 2 - 26, margem + 48, 52, 52);

  doc.setTextColor(...MARINHO);
  doc.setFont("times", "bold");
  doc.setFontSize(38);
  doc.text("CERTIFICADO", largura / 2, margem + 155, { align: "center" });

  doc.setDrawColor(...OURO);
  doc.setLineWidth(1);
  doc.line(largura / 2 - 60, margem + 168, largura / 2 + 60, margem + 168);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...CINZA);
  doc.text(`A ${SITE_FULL_NAME} certifica que`, largura / 2, margem + 205, { align: "center" });

  doc.setFont("times", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...OURO);
  doc.text(nome.toUpperCase(), largura / 2, margem + 260, { align: "center", maxWidth: largura - margem * 4 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(...MARINHO);
  const corpo = `participou do evento "${eventoTitulo}"${eventoPeriodo ? `, realizado em ${eventoPeriodo}` : ""}.`;
  const linhas = doc.splitTextToSize(corpo, largura - margem * 5);
  doc.text(linhas, largura / 2, margem + 305, { align: "center" });

  doc.setDrawColor(...OURO);
  doc.setLineWidth(0.75);
  doc.line(largura / 2 - 90, altura - margem - 62, largura / 2 + 90, altura - margem - 62);

  doc.setFontSize(11);
  doc.setTextColor(...CINZA);
  doc.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`, largura / 2, altura - margem - 40, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.text("IEADESPA", largura / 2, altura - margem - 24, { align: "center" });

  if (codigo && eventoSlug && siteUrl) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    const host = siteUrl.replace(/^https?:\/\//, "");
    doc.text(
      `Verifique a autenticidade em ${host}/verificar-certificado/${eventoSlug}/ com o código ${codigo}`,
      largura / 2,
      altura - margem - 10,
      { align: "center" },
    );
  }
}
