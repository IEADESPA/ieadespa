// shared/ebdChamada.js (v6.2 — EBD: Chamada e presença)
//
// Continua a FASE 6 (aberta em shared/ebdTurmas.js, v6.1). Duas peças:
//
// 1) Lição — versão MÍNIMA (congregação + data + aberta/fechada), só o
//    suficiente pra abrir/fechar a janela de lançamento de chamada. A
//    v6.3 ("Lições e atividades", ainda não construída) é quem anexa
//    conteúdo pedagógico de verdade por cima da MESMA `EbdLicoes`
//    (referenciando `LicaoId`) — nenhuma tabela paralela, nenhum retrabalho
//    esperado.
// 2) Chamada — presença/ausência/visitante por Turma, sempre contra a
//    Lição do dia daquela Congregação. Percentuais são sempre DERIVADOS
//    das linhas de EbdChamadas, nunca digitados (mesmo princípio de
//    "calculado, nunca digitado" da v5.5.1/v5.6/v5.7).
//
// Lógica de decisão pura (testável sem banco) primeiro, funções de banco
// (finas) depois — mesmo padrão de shared/ebdTurmas.js / shared/escalas.js.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");

const STATUS_LICAO = { ABERTA: "ABERTA", FECHADA: "FECHADA" };
const STATUS_PRESENCA = { PRESENTE: "PRESENTE", AUSENTE: "AUSENTE", VISITANTE: "VISITANTE" };

// ---------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------

// Item 1 do v6.2: só é possível lançar chamada com a lição ABERTA — uma
// lição FECHADA passa a ser só histórico/consulta.
function podeLancarChamada(licao) {
  if (!licao) return { permitido: false, mensagem: "Nenhuma lição aberta para esta congregação nesta data." };
  if (licao.status !== STATUS_LICAO.ABERTA) {
    return { permitido: false, mensagem: "Esta lição está fechada — não é possível lançar chamada." };
  }
  return { permitido: true };
}

// Uma lição só pode ser fechada se estiver aberta (evita "fechar" duas
// vezes e sobrescrever FechadaPorMembroId/FechadaEm de quem fechou antes).
function podeFecharLicao(licao) {
  if (!licao) return { permitido: false, mensagem: "Lição não encontrada." };
  if (licao.status === STATUS_LICAO.FECHADA) return { permitido: false, mensagem: "Esta lição já está fechada." };
  return { permitido: true };
}

// Reabrir só faz sentido numa lição já fechada.
function podeReabrirLicao(licao) {
  if (!licao) return { permitido: false, mensagem: "Lição não encontrada." };
  if (licao.status === STATUS_LICAO.ABERTA) return { permitido: false, mensagem: "Esta lição já está aberta." };
  return { permitido: true };
}

// Validação de um lançamento individual de presença (item 2). Aluno da
// turma (matrícula existente em EbdAlunos) sempre usa PRESENTE/AUSENTE
// com alunoId; visitante (sem matrícula) sempre usa VISITANTE com nome —
// nunca os dois ao mesmo tempo, mesma regra do CHECK da migração 102.
function validarLancamentoPresenca({ alunoId, status, visitanteNome }) {
  if (!status || !Object.values(STATUS_PRESENCA).includes(status)) {
    return { valido: false, mensagem: "Status inválido — use PRESENTE, AUSENTE ou VISITANTE." };
  }
  if (status === STATUS_PRESENCA.VISITANTE) {
    if (alunoId) return { valido: false, mensagem: "Visitante não deve ter alunoId — cadastre a matrícula em vez de lançar como visitante." };
    if (!visitanteNome || !visitanteNome.trim()) return { valido: false, mensagem: "Informe o nome do visitante." };
    return { valido: true };
  }
  // PRESENTE / AUSENTE
  if (!alunoId) return { valido: false, mensagem: "Informe o alunoId (aluno da turma)." };
  if (visitanteNome) return { valido: false, mensagem: "Presença de aluno não leva nome de visitante." };
  return { valido: true };
}

