// shared/ebdTurmas.js (v6.1 — EBD: Hierarquia e cadastros)
//
// Abre a FASE 6 (Escola Bíblica Dominical). Três peças, nenhuma delas cria
// um cadastro de pessoa novo:
//
// 1) EbdTurmas — pertence a UMA Congregação (Área/Região/Quadrante/Distrito
//    continuam alcançáveis subindo Congregacoes.AreaId, exatamente a mesma
//    cadeia de shared/escopo.js; nenhuma coluna territorial nova aqui).
// 2) EbdTurmaProfessores — N:N Turma×MembroReferencia, desligar nunca
//    apaga a linha (Ativo=0), mesmo padrão de EscalasEquipeMembros/v5.6.
// 3) EbdAlunos — vínculo de MembroReferencia com matrícula própria da EBD,
//    NÃO um cadastro de pessoa paralelo (mesmo espírito de
//    VoluntariosHabilitacao/v5.7: a pessoa já existe, só ganha um registro
//    de participação a mais).
//
// Lógica de decisão pura (testável sem banco) primeiro, funções de banco
// (finas) depois — mesmo padrão de shared/escalas.js / habilitacaoVoluntarios.js.
const { sql } = require("./db");
const { gerarProtocolo } = require("./protocolo");
const { registrarAuditoria } = require("./auditoria");

const PREFIXO_MATRICULA_EBD = "EBD";

// ---------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------

function nomeTurmaValido(nome) {
  return !!(nome && nome.trim().length >= 2);
}

function validarNovaTurma({ congregacaoId, nome }) {
  if (!congregacaoId) return { valido: false, mensagem: "Informe a congregação." };
  if (!nomeTurmaValido(nome)) return { valido: false, mensagem: "Informe um nome de turma com pelo menos 2 caracteres." };
  return { valido: true };
}

// Um professor só pode ser designado (de novo) se não estiver já ATIVO
// nessa mesma turma — reativar um vínculo encerrado é permitido (mesmo
// espírito de buscarOuCriarHabilitacao: reaproveita o que já existe em vez
// de acumular linhas duplicadas pro mesmo par Turma×Membro).
function podeDesignarProfessor(vinculoExistente) {
  if (vinculoExistente && vinculoExistente.ativo) {
    return { permitido: false, mensagem: "Este professor já está ativo nesta turma." };
  }
  return { permitido: true };
}

// A "matrícula única" (item 2 do v6.1) é dada UMA VEZ por Membro — se o
// Membro já tem vínculo de Aluno (em qualquer turma, ativo ou não), a
// matrícula já existe e é reaproveitada; só a Turma pode mudar
// (transferência), nunca a matrícula.
function podeMatricularAluno(vinculoExistente) {
  if (vinculoExistente) {
    return { permitido: false, mensagem: `Este membro já tem matrícula na EBD (${vinculoExistente.matricula}) — use transferência de turma em vez de nova matrícula.` };
  }
  return { permitido: true };
}

// Mesmo formato de shared/protocolo.js::gerarProtocolo (TIPO-ANO-NNNNNN) —
// função pura só pra deixar o formato testável sem banco; a geração real
// (sequência atômica por Tipo+Ano) é sempre feita por gerarProtocolo.
function formatarMatricula(ano, numero) {
  return `${PREFIXO_MATRICULA_EBD}-${ano}-${String(numero).padStart(6, "0")}`;
}

