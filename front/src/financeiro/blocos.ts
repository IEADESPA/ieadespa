// Os textos e as contas das abas dos blocos de recibo (as folhas e o livro), como o desenho aprovado escreve (rodada 17, r17-blocos-folhas e
// r17-blocos-livro, opção 1). O servidor confere tudo; aqui só se escreve o que ele mandou.
import { dataBr, numero } from "../comum/formato";
import type { CongregacaoSaida, ContagemFolhas, DestinoFolha, EscopoTela, ExcecaoFolha, Faixa, OpcaoBloco, RegistroLivro, RegistroLote, PessoaDevolve, Rastreio } from "./tipos";
import type { Nivel } from "./estado.svelte";

/** "1 bloco", "2 blocos" */
export const plural = (n: number, um: string, varios: string): string => `${numero(n)} ${n === 1 ? um : varios}`;
/** "2026-11-17" → "17/11" */
export const diaMes = (iso: string | null): string => dataBr(iso).slice(0, 5);

/** o nome de cada destino na tela (a legenda do desenho) */
export const NOME_DESTINO: Record<DestinoFolha | "livre", string> = {
  lancada: "lançada na planilha", cancelada: "cancelada", arrancada: "arrancada", extraviada: "extraviada", inexistente: "inexistente", livre: "livre"
};

/** o nome curto de cada situação (a etiqueta "Está como" e o histórico da folha, na r30) */
export const NOME_CURTO: Record<DestinoFolha | "livre", string> = {
  lancada: "lançada", cancelada: "cancelada", arrancada: "arrancada", extraviada: "extraviada", inexistente: "inexistente", livre: "livre"
};

/** a hora do histórico: "2026-11-12T09:40" → "12/11 09h40" */
export function horaDoHistorico(quando: string | null): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(quando ?? "");
  return m ? `${m[3]}/${m[2]} ${m[4]}h${m[5]}` : "";
}

