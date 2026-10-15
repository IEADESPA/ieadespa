/**
 * Painel de conteúdo (/painel-conteudo/) — o "motor" configurável.
 *
 * A equipe edita notícias, mensagens, perguntas frequentes, programação, galeria, ministérios, história e as
 * páginas Sobre/Crenças numa página bonita (e boa no celular) em vez do Directus "cru". Tudo o que muda de um tipo de
 * conteúdo para outro mora num objeto de configuração (`TIPOS_CONTEUDO` abaixo): coleção, títulos, colunas da lista,
 * como saber se é rascunho (ou nada: vai direto ao site), ordenação manual, item único (singleton), páginas públicas,
 * como montar o endereço público e a lista de campos do formulário, agrupada em seções. As páginas (`lista.astro`,
 * `editar.astro`, `index.astro`) não conhecem nenhum tipo: só leem esta configuração.
 *
 * Para acrescentar um tipo novo: um objeto novo em `TIPOS_CONTEUDO` (e a permissão da função no Directus). Nada mais.
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
  | "imagens"
  | "m2o"
  | "number"
  | "url"
  | "slug"
  | "readonly";

export interface OpcaoCampo {
  valor: string;
  rotulo: string;
}

/** Campo "imagens" (várias fotos): a tabela de ligação (junction) do Directus que guarda uma linha por foto. */
export interface RelacaoImagens {
  /** Coleção da ligação (ex.: `historia_files`). */
  colecao: string;
  /** Campo da ligação que aponta para o item pai (ex.: `historia_id`). */
  campoPai: string;
  /** Campo da ligação que aponta para o arquivo (ex.: `directus_files_id`). */
  campoArquivo: string;
  /** Campo numérico da ligação com a posição da foto. */
  campoOrdem: string;
}