// "Um registro por Aluno por Lição" (item 2): se já existe um lançamento
// desse aluno nesta lição, a chamada é uma CORREÇÃO (atualiza o status em
// vez de acumular linha duplicada) — mesmo espírito de
// ebdTurmas.js::podeDesignarProfessor (reaproveita o que já existe em vez
// de acumular linhas), só que aqui sempre permitido (corrigir uma marcação
// errada de chamada é rotina, diferente de reativar um vínculo de
// professor). Visitante nunca cai aqui (alunoId é sempre null pra ele —
// cada visita é a sua própria linha, ver migração 102).
function decidirAcaoRegistroPresenca(registroExistente) {
  return registroExistente ? "ATUALIZAR" : "CRIAR";
}

// Item 3 do v6.2: percentuais SEMPRE calculados a partir das linhas de
// chamada — nunca um campo digitado. Base = alunos da turma com
// PRESENTE ou AUSENTE lançado (o "universo" da chamada); visitante é
// contado à parte (não é aluno da turma, não entra no denominador de
// presença/ausência da turma).
function calcularPercentuais({ presentes = 0, ausentes = 0, visitantes = 0 } = {}) {
  const totalAlunos = presentes + ausentes;
  if (totalAlunos === 0) {
    return { totalAlunos: 0, presentes, ausentes, visitantes, percentualPresenca: 0, percentualAusencia: 0 };
  }
  const percentualPresenca = Math.round((presentes / totalAlunos) * 1000) / 10;
  const percentualAusencia = Math.round((ausentes / totalAlunos) * 1000) / 10;
  return { totalAlunos, presentes, ausentes, visitantes, percentualPresenca, percentualAusencia };
}

// Resume uma lista plana de registros de chamada (já vindos do banco ou
// montados em memória/teste) nos totais usados por calcularPercentuais —
// função pura, sem SQL, pra ficar testável em isolamento.
function resumirChamada(registros) {
  let presentes = 0, ausentes = 0, visitantes = 0;
  for (const r of registros || []) {
    if (r.status === STATUS_PRESENCA.PRESENTE) presentes++;
    else if (r.status === STATUS_PRESENCA.AUSENTE) ausentes++;
    else if (r.status === STATUS_PRESENCA.VISITANTE) visitantes++;
  }
  return calcularPercentuais({ presentes, ausentes, visitantes });
}

// ---------------------------------------------------------------
// Funções de banco (finas)
// ---------------------------------------------------------------

function mapearLicao(row) {
  if (!row) return null;
  return {
    licaoId: row.LicaoId, congregacaoId: row.CongregacaoId, data: row.Data, status: row.Status,
    abertaPorMembroId: row.AbertaPorMembroId, abertaEm: row.AbertaEm,
    fechadaPorMembroId: row.FechadaPorMembroId, fechadaEm: row.FechadaEm
  };
}

async function buscarLicaoPorId(pool, licaoId) {
  const result = await pool.request().input("id", sql.Int, licaoId).query(`SELECT * FROM EbdLicoes WHERE LicaoId = @id`);
  return mapearLicao(result.recordset[0]);
}

async function buscarLicaoPorCongregacaoData(pool, congregacaoId, data) {
  const result = await pool.request().input("congregacaoId", sql.Int, congregacaoId).input("data", sql.Date, data).query(`
    SELECT * FROM EbdLicoes WHERE CongregacaoId = @congregacaoId AND Data = @data
  `);
  return mapearLicao(result.recordset[0]);
}

