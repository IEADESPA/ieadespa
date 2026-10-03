// shared/ebdLgpd.js (Trava 6-B — LGPD da EBD)
//
// A EBD guarda dado pessoal de quem NÃO tem cadastro de membro: o aluno
// não-membro (v6.8 — nome, contato, nascimento, responsável) e o visitante
// da chamada (v6.2 — nome e contato). Essas pessoas não conseguem abrir uma
// solicitação de titular pelo portal (o fluxo da LGPD é por MembroId), e
// nada apagava esse dado com o tempo. Duas peças:
//
// 1) Anonimização a pedido, pelo Encarregado (permissão "protecaodedados"):
//    busca por nome entre alunos não-membros e visitantes e anonimiza o
//    escolhido. A linha NÃO é apagada — a contagem da chamada, da caderneta
//    e do fechamento trimestral continua batendo —, só deixa de identificar
//    alguém: o nome vira um marcador ("Aluno anonimizado #id" / "Visitante
//    (anonimizado)") e contato, nascimento e responsável viram NULL.
// 2) Retenção automática (rotina diária da EBD, api/EbdFechamentoAutomatico):
//    visitante com mais de 12 meses e aluno não-membro com matrícula encerrada
//    há mais de 24 meses são anonimizados do mesmo jeito. Os prazos estão
//    em PoliticasRetencao (migração 112) e aqui, como constantes — o catálogo
//    é informativo, como o resto de PoliticasRetencao.
//
// A auditoria guarda só ids e contagens — nunca o nome que foi apagado (a
// trilha é encadeada por hash e não pode ser corrigida depois).
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");

const RETENCAO_EBD = { visitanteMeses: 12, alunoNaoMembroEncerradoMeses: 24 };
const NOME_VISITANTE_ANONIMIZADO = "Visitante (anonimizado)";
const PREFIXO_ALUNO_ANONIMIZADO = "Aluno anonimizado #";

function nomeAnonimizadoAluno(alunoId) {
  return `${PREFIXO_ALUNO_ANONIMIZADO}${alunoId}`;
}

function termoBuscaValido(termo) {
  const t = String(termo || "").trim();
  return t.length >= 3 && t.length <= 100;
}

