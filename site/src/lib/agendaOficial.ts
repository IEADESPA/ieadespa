/**
 * Agenda oficial — v7.2 (canais oficiais na v7.3). O calendário oficial (eventos
 * homologados e públicos), a agenda litúrgica (grade semanal de cultos) e os canais
 * oficiais de comunicação (marcados como públicos) nascem no sistema de
 * governança; o site só lê. Mesma técnica de `congregacoes.ts`: chamada feita
 * em build time (Astro SSG, sem adapter SSR), no runner do GitHub Actions, sem
 * login e sem CORS.
 *
 * O Directus continua dono dos eventos COM INSCRIÇÃO e/ou PÁGINA própria
 * (`/evento/<slug>/`). O que muda é que a data/hora desses eventos passa a
 * seguir o calendário oficial quando o sistema aponta o mesmo `slugSite` —
 * ver `mesclarEventos`.
 *
 * Esta busca NUNCA derruba o build: se o sistema estiver fora do ar, o site
 * sai com `disponivel: false` e as telas caem para o que o Directus tem.
 */
import type { ProgramacaoItem } from "@/lib/programacao";

/**
 * Base da API do sistema. `SISTEMA_API_URL` (variável de ambiente) existe só
 * para testar o build contra um servidor falso local — em produção/CI não é
 * definida e vale o endereço oficial.
 */
export const SISTEMA_API_URL = (
  process.env.SISTEMA_API_URL || "https://app.ieadespa.org.br/api"
).replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Contrato de `GET /agenda-publica/tudo`
// ---------------------------------------------------------------------------

export type AbrangenciaEventoOficial = "CAMPO" | "AREAS" | "CONGREGACAO";

export interface EventoOficial {
  id: number;
  titulo: string;
  descricao: string | null;
  /** Dia de calendário "AAAA-MM-DD". */
  dataInicio: string;
  /** Último dia (inclusive) de eventos de vários dias; `null` = um dia só. */
  dataFim: string | null;
  horaInicio: string | null;
  horaFim: string | null;
  /** Hora de início já no formato do site ("19h30"). */
  hora: string | null;
  nivel: number;
  tipo: string;
  tipoNome: string;
  abrangencia: AbrangenciaEventoOficial;
  congregacaoId: number | null;
  congregacaoNome: string | null;
  areas: string[];
  local: string | null;
  /** Slug do evento do Directus que tem página/inscrição própria, se houver. */
  slugSite: string | null;
  origem: "PROPOSTA" | "REGRA";
}

export type CategoriaCanalOficial = "INSTITUCIONAL" | "GRUPO_OFICIAL";

/**
 * Canal oficial de comunicação (Estatuto, Art. 12) marcado como público no sistema.
 * Tudo aqui é texto NÃO CONFIÁVEL: as telas só podem usá-lo como texto (nunca `set:html`).
 */
export interface CanalOficial {
  id: number;
  nome: string;
  /** Código da plataforma (ex.: "WHATSAPP"). */
  plataforma: string;
  /** Nome para exibir (ex.: "WhatsApp"). */
  rotuloPlataforma: string;
  categoria: CategoriaCanalOficial;
  /** Já formatado: "@perfil", telefone, e-mail, endereço https:// ou NOME do grupo. */
  identificador: string;
  /** Só https://, mailto: ou tel: (validado aqui); `null` quando não há link (ex.: grupo). */
  link: string | null;
  /** "CAMPO" | "AREA" | "DEPARTAMENTO" | "CONGREGACAO" (outro valor cai em "Outros canais"). */
  escopo: string;
  /** "Todo o campo", "Área X", "Congregação Y", "Departamento Z". */
  rotuloEscopo: string;
  congregacaoNome: string | null;
  areaNome: string | null;
  departamentoNome: string | null;
  descricao: string | null;
}

export interface AgendaOficial {
  /** `false` quando o sistema não respondeu (o site segue com o Directus). */
  disponivel: boolean;
  /** Hash de 16 hex do que o site mostra; "indisponivel" quando não carregou. */
  versao: string;
  eventos: EventoOficial[];
  /** Mesmo formato de `ProgramacaoItem`. */
  liturgia: ProgramacaoItem[];
  /** Canais oficiais públicos; `[]` em resposta antiga sem `canais` ou com a agenda indisponível. */
  canais: CanalOficial[];
}

const AGENDA_INDISPONIVEL: AgendaOficial = Object.freeze({
  disponivel: false,
  versao: "indisponivel",
  eventos: [],
  liturgia: [],
  canais: [],
}) as AgendaOficial;

// ---------------------------------------------------------------------------
// Busca (3 tentativas, 60 s cada, uma chamada por build)
// ---------------------------------------------------------------------------

