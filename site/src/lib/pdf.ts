import type { jsPDF } from "jspdf";

/**
 * Metadado mínimo de acessibilidade que todo PDF gerado no site deve ter —
 * `jsPDF` não gera tagging completo (nenhuma biblioteca gratuita gera), mas
 * declarar o idioma do documento é suportado, gratuito, e é o que faz um
 * leitor de tela escolher a voz/pronúncia certa em vez de ler tudo como se
 * fosse inglês. Chamar sempre logo após `new jsPDF(...)`.
 */
export function configurarAcessibilidadePdf(doc: jsPDF, titulo: string) {
  doc.setLanguage("pt-BR");
  doc.setProperties({ title: titulo, subject: titulo });
}