// LIKE com o termo digitado: escapa os curingas do próprio SQL Server.
function escaparLike(termo) {
  return String(termo).trim().replace(/[\\%_[]/g, c => `\\${c}`);
}

async function buscarTitularesEbd(pool, termo) {
  if (!termoBuscaValido(termo)) return { sucesso: false, mensagem: "Digite pelo menos 3 letras do nome." };
  const padrao = `%${escaparLike(termo)}%`;
  const alunos = await pool.request().input("p", sql.NVarChar(120), padrao).query(`
    SELECT TOP 50 a.AlunoId, a.NomeNaoMembro, a.Ativo, a.MatriculadoEm, a.EncerradoEm, t.Nome AS TurmaNome, c.Nome AS CongregacaoNome
    FROM EbdAlunos a JOIN EbdTurmas t ON t.TurmaId = a.TurmaId JOIN Congregacoes c ON c.CongregacaoId = t.CongregacaoId
    WHERE a.MembroId IS NULL AND a.NomeNaoMembro LIKE @p ESCAPE '\\'
    ORDER BY a.NomeNaoMembro
  `);
  const visitantes = await pool.request().input("p", sql.NVarChar(120), padrao).query(`
    SELECT TOP 50 ch.ChamadaId, ch.VisitanteNome, ch.VisitanteContato, l.Data, t.Nome AS TurmaNome, c.Nome AS CongregacaoNome
    FROM EbdChamadas ch JOIN EbdLicoes l ON l.LicaoId = ch.LicaoId JOIN EbdTurmas t ON t.TurmaId = ch.TurmaId JOIN Congregacoes c ON c.CongregacaoId = t.CongregacaoId
    WHERE ch.Status = 'VISITANTE' AND ch.VisitanteNome LIKE @p ESCAPE '\\'
    ORDER BY l.Data DESC
  `);
  return {
    sucesso: true,
    alunos: alunos.recordset.map(r => ({
      alunoId: r.AlunoId, nome: r.NomeNaoMembro, ativo: !!r.Ativo, matriculadoEm: r.MatriculadoEm, encerradoEm: r.EncerradoEm,
      turmaNome: r.TurmaNome, congregacaoNome: r.CongregacaoNome
    })),
    visitantes: visitantes.recordset.map(r => ({
      chamadaId: r.ChamadaId, nome: r.VisitanteNome, temContato: !!r.VisitanteContato, data: r.Data,
      turmaNome: r.TurmaNome, congregacaoNome: r.CongregacaoNome
    }))
  };
}

async function anonimizarAlunoNaoMembro(pool, { alunoId, membroId }) {
  const r = await pool.request().input("id", sql.Int, alunoId).query(`SELECT AlunoId, MembroId, NomeNaoMembro FROM EbdAlunos WHERE AlunoId = @id`);
  const aluno = r.recordset[0];
  if (!aluno) return { sucesso: false, mensagem: "Aluno não encontrado." };
  if (aluno.MembroId != null) {
    return { sucesso: false, mensagem: "Este aluno é membro — o nome mora no cadastro de membro; use a solicitação de exclusão do titular (Proteção de Dados)." };
  }
  if (aluno.NomeNaoMembro === nomeAnonimizadoAluno(alunoId)) return { sucesso: false, mensagem: "Este aluno já foi anonimizado." };
  await pool.request().input("id", sql.Int, alunoId).input("nome", sql.NVarChar(150), nomeAnonimizadoAluno(alunoId)).query(`
    UPDATE EbdAlunos
    SET NomeNaoMembro = @nome, ContatoNaoMembro = NULL, DataNascimento = NULL, ResponsavelNome = NULL,
        Ativo = 0, EncerradoEm = COALESCE(EncerradoEm, SYSUTCDATETIME()), AtualizadoEm = SYSUTCDATETIME()
    WHERE AlunoId = @id
  `);
  await registrarAuditoria({
    tabela: "EbdAlunos", registroId: alunoId, acao: "LGPD_ALUNO_NAO_MEMBRO_ANONIMIZADO", usuarioId: membroId,
    dadosAntes: null, dadosDepois: { alunoId, anonimizado: true, ativo: false }
  });
  return { sucesso: true, mensagem: "✅ Aluno anonimizado — nome, contato, nascimento e responsável apagados; o histórico de chamada continua contando." };
}

async function anonimizarVisitante(pool, { chamadaId, membroId }) {
  const r = await pool.request().input("id", sql.Int, chamadaId).query(`SELECT ChamadaId, Status, VisitanteNome FROM EbdChamadas WHERE ChamadaId = @id`);
  const linha = r.recordset[0];
  if (!linha || linha.Status !== "VISITANTE") return { sucesso: false, mensagem: "Registro de visitante não encontrado." };
  if (linha.VisitanteNome === NOME_VISITANTE_ANONIMIZADO) return { sucesso: false, mensagem: "Este visitante já foi anonimizado." };
  await pool.request().input("id", sql.Int, chamadaId).input("nome", sql.NVarChar(150), NOME_VISITANTE_ANONIMIZADO).query(`
    UPDATE EbdChamadas SET VisitanteNome = @nome, VisitanteContato = NULL, AtualizadoEm = SYSUTCDATETIME() WHERE ChamadaId = @id
  `);
  await registrarAuditoria({
    tabela: "EbdChamadas", registroId: chamadaId, acao: "LGPD_VISITANTE_ANONIMIZADO", usuarioId: membroId,
    dadosAntes: null, dadosDepois: { chamadaId, anonimizado: true }
  });
  return { sucesso: true, mensagem: "✅ Visitante anonimizado — a visita continua contando na chamada, sem identificar a pessoa." };
}

// Retenção (rodada diária). Idempotente: o que já foi anonimizado não é
// tocado de novo. Devolve as contagens para o log da rotina.
async function aplicarRetencaoEbd(pool) {
  const visitantes = await pool.request()
    .input("meses", sql.Int, RETENCAO_EBD.visitanteMeses).input("nome", sql.NVarChar(150), NOME_VISITANTE_ANONIMIZADO)
    .query(`
      UPDATE ch SET VisitanteNome = @nome, VisitanteContato = NULL, AtualizadoEm = SYSUTCDATETIME()
      FROM EbdChamadas ch JOIN EbdLicoes l ON l.LicaoId = ch.LicaoId
      WHERE ch.Status = 'VISITANTE' AND ch.VisitanteNome <> @nome
        AND l.Data < DATEADD(MONTH, -@meses, CAST(SYSUTCDATETIME() AS DATE));
      SELECT @@ROWCOUNT AS total;
    `);
  const alunos = await pool.request()
    .input("meses", sql.Int, RETENCAO_EBD.alunoNaoMembroEncerradoMeses).input("prefixo", sql.NVarChar(40), PREFIXO_ALUNO_ANONIMIZADO)
    .query(`
      UPDATE EbdAlunos
      SET NomeNaoMembro = @prefixo + CAST(AlunoId AS NVARCHAR(20)), ContatoNaoMembro = NULL, DataNascimento = NULL, ResponsavelNome = NULL, AtualizadoEm = SYSUTCDATETIME()
      WHERE MembroId IS NULL AND Ativo = 0 AND EncerradoEm < DATEADD(MONTH, -@meses, SYSUTCDATETIME())
        AND NomeNaoMembro NOT LIKE @prefixo + '%';
      SELECT @@ROWCOUNT AS total;
    `);
  const resumo = {
    visitantesAnonimizados: visitantes.recordset[0] ? visitantes.recordset[0].total : 0,
    alunosAnonimizados: alunos.recordset[0] ? alunos.recordset[0].total : 0
  };
  if (resumo.visitantesAnonimizados || resumo.alunosAnonimizados) {
    await registrarAuditoria({
      tabela: "EbdChamadas", registroId: 0, acao: "LGPD_RETENCAO_EBD_APLICADA", usuarioId: null,
      dadosAntes: null, dadosDepois: { ...resumo, regra: RETENCAO_EBD }
    });
  }
  return resumo;
}

module.exports = {
  RETENCAO_EBD, NOME_VISITANTE_ANONIMIZADO, PREFIXO_ALUNO_ANONIMIZADO,
  nomeAnonimizadoAluno, termoBuscaValido, escaparLike,
  buscarTitularesEbd, anonimizarAlunoNaoMembro, anonimizarVisitante, aplicarRetencaoEbd
};