// Idempotente: se já existe lição aberta pra essa congregação/data, só
// devolve ela (não cria duplicata — UNIQUE (CongregacaoId, Data) barraria
// mesmo assim, mas evita a viagem ao banco terminar em erro de constraint
// em uso normal, quando dois professores da mesma congregação abrem a
// tela no mesmo domingo).
async function abrirLicao(pool, { congregacaoId, data, abertoPorMembroId }) {
  const existente = await buscarLicaoPorCongregacaoData(pool, congregacaoId, data);
  if (existente) {
    if (existente.status === STATUS_LICAO.ABERTA) return { sucesso: true, licaoId: existente.licaoId, mensagem: "Lição já estava aberta." };
    return { sucesso: false, mensagem: "Já existe uma lição fechada nesta data para esta congregação — use reabrir em vez de abrir de novo." };
  }

  const result = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("data", sql.Date, data)
    .input("abertoPor", sql.Int, abertoPorMembroId || null)
    .query(`
      INSERT INTO EbdLicoes (CongregacaoId, Data, Status, AbertaPorMembroId)
      OUTPUT INSERTED.LicaoId
      VALUES (@congregacaoId, @data, 'ABERTA', @abertoPor)
    `);
  const licaoId = result.recordset[0].LicaoId;

  await registrarAuditoria({
    tabela: "EbdLicoes", registroId: licaoId, acao: "LICAO_ABERTA",
    usuarioId: abertoPorMembroId, dadosAntes: null, dadosDepois: { congregacaoId, data }
  });

  return { sucesso: true, licaoId, mensagem: "✅ Lição aberta." };
}

async function fecharLicao(pool, { licaoId, fechadoPorMembroId }) {
  const licao = await buscarLicaoPorId(pool, licaoId);
  const validacao = podeFecharLicao(licao);
  if (!validacao.permitido) return { sucesso: false, mensagem: validacao.mensagem };

  await pool.request().input("id", sql.Int, licaoId).input("fechadoPor", sql.Int, fechadoPorMembroId || null).query(`
    UPDATE EbdLicoes SET Status = 'FECHADA', FechadaPorMembroId = @fechadoPor, FechadaEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME()
    WHERE LicaoId = @id
  `);

  await registrarAuditoria({
    tabela: "EbdLicoes", registroId: licaoId, acao: "LICAO_FECHADA",
    usuarioId: fechadoPorMembroId, dadosAntes: { status: licao.status }, dadosDepois: { status: "FECHADA" }
  });

  return { sucesso: true, mensagem: "✅ Lição fechada." };
}

async function reabrirLicao(pool, { licaoId, reabertoPorMembroId }) {
  const licao = await buscarLicaoPorId(pool, licaoId);
  const validacao = podeReabrirLicao(licao);
  if (!validacao.permitido) return { sucesso: false, mensagem: validacao.mensagem };

  await pool.request().input("id", sql.Int, licaoId).query(`
    UPDATE EbdLicoes SET Status = 'ABERTA', FechadaPorMembroId = NULL, FechadaEm = NULL, AtualizadoEm = SYSUTCDATETIME()
    WHERE LicaoId = @id
  `);

  await registrarAuditoria({
    tabela: "EbdLicoes", registroId: licaoId, acao: "LICAO_REABERTA",
    usuarioId: reabertoPorMembroId, dadosAntes: { status: licao.status }, dadosDepois: { status: "ABERTA" }
  });

  return { sucesso: true, mensagem: "✅ Lição reaberta." };
}

async function listarLicoesPorCongregacao(pool, congregacaoId) {
  const result = await pool.request().input("congregacaoId", sql.Int, congregacaoId).query(`
    SELECT * FROM EbdLicoes WHERE CongregacaoId = @congregacaoId ORDER BY Data DESC
  `);
  return result.recordset.map(mapearLicao);
}

// ---- Chamada ----

async function buscarPresencaPorLicaoAluno(pool, licaoId, alunoId) {
  const result = await pool.request().input("licaoId", sql.Int, licaoId).input("alunoId", sql.Int, alunoId).query(`
    SELECT * FROM EbdChamadas WHERE LicaoId = @licaoId AND AlunoId = @alunoId
  `);
  const row = result.recordset[0];
  return row ? mapearChamada(row) : null;
}

function mapearChamada(row) {
  return {
    chamadaId: row.ChamadaId, licaoId: row.LicaoId, turmaId: row.TurmaId, alunoId: row.AlunoId,
    visitanteNome: row.VisitanteNome, visitanteContato: row.VisitanteContato, status: row.Status,
    registradoEm: row.RegistradoEm
  };
}

