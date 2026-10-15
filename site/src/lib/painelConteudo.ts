/**
 * Painel de conteúdo (/painel-conteudo/) — o "motor" configurável.
 *
 * A equipe edita notícias e mensagens numa página bonita (e boa no celular) em vez do Directus
 * "cru". Tudo o que muda de um tipo de conteúdo para outro mora num objeto de configuração
 * (`TIPOS_CONTEUDO` abaixo): coleção, títulos, colunas da lista, como saber se é rascunho, como
 * montar o endereço público e a lista de campos do formulário, agrupada em seções. As páginas
 * (`lista.astro`, `editar.astro`, `index.astro`) não conhecem nenhum tipo: só leem esta configuração.
 *
 * Para acrescentar um tipo novo (FAQ, programação, galeria…): um objeto novo em `TIPOS_CONTEUDO`
 * (e a permissão da função no Directus). Nada mais.
 *
 * Este arquivo é "puro" (sem tocar em `document` ao ser importado): serve tanto ao servidor, que monta
 * os cartões da página inicial, quanto ao navegador. O desenho dos campos fica em `painelConteudoCampos.ts`.
 */
import { marked } from "marked";
import { irParaLogin, obterTokenValido, renovarToken } from "@/lib/painelAuth";

// ----------------------------------------------------------------------------------------------
// Configuração
// ----------------------------------------------------------------------------------------------

export type TipoCampo =
  | "text"
  | "textarea"
  | "markdown"
  | "select"
  | "boolean"
  | "date"
  | "datetime"
  | "image"
  | "m2o"
  | "number"
  | "url"
  | "slug"
  | "readonly";

export interface OpcaoCampo {
  valor: string;
  rotulo: string;
}

/** Valor inicial de um item NOVO: um valor fixo, "hoje" (data local) ou "agora" (data e hora locais). */
export type PadraoCampo = string | number | boolean | null | "hoje" | "agora";

export interface CampoConteudo {
  /** Nome do campo no Directus. */
  nome: string;
  tipo: TipoCampo;
  /** Texto do rótulo, em português. */
  rotulo: string;
  ajuda?: string;
  placeholder?: string;
  /** Sem isto não salva nem como rascunho. */
  obrigatorio?: boolean;
  /** Só é cobrado na hora de PUBLICAR (rascunho pode ficar incompleto). */
  obrigatorioParaPublicar?: boolean;
  padrao?: PadraoCampo;
  /** text/textarea/markdown: tamanho máximo. */
  maxLength?: number;
  /** textarea/markdown: altura inicial, em linhas. */
  linhas?: number;
  /** select: as opções. */
  opcoes?: OpcaoCampo[];
  /** number: limites e passo. */
  min?: number;
  max?: number;
  passo?: number;
  /** m2o: de onde vêm as opções (coleção e campo mostrado). */
  colecaoRelacionada?: string;
  campoRotuloRelacionado?: string;
  /** slug: campo de onde o endereço é gerado enquanto a pessoa não o edita. */
  slugDe?: string;
  /** readonly: como mostrar o valor. */
  formato?: "texto" | "sim-nao" | "data" | "datahora";
  rotuloSim?: string;
  rotuloNao?: string;
  /**
   * Preenchido sozinho pelo painel: "hoje-ao-salvar-publicado" grava a data de hoje sempre que a pessoa
   * salva um item que JÁ estava publicado (ex.: "Atualizada em" das mensagens).
   */
  automatico?: "hoje-ao-salvar-publicado";
  /** Em telas largas, ocupa só metade da linha. */
  meia?: boolean;
}

export interface SecaoConteudo {
  id: string;
  titulo: string;
  descricao?: string;
  campos: CampoConteudo[];
}

export interface TipoConteudo {
  /** Valor de `?tipo=` nas páginas do painel. */
  id: string;
  /** Coleção do Directus. */
  colecao: string;
  titulos: {
    plural: string;
    singular: string;
    nova: string;
    /** "esta notícia": usado em frases como "Excluir esta notícia". */ esta: string;
  };
  /** Frase do cartão da página inicial. */
  descricao: string;
  icone: string;
  campoTitulo: string;
  campoData?: string;
  campoCategoria?: string;
  campoCapa?: string;
  campoDestaque?: string;
  /** Qual campo diz se é rascunho e qual valor dele significa "rascunho". */
  rascunho: { campo: string; valorRascunho: boolean };
  /**
   * Campo booleano que um robô marca DEPOIS de avisar os inscritos (notificação no navegador). Quando existe e está
   * falso, publicar dispara aviso de verdade; a tela de confirmação diz isso.
   */
  campoNotificacao?: string;
  /** Campo que mostra "última atualização" (quando a coleção tem um). */
  campoAtualizado?: { campo: string; rotulo: string; tipo: "data" | "datahora" };
  /** `sort` do Directus (campos com "-" na frente são decrescentes). */
  ordenacao: string[];
  /** Endereço do item no site público (ou null se ainda não tem). */
  urlPublica: (item: Record<string, unknown>) => string | null;
  secoes: SecaoConteudo[];
}

