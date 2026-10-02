// GestaoElegiveisAssembleia
// Lista de elegíveis da Assembleia Geral (capacidade eleitoral ativa, Art. 23
// §1º) — CALCULADA a partir de MembroReferencia (idade, admissão, dízimo),
// nunca uma marcação manual (não existe coluna "ElegivelAssembleia" no
// schema — ver api/shared/estatuto.js e a regra do Art. 7º §1º no README).
// v2.2 — a importação por Excel foi removida daqui: duplicava exatamente o
// mesmo upsert de matrícula+nome que "Importar Pessoas" (api/ImportarPessoas,
// aba Pessoas) já faz, com dois lugares divergentes pra cadastrar a mesma
// gente. Pra incluir/atualizar pessoas em lote, usa-se só a aba Pessoas —
// a elegibilidade continua recalculada automaticamente a partir de lá.
// GET /api/assembleia/elegiveis -> lista os elegíveis atuais (calculado)
// ESCOPO: a lista traz dado de PESSOA (nascimento, admissão, dizimista) da base inteira. Quem pede só recebe as pessoas do SEU escopo; e quem não é o nível GERAL (papel Global
// com escopo "TODAS") recebe só o necessário para a tela (matrícula, nome, congregação, situação), sem nascimento, admissão, dizimista nem os cálculos derivados deles.
// O quórum da Assembleia não depende desta tela: ele é calculado no servidor sobre o universo inteiro (shared/universo.js).
const auth = require("../shared/auth");
const { ehGeral, filtrarPorEscopo } = require("../shared/escopoRotas");
const { getPool } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const disciplina = require("../shared/disciplina");
const { membrosComCartaMudancaEmitida } = require("../shared/universo");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "assembleia");
  if (!usuario) return;

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, m.Status AS status, c.Nome AS congregacao,
           CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento,
           CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
           m.DizimistaFiel AS dizimistaFiel, m.SituacaoMembro AS situacaoMembro, ex.Nome AS extensao
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
  `);
  const geral = ehGeral(usuario);
  const doEscopo = filtrarPorEscopo(usuario, result.recordset, (m) => m.congregacao, (m) => m.extensao);
  // Sempre real, nunca mascarado por permissão: isso é o cálculo de quem de fato
  // pode votar, não uma tela de exibição — mascarar aqui reabriria o voto de quem
  // está sob disciplina (ver mascaramento equivalente, mas só de exibição, em GestaoPessoas).
  const idsSobDisciplina = await disciplina.membrosSobDisciplina(pool);
  const idsCartaMudanca = await membrosComCartaMudancaEmitida(pool);
  const comFlag = doEscopo.map(m => Object.assign({}, m, { processoDisciplinarAtivo: idsSobDisciplina.has(m.membroId) }));
  const elegiveis = comFlag
    .filter(m => !idsCartaMudanca.has(m.membroId) && estatuto.calcularCapacidadeEleitoral(m).capacidadeAtiva)
    .map(m => {
      const capacidade = estatuto.calcularCapacidadeEleitoral(m);
      if (geral) {
        const { extensao, ...completo } = m;
        return Object.assign({}, completo, { capacidade });
      }
      // Sem nascimento, admissão e dizimista — e sem o que se deduz deles (elegibilidade a cargo, dias de integração).
      return {
        membroId: m.membroId, nome: m.nome, status: m.status, congregacao: m.congregacao, situacaoMembro: m.situacaoMembro,
        capacidade: { emComunhao: capacidade.emComunhao, categoria: capacidade.categoria, capacidadeAtiva: capacidade.capacidadeAtiva }
      };
    });
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: elegiveis };
};