/** O que o campo "imagens" guarda na tela: uma linha da ligação (`id` vazio = foto nova ainda não salva). */
export interface FotoLigada {
  id: number | null;
  arquivo: string;
  /** Posição guardada hoje no Directus (nula numa foto nova): serve para saber se a ordem mudou. */
  ordem?: number | null;
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
  /** Frase mostrada quando um campo obrigatório fica vazio (padrão: "Preencha o campo …"). */
  mensagemObrigatorio?: string;
  /** Só é cobrado na hora de PUBLICAR (rascunho pode ficar incompleto). */
  obrigatorioParaPublicar?: boolean;
  padrao?: PadraoCampo;
  /** text/textarea/markdown: tamanho máximo. */
  maxLength?: number;
  /** text: sugere (lista ao digitar) os valores que já existem nesse campo na coleção — evita álbuns, grupos etc. escritos de jeitos diferentes. */
  sugerirExistentes?: boolean;
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
  /** m2o: campo da coleção relacionada que dá a ordem dos grupos na lista (ex.: `sort`). */
  campoOrdemRelacionado?: string;
  /** slug: campo de onde o endereço é gerado enquanto a pessoa não o edita. */
  slugDe?: string;
  /** imagens: a tabela de ligação e o limite de fotos (padrão 30). */
  imagens?: RelacaoImagens;
  maximo?: number;
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

/** Seção da página inicial do painel em que o cartão do tipo aparece. */
export type GrupoHome = "noticias" | "paginas" | "institucional";

export const GRUPOS_HOME: { id: GrupoHome; titulo: string; descricao: string }[] = [
  {
    id: "noticias",
    titulo: "Notícias e mensagens",
    descricao: "O que você escreve toda semana: avisos, novidades e pregações.",
  },
  {
    id: "paginas",
    titulo: "Páginas e informações",
    descricao: "Textos e fotos das páginas de consulta do site.",
  },
  {
    id: "institucional",
    titulo: "Institucional",
    descricao: "O que fala da igreja: ministérios, história e páginas fixas.",
  },
];

/** Uma página do site pública que mostra este tipo de conteúdo (para o link "Ver no site"). */
export interface PaginaPublica {
  rotulo: string;
  url: string;
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
  /** Em que seção da página inicial o cartão aparece. */
  grupo: GrupoHome;
  /** Páginas do site que mostram este conteúdo (link "Ver no site" na lista e no formulário). */
  paginasPublicas: PaginaPublica[];
  campoTitulo: string;
  campoData?: string;
  campoCategoria?: string;
  campoCapa?: string;
  campoDestaque?: string;
  /**
   * Campos cujo texto aparece, separado por " · ", embaixo do título na lista (select mostra o rótulo da opção,
   * data vira dd/mm/aaaa). Sem isto vale `campoData` + `campoCategoria`.
   */
  camposMeta?: string[];
  /**
   * Qual campo diz se é rascunho e qual valor dele significa "rascunho". SEM isto o tipo não tem rascunho: o que for
   * salvo vai ao site na próxima montagem (a tela avisa e só oferece "Salvar").
   */
  rascunho?: { campo: string; valorRascunho: boolean };
  /** Item único (ex.: textos fixos do site): a lista não existe, o cartão abre direto o formulário; sem "novo" nem "excluir". */
  unico?: boolean;
  /**
   * Ordem manual: o campo numérico (`sort`) define a ordem no site. A lista mostra ▲/▼ que trocam os valores de
   * `sort` entre vizinhos; item novo entra no fim (`maior sort + 1`). Com `agruparPor`, a ordem vale DENTRO de cada
   * grupo (ex.: perguntas dentro de cada categoria; atividades dentro de cada dia) e a lista mostra os grupos.
   */
  ordem?: { campo: string; agruparPor?: string; rotuloSemGrupo?: string };
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
  grupo: "noticias",
  paginasPublicas: [{ rotulo: "Notícias", url: "/noticias/" }],
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
  grupo: "noticias",
  paginasPublicas: [{ rotulo: "Mensagens", url: "/mensagens/" }],
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

// ----------------------------------------------------------------------------------------------
// Segundo lote: perguntas frequentes, programação, ministérios, história, galeria e páginas fixas
// ----------------------------------------------------------------------------------------------

/** Mesmas opções (e mesma ordem) do campo `categoria` do FAQ no Directus e de `CATEGORY_ORDER` em `src/lib/faq.ts`. */
const CATEGORIAS_FAQ: OpcaoCampo[] = [
  { valor: "primeira-visita", rotulo: "Primeira visita" },
  { valor: "cultos", rotulo: "Cultos e congregações" },
  { valor: "doacoes", rotulo: "Doações" },
  { valor: "mensagens", rotulo: "Mensagens e conteúdo" },
  { valor: "site", rotulo: "Usando o site" },
  { valor: "oracao", rotulo: "Oração" },
  { valor: "eventos", rotulo: "Eventos" },
  { valor: "transparencia", rotulo: "Transparência" },
];

const faq: TipoConteudo = {
  id: "faq",
  colecao: "faq",
  titulos: {
    plural: "Perguntas frequentes",
    singular: "pergunta",
    nova: "Nova pergunta",
    esta: "esta pergunta",
  },
  descricao: "As perguntas e respostas da página “Dúvidas frequentes”.",
  icone: "❓",
  grupo: "paginas",
  paginasPublicas: [{ rotulo: "Dúvidas frequentes", url: "/duvidas-frequentes/" }],
  campoTitulo: "pergunta",
  campoCategoria: "categoria",
  camposMeta: [],
  rascunho: { campo: "draft", valorRascunho: true },
  ordem: { campo: "sort", agruparPor: "categoria" },
  ordenacao: ["sort", "id"],
  urlPublica: () => null,
  secoes: [
    {
      id: "principal",
      titulo: "A pergunta e a resposta",
      campos: [
        {
          nome: "pergunta",
          tipo: "text",
          rotulo: "Pergunta",
          obrigatorio: true,
          maxLength: 255,
          placeholder: "Ex.: Tem estacionamento?",
        },
        {
          nome: "resposta",
          tipo: "textarea",
          rotulo: "Resposta",
          obrigatorio: true,
          linhas: 6,
          ajuda:
            "Texto simples: o site mostra exatamente o que você escrever aqui, sem negrito nem links.",
        },
        {
          nome: "categoria",
          tipo: "select",
          rotulo: "Grupo da pergunta",
          obrigatorio: true,
          opcoes: CATEGORIAS_FAQ,
          ajuda:
            "Em qual grupo da página a pergunta aparece. A ordem dentro do grupo você muda na lista, com as setas ▲ e ▼.",
        },
      ],
    },
  ],
};

const DIAS_PROGRAMACAO: OpcaoCampo[] = [
  { valor: "segunda", rotulo: "Segunda-feira" },
  { valor: "terca", rotulo: "Terça-feira" },
  { valor: "quarta", rotulo: "Quarta-feira" },
  { valor: "quinta", rotulo: "Quinta-feira" },
  { valor: "sexta", rotulo: "Sexta-feira" },
  { valor: "sabado", rotulo: "Sábado" },
  { valor: "domingo_manha", rotulo: "Domingo de manhã" },
  { valor: "domingo_noite", rotulo: "Domingo à noite" },
];

const programacao: TipoConteudo = {
  id: "programacao",
  colecao: "programacao",
  titulos: {
    plural: "Programação semanal",
    singular: "atividade",
    nova: "Nova atividade",
    esta: "esta atividade",
  },
  descricao: "Os cultos e reuniões de cada dia da semana, na Sede e nas congregações.",
  icone: "🗓️",
  grupo: "paginas",
  paginasPublicas: [
    { rotulo: "Página inicial", url: "/" },
    { rotulo: "Contato", url: "/contato/" },
  ],
  campoTitulo: "title",
  camposMeta: ["scope", "occurrence", "time"],
  ordem: { campo: "sort", agruparPor: "day" },
  ordenacao: ["sort", "id"],
  urlPublica: () => null,
  secoes: [
    {
      id: "principal",
      titulo: "A atividade",
      campos: [
        {
          nome: "day",
          tipo: "select",
          rotulo: "Dia da semana",
          obrigatorio: true,
          meia: true,
          opcoes: DIAS_PROGRAMACAO,
        },
        {
          nome: "scope",
          tipo: "select",
          rotulo: "Onde acontece",
          padrao: "todas",
          meia: true,
          opcoes: [
            { valor: "todas", rotulo: "Sede e congregações" },
            { valor: "sede", rotulo: "Somente na Sede" },
            { valor: "congregacoes", rotulo: "Nas congregações" },
          ],
        },
        {
          nome: "title",
          tipo: "text",
          rotulo: "Nome da atividade",
          obrigatorio: true,
          maxLength: 255,
          placeholder: "Ex.: Escola Bíblica Dominical",
        },
        {
          nome: "time",
          tipo: "text",
          rotulo: "Horário (opcional)",
          maxLength: 60,
          meia: true,
          placeholder: "Ex.: 19h30",
        },
        {
          nome: "occurrence",
          tipo: "select",
          rotulo: "Qual domingo do mês (opcional)",
          meia: true,
          opcoes: [
            { valor: "1", rotulo: "1º domingo do mês" },
            { valor: "2", rotulo: "2º domingo do mês" },
            { valor: "3", rotulo: "3º domingo do mês" },
            { valor: "4_se_5", rotulo: "4º domingo (só em meses com 5 domingos)" },
            { valor: "ultimo", rotulo: "Último domingo do mês" },
          ],
          ajuda: "Só vale para “Domingo à noite”. Deixe em branco nos outros dias.",
        },
      ],
    },
  ],
};

const ministerios: TipoConteudo = {
  id: "ministerios",
  colecao: "ministerios",
  titulos: {
    plural: "Ministérios e órgãos",
    singular: "ministério",
    nova: "Novo ministério",
    esta: "este ministério",
  },
  descricao: "Departamentos, secretarias e conselhos da página “Órgãos” e a página de cada um.",
  icone: "⛪",
  grupo: "institucional",
  paginasPublicas: [{ rotulo: "Órgãos", url: "/orgaos/" }],
  campoTitulo: "name",
  campoCategoria: "category",
  camposMeta: [],
  ordem: { campo: "sort", agruparPor: "category" },
  ordenacao: ["sort", "id"],
  urlPublica: (item) => (item.slug ? `/orgao/${item.slug}/` : null),
  secoes: [
    {
      id: "principal",
      titulo: "O ministério",
      campos: [
        {
          nome: "name",
          tipo: "text",
          rotulo: "Nome",
          obrigatorio: true,
          maxLength: 255,
          placeholder: "Ex.: Departamento de Jovens",
        },
        {
          nome: "slug",
          tipo: "slug",
          rotulo: "Endereço (slug)",
          obrigatorio: true,
          slugDe: "name",
          maxLength: 120,
          ajuda:
            "É o final do endereço da página deste ministério no site. Só letras minúsculas, números e hífen.",
        },
        {
          nome: "category",
          tipo: "m2o",
          rotulo: "Tipo de órgão",
          obrigatorio: true,
          padrao: "departamentos",
          colecaoRelacionada: "orgao_categorias",
          campoRotuloRelacionado: "label",
          campoOrdemRelacionado: "sort",
          ajuda:
            "Em qual grupo da página “Órgãos” ele aparece (governança, departamentos, secretarias…).",
        },
        {
          nome: "description",
          tipo: "textarea",
          rotulo: "Resumo",
          linhas: 3,
          ajuda: "O texto curto que aparece no cartão da página “Órgãos”.",
        },
        {
          nome: "body",
          tipo: "markdown",
          rotulo: "Texto completo",
          linhas: 14,
          ajuda:
            "Aparece na página do ministério (botão “Saiba mais”). Use os botões acima do texto para negrito, título, lista etc.",
        },
      ],
    },
  ],
};

const historia: TipoConteudo = {
  id: "historia",
  colecao: "historia",
  titulos: { plural: "Nossa história", singular: "marco", nova: "Novo marco", esta: "este marco" },
  descricao: "A linha do tempo da igreja, ano a ano, com texto e fotos.",
  icone: "🕰️",
  grupo: "institucional",
  paginasPublicas: [{ rotulo: "Nossa história", url: "/historia/" }],
  campoTitulo: "title",
  campoCapa: "photo",
  camposMeta: ["period"],
  ordem: { campo: "sort" },
  ordenacao: ["sort", "id"],
  urlPublica: () => null,
  secoes: [
    {
      id: "principal",
      titulo: "O marco",
      campos: [
        {
          nome: "title",
          tipo: "text",
          rotulo: "Título",
          obrigatorio: true,
          maxLength: 255,
          placeholder: "Ex.: Inauguração do templo sede",
        },
        {
          nome: "period",
          tipo: "text",
          rotulo: "Ano ou período",
          maxLength: 255,
          placeholder: "Ex.: 2010",
          ajuda: "Aparece no menu de anos da página. Ex.: 1985, Década de 1990, Anos 2000.",
        },
        {
          nome: "body",
          tipo: "markdown",
          rotulo: "Relato",
          linhas: 12,
          ajuda: "Relato, entrevista ou trecho da história desse período.",
        },
      ],
    },
    {
      id: "fotos",
      titulo: "Fotos",
      campos: [
        {
          nome: "photo",
          tipo: "image",
          rotulo: "Foto principal",
          ajuda: "Foto de época, se houver. JPEG, PNG, WebP ou GIF, até 8 MB.",
        },
        {
          nome: "fotos",
          tipo: "imagens",
          rotulo: "Mais fotos deste marco (opcional)",
          imagens: {
            colecao: "historia_files",
            campoPai: "historia_id",
            campoArquivo: "directus_files_id",
            campoOrdem: "sort",
          },
          maximo: 30,
          ajuda:
            "Outras fotos do mesmo momento. Toque em “Adicionar fotos”; use ◀ e ▶ para mudar a ordem.",
        },
      ],
    },
  ],
};

const galeria: TipoConteudo = {
  id: "galeria",
  colecao: "galeria",
  titulos: {
    plural: "Galeria de fotos",
    singular: "foto",
    nova: "Nova foto",
    esta: "esta foto",
  },
  descricao: "As fotos de cultos e eventos, organizadas por álbum.",
  icone: "🖼️",
  grupo: "paginas",
  paginasPublicas: [{ rotulo: "Galeria de fotos", url: "/galeria/" }],
  campoTitulo: "alt",
  campoCapa: "photo",
  camposMeta: ["caption"],
  ordem: { campo: "sort", agruparPor: "album", rotuloSemGrupo: "Outras fotos" },
  ordenacao: ["sort", "id"],
  urlPublica: () => null,
  secoes: [
    {
      id: "principal",
      titulo: "A foto",
      campos: [
        {
          nome: "photo",
          tipo: "image",
          rotulo: "Foto",
          obrigatorio: true,
          mensagemObrigatorio: "Escolha a foto: sem ela não há o que mostrar na galeria.",
          ajuda: "JPEG, PNG, WebP ou GIF, até 8 MB.",
        },
        {
          nome: "alt",
          tipo: "text",
          rotulo: "Descrição da foto (para quem não enxerga)",
          obrigatorio: true,
          maxLength: 255,
          mensagemObrigatorio:
            "Descreva a foto em uma frase. É obrigatório: pessoas cegas ou com baixa visão só “veem” a foto por este texto, lido pelo leitor de tela.",
          placeholder: "Ex.: Batismo nas águas no culto de domingo",
          ajuda:
            "Explique em uma frase o que aparece, como se estivesse contando por telefone para quem não pode ver. É o que o leitor de tela lê para pessoas cegas ou com baixa visão (e o que aparece se a foto não carregar).",
        },
        {
          nome: "caption",
          tipo: "text",
          rotulo: "Legenda (opcional)",
          maxLength: 255,
          ajuda: "Texto que aparece embaixo da foto no site.",
        },
        {
          nome: "album",
          tipo: "text",
          rotulo: "Álbum (opcional)",
          maxLength: 255,
          sugerirExistentes: true,
          placeholder: "Ex.: Culto de Natal 2026",
          ajuda:
            "Escreva o mesmo nome em todas as fotos do mesmo evento (ao digitar, o painel sugere os álbuns que já existem). Em branco: a foto vai para “Outras fotos”.",
        },
      ],
    },
  ],
};

const configuracoes: TipoConteudo = {
  id: "configuracoes",
  colecao: "configuracoes",
  titulos: {
    plural: "Páginas do site: Sobre e Crenças",
    singular: "página do site",
    nova: "",
    esta: "estas páginas",
  },
  descricao:
    "A frase de abertura, o texto de “Sobre”, a declaração de “Crenças” e a foto da fachada.",
  icone: "📜",
  grupo: "institucional",
  paginasPublicas: [
    { rotulo: "Página inicial", url: "/" },
    { rotulo: "Sobre", url: "/sobre/" },
    { rotulo: "Crenças", url: "/crencas/" },
  ],
  campoTitulo: "tagline",
  unico: true,
  ordenacao: ["id"],
  urlPublica: () => null,
  secoes: [
    {
      id: "abertura",
      titulo: "Abertura do site",
      campos: [
        {
          nome: "tagline",
          tipo: "text",
          rotulo: "Frase de abertura",
          obrigatorio: true,
          maxLength: 255,
          ajuda: "A frase grande no topo da página inicial.",
        },
        {
          nome: "about",
          tipo: "textarea",
          rotulo: "Resumo da igreja",
          obrigatorio: true,
          linhas: 4,
          ajuda: "Um parágrafo curto. Aparece na página inicial e no topo da página “Sobre”.",
        },
        {
          nome: "phone",
          tipo: "text",
          rotulo: "Telefone / WhatsApp (opcional)",
          maxLength: 60,
          placeholder: "Ex.: (94) 99999-9999",
          ajuda:
            "Aparece na página “Contato” e no cartão de contato que a pessoa salva no celular.",
        },
      ],
    },
    {
      id: "sobre",
      titulo: "Página “Sobre”",
      campos: [
        {
          nome: "sobre_corpo",
          tipo: "markdown",
          rotulo: "Texto da página “Sobre”",
          obrigatorio: true,
          linhas: 18,
          ajuda:
            "Cada título (botão “Título”) vira uma seção da página. Veja como fica na aba Prévia.",
        },
      ],
    },
    {
      id: "crencas",
      titulo: "Página “Crenças”",
      campos: [
        {
          nome: "crencas_corpo",
          tipo: "markdown",
          rotulo: "Texto da página “Crenças” (declaração de fé)",
          linhas: 24,
          ajuda:
            "Cada título (botão “Título”) vira uma seção da página. Veja como fica na aba Prévia.",
        },
      ],
    },
    {
      id: "fachada",
      titulo: "Foto da fachada (opcional)",
      descricao:
        "O site usa a foto do Google Street View; esta foto só vale se for mais recente que a do Street View.",
      campos: [
        {
          nome: "foto_fachada",
          tipo: "image",
          rotulo: "Foto da fachada",
          ajuda: "JPEG, PNG, WebP ou GIF, até 8 MB.",
        },
        {
          nome: "foto_fachada_data",
          tipo: "date",
          rotulo: "Data em que a foto foi tirada",
          ajuda:
            "Preencha junto com a foto: é com esta data que o site decide qual das duas é a mais recente.",
        },
      ],
    },
  ],
};

/** O registro: para um tipo novo, acrescente um objeto aqui. A ordem dos cartões na página inicial segue esta ordem. */
export const TIPOS_CONTEUDO: Record<string, TipoConteudo> = {
  noticias,
  mensagens,
  faq,
  programacao,
  galeria,
  ministerios,
  historia,
  configuracoes,
};

export const obterTipo = (id: string | null | undefined): TipoConteudo | null =>
  id && Object.prototype.hasOwnProperty.call(TIPOS_CONTEUDO, id) ? TIPOS_CONTEUDO[id] : null;

export const todosCampos = (tipo: TipoConteudo): CampoConteudo[] =>
  tipo.secoes.flatMap((s) => s.campos);

/** Campo de endereço (slug) do tipo, se houver. */
export const campoSlugDe = (tipo: TipoConteudo): CampoConteudo | null =>
  todosCampos(tipo).find((c) => c.tipo === "slug") ?? null;

/** Nomes (no Directus) que um campo do formulário ocupa: o campo "imagens" lê as linhas da tabela de ligação. */
export function nomesNoDirectus(campo: CampoConteudo): string[] {
  if (campo.tipo === "imagens" && campo.imagens)
    return [
      `${campo.nome}.id`,
      `${campo.nome}.${campo.imagens.campoArquivo}`,
      `${campo.nome}.${campo.imagens.campoOrdem}`,
    ];
  return [campo.nome];
}

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
    tipo.rascunho?.campo,
    tipo.campoNotificacao,
    tipo.campoAtualizado?.campo,
    tipo.ordem?.campo,
    tipo.ordem?.agruparPor,
    ...(tipo.camposMeta ?? []),
  ];
  return [...new Set(nomes.filter((n): n is string => Boolean(n)))];
}