const CATEGORIAS_MENSAGENS = [
  "Fé e Doutrina",
  "Família",
  "Jovens",
  "Discipulado",
  "Louvor e Adoração",
  "Testemunhos",
  "Notícias e Avisos",
];

const noticias: TipoConteudo = {
  id: "noticias",
  colecao: "noticias",
  titulos: { plural: "Notícias", singular: "notícia", nova: "Nova notícia", esta: "esta notícia" },
  descricao: "Avisos e novidades da igreja que aparecem na página de notícias.",
  icone: "📰",
  campoTitulo: "title",
  campoData: "date",
  campoCategoria: "category",
  campoCapa: "cover",
  campoDestaque: "featured",
  rascunho: { campo: "draft", valorRascunho: true },
  campoNotificacao: "notificacao_enviada",
  ordenacao: ["-date", "-id"],
  urlPublica: (item) => (item.slug ? `/noticia/${item.slug}/` : null),
  secoes: [
    {
      id: "principal",
      titulo: "A notícia",
      campos: [
        {
          nome: "title",
          tipo: "text",
          rotulo: "Título",
          obrigatorio: true,
          maxLength: 200,
          placeholder: "Ex.: Culto de gratidão neste domingo",
        },
        {
          nome: "slug",
          tipo: "slug",
          rotulo: "Endereço (slug)",
          obrigatorio: true,
          slugDe: "title",
          maxLength: 120,
          ajuda: "É o final do endereço da notícia no site. Só letras minúsculas, números e hífen.",
        },
        {
          nome: "excerpt",
          tipo: "textarea",
          rotulo: "Resumo",
          obrigatorioParaPublicar: true,
          linhas: 3,
          maxLength: 400,
          ajuda: "Uma ou duas frases. Aparece na lista de notícias e na prévia do WhatsApp.",
        },
        {
          nome: "body",
          tipo: "markdown",
          rotulo: "Texto da notícia",
          obrigatorioParaPublicar: true,
          linhas: 14,
          ajuda:
            "Use os botões acima do texto para negrito, título, lista etc. Veja como fica na aba Prévia.",
        },
      ],
    },
    {
      id: "detalhes",
      titulo: "Detalhes",
      campos: [
        {
          nome: "category",
          tipo: "select",
          rotulo: "Categoria",
          padrao: "institucional",
          meia: true,
          opcoes: [
            { valor: "institucional", rotulo: "Institucional" },
            { valor: "eventos", rotulo: "Eventos" },
            { valor: "comunicado", rotulo: "Comunicado" },
            { valor: "testemunho", rotulo: "Testemunho" },
          ],
        },
        {
          nome: "date",
          tipo: "date",
          rotulo: "Data exibida",
          padrao: "hoje",
          meia: true,
          obrigatorioParaPublicar: true,
          ajuda:
            "A data que aparece na notícia. Não agenda nada: o site mostra assim que for publicada.",
        },
        {
          nome: "cover",
          tipo: "image",
          rotulo: "Imagem de capa",
          ajuda: "JPEG, PNG, WebP ou GIF, até 8 MB. Fica melhor na horizontal.",
        },
        {
          nome: "featured",
          tipo: "boolean",
          rotulo: "Destacar na página inicial",
          ajuda: "A notícia aparece em destaque no topo do site.",
        },
        {
          nome: "orgao_relacionado",
          tipo: "m2o",
          rotulo: "Ministério ou órgão relacionado (opcional)",
          colecaoRelacionada: "orgao_membros",
          campoRotuloRelacionado: "name",
        },
      ],
    },
    {
      id: "entrevista",
      titulo: "Entrevista (opcional)",
      descricao: "Só para notícias baseadas numa entrevista ou testemunho.",
      campos: [
        {
          nome: "entrevistado_nome",
          tipo: "text",
          rotulo: "Nome do entrevistado",
          maxLength: 120,
          meia: true,
        },
        {
          nome: "entrevistado_papel",
          tipo: "text",
          rotulo: "Papel ou função",
          maxLength: 120,
          meia: true,
          placeholder: "Ex.: Diaconisa, Congregação Sede",
        },
      ],
    },
    {
      id: "envio",
      titulo: "Aviso no navegador",
      campos: [
        {
          nome: "notificacao_enviada",
          tipo: "readonly",
          rotulo: "Notificação enviada",
          formato: "sim-nao",
          rotuloSim: "Sim — quem ativou os avisos já foi notificado.",
          rotuloNao:
            "Ainda não — ao publicar pela primeira vez, quem ativou os avisos no site recebe uma notificação.",
        },
      ],
    },
  ],
};

