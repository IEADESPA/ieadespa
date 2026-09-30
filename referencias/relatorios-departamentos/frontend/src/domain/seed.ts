import type { Area, Congregacao, RelatorioMensal, Usuario } from "./types";

export const MES_ATUAL = { mes: 3, ano: 2026 };
export const MES_ANTERIOR = { mes: 2, ano: 2026 };

const SENHA_DEMO = "demo123";

export const AREAS: Area[] = [
  { id: "area-sede", nome: "Sede" },
  { id: "area-levi", nome: "Levi" },
  { id: "area-juda", nome: "Judá" },
];

export const CONGREGACOES: Congregacao[] = [
  { id: "cong-sede", nome: "Sede", areaId: "area-sede" },
  { id: "cong-rocha-de-horebe", nome: "Rocha de Horebe", areaId: "area-levi" },
  { id: "cong-jardim-de-deus", nome: "Jardim de Deus", areaId: "area-juda" },
];

export const USUARIOS: Usuario[] = [
  {
    id: "u-1001",
    nome: "Ana Beatriz",
    matricula: "1001",
    senha: SENHA_DEMO,
    vinculos: [
      { perfil: "lider_local", tipoDepartamentoId: "ucadespa", congregacaoId: "cong-sede" },
      { perfil: "lider_local", tipoDepartamentoId: "uhadespa", congregacaoId: "cong-sede" },
      { perfil: "lider_local", tipoDepartamentoId: "familia", congregacaoId: "cong-sede" },
    ],
  },
  {
    id: "u-1002",
    nome: "Carlos Eduardo",
    matricula: "1002",
    senha: SENHA_DEMO,
    vinculos: [{ perfil: "lider_local", tipoDepartamentoId: "ebd", congregacaoId: "cong-sede" }],
  },
  {
    id: "u-1003",
    nome: "Josiel Martins",
    matricula: "1003",
    senha: SENHA_DEMO,
    vinculos: [{ perfil: "lider_local", tipoDepartamentoId: "ucadespa", congregacaoId: "cong-rocha-de-horebe" }],
  },
  {
    id: "u-2001",
    nome: "Pr. Marcos Vinícius",
    matricula: "2001",
    senha: SENHA_DEMO,
    vinculos: [{ perfil: "dirigente_congregacao", congregacaoId: "cong-sede" }],
  },
  {
    id: "u-3001",
    nome: "Raimundo Alves",
    matricula: "3001",
    senha: SENHA_DEMO,
    vinculos: [
      { perfil: "lider_area", tipoDepartamentoId: "ucadespa", areaId: "area-sede" },
      { perfil: "lider_area", tipoDepartamentoId: "ucadespa", areaId: "area-levi" },
      { perfil: "lider_area", tipoDepartamentoId: "uhadespa", areaId: "area-sede" },
      { perfil: "lider_area", tipoDepartamentoId: "familia", areaId: "area-sede" },
      { perfil: "lider_area", tipoDepartamentoId: "ebd", areaId: "area-sede" },
    ],
  },
  {
    id: "u-3002",
    nome: "Miss. Cristiane Fernandes",
    matricula: "3002",
    senha: SENHA_DEMO,
    vinculos: [{ perfil: "pastor_area", areaId: "area-sede" }],
  },
  {
    id: "u-4001",
    nome: "Ev. Marcel Ferreira",
    matricula: "4001",
    senha: SENHA_DEMO,
    vinculos: [{ perfil: "lider_geral", tipoDepartamentoId: "ucadespa" }],
  },
  {
    id: "u-4002",
    nome: "Deigo Tavares",
    matricula: "4002",
    senha: SENHA_DEMO,
    vinculos: [
      { perfil: "lider_geral", tipoDepartamentoId: "ebd" },
      { perfil: "lider_geral", tipoDepartamentoId: "uhadespa" },
      { perfil: "lider_geral", tipoDepartamentoId: "familia" },
    ],
  },
  {
    id: "u-9001",
    nome: "Marinete Silva Costa",
    matricula: "9001",
    senha: SENHA_DEMO,
    vinculos: [{ perfil: "secretario_geral" }],
  },
  {
    id: "u-9999",
    nome: "Pr. Mariano Fernandes Moreira",
    matricula: "9999",
    senha: SENHA_DEMO,
    vinculos: [{ perfil: "presidente" }],
  },
];

