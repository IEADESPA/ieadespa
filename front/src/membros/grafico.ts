// O gráfico grande do painel executivo de Membros (rodada 10): as linhas e a legenda a partir dos grupos que o servidor manda
// (api/shared/painelMembros.js, GROUPING SETS — os grupos de um agrupamento somam o rol inteiro).
// Regras (defeito visto na homologação em 19/11/2026: o pastor de área com 60 pessoas, todas sem departamento, via "0 e 0" e "ninguém no rol"):
//   - TODO grupo com gente entra, para a legenda somar exatamente o rol dos números do alto;
//   - o grupo "Sem ..." (Sem departamento, Sem congregação, Sem sexo informado, Sem data de nascimento) aparece sempre, por último;
//   - o que passar do limite de linhas vira "Outros (n)", antes dele (a soma não perde ninguém).
// Sem dependência da tela: o teste do jest (api/shared/__tests__/painelGrafico.test.js) carrega este arquivo direto.
import type { GrupoPainel, Recorte } from "./tipos";

export interface LinhaGrafico {
  readonly nome: string;
  readonly total: number;
  readonly sim: number;
  readonly nao: number;
  /** a largura da barra, em % da maior linha */
  readonly largura: number;
  /** a linha de quem não tem o dado preenchido ("Sem departamento"...) */
  readonly sem: boolean;
}
export interface Grafico {
  readonly linhas: readonly LinhaGrafico[];
  readonly sim: number;
  readonly nao: number;
  readonly total: number;
}

const SEM = /^Sem /;
const OUTROS = /^Outros \((\d+)\)$/;
const RECORTES_GRAFICO: readonly Recorte[] = ["es", "aguas", "cpf", "comunhao", "completo"];

type Contas = { total: number } & Record<Recorte, number>;

// junta vários grupos num "Outros (n)"; um "Outros (k)" que já veio do servidor conta como k grupos
function juntar(resto: readonly GrupoPainel[]): GrupoPainel {
  const contas: Contas = { total: 0, es: 0, aguas: 0, cpf: 0, comunhao: 0, completo: 0 };
  let n = 0;
  for (const g of resto) {
    const m = OUTROS.exec(g.nome);
    n += m ? Number(m[1]) : 1;
    contas.total += g.total;
    for (const r of RECORTES_GRAFICO) contas[r] += g[r];
  }
  return { nome: `Outros (${n})`, ...contas };
}

export function montarGrafico(grupos: readonly GrupoPainel[], recorte: Recorte, maxLinhas: number): Grafico {
  const comGente = grupos.filter((g) => g.total > 0);
  const sem = comGente.filter((g) => SEM.test(g.nome));
  let principais = comGente.filter((g) => !SEM.test(g.nome));
  const cabem = Math.max(2, maxLinhas - sem.length);
  if (principais.length > cabem) principais = [...principais.slice(0, cabem - 1), juntar(principais.slice(cabem - 1))];
  const todas = [...principais, ...sem];
  const maior = Math.max(1, ...todas.map((g) => g.total));
  const linhas = todas.map((g) => ({
    nome: g.nome,
    total: g.total,
    sim: g[recorte],
    nao: g.total - g[recorte],
    largura: Math.round((g.total / maior) * 100),
    sem: SEM.test(g.nome)
  }));
  const sim = linhas.reduce((a, l) => a + l.sim, 0);
  const total = linhas.reduce((a, l) => a + l.total, 0);
  return { linhas, sim, nao: total - sim, total };
}
