import { fetchItems, type Configuracoes } from "@/lib/directus";

export type Dia = "segunda" | "terca" | "quarta" | "quinta" | "sexta" | "sabado" | "domingo_manha" | "domingo_noite";
export type Escopo = "sede" | "congregacoes" | "todas";
export type Ocorrencia = "1" | "2" | "3" | "4_se_5" | "ultimo";

export interface ProgramacaoItem {
  day: Dia;
  title: string;
  scope: Escopo;
  occurrence: Ocorrencia | null;
  time: string | null;
}

export const DAY_ORDER: Dia[] = [
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo_manha",
  "domingo_noite",
];

export const DAY_LABEL: Record<Dia, string> = {
  segunda: "Segunda-feira",
  terca: "Terça-feira",
  quarta: "Quarta-feira",
  quinta: "Quinta-feira",
  sexta: "Sexta-feira",
  sabado: "Sábado",
  domingo_manha: "Domingo de manhã",
  domingo_noite: "Domingo à noite",
};

export const SCOPE_LABEL: Record<Escopo, string> = {
  sede: "Somente na Sede",
  congregacoes: "Nas congregações",
  todas: "Sede e congregações",
};

export const OCCURRENCE_LABEL: Record<Ocorrencia, string> = {
  "1": "1º domingo",
  "2": "2º domingo",
  "3": "3º domingo",
  "4_se_5": "4º domingo (meses com 5 domingos)",
  ultimo: "Último domingo do mês",
};

let cached: ProgramacaoItem[] | null = null;

/** Busca a programação semanal institucional. Fonte única — usada em toda página que mostra horário de culto. */
export async function getAllProgramacao(): Promise<ProgramacaoItem[]> {
  if (cached) return cached;
  cached = await fetchItems<ProgramacaoItem>("programacao", "sort[]=sort");
  return cached;
}

/** Só o que acontece na sede (exclui itens exclusivos de congregações). */
export const sedeProgramacao = (items: ProgramacaoItem[]) =>
  items
    .filter((item) => item.scope !== "congregacoes")
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));

/** Só o que acontece nas congregações (exclui itens exclusivos da sede). Mesma programação vale para todas — não há agenda própria por congregação. */
export const congregacaoProgramacao = (items: ProgramacaoItem[]) =>
  items
    .filter((item) => item.scope !== "sede")
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));

export const groupByDay = (items: ProgramacaoItem[]) =>
  DAY_ORDER.map((day) => ({
    day,
    label: DAY_LABEL[day],
    items: items.filter((item) => item.day === day),
  })).filter((group) => group.items.length > 0);

/**
 * Versão condensada (uma linha por dia) para espaços pequenos, como o topo
 * da página inicial. Domingo à noite vira uma única linha, já que tem uma
 * programação diferente a cada semana do mês.
 */
export function sedeProgramacaoCompacta(items: ProgramacaoItem[]) {
  return groupByDay(sedeProgramacao(items)).map((group) => {
    if (group.day === "domingo_noite") {
      return { label: group.label, title: "Programação mensal (varia por semana do mês)", time: null };
    }
    return { label: group.label, title: group.items[0].title, time: group.items[0].time };
  });
}

const SCHEMA_DAY: Record<Dia, string | null> = {
  segunda: null, // dia de descanso, sem culto
  terca: "Tuesday",
  quarta: "Wednesday",
  quinta: "Thursday",
  sexta: "Friday",
  sabado: "Saturday",
  domingo_manha: "Sunday",
  domingo_noite: null, // varia por semana do mês — não cabe num horário fixo semanal
};

/** Converte "18h", "19h30" etc. em "18:00", "19:30" (formato exigido pelo schema.org). */
const parseTime = (time: string): string | null => {
  const match = /^(\d{1,2})h(\d{2})?$/i.exec(time.trim());
  if (!match) return null;
  const [, hour, minute = "00"] = match;
  return `${hour.padStart(2, "0")}:${minute}`;
};

/**
 * Dados estruturados schema.org (tipo Church) com endereço, telefone e
 * horários de culto da sede — ajuda o Google a mostrar a igreja
 * corretamente em buscas locais e no Maps. Só entram itens com dia fixo na
 * semana e horário preenchido; a programação de domingo à noite (que muda
 * a cada semana do mês) fica de fora por não caber num horário fixo.
 */
export function churchStructuredData(
  config: Configuracoes,
  sedeSchedule: ProgramacaoItem[],
  siteUrl: string,
  siteName: string,
  socialUrls: string[] = [],
) {
  const openingHoursSpecification = sedeSchedule
    .map((item) => {
      const dayOfWeek = SCHEMA_DAY[item.day];
      const opens = item.time ? parseTime(item.time) : null;
      if (!dayOfWeek || !opens) return null;
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${dayOfWeek}`,
        opens,
        description: item.title,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    "@context": "https://schema.org",
    "@type": "Church",
    name: siteName,
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    image: `${siteUrl}/logo.png`,
    address: {
      "@type": "PostalAddress",
      streetAddress: config.address_line,
      addressLocality: config.address_city,
      addressRegion: config.address_state,
      postalCode: config.address_zip,
      addressCountry: "BR",
    },
    ...(config.phone && { telephone: config.phone }),
    ...(openingHoursSpecification.length > 0 && { openingHoursSpecification }),
    // Ajuda o Google a ligar essa entidade aos perfis de rede social —
    // um dos sinais usados pra montar o "card" de identidade na busca.
    ...(socialUrls.length > 0 && { sameAs: socialUrls }),
  };
}
