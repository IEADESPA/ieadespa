/**
 * Catálogo de funcionalidades do sistema. Cada uma vira uma linha na matriz
 * de permissões (Admin > Permissões) e uma coluna liga/desliga por papel,
 * com possibilidade de exceção por aluno específico.
 */
export const FUNCIONALIDADES = [
  { chave: "campos.gerenciar", nome: "Gerenciar campos", categoria: "Hierarquia", ordem: 1 },
  { chave: "areas.gerenciar", nome: "Gerenciar áreas", categoria: "Hierarquia", ordem: 2 },
  { chave: "congregacoes.gerenciar", nome: "Gerenciar congregações", categoria: "Hierarquia", ordem: 3 },
  { chave: "turmas.gerenciar", nome: "Gerenciar turmas", categoria: "Hierarquia", ordem: 4 },
  { chave: "alunos.gerenciar", nome: "Gerenciar alunos", categoria: "Hierarquia", ordem: 5 },
  { chave: "usuarios.gerenciar", nome: "Conceder papéis (usuários)", categoria: "Acesso", ordem: 6 },
  { chave: "permissoes.gerenciar", nome: "Gerenciar matriz de permissões", categoria: "Acesso", ordem: 7 },
  { chave: "chamada.lancar", nome: "Lançar chamada", categoria: "EBD", ordem: 8 },
  { chave: "licoes.gerenciar", nome: "Abrir/fechar lições", categoria: "EBD", ordem: 9 },
  { chave: "relatorios.ver", nome: "Ver relatórios e ranking", categoria: "EBD", ordem: 10 },
  { chave: "atividades.gerenciar", nome: "Criar e editar atividades/quizzes", categoria: "Atividades", ordem: 11 },
  { chave: "atividades.ver_resultados", nome: "Ver resultados das atividades", categoria: "Atividades", ordem: 12 },
  { chave: "revistas.gerenciar", nome: "Gerenciar catálogo de revistas e preços", categoria: "Revistas", ordem: 13 },
  { chave: "pedidos_revista.gerenciar", nome: "Fazer pedidos e registrar pagamentos", categoria: "Revistas", ordem: 14 },
  { chave: "pedidos_revista.consolidar", nome: "Fechar janela, ver consolidado e aprovar pagamentos", categoria: "Revistas", ordem: 15 },
  { chave: "financeiro.gerenciar", nome: "Gerenciar financeiro da congregação", categoria: "Financeiro", ordem: 16 },
  { chave: "conquistas.gerenciar", nome: "Configurar catálogo de conquistas", categoria: "Gamificação", ordem: 17 },
  { chave: "certificados.emitir", nome: "Emitir certificados", categoria: "Certificados", ordem: 18 },
] as const;

export type ChaveFuncionalidade = (typeof FUNCIONALIDADES)[number]["chave"];

export const TODAS_FUNCIONALIDADES = FUNCIONALIDADES.map((f) => f.chave);

/**
 * Matriz padrão aplicada no seed, por chave de papel nativo — reflete o
 * comportamento original do sistema antes da matriz de permissões existir.
 * Papéis criados depois pelo Admin nascem sem nenhuma funcionalidade e são
 * configurados na tela de Permissões.
 */
export const MATRIZ_PADRAO: Record<string, ChaveFuncionalidade[]> = {
  ADMIN: [...TODAS_FUNCIONALIDADES],
  COORDENADOR_CAMPO: [
    "areas.gerenciar",
    "congregacoes.gerenciar",
    "turmas.gerenciar",
    "alunos.gerenciar",
    "usuarios.gerenciar",
    "chamada.lancar",
    "licoes.gerenciar",
    "relatorios.ver",
    "atividades.gerenciar",
    "atividades.ver_resultados",
    "revistas.gerenciar",
    "pedidos_revista.gerenciar",
    "pedidos_revista.consolidar",
    "financeiro.gerenciar",
    "conquistas.gerenciar",
    "certificados.emitir",
  ],
  COORDENADOR_AREA: [
    "congregacoes.gerenciar",
    "turmas.gerenciar",
    "alunos.gerenciar",
    "usuarios.gerenciar",
    "chamada.lancar",
    "licoes.gerenciar",
    "relatorios.ver",
    "atividades.gerenciar",
    "atividades.ver_resultados",
    "pedidos_revista.gerenciar",
    "financeiro.gerenciar",
    "certificados.emitir",
  ],
  SUPERINTENDENTE: [
    "turmas.gerenciar",
    "alunos.gerenciar",
    "usuarios.gerenciar",
    "chamada.lancar",
    "licoes.gerenciar",
    "relatorios.ver",
    "atividades.gerenciar",
    "atividades.ver_resultados",
    "pedidos_revista.gerenciar",
    "financeiro.gerenciar",
    "certificados.emitir",
  ],
  SECRETARIO: [
    "turmas.gerenciar",
    "alunos.gerenciar",
    "chamada.lancar",
    "licoes.gerenciar",
    "relatorios.ver",
    "atividades.ver_resultados",
    "pedidos_revista.gerenciar",
    "certificados.emitir",
  ],
  PROFESSOR: [
    "alunos.gerenciar",
    "chamada.lancar",
    "relatorios.ver",
    "atividades.gerenciar",
    "atividades.ver_resultados",
    "certificados.emitir",
  ],
  TESOUREIRO: ["relatorios.ver", "financeiro.gerenciar"],
};
