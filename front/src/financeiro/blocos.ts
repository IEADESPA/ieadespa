// Os textos e as contas das abas dos blocos de recibo (as folhas e o livro), como o desenho aprovado escreve (rodada 17, r17-blocos-folhas e
// r17-blocos-livro, opção 1). O servidor confere tudo; aqui só se escreve o que ele mandou.
import { dataBr, numero } from "../comum/formato";
import type { ContagemFolhas, DestinoFolha, EscopoTela, ExcecaoFolha, Faixa, OpcaoBloco, RegistroLivro, RegistroLote, PessoaDevolve, Rastreio } from "./tipos";

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

/** como o bloco voltou, no livro: "49 lançadas, 1 cancelada"; todas lançadas = "50 conferidas" (o desenho) */
export function contagemDaEntrada(c: ContagemFolhas): string {
  if (c.lancadas && !c.canceladas && !c.arrancadas && !c.extraviadas && !c.inexistentes && !c.livres) return plural(c.lancadas, "conferida", "conferidas");
  const p = partesDaContagem(c);
  if (c.livres) p.push(plural(c.livres, "livre", "livres"));
  return p.join(", ");
}

/** no rastreio: "49 lançadas, 1 cancelada, nenhuma livre" */
export function contagemDoRastreio(c: ContagemFolhas): string {
  const p = partesDaContagem(c);
  p.push(c.livres ? plural(c.livres, "livre", "livres") : "nenhuma livre");
  return p.join(", ");
}

/** "devolvido por Bela Vista"; a congregação Sede não se confunde com a Sede administrativa (regra dele, 17/11): "pela congregação Sede" */
const devolvidoPor = (congregacao: string): string => (/^sede$/i.test(congregacao.trim()) ? "pela congregação Sede" : `por ${congregacao}`);

const ehDoLote = (r: RegistroLivro): r is RegistroLote => r.tipo === "cadastro" || r.tipo === "chegada";

/** a linha do livro: o título e a linha de baixo */
export function linhaDoLivro(r: RegistroLivro): { readonly titulo: string; readonly detalhe: string } {
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
    return {
      titulo: `Saída: bloco ${numero(r.bloco)} entregue a ${r.pessoa} (${r.congregacao})`,
      detalhe: r.levadoPelaArea ? "levado pela área, sem ficar com ela" : `registrou ${r.registradoPor} · Tesouraria Geral`
    };
  }
  const como = r.contagem ? contagemDaEntrada(r.contagem) : "";
  return { titulo: `Entrada: bloco ${numero(r.bloco)} devolvido ${devolvidoPor(r.congregacao)}`, detalhe: `recebeu ${r.registradoPor}${como ? " · " + como : ""}` };
}

/** o rastreio do bloco (depois de "Rastreio do bloco 1.360 (veio sozinho): ") e se ele pode voltar agora */
export function textoDoRastreio(r: Rastreio): { readonly texto: string; readonly podeVoltar: boolean } {
  const b = r.bloco;
  const folhas = `folhas ${numero(b.primeiraFolha)} a ${numero(b.ultimaFolha)}`;
  if (b.situacao === "na-geral") return { texto: `${folhas} · ainda está na Tesouraria Geral: não saiu para voltar`, podeVoltar: false };
  if (b.situacao === "fechado") return { texto: `${folhas} · já foi devolvido em ${dataBr(b.devolvidoEm)}`, podeVoltar: false };
  const entregue = b.congregacao ? ` · entregue a ${b.congregacao.nome}${b.entregueEm ? ` em ${diaMes(b.entregueEm)}` : ""}` : "";
  return { texto: `${folhas}${entregue} · ${contagemDoRastreio(r.contagem)}`, podeVoltar: true };
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