function historico(ts: number, usuarioNome: string, papel: RelatorioMensal["historico"][number]["papel"], acao: string, detalhe?: string) {
  return { ts, usuarioNome, papel, acao, detalhe };
}

export const RELATORIOS_SEED: RelatorioMensal[] = [
  // histórico do mês anterior, aprovado em definitivo — alimenta o pré-preenchimento "estado"
  {
    id: "rel-ucadespa-sede-fev",
    tipoDepartamentoId: "ucadespa",
    congregacaoId: "cong-sede",
    mesReferencia: MES_ANTERIOR.mes,
    anoReferencia: MES_ANTERIOR.ano,
    status: "aprovado_geral",
    atrasado: false,
    listas: { contribuintes_mensalidade: [{ id: "seed-1", nome: "Contribuintes diversos", valor: 40 }] },
    semanas: [],
    valores: {
      congregados: 58, visitantes: 6, casas_visitadas: 9, criancas_evangelizadas: 14,
      oracoes_normais: 8, extras: 1, eventos_local: 4, eventos_area: 0, eventos_geral: 0,
      integracao_conversao: 2, integracao_reconciliacao: 0, integracao_outra_igreja: 1,
      fin_mensalidades: 40, fin_ofertas: 62, fin_campanhas: 0, fin_outros: 0,
    },
    historico: [historico(new Date(2026, 1, 5).getTime(), "Ana Beatriz", "lider_local", "Enviou o relatório")],
    dataEnvio: new Date(2026, 1, 5).getTime(),
  },
  {
    id: "rel-uhadespa-sede-fev",
    tipoDepartamentoId: "uhadespa",
    congregacaoId: "cong-sede",
    mesReferencia: MES_ANTERIOR.mes,
    anoReferencia: MES_ANTERIOR.ano,
    status: "aprovado_geral",
    atrasado: false,
    listas: {},
    semanas: [],
    valores: {
      membros_comunhao: 12, membros_sem_comunhao: 2, congregados: 3, matriculados: 12, nao_matriculado: 2,
      casas_visitadas: 4, tarde_de_louvor: 0, oracoes_normais: 12, extras: 0,
      eventos_local: 0, eventos_area: 1, eventos_geral: 0,
      integracao_conversao: 0, integracao_reconciliacao: 2, integracao_outra_igreja: 0,
      fin_mensalidades: 0, fin_ofertas: 0, fin_campanhas: 1, fin_outros: 0,
    },
    historico: [historico(new Date(2026, 1, 8).getTime(), "Ana Beatriz", "lider_local", "Enviou o relatório")],
    dataEnvio: new Date(2026, 1, 8).getTime(),
  },
  {
    id: "rel-familia-sede-fev",
    tipoDepartamentoId: "familia",
    congregacaoId: "cong-sede",
    mesReferencia: MES_ANTERIOR.mes,
    anoReferencia: MES_ANTERIOR.ano,
    status: "aprovado_geral",
    atrasado: false,
    listas: {},
    semanas: [],
    valores: {
      familias_crentes: 21, familias_membros_nao_crentes: 5, familias_unico_membro: 3,
      menores_pais_nao_crentes: 2, casais_conjuge_nao_crente: 1, casas_visitadas: 6,
      familias_que_mudaram: 0, familias_assistidas: 2, familias_integradas: 1,
      eventos_local: 1, eventos_area: 0, eventos_geral: 0,
      integracao_conversao: 0, integracao_reconciliacao: 0, integracao_outra_igreja: 0,
      fin_mensalidades: 0, fin_ofertas: 18, fin_campanhas: 0, fin_outros: 0,
    },
    historico: [historico(new Date(2026, 1, 6).getTime(), "Ana Beatriz", "lider_local", "Enviou o relatório")],
    dataEnvio: new Date(2026, 1, 6).getTime(),
  },

  // pendente de aprovação da área — para o Líder de Área (3001) revisar
  {
    id: "rel-ucadespa-rocha-mar",
    tipoDepartamentoId: "ucadespa",
    congregacaoId: "cong-rocha-de-horebe",
    mesReferencia: MES_ATUAL.mes,
    anoReferencia: MES_ATUAL.ano,
    status: "enviado",
    atrasado: false,
    listas: { contribuintes_mensalidade: [{ id: "seed-2", nome: "Contribuintes diversos", valor: 15 }] },
    semanas: [],
    valores: {
      congregados: 34, visitantes: 3, casas_visitadas: 5, criancas_evangelizadas: 9,
      oracoes_normais: 4, extras: 0, eventos_local: 2, eventos_area: 0, eventos_geral: 0,
      integracao_conversao: 1, integracao_reconciliacao: 0, integracao_outra_igreja: 0,
      fin_mensalidades: 15, fin_ofertas: 28, fin_campanhas: 0, fin_outros: 0,
    },
    historico: [historico(new Date(2026, 2, 4).getTime(), "Josiel Martins", "lider_local", "Enviou o relatório")],
    dataEnvio: new Date(2026, 2, 4).getTime(),
  },

  // já aprovado pela área, pendente de aprovação definitiva do Líder Geral (4002)
  {
    id: "rel-ebd-sede-mar",
    tipoDepartamentoId: "ebd",
    congregacaoId: "cong-sede",
    mesReferencia: MES_ATUAL.mes,
    anoReferencia: MES_ATUAL.ano,
    status: "aprovado_area",
    atrasado: false,
    listas: {},
    // detalhe semanal (1º ao 5º domingo) — os campos correspondentes no bloco principal
    // são somados automaticamente a partir daqui (ver domain/calculos.ts)
    semanas: [
      { ebds_realizadas: 1, alunos_visitados: 2, acao_social: 0, acao_pro_ebd: 1, acao_pro_igreja: 0, alunos_presentes: 10, alunos_ausentes: 2, visitantes: 1, fin_ofertas: 30 },
      { ebds_realizadas: 1, alunos_visitados: 1, acao_social: 0, acao_pro_ebd: 0, acao_pro_igreja: 0, alunos_presentes: 9, alunos_ausentes: 2, visitantes: 1, fin_ofertas: 25 },
      { ebds_realizadas: 1, alunos_visitados: 1, acao_social: 0, acao_pro_ebd: 0, acao_pro_igreja: 0, alunos_presentes: 10, alunos_ausentes: 2, visitantes: 1, fin_ofertas: 28.5 },
      { ebds_realizadas: 1, alunos_visitados: 1, acao_social: 0, acao_pro_ebd: 0, acao_pro_igreja: 0, alunos_presentes: 10, alunos_ausentes: 1, visitantes: 1, fin_ofertas: 29 },
      { ebds_realizadas: 0, alunos_visitados: 0, acao_social: 0, acao_pro_ebd: 0, acao_pro_igreja: 0, alunos_presentes: 0, alunos_ausentes: 0, visitantes: 0, fin_ofertas: 0 },
    ],
    valores: {
      alunos_matriculados: 46, alunos_presentes: 39, alunos_ausentes: 7, visitantes: 4,
      biblias: 41, revistas: 38, ebds_realizadas: 4, alunos_visitados: 5,
      acao_social: 0, acao_pro_ebd: 1, acao_pro_igreja: 0,
      eventos_local: 1, eventos_area: 0, eventos_geral: 0,
      integracao_conversao: 0, integracao_reconciliacao: 1, integracao_outra_igreja: 0,
      fin_ofertas: 112.5,
    },
    comentarioArea: "Confere com o caderno de chamada. Aprovado.",
    historico: [
      historico(new Date(2026, 2, 3).getTime(), "Carlos Eduardo", "lider_local", "Enviou o relatório"),
      historico(new Date(2026, 2, 5).getTime(), "Raimundo Alves", "lider_area", "Aprovou (nível área)", "Confere com o caderno de chamada. Aprovado."),
    ],
    dataEnvio: new Date(2026, 2, 3).getTime(),
  },
];
