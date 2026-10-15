/**
 * Painel de conteúdo — MODERAÇÃO do que o público envia pelo site (`/painel-conteudo/moderar/`).
 *
 * Depoimentos e pedidos do mural de oração chegam pelo formulário público já gravados com `aprovado = false`; só aparecem
 * no site depois que alguém da Diretoria aprova. Este arquivo guarda, SEM tocar em `document` (serve ao servidor, que monta
 * os cartões da página inicial, e ao navegador), tudo o que é regra e texto da moderação:
 *
 *  - o registro `TIPOS_MODERACAO` (coleção, abas, textos, quando a aprovação vale no site);
 *  - os filtros de cada aba e as consultas ao Directus (contagem, lista, um item);
 *  - as regras de quem pode ser aprovado (sem consentimento LGPD, não; pedido confidencial, nunca) e as ações que cada
 *    item aceita;
 *  - os textos de confirmação e de resultado, para o teste de unidade poder conferir cada promessa feita à pessoa.
 *
 * Quem decide o que cada perfil pode fazer continua sendo o Directus (cada pedido leva o token da própria pessoa); aqui
 * ficam as travas que o painel acrescenta por cima, para ninguém publicar por engano algo que não podia ser publicado.
 */
import {
  TIPOS_CONTEUDO,
  dataBR,
  hojeLocal,
  painelUrls,
  type GrupoHome,
  type PaginaPublica,
} from "@/lib/painelConteudo";

export type IdAba = "aguardando" | "publicados" | "confidenciais";
export type AcaoModeracao = "aprovar" | "tirar" | "excluir";

export interface AbaModeracao {
  id: IdAba;
  /** Nome da aba (a tela acrescenta a contagem: "Aguardando (3)"). */
  rotulo: string;
  /** Recado fixo no alto da aba. */
  aviso?: string;
  /** Frase quando a aba está vazia. */
  vazio: string;
  /** Se aparece no cartão da página inicial, com as frases da contagem (`{n}` vira o número). */
  cartao?: { um: string; varios: string; nenhum?: string };
}

export interface TipoModeracao {
  /** Valor de `?tipo=` em `/painel-conteudo/moderar/`. */
  id: string;
  /** Coleção do Directus. */
  colecao: string;
  titulos: { plural: string; singular: string; este: string };
  /** Frase do cartão da página inicial. */
  descricao: string;
  icone: string;
  grupo: GrupoHome;
  paginasPublicas: PaginaPublica[];
  /** Nomes dos campos opcionais da coleção. */
  campos: { foto?: string; confidencial?: string; contador?: string };
  /**
   * Quando a aprovação vale no site: `imediata` (o mural atualiza em tempo real: aprovar publica na hora) ou na próxima
   * montagem do site (uns 20 minutos). `dias` = por quantos dias o item fica visível depois de enviado (mural: 90).
   */
  publicacao: { imediata: boolean; dias?: number };
  abas: AbaModeracao[];
}

const depoimentos: TipoModeracao = {
  id: "depoimentos",
  colecao: "depoimentos",
  titulos: { plural: "Depoimentos", singular: "depoimento", este: "este depoimento" },
  descricao: "Testemunhos enviados pelo site: leia e aprove antes de aparecerem.",
  icone: "💬",
  grupo: "moderacao",
  paginasPublicas: [{ rotulo: "Depoimentos", url: "/depoimentos/" }],
  campos: { foto: "foto" },
  publicacao: { imediata: false },
  abas: [
    {
      id: "aguardando",
      rotulo: "Aguardando",
      aviso:
        "Estes depoimentos ainda NÃO aparecem no site. Ao aprovar, passam a aparecer na próxima montagem do site (em até uns 20 minutos).",
      vazio: "Nenhum depoimento aguardando. Quando alguém enviar pelo site, aparece aqui.",
      cartao: { um: "1 aguardando", varios: "{n} aguardando", nenhum: "Nenhum aguardando" },
    },
    {
      id: "publicados",
      rotulo: "Publicados",
      aviso:
        "Estes depoimentos aparecem na página “Depoimentos” do site. “Tirar do ar” vale na próxima montagem do site (em até uns 20 minutos).",
      vazio: "Nenhum depoimento publicado ainda.",
    },
  ],
};