/**
 * Campos que a EDIÇÃO precisa ler do Directus. `semRelacoes` deixa de fora os campos "imagens" (tabela de ligação):
 * usado quando o perfil não pode ler a ligação e o Directus recusa o pedido inteiro.
 */
export function camposDaEdicao(
  tipo: TipoConteudo,
  opcoes: { semRelacoes?: boolean } = {},
): string[] {
  const nomes = [
    "id",
    tipo.rascunho?.campo,
    tipo.campoNotificacao,
    tipo.campoAtualizado?.campo,
    ...todosCampos(tipo)
      .filter((c) => !(opcoes.semRelacoes && c.tipo === "imagens"))
      .flatMap(nomesNoDirectus),
  ];
  return [...new Set(nomes.filter((n): n is string => Boolean(n)))];
}

/**
 * Item "publicado" = o campo de rascunho NÃO vale "rascunho" (o site mostra tudo o que não é `draft: true`). Tipo sem
 * rascunho: todo item salvo já está valendo no site.
 */
export const estaPublicado = (tipo: TipoConteudo, item: Record<string, unknown>): boolean =>
  !tipo.rascunho || item[tipo.rascunho.campo] !== tipo.rascunho.valorRascunho;

/** Caminho do item no Directus: item único (singleton) usa o endereço da coleção; os demais, `/items/coleção/id`. */
export const caminhoItem = (tipo: TipoConteudo, id?: number | string | null): string =>
  tipo.unico || id === null || id === undefined
    ? `/items/${tipo.colecao}`
    : `/items/${tipo.colecao}/${encodeURIComponent(String(id))}`;

