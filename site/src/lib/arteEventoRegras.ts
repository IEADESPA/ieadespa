/**
 * Crachá e certificado novos (10/11/2026, pedido do responsável: "como é para ser digital, não pode ser medíocre") — as REGRAS, sem
 * navegador: as cores, a configuração da aparência e do certificado (guardadas dentro de `eventos.cracha_config`, junto do que já ia no
 * crachá, para não precisar de campo novo no Directus), o texto do certificado e o nome do crachá. O desenho fica em `arteEvento.ts`
 * (canvas). Testado por `scripts/testes/arte-evento-unidade.cjs`.
 */

export type TemaCor = "azul" | "verde" | "vinho" | "grafite";

export interface Paleta {
  /** fundo das faixas e o nome */
  principal: string;
  /** a parte mais escura das faixas */
  escuro: string;
  /** o dourado dos detalhes */
  destaque: string;
  /** o fundo claro dos blocos */
  suave: string;
  /** o texto corrido */
  texto: string;
}

/** As cores saem da logo: o azul do "IEADESPA" com o dourado; as outras são variações para eventos de departamentos. */
export const PALETAS: Record<TemaCor, Paleta> = {
  azul: { principal: "#1B2A6B", escuro: "#0E1640", destaque: "#C9A227", suave: "#EEF1FA", texto: "#2B3550" },
  verde: { principal: "#17583A", escuro: "#0B3322", destaque: "#C9A227", suave: "#ECF5EF", texto: "#24382D" },
  vinho: { principal: "#6E1F33", escuro: "#3F0F1C", destaque: "#C9A227", suave: "#F8EEF0", texto: "#3D2730" },
  grafite: { principal: "#2B2F36", escuro: "#15171B", destaque: "#C9A227", suave: "#F1F2F4", texto: "#2B2F36" },
};

export const TEMAS: { valor: TemaCor; rotulo: string }[] = [
  { valor: "azul", rotulo: "Azul e dourado (a cor da logo)" },
  { valor: "verde", rotulo: "Verde e dourado" },
  { valor: "vinho", rotulo: "Vinho e dourado" },
  { valor: "grafite", rotulo: "Grafite e dourado" },
];

/** A cor da faixa do crachá por tipo de participante (para a equipe da portaria reconhecer de longe). */
export const CORES_TIPO: Record<string, string> = {
  Participante: "#1B2A6B",
  Preletor: "#A6800F",
  Equipe: "#15803D",
  Imprensa: "#B91C1C",
  Convidado: "#6D28D9",
};
export const corDoTipo = (tipo: string | null | undefined, paleta: Paleta) => (tipo && CORES_TIPO[tipo]) || paleta.principal;

export const TITULOS_CERTIFICADO = ["Participação", "Conclusão", "Honra ao Mérito", "Reconhecimento"] as const;

/** O modelo do texto do certificado. Os códigos entre chaves são trocados pelos dados de cada pessoa e do evento. */
export const TEXTO_PADRAO = "participou{qualidade} do evento {evento}, realizado em {data}{carga}.";
export const CODIGOS_TEXTO = [
  { codigo: "{evento}", explica: "o nome do evento" },
  { codigo: "{data}", explica: "a data do evento (ou o período, se for de vários dias)" },
  { codigo: "{carga}", explica: "\", com carga horária de …\" (some se a carga horária estiver vazia)" },
  { codigo: "{qualidade}", explica: "\" na qualidade de Preletor\" e afins (some para quem é Participante)" },
  { codigo: "{local}", explica: "a cidade do evento" },
];

export interface Assinante {
  nome: string;
  cargo: string;
  /** id do arquivo da assinatura no Directus (imagem), ou null */
  assinatura: string | null;
}

export interface ConfigVisual {
  tema: TemaCor;
  /** a imagem do evento no topo do crachá */
  usarCapa: boolean;
}

export interface ConfigCertificado {
  titulo: string;
  texto: string;
  carga: string;
  local: string;
  assinantes: Assinante[];
}

const LIMITES = { titulo: 40, texto: 400, carga: 40, local: 60, nome: 80, cargo: 80 } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Caracteres de controle e invisíveis (inclusive os que invertem o texto), montados pelo número. */
const INVISIVEIS = new RegExp(
  `[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]].map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("")}]`,
  "g",
);
export function linhaLimpa(valor: unknown, limite: number): string {
  if (typeof valor !== "string") return "";
  return valor.replace(INVISIVEIS, " ").replace(/\s+/g, " ").trim().slice(0, limite);
}

const objeto = (v: unknown): Record<string, unknown> => {
  let o = v;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      o = null;
    }
  }
  return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
};

/** A aparência guardada em `cracha_config.visual` (lixo vira o padrão: azul, com a imagem do evento). */
export function normalizarVisual(crachaConfig: unknown): ConfigVisual {
  const v = objeto(objeto(crachaConfig).visual);
  const tema = TEMAS.some((t) => t.valor === v.tema) ? (v.tema as TemaCor) : "azul";
  return { tema, usarCapa: v.usarCapa !== false };
}