// Lança/corrige a presença de UM aluno da turma nesta lição (upsert —
// decidirAcaoRegistroPresenca decide se cria ou atualiza). Exige a lição
// ABERTA (podeLancarChamada) e a turma pertencer à MESMA congregação da
// lição (evita lançar chamada de uma turma de outra congregação contra
// esta lição).
async function registrarPresencaAluno(pool, { licaoId, turmaId, alunoId, status, registradoPorMembroId }) {
  const validacaoDados = validarLancamentoPresenca({ alunoId, status });
  if (!validacaoDados.valido) return { sucesso: false, mensagem: validacaoDados.mensagem };

  const licao = await buscarLicaoPorId(pool, licaoId);
  const validacaoLicao = podeLancarChamada(licao);
  if (!validacaoLicao.permitido) return { sucesso: false, mensagem: validacaoLicao.mensagem };

  const turma = await pool.request().input("id", sql.Int, turmaId).query(`SELECT TurmaId, CongregacaoId FROM EbdTurmas WHERE TurmaId = @id`);
  if (turma.recordset.length === 0) return { sucesso: false, mensagem: "Turma não encontrada." };
  if (turma.recordset[0].CongregacaoId !== licao.congregacaoId) {
    return { sucesso: false, mensagem: "Esta turma não pertence à congregação desta lição." };
  }

  const aluno = await pool.request().input("id", sql.Int, alunoId).query(`SELECT AlunoId, TurmaId FROM EbdAlunos WHERE AlunoId = @id AND Ativo = 1`);
  if (aluno.recordset.length === 0) return { sucesso: false, mensagem: "Aluno não encontrado ou inativo." };
  if (aluno.recordset[0].TurmaId !== Number(turmaId)) return { sucesso: false, mensagem: "Este aluno não pertence a esta turma." };

  const existente = await buscarPresencaPorLicaoAluno(pool, licaoId, alunoId);
  const acao = decidirAcaoRegistroPresenca(existente);

  if (acao === "ATUALIZAR") {
    await pool.request().input("id", sql.Int, existente.chamadaId).input("status", sql.NVarChar(10), status).query(`
      UPDATE EbdChamadas SET Status = @status, AtualizadoEm = SYSUTCDATETIME() WHERE ChamadaId = @id
    `);
  } else {
    await pool.request()
      .input("licaoId", sql.Int, licaoId).input("turmaId", sql.Int, turmaId).input("alunoId", sql.Int, alunoId)
      .input("status", sql.NVarChar(10), status).input("registradoPor", sql.Int, registradoPorMembroId || null)
      .query(`
        INSERT INTO EbdChamadas (LicaoId, TurmaId, AlunoId, Status, RegistradoPorMembroId)
        VALUES (@licaoId, @turmaId, @alunoId, @status, @registradoPor)
      `);
  }

  await registrarAuditoria({
    tabela: "EbdChamadas", registroId: existente ? existente.chamadaId : null, acao: "PRESENCA_LANCADA",
    usuarioId: registradoPorMembroId, dadosAntes: existente ? { status: existente.status } : null, dadosDepois: { licaoId, turmaId, alunoId, status }
  });

  return { sucesso: true, mensagem: "✅ Presença registrada." };
}