// ----------------------------------------------------------------------------------------------
// Ordem manual (▲/▼) e grupos
// ----------------------------------------------------------------------------------------------

export type ItemLista = Record<string, unknown> & { id: number | string };

const numeroOuNulo = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Texto da chave de grupo de um item: vazio/nulo = "sem grupo" (chave ""). */
export const chaveGrupo = (valor: unknown): string =>
  valor === null || valor === undefined ? "" : String(valor).trim();

/** Compara dois itens pelo campo de ordem (menor primeiro, SEM ordem por último — como o Postgres faz) e depois pelo id. */
export function compararPorOrdem(campo: string) {
  return (a: ItemLista, b: ItemLista): number => {
    const x = numeroOuNulo(a[campo]);
    const y = numeroOuNulo(b[campo]);
    if (x !== y) {
      if (x === null) return 1;
      if (y === null) return -1;
      return x - y;
    }
    const ia = Number(a.id);
    const ib = Number(b.id);
    return Number.isFinite(ia) && Number.isFinite(ib)
      ? ia - ib
      : String(a.id).localeCompare(String(b.id));
  };
}

export interface GrupoLista {
  chave: string;
  rotulo: string;
  itens: ItemLista[];
}

/**
 * Separa os itens em grupos (ex.: uma pergunta de cada categoria) e ordena cada grupo pela ordem manual. A ordem dos
 * grupos é a de `ordemChaves` (a das opções do campo); grupos que não estão lá vêm depois, na ordem em que aparecem; o
 * grupo "sem valor" vai por último. Sem `campoGrupo`, devolve um grupo só, sem título.
 */
