/**
 * A parte COM REDE da exclusão em massa dos pedidos de camiseta que ninguém veio buscar (aba "Excluir" da campanha, 16/10/2026). A regra e os textos estão em
 * `exclusaoEmMassa.ts` (puros); aqui só se conversa com o Directus, e tudo o que é do navegador (confirmar, perguntar, baixar o arquivo, mostrar a mensagem) entra por
 * `AmbienteExclusao`, para o teste de unidade rodar o fluxo inteiro com um Directus de mentira.
 *
 * Ordem de segurança (nada é apagado antes de a cópia existir): (1) confirmação com o resumo → (2) digitar EXCLUIR → (3) reler tudo no Directus (todas as colunas, itens e
 * respostas) e recusar se alguém mudou algo no meio → (4) baixar a cópia → (5) apagar em lotes → (6) guardar a cópia para o "Desfazer".
 */
import {
  emLotes,
  etapasDaRestauracao,
  mensagemDoResultado,
  montarCopia,
  nomeDoArquivoDaCopia,
  palavraConfere,
  resumoDaExclusao,
  textoDaConfirmacao,
  textoDaPalavra,
  type CopiaDaExclusao,
  type LoteParaExcluir,
  type PedidoParaExcluir,
} from "./exclusaoEmMassa";

export interface AmbienteExclusao {
  api: (url: string, init?: RequestInit) => Promise<Response>;
  directusUrl: string;
  /** o token de agora (a sessão se renova sozinha; quem chama a `api` já trata o 401) */
  token: () => string;
  confirmar: (texto: string) => boolean;
  perguntar: (texto: string) => string | null;
  status: (texto: string) => void;
  baixar: (nome: string, conteudo: string) => void;
  agora?: () => Date;
  /**
   * Chamada antes de restaurar: devolve o motivo de NÃO caber (por exemplo, o limite de pedidos do lote aberto, que foi preenchido por pedidos novos depois da exclusão),
   * ou null se cabe. Nada é restaurado quando devolve texto.
   */
  conferirEspaco?: (copia: CopiaDaExclusao) => Promise<string | null>;
}

type Registro = Record<string, unknown>;

export interface ResultadoDaExclusao {
  /** os números dos pedidos que de fato foram apagados (pode ser menos que o pedido, se a conexão caiu no meio) */
  apagados: number[];
  /** a cópia SÓ do que foi apagado (para o "Desfazer"); null se nada foi apagado */
  copia: CopiaDaExclusao | null;
  arquivo: string | null;
}

const MSG_MUDOU =
  "Alguém mudou esses pedidos enquanto você confirmava (separou, deu retirada ou já apagou). NADA foi apagado: atualize a lista e tente de novo.";
const MSG_NAO_LEU = "Não consegui ler os pedidos agora: NADA foi apagado. Tente de novo.";

/**
 * Exclui `alvo` (já escolhido e já limitado pelo "os primeiros N"). Devolve `null` quando nada foi apagado (cancelou, não achou, ou a conferência recusou); a mensagem para a
 * pessoa já foi mostrada por `status`.
 */