// Visitante: sempre uma linha NOVA (cada visita é sua própria ocorrência —
// não existe "matrícula de visitante" pra corrigir/atualizar em cima).
async function registrarVisitante(pool, { licaoId, turmaId, visitanteNome, visitanteContato, registradoPorMembroId }) {
  const validacaoDados = validarLancamentoPresenca({ status: STATUS_PRESENCA.VISITANTE, visitanteNome });
  if (!validacaoDados.valido) return { sucesso: false, mensagem: validacaoDados.mensagem };

  const licao = await buscarLicaoPorId(pool, licaoId);
  const validacaoLicao = podeLancarChamada(licao);
  if (!validacaoLicao.permitido) return { sucesso: false, mensagem: validacaoLicao.mensagem };

  const turma = await pool.request().input("id", sql.Int, turmaId).query(`SELECT TurmaId, CongregacaoId FROM EbdTurmas WHERE TurmaId = @id`);
  if (turma.recordset.length === 0) return { sucesso: false, mensagem: "Turma não encontrada." };
  if (turma.recordset[0].CongregacaoId !== licao.congregacaoId) {
    return { sucesso: false, mensagem: "Esta turma não pertence à congregação desta lição." };
  }

  const result = await pool.request()
    .input("licaoId", sql.Int, licaoId).input("turmaId", sql.Int, turmaId)
    .input("nome", sql.NVarChar(150), visitanteNome.trim()).input("contato", sql.NVarChar(150), visitanteContato || null)
    .input("registradoPor", sql.Int, registradoPorMembroId || null)
    .query(`
      INSERT INTO EbdChamadas (LicaoId, TurmaId, VisitanteNome, VisitanteContato, Status, RegistradoPorMembroId)
      OUTPUT INSERTED.ChamadaId
      VALUES (@licaoId, @turmaId, @nome, @contato, 'VISITANTE', @registradoPor)
    `);
  const chamadaId = result.recordset[0].ChamadaId;

  await registrarAuditoria({
    tabela: "EbdChamadas", registroId: chamadaId, acao: "VISITANTE_LANCADO",
    usuarioId: registradoPorMembroId, dadosAntes: null, dadosDepois: { licaoId, turmaId, visitanteNome: visitanteNome.trim() }
  });

  return { sucesso: true, chamadaId, mensagem: "✅ Visitante registrado." };
}

async function listarChamadaPorLicaoTurma(pool, { licaoId, turmaId }) {
  const result = await pool.request().input("licaoId", sql.Int, licaoId).input("turmaId", sql.Int, turmaId).query(`
    SELECT c.*, m.Nome AS MembroNome, a.Matricula
    FROM EbdChamadas c
    LEFT JOIN EbdAlunos a ON a.AlunoId = c.AlunoId
    LEFT JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE c.LicaoId = @licaoId AND c.TurmaId = @turmaId
    ORDER BY c.Status, m.Nome, c.VisitanteNome
  `);
  return result.recordset.map(row => ({
    ...mapearChamada(row), membroNome: row.MembroNome, matricula: row.Matricula
  }));
}

// Roster completo da turma pra esta lição — alunos ativos, cada um com a
// presença já lançada (ou null se ainda não chamado) — é o que a tela de
// lançamento usa pra montar a lista com o status atual de cada aluno.
async function listarRosterComPresenca(pool, { turmaId, licaoId }) {
  const result = await pool.request().input("turmaId", sql.Int, turmaId).input("licaoId", sql.Int, licaoId).query(`
    SELECT a.AlunoId, a.Matricula, m.Nome AS MembroNome, c.Status, c.ChamadaId
    FROM EbdAlunos a
    JOIN MembroReferencia m ON m.MembroId = a.MembroId
    LEFT JOIN EbdChamadas c ON c.AlunoId = a.AlunoId AND c.LicaoId = @licaoId
    WHERE a.TurmaId = @turmaId AND a.Ativo = 1
    ORDER BY m.Nome
  `);
  return result.recordset.map(row => ({
    alunoId: row.AlunoId, matricula: row.Matricula, membroNome: row.MembroNome,
    status: row.Status || null, chamadaId: row.ChamadaId || null
  }));
}

// Percentuais (item 3) sempre recalculados a partir das linhas gravadas —
// nunca lidos de um campo persistido.
async function calcularResumoTurma(pool, { licaoId, turmaId }) {
  const registros = await listarChamadaPorLicaoTurma(pool, { licaoId, turmaId });
  return resumirChamada(registros);
}

module.exports = {
  STATUS_LICAO, STATUS_PRESENCA,
  podeLancarChamada, podeFecharLicao, podeReabrirLicao,
  validarLancamentoPresenca, decidirAcaoRegistroPresenca, calcularPercentuais, resumirChamada,
  buscarLicaoPorId, buscarLicaoPorCongregacaoData, abrirLicao, fecharLicao, reabrirLicao, listarLicoesPorCongregacao,
  buscarPresencaPorLicaoAluno, registrarPresencaAluno, registrarVisitante,
  listarChamadaPorLicaoTurma, listarRosterComPresenca, calcularResumoTurma
};
