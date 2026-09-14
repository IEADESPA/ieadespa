/**
 * Congregações — vC.2 (FASE C). Fonte única passa a ser o sistema de
 * governança (Azure SQL), não mais a coleção "congregacoes" do Directus.
 * `dirigenteAtual` nunca é digitado em lugar nenhum: é calculado lá no
 * sistema a partir de quem tem o papel "Dirigente de Congregação"
 * concedido (Lideranca + Papeis), igual à composição da CLI.
 *
 * Chamada feita em build time (Astro SSG, sem adapter/output SSR) — roda
 * no runner do GitHub Actions, não no navegador do visitante, então não
 * existe questão de CORS aqui.
 */
const SISTEMA_API_URL = "https://app.ieadespa.org.br/api";

export interface CongregacaoPublica {
  congregacaoId: number;
  nome: string;
  slug: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  notaEndereco: string | null;
  horarios: string | null;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  googleMapsPlaceQuery: string | null;
  dirigenteAtual: string | null;
}

/** Endereço formatado pra exibição — mesma técnica que já existia pra
 * Configuracoes (sede) e pra congregação em `directus.ts`. */
export const congregacaoEndereco = (c: CongregacaoPublica) =>
  [c.endereco, c.bairro, c.cidade && c.estado ? `${c.cidade} – ${c.estado}` : null].filter(Boolean).join(", ");

export const congregacaoMapsQuery = (c: CongregacaoPublica) => congregacaoEndereco(c);

export async function fetchCongregacoesPublicas(): Promise<CongregacaoPublica[]> {
  const res = await fetch(`${SISTEMA_API_URL}/congregacoes-publico`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchCongregacaoPublicaPorSlug(slug: string): Promise<CongregacaoPublica | null> {
  const res = await fetch(`${SISTEMA_API_URL}/congregacoes-publico/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  return res.json();
}