const mensagens: TipoConteudo = {
  id: "mensagens",
  colecao: "mensagens",
  titulos: {
    plural: "Mensagens",
    singular: "mensagem",
    nova: "Nova mensagem",
    esta: "esta mensagem",
  },
  descricao: "Estudos, pregações e reflexões publicados na página de mensagens.",
  icone: "📖",
  campoTitulo: "title",
  campoData: "date",
  campoCategoria: "category",
  campoCapa: "cover",
  campoDestaque: "featured",
  rascunho: { campo: "draft", valorRascunho: true },
  campoNotificacao: "notificacao_enviada",
  campoAtualizado: { campo: "updated_date", rotulo: "Atualizada em", tipo: "data" },
  ordenacao: ["-date", "-id"],
  urlPublica: (item) => (item.slug ? `/mensagem/${item.slug}/` : null),
  secoes: [
    {
      id: "principal",
      titulo: "A mensagem",
      campos: [
        {
          nome: "title",
          tipo: "text",
          rotulo: "Título",
          obrigatorio: true,
          maxLength: 200,
          placeholder: "Ex.: Perseverando na Palavra e na comunhão",
        },
        {
          nome: "slug",
          tipo: "slug",
          rotulo: "Endereço (slug)",
          obrigatorio: true,
          slugDe: "title",
          maxLength: 120,
          ajuda:
            "É o final do endereço da mensagem no site. Só letras minúsculas, números e hífen.",
        },
        {
          nome: "excerpt",
          tipo: "textarea",
          rotulo: "Resumo",
          obrigatorioParaPublicar: true,
          linhas: 3,
          maxLength: 400,
          ajuda: "Uma ou duas frases. Aparece na lista de mensagens e na prévia do WhatsApp.",
        },
        {
          nome: "body",
          tipo: "markdown",
          rotulo: "Texto da mensagem",
          obrigatorioParaPublicar: true,
          linhas: 16,
          ajuda:
            "Use os botões acima do texto para negrito, título, lista etc. Veja como fica na aba Prévia.",
        },
      ],
    },
    {
      id: "detalhes",
      titulo: "Detalhes",
      campos: [
        {
          nome: "category",
          tipo: "select",
          rotulo: "Tema",
          padrao: "Notícias e Avisos",
          meia: true,
          opcoes: CATEGORIAS_MENSAGENS.map((c) => ({ valor: c, rotulo: c })),
        },
        {
          nome: "date",
          tipo: "date",
          rotulo: "Data exibida",
          padrao: "hoje",
          meia: true,
          obrigatorioParaPublicar: true,
          ajuda:
            "A data que aparece na mensagem. Não agenda nada: o site mostra assim que for publicada.",
        },
        {
          nome: "updated_date",
          tipo: "readonly",
          rotulo: "Atualizada em",
          formato: "data",
          automatico: "hoje-ao-salvar-publicado",
          ajuda: "Preenchida sozinha quando você salva uma mensagem que já está publicada.",
        },
        {
          nome: "cover",
          tipo: "image",
          rotulo: "Imagem de capa",
          ajuda: "JPEG, PNG, WebP ou GIF, até 8 MB. Fica melhor na horizontal.",
        },
        {
          nome: "featured",
          tipo: "boolean",
          rotulo: "Destacar na página inicial",
          ajuda: "A mensagem aparece em destaque no topo do site.",
        },
      ],
    },
    {
      id: "autor",
      titulo: "Quem ministrou",
      campos: [
        {
          nome: "author_name",
          tipo: "text",
          rotulo: "Nome",
          padrao: "Secretaria da IEADESPA",
          maxLength: 120,
          meia: true,
          placeholder: "Ex.: Pr. Mariano Fernandes Moreira",
        },
        {
          nome: "author_role",
          tipo: "text",
          rotulo: "Função",
          padrao: "Comunicação e Avisos",
          maxLength: 120,
          meia: true,
          placeholder: "Ex.: Pastor Presidente",
        },
      ],
    },
    {
      id: "extras",
      titulo: "Vídeo e série (opcional)",
      campos: [
        {
          nome: "video_url",
          tipo: "url",
          rotulo: "Endereço do vídeo (YouTube)",
          placeholder: "https://www.youtube.com/watch?v=…",
          ajuda: "Cole o link do vídeo; ele aparece na página da mensagem.",
        },
        {
          nome: "serie",
          tipo: "text",
          rotulo: "Nome da série",
          maxLength: 120,
          meia: true,
          placeholder: "Ex.: Fundamentos da Fé",
        },
        {
          nome: "serie_ordem",
          tipo: "number",
          rotulo: "Parte nº",
          min: 1,
          max: 999,
          passo: 1,
          meia: true,
          ajuda: "Posição desta mensagem dentro da série (1, 2, 3…).",
        },
      ],
    },
    {
      id: "envio",
      titulo: "Aviso no navegador",
      campos: [
        {
          nome: "notificacao_enviada",
          tipo: "readonly",
          rotulo: "Notificação enviada",
          formato: "sim-nao",
          rotuloSim: "Sim — quem ativou os avisos já foi notificado.",
          rotuloNao:
            "Ainda não — ao publicar pela primeira vez, quem ativou os avisos no site recebe uma notificação.",
        },
      ],
    },
  ],
};

