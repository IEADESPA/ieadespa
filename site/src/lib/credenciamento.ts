/**
 * Credenciamento por sala ou ala (v7.13). Cada local de check-in do evento (`eventos.locais_checkin`) pode ter uma CAPACIDADE; a
 * tela de check-in mostra quantas pessoas entraram em cada local e avisa ao passar da capacidade (avisa, não barra: quem está na
 * porta decide). Cada entrada vira uma linha em `evento_entradas` (inscrição, local, hora do aparelho; quem fez o check-in o
 * próprio Directus guarda em `user_created`), e a mesma pessoa pode entrar em mais de um local. O relatório de AUSENTES (quem se
 * inscreveu, tinha vaga e não veio) sai por lote e por tipo de participante, para dimensionar o próximo evento.
 *
 * Compatível com o formato antigo: `locais_checkin` era só uma lista de nomes (["Portaria Leste"]); agora cada item pode ser o nome
 * (sem capacidade) ou `{ nome, capacidade }`. O painel grava o nome sozinho quando não há capacidade.
 */

export interface LocalCheckin {
  nome: string;
  capacidade: number | null;
}

export interface Entrada {
  inscricao: number | string;
  local: string | null;
  entrou_em?: string | null;
  date_created?: string | null;
}

const MAX_NOME_LOCAL = 120;

