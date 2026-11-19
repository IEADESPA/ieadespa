// O DEPARTAMENTO PELA IDADE (decisão dele: um departamento por pessoa, pela faixa de idade, separado dos ministérios; no site o departamento "sai do
// nascimento, do sexo e do estado civil"). A regra mora aqui, na tela, e só SUGERE: a secretaria vê o porquê e pode trocar. O nome dos departamentos vem
// do catálogo (cada igreja escreve do seu jeito), então a regra procura pelo sentido do nome. Caminho seguro, ele pode mudar as idades.
//   até 11 anos -> Crianças · 12 a 17 -> Adolescentes · 18 em diante solteiro(a) até 35 -> Jovens · o resto -> Senhoras (F) ou Varões (M)
import { idade } from "../comum/formato";
import type { Departamento } from "./tipos";

const SENTIDO: Readonly<Record<string, RegExp>> = {
  criancas: /crian|infantil/i,
  adolescentes: /adolesc/i,
  jovens: /jove|mocidade|juventude/i,
  senhoras: /senhora|irm[aã]s|femin|mulher/i,
  varoes: /var[õo]es|var[aã]o|homens|mascul/i
};

export interface Sugestao { readonly departamento: Departamento; readonly idade: number; readonly porque: string }

export function faixaDoDepartamento(nascimento: string | null | undefined, sexo: string | null | undefined, estadoCivil: string | null | undefined, hoje: Date = new Date()): keyof typeof SENTIDO | null {
  const anos = idade(nascimento, hoje);
  if (anos === null) return null;
  if (anos <= 11) return "criancas";
  if (anos <= 17) return "adolescentes";
  const solteiro = !estadoCivil || estadoCivil === "SOLTEIRO";
  if (solteiro && anos <= 35) return "jovens";
  if (sexo === "F") return "senhoras";
  if (sexo === "M") return "varoes";
  return null;
}

export function sugerirDepartamento(deps: readonly Departamento[], nascimento: string | null | undefined, sexo: string | null | undefined, estadoCivil: string | null | undefined, hoje: Date = new Date()): Sugestao | null {
  const faixa = faixaDoDepartamento(nascimento, sexo, estadoCivil, hoje);
  const anos = idade(nascimento, hoje);
  if (!faixa || anos === null) return null;
  const rx = SENTIDO[faixa];
  const dep = rx ? deps.find((d) => rx.test(d.nome)) : undefined;
  return dep ? { departamento: dep, idade: anos, porque: `pela idade (${anos} anos)` } : null;
}