// Agrupa uma lista plana de turmas (cada linha já trazendo areaId/areaNome/
// congregacaoId/congregacaoNome) em Área -> Congregação -> [Turmas] — função
// pura, usada tanto pela rota quanto testável em isolamento sem banco.
function agruparPorAreaCongregacao(turmas) {
  const areas = new Map();
  for (const t of turmas || []) {
    const areaChave = t.areaId != null ? t.areaId : "SEM_AREA";
    if (!areas.has(areaChave)) {
      areas.set(areaChave, { areaId: t.areaId != null ? t.areaId : null, areaNome: t.areaNome || "Sem Área definida", congregacoes: new Map() });
    }
    const area = areas.get(areaChave);
    if (!area.congregacoes.has(t.congregacaoId)) {
      area.congregacoes.set(t.congregacaoId, { congregacaoId: t.congregacaoId, congregacaoNome: t.congregacaoNome, turmas: [] });
    }
    area.congregacoes.get(t.congregacaoId).turmas.push({
      turmaId: t.turmaId, nome: t.nome, faixaEtaria: t.faixaEtaria, ativa: t.ativa,
      totalProfessores: t.totalProfessores || 0, totalAlunos: t.totalAlunos || 0
    });
  }
  return Array.from(areas.values()).map(area => ({
    ...area,
    congregacoes: Array.from(area.congregacoes.values()).sort((a, b) => a.congregacaoNome.localeCompare(b.congregacaoNome))
  })).sort((a, b) => a.areaNome.localeCompare(b.areaNome));
}

// Filtro de busca (item 3): por nome de turma OU nome de congregação —
// função pura, aplicada sobre o resultado já agrupado, sem outra query.
function filtrarBuscaAgrupada(agrupado, termo) {
  if (!termo || !termo.trim()) return agrupado;
  const alvo = termo.trim().toLowerCase();
  return agrupado
    .map(area => ({
      ...area,
      congregacoes: area.congregacoes
        .map(cong => ({
          ...cong,
          turmas: cong.congregacaoNome.toLowerCase().includes(alvo)
            ? cong.turmas
            : cong.turmas.filter(t => t.nome.toLowerCase().includes(alvo))
        }))
        .filter(cong => cong.turmas.length > 0)
    }))
    .filter(area => area.congregacoes.length > 0);
}

// ---------------------------------------------------------------
// Funções de banco (finas)
// ---------------------------------------------------------------

function mapearTurma(row) {
  if (!row) return null;
  return {
    turmaId: row.TurmaId, congregacaoId: row.CongregacaoId, nome: row.Nome,
    faixaEtaria: row.FaixaEtaria, ativa: row.Ativa, criadoEm: row.CriadoEm
  };
}

async function criarTurma(pool, { congregacaoId, nome, faixaEtaria, criadoPorMembroId }) {
  const validacao = validarNovaTurma({ congregacaoId, nome });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const existente = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("nome", sql.NVarChar(150), nome.trim())
    .query(`SELECT TurmaId FROM EbdTurmas WHERE CongregacaoId = @congregacaoId AND Nome = @nome`);
  if (existente.recordset.length > 0) return { sucesso: false, mensagem: "Já existe uma turma com este nome nesta congregação." };

  const result = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("nome", sql.NVarChar(150), nome.trim())
    .input("faixaEtaria", sql.NVarChar(50), faixaEtaria || null)
    .input("criadoPor", sql.Int, criadoPorMembroId || null)
    .query(`
      INSERT INTO EbdTurmas (CongregacaoId, Nome, FaixaEtaria, CriadoPorMembroId)
      OUTPUT INSERTED.TurmaId
      VALUES (@congregacaoId, @nome, @faixaEtaria, @criadoPor)
    `);
  const turmaId = result.recordset[0].TurmaId;

  await registrarAuditoria({
    tabela: "EbdTurmas", registroId: turmaId, acao: "TURMA_CRIADA",
    usuarioId: criadoPorMembroId, dadosAntes: null, dadosDepois: { congregacaoId, nome: nome.trim(), faixaEtaria: faixaEtaria || null }
  });

  return { sucesso: true, turmaId, mensagem: "✅ Turma criada." };
}

async function buscarTurmaPorId(pool, turmaId) {
  const result = await pool.request().input("id", sql.Int, turmaId).query(`SELECT * FROM EbdTurmas WHERE TurmaId = @id`);
  return mapearTurma(result.recordset[0]);
}