const muralOracao: TipoModeracao = {
  id: "mural_oracao",
  colecao: "mural_oracao",
  titulos: { plural: "Mural de oração", singular: "pedido de oração", este: "este pedido de oração" },
  descricao: "Pedidos de oração enviados pelo site. Aprovar publica no mural na hora.",
  icone: "🙏",
  grupo: "moderacao",
  paginasPublicas: [{ rotulo: "Mural de oração", url: "/mural-de-oracao/" }],
  campos: { confidencial: "confidencial", contador: "orando_count" },
  publicacao: { imediata: true, dias: 90 },
  abas: [
    {
      id: "aguardando",
      rotulo: "Aguardando",
      aviso:
        "Atenção: o mural público é em tempo real. Ao aprovar, o pedido aparece IMEDIATAMENTE para todo mundo, por 90 dias.",
      vazio: "Nenhum pedido aguardando. Quando alguém enviar pelo site, aparece aqui.",
      cartao: { um: "1 aguardando", varios: "{n} aguardando", nenhum: "Nenhum aguardando" },
    },
    {
      id: "publicados",
      rotulo: "Publicados",
      aviso:
        "Pedidos que estão no mural público (cada um fica visível por 90 dias depois de enviado). “Tirar do ar” vale na hora.",
      vazio: "Nenhum pedido publicado no mural agora.",
    },
    {
      id: "confidenciais",
      rotulo: "🔒 Confidenciais (só a equipe pastoral)",
      aviso:
        "Só a Diretoria vê esta aba. Estes pedidos foram enviados como confidenciais: vão direto à equipe pastoral e nunca são publicados. Aqui só dá para ler e, depois que a equipe pastoral atender, excluir.",
      vazio: "Nenhum pedido confidencial no momento.",
      cartao: { um: "1 confidencial", varios: "{n} confidenciais" },
    },
  ],
};

/** O registro da moderação: para um tipo novo, acrescente um objeto aqui. A ordem segue a dos cartões na página inicial. */
export const TIPOS_MODERACAO: Record<string, TipoModeracao> = {
  depoimentos,
  mural_oracao: muralOracao,
};

export const obterTipoModeracao = (id: string | null | undefined): TipoModeracao | null =>
  id && Object.prototype.hasOwnProperty.call(TIPOS_MODERACAO, id) ? TIPOS_MODERACAO[id] : null;

export const ABAS_VALIDAS: IdAba[] = ["aguardando", "publicados", "confidenciais"];

/** A aba pedida em `?aba=` (se existe NESTE tipo) ou a primeira (Aguardando). */
export function abaInicial(tipo: TipoModeracao, pedida: string | null | undefined): IdAba {
  const achada = tipo.abas.find((a) => a.id === pedida);
  return (achada ?? tipo.abas[0]).id;
}

// ----------------------------------------------------------------------------------------------
// Filtros e consultas (Directus)
// ----------------------------------------------------------------------------------------------

type Filtro = Record<string, unknown>;

const naoConfidencial = (campo: string): Filtro => ({
  _or: [{ [campo]: { _eq: false } }, { [campo]: { _null: true } }],
});

/**
 * O filtro (formato do Directus) de cada aba. As três abas juntas cobrem TODOS os itens, sem sobrepor e sem esquecer
 * ninguém: `aprovado` e `confidencial` aceitam vazio no banco, e vazio conta como "não" (uma linha com `aprovado` vazio
 * apareceria em nenhuma aba se o filtro fosse só "igual a falso").
 *  - Confidenciais: `confidencial = verdadeiro` (aprovado ou não: nunca aparece no site).
 *  - Aguardando: não aprovado e (se o tipo tem confidencial) não confidencial.
 *  - Publicados: aprovado e não confidencial.
 */
export function filtroDaAba(tipo: TipoModeracao, aba: IdAba): Filtro {
  const conf = tipo.campos.confidencial;
  if (aba === "confidenciais")
    return conf ? { [conf]: { _eq: true } } : { id: { _null: true } }; // sem o campo, não existe item confidencial
  const base: Filtro =
    aba === "aguardando"
      ? { _or: [{ aprovado: { _eq: false } }, { aprovado: { _null: true } }] }
      : { aprovado: { _eq: true } };
  return conf ? { _and: [base, naoConfidencial(conf)] } : base;
}

const parteFiltro = (tipo: TipoModeracao, aba: IdAba) =>
  `filter=${encodeURIComponent(JSON.stringify(filtroDaAba(tipo, aba)))}`;

/** Campos que a lista de moderação lê. */
export function camposDaModeracao(tipo: TipoModeracao): string[] {
  const nomes = [
    "id",
    "nome",
    "texto",
    "aprovado",
    "consentimento_lgpd",
    "date_created",
    tipo.campos.foto,
    tipo.campos.confidencial,
    tipo.campos.contador,
  ];
  return [...new Set(nomes.filter((n): n is string => Boolean(n)))];
}

/** Quantos itens a aba tem (o Directus devolve `meta.filter_count`; não traz os itens). */
export const consultaContagem = (tipo: TipoModeracao, aba: IdAba): string =>
  `/items/${tipo.colecao}?limit=1&fields=id&meta=filter_count&${parteFiltro(tipo, aba)}`;