/** O registro: para um tipo novo, acrescente um objeto aqui. */
export const TIPOS_CONTEUDO: Record<string, TipoConteudo> = { noticias, mensagens };

export const obterTipo = (id: string | null | undefined): TipoConteudo | null =>
  id && Object.prototype.hasOwnProperty.call(TIPOS_CONTEUDO, id) ? TIPOS_CONTEUDO[id] : null;

export const todosCampos = (tipo: TipoConteudo): CampoConteudo[] =>
  tipo.secoes.flatMap((s) => s.campos);

/** Campo de endereço (slug) do tipo, se houver. */
export const campoSlugDe = (tipo: TipoConteudo): CampoConteudo | null =>
  todosCampos(tipo).find((c) => c.tipo === "slug") ?? null;

/** Campos que a LISTA precisa ler do Directus. */
export function camposDaLista(tipo: TipoConteudo): string[] {
  const nomes = [
    "id",
    tipo.campoTitulo,
    campoSlugDe(tipo)?.nome,
    tipo.campoData,
    tipo.campoCategoria,
    tipo.campoCapa,
    tipo.campoDestaque,
    tipo.rascunho.campo,
    tipo.campoNotificacao,
    tipo.campoAtualizado?.campo,
  ];
  return [...new Set(nomes.filter((n): n is string => Boolean(n)))];
}

/** Campos que a EDIÇÃO precisa ler do Directus. */
export function camposDaEdicao(tipo: TipoConteudo): string[] {
  const nomes = [
    "id",
    tipo.rascunho.campo,
    tipo.campoNotificacao,
    tipo.campoAtualizado?.campo,
    ...todosCampos(tipo).map((c) => c.nome),
  ];
  return [...new Set(nomes.filter((n): n is string => Boolean(n)))];
}

/** Item publicado = o campo de rascunho NÃO vale "rascunho" (o site mostra tudo o que não é `draft: true`). */
export const estaPublicado = (tipo: TipoConteudo, item: Record<string, unknown>): boolean =>
  item[tipo.rascunho.campo] !== tipo.rascunho.valorRascunho;

/** Endereços das páginas do painel. */
export const painelUrls = {
  inicio: "/painel-conteudo/",
  entrar: "/painel-conteudo/entrar/",
  lista: (tipo: string) => `/painel-conteudo/lista/?tipo=${encodeURIComponent(tipo)}`,
  editar: (tipo: string, id?: number | string | null) =>
    `/painel-conteudo/editar/?tipo=${encodeURIComponent(tipo)}${id ? `&id=${encodeURIComponent(String(id))}` : ""}`,
};

/** Sessão do painel de conteúdo: chaves em sessionStorage e tela de login. */
export const AUTH_CONTEUDO = {
  tokenKey: "painel_conteudo_token",
  loginPath: "/painel-conteudo/entrar/",
};

/** Canal que leva a sessão da aba de login para a aba de edição que ficou sem sessão (mesma origem). */
export const CANAL_SESSAO = "painel_conteudo_sessao";