function capacidadeValida(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A lista de locais do evento, aceitando o formato antigo (só nomes), o novo ({ nome, capacidade }) ou os dois misturados. Nome repetido fica uma vez só. */
export function normalizarLocais(bruto: unknown): LocalCheckin[] {
  let lista: unknown = bruto;
  if (typeof lista === "string") {
    try {
      lista = JSON.parse(lista);
    } catch {
      lista = null;
    }
  }
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const saida: LocalCheckin[] = [];
  for (const item of lista) {
    const nome = String(typeof item === "string" ? item : (item as { nome?: unknown })?.nome ?? "").trim().slice(0, MAX_NOME_LOCAL);
    if (!nome || vistos.has(nome)) continue;
    vistos.add(nome);
    saida.push({ nome, capacidade: typeof item === "string" ? null : capacidadeValida((item as { capacidade?: unknown }).capacidade) });
  }
  return saida;
}

/** Como o painel grava: o nome sozinho quando não há capacidade (igual ao formato antigo), senão `{ nome, capacidade }`. */
export function serializarLocais(locais: LocalCheckin[]): (string | LocalCheckin)[] {
  return normalizarLocais(locais).map((l) => (l.capacidade == null ? l.nome : { nome: l.nome, capacidade: l.capacidade }));
}

/** O dia em Brasília (UTC-3, sem horário de verão) de um instante, AAAA-MM-DD. */
export function diaEmBrasilia(quando: Date | string | number): string {
  const d = quando instanceof Date ? quando : new Date(quando);
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A chave única da entrada: a mesma pessoa, no mesmo local, no mesmo dia, é UMA entrada (a fila sem internet pode reenviar sem duplicar). */
export function chaveEntrada(inscricaoId: number | string, local: string | null | undefined, quando: Date | string | number): string {
  return `${inscricaoId}:${(local ?? "").trim()}:${diaEmBrasilia(quando)}`;
}

const quandoDa = (e: Entrada) => e.entrou_em || e.date_created || null;

/**
 * Quantas PESSOAS entraram em cada local (pessoas diferentes; a mesma pessoa duas vezes no mesmo local conta uma). `dia` (AAAA-MM-DD)
 * limita às entradas daquele dia — é o que a tela de check-in usa (a sala de hoje). Devolve `{ "<local>": número }`; entradas sem local
 * ficam em "".
 */
export function contarPorLocal(entradas: Entrada[], dia: string | null = null): Record<string, number> {
  const pessoas = new Map<string, Set<string>>();
  for (const e of entradas) {
    if (dia) {
      const q = quandoDa(e);
      if (!q || diaEmBrasilia(q) !== dia) continue;
    }
    const local = (e.local ?? "").trim();
    if (!pessoas.has(local)) pessoas.set(local, new Set());
    pessoas.get(local)!.add(String(e.inscricao));
  }
  return Object.fromEntries([...pessoas].map(([local, s]) => [local, s.size]));
}

/** A pessoa já entrou neste local (neste dia, se `dia` vier)? */
export function jaEntrouNoLocal(entradas: Entrada[], inscricaoId: number | string, local: string | null, dia: string | null = null): boolean {
  const alvo = (local ?? "").trim();
  return entradas.some((e) => String(e.inscricao) === String(inscricaoId) && (e.local ?? "").trim() === alvo && (!dia || (quandoDa(e) != null && diaEmBrasilia(quandoDa(e)!) === dia)));
}

/** O aviso de capacidade de um local, ou null. Avisa ao CHEGAR na capacidade e, com mais força, ao PASSAR dela. */
export function avisoCapacidade(local: LocalCheckin | null | undefined, contagem: number): { nivel: "cheio" | "passou"; texto: string } | null {
  if (!local || local.capacidade == null) return null;
  if (contagem > local.capacidade) return { nivel: "passou", texto: `⚠️ ${local.nome} passou da capacidade: ${contagem} pessoas para ${local.capacidade} lugares.` };
  if (contagem === local.capacidade) return { nivel: "cheio", texto: `${local.nome} chegou à capacidade (${local.capacidade} pessoas). A próxima entrada passa do limite.` };
  return null;
}

/** A linha "Portaria Leste: 12 de 50" da tela de check-in. */
export function resumoLocais(locais: LocalCheckin[], contagens: Record<string, number>): { nome: string; texto: string; aviso: ReturnType<typeof avisoCapacidade> }[] {
  return locais.map((l) => {
    const n = contagens[l.nome] ?? 0;
    return { nome: l.nome, texto: l.capacidade == null ? `${l.nome}: ${n}` : `${l.nome}: ${n} de ${l.capacidade}`, aviso: avisoCapacidade(l, n) };
  });
}

// ---------- relatório de ausentes ----------

export interface InscricaoParaAusencia {
  id: number | string;
  nome: string;
  presente?: boolean | null;
  aguardando_vaga?: boolean | null;
  pendente_aprovacao?: boolean | null;
  faixa_rotulo?: string | null;
  tipo_participante?: string | null;
}

/**
 * Quem se inscreveu, TINHA VAGA e não veio: confirmado (fora da lista de espera e já aprovado), sem presença marcada e sem nenhuma
 * entrada registrada. Quem ficou na lista de espera ou aguardando aprovação não entra (não tinha lugar garantido).
 */
export function listarAusentes<T extends InscricaoParaAusencia>(inscricoes: T[], entradas: Entrada[] = []): T[] {
  const entraram = new Set(entradas.map((e) => String(e.inscricao)));
  return inscricoes.filter((i) => !i.aguardando_vaga && !i.pendente_aprovacao && !i.presente && !entraram.has(String(i.id)));
}

export const SEM_LOTE = "Sem lote";

/** Agrupa (por lote ou por tipo de participante), com os grupos em ordem alfabética e "Sem lote" no fim; dentro do grupo, por nome. */
export function agruparAusentes<T extends InscricaoParaAusencia>(lista: T[], por: "lote" | "tipo"): { grupo: string; pessoas: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const i of lista) {
    const chave = por === "lote" ? (i.faixa_rotulo || "").trim() || SEM_LOTE : (i.tipo_participante || "").trim() || "Participante";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(i);
  }
  return [...grupos]
    .sort(([a], [b]) => (a === SEM_LOTE ? 1 : b === SEM_LOTE ? -1 : a.localeCompare(b, "pt-BR")))
    .map(([grupo, pessoas]) => ({ grupo, pessoas: [...pessoas].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")) }));
}

/** O resumo numérico do relatório: por grupo, inscritos com vaga, ausentes e a taxa de ausência. */
export function resumoAusencia<T extends InscricaoParaAusencia>(inscricoes: T[], entradas: Entrada[], por: "lote" | "tipo") {
  const comVaga = inscricoes.filter((i) => !i.aguardando_vaga && !i.pendente_aprovacao);
  const ausentes = new Set(listarAusentes(inscricoes, entradas).map((i) => String(i.id)));
  return agruparAusentes(comVaga, por).map(({ grupo, pessoas }) => {
    const faltaram = pessoas.filter((p) => ausentes.has(String(p.id))).length;
    return { grupo, inscritos: pessoas.length, ausentes: faltaram, taxa: pessoas.length ? Math.round((faltaram / pessoas.length) * 100) : 0 };
  });
}
