/**
 * Excluir em massa os pedidos de camiseta que NÃO foram separados (16/10/2026, pedido do responsável: na Marcha para Jesus mais de 300 pessoas não vieram buscar
 * e a peça precisa passar para o próximo). Esta parte é regra pura (sem tela e sem rede), para o teste de unidade conferir cada promessa feita à pessoa.
 *
 * O que NUNCA entra: pedido já separado (quem reservou ainda pode vir), venda avulsa (é registro de venda no balcão), pedido de quem já levou ALGUMA peça (apagar
 * apagaria a prova do que a pessoa recebeu) e, claro, o que não está na tela (filtros e aba do lote valem).
 *
 * A conta da malharia: o lote FECHADO guarda os números congelados no fechamento (`total_vendido`, `total_arrecadado`, `total_pago_malharia`, `saldo` e, por
 * tamanho, `pedido_congelado`) e nunca os recalcula a partir dos pedidos — por isso excluir pedido de lote fechado não muda a conta da malharia. O lote ABERTO
 * calcula ao vivo: excluir pedido dele diminui o que há para encomendar, e a tela avisa antes.
 */

export const PALAVRA_EXCLUIR = "EXCLUIR";
export const TAMANHO_DO_LOTE_DE_EXCLUSAO = 100;
export const VERSAO_DA_COPIA = 1;

export interface ItemParaExcluir {
  tamanho?: string | null;
  modelo?: string | null;
  quantidade: number;
  quantidade_retirada: number;
}

export interface PedidoParaExcluir {
  id: number;
  avulso: boolean;
  separado: boolean;
  lote: number | null;
  itens: ItemParaExcluir[];
}

export interface LoteParaExcluir {
  id: number;
  numero: number;
  status: "aberto" | "fechado";
  total_vendido: number | null;
}

/** A pessoa já levou pelo menos uma peça deste pedido? Então o pedido é prova do que ela recebeu e não se apaga em massa. */
export function levouAlgumaPeca(p: Pick<PedidoParaExcluir, "itens">): boolean {
  return (p.itens ?? []).some((i) => Number(i.quantidade_retirada) > 0);
}

/**
 * O que a exclusão em massa pode apagar entre `naTela`: o que a tela chama de "não separado" (`estaNaoSeparado`: sem reserva, não avulso, ainda falta retirar)
 * E que não levou nenhuma peça. Do mais antigo para o mais novo (a mesma ordem da separação em massa).
 */
export function elegiveisParaExcluir<T extends PedidoParaExcluir>(
  naTela: T[],
  estaNaoSeparado: (p: T) => boolean,
): T[] {
  return [...naTela]
    .filter((p) => estaNaoSeparado(p) && !p.avulso && !p.separado && !levouAlgumaPeca(p))
    .sort((a, b) => a.id - b.id);
}

/** "os primeiros N": vazio = todos; só dígitos; zero não vale. `null` quando o texto não é um número aceitável. */
export function limiteDaExclusao(texto: string | null | undefined, total: number): number | null {
  const t = String(texto ?? "").trim();
  if (t === "") return total;
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 ? Math.min(n, total) : null;
}

/** Um lote cujos números ficaram travados no fechamento: excluir pedido dele não muda a conta da malharia. */
export function loteTravado(
  l: Pick<LoteParaExcluir, "status" | "total_vendido"> | undefined | null,
): boolean {
  return !!l && l.status === "fechado" && l.total_vendido != null;
}

export interface ResumoDaExclusao {
  pedidos: number;
  pecas: number;
  porTamanho: { rotulo: string; quantidade: number }[];
  emLoteTravado: { pedidos: number; pecas: number; lotes: number[] };
  /** lote aberto (ou fechado sem números travados) e pedido sem lote: a conta ao vivo diminui */
  emLoteAoVivo: { pedidos: number; pecas: number; lotes: number[] };
  primeiroId: number | null;
  ultimoId: number | null;
}

const pecasDe = (p: Pick<PedidoParaExcluir, "itens">): number =>
  (p.itens ?? []).reduce((s, i) => s + Math.max(0, Number(i.quantidade) || 0), 0);

