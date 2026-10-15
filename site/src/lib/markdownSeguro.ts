/**
 * Markdown → HTML das páginas PÚBLICAS (15/10/2026). Até aqui cada página chamava `marked.parse` direto e jogava o resultado na página sem filtro: quem pudesse editar
 * uma notícia (cada vez mais gente, com o painel de conteúdo) poderia publicar script na página pública, e a política de segurança do site aceita script em linha.
 * Agora o texto passa por aqui, no momento de montar o site:
 *   - HTML escrito à mão no meio do texto (`<script>`, `<img onerror=…>`, `<iframe>`…) NUNCA vira marcação: aparece como texto, para quem escreveu perceber;
 *   - link e imagem só com endereço http(s), mailto/tel (só link), relativo ou âncora; `javascript:`, `data:` e parecidos perdem o endereço (o texto do link fica);
 *   - todo o resto do markdown (títulos, listas, ênfase, tabelas, citação, código) continua exatamente como era — nos 39 textos que o site tem hoje a saída é idêntica.
 * (A pré-visualização do painel de conteúdo usa outra limpeza, feita no navegador, que tira as marcações em vez de mostrá-las.)
 */
import { Marked } from "marked";

const escapar = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Endereço aceito em `href`/`src`: http(s), mailto/tel (se permitido), relativo ou âncora. Espaços e caracteres de controle dentro do esquema (`java\tscript:`) saem antes de conferir. */
export function enderecoSeguro(valor: string | null | undefined, permitirMailtoTel: boolean): boolean {
  // eslint-disable-next-line no-control-regex
  const limpo = String(valor ?? "").replace(/[\x00-\x20\x7f-\x9f\u{2028}\u{2029}\u{200b}-\u{200f}\u{2060}\u{feff}]/gu, "");
  if (!limpo) return false;
  const esquema = /^([a-z][a-z0-9+.-]*):/i.exec(limpo);
  if (!esquema) return true;
  const p = esquema[1].toLowerCase();
  return p === "http" || p === "https" || (permitirMailtoTel && (p === "mailto" || p === "tel"));
}

const instancia = new Marked({
  renderer: {
    html({ text }) {
      return escapar(text);
    },
    link(token) {
      if (enderecoSeguro(token.href, true)) return false; // o desenho normal do marked
      return this.parser.parseInline(token.tokens); // endereço perigoso: fica só o texto do link
    },
    image(token) {
      if (enderecoSeguro(token.href, false)) return false;
      return escapar(token.text ?? "");
    },
  },
});

/** Markdown → HTML seguro (assíncrono, como o `marked.parse` que ele substitui). */
export async function renderizarMarkdown(markdown: string | null | undefined): Promise<string> {
  return await instancia.parse(markdown ?? "");
}
