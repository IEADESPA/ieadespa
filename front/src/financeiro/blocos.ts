// Os textos e as contas das abas dos blocos de recibo (as folhas e o livro), como o desenho aprovado escreve (rodada 17, r17-blocos-folhas e
// r17-blocos-livro, opção 1). O servidor confere tudo; aqui só se escreve o que ele mandou.
import { dataBr, numero } from "../comum/formato";
import type { ContagemFolhas, DestinoFolha, ExcecaoFolha, RegistroLivro, RegistroLote, PessoaDevolve, Rastreio } from "./tipos";

/** "1 bloco", "2 blocos" */
export const plural = (n: number, um: string, varios: string): string => `${numero(n)} ${n === 1 ? um : varios}`;
/** "2026-11-17" → "17/11" */
export const diaMes = (iso: string | null): string => dataBr(iso).slice(0, 5);

/** o nome de cada destino na tela (a legenda do desenho) */
export const NOME_DESTINO: Record<DestinoFolha | "livre", string> = {
  lancada: "lançada na planilha", cancelada: "cancelada", arrancada: "arrancada", extraviada: "extraviada", inexistente: "inexistente", livre: "livre"
};

/** as exceções que a tela marca, na ordem das escolhas, cada uma com a frase de quando usar (decisão dele de 24/11/2026) */
export const EXCECOES: readonly { readonly chave: ExcecaoFolha; readonly rotulo: string; readonly quando: string }[] = [
  { chave: "cancelada", rotulo: "Cancelada", quando: "preenchida errado e anulada" },
  { chave: "arrancada", rotulo: "Arrancada", quando: "tirada do bloco" },
  { chave: "extraviada", rotulo: "Extraviada", quando: "sumiu, e a congregação não sabe dela" },
  { chave: "inexistente", rotulo: "Inexistente", quando: "a gráfica não imprimiu" }
];

/** a posição da folha no bloco: 70.090 no bloco 70.051 a 70.100 é a 40ª */
export const posicao = (folha: number, primeiraFolha: number): number => folha - primeiraFolha + 1;

/** no celular, as primeiras folhas com destino viram uma linha (o desenho: 38 com destino → "1ª a 30ª"; em dezenas inteiras, como as linhas
 *  do notebook). Devolve quantas se recolhem (0 = nenhuma). */
export function recolhidasNoCelular(destinos: readonly (DestinoFolha | null)[]): number {
  let seguidas = 0;
  while (seguidas < destinos.length && destinos[seguidas] !== null) seguidas++;
  return Math.floor(seguidas / 10) * 10;
}

/** "49 lançadas, 1 cancelada" (sem as livres) */
function partesDaContagem(c: ContagemFolhas): string[] {
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
