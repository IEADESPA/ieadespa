/**
 * Regras puras do painel de inscritos sobre PAGAMENTO e LOTES (v7.13): a situação de cada inscrição (cortesia, paga, pagamento
 * informado a conferir, pendente), os filtros, os totais ("arrecadado", "a receber") e a contagem por lote. Testadas sem navegador em
 * `scripts/testes/eventos-v713-unidade.cjs`.
 *
 * Regras: a CORTESIA sai do "não pagos" e do "a receber" (não há o que receber); "Pagamento informado, a conferir" = a pessoa avisou
 * que pagou e a equipe ainda não marcou como pago (nem é cortesia); quem está na lista de espera ou aguardando aprovação não entra no
 * "a receber" (ainda não tem vaga).
 */

export interface InscricaoPagamento {
  id: number;
  nome?: string;
  valor?: number | string | null;
  pago?: boolean | null;
  cortesia?: boolean | null;
  aguardando_vaga?: boolean | null;
  pendente_aprovacao?: boolean | null;
  faixa_rotulo?: string | null;
  pagamento_informado_em?: string | null;
  pagamento_informado_data?: string | null;
  pagamento_informado_meio?: string | null;
  pagamento_informado_valor?: number | string | null;
  pagamento_informado_nome?: string | null;
  pago_conferido_em?: string | null;
  pago_conferido_por_nome?: string | null;
  /** O "pago" que a equipe registrou pelo painel (revisão de 22/10/2026) — diferente do `pago` atual = mudaram por fora. */
  pago_conferido_valor?: boolean | null;
  cortesia_registrada_valor?: boolean | null;
  cortesia_motivo?: string | null;
  cortesia_autorizada_por?: string | null;
  cortesia_em?: string | null;
  cortesia_registrada_por_nome?: string | null;
}

export type SituacaoPagamento = "cortesia" | "pago" | "a_conferir" | "pendente";

export function situacaoPagamento(i: InscricaoPagamento): SituacaoPagamento {
  if (i.cortesia) return "cortesia";
  if (i.pago) return "pago";
  if (i.pagamento_informado_em) return "a_conferir";
  return "pendente";
}

/** Os chips de filtro de pagamento do painel. Filtros que não são de pagamento devolvem `null` (o painel decide). */
export function passaNoFiltroPagamento(i: InscricaoPagamento, filtro: string): boolean | null {
  const s = situacaoPagamento(i);
  if (filtro === "pagos") return s === "pago";
  if (filtro === "nao-pagos") return s === "pendente" || s === "a_conferir";
  if (filtro === "a-conferir") return s === "a_conferir";
  if (filtro === "cortesia") return s === "cortesia";
  return null;
}

const numero = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const comVaga = (i: InscricaoPagamento) => !i.aguardando_vaga && !i.pendente_aprovacao;

/** Os cartões de número do painel. */
export function totaisPagamento(lista: InscricaoPagamento[]) {
  const pagos = lista.filter((i) => situacaoPagamento(i) === "pago");
  const cortesias = lista.filter((i) => situacaoPagamento(i) === "cortesia");
  const aConferir = lista.filter((i) => situacaoPagamento(i) === "a_conferir");
  const aReceber = lista.filter((i) => comVaga(i) && (situacaoPagamento(i) === "pendente" || situacaoPagamento(i) === "a_conferir"));
  return {
    pagos: pagos.length,
    arrecadado: pagos.reduce((s, i) => s + numero(i.valor), 0),
    cortesias: cortesias.length,
    aConferir: aConferir.length,
    aReceber: aReceber.reduce((s, i) => s + numero(i.valor), 0),
  };
}

/** Quantas inscrições há em cada lote, na ordem das faixas do evento (lote que não está mais nas faixas aparece no fim). */
export function contagemPorLote(lista: InscricaoPagamento[], faixas: { descricao: string; vagas?: number | null }[] = []) {
  const conta = new Map<string, number>();
  for (const i of lista) {
    const rotulo = (i.faixa_rotulo || "").trim();
    if (rotulo) conta.set(rotulo, (conta.get(rotulo) ?? 0) + 1);
  }
  const saida = faixas.map((f) => ({ descricao: f.descricao, vagas: f.vagas ?? null, inscritos: conta.get(f.descricao) ?? 0 }));
  for (const [descricao, inscritos] of conta) if (!faixas.some((f) => f.descricao === descricao)) saida.push({ descricao, vagas: null, inscritos });
  return saida;
}