const TENTATIVAS = 3;
/** Espera antes da 2ª e da 3ª tentativa. */
const ESPERAS_MS = [5_000, 15_000];
/** A primeira chamada do dia pode acordar o banco serverless — tolera até 60 s. */
const TIMEOUT_MS = 60_000;

const DIAS = new Set([
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo_manha",
  "domingo_noite",
]);
const ESCOPOS = new Set(["sede", "congregacoes", "todas"]);
const OCORRENCIAS = new Set(["1", "2", "3", "4_se_5", "ultimo"]);
const ABRANGENCIAS = new Set(["CAMPO", "AREAS", "CONGREGACAO"]);
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Erro cujo retry não adianta (ex.: 404 porque a rota nova ainda não foi publicada). */
class ErroDefinitivo extends Error {}

function eventoValido(valor: unknown): valor is EventoOficial {
  if (!valor || typeof valor !== "object") return false;
  const e = valor as Record<string, unknown>;
  return (
    typeof e.id === "number" &&
    typeof e.titulo === "string" &&
    e.titulo.trim() !== "" &&
    typeof e.dataInicio === "string" &&
    DATA_ISO.test(e.dataInicio) &&
    (e.dataFim == null || (typeof e.dataFim === "string" && DATA_ISO.test(e.dataFim))) &&
    typeof e.abrangencia === "string" &&
    ABRANGENCIAS.has(e.abrangencia)
  );
}

function liturgiaValida(valor: unknown): valor is ProgramacaoItem {
  if (!valor || typeof valor !== "object") return false;
  const i = valor as Record<string, unknown>;
  return (
    typeof i.day === "string" &&
    DIAS.has(i.day) &&
    typeof i.title === "string" &&
    typeof i.scope === "string" &&
    ESCOPOS.has(i.scope) &&
    (i.occurrence == null || (typeof i.occurrence === "string" && OCORRENCIAS.has(i.occurrence)))
  );
}

const CATEGORIAS_CANAL = new Set(["INSTITUCIONAL", "GRUPO_OFICIAL"]);

const textoOuNulo = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;

/**
 * Só aceita link que abre com `https://`, `mailto:` ou `tel:` e que o `URL` entende;
 * qualquer outra coisa (http, javascript:, data:, texto solto...) vira `null` — o canal
 * continua listado, só sem o botão "Abrir".
 */