async function listarTurmasPorCongregacao(pool, congregacaoId) {
  const result = await pool.request().input("congregacaoId", sql.Int, congregacaoId).query(`
    SELECT t.*,
      (SELECT COUNT(*) FROM EbdTurmaProfessores p WHERE p.TurmaId = t.TurmaId AND p.Ativo = 1) AS TotalProfessores,
      (SELECT COUNT(*) FROM EbdAlunos a WHERE a.TurmaId = t.TurmaId AND a.Ativo = 1) AS TotalAlunos
    FROM EbdTurmas t WHERE t.CongregacaoId = @congregacaoId ORDER BY t.Nome
  `);
  return result.recordset.map(row => ({ ...mapearTurma(row), totalProfessores: row.TotalProfessores, totalAlunos: row.TotalAlunos }));
}

// ---- Professores ----

async function buscarVinculoProfessor(pool, turmaId, membroId) {
  const result = await pool.request().input("turmaId", sql.Int, turmaId).input("membroId", sql.Int, membroId).query(`
    SELECT * FROM EbdTurmaProfessores WHERE TurmaId = @turmaId AND MembroId = @membroId
  `);
  const row = result.recordset[0];
  if (!row) return null;
  return { turmaProfessorId: row.TurmaProfessorId, turmaId: row.TurmaId, membroId: row.MembroId, principal: row.Principal, ativo: row.Ativo };
}

async function designarProfessor(pool, { turmaId, membroId, principal, designadoPorMembroId }) {
  const turma = await buscarTurmaPorId(pool, turmaId);
  if (!turma) return { sucesso: false, mensagem: "Turma não encontrada." };

  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) return { sucesso: false, mensagem: "Membro não encontrado." };

  const vinculo = await buscarVinculoProfessor(pool, turmaId, membroId);
  const validacao = podeDesignarProfessor(vinculo);
  if (!validacao.permitido) return { sucesso: false, mensagem: validacao.mensagem };

  if (vinculo) {
    await pool.request().input("id", sql.Int, vinculo.turmaProfessorId).input("principal", sql.Bit, !!principal).query(`
      UPDATE EbdTurmaProfessores SET Ativo = 1, Principal = @principal, EncerradoEm = NULL, DesignadoEm = SYSUTCDATETIME() WHERE TurmaProfessorId = @id
    `);
  } else {
    await pool.request()
      .input("turmaId", sql.Int, turmaId).input("membroId", sql.Int, membroId)
      .input("principal", sql.Bit, !!principal).input("designadoPor", sql.Int, designadoPorMembroId || null)
      .query(`INSERT INTO EbdTurmaProfessores (TurmaId, MembroId, Principal, DesignadoPorMembroId) VALUES (@turmaId, @membroId, @principal, @designadoPor)`);
  }

  await registrarAuditoria({
    tabela: "EbdTurmaProfessores", registroId: turmaId, acao: "PROFESSOR_DESIGNADO",
    usuarioId: designadoPorMembroId, dadosAntes: null, dadosDepois: { turmaId, membroId, principal: !!principal }
  });

  return { sucesso: true, mensagem: "✅ Professor designado." };
}

async function encerrarProfessor(pool, { turmaId, membroId, registradoPorMembroId }) {
  const vinculo = await buscarVinculoProfessor(pool, turmaId, membroId);
  if (!vinculo || !vinculo.ativo) return { sucesso: false, mensagem: "Este professor não está ativo nesta turma." };

  await pool.request().input("id", sql.Int, vinculo.turmaProfessorId).query(`
    UPDATE EbdTurmaProfessores SET Ativo = 0, EncerradoEm = SYSUTCDATETIME() WHERE TurmaProfessorId = @id
  `);

  await registrarAuditoria({
    tabela: "EbdTurmaProfessores", registroId: turmaId, acao: "PROFESSOR_ENCERRADO",
    usuarioId: registradoPorMembroId, dadosAntes: null, dadosDepois: { turmaId, membroId }
  });

  return { sucesso: true, mensagem: "✅ Professor removido da turma." };
}