/**
 * Revisão de 22/10/2026 — o lote é identificado pelo NOME (`faixa_rotulo`): dois lotes com o mesmo nome, ou renomear/remover um
 * lote que já tem inscritos, embaralham a contagem (o lote renomeado "volta a zero"). O painel confere antes de salvar e bloqueia.
 * `inscritosPorLote` = { nome: inscrições } (null = não deu para contar, o painel não bloqueia por isso). Devolve a frase do problema, ou null.
 */
export function problemaDosLotes(novas: { descricao: string }[], inscritosPorLote: Record<string, number> | null): string | null {
  const chave = (t: string) => t.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  const vistos = new Map<string, string>();
  for (const f of novas) {
    const nome = String(f.descricao ?? "").trim();
    if (!nome) continue;
    if (nome.length > 120) return `O nome do lote "${nome.slice(0, 30)}…" passa de 120 letras.`;
    if (vistos.has(chave(nome))) return `Há dois lotes com o nome "${nome}". Cada lote precisa de um nome diferente (a contagem de vagas é pelo nome).`;
    vistos.set(chave(nome), nome);
  }
  if (inscritosPorLote) {
    for (const [nome, n] of Object.entries(inscritosPorLote)) {
      if (!nome || !(n > 0)) continue;
      if (!novas.some((f) => String(f.descricao ?? "").trim() === nome)) {
        return `O lote "${nome}" já tem ${n} ${n === 1 ? "inscrição" : "inscrições"}: não dá para mudar o nome dele nem removê-lo (a contagem é pelo nome e voltaria a zero). Para fechar o lote, ponha o último dia ("Vale até") ou o número de vagas.`;
      }
    }
  }
  return null;
}

export function formatarMomento(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { timeZone: "America/Belem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "Confirmado por Maria em 21/10/2026 10:30" ou "Desmarcado por João em …" — ou null quando ninguém mexeu ainda. */
export const AVISO_DIVERGENTE = "⚠️ Registro divergente: mudaram isto fora do painel depois do último registro. Quem mudou aparece no registro de atividade do Directus.";

/**
 * Revisão de 22/10/2026 — o "pago" ou a cortesia foram mudados FORA do painel (direto no Directus) depois do último registro de quem e quando?
 * Pago: o registro guarda o valor registrado (`pago_conferido_valor`); diferente do `pago` de agora = divergente (registro antigo, sem o valor, não acusa).
 * Cortesia: só existe desde a v7.13 e só pelo painel; cortesia ligada sem registro, ou diferente do valor registrado = divergente.
 */
export function registroDivergente(i: InscricaoPagamento): { pago: boolean; cortesia: boolean } {
  const pago = Boolean(i.pago_conferido_em) && i.pago_conferido_valor != null && Boolean(i.pago) !== Boolean(i.pago_conferido_valor);
  const cortesia = i.cortesia_registrada_valor != null ? Boolean(i.cortesia) !== Boolean(i.cortesia_registrada_valor) : Boolean(i.cortesia) && !i.cortesia_em;
  return { pago, cortesia };
}

export function textoConferencia(i: InscricaoPagamento): string | null {
  const divergente = registroDivergente(i).pago;
  if (!i.pago_conferido_em) return null;
  const registrado = i.pago_conferido_valor != null ? Boolean(i.pago_conferido_valor) : Boolean(i.pago);
  const texto = `${registrado ? "Confirmado" : "Desmarcado"} por ${i.pago_conferido_por_nome || "alguém da equipe"} em ${formatarMomento(i.pago_conferido_em)}`;
  return divergente ? `${texto}. ${AVISO_DIVERGENTE}` : texto;
}

/** "Cortesia: <motivo> — autorizada por X (registrada por Y em …)" ou, depois de tirada, "Cortesia tirada por Y em …". */
export function textoCortesia(i: InscricaoPagamento): string | null {
  if (registroDivergente(i).cortesia) return `Cortesia ${i.cortesia ? "ligada" : "desligada"} sem passar pelo painel. ${AVISO_DIVERGENTE}`;
  if (i.cortesia) return `Cortesia: ${i.cortesia_motivo || "(sem motivo)"} — autorizada por ${i.cortesia_autorizada_por || "?"} (registrada por ${i.cortesia_registrada_por_nome || "?"} em ${formatarMomento(i.cortesia_em)})`;
  if (i.cortesia_em) return `Cortesia tirada por ${i.cortesia_registrada_por_nome || "?"} em ${formatarMomento(i.cortesia_em)}`;
  return null;
}