export function montarGrupos(
  itens: ItemLista[],
  campoGrupo: string | undefined,
  opcoes: {
    campoOrdem: string;
    ordemChaves?: string[];
    rotulos?: Record<string, string>;
    rotuloSemGrupo?: string;
  },
): GrupoLista[] {
  const ordenados = [...itens].sort(compararPorOrdem(opcoes.campoOrdem));
  if (!campoGrupo) return [{ chave: "", rotulo: "", itens: ordenados }];
  const mapa = new Map<string, ItemLista[]>();
  for (const it of ordenados) {
    const chave = chaveGrupo(it[campoGrupo]);
    const lista = mapa.get(chave);
    if (lista) lista.push(it);
    else mapa.set(chave, [it]);
  }
  const chaves = [...mapa.keys()];
  const conhecidas = (opcoes.ordemChaves ?? []).filter((c) => c !== "" && mapa.has(c));
  const outras = chaves.filter((c) => c !== "" && !conhecidas.includes(c));
  const ordemFinal = [...conhecidas, ...outras, ...(mapa.has("") ? [""] : [])];
  return ordemFinal.map((chave) => ({
    chave,
    rotulo:
      chave === "" ? (opcoes.rotuloSemGrupo ?? "Sem grupo") : (opcoes.rotulos?.[chave] ?? chave),
    itens: mapa.get(chave) ?? [],
  }));
}