export function resumoDaExclusao(
  alvo: PedidoParaExcluir[],
  lotes: LoteParaExcluir[],
): ResumoDaExclusao {
  const porLote = new Map(lotes.map((l) => [l.id, l]));
  const r: ResumoDaExclusao = {
    pedidos: alvo.length,
    pecas: 0,
    porTamanho: [],
    emLoteTravado: { pedidos: 0, pecas: 0, lotes: [] },
    emLoteAoVivo: { pedidos: 0, pecas: 0, lotes: [] },
    primeiroId: alvo.length ? alvo[0].id : null,
    ultimoId: alvo.length ? alvo[alvo.length - 1].id : null,
  };
  const tamanhos = new Map<string, number>();
  const numerosTravados = new Set<number>();
  const numerosAoVivo = new Set<number>();
  for (const p of alvo) {
    const n = pecasDe(p);
    r.pecas += n;
    for (const i of p.itens ?? []) {
      const rotulo = [
        String(i.tamanho ?? "").trim() || "sem tamanho",
        String(i.modelo ?? "").trim(),
      ]
        .filter(Boolean)
        .join(" · ");
      tamanhos.set(rotulo, (tamanhos.get(rotulo) ?? 0) + Math.max(0, Number(i.quantidade) || 0));
    }
    const lote = p.lote != null ? porLote.get(p.lote) : undefined;
    if (loteTravado(lote)) {
      r.emLoteTravado.pedidos++;
      r.emLoteTravado.pecas += n;
      numerosTravados.add(lote!.numero);
    } else {
      r.emLoteAoVivo.pedidos++;
      r.emLoteAoVivo.pecas += n;
      if (lote) numerosAoVivo.add(lote.numero);
    }
  }
  r.emLoteTravado.lotes = [...numerosTravados].sort((a, b) => a - b);
  r.emLoteAoVivo.lotes = [...numerosAoVivo].sort((a, b) => a - b);
  r.porTamanho = [...tamanhos.entries()]
    .map(([rotulo, quantidade]) => ({ rotulo, quantidade }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true }));
  return r;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const listaDeLotes = (ns: number[]) =>
  ns.length ? ` (lote${ns.length > 1 ? "s" : ""} ${ns.join(", ")})` : "";

/** O texto do primeiro "tem certeza?". Diz o que será apagado, o que a conta da malharia faz e o que fica guardado. */
export function textoDaConfirmacao(resumo: ResumoDaExclusao, filtros: string): string {
  const linhas = [
    `EXCLUIR ${plural(resumo.pedidos, "pedido", "pedidos")} que NÃO foram separados e em que ninguém levou nenhuma peça?`,
    "",
    `Filtros: ${filtros}.`,
    `Do #${resumo.primeiroId} ao #${resumo.ultimoId} (os mais antigos primeiro).`,
    `Peças desses pedidos: ${resumo.pecas}${resumo.porTamanho.length ? ` — ${resumo.porTamanho.map((t) => `${t.rotulo}: ${t.quantidade}`).join(" · ")}` : ""}.`,
    "",
  ];
  if (resumo.emLoteTravado.pedidos) {
    linhas.push(
      `• ${plural(resumo.emLoteTravado.pedidos, "pedido está", "pedidos estão")} em lote FECHADO${listaDeLotes(resumo.emLoteTravado.lotes)}: a conta da malharia desse lote NÃO muda (os números ficaram travados no fechamento).`,
    );
  }
  if (resumo.emLoteAoVivo.pedidos) {
    linhas.push(
      `• ⚠ ${plural(resumo.emLoteAoVivo.pedidos, "pedido está", "pedidos estão")} em lote ABERTO ou sem lote${listaDeLotes(resumo.emLoteAoVivo.lotes)}: ali a quantidade a encomendar DIMINUI (${resumo.emLoteAoVivo.pecas} peça(s)).`,
    );
  }
  linhas.push(
    "",
    "Isso APAGA o pedido e os itens dele. Os pedidos separados, as vendas avulsas e quem já levou alguma peça ficam de fora.",
    "Antes de apagar, o navegador baixa um arquivo com a cópia de tudo; e, logo depois, este botão mostra “Desfazer a exclusão” enquanto você não fechar a página.",
  );
  return linhas.join("\n");
}

/** O texto do segundo pedido: digitar a palavra (sempre: apagar não é como separar). */
export function textoDaPalavra(n: number, semFiltro: boolean): string {
  return `São ${plural(n, "pedido", "pedidos")}${semFiltro ? " e NENHUM filtro está ligado" : ""}. Para confirmar, digite ${PALAVRA_EXCLUIR}:`;
}

export const palavraConfere = (digitado: string | null): boolean =>
  digitado !== null && digitado.trim().toUpperCase() === PALAVRA_EXCLUIR;