/**
 * Liga o script de uma tela quando a página (re)aparece. Com a troca de página do Astro (ClientRouter) um script
 * "de módulo" roda UMA vez só; voltar a uma tela já visitada não o executa de novo. Por isso cada tela chama isto: a
 * função de início roda agora e também a cada `astro:page-load`, uma vez por cópia da página (marca no elemento raiz).
 */
export function iniciarQuandoPronto(
  seletorRaiz: string,
  iniciar: (raiz: HTMLElement) => void,
): void {
  const tentar = () => {
    const raiz = document.querySelector<HTMLElement>(seletorRaiz);
    if (!raiz || raiz.dataset.pcIniciado) return;
    raiz.dataset.pcIniciado = "1";
    iniciar(raiz);
  };
  tentar();
  document.addEventListener("astro:page-load", tentar);
}

/** Endereço de volta aceito depois do login: só caminho do próprio site (nunca outro domínio). */
export function voltarSeguro(voltar: string | null | undefined, padrao: string): string {
  if (voltar && voltar.startsWith("/") && !voltar.startsWith("//") && !voltar.startsWith("/\\"))
    return voltar;
  return padrao;
}

// ----------------------------------------------------------------------------------------------
// Datas
// ----------------------------------------------------------------------------------------------

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Hoje, no calendário LOCAL, como `AAAA-MM-DD` (campo "date" do Directus). */
export function hojeLocal(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
}

/** Agora, no relógio LOCAL, no formato do `<input type="datetime-local">`: `AAAA-MM-DDTHH:mm`. */
export function agoraLocalInput(agora: Date = new Date()): string {
  return `${hojeLocal(agora)}T${doisDigitos(agora.getHours())}:${doisDigitos(agora.getMinutes())}`;
}

/** ISO (com fuso, vindo do Directus) → texto do `<input type="datetime-local">` no horário LOCAL. Vazio se inválido. */
export function isoParaLocalInput(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  // Sem fuso no texto (formato "dateTime" do Directus: 2026-10-01T18:30:00) vale como horário local.
  const d = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso)
    ? new Date(`${iso}`)
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return agoraLocalInput(d);
}

/** Texto do `<input type="datetime-local">` (horário LOCAL) → ISO em UTC para gravar. Nulo se vazio ou inválido. */
export function localInputParaIso(valor: string): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** `AAAA-MM-DD` (ou ISO) → `dd/mm/aaaa`, sem passar por `Date` (não sofre com fuso). */
export function dataBR(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** ISO → `dd/mm/aaaa HH:mm` no horário local. */
export function dataHoraBR(valor: unknown): string {
  const local = isoParaLocalInput(valor);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : "";
}

const dataValida = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return (
    d.getFullYear() === Number(m[1]) &&
    d.getMonth() === Number(m[2]) - 1 &&
    d.getDate() === Number(m[3])
  );
};

// ----------------------------------------------------------------------------------------------
// Endereço (slug)
// ----------------------------------------------------------------------------------------------

/** Texto → endereço: minúsculas, sem acento, só letras/números, hífen entre as palavras. */
export function slugify(texto: string, limite = 80): string {
  let s = String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > limite) s = s.slice(0, limite).replace(/-[^-]*$/, "") || s.slice(0, limite);
  return s.replace(/-+$/g, "");
}

export const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ----------------------------------------------------------------------------------------------
// Valores: Directus <-> formulário, valores iniciais e validação
// ----------------------------------------------------------------------------------------------

export type Valores = Record<string, unknown>;

/** Valor inicial de um campo num item NOVO. */
export function valorPadrao(campo: CampoConteudo): unknown {
  const p = campo.padrao;
  if (p === "hoje")
    return campo.tipo === "datetime" ? localInputParaIso(agoraLocalInput()) : hojeLocal();
  if (p === "agora")
    return campo.tipo === "date" ? hojeLocal() : localInputParaIso(agoraLocalInput());
  if (p !== undefined) return p;
  return campo.tipo === "boolean" ? false : null;
}

/** O que o formulário entrega (texto digitado etc.) → o que o Directus guarda. Vazio vira `null`. */
export function paraDirectus(campo: CampoConteudo, bruto: unknown): unknown {
  switch (campo.tipo) {
    case "boolean":
      return Boolean(bruto);
    case "number": {
      if (bruto === null || bruto === undefined || bruto === "") return null;
      return typeof bruto === "number" ? bruto : Number(String(bruto).replace(",", "."));
    }
    case "m2o": {
      if (bruto === null || bruto === undefined || bruto === "") return null;
      const n = Number(bruto);
      return Number.isFinite(n) ? n : String(bruto);
    }
    case "markdown": {
      const t = typeof bruto === "string" ? bruto.replace(/\r\n?/g, "\n") : "";
      return t.trim() === "" ? null : t.replace(/\s+$/, "");
    }
    case "datetime": {
      return typeof bruto === "string" && bruto ? bruto : null;
    }
    default: {
      const t = typeof bruto === "string" ? bruto.trim() : bruto;
      return t === "" || t === undefined ? null : t;
    }
  }
}