/**
 * Troca de lugar o item `idA` com o vizinho `idB` e devolve o que gravar (uma lista de `{ id, [campoOrdem]: número }`).
 * `grupo` são TODOS os itens do mesmo grupo, na ordem atual. Caso normal (ordens distintas): troca os dois valores e só
 * esses dois itens são gravados. Se algum item do grupo não tem ordem, ou há ordens repetidas, a troca não bastaria
 * (os valores iguais não dizem quem vem antes): então o grupo é renumerado 1, 2, 3… com a troca feita, e só são
 * gravados os itens cujo número mudou. Lista vazia = nada a gravar (item não encontrado ou trocando consigo mesmo).
 */
export function calcularTroca(
  grupo: ItemLista[],
  campoOrdem: string,
  idA: number | string,
  idB: number | string,
): Record<string, number | string>[] {
  const a = grupo.find((i) => i.id === idA);
  const b = grupo.find((i) => i.id === idB);
  if (!a || !b || a === b) return [];
  const valores = grupo.map((i) => numeroOuNulo(i[campoOrdem]));
  const limpos = valores.every((v) => v !== null) && new Set(valores).size === valores.length;
  if (limpos)
    return [
      { id: a.id, [campoOrdem]: valores[grupo.indexOf(b)] as number },
      { id: b.id, [campoOrdem]: valores[grupo.indexOf(a)] as number },
    ];
  const lista = [...grupo];
  const ia = lista.indexOf(a);
  const ib = lista.indexOf(b);
  [lista[ia], lista[ib]] = [lista[ib], lista[ia]];
  const gravar: Record<string, number | string>[] = [];
  lista.forEach((it, posicao) => {
    if (numeroOuNulo(it[campoOrdem]) !== posicao + 1)
      gravar.push({ id: it.id, [campoOrdem]: posicao + 1 });
  });
  return gravar;
}