export function linkSeguro(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const link = valor.trim();
  if (!/^(https:\/\/|mailto:|tel:)/i.test(link) || /[\s<>"]/.test(link)) return null;
  try {
    new URL(link);
  } catch {
    return null;
  }
  return link;
}

/** Normaliza um canal da resposta; `null` se faltar id numérico, nome, plataforma ou identificador. */
function canalNormalizado(valor: unknown): CanalOficial | null {
  if (!valor || typeof valor !== "object") return null;
  const c = valor as Record<string, unknown>;
  const nome = textoOuNulo(c.nome);
  const plataforma = textoOuNulo(c.plataforma);
  const identificador = textoOuNulo(c.identificador);
  if (typeof c.id !== "number" || !Number.isFinite(c.id) || !nome || !plataforma || !identificador)
    return null;
  return {
    id: c.id,
    nome,
    plataforma,
    rotuloPlataforma: textoOuNulo(c.rotuloPlataforma) ?? plataforma,
    categoria:
      typeof c.categoria === "string" && CATEGORIAS_CANAL.has(c.categoria)
        ? (c.categoria as CategoriaCanalOficial)
        : "INSTITUCIONAL",
    identificador,
    link: linkSeguro(c.link),
    escopo: typeof c.escopo === "string" ? c.escopo : "",
    rotuloEscopo: textoOuNulo(c.rotuloEscopo) ?? "",
    congregacaoNome: textoOuNulo(c.congregacaoNome),
    areaNome: textoOuNulo(c.areaNome),
    departamentoNome: textoOuNulo(c.departamentoNome),
    descricao: textoOuNulo(c.descricao),
  };
}

/** Confere o formato da resposta e descarta itens malformados (com aviso), em vez de quebrar as telas. */
function validarResposta(corpo: unknown): AgendaOficial {
  if (!corpo || typeof corpo !== "object") throw new Error("resposta não é um objeto JSON");
  const c = corpo as Record<string, unknown>;
  if (typeof c.versao !== "string" || c.versao === "") throw new Error("resposta sem `versao`");
  if (!Array.isArray(c.eventos) || !Array.isArray(c.liturgia))
    throw new Error("resposta sem `eventos`/`liturgia`");

  const eventos = c.eventos.filter(eventoValido).map((e) => ({
    ...e,
    descricao: e.descricao ?? null,
    dataFim: e.dataFim ?? null,
    hora: e.hora ?? null,
    local: e.local ?? null,
    congregacaoId: e.congregacaoId ?? null,
    congregacaoNome: e.congregacaoNome ?? null,
    slugSite: e.slugSite || null,
    areas: Array.isArray(e.areas) ? e.areas : [],
    tipoNome: e.tipoNome || "",
  }));
  const liturgia = c.liturgia
    .filter(liturgiaValida)
    .map((i) => ({ ...i, occurrence: i.occurrence ?? null, time: i.time ?? null }));

  // Resposta antiga (sem `canais`) ou `canais` malformado => lista vazia, sem derrubar nada.
  const canaisBrutos = Array.isArray(c.canais) ? c.canais : [];
  const canais = canaisBrutos
    .map(canalNormalizado)
    .filter((canal): canal is CanalOficial => !!canal);

  const descartados =
    c.eventos.length -
    eventos.length +
    (c.liturgia.length - liturgia.length) +
    (canaisBrutos.length - canais.length);
  if (descartados > 0)
    console.warn(
      `[agenda-oficial] ${descartados} item(ns) da resposta descartado(s) por formato inválido.`,
    );

  return { disponivel: true, versao: c.versao, eventos, liturgia, canais };
}

async function tentarUmaVez(url: string): Promise<AgendaOficial> {
  const resposta = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) {
    const mensagem = `HTTP ${resposta.status}`;
    // 429 (limite por origem) e 5xx são passageiros; os demais 4xx não mudam com o tempo.
    if (resposta.status === 429 || resposta.status >= 500) throw new Error(mensagem);
    throw new ErroDefinitivo(mensagem);
  }
  return validarResposta(await resposta.json());
}

async function carregar(): Promise<AgendaOficial> {
  const url = `${SISTEMA_API_URL}/agenda-publica/tudo`;
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      return await tentarUmaVez(url);
    } catch (erro) {
      ultimoErro = erro;
      if (erro instanceof ErroDefinitivo) break;
      if (tentativa < TENTATIVAS) {
        const espera = ESPERAS_MS[tentativa - 1] ?? ESPERAS_MS.at(-1) ?? 0;
        console.warn(
          `[agenda-oficial] tentativa ${tentativa}/${TENTATIVAS} falhou (${descrever(erro)}); nova tentativa em ${espera / 1000} s.`,
        );
        await esperar(espera);
      }
    }
  }

  console.warn(
    `[agenda-oficial] INDISPONÍVEL (${descrever(ultimoErro)}) em ${url}. O build segue sem o calendário oficial: ` +
      "eventos e grade de cultos virão só do Directus.",
  );
  return AGENDA_INDISPONIVEL;
}

function descrever(erro: unknown): string {
  if (erro instanceof Error) {
    if (erro.name === "TimeoutError") return `sem resposta em ${TIMEOUT_MS / 1000} s`;
    const causa = (erro as Error & { cause?: { code?: string } }).cause?.code;
    return causa ? `${erro.message}: ${causa}` : erro.message;
  }
  return String(erro);
}

// Cache de build: guarda a PROMESSA, não o resultado — o Astro renderiza várias
// páginas ao mesmo tempo (eventos, home, contato, busca...) e todas precisam
// compartilhar a mesma chamada, senão cada uma dispararia a sua.
let cache: Promise<AgendaOficial> | null = null;

/** Busca a agenda oficial (eventos + liturgia). Uma chamada por build; nunca lança erro. */
export function fetchAgendaOficial(): Promise<AgendaOficial> {
  cache ??= carregar();
  return cache;
}

// ---------------------------------------------------------------------------
// Mescla com os eventos do Directus
// ---------------------------------------------------------------------------

/** Formato de evento que as telas do site já usam (coleção `eventos` do Directus). */
export interface EventoSite {
  slug: string;
  title: string;
  event_date: string | null;
  end_date: string | null;
  time: string | null;
  location: string | null;
  location_maps_url?: string | null;
  /** CongregacaoId do sistema de governança (não é relação do Directus). */
  congregacao: number | null;
  responsavel: string | null;
  description: string;
  body: string | null;
  registration_url: string | null;
  aceita_inscricao: boolean;
  /** Presente nos itens que vieram (ou foram datados) pelo calendário oficial. */
  origem?: "oficial";
  /** Id do evento no sistema — SÓ nos itens criados a partir dele (`agenda-<id>`), não nos do Directus com `slugSite`. */
  agendaId?: number;
  /** Nome do tipo do evento oficial ("Aniversário da Congregação"), para a etiqueta da lista. */
  tipoNome?: string;
}

/** Prefixo do slug dos eventos oficiais sem página própria (`agenda-<id>`). */
export const SLUG_AGENDA_PREFIXO = "agenda-";