/** Fatia em partes de `n` (o Directus recebe 100 por vez). */
export function emLotes<T>(lista: T[], n = TAMANHO_DO_LOTE_DE_EXCLUSAO): T[][] {
  const partes: T[][] = [];
  for (let i = 0; i < lista.length; i += n) partes.push(lista.slice(i, i + n));
  return partes;
}

type Registro = Record<string, unknown>;

export interface CopiaDaExclusao {
  versao: number;
  geradoEm: string;
  campanha: { id: number; nome: string };
  /** os pedidos exatamente como estavam no Directus (todas as colunas), sem a lista de itens aninhada */
  pedidos: Registro[];
  itens: Registro[];
  respostas: Registro[];
}

/**
 * Monta a cópia que o navegador baixa antes de apagar. `pedidosCompletos` vêm de `fields=*,itens.*`; `respostas`, de respostas_pedido_camiseta com `fields=*`.
 * Tudo com os mesmos ids, para a restauração devolver cada coisa ao lugar (o relacionamento item→pedido e resposta→pedido continua valendo).
 */
export function montarCopia(
  campanha: { id: number; nome: string },
  pedidosCompletos: (Registro & { id: number; itens?: Registro[] })[],
  respostas: Registro[],
  geradoEm: string,
): CopiaDaExclusao {
  const pedidos: Registro[] = [];
  const itens: Registro[] = [];
  for (const p of pedidosCompletos) {
    pedidos.push(semListas(p));
    for (const i of p.itens ?? []) itens.push({ ...semListas(i), pedido: p.id });
  }
  return {
    versao: VERSAO_DA_COPIA,
    geradoEm,
    campanha: { id: campanha.id, nome: campanha.nome },
    pedidos,
    itens,
    respostas: respostas.map(semListas),
  };
}

/** Tira do registro os campos que são LISTA (os "alias" um-para-muitos do Directus, como `itens` e `respostas`): ao recriar o pedido eles apontariam para registros que ainda não existem. */
function semListas(registro: Registro): Registro {
  const limpo: Registro = {};
  for (const [campo, valor] of Object.entries(registro))
    if (!Array.isArray(valor)) limpo[campo] = valor;
  return limpo;
}

/** O nome do arquivo da cópia: sem acento, só letras, números e hífen; com a data e a hora (para duas exclusões no mesmo dia não se sobrescreverem). */
export function nomeDoArquivoDaCopia(campanhaNome: string, quando: Date): string {
  const limpo =
    String(campanhaNome ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "campanha";
  const p = (n: number) => String(n).padStart(2, "0");
  const carimbo = `${quando.getFullYear()}${p(quando.getMonth() + 1)}${p(quando.getDate())}-${p(quando.getHours())}${p(quando.getMinutes())}${p(quando.getSeconds())}`;
  return `pedidos-excluidos-${limpo}-${carimbo}.json`;
}

/**
 * A ordem da restauração: primeiro os pedidos, depois os itens e as respostas (que apontam para o pedido). Cada grupo em lotes. Quem restaura (o botão "Desfazer a exclusão"
 * e o script `scripts/restaurar-pedidos.mjs`) segue esta ordem e confere se a cópia é do formato esperado.
 */
export function etapasDaRestauracao(
  copia: CopiaDaExclusao,
  tamanhoDoLote = 50,
): { colecao: string; lotes: Registro[][] }[] {
  if (
    !copia ||
    copia.versao !== VERSAO_DA_COPIA ||
    !Array.isArray(copia.pedidos) ||
    !Array.isArray(copia.itens) ||
    !Array.isArray(copia.respostas)
  ) {
    throw new Error(
      "Arquivo de cópia desconhecido (não é uma cópia de exclusão de pedidos deste painel).",
    );
  }
  return [
    { colecao: "camiseta_pedidos", lotes: emLotes(copia.pedidos, tamanhoDoLote) },
    { colecao: "camiseta_itens_pedido", lotes: emLotes(copia.itens, tamanhoDoLote) },
    { colecao: "respostas_pedido_camiseta", lotes: emLotes(copia.respostas, tamanhoDoLote) },
  ];
}

/** As frases da tela depois da exclusão (a tela só as mostra; o teste de unidade as confere). */
export function mensagemDoResultado(feitos: number, total: number, arquivo: string): string {
  return feitos === total
    ? `✅ Excluídos ${plural(feitos, "pedido", "pedidos")}. Cópia baixada: ${arquivo}.`
    : `⚠ Só ${feitos} de ${total} foram excluídos (a conexão falhou). Confira a lista e repita para os que faltam. A cópia baixada: ${arquivo}.`;
}