async function listarProfessoresPorTurma(pool, turmaId) {
  const result = await pool.request().input("turmaId", sql.Int, turmaId).query(`
    SELECT p.*, m.Nome AS MembroNome
    FROM EbdTurmaProfessores p JOIN MembroReferencia m ON m.MembroId = p.MembroId
    WHERE p.TurmaId = @turmaId AND p.Ativo = 1 ORDER BY p.Principal DESC, m.Nome
  `);
  return result.recordset.map(row => ({
    turmaProfessorId: row.TurmaProfessorId, membroId: row.MembroId, membroNome: row.MembroNome, principal: row.Principal
  }));
}

// ---- Alunos ----

async function buscarAlunoPorMembro(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`SELECT * FROM EbdAlunos WHERE MembroId = @membroId`);
  const row = result.recordset[0];
  if (!row) return null;
  return {
    alunoId: row.AlunoId, membroId: row.MembroId, turmaId: row.TurmaId, matricula: row.Matricula,
    ativo: row.Ativo, matriculadoEm: row.MatriculadoEm
  };
}

// Matrícula gerada UMA VEZ (gerarProtocolo — sequência atômica MERGE...
// HOLDLOCK já usada por Ouvidoria/Disciplina/Projetos, sem reinventar
// contador) e nunca mais alterada, mesmo que a Turma mude depois (ver
// decisão 4 na migração 101). Formato "EBD-ANO-NNNNNN" — o ano faz parte
// do valor devolvido por gerarProtocolo (sequência por Tipo+Ano, mesmo
// mecanismo do resto do sistema); a unicidade não depende de nunca haver
// dois anos com o mesmo número, já que o ano vai junto no valor gravado.
async function matricularAluno(pool, { membroId, turmaId, criadoPorMembroId }) {
  const turma = await buscarTurmaPorId(pool, turmaId);
  if (!turma) return { sucesso: false, mensagem: "Turma não encontrada." };

  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) return { sucesso: false, mensagem: "Membro não encontrado." };

  const existente = await buscarAlunoPorMembro(pool, membroId);
  const validacao = podeMatricularAluno(existente);
  if (!validacao.permitido) return { sucesso: false, mensagem: validacao.mensagem };

  const matricula = await gerarProtocolo(pool, PREFIXO_MATRICULA_EBD, { digitos: 6 });

  const result = await pool.request()
    .input("membroId", sql.Int, membroId).input("turmaId", sql.Int, turmaId)
    .input("matricula", sql.NVarChar(20), matricula).input("criadoPor", sql.Int, criadoPorMembroId || null)
    .query(`
      INSERT INTO EbdAlunos (MembroId, TurmaId, Matricula, CriadoPorMembroId)
      OUTPUT INSERTED.AlunoId
      VALUES (@membroId, @turmaId, @matricula, @criadoPor)
    `);
  const alunoId = result.recordset[0].AlunoId;

  await registrarAuditoria({
    tabela: "EbdAlunos", registroId: alunoId, acao: "ALUNO_MATRICULADO",
    usuarioId: criadoPorMembroId, dadosAntes: null, dadosDepois: { membroId, turmaId, matricula }
  });

  return { sucesso: true, alunoId, matricula, mensagem: `✅ Matrícula ${matricula} criada.` };
}

async function transferirAluno(pool, { membroId, novaTurmaId, registradoPorMembroId }) {
  const aluno = await buscarAlunoPorMembro(pool, membroId);
  if (!aluno) return { sucesso: false, mensagem: "Este membro não tem matrícula na EBD." };

  const turma = await buscarTurmaPorId(pool, novaTurmaId);
  if (!turma) return { sucesso: false, mensagem: "Turma de destino não encontrada." };
  if (aluno.turmaId === novaTurmaId) return { sucesso: false, mensagem: "O aluno já está nesta turma." };

  await pool.request().input("id", sql.Int, aluno.alunoId).input("turmaId", sql.Int, novaTurmaId).query(`
    UPDATE EbdAlunos SET TurmaId = @turmaId, AtualizadoEm = SYSUTCDATETIME() WHERE AlunoId = @id
  `);

  await registrarAuditoria({
    tabela: "EbdAlunos", registroId: aluno.alunoId, acao: "ALUNO_TRANSFERIDO",
    usuarioId: registradoPorMembroId, dadosAntes: { turmaId: aluno.turmaId }, dadosDepois: { turmaId: novaTurmaId }
  });

  return { sucesso: true, mensagem: "✅ Aluno transferido de turma." };
}