/** Uma página da aba, do mais novo para o mais antigo. */
export const consultaLista = (
  tipo: TipoModeracao,
  aba: IdAba,
  limite: number,
  deslocamento: number,
): string =>
  `/items/${tipo.colecao}?fields=${encodeURIComponent(camposDaModeracao(tipo).join(","))}&sort=-date_created,-id&limit=${limite}&offset=${deslocamento}&meta=filter_count&${parteFiltro(tipo, aba)}`;

/** Um item só, lido de novo na hora de agir (o estado da tela pode estar velho). */
export const consultaItem = (tipo: TipoModeracao, id: number | string): string =>
  `/items/${tipo.colecao}/${encodeURIComponent(String(id))}?fields=${encodeURIComponent(camposDaModeracao(tipo).join(","))}`;

// ----------------------------------------------------------------------------------------------
// Regras: quem pode ser aprovado e o que cada item aceita
// ----------------------------------------------------------------------------------------------

export type ItemModeracao = Record<string, unknown>;

export const ehConfidencial = (tipo: TipoModeracao, item: ItemModeracao): boolean =>
  Boolean(tipo.campos.confidencial) && item[tipo.campos.confidencial as string] === true;

export const estaAprovado = (item: ItemModeracao): boolean => item.aprovado === true;

export const temConsentimento = (item: ItemModeracao): boolean =>
  item.consentimento_lgpd === true;

export const MOTIVO_CONFIDENCIAL = "Confidencial: só a equipe pastoral lê; nunca é publicado";
export const MOTIVO_SEM_CONSENTIMENTO =
  "Sem o consentimento (LGPD) de quem escreveu, não pode ser publicado";

/** Dá para aprovar? Pedido confidencial, nunca; sem consentimento LGPD, também não. Devolve o motivo quando não. */
export function avaliarAprovacao(
  tipo: TipoModeracao,
  item: ItemModeracao,
): { pode: boolean; motivo: string | null } {
  if (ehConfidencial(tipo, item)) return { pode: false, motivo: MOTIVO_CONFIDENCIAL };
  if (!temConsentimento(item)) return { pode: false, motivo: MOTIVO_SEM_CONSENTIMENTO };
  return { pode: true, motivo: null };
}

/**
 * As ações que o item aceita, pelo estado dele: confidencial só pode ser excluído (depois do atendimento pastoral); publicado
 * pode sair do ar; aguardando pode ser aprovado (o botão fica desligado, com o motivo, se a regra acima barra).
 */
export function acoesDoItem(tipo: TipoModeracao, item: ItemModeracao): AcaoModeracao[] {
  if (ehConfidencial(tipo, item)) return ["excluir"];
  if (estaAprovado(item)) return ["tirar", "excluir"];
  return ["aprovar", "excluir"];
}

/** O que gravar para cada ação (excluir não grava: é um DELETE). Mexe SÓ em `aprovado`. */
export function corpoDaAcao(acao: "aprovar" | "tirar"): { aprovado: boolean } {
  return { aprovado: acao === "aprovar" };
}