/** UID estável de um evento oficial no .ics — não muda entre builds. */
export const uidAgenda = (id: number) => `agenda-${id}@ieadespa.org.br`;

const localDoEventoOficial = (e: EventoOficial): string | null => {
  if (e.local) return e.local;
  if (e.abrangencia === "CAMPO") return "Todo o campo";
  if (e.abrangencia === "AREAS") return e.areas.length > 0 ? `Áreas: ${e.areas.join(", ")}` : null;
  return e.congregacaoNome;
};

/** Ordena por data de início (sem data vai pro fim); estável, então empates mantêm a ordem de entrada. */
const porData = (a: EventoSite, b: EventoSite) => {
  const dataA = a.event_date ? new Date(a.event_date).getTime() : Number.POSITIVE_INFINITY;
  const dataB = b.event_date ? new Date(b.event_date).getTime() : Number.POSITIVE_INFINITY;
  return dataA - dataB;
};

/**
 * Junta os eventos oficiais à lista do Directus:
 *  (a) `slugSite` igual ao `slug` de um evento do Directus: o item do Directus
 *      (com página/inscrição) fica, mas data, data final e hora passam a ser as
 *      oficiais — o calendário oficial é soberano.
 *  (b) sem correspondência: item novo `agenda-<id>`, sem página própria
 *      (`body: null`, `aceita_inscricao: false` → `hasEventPage` dá falso).
 * Itens oficiais levam `origem: "oficial"` e `tipoNome` (etiqueta na lista).
 * Com a agenda indisponível devolve só o Directus, ordenado.
 */
export function mesclarEventos(eventosDirectus: EventoSite[], agenda: AgendaOficial): EventoSite[] {
  const mesclados = eventosDirectus.map((e) => ({ ...e }));
  const porSlug = new Map<string, EventoSite>();
  for (const evento of mesclados)
    if (evento.slug && !porSlug.has(evento.slug)) porSlug.set(evento.slug, evento);
  const jaCasados = new Set<EventoSite>();
  const novos: EventoSite[] = [];

  for (const oficial of agenda.eventos) {
    const doDirectus = oficial.slugSite ? porSlug.get(oficial.slugSite) : undefined;

    if (doDirectus && !jaCasados.has(doDirectus)) {
      jaCasados.add(doDirectus);
      doDirectus.event_date = oficial.dataInicio;
      doDirectus.end_date = oficial.dataFim;
      // Hora vazia no oficial = "não informada", não "sem hora": mantém a do Directus.
      doDirectus.time = oficial.hora ?? doDirectus.time;
      doDirectus.origem = "oficial";
      doDirectus.tipoNome = oficial.tipoNome || undefined;
      continue;
    }

    novos.push({
      slug: `${SLUG_AGENDA_PREFIXO}${oficial.id}`,
      agendaId: oficial.id,
      title: oficial.titulo,
      event_date: oficial.dataInicio,
      end_date: oficial.dataFim,
      time: oficial.hora,
      location: localDoEventoOficial(oficial),
      location_maps_url: null,
      congregacao: oficial.abrangencia === "CONGREGACAO" ? oficial.congregacaoId : null,
      responsavel: null,
      description: oficial.descricao ?? "",
      body: null,
      registration_url: null,
      aceita_inscricao: false,
      origem: "oficial",
      tipoNome: oficial.tipoNome || undefined,
    });
  }

  return [...mesclados, ...novos].sort(porData);
}

/**
 * Só a regra (a) de `mesclarEventos`, para as páginas de UM evento (`/evento/<slug>/`
 * e o .ics dele): os eventos do Directus que o calendário oficial aponta por
 * `slugSite` ganham a data, a data final e a hora oficiais, para a página não
 * contradizer a lista. Não cria itens novos e preserva todos os campos do evento.
 */
export function aplicarDatasOficiais<
  T extends Pick<EventoSite, "slug" | "event_date" | "end_date" | "time">,
>(eventosDirectus: T[], agenda: AgendaOficial): T[] {
  const resultado = eventosDirectus.map((e) => ({ ...e }));
  const porSlug = new Map<string, T>();
  for (const evento of resultado)
    if (evento.slug && !porSlug.has(evento.slug)) porSlug.set(evento.slug, evento);
  const jaCasados = new Set<T>();

  for (const oficial of agenda.eventos) {
    const doDirectus = oficial.slugSite ? porSlug.get(oficial.slugSite) : undefined;
    if (!doDirectus || jaCasados.has(doDirectus)) continue;
    jaCasados.add(doDirectus);
    doDirectus.event_date = oficial.dataInicio;
    doDirectus.end_date = oficial.dataFim;
    doDirectus.time = oficial.hora ?? doDirectus.time;
  }
  return resultado;
}