/** o que a pessoa escreveu, com o ponto final (o motivo se escreve sem ele; o histórico mostra com: a r30) */
export function comPonto(texto: string): string {
  const t = texto.trim();
  return !t || /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** as exceções que a tela marca, na ordem das escolhas, cada uma com a frase de quando usar (decisão dele de 24/11/2026) */
export const EXCECOES: readonly { readonly chave: ExcecaoFolha; readonly rotulo: string; readonly quando: string }[] = [
  { chave: "cancelada", rotulo: "Cancelada", quando: "preenchida errado e anulada" },
  { chave: "arrancada", rotulo: "Arrancada", quando: "tirada do bloco" },
  { chave: "extraviada", rotulo: "Extraviada", quando: "sumiu, e a congregação não sabe dela" },
  { chave: "inexistente", rotulo: "Inexistente", quando: "a gráfica não imprimiu" }
];

/** a posição da folha no bloco: 70.090 no bloco 70.051 a 70.100 é a 40ª */
export const posicao = (folha: number, primeiraFolha: number): number => folha - primeiraFolha + 1;

/** no celular, as primeiras folhas com destino viram uma linha (a r30: 38 com destino → "1ª a 35ª"), em linhas inteiras de 5, e as 15 últimas
 *  ficam sempre à vista (o 1.251, todo usado, também começa na 36ª). Devolve quantas se recolhem (0 = nenhuma). */
export function recolhidasNoCelular(destinos: readonly (DestinoFolha | null)[]): number {
  let seguidas = 0;
  while (seguidas < destinos.length && destinos[seguidas] !== null) seguidas++;
  return Math.max(0, Math.min(Math.floor(seguidas / 5) * 5, destinos.length - 15));
}

/** quantas folhas tem a faixa */
export const tamanho = (f: Faixa): number => f.ultimaFolha - f.primeiraFolha + 1;
/** "64.436 a 64.450" */
export const textoFaixa = (f: Faixa): string => `${numero(f.primeiraFolha)} a ${numero(f.ultimaFolha)}`;

/** o seletor de bloco fechado (a r30): na congregação, "Bloco 1.401 · em uso"; na Geral e na área, "Bloco 1.401 · Vila Nova" */
export function textoDoSeletor(o: OpcaoBloco, local: boolean): string {
  const onde = local ? (o.situacao === "em-uso" ? "em uso" : o.situacao === "esperando" ? "esperando" : "devolvido") : (o.congregacao ?? "na Tesouraria Geral");
  return `Bloco ${numero(o.numero)} · ${onde}`;
}

/** uma linha da lista do seletor: o título e a linha de baixo (a r30: "Bloco 1.401 · em uso" / "38 com destino · 12 livres") */
export function linhaDaOpcao(o: OpcaoBloco, local: boolean): { readonly titulo: string; readonly detalhe: string } {
  const livres = plural(tamanho(o.faixa) - o.usadas, "livre", "livres");
  const devolvido = `devolvido em ${diaMes(o.devolvidoEm)}`;
  let situacao: string, detalhe: string;
  if (o.situacao === "em-uso") { situacao = "em uso"; detalhe = `${numero(o.usadas)} com destino · ${livres}`; }
  else if (o.situacao === "esperando") { situacao = "esperando"; detalhe = `recebido em ${diaMes(o.entregueEm)} · ${livres}`; }
  else if (o.situacao === "fechado") { situacao = devolvido; detalhe = o.parcial ? `parcial: as ${numero(tamanho(o.faixa))} usadas, só consulta` : "completo: só consulta"; }
  else { situacao = ""; detalhe = `parcial · ${livres}`; }
  if (local) return { titulo: `Bloco ${numero(o.numero)} · ${situacao}`, detalhe };
  return { titulo: `Bloco ${numero(o.numero)} · ${o.congregacao ?? "na Tesouraria Geral"}`, detalhe: situacao ? `${situacao} · ${detalhe}` : detalhe };
}

/** o título da lista do seletor: "Os blocos de Vila Nova", "Os blocos da Área 2" */
export function tituloDoSeletor(e: EscopoTela | null): string {
  if (!e || e.geral) return "Os blocos das congregações";
  if (e.congregacao) return `Os blocos de ${e.congregacao}`;
  return e.area ? `Os blocos da ${e.area}` : `Os blocos das ${numero(e.congregacoes)} congregações`;
}

/** "49 lançadas, 1 cancelada" (sem as livres) */
export function partesDaContagem(c: ContagemFolhas): string[] {
  const p: string[] = [];
  if (c.lancadas) p.push(plural(c.lancadas, "lançada", "lançadas"));
  if (c.canceladas) p.push(plural(c.canceladas, "cancelada", "canceladas"));
  if (c.arrancadas) p.push(plural(c.arrancadas, "arrancada", "arrancadas"));
  if (c.extraviadas) p.push(plural(c.extraviadas, "extraviada", "extraviadas"));
  if (c.inexistentes) p.push(plural(c.inexistentes, "inexistente", "inexistentes"));
  return p;
}

/** "devolvido por Bela Vista"; a congregação Sede não se confunde com a Sede administrativa (regra dele, 17/11): "pela congregação Sede" */
const devolvidoPor = (congregacao: string): string => (/^sede$/i.test(congregacao.trim()) ? "pela congregação Sede" : `por ${congregacao}`);

const ehDoLote = (r: RegistroLivro): r is RegistroLote => r.tipo === "cadastro" || r.tipo === "chegada";

/** a linha do livro: o título e a linha de baixo. A congregação não vê o próprio nome na saída (r30: "entregue a Rute Santos") */
export function linhaDoLivro(r: RegistroLivro, nivel: Nivel = "geral"): { readonly titulo: string; readonly detalhe: string } {
  if (ehDoLote(r)) {
    if (r.tipo === "chegada") {
      return { titulo: `Chegada: lote da gráfica, série ${r.lote.serie}`, detalhe: `${plural(r.quantidade ?? 0, "bloco chegou", "blocos chegaram")} · registrou ${r.registradoPor}` };
    }
    const folhas = r.lote.ultimaFolha - r.lote.primeiraFolha + 1;
    return {
      titulo: `Cadastro: lote da gráfica, série ${r.lote.serie}`,
      detalhe: `${numero(folhas)} folhas · ${numero(r.lote.primeiraFolha)} a ${numero(r.lote.ultimaFolha)} · ${plural(r.lote.blocos, "bloco", "blocos")}`
    };
  }
  if (r.tipo === "saida") {
    const para = nivel === "local" ? r.pessoa : `${r.pessoa} (${r.congregacao})`;
    const como = r.levadoPelaArea ? "levado pela área, sem ficar com ela" : `registrou ${r.registradoPor} · Tesouraria Geral`;
    // a saída do bloco que voltou em parte: só as folhas livres, com as posições (r30: "só as folhas 64.436 a 64.450 (36ª a 50ª)")
    if (r.folhas && r.blocoPrimeiraFolha && r.folhas.primeiraFolha !== r.blocoPrimeiraFolha) {
      const so = `só as folhas ${textoFaixa(r.folhas)} (${posicao(r.folhas.primeiraFolha, r.blocoPrimeiraFolha)}ª a ${posicao(r.folhas.ultimaFolha, r.blocoPrimeiraFolha)}ª)`;
      return { titulo: `Saída: bloco ${numero(r.bloco)}, parcial, entregue a ${para}`, detalhe: `${so} · ${r.levadoPelaArea ? "levado pela área, sem ficar com ela" : `registrou ${r.registradoPor}`}` };
    }
    return { titulo: `Saída: bloco ${numero(r.bloco)} entregue a ${para}`, detalhe: como };
  }
  // a entrada (r30): a congregação não vê o próprio nome (quem trouxe); a parcial diz as usadas da entrega e as que voltaram livres
  const por = nivel === "local" ? `por ${r.pessoa}` : devolvidoPor(r.congregacao);
  if (r.parcial) {
    const livres = r.contagem?.livres ?? 0;
    const resto = nivel === "local" ? (livres === 1 ? "a 1 em branco ficou na Tesouraria Geral" : `as ${numero(livres)} em branco ficaram na Tesouraria Geral`)
      : r.faixaLivre ? `livres de novo: ${textoFaixa(r.faixaLivre)}` : "";
    const usadas = r.usadas != null ? plural(r.usadas, "usada", "usadas") : "";
    return { titulo: `Entrada parcial: bloco ${numero(r.bloco)} devolvido ${por}`, detalhe: [`recebeu ${r.registradoPor}`, usadas, resto].filter(Boolean).join(" · ") };
  }
  const partes = r.contagem ? partesDaContagem(r.contagem) : [];
  if (r.pendentes) partes.push(`${numero(r.pendentes)} sem destino`);
  return { titulo: `Entrada: bloco ${numero(r.bloco)} devolvido ${por}`, detalhe: `recebeu ${r.registradoPor}${partes.length ? ` · completo: ${partes.join(", ")}` : ""}` };
}

/** a caixa do bloco na entrada (r30): verde-água com as contas (as com destino e as sem destino, com as posições quando são as do fim) ou
 *  vermelha, com o porquê de não voltar (o que está na Geral, o que já voltou em parte, o devolvido) */
export function caixaDaEntrada(r: Rastreio): CaixaSaida {
  const b = r.bloco, n = numero(b.numero);
  if (b.situacao === "fechado") return { negrito: "", texto: `O bloco ${n} já foi devolvido em ${dataBr(b.devolvidoEm)}.`, erro: true };
  if (b.situacao === "na-geral") {
    if (b.parcial && b.faixa && r.volta) {
      return { negrito: "", texto: `O bloco ${n} já voltou, parcial, em ${dataBr(r.volta.data)}: as folhas ${textoFaixa(b.faixa)} estão livres na Tesouraria Geral para outra entrega.`, erro: true };
    }
    return { negrito: "", texto: `O bloco ${n} ainda está na Tesouraria Geral: não saiu para voltar.`, erro: true };
  }
  const c = r.contagem, f = b.faixa ?? { primeiraFolha: b.primeiraFolha, ultimaFolha: b.ultimaFolha };
  const comDestino = c.lancadas + c.canceladas + c.arrancadas + c.extraviadas + (c.inexistentes ?? 0);
  let conta: string;
  if (!c.livres) conta = `as ${numero(comDestino)} com destino (${partesDaContagem(c).join(", ")})`;
  else {
    // as em branco são as do fim quando vão da primeira em branco à última folha impressa (a inexistente do fim fica fora: a gráfica não imprimiu)
    const pe = r.primeiraEmBranco ?? null;
    const fim = pe === null ? b.ultimaFolha : livresDaParcial(pe, b.ultimaFolha, r.inexistentes ?? []).ultimaFolha;
    const doFim = pe !== null && c.livres === fim - pe + 1 ? ` (${posicao(pe, b.primeiraFolha)}ª a ${posicao(fim, b.primeiraFolha)}ª)` : "";
    conta = `${comDestino ? numero(comDestino) : "nenhuma"} com destino, ${numero(c.livres)} sem destino${doFim}`;
  }
  const entregue = b.congregacao ? ` · entregue a ${b.congregacao.nome}${b.entregueEm ? ` em ${diaMes(b.entregueEm)}` : ""}` : "";
  return { negrito: `Bloco ${n}`, texto: ` (veio sozinho): folhas ${textoFaixa(f)}${entregue} · ${conta}`, erro: false };
}

/** as folhas que voltam livres na devolução parcial (as mesmas da confirmação do servidor, `faixaLivre`): da primeira em branco ao fim do bloco,
 *  sem as inexistentes do fim; as do meio vão em `menos` (resposta dele, 24/11/2026: a inexistente continua inexistente) */
export function livresDaParcial(primeiraEmBranco: number, ultimaFolha: number, inexistentes: readonly number[]): Faixa & { readonly menos: readonly number[]; readonly quantas: number } {
  const fora = new Set(inexistentes);
  let fim = ultimaFolha;
  while (fim > primeiraEmBranco && fora.has(fim)) fim--;
  const menos = [...fora].filter((f) => f > primeiraEmBranco && f < fim).sort((x, y) => x - y);
  return { primeiraFolha: primeiraEmBranco, ultimaFolha: fim, menos, quantas: fim - primeiraEmBranco + 1 - menos.length };
}

/** a linha do que vai acontecer na parcial, antes de gravar (r30): "64.436 a 64.450 (15 folhas) voltam a ficar livres."; com a inexistente do meio,
 *  "66.531 a 66.549 (18 folhas, menos a 66.540, inexistente) voltam a ficar livres."; uma só, "66.549 (1 folha) volta a ficar livre." */
export function linhaDaVolta(l: ReturnType<typeof livresDaParcial>): string {
  const faixa = l.primeiraFolha === l.ultimaFolha ? numero(l.primeiraFolha) : textoFaixa(l);
  const menos = !l.menos.length ? "" : l.menos.length === 1 ? `, menos a ${numero(l.menos[0])}, inexistente`
    : `, menos as ${l.menos.slice(0, -1).map(numero).join(", ")} e ${numero(l.menos[l.menos.length - 1])}, inexistentes`;
  return `${faixa} (${plural(l.quantas, "folha", "folhas")}${menos}) ${l.quantas === 1 ? "volta a ficar livre" : "voltam a ficar livres"}.`;
}

/** a confirmação da parcial, mais curta no celular (r30: "Bloco 1.288 de volta, parcial: 64.436 a 64.450 livres para outra entrega.") */
export function confirmacaoNoCelular(mensagem: string): string {
  return mensagem.replace(/^(Bloco [\d.]+ de volta, parcial): as folhas (.+?) estão livres para outra entrega\.$/, "$1: $2 livres para outra entrega.");
}

/** quem pode devolver, no "Devolvido por": "Lia Fontes · tesoureira de Bela Vista", "Ezequiel Ramos · quem levou o bloco" */
export function rotuloDaPessoa(p: PessoaDevolve, congregacao: string | null): string {
  const papel = p.papel.trim();
  if (!papel) return p.nome;
  if (papel === "quem levou o bloco") return `${p.nome} · ${papel}`;
  return `${p.nome} · ${papel.toLocaleLowerCase("pt-BR")}${congregacao ? ` de ${congregacao}` : ""}`;
}

/** só os algarismos do que a pessoa digitou ("68.001" → "68001"); o servidor confere o número */
export const soNumeros = (v: string): string => v.replace(/\D/g, "").slice(0, 9);

// ---- o "Registrar saída" (rodada 30, "r30-blocos-saida") ----

/** o dia de hoje em Brasília ("aaaa-mm-dd"), como o servidor confere a data */
export const hojeBrasilia = (): string => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** a caixa do bloco na saída: verde-água (veio sozinho, pode sair) ou vermelha (o que não pode sair, com o porquê) */
export interface CaixaSaida { readonly negrito: string; readonly texto: string; readonly erro: boolean }
export function caixaDaSaida(r: Rastreio, celular: boolean): CaixaSaida {
  const b = r.bloco, n = numero(b.numero);
  if (b.situacao === "fechado") return { negrito: "", texto: `O bloco ${n} voltou completo em ${dataBr(b.devolvidoEm)}: não tem folha livre para sair.`, erro: true };
  if (b.situacao !== "na-geral") {
    return { negrito: "", texto: `O bloco ${n} já saiu: está com ${b.congregacao?.nome ?? "uma congregação"}${b.entregueEm ? ` desde ${dataBr(b.entregueEm)}` : ""}.`, erro: true };
  }
  if (!b.chegouEm) return { negrito: "", texto: `O bloco ${n} ainda não chegou da gráfica.`, erro: true };
  if (b.parcial && b.faixa) {
    const f = b.faixa, de = r.volta?.congregacao ?? "";
    const posicoes = `${posicao(f.primeiraFolha, b.primeiraFolha)}ª a ${posicao(f.ultimaFolha, b.primeiraFolha)}ª`;
    const livres = `saem só as ${plural(b.livres, "livre", "livres")}, ${textoFaixa(f)} (${posicoes})`;
    if (celular) return { negrito: `Bloco ${n}, parcial`, texto: ` (veio sozinho): ${livres}. As usadas ficam no histórico${de ? `, com ${de}` : ""}.`, erro: false };
    const voltou = r.volta ? ` · voltou de ${de} em ${diaMes(r.volta.data)}` : "";
    const usadas = r.volta ? ` As ${plural(r.volta.usadas, "usada fica", "usadas ficam")} no histórico, com ${de}.` : "";
    return { negrito: `Bloco ${n}, parcial`, texto: ` (veio sozinho): ${livres}${voltou} · está na Tesouraria Geral.${usadas}`, erro: false };
  }
  return { negrito: `Bloco ${n}`, texto: ` (veio sozinho): folhas ${numero(b.primeiraFolha)} a ${numero(b.ultimaFolha)} · chegou em ${dataBr(b.chegouEm)} · ${celular ? "na" : "está na"} Tesouraria Geral`, erro: false };
}

/** a frase do "Levado pela área" (a congregação sem área cadastrada fica com a frase geral) */
export function fraseDoLevado(c: CongregacaoSaida | null, ligado: boolean, celular: boolean): string {
  const area = c?.area ? `a ${c.area}` : "a área";
  if (c && ligado) return `${c.area ? `A ${c.area}` : "A área"} leva até ${c.nome}; o bloco não fica com ela.`;
  if (!c || !c.area) return "Marque se a área da congregação vai levar o bloco.";
  return celular ? `Marque se ${area} vai levar.` : `Marque se ${area} vai levar o bloco até ${c.nome}.`;
}

/** o que a data da saída confere antes de gravar: nem antes da volta (o parcial), nem antes da chegada, nem depois de hoje */
export function erroDaDataDaSaida(dia: string, r: Rastreio | null, celular: boolean): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return "Informe a data da entrega.";
  if (dia > hojeBrasilia()) return "Depois de hoje: confira a data.";
  if (r?.bloco.parcial && r.volta && dia < r.volta.data) return `Antes da volta do bloco (${dataBr(r.volta.data)}).`;
  const chegou = r?.bloco.chegouEm;
  if (chegou && dia < chegou) return celular ? `Antes da chegada (${dataBr(chegou)}).` : `Antes da chegada do bloco (${dataBr(chegou)}).`;
  return "";
}