/** Valida UM campo. Devolve a mensagem de erro (em português) ou `null`. `publicar` liga os obrigatórios "para publicar". */
export function validarCampo(
  campo: CampoConteudo,
  valor: unknown,
  publicar: boolean,
): string | null {
  // Número digitado que o navegador não conseguiu entender (ex.: "1e"): chega como NaN.
  if (typeof valor === "number" && Number.isNaN(valor))
    return `"${campo.rotulo}" precisa ser um número.`;
  const vazio = valor === null || valor === undefined || valor === "";
  if (vazio) {
    if (campo.obrigatorio) return `Preencha o campo "${campo.rotulo}".`;
    if (publicar && campo.obrigatorioParaPublicar)
      return `Para publicar, preencha "${campo.rotulo}". (Você pode salvar como rascunho sem isso.)`;
    return null;
  }
  switch (campo.tipo) {
    case "slug":
      if (typeof valor !== "string" || !SLUG_VALIDO.test(valor))
        return "O endereço só pode ter letras minúsculas sem acento, números e hífen entre as palavras (ex.: culto-de-gratidao).";
      break;
    case "url": {
      let ok = false;
      try {
        const u = new URL(String(valor));
        ok = u.protocol === "http:" || u.protocol === "https:";
      } catch {
        ok = false;
      }
      if (!ok)
        return `"${campo.rotulo}" precisa ser um endereço completo, começando com http:// ou https://.`;
      break;
    }
    case "number": {
      const n = Number(valor);
      if (!Number.isFinite(n)) return `"${campo.rotulo}" precisa ser um número.`;
      if (campo.min !== undefined && n < campo.min)
        return `"${campo.rotulo}" não pode ser menor que ${campo.min}.`;
      if (campo.max !== undefined && n > campo.max)
        return `"${campo.rotulo}" não pode ser maior que ${campo.max}.`;
      break;
    }
    case "date":
      if (typeof valor !== "string" || !dataValida(valor))
        return `Data inválida em "${campo.rotulo}".`;
      break;
    case "datetime":
      if (typeof valor !== "string" || Number.isNaN(new Date(valor).getTime()))
        return `Data e hora inválidas em "${campo.rotulo}".`;
      break;
    default:
      break;
  }
  if (campo.maxLength && typeof valor === "string" && valor.length > campo.maxLength)
    return `"${campo.rotulo}" passou do limite de ${campo.maxLength} letras (tem ${valor.length}).`;
  return null;
}

export interface ErroCampo {
  campo: string;
  mensagem: string;
}

export function validarTudo(tipo: TipoConteudo, valores: Valores, publicar: boolean): ErroCampo[] {
  const erros: ErroCampo[] = [];
  for (const campo of todosCampos(tipo)) {
    if (campo.tipo === "readonly") continue;
    const m = validarCampo(campo, valores[campo.nome], publicar);
    if (m) erros.push({ campo: campo.nome, mensagem: m });
  }
  return erros;
}

// ----------------------------------------------------------------------------------------------
// Erros do Directus em português simples
// ----------------------------------------------------------------------------------------------

interface ErroDirectus {
  message?: string;
  extensions?: { code?: string; field?: string; collection?: string };
}

export interface ExplicacaoErro {
  mensagem: string;
  /** Campo do formulário a que o erro se refere (para marcar na tela). */
  campo?: string;
  status: number;
}

