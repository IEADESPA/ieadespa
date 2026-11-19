// Os AVISOS SÓ DE MEMBROS do painel (rodada 10): montados com o que o servidor já conta (as caixas e o resumo do rol), sem número inventado.
// "meu" = espera por quem está vendo (a caixa dele); o resto é para acompanhar (aparece em "Tudo da...").
import { pedir } from "../comum/api";
import { numero, plural, primeiroNome } from "../comum/formato";
import { contadores, ir } from "./estado.svelte";
import type { ResumoPainel, Transferencia } from "./tipos";

export interface AvisoMembros {
  readonly chave: string;
  readonly icone: string;
  readonly titulo: string;
  readonly sub: string;
  readonly tom: "primeiro" | "afazer" | "feito";
  readonly meu: boolean;
  readonly abrir: () => void;
}

export async function avisosDoModulo(resumo: ResumoPainel, chegando: readonly Transferencia[], geral: boolean): Promise<AvisoMembros[]> {
  const lista: AvisoMembros[] = [];
  const pendentes = chegando.filter((t) => t.situacao === "PENDENTE" && t.podeDecidir);
  if (pendentes.length === 1 && pendentes[0]) {
    const t = pendentes[0];
    lista.push({ chave: "tr", icone: "seta", titulo: `${primeiroNome(t.pessoaNome)} chega de ${t.origemNome}: aceitar a transferência`, sub: t.diasParado ? `há ${t.diasParado} ${plural(t.diasParado, "dia", "dias")}` : "hoje",
      tom: (t.diasParado ?? 0) >= 3 ? "primeiro" : "afazer", meu: true, abrir: () => ir({ tela: "transferencias", aba: "chegando" }, true) });
  } else if (pendentes.length > 1) {
    const parado = Math.max(...pendentes.map((t) => t.diasParado ?? 0));
    lista.push({ chave: "tr", icone: "seta", titulo: `${pendentes.length} transferências chegando: aceitar ou recusar`, sub: parado ? `a mais antiga parada há ${parado} dias` : "chegaram hoje",
      tom: parado >= 3 ? "primeiro" : "afazer", meu: true, abrir: () => ir({ tela: "transferencias", aba: "chegando" }, true) });
  }
  if (contadores.repetidas > 0) {
    const n = contadores.repetidas;
    lista.push({ chave: "rep", icone: "pessoas", titulo: `${n} ${plural(n, "par", "pares")} de fichas repetidas`, sub: geral ? "entre áreas, só a Geral junta" : "a mesma pessoa em duas fichas",
      tom: "afazer", meu: true, abrir: () => ir({ tela: "repetidas" }, true) });
  }
  if (contadores.fila > 0) {
    const n = contadores.fila;
    lista.push({ chave: "fila", icone: "doc", titulo: `${n} ${plural(n, "cadastro", "cadastros")} na fila com pendência`, sub: "falta dado ou parece outra ficha",
      tom: "afazer", meu: true, abrir: () => ir({ tela: "fila" }, true) });
  }
  if (contadores.sugestoes > 0) {
    const n = contadores.sugestoes;
    lista.push({ chave: "sug", icone: "lapis", titulo: `${n} ${plural(n, "sugestão", "sugestões")} de membros para conferir`, sub: "aplicar ou recusar com o motivo",
      tom: "afazer", meu: true, abrir: () => ir({ tela: "sugestoes" }, true) });
  }
  // o alerta da assembleia geral (só a Geral recebe do servidor: shared/juntarFichasDb.textoDoAlerta); para os outros, o "sem CPF" do resumo
  interface Alerta { precisaConfirmar?: boolean; mensagem?: string | null; contagem?: { repetidas?: number; possiveis?: number; numero?: number; arrolamento?: number } }
  let alerta: Alerta | null = null;
  if (geral) {
    const a = await pedir<Alerta>("/fichas-repetidas/alerta");
    if (a.ok && a.dados.precisaConfirmar) alerta = a.dados;
  }
  if (alerta) {
    const c = alerta.contagem ?? {};
    const fichas = (c.repetidas ?? 0) + (c.possiveis ?? 0);
    const partes = [fichas ? `${fichas} ${plural(fichas, "ficha repetida", "fichas repetidas")}` : "", c.numero ? `${c.numero} ${plural(c.numero, "número", "números")} a acertar` : ""].filter(Boolean);
    lista.push({ chave: "assembleia", icone: "alerta", titulo: "Cadastros a acertar antes da assembleia geral", sub: partes.join(" · "), tom: "primeiro", meu: true, abrir: () => ir({ tela: "repetidas" }, true) });
  }
  if (resumo.semCpf > 0) {
    lista.push({ chave: "cpf", icone: "alerta", titulo: `${numero(resumo.semCpf)} sem CPF no rol`, sub: "quem não tem CPF não entra na lista de votantes",
      tom: "afazer", meu: false, abrir: () => ir({ tela: "pessoas" }, true) });
  }
  if (resumo.semDepartamento > 0) {
    lista.push({ chave: "dep", icone: "pasta", titulo: `${numero(resumo.semDepartamento)} sem departamento`, sub: "completar na ficha", tom: "afazer", meu: false, abrir: () => ir({ tela: "pessoas" }, true) });
  }
  if (resumo.novosNoMes > 0) {
    lista.push({ chave: "novos", icone: "check", titulo: `${numero(resumo.novosNoMes)} ${plural(resumo.novosNoMes, "entrou", "entraram")} no rol este mês`, sub: resumo.novosPorForma.map((f) => `${f.n} ${f.forma}`).join(" · "),
      tom: "feito", meu: false, abrir: () => ir({ tela: "pessoas" }, true) });
  }
  return lista;
}
