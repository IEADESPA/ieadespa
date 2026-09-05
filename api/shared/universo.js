// shared/universo.js
// Universo de "quem deveria estar presente" por órgão — mesma regra usada por
// RegistrarPresenca, EncerrarReuniao, ListarFrequencia e AbrirReuniao (pra
// detectar conflito de horário entre órgãos com gente em comum):
// - ASSEMBLEIA_GERAL: quem tem capacidade ativa (Art. 23 §1º) — calculado.
// - CLI: composição mista do Art. 15 — por Ordenação (CargoMinisterial =
//   PRESBITERO/EVANGELISTA/PASTOR, ATIVO) UNIÃO com Assentos por Função ativos
//   (Diretoria, Conselho Fiscal, CEI, Dirigente de Congregação, Líder Geral).
// - Demais órgãos: quem ocupa Assento ativo NAQUELE órgão especificamente
//   (Diretoria, Conselho Fiscal, CEI...) — assim que a Secretaria cadastrar a
//   composição real (aba Órgãos → Cadeiras), o universo passa a refletir isso
//   de verdade, em vez de "todo mundo ATIVO". Enquanto nenhuma cadeira estiver
//   cadastrada pra esse órgão, cai no padrão de sempre (todo mundo ATIVO —
//   ex: uma reunião aberta a todos os obreiros, sem composição fechada).
//
// v1.6 — Suspensão automática de direitos (Art. 11/23): Sem Comunhão ou sob
// processo disciplinar ativo tira a pessoa do universo de QUALQUER órgão, não
// só da Assembleia Geral. Não fecha Assento/Liderança (isso é shared/vacancia.js,
// reservado pra saída definitiva) — é só um filtro de leitura: assim que a
// Situação voltar a Em Comunhão, a pessoa reaparece sozinha, sem precisar
// recriar nada.
const { sql } = require("./db");
const estatuto = require("./estatuto");
const disciplina = require("./disciplina");

function emComunhaoAtiva(membro, idsSobDisciplina) {
  return membro.situacaoMembro !== "SEM_COMUNHAO" && !idsSobDisciplina.has(membro.membroId);
}

// Reg. Art. 142, III — vedado à Assembleia quem já tem Carta de Mudança
// EMITIDA (trânsito eclesiástico em curso), mesmo ainda não recebido em outra
// igreja. Reaproveitada por GestaoElegiveisAssembleia (que monta a própria
// query, não passa por universoDoOrgao) pra não divergir da lista real.
async function membrosComCartaMudancaEmitida(pool) {
  const result = await pool.request().query(
    `SELECT DISTINCT MembroId AS membroId FROM CartasTransito WHERE Tipo = 'MUDANCA' AND Status = 'EMITIDA'`
  );
  return new Set(result.recordset.map(r => r.membroId));
}

async function universoDoOrgao(pool, orgao) {
  const idsSobDisciplina = await disciplina.membrosSobDisciplina(pool);

  if (!orgao) {
    const result = await pool.request().query(
      `SELECT MembroId AS membroId, Nome AS nome, SituacaoMembro AS situacaoMembro FROM MembroReferencia WHERE Status = 'ATIVO'`
    );
    return result.recordset.filter(m => emComunhaoAtiva(m, idsSobDisciplina));
  }

  if (orgao.sigla === "ASSEMBLEIA_GERAL") {
    const result = await pool.request().query(`
      SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao,
             m.Status AS status, m.SituacaoMembro AS situacaoMembro,
             CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento,
             CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
             m.DizimistaFiel AS dizimistaFiel
      FROM MembroReferencia m
      LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    `);
    // Sempre real, nunca mascarado — mesma razão de GestaoElegiveisAssembleia: este é
    // o universo de quem realmente pode votar, não uma tela de exibição.
    const idsCartaMudanca = await membrosComCartaMudancaEmitida(pool);
    const comFlag = result.recordset.map(m => Object.assign({}, m, { processoDisciplinarAtivo: idsSobDisciplina.has(m.membroId) }));
    return comFlag.filter(m => !idsCartaMudanca.has(m.membroId) && estatuto.calcularCapacidadeEleitoral(m).capacidadeAtiva);
  }

  if (orgao.sigla === "CLI") {
    const porOrdenacao = await pool.request().query(`
      SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao, m.SituacaoMembro AS situacaoMembro
      FROM MembroReferencia m
      LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      WHERE m.Status = 'ATIVO' AND m.CargoMinisterial IN ('PRESBITERO', 'EVANGELISTA', 'PASTOR')
    `);
    const idsPorOrdenacao = new Set(porOrdenacao.recordset.map(m => m.membroId));
    // Cadeira com mandato vencido (DataTerminoPrevisao no passado) para de contar
    // pro universo assim que vence, mesmo sem alguém ter formalmente encerrado a
    // cadeira (ver GestaoAssentos — "vencimento calculado na leitura").
    //
    // Composição por Função (Art. 15) entra na CLI de duas formas: (a) cadeira
    // aberta DIRETO na CLI (Dirigente de Congregação, Líder Geral — não têm
    // órgão próprio) ou (b) cadeira em Diretoria/Conselho Fiscal/CEI — quem já
    // é Presidente/Tesoureiro/Conselheiro/etc. naqueles órgãos entra na CLI
    // automaticamente por causa do cargo, sem precisar cadastrar a MESMA pessoa
    // de novo aqui. Cadastra uma vez, na Diretoria (por exemplo), e ela já conta
    // nas reuniões da Diretoria E na composição da CLI.
    const porFuncao = await pool.request().input("orgaoId", sql.Int, orgao.orgaoId).query(`
      SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao, m.SituacaoMembro AS situacaoMembro
      FROM Assentos a
      JOIN MembroReferencia m ON m.MembroId = a.MembroId
      LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      WHERE a.DataFim IS NULL
        AND (a.DataTerminoPrevisao IS NULL OR a.DataTerminoPrevisao >= CAST(SYSUTCDATETIME() AS DATE))
        AND (
          a.OrgaoId = @orgaoId
          OR a.OrgaoId IN (SELECT OrgaoId FROM Orgaos WHERE Sigla IN ('DIRETORIA_EXECUTIVA', 'CONSELHO_FISCAL', 'CEI'))
        )
    `);
    const universo = porOrdenacao.recordset.concat(porFuncao.recordset.filter(m => !idsPorOrdenacao.has(m.membroId)));
    return universo.filter(m => emComunhaoAtiva(m, idsSobDisciplina));
  }

  const porAssento = await pool.request().input("orgaoId", sql.Int, orgao.orgaoId).query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao, m.SituacaoMembro AS situacaoMembro
    FROM Assentos a
    JOIN MembroReferencia m ON m.MembroId = a.MembroId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE a.OrgaoId = @orgaoId AND a.DataFim IS NULL
      AND (a.DataTerminoPrevisao IS NULL OR a.DataTerminoPrevisao >= CAST(SYSUTCDATETIME() AS DATE))
  `);
  const universoAssento = porAssento.recordset.filter(m => emComunhaoAtiva(m, idsSobDisciplina));
  if (universoAssento.length > 0) return universoAssento;

  const result = await pool.request().query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao, m.SituacaoMembro AS situacaoMembro
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE m.Status = 'ATIVO'
  `);
  return result.recordset.filter(m => emComunhaoAtiva(m, idsSobDisciplina));
}

module.exports = { universoDoOrgao, membrosComCartaMudancaEmitida };