/** Nome de quem enviou, ou "Anônimo". */
export function nomeDoAutor(item: ItemModeracao): string {
  const n = typeof item.nome === "string" ? item.nome.trim() : "";
  return n || "Anônimo";
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Pedido que está no ar: o mural só mostra os dos últimos N dias (a contar do envio). Devolve a frase da situação ou `null`
 * se o tipo não tem prazo. `agora` existe para o teste.
 */
export function situacaoNoMural(
  tipo: TipoModeracao,
  item: ItemModeracao,
  agora: Date = new Date(),
): { noMural: boolean; frase: string } | null {
  const dias = tipo.publicacao.dias;
  if (!dias || !estaAprovado(item) || ehConfidencial(tipo, item)) return null;
  const enviado = new Date(String(item.date_created ?? ""));
  if (Number.isNaN(enviado.getTime())) return null;
  const fim = new Date(enviado.getTime() + dias * DIA_MS);
  if (agora.getTime() <= fim.getTime())
    return { noMural: true, frase: `No mural público até ${dataBR(hojeLocal(fim))}` };
  return { noMural: false, frase: `Já saiu do mural público (passou de ${dias} dias)` };
}

// ----------------------------------------------------------------------------------------------
// Textos: confirmações e resultados
// ----------------------------------------------------------------------------------------------

export interface TextoConfirmacao {
  titulo: string;
  paragrafos: string[];
  sim: string;
  /** Palavra que a pessoa precisa digitar para liberar o botão (só em excluir). */
  digitar?: string;
  perigo?: boolean;
}

export const PALAVRA_EXCLUIR = "EXCLUIR";

/** A pergunta "tem certeza?" de aprovar e de excluir. Tirar do ar não pergunta: é o caminho seguro e tem que ser de um toque. */
export function textoConfirmacao(
  tipo: TipoModeracao,
  acao: "aprovar" | "excluir",
  item: ItemModeracao,
): TextoConfirmacao {
  const autor = nomeDoAutor(item);
  if (acao === "aprovar") {
    if (tipo.publicacao.imediata)
      return {
        titulo: `Aprovar o pedido de “${autor}”?`,
        paragrafos: [
          `Ele aparece no mural público IMEDIATAMENTE, na hora, para todo mundo que abrir a página, sem esperar o site ser montado de novo. Fica visível por ${tipo.publicacao.dias ?? 90} dias.`,
          "Confira se o texto não tem telefone, endereço ou assunto delicado que a pessoa não quis expor. Se algo sair errado, use “Tirar do ar”: também vale na hora.",
        ],
        sim: "Sim, publicar agora",
      };
    return {
      titulo: `Aprovar o depoimento de “${autor}”?`,
      paragrafos: [
        "Ele passa a aparecer na página “Depoimentos” do site na próxima montagem (em até uns 20 minutos).",
        "Leia com calma: depois de publicado, qualquer pessoa pode ler. Você pode tirá-lo do ar quando quiser.",
      ],
      sim: "Sim, aprovar",
    };
  }
  const paragrafos = [
    "Isto apaga para sempre e não dá para desfazer por aqui.",
  ];
  if (ehConfidencial(tipo, item))
    paragrafos.push(
      "Exclua só depois que a equipe pastoral já tiver atendido este pedido: depois de excluído, ninguém mais consegue lê-lo.",
    );
  else if (estaAprovado(item))
    paragrafos.push(
      tipo.publicacao.imediata
        ? "Como está publicado, ele sai do mural público na hora."
        : "Como está publicado, ele sai do site na próxima montagem (em até uns 20 minutos).",
    );
  if (tipo.campos.foto && item[tipo.campos.foto])
    paragrafos.push("A foto continua guardada na biblioteca de arquivos do Directus.");
  return {
    titulo: `Excluir ${tipo.titulos.este} de “${autor}”?`,
    paragrafos,
    sim: "Excluir definitivamente",
    digitar: PALAVRA_EXCLUIR,
    perigo: true,
  };
}

/** A frase de sucesso depois de cada ação. */
export function textoSucesso(tipo: TipoModeracao, acao: AcaoModeracao): string {
  if (acao === "excluir") return "Excluído para sempre.";
  if (acao === "aprovar")
    return tipo.publicacao.imediata
      ? "Pedido aprovado: já está no mural público."
      : "Depoimento aprovado. Ele aparece no site na próxima montagem (em até uns 20 minutos).";
  return tipo.publicacao.imediata
    ? "Pedido tirado do mural público (vale na hora)."
    : "Depoimento tirado do ar. Sai do site na próxima montagem (em até uns 20 minutos).";
}

/** Frase da contagem no cartão da página inicial para uma aba (vazio = não mostrar nada). */
export function textoContagemCartao(tipo: TipoModeracao, aba: IdAba, n: number): string {
  const c = tipo.abas.find((a) => a.id === aba)?.cartao;
  if (!c) return "";
  if (n === 0) return c.nenhum ?? "";
  return n === 1 ? c.um : c.varios.replace("{n}", String(n));
}

// ----------------------------------------------------------------------------------------------
// Cartões da página inicial: conteúdo e moderação lado a lado, agrupados do mesmo jeito
// ----------------------------------------------------------------------------------------------

export interface CartaoHome {
  /** Identificador do cartão (o `id` do tipo). */
  id: string;
  origem: "conteudo" | "moderacao";
  grupo: GrupoHome;
  titulo: string;
  descricao: string;
  icone: string;
  href: string;
  colecao: string;
  /** Item único (sem contagem de itens). */
  unico: boolean;
}

/** Todos os cartões da página inicial, na ordem dos registros (a página os agrupa por `grupo`). */
export function cartoesHome(): CartaoHome[] {
  return [
    ...Object.values(TIPOS_CONTEUDO).map(
      (t): CartaoHome => ({
        id: t.id,
        origem: "conteudo",
        grupo: t.grupo,
        titulo: t.titulos.plural,
        descricao: t.descricao,
        icone: t.icone,
        href: painelUrls.destino(t),
        colecao: t.colecao,
        unico: Boolean(t.unico),
      }),
    ),
    ...Object.values(TIPOS_MODERACAO).map(
      (t): CartaoHome => ({
        id: t.id,
        origem: "moderacao",
        grupo: t.grupo,
        titulo: t.titulos.plural,
        descricao: t.descricao,
        icone: t.icone,
        href: painelUrls.moderar(t.id),
        colecao: t.colecao,
        unico: false,
      }),
    ),
  ];
}
