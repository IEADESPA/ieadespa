import { fetchItems } from "@/lib/directus";

/**
 * Ordem fixa das categorias na página — não é alfabética nem por
 * quantidade de perguntas, é a ordem que faz sentido pra quem está lendo
 * (primeira visita primeiro, transparência por último).
 */
export const CATEGORY_ORDER = [
  "primeira-visita",
  "cultos",
  "doacoes",
  "mensagens",
  "site",
  "oracao",
  "eventos",
  "transparencia",
] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  "primeira-visita": "Primeira visita",
  cultos: "Cultos e congregações",
  doacoes: "Doações",
  mensagens: "Mensagens e conteúdo",
  site: "Usando o site",
  oracao: "Oração",
  eventos: "Eventos",
  transparencia: "Transparência",
};

interface DirectusFaqItem {
  id: number;
  pergunta: string;
  resposta: string;
  categoria: string;
  draft: boolean;
}

export interface FaqItem {
  pergunta: string;
  resposta: string;
  categoria: string;
}

export interface FaqGroup {
  categoria: string;
  label: string;
  items: FaqItem[];
}

let cached: FaqItem[] | null = null;

/** Busca todas as perguntas frequentes do Directus. Roda em tempo de build. */
export async function getAllFaq(): Promise<FaqItem[]> {
  if (cached) return cached;
  const items = await fetchItems<DirectusFaqItem>("faq", "sort=categoria,sort");
  cached = items
    .filter((item) => !item.draft)
    .map((item) => ({ pergunta: item.pergunta, resposta: item.resposta, categoria: item.categoria }));
  return cached;
}

/** Agrupa por categoria, na ordem fixa de `CATEGORY_ORDER` — categoria sem
 * nenhuma pergunta simplesmente não aparece, em vez de virar um título vazio. */
export function groupFaqByCategory(items: FaqItem[]): FaqGroup[] {
  return CATEGORY_ORDER.map((categoria) => ({
    categoria,
    label: CATEGORY_LABEL[categoria] ?? categoria,
    items: items.filter((item) => item.categoria === categoria),
  })).filter((group) => group.items.length > 0);
}
