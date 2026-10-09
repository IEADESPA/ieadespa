// shared/anexos.js (vB.4 — Anexos genéricos)
// Mapa declarativo: qual(is) permissão(ões) controla(m) anexo de cada
// tabela — mesmo espírito do catálogo de vB.2/vB.3 (dado, não código
// espalhado). Registrar uma tabela nova é 1 entrada aqui; sem entrada,
// `AnexosGenericos` recusa (modo seguro: nunca aceita anexo em tabela sem
// controle de acesso definido).
//
// Processos disciplinares ficam de fora de propósito: são sigilosos (Art.
// 45) e já têm fluxo próprio de documento — expor esse anexo num painel
// genérico aumentaria o risco de vazamento sem necessidade real.
//
// ESCOPO (02/10/2026): o anexo herda a regra de acesso do registro-pai, não só a permissão da tabela. Antes, qualquer papel local com a permissão (Dirigente com `reunioes`,
// Membro da JAI com `disciplina`, Tesoureiro Local com `financeiro`) listava, enviava e apagava anexo de QUALQUER registro de qualquer unidade — e o anexo de denúncia da
// Ouvidoria escapava da regra que esconde da Diretoria as denúncias contra a própria Diretoria (shared/ouvidoria.js::redigirDenuncias).
//  - Projetos (institucional): ler = permissão da tabela; escrever (enviar/apagar) = só o GERAL.
//  - Fornecedores (dados bancários, institucional): ler e escrever = só o GERAL.
//  - ProcedimentosAbandono (PESSOA): a pessoa do procedimento precisa estar no escopo de quem pede.
//  - DenunciasOuvidoria: a mesma regra de GestaoOuvidoria — quem é da Diretoria não alcança denúncia contra membro da Diretoria.
// Fora do escopo ou registro inexistente: a MESMA resposta (a rota não serve de sonda).
const { sql } = require("./db");
const { pessoaAlcancavel } = require("./escopoRotas");
const { usuarioEhDaDiretoria } = require("./ouvidoria");

async function registroExiste(pool, consulta, registroId) {
  const r = await pool.request().input("id", sql.Int, registroId).query(consulta);
  return r.recordset[0] || null;
}

const REGRAS = {
  Projetos: {
    permissoes: ["reunioes", "cli"],
    escritaSoGeral: true,
    alcance: async (pool, _usuario, registroId) => !!(await registroExiste(pool, `SELECT ProjetoId FROM Projetos WHERE ProjetoId = @id`, registroId))
  },
  // v7.8: o comprovante da comunicação ao Conselho Tutelar. Quem anexa é quem alcança o incidente (o Dirigente da congregação, a Diretoria e o Comitê); o envolvido não alcança.
  // O nome do arquivo não deve citar a criança (a tela avisa).
  IncidentesProtecao: {
    permissoes: ["protecao_menores"],
    alcance: async (pool, visao, registroId) => {
      const auth = require("./auth");
      const { ehGeral: geral } = require("./escopoRotas");
      const ver = { membroId: visao.membroId, geral: geral(visao), podeVerCongregacao: (nome) => auth.estaNoEscopo(visao, nome) };
      return !!(await require("./protecaoDb").incidenteVisivel(pool, registroId, ver));
    }
  },
  DenunciasOuvidoria: {
    permissoes: ["ouvidoria"],
    alcance: async (pool, usuario, registroId) => {
      const denuncia = await registroExiste(pool, `SELECT DenunciaId, DenunciadoMembroId FROM DenunciasOuvidoria WHERE DenunciaId = @id`, registroId);
      if (!denuncia) return false;
      if (!denuncia.DenunciadoMembroId) return true;
      // Art. 104 §8º: denúncia contra alguém da Diretoria não é vista por quem também é da Diretoria (conflito de interesse) — vale para a lista e vale para as provas anexadas.
      const denunciadoDaDiretoria = await pool.request().input("membroId", sql.Int, denuncia.DenunciadoMembroId).query(`
        SELECT TOP 1 a.AssentoId
        FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
        WHERE a.MembroId = @membroId AND a.DataFim IS NULL AND o.Sigla = 'DIRETORIA_EXECUTIVA'`);
      if (denunciadoDaDiretoria.recordset.length === 0) return true;
      return !(await usuarioEhDaDiretoria(pool, sql, usuario.membroId));
    }
  },
  ProcedimentosAbandono: {
    permissoes: ["disciplina"],
    alcance: async (pool, usuario, registroId) => {
      const procedimento = await registroExiste(pool, `SELECT ProcedimentoId, MembroId FROM ProcedimentosAbandono WHERE ProcedimentoId = @id`, registroId);
      return !!procedimento && !!(await pessoaAlcancavel(pool, usuario, procedimento.MembroId));
    }
  },
  Fornecedores: {
    permissoes: ["financeiro"],
    soGeral: true,
    alcance: async (pool, _usuario, registroId) => !!(await registroExiste(pool, `SELECT FornecedorId FROM Fornecedores WHERE FornecedorId = @id`, registroId))
  }
};

// Object.hasOwn: "__proto__", "constructor", "toString"... não são tabelas (antes viravam "permissões" e estouravam erro 500).
function regraDaTabela(tabela) {
  return typeof tabela === "string" && Object.hasOwn(REGRAS, tabela) ? REGRAS[tabela] : null;
}

// Mantida para quem só precisa da lista de permissões da tabela (BuscaGlobal).
function permissoesDaTabela(tabela) {
  const regra = regraDaTabela(tabela);
  return regra ? regra.permissoes : null;
}

const TABELA_PERMISSOES = Object.fromEntries(Object.entries(REGRAS).map(([tabela, regra]) => [tabela, regra.permissoes]));

module.exports = { TABELA_PERMISSOES, REGRAS, regraDaTabela, permissoesDaTabela };