/** O certificado guardado em `cracha_config.certificado` (o que faltar vira o padrão). */
export function normalizarCertificado(crachaConfig: unknown): ConfigCertificado {
  const c = objeto(objeto(crachaConfig).certificado);
  const assinantes = (Array.isArray(c.assinantes) ? c.assinantes : [])
    .map((a) => objeto(a))
    .map((a) => ({
      nome: linhaLimpa(a.nome, LIMITES.nome),
      cargo: linhaLimpa(a.cargo, LIMITES.cargo),
      assinatura: typeof a.assinatura === "string" && UUID.test(a.assinatura) ? a.assinatura : null,
    }))
    .filter((a) => a.nome)
    .slice(0, 2);
  return {
    titulo: linhaLimpa(c.titulo, LIMITES.titulo) || "Participação",
    texto: linhaLimpa(c.texto, LIMITES.texto) || TEXTO_PADRAO,
    carga: linhaLimpa(c.carga, LIMITES.carga),
    local: linhaLimpa(c.local, LIMITES.local),
    assinantes,
  };
}

/** O que o painel recusa antes de salvar (texto para a pessoa), ou null. */
export function problemaCertificado(c: { texto: string; assinantes: { nome: string; cargo: string }[] }): string | null {
  const desconhecidos = (c.texto.match(/\{[^}]*\}/g) || []).filter((x) => !CODIGOS_TEXTO.some((k) => k.codigo === x));
  if (desconhecidos.length) return `No texto do certificado, ${desconhecidos[0]} não é um código conhecido. Use só: ${CODIGOS_TEXTO.map((k) => k.codigo).join(", ")}.`;
  if (c.texto.trim() && !c.texto.includes("{evento}")) return "O texto do certificado precisa ter {evento} (o nome do evento).";
  if (c.assinantes.some((a) => !a.nome.trim() && a.cargo.trim())) return "Toda assinatura precisa do nome de quem assina.";
  return null;
}

/** O texto do certificado de uma pessoa, a partir do modelo (códigos desconhecidos ficam como estão — o painel já não deixa salvar). */
export function textoDoCertificado(modelo: string, dados: { evento: string; data: string; carga: string; local: string; tipo?: string | null }): string {
  const tipo = linhaLimpa(dados.tipo ?? "", 30);
  const valores: Record<string, string> = {
    "{evento}": `“${dados.evento}”`,
    "{data}": dados.data || "data a confirmar",
    "{carga}": dados.carga ? `, com carga horária de ${dados.carga}` : "",
    "{qualidade}": tipo && tipo !== "Participante" ? ` na qualidade de ${tipo}` : "",
    "{local}": dados.local,
  };
  return (modelo || TEXTO_PADRAO).replace(/\{[a-z]+\}/g, (k) => (k in valores ? valores[k] : k)).replace(/\s+([,.])/g, "$1").replace(/\s+/g, " ").trim();
}

/** O nome do crachá: o primeiro nome em destaque e o nome completo embaixo (só se for diferente). */
export function nomesDoCracha(nome: string): { destaque: string; completo: string | null } {
  const limpo = linhaLimpa(nome, 120);
  const partes = limpo.split(" ").filter(Boolean);
  if (!partes.length) return { destaque: "", completo: null };
  const destaque = partes[0];
  return { destaque, completo: partes.length > 1 ? limpo : null };
}

/** O endereço que o QR do certificado abre: a verificação pública já com o código. */
export function urlVerificacao(siteUrl: string, slug: string, codigo: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/verificar-certificado/${encodeURIComponent(slug)}/?codigo=${encodeURIComponent(codigo)}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "AAAA-MM-DD" (dia de calendário, sem fuso) → [ano, mês 0-11, dia], ou null. */
function dia(texto: string | null | undefined): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(texto ?? ""));
  if (!m) return null;
  const [a, me, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  return me >= 0 && me < 12 && d >= 1 && d <= 31 ? [a, me, d] : null;
}

/**
 * A data do evento por extenso: "28 de novembro de 2026", "28 e 29 de novembro de 2026" (dois dias seguidos), "28 a 30 de novembro de
 * 2026", "30 de novembro a 2 de dezembro de 2026", "30 de dezembro de 2026 a 2 de janeiro de 2027". `semAno` tira o ano (o crachá).
 */
export function periodoPorExtenso(inicio: string | null | undefined, fim: string | null | undefined, semAno = false): string {
  const a = dia(inicio);
  if (!a) return "";
  const b = dia(fim);
  const ano = (x: [number, number, number]) => (semAno ? "" : ` de ${x[0]}`);
  const um = (x: [number, number, number]) => `${x[2]} de ${MESES[x[1]]}${ano(x)}`;
  if (!b || (b[0] === a[0] && b[1] === a[1] && b[2] === a[2])) return um(a);
  const antes = b[0] < a[0] || (b[0] === a[0] && (b[1] < a[1] || (b[1] === a[1] && b[2] < a[2])));
  if (antes) return um(a); // fim antes do início: vale o início
  if (a[0] !== b[0]) return `${um(a)} a ${um(b)}`;
  if (a[1] !== b[1]) return `${a[2]} de ${MESES[a[1]]} a ${b[2]} de ${MESES[b[1]]}${ano(b)}`;
  return `${a[2]} ${b[2] - a[2] === 1 ? "e" : "a"} ${b[2]} de ${MESES[a[1]]}${ano(a)}`;
}

/** Nome de arquivo seguro ("Maria da Silva" → "maria-da-silva"). */
export function nomeDeArquivo(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "arquivo"
  );
}