/** Transforma uma resposta de erro do Directus numa frase que a pessoa entende; o motivo técnico vai no fim, quando ajuda. */
export function explicarErroDirectus(
  status: number,
  json: unknown,
  acao: string,
  tipo?: TipoConteudo,
): ExplicacaoErro {
  const erros: ErroDirectus[] = Array.isArray((json as { errors?: unknown })?.errors)
    ? (json as { errors: ErroDirectus[] }).errors
    : [];
  const e = erros[0];
  const codigo = e?.extensions?.code ?? "";
  const campo = e?.extensions?.field;
  const slug = tipo ? campoSlugDe(tipo)?.nome : undefined;
  if (status === 403) return { status, mensagem: `Seu perfil não pode ${acao} aqui.` };
  if (status === 401)
    return {
      status,
      mensagem: "Sua sessão acabou. Entre de novo; o que você digitou continua na tela.",
    };
  if (status === 404)
    return {
      status,
      mensagem: "Este item não existe mais (talvez outra pessoa o tenha excluído).",
    };
  if (status === 400 && codigo === "RECORD_NOT_UNIQUE") {
    if (campo && campo === slug)
      return {
        status,
        campo,
        mensagem:
          "Já existe outro item com este endereço (slug). Troque o endereço e salve de novo.",
      };
    return {
      status,
      campo,
      mensagem: `Já existe outro item com o mesmo valor${campo ? ` em "${campo}"` : ""}. Troque e salve de novo.`,
    };
  }
  if (
    status === 400 &&
    (codigo === "FAILED_VALIDATION" ||
      codigo === "INVALID_PAYLOAD" ||
      codigo === "VALUE_TOO_LONG" ||
      codigo === "VALUE_OUT_OF_RANGE" ||
      codigo === "INVALID_QUERY")
  ) {
    return {
      status,
      campo,
      mensagem: `O servidor recusou estes dados${e?.message ? `: ${e.message}` : "."}`,
    };
  }
  if (status === 400 && codigo === "CONTENT_TOO_LARGE")
    return { status, mensagem: "O arquivo é grande demais para o servidor." };
  if (status === 413) return { status, mensagem: "O arquivo é grande demais para o servidor." };
  if (status === 429)
    return { status, mensagem: "Muitas tentativas seguidas. Espere um minuto e tente de novo." };
  if (status >= 500)
    return {
      status,
      mensagem: `O servidor está instável agora. O que você digitou continua na tela; tente de novo em instantes. (código ${status})`,
    };
  return {
    status,
    campo,
    mensagem: `Não foi possível ${acao} agora${e?.message ? `: ${e.message}` : ""}. (código ${status})`,
  };
}

// ----------------------------------------------------------------------------------------------
// Conversa com o Directus (token do próprio usuário)
// ----------------------------------------------------------------------------------------------

/** A sessão não pôde ser renovada. Quem pega este erro NÃO perde nada da tela: oferece "Entrar de novo". */
export class SessaoExpiradaErro extends Error {
  constructor() {
    super("sessão expirada");
    this.name = "SessaoExpiradaErro";
  }
}

export type ApiPainel = (caminho: string, init?: RequestInit) => Promise<Response>;

/**
 * Cliente do Directus com a sessão do painel: põe o token, e num 401 renova (uma vez, sem corrida — `painelAuth`)
 * e repete. Se não der para renovar: com `redirecionar` manda para o login (páginas sem nada digitado) e, sem ele,
 * lança `SessaoExpiradaErro` para a tela de edição manter o texto e oferecer "Entrar de novo".
 * `caminho` começa com "/" (ex.: `/items/noticias`).
 */
export function criarApi(
  directusUrl: string,
  opcoes: { redirecionar: boolean } = { redirecionar: false },
): ApiPainel {
  const { tokenKey, loginPath } = AUTH_CONTEUDO;
  const semSessao = (): never => {
    if (opcoes.redirecionar) irParaLogin(loginPath);
    throw new SessaoExpiradaErro();
  };
  return async (caminho, init = {}) => {
    const chamar = (token: string) => {
      const headers = new Headers(init.headers || {});
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(`${directusUrl}${caminho}`, { ...init, headers });
    };
    let token = await obterTokenValido(directusUrl, tokenKey);
    if (!token) return semSessao();
    let res = await chamar(token);
    if (res.status !== 401) return res;
    token = await renovarToken(directusUrl, tokenKey);
    if (!token) return semSessao();
    res = await chamar(token);
    if (res.status === 401) return semSessao();
    return res;
  };
}

// ----------------------------------------------------------------------------------------------
// Markdown seguro (prévia)
// ----------------------------------------------------------------------------------------------

/** Tags que a prévia mostra; qualquer outra tem a "casca" retirada (o texto de dentro fica). */
const TAGS_PERMITIDAS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "img",
  "code",
  "pre",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

/** Tags perigosas ou que carregam coisa de fora: somem inteiras, junto com o que tiver dentro. */
const TAGS_DESCARTADAS = new Set([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "noscript",
  "template",
  "svg",
  "math",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "optgroup",
  "datalist",
  "link",
  "meta",
  "base",
  "title",
  "head",
  "audio",
  "video",
  "source",
  "track",
  "canvas",
  "dialog",
  "portal",
  "noembed",
  "noframes",
  "xmp",
  "plaintext",
  "slot",
  "marquee",
  "bgsound",
  "isindex",
  "keygen",
  "param",
  "map",
  "area",
]);

