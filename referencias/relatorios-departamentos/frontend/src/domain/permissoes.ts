import type { Congregacao, PerfilNome, RelatorioMensal, StatusRelatorio, TipoDepartamento, Usuario } from "./types";

export const ROTULO_PERFIL: Record<PerfilNome, string> = {
  lider_local: "Líder Local",
  dirigente_congregacao: "Dirigente da Congregação",
  lider_area: "Líder de Área",
  pastor_area: "Pastor de Área",
  lider_geral: "Líder Geral",
  secretario_geral: "Secretário(a) Geral",
  presidente: "Presidente do Campo",
};

/** Nível hierárquico de autoridade de cada perfil, usado para decidir quem pode agir
 *  sobre um relatório sem depender de os níveis abaixo terem feito algo primeiro
 *  (confirmado: Líder Geral, Secretário Geral e Presidente têm poder de atuar direto). */
export const NIVEL_PERFIL: Record<PerfilNome, number> = {
  lider_local: 1,
  dirigente_congregacao: 1,
  lider_area: 2,
  pastor_area: 2,
  lider_geral: 3,
  secretario_geral: 4,
  presidente: 4,
};

export interface TarefaPreenchimento {
  tipoDepartamentoId: string;
  congregacaoId: string;
}

/** Departamento × congregação em que o usuário pode preencher/enviar relatório como líder local/dirigente */
export function tarefasDePreenchimento(usuario: Usuario, departamentos: TipoDepartamento[]): TarefaPreenchimento[] {
  const tarefas = new Map<string, TarefaPreenchimento>();

  for (const v of usuario.vinculos) {
    if (v.perfil === "lider_local" && v.tipoDepartamentoId && v.congregacaoId) {
      tarefas.set(`${v.tipoDepartamentoId}__${v.congregacaoId}`, {
        tipoDepartamentoId: v.tipoDepartamentoId,
        congregacaoId: v.congregacaoId,
      });
    }
    if (v.perfil === "dirigente_congregacao" && v.congregacaoId) {
      for (const dep of departamentos) {
        tarefas.set(`${dep.id}__${v.congregacaoId}`, { tipoDepartamentoId: dep.id, congregacaoId: v.congregacaoId });
      }
    }
  }
  return [...tarefas.values()];
}

/** Departamento × área em que o usuário pode revisar/aprovar relatórios em nível de área */
export function escoposDeRevisaoArea(usuario: Usuario, departamentos: TipoDepartamento[]): { tipoDepartamentoId: string; areaId: string }[] {
  const escopos = new Map<string, { tipoDepartamentoId: string; areaId: string }>();
  for (const v of usuario.vinculos) {
    if (v.perfil === "lider_area" && v.tipoDepartamentoId && v.areaId) {
      escopos.set(`${v.tipoDepartamentoId}__${v.areaId}`, { tipoDepartamentoId: v.tipoDepartamentoId, areaId: v.areaId });
    }
    if (v.perfil === "pastor_area" && v.areaId) {
      for (const dep of departamentos) {
        escopos.set(`${dep.id}__${v.areaId}`, { tipoDepartamentoId: dep.id, areaId: v.areaId });
      }
    }
  }
  return [...escopos.values()];
}

/** Tipos de departamento em que o usuário é Líder Geral (aprovação definitiva, campo todo) */
export function departamentosDeRevisaoGeral(usuario: Usuario): string[] {
  return [...new Set(usuario.vinculos.filter((v) => v.perfil === "lider_geral" && v.tipoDepartamentoId).map((v) => v.tipoDepartamentoId!))];
}

export function ehSecretarioOuPresidente(usuario: Usuario): boolean {
  return usuario.vinculos.some((v) => v.perfil === "secretario_geral" || v.perfil === "presidente");
}

/** Maior nível de autoridade do usuário, considerando todos os vínculos (não amarrado a um relatório específico) —
 *  usado para decidir quem enxerga telas de visão ampla, como o Consolidado (nível ≥ 2). */
export function maiorNivelGeral(usuario: Usuario): number {
  return usuario.vinculos.reduce((max, v) => Math.max(max, NIVEL_PERFIL[v.perfil]), 0);
}

