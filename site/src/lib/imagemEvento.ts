/**
 * Imagem do evento no painel de eventos (09/11/2026): o que o painel confere ANTES de enviar o arquivo ao Directus.
 *
 * A imagem fica no campo `cover` do evento e aparece no alto da página do evento e na prévia do link (WhatsApp, redes sociais —
 * `og:image` da página `/evento/<slug>/` e também da camiseta vinculada ao evento). A permissão da função "Editor de eventos" no
 * Directus já só aceita imagem (JPG, PNG, WebP e GIF); aqui o painel fica mais estreito: sem GIF (a prévia do WhatsApp não anima e
 * o GIF costuma ser pesado) e com um teto de tamanho, para a pessoa saber na hora por que não foi, em vez de um erro do servidor.
 */
export const TIPOS_IMAGEM_EVENTO: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/** 10 MB: uma foto de celular ou uma arte do evento cabe; o Directus reduz a imagem sozinho para a página e para a prévia. */
export const TAMANHO_MAXIMO_IMAGEM_EVENTO = 10 * 1024 * 1024;

/** O motivo para NÃO enviar o arquivo (texto para a pessoa), ou `null` quando pode enviar. */
export function problemaDaImagem(arquivo: { type: string; size: number } | null | undefined): string | null {
  if (!arquivo) return "Escolha um arquivo primeiro.";
  if (!TIPOS_IMAGEM_EVENTO.includes(String(arquivo.type || "").toLowerCase())) return "Envie uma imagem JPG, PNG ou WebP.";
  if (!(arquivo.size > 0)) return "Esse arquivo está vazio.";
  if (arquivo.size > TAMANHO_MAXIMO_IMAGEM_EVENTO) {
    const mb = (arquivo.size / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    return `A imagem tem ${mb} MB e o limite é 10 MB. Diminua a imagem e envie de novo.`;
  }
  return null;
}