/** Próximo número de ordem de um item novo: o maior atual + 1 (1 se não há nenhum). */
export function proximaOrdem(maior: unknown): number {
  const n = numeroOuNulo(typeof maior === "string" && maior !== "" ? Number(maior) : maior);
  return n === null ? 1 : Math.floor(n) + 1;
}

/** Pergunta ao Directus qual é a maior ordem hoje (no mesmo grupo, quando o tipo agrupa). `grupoValor` é o valor do campo de grupo do item. */
export function consultaMaiorOrdem(tipo: TipoConteudo, grupoValor: unknown): string {
  const o = tipo.ordem;
  if (!o) return `/items/${tipo.colecao}?fields=id&limit=1`;
  let filtroGrupo = "";
  if (o.agruparPor) {
    const v = chaveGrupo(grupoValor);
    filtroGrupo =
      v === ""
        ? `&filter[${o.agruparPor}][_null]=true`
        : `&filter[${o.agruparPor}][_eq]=${encodeURIComponent(v)}`;
  }
  return `/items/${tipo.colecao}?fields=${o.campo}&sort=-${o.campo}&limit=1&filter[${o.campo}][_nnull]=true${filtroGrupo}`;
}

// ----------------------------------------------------------------------------------------------
// Várias fotos (campo "imagens", tabela de ligação)
// ----------------------------------------------------------------------------------------------

