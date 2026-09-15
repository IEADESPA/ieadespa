// shared/anexos.js (vB.4 — Anexos genéricos)
// Mapa declarativo: qual(is) permissão(ões) controla(m) anexo de cada
// tabela — mesmo espírito do catálogo de vB.2/vB.3 (dado, não código
// espalhado). Registrar uma tabela nova é 1 linha aqui; sem entrada,
// `AnexosGenericos` recusa (modo seguro: nunca aceita anexo em tabela sem
// controle de acesso definido).
//
// Processos disciplinares ficam de fora de propósito: são sigilosos (Art.
// 45) e já têm fluxo próprio de documento — expor esse anexo num painel
// genérico aumentaria o risco de vazamento sem necessidade real.
const TABELA_PERMISSOES = {
  Projetos: ["reunioes", "cli"],
  DenunciasOuvidoria: ["ouvidoria"],
  ProcedimentosAbandono: ["disciplina"],
  Fornecedores: ["financeiro"]
};

function permissoesDaTabela(tabela) {
  return TABELA_PERMISSOES[tabela] || null;
}

module.exports = { TABELA_PERMISSOES, permissoesDaTabela };