/** Áreas em que o usuário tem alguma autoridade de nível 2 (líder de área/pastor de área) */
export function areasComAutoridade(usuario: Usuario): string[] {
  return [...new Set(usuario.vinculos.filter((v) => (v.perfil === "lider_area" || v.perfil === "pastor_area") && v.areaId).map((v) => v.areaId!))];
}

/**
 * Maior nível de autoridade que o usuário tem sobre um relatório específico
 * (departamento × congregação). 0 = nenhuma autoridade.
 *   1 = Líder Local do depto / Dirigente da congregação
 *   2 = Líder de Área do depto / Pastor de Área
 *   3 = Líder Geral do depto (campo todo)
 *   4 = Secretário Geral / Presidente (tudo)
 * Um nível mais alto SEMPRE pode agir mesmo que ninguém no nível abaixo tenha feito nada —
 * é assim que Presidente/Secretário/Líder Geral conseguem lançar ou aprovar um relatório
 * "pulando" os intermediários.
 */
export function nivelSobreRelatorio(usuario: Usuario, tipoDepartamentoId: string, congregacaoId: string, congregacoes: Congregacao[]): number {
  if (ehSecretarioOuPresidente(usuario)) return 4;

  const congregacao = congregacoes.find((c) => c.id === congregacaoId);
  let melhor = 0;

  for (const v of usuario.vinculos) {
    if (v.perfil === "lider_geral" && v.tipoDepartamentoId === tipoDepartamentoId) {
      melhor = Math.max(melhor, 3);
    }
    if (v.perfil === "pastor_area" && v.areaId && congregacao?.areaId === v.areaId) {
      melhor = Math.max(melhor, 2);
    }
    if (v.perfil === "lider_area" && v.tipoDepartamentoId === tipoDepartamentoId && v.areaId && congregacao?.areaId === v.areaId) {
      melhor = Math.max(melhor, 2);
    }
    if (v.perfil === "dirigente_congregacao" && v.congregacaoId === congregacaoId) {
      melhor = Math.max(melhor, 1);
    }
    if (v.perfil === "lider_local" && v.tipoDepartamentoId === tipoDepartamentoId && v.congregacaoId === congregacaoId) {
      melhor = Math.max(melhor, 1);
    }
  }
  return melhor;
}

export function nivelSobreRelatorioObj(usuario: Usuario, relatorio: Pick<RelatorioMensal, "tipoDepartamentoId" | "congregacaoId">, congregacoes: Congregacao[]): number {
  return nivelSobreRelatorio(usuario, relatorio.tipoDepartamentoId, relatorio.congregacaoId, congregacoes);
}

export interface AcoesRelatorio {
  podeVer: boolean;
  podeEditarValores: boolean;
  podeComentar: boolean;
  podeEnviar: boolean;
  podeAprovarArea: boolean;
  podeAprovarGeral: boolean;
  podeRetificar: boolean;
}

/**
 * Define o que cada nível de autoridade pode fazer sobre um relatório, dado o status atual.
 * Confirmado: níveis mais altos (Líder Geral, Secretário Geral, Presidente) não dependem
 * dos níveis abaixo terem agido primeiro — por isso "podeAprovarGeral"/"podeEnviar"/
 * "podeAprovarArea" ficam disponíveis para eles mesmo a partir de um relatório ainda em
 * rascunho, pulando etapas intermediárias.
 */
export function acoesParaNivel(nivel: number, status: StatusRelatorio): AcoesRelatorio {
  const fechado = status === "aprovado_geral";
  return {
    podeVer: nivel >= 1,
    podeEditarValores: (nivel === 1 && (status === "rascunho" || status === "enviado")) || (nivel === 3 && !fechado) || nivel === 4,
    podeComentar: nivel === 2,
    podeEnviar: (nivel === 1 || nivel === 4) && status === "rascunho",
    podeAprovarArea: (nivel === 2 || nivel === 4) && !fechado && status !== "aprovado_area",
    podeAprovarGeral: nivel >= 3 && !fechado,
    podeRetificar: nivel === 4 && fechado,
  };
}
