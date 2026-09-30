import { chavesRateioManual } from "./departamentos";
import type { TipoDepartamento } from "./types";

export interface ResultadoRateio {
  valorTotal: number;
  paraLocal: number;
  paraGeral: number;
  manual: boolean;
}

export function calcularValorTotal(dep: TipoDepartamento, valores: Record<string, number>): number {
  return dep.camposFinanceiros.reduce((soma, campo) => soma + (valores[campo.chave] ?? 0), 0);
}

export function calcularRateio(dep: TipoDepartamento, valores: Record<string, number>): ResultadoRateio {
  const valorTotal = calcularValorTotal(dep, valores);
  const { rateio } = dep;

  const chavesManuais = chavesRateioManual(dep);
  if (chavesManuais) {
    return {
      valorTotal,
      paraLocal: valores[chavesManuais.local] ?? 0,
      paraGeral: valores[chavesManuais.geral] ?? 0,
      manual: true,
    };
  }

  switch (rateio.tipo) {
    case "integral_geral":
      return { valorTotal, paraLocal: 0, paraGeral: valorTotal, manual: false };
    case "integral_local":
      return { valorTotal, paraLocal: valorTotal, paraGeral: 0, manual: false };
    case "mensalidade_fixa": {
      const mensalidade = valores["fin_mensalidades"] ?? 0;
      return { valorTotal, paraLocal: valorTotal - mensalidade, paraGeral: mensalidade, manual: false };
    }
    case "percentual": {
      const percentual = (rateio.percentualGeral ?? 0) / 100;
      if (rateio.modoEntrada === "liquido_manual") {
        // quem preenche já lança apenas o valor líquido (o resultado do percentual)
        return { valorTotal, paraLocal: 0, paraGeral: valorTotal, manual: false };
      }
      const paraGeral = round2(valorTotal * percentual);
      return { valorTotal, paraLocal: round2(valorTotal - paraGeral), paraGeral, manual: false };
    }
    default:
      return { valorTotal, paraLocal: valorTotal, paraGeral: 0, manual: false };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