async function listarAlunosPorTurma(pool, turmaId) {
  const result = await pool.request().input("turmaId", sql.Int, turmaId).query(`
    SELECT a.*, m.Nome AS MembroNome
    FROM EbdAlunos a JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE a.TurmaId = @turmaId AND a.Ativo = 1 ORDER BY m.Nome
  `);
  return result.recordset.map(row => ({
    alunoId: row.AlunoId, membroId: row.MembroId, membroNome: row.MembroNome, matricula: row.Matricula, matriculadoEm: row.MatriculadoEm
  }));
}

// ---- Visão agrupada Área -> Congregação (item 3) ----
//
// Escopo (shared/escopo.js::resolverEscopoCongregacoes) é aplicado ANTES
// desta função — ela recebe já a lista de nomes de congregação permitida
// (ou null/"TODAS") e filtra a query por Congregacoes.Nome IN (...), mesmo
// padrão usado pelo resto do sistema (nunca uma segunda checagem de
// permissão dentro do SQL).
async function listarTurmasParaVisaoAgrupada(pool, { nomesCongregacoesPermitidas } = {}) {
  const request = pool.request();
  let filtroEscopo = "";
  if (Array.isArray(nomesCongregacoesPermitidas)) {
    if (nomesCongregacoesPermitidas.length === 0) return [];
    const params = nomesCongregacoesPermitidas.map((nome, i) => {
      request.input(`cong${i}`, sql.NVarChar(150), nome);
      return `@cong${i}`;
    });
    filtroEscopo = `WHERE c.Nome IN (${params.join(",")})`;
  }

  const result = await request.query(`
    SELECT t.TurmaId, t.Nome, t.FaixaEtaria, t.Ativa,
           c.CongregacaoId, c.Nome AS CongregacaoNome, a.AreaId, a.Nome AS AreaNome,
           (SELECT COUNT(*) FROM EbdTurmaProfessores p WHERE p.TurmaId = t.TurmaId AND p.Ativo = 1) AS TotalProfessores,
           (SELECT COUNT(*) FROM EbdAlunos al WHERE al.TurmaId = t.TurmaId AND al.Ativo = 1) AS TotalAlunos
    FROM EbdTurmas t
    JOIN Congregacoes c ON c.CongregacaoId = t.CongregacaoId
    LEFT JOIN Areas a ON a.AreaId = c.AreaId
    ${filtroEscopo}
    ORDER BY a.Nome, c.Nome, t.Nome
  `);

  return result.recordset.map(row => ({
    turmaId: row.TurmaId, nome: row.Nome, faixaEtaria: row.FaixaEtaria, ativa: row.Ativa,
    congregacaoId: row.CongregacaoId, congregacaoNome: row.CongregacaoNome,
    areaId: row.AreaId, areaNome: row.AreaNome,
    totalProfessores: row.TotalProfessores, totalAlunos: row.TotalAlunos
  }));
}

module.exports = {
  PREFIXO_MATRICULA_EBD,
  nomeTurmaValido, validarNovaTurma, podeDesignarProfessor, podeMatricularAluno,
  formatarMatricula, agruparPorAreaCongregacao, filtrarBuscaAgrupada,
  criarTurma, buscarTurmaPorId, listarTurmasPorCongregacao,
  buscarVinculoProfessor, designarProfessor, encerrarProfessor, listarProfessoresPorTurma,
  buscarAlunoPorMembro, matricularAluno, transferirAluno, listarAlunosPorTurma,
  listarTurmasParaVisaoAgrupada
};