/** Linhas da ligação como o Directus entrega (`[{ id, directus_files_id, sort }]`) → lista de fotos na ordem certa. */
export function fotosDeDirectus(campo: CampoConteudo, bruto: unknown): FotoLigada[] {
  const rel = campo.imagens;
  if (!rel || !Array.isArray(bruto)) return [];
  const linhas: FotoLigada[] = [];
  for (const l of bruto) {
    if (!l || typeof l !== "object") continue; // só ids soltos (sem os campos pedidos): não dá para usar
    const o = l as Record<string, unknown>;
    const arquivo = o[rel.campoArquivo];
    if (typeof arquivo !== "string" || !arquivo) continue;
    linhas.push({
      id: typeof o.id === "number" ? o.id : null,
      arquivo,
      ordem: numeroOuNulo(o[rel.campoOrdem]),
    });
  }
  return linhas
    .map((l, i) => ({ l, i }))
    .sort((x, y) => {
      const a = x.l.ordem ?? Number.POSITIVE_INFINITY;
      const b = y.l.ordem ?? Number.POSITIVE_INFINITY;
      return a === b ? x.i - y.i : a - b;
    })
    .map((x) => x.l);
}

export interface DiferencaFotos {
  create: Record<string, unknown>[];
  update: Record<string, unknown>[];
  delete: number[];
}

/**
 * O que mandar ao Directus para o campo "imagens" (formato de relação um-para-muitos: `create`, `update`, `delete`).
 * Fotos novas viram linhas novas; fotos tiradas viram `delete` (só a linha de ligação — o arquivo continua guardado);
 * as que ficaram e mudaram de posição levam a posição nova (posição = lugar na lista, 1, 2, 3…). Devolve `null` se não
 * mudou nada.
 */
export function diferencaFotos(
  campo: CampoConteudo,
  inicial: FotoLigada[],
  atual: FotoLigada[],
): DiferencaFotos | null {
  const rel = campo.imagens;
  if (!rel) return null;
  const idsAtuais = new Set(atual.filter((f) => f.id !== null).map((f) => f.id));
  const apagar = inicial
    .filter((f) => f.id !== null && !idsAtuais.has(f.id))
    .map((f) => f.id as number);
  const criar: Record<string, unknown>[] = [];
  const atualizar: Record<string, unknown>[] = [];
  atual.forEach((f, i) => {
    if (f.id === null) criar.push({ [rel.campoArquivo]: f.arquivo, [rel.campoOrdem]: i + 1 });
    else if (f.ordem !== i + 1) atualizar.push({ id: f.id, [rel.campoOrdem]: i + 1 });
  });
  if (!apagar.length && !criar.length && !atualizar.length) return null;
  return { create: criar, update: atualizar, delete: apagar };
}

/** Endereços das páginas do painel. */
export const painelUrls = {
  inicio: "/painel-conteudo/",
  entrar: "/painel-conteudo/entrar/",
  lista: (tipo: string) => `/painel-conteudo/lista/?tipo=${encodeURIComponent(tipo)}`,
  editar: (tipo: string, id?: number | string | null) =>
    `/painel-conteudo/editar/?tipo=${encodeURIComponent(tipo)}${id ? `&id=${encodeURIComponent(String(id))}` : ""}`,
  /** Para onde o cartão da página inicial leva: a lista (ou, em tipo de item único, direto o formulário). */
  destino: (tipo: { id: string; unico?: boolean }) =>
    tipo.unico
      ? `/painel-conteudo/editar/?tipo=${encodeURIComponent(tipo.id)}`
      : `/painel-conteudo/lista/?tipo=${encodeURIComponent(tipo.id)}`,
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
  if (campo.tipo === "imagens") return [];
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
    case "imagens":
      return Array.isArray(bruto) ? bruto : [];
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
  const vazio =
    valor === null ||
    valor === undefined ||
    valor === "" ||
    (Array.isArray(valor) && valor.length === 0);
  if (vazio) {
    if (campo.obrigatorio)
      return campo.mensagemObrigatorio ?? `Preencha o campo "${campo.rotulo}".`;
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
    case "imagens": {
      const max = campo.maximo ?? 30;
      if (Array.isArray(valor) && valor.length > max)
        return `"${campo.rotulo}" aceita no máximo ${max} fotos (tem ${valor.length}). Tire algumas.`;
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
  if (status === 400 && codigo === "INVALID_FOREIGN_KEY")
    return {
      status,
      mensagem:
        acao === "excluir"
          ? "Não dá para excluir: este item está ligado a outros registros (por exemplo membros do órgão ou notícias que o citam). Desfaça essas ligações antes ou peça ajuda à Secretaria."
          : "O servidor recusou: um dos valores aponta para algo que não existe mais. Recarregue a página e tente de novo.",
    };
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
