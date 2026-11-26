// Os AVISOS SÓ DE MEMBROS do painel (rodada 10): montados com o que o servidor já conta (as caixas e o resumo do rol), sem número inventado.
// "meu" = espera por quem está vendo (a caixa dele); o resto é para acompanhar (aparece em "Tudo da...").
// A montagem é SÍNCRONA (montarAvisos): o painel a refaz sozinho quando os contadores do menu chegam ou mudam.
import { pedir } from "../comum/api";
import { numero, plural, primeiroNome } from "../comum/formato";
import { ir } from "./estado.svelte";
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
/** o alerta da assembleia geral (shared/juntarFichasDb.textoDoAlerta) */
export interface AlertaAssembleia { precisaConfirmar?: boolean; mensagem?: string | null; contagem?: { repetidas?: number; possiveis?: number; numero?: number; arrolamento?: number } }
export interface Contadores { readonly fila: number; readonly repetidas: number; readonly sugestoes: number }

/** só a Geral recebe o alerta do servidor; para os outros (ou se a leitura falhar) não há alerta, e o "sem CPF" do resumo aparece no lugar */
export async function lerAlerta(geral: boolean): Promise<AlertaAssembleia | null> {
  if (!geral) return null;
  const a = await pedir<AlertaAssembleia>("/fichas-repetidas/alerta");
  return a.ok && a.dados.precisaConfirmar ? a.dados : null;
}

// abrirArrolamento: o que o aviso do 4º grupo abre (rodada 28: a congregação vai direto para "completar, uma por uma"; a área e a Geral, para a tabela)
// abrirOrgaos: o que o aviso das cadeiras antigas abre (Estrutura -> Órgãos, onde a Geral encerra com o motivo)
export function montarAvisos(resumo: ResumoPainel, chegando: readonly Transferencia[], alerta: AlertaAssembleia | null, c: Contadores, geral: boolean, abrirArrolamento: (() => void) | null = null,
  abrirOrgaos: () => void = () => {}): AvisoMembros[] {
  const lista: AvisoMembros[] = [];
  const fora = geral ? resumo.cadeirasForaDoRol : undefined;
  if (fora && fora.cadeiras + fora.vagas > 0) {
    // volta 9: as cadeiras e as vagas de comissão de antes da regra (o congregado e o arrolamento não têm cadeira): nada se apaga, a Geral encerra cada uma
    const partes = [fora.cadeiras ? `${numero(fora.cadeiras)} ${plural(fora.cadeiras, "cadeira", "cadeiras")}` : "",
      fora.vagas ? `${numero(fora.vagas)} ${plural(fora.vagas, "vaga", "vagas")} de comissão` : ""].filter(Boolean);
    const resto = fora.cadeiras + fora.vagas - fora.itens.length;
    const nomes = fora.itens.map((i) => `${i.nome} (${i.onde})`).join(" · ") + (resto > 0 ? ` · e mais ${resto}` : "");
    lista.push({ chave: "cadeiras", icone: "alerta", titulo: `${partes.join(" e ")} de quem ainda não é membro: encerrar com o motivo`, sub: nomes,
      tom: "primeiro", meu: true, abrir: abrirOrgaos });
  }
  if (resumo.arrolamento > 0 && abrirArrolamento) {
    lista.push({ chave: "arrol", icone: "alerta", titulo: `${numero(resumo.arrolamento)} ${plural(resumo.arrolamento, "ficha", "fichas")} com o arrolamento a completar`, sub: "sem voto até completar",
      tom: "afazer", meu: true, abrir: abrirArrolamento });
  }
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
  if (c.repetidas > 0) {
    lista.push({ chave: "rep", icone: "pessoas", titulo: `${c.repetidas} ${plural(c.repetidas, "par", "pares")} de fichas repetidas`, sub: geral ? "entre áreas, só a Geral junta" : "a mesma pessoa em duas fichas",
      tom: "afazer", meu: true, abrir: () => ir({ tela: "repetidas" }, true) });
  }
  if (c.fila > 0) {
    lista.push({ chave: "fila", icone: "doc", titulo: `${c.fila} ${plural(c.fila, "cadastro", "cadastros")} na fila com pendência`, sub: "falta dado ou parece outra ficha",
      tom: "afazer", meu: true, abrir: () => ir({ tela: "fila" }, true) });
  }
  if (c.sugestoes > 0) {
    lista.push({ chave: "sug", icone: "lapis", titulo: `${c.sugestoes} ${plural(c.sugestoes, "sugestão", "sugestões")} de membros para conferir`, sub: "aplicar ou recusar com o motivo",
      tom: "afazer", meu: true, abrir: () => ir({ tela: "sugestoes" }, true) });
  }
  if (alerta) {
    const k = alerta.contagem ?? {};
    const partes = [k.repetidas ? `${k.repetidas} ${plural(k.repetidas, "ficha marcada como repetida", "fichas marcadas como repetidas")}` : "",
      k.possiveis ? `${k.possiveis} ${plural(k.possiveis, "dupla", "duplas")} com o mesmo nome e nascimento` : "",
      k.numero ? `${k.numero} ${plural(k.numero, "número", "números")} a acertar` : ""].filter(Boolean);
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
