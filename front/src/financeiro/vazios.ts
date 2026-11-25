// Os textos das listas vazias dos blocos de recibo (rodada 30, "r30-blocos-vazios"): cada nível tem a sua. O nome da área e o da congregação vêm de
// quem está vendo (o `escopo` da resposta), nunca escritos no código. A congregação chamada Sede não se confunde com a Sede administrativa (regra
// dele, 17/11): "a congregação Sede".
import { numero } from "../comum/formato";
import type { Nivel } from "./estado.svelte";
import type { EscopoTela } from "./tipos";

export interface TextoVazio { readonly titulo: string; readonly texto: string }

const ehSede = (nome: string): boolean => /^sede$/i.test(nome.trim());
/** "Vila Nova" ou "a congregação Sede" (o sujeito da frase); sem o nome, "a sua congregação" */
const congregacao = (e: EscopoTela | null): string => (!e?.congregacao ? "a sua congregação" : ehSede(e.congregacao) ? "a congregação Sede" : e.congregacao);
/** "da Área 2"; sem o nome (a pessoa alcança congregações de mais de uma área), "da área" */
const daArea = (e: EscopoTela | null): string => (e?.area ? `da ${e.area}` : "da área");
const maiuscula = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** a aba "Folhas do bloco" sem bloco */
export function vazioDasFolhas(nivel: Nivel, e: EscopoTela | null): TextoVazio {
  if (nivel === "geral") return { titulo: "Nenhum bloco saiu para as congregações ainda.", texto: "Para entregar um bloco, use “Registrar saída”, no livro de entrada e saída." };
  if (nivel === "area") {
    return { titulo: `Nenhuma congregação ${daArea(e)} está com bloco agora.`, texto: "Os blocos saem da Tesouraria Geral. Quando um chegar a uma congregação da área, as folhas dele aparecem aqui." };
  }
  return { titulo: `${maiuscula(congregacao(e))} está sem bloco de recibo agora.`, texto: "Para receber um bloco, fale com a Tesouraria Geral. Quando ele chegar, as folhas aparecem aqui." };
}

/** o livro de entrada e saída vazio */
export function vazioDoLivro(nivel: Nivel, e: EscopoTela | null): TextoVazio {
  if (nivel === "geral") return { titulo: "O livro ainda está vazio.", texto: "O primeiro registro aparece quando a Tesouraria Geral cadastra o lote da gráfica, na aba Blocos." };
  if (nivel === "area") {
    return { titulo: `Nenhum bloco saiu para as congregações ${daArea(e)} ainda.`, texto: "Quando a Tesouraria Geral entregar um bloco a uma delas, a saída fica registrada aqui." };
  }
  return { titulo: `Nenhum bloco saiu para ${congregacao(e)} ainda.`, texto: "Quando a Tesouraria Geral entregar um bloco a vocês, a saída fica registrada aqui." };
}

/** a aba Blocos da Geral antes do primeiro lote (no celular, que não tem o cadastro do lote, a frase não aponta para o botão) */
export function vazioDosBlocos(celular: boolean): TextoVazio {
  return { titulo: "Nenhum bloco ainda.", texto: celular ? "Os blocos aparecem quando o lote da gráfica chega." : "Os blocos aparecem quando o lote da gráfica chega. Comece em “Cadastrar lote da gráfica”." };
}

/** a procura sem resultado, no lugar da lista: "Nenhum bloco tem o número 99.999." */
export function vazioDaProcura(procura: string): TextoVazio {
  const s = procura.trim().replace(/\./g, "");
  return { titulo: `Nenhum bloco tem o número ${/^\d{1,9}$/.test(s) ? numero(Number(s)) : procura.trim()}.`, texto: "Confira o número do bloco ou da folha." };
}