/**
 * Endereço seguro para `href`/`src`: só http(s), mailto (se permitido) ou relativo. Os navegadores ignoram espaços e
 * caracteres de controle dentro do esquema (`java\tscript:`), então eles saem antes de conferir. Devolve o endereço
 * limpo ou `null` (descartar o atributo).
 */
export function urlSegura(valor: string, permitirMailto: boolean): string | null {
  // eslint-disable-next-line no-control-regex
  const limpo = String(valor ?? "").replace(
    /[\x00-\x20\x7f-\x9f\u{2028}\u{2029}\u{200b}-\u{200f}\u{2060}\u{feff}]/gu,
    "",
  );
  if (!limpo) return null;
  const esquema = /^([a-z][a-z0-9+.-]*):/i.exec(limpo);
  if (esquema) {
    const p = esquema[1].toLowerCase();
    if (p === "http" || p === "https") return limpo;
    if (p === "mailto" && permitirMailto) return limpo;
    return null;
  }
  return limpo;
}

interface EstadoLimpeza {
  removidos: number;
}

function limparNos(origem: Node, destino: Node, estado: EstadoLimpeza): void {
  for (const no of Array.from(origem.childNodes)) {
    if (no.nodeType === 3 /* texto */) {
      destino.appendChild(document.createTextNode(no.textContent ?? ""));
      continue;
    }
    if (no.nodeType !== 1 /* elemento */) continue; // comentários, instruções: somem
    const el = no as Element;
    const tag = el.tagName.toLowerCase();
    if (TAGS_DESCARTADAS.has(tag)) {
      estado.removidos++;
      continue;
    }
    if (!TAGS_PERMITIDAS.has(tag)) {
      limparNos(el, destino, estado); // tira só a casca (div, span, section…): o texto fica
      continue;
    }
    const novo = document.createElement(tag);
    if (tag === "a") {
      const href = urlSegura(el.getAttribute("href") ?? "", true);
      if (href) {
        novo.setAttribute("href", href);
        if (/^https?:/i.test(href) || href.startsWith("//")) {
          novo.setAttribute("target", "_blank");
          novo.setAttribute("rel", "noopener noreferrer");
        }
      } else if (el.hasAttribute("href")) estado.removidos++;
      const titulo = el.getAttribute("title");
      if (titulo) novo.setAttribute("title", titulo);
    } else if (tag === "img") {
      const src = urlSegura(el.getAttribute("src") ?? "", false);
      if (!src) {
        estado.removidos++;
        continue; // imagem sem endereço seguro não vale nada
      }
      novo.setAttribute("src", src);
      novo.setAttribute("alt", el.getAttribute("alt") ?? "");
      const titulo = el.getAttribute("title");
      if (titulo) novo.setAttribute("title", titulo);
      novo.setAttribute("loading", "lazy");
      novo.setAttribute("referrerpolicy", "no-referrer");
    }
    // Atributos fora da lista (on…, style, class, id…) simplesmente não são copiados.
    if (tag !== "br" && tag !== "hr" && tag !== "img") limparNos(el, novo, estado);
    destino.appendChild(novo);
  }
}

/**
 * Limpa um HTML qualquer: devolve um pedaço de DOM novo, montado só com as tags e atributos permitidos
 * (nenhum nó do original é reaproveitado — nada de `on…`, `style`, `script`, `iframe`). Só roda no navegador.
 */
export function sanitizarParaFragmento(html: string): {
  fragmento: DocumentFragment;
  removidos: number;
} {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    "text/html",
  );
  const fragmento = document.createDocumentFragment();
  const estado: EstadoLimpeza = { removidos: 0 };
  limparNos(doc.body, fragmento, estado);
  return { fragmento, removidos: estado.removidos };
}

/** Mesma limpeza, devolvendo texto HTML (útil em testes). */
export function sanitizarHtml(html: string): string {
  const { fragmento } = sanitizarParaFragmento(html);
  const caixa = document.createElement("div");
  caixa.appendChild(fragmento);
  return caixa.innerHTML;
}

/** Markdown → DOM da prévia, já sanitizado. */
export function renderizarMarkdownSeguro(markdown: string): {
  fragmento: DocumentFragment;
  removidos: number;
} {
  const html = marked.parse(markdown ?? "", { async: false }) as string;
  return sanitizarParaFragmento(html);
}