export async function excluirPedidos(
  amb: AmbienteExclusao,
  {
    grupo,
    alvo,
    lotes,
    filtros,
    semFiltro,
  }: {
    grupo: { id: number; nome: string };
    alvo: PedidoParaExcluir[];
    lotes: LoteParaExcluir[];
    filtros: string;
    semFiltro: boolean;
  },
): Promise<ResultadoDaExclusao | null> {
  if (!alvo.length) {
    amb.status("Nenhum pedido se encaixa.");
    return null;
  }
  if (!amb.confirmar(textoDaConfirmacao(resumoDaExclusao(alvo, lotes), filtros))) return null;
  if (!palavraConfere(amb.perguntar(textoDaPalavra(alvo.length, semFiltro)))) {
    amb.status("Cancelado: nada foi apagado.");
    return null;
  }
  const ids = alvo.map((p) => p.id);
  const cabecalho = () => ({
    Authorization: `Bearer ${amb.token()}`,
    "Content-Type": "application/json",
  });
  let apagouAlgum = false;
  try {
    amb.status("Conferindo os pedidos e preparando a cópia…");
    // 1) lê tudo de novo: é a cópia, e é a conferência de que NINGUÉM mudou nada desde que a lista foi montada
    const completos: (Registro & { id: number; itens?: Registro[] })[] = [];
    const respostas: Registro[] = [];
    for (const parte of emLotes(ids)) {
      const lista = parte.join(",");
      const r1 = await amb.api(
        `${amb.directusUrl}/items/camiseta_pedidos?filter[id][_in]=${lista}&fields=*,itens.*&limit=-1`,
        { headers: cabecalho() },
      );
      const r2 = await amb.api(
        `${amb.directusUrl}/items/respostas_pedido_camiseta?filter[pedido][_in]=${lista}&fields=*&limit=-1`,
        { headers: cabecalho() },
      );
      if (!r1.ok || !r2.ok) throw new Error("leitura");
      completos.push(
        ...(((await r1.json()).data as (Registro & { id: number; itens?: Registro[] })[]) ?? []),
      );
      respostas.push(...(((await r2.json()).data as Registro[]) ?? []));
    }
    const mudou =
      completos.length !== ids.length ||
      completos.some(
        (p) =>
          p.separado === true ||
          p.avulso === true ||
          (p.itens ?? []).some((i) => Number(i.quantidade_retirada) > 0),
      );
    if (mudou) {
      amb.status(MSG_MUDOU);
      return null;
    }
    // 2) a cópia vai para o computador ANTES de apagar qualquer coisa
    const quando = (amb.agora ?? (() => new Date()))();
    const copia = montarCopia(
      { id: grupo.id, nome: grupo.nome },
      completos,
      respostas,
      quando.toISOString(),
    );
    const arquivo = nomeDoArquivoDaCopia(grupo.nome, quando);
    amb.baixar(arquivo, JSON.stringify(copia));
    // 3) apaga em lotes (o banco apaga os itens e as respostas junto); para no primeiro lote que falhar
    let feitos = 0;
    for (const parte of emLotes(ids)) {
      const res = await amb.api(`${amb.directusUrl}/items/camiseta_pedidos`, {
        method: "DELETE",
        headers: cabecalho(),
        body: JSON.stringify(parte),
      });
      if (!res.ok) break;
      feitos += parte.length;
      apagouAlgum = true;
      amb.status(`Apagando ${feitos} de ${ids.length}…`);
    }
    const apagados = ids.slice(0, feitos);
    const conjunto = new Set(apagados);
    amb.status(mensagemDoResultado(feitos, ids.length, arquivo));
    return {
      apagados,
      arquivo,
      copia:
        feitos > 0
          ? {
              ...copia,
              pedidos: copia.pedidos.filter((p) => conjunto.has(Number(p.id))),
              itens: copia.itens.filter((i) => conjunto.has(Number(i.pedido))),
              respostas: copia.respostas.filter((r) => conjunto.has(Number(r.pedido))),
            }
          : null,
    };
  } catch {
    amb.status(
      apagouAlgum
        ? "⚠ A conexão falhou no meio. Confira a lista (a cópia dos pedidos já foi baixada)."
        : MSG_NAO_LEU,
    );
    return null;
  }
}

/** O "Desfazer a exclusão": recria pedidos, depois itens e respostas, com os mesmos números. Para no primeiro lote que falhar (e manda usar o arquivo, para não duplicar). */
export async function desfazerExclusao(
  amb: AmbienteExclusao,
  copia: CopiaDaExclusao,
): Promise<{ ok: boolean; pedidosVoltaram: number }> {
  try {
    etapasDaRestauracao(copia);
  } catch (e) {
    amb.status((e as Error).message);
    return { ok: false, pedidosVoltaram: 0 };
  }
  if (amb.conferirEspaco) {
    let problema: string | null;
    try {
      problema = await amb.conferirEspaco(copia);
    } catch {
      amb.status("Não consegui conferir o limite de pedidos agora: NADA foi restaurado. Tente de novo.");
      return { ok: false, pedidosVoltaram: 0 };
    }
    if (problema) {
      amb.status(problema);
      return { ok: false, pedidosVoltaram: 0 };
    }
  }
  if (
    !amb.confirmar(
      `Desfazer a exclusão? Os ${copia.pedidos.length} pedido(s) voltam com os mesmos números, itens e respostas.`,
    )
  )
    return { ok: false, pedidosVoltaram: 0 };
  const cabecalho = () => ({
    Authorization: `Bearer ${amb.token()}`,
    "Content-Type": "application/json",
  });
  let tudo = true;
  let pedidosVoltaram = 0;
  try {
    for (const etapa of etapasDaRestauracao(copia)) {
      for (const parte of etapa.lotes) {
        const res = await amb.api(`${amb.directusUrl}/items/${etapa.colecao}`, {
          method: "POST",
          headers: cabecalho(),
          body: JSON.stringify(parte),
        });
        if (!res.ok) {
          tudo = false;
          break;
        }
        if (etapa.colecao === "camiseta_pedidos") pedidosVoltaram += parte.length;
        amb.status(`Restaurando… (${pedidosVoltaram} de ${copia.pedidos.length} pedidos)`);
      }
      if (!tudo) break;
    }
  } catch {
    tudo = false;
  }
  amb.status(
    tudo
      ? `✅ Exclusão desfeita: ${pedidosVoltaram} pedido(s) de volta, com itens e respostas.`
      : "⚠ Não consegui restaurar tudo. NÃO tente de novo por aqui (poderia duplicar): use o arquivo de cópia que foi baixado (peça ao suporte para restaurar) e confira a lista.",
  );
  return { ok: tudo, pedidosVoltaram };
}
