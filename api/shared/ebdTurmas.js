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
//    de participação a mais). Única exceção, desde a v6.8: o aluno
//    NÃO-MEMBRO (visitante frequente, criança de família não congregada),
//    que carrega o mínimo de identificação na própria matrícula e pode ser
//    vinculado a um membro depois, mantendo a mesma matrícula.
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

// ---- v6.8: aluno NÃO-MEMBRO ----
//
// A EBD mais quer alcançar quem ainda não é membro (visitante frequente,
// criança de família não congregada), e até a v6.7 o aluno era sempre um
// vínculo de MembroReferencia. Agora a própria matrícula pode carregar o
// mínimo de identificação (migração 109): nome, contato, nascimento e
// responsável. Menor de idade exige o nome do responsável (LGPD, Art. 14:
// dado de criança com consentimento de um responsável).
const MAIORIDADE_ANOS = 18;
const IDADE_MAXIMA_ANOS = 110;

function dataIsoValida(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return false;
  const ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function idadeEmAnos(nascimentoIso, hojeIso) {
  const [ny, nm, nd] = nascimentoIso.split("-").map(Number);
  const [hy, hm, hd] = hojeIso.split("-").map(Number);
  let idade = hy - ny;
  if (hm < nm || (hm === nm && hd < nd)) idade--;
  return idade;
}

function normalizarNome(nome) {
  return String(nome == null ? "" : nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function validarAlunoNaoMembro({ nome, contato, dataNascimento, responsavelNome } = {}, hojeIso) {
  const nomeLimpo = String(nome == null ? "" : nome).trim();
  if (nomeLimpo.length < 3) return { valido: false, mensagem: "Informe o nome completo do aluno (mínimo 3 caracteres)." };
  if (nomeLimpo.length > 150) return { valido: false, mensagem: "O nome do aluno passa de 150 caracteres." };
  const contatoLimpo = String(contato == null ? "" : contato).trim();
  if (contatoLimpo.length > 150) return { valido: false, mensagem: "O contato passa de 150 caracteres." };
  const responsavelLimpo = String(responsavelNome == null ? "" : responsavelNome).trim();
  if (responsavelLimpo.length > 150) return { valido: false, mensagem: "O nome do responsável passa de 150 caracteres." };

  let nascimento = null;
  if (dataNascimento != null && String(dataNascimento).trim() !== "") {
    nascimento = String(dataNascimento).trim().slice(0, 10);
    if (!dataIsoValida(nascimento)) return { valido: false, mensagem: "Data de nascimento inválida (use AAAA-MM-DD)." };
    if (hojeIso && nascimento > hojeIso) return { valido: false, mensagem: "A data de nascimento não pode ser futura." };
    const idade = hojeIso ? idadeEmAnos(nascimento, hojeIso) : null;
    if (idade != null && idade > IDADE_MAXIMA_ANOS) return { valido: false, mensagem: "Data de nascimento improvável — confira o ano." };
    if (idade != null && idade < MAIORIDADE_ANOS && responsavelLimpo.length < 3) {
      return { valido: false, mensagem: "Aluno menor de 18 anos: informe o nome do responsável." };
    }
  }

  return {
    valido: true,
    dados: { nome: nomeLimpo, contato: contatoLimpo || null, dataNascimento: nascimento, responsavelNome: responsavelLimpo || null }
  };
}

// Evita cadastrar duas vezes a mesma pessoa na mesma turma (secretário
// digitando o nome de novo no domingo seguinte). Compara sem acento nem
// maiúscula, contra membros e não-membros ativos da turma.
function podeMatricularNaoMembro(alunosDaTurma, nome) {
  const alvo = normalizarNome(nome);
  const repetido = (alunosDaTurma || []).find(a => normalizarNome(a.membroNome) === alvo);
  if (repetido) {
    return { permitido: false, mensagem: `Já existe um aluno chamado "${repetido.membroNome}" nesta turma (matrícula ${repetido.matricula}).` };
  }
  return { permitido: true };
}

// Quando o não-membro vira membro: a MESMA matrícula (e todo o histórico de
// chamada) passa a apontar pro cadastro do membro. Só vale para aluno que
// ainda é não-membro, e o membro não pode já ter outra matrícula.
function podeVincularAMembro(aluno, vinculoDoMembro) {
  if (!aluno) return { permitido: false, mensagem: "Aluno não encontrado." };
  if (aluno.membroId) return { permitido: false, mensagem: "Este aluno já está vinculado a um membro." };
  if (vinculoDoMembro) {
    return { permitido: false, mensagem: `Este membro já tem matrícula na EBD (${vinculoDoMembro.matricula}) — não dá pra vincular duas matrículas ao mesmo membro.` };
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

// Trava 6-A: turmas em que o Membro é professor ATIVO — é o que dá tela ao
// professor sem "ebd_gestao" (o backend já o deixava lançar chamada/resposta/
// pedido da própria turma desde a v6.2, mas a aba EBD só abria com a
// permissão ampla). Serve tanto pra sessão de Lideranca quanto pra de
// autoatendimento (código de acesso, vB.5), que não tem escopo territorial.
async function listarTurmasDoProfessor(pool, membroId) {
  if (!membroId) return [];
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT t.*, c.Nome AS CongregacaoNome
    FROM EbdTurmaProfessores tp
    JOIN EbdTurmas t ON t.TurmaId = tp.TurmaId
    JOIN Congregacoes c ON c.CongregacaoId = t.CongregacaoId
    WHERE tp.MembroId = @membroId AND tp.Ativo = 1 AND t.Ativa = 1
    ORDER BY c.Nome, t.Nome
  `);
  return result.recordset.map(row => ({ ...mapearTurma(row), congregacaoNome: row.CongregacaoNome }));
}

async function ehProfessorAtivoDaCongregacao(pool, membroId, congregacaoId) {
  if (!membroId) return false;
  const r = await pool.request().input("congregacaoId", sql.Int, congregacaoId).input("membroId", sql.Int, membroId).query(`
    SELECT TOP 1 1 FROM EbdTurmaProfessores tp
    JOIN EbdTurmas t ON t.TurmaId = tp.TurmaId
    WHERE t.CongregacaoId = @congregacaoId AND tp.MembroId = @membroId AND tp.Ativo = 1
  `);
  return r.recordset.length > 0;
}

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

function mapearAluno(row) {
  if (!row) return null;
  return {
    alunoId: row.AlunoId, membroId: row.MembroId, turmaId: row.TurmaId, matricula: row.Matricula,
    ativo: row.Ativo, matriculadoEm: row.MatriculadoEm, naoMembro: row.MembroId == null
  };
}

async function buscarAlunoPorMembro(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`SELECT * FROM EbdAlunos WHERE MembroId = @membroId`);
  return mapearAluno(result.recordset[0]);
}

async function buscarAlunoPorId(pool, alunoId) {
  const result = await pool.request().input("id", sql.Int, alunoId).query(`SELECT * FROM EbdAlunos WHERE AlunoId = @id`);
  return mapearAluno(result.recordset[0]);
}

function hojeIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Aluno sem cadastro de membro (v6.8). Recebe a matrícula pelo mesmo
// caminho do aluno-membro (gerarProtocolo, sequência única "EBD-ANO-NNNNNN")
// — matrícula não distingue quem é membro. O audit guarda só os ids, nunca
// nome/contato/nascimento: a trilha de auditoria é encadeada por hash e
// não pode ser corrigida depois, então dado pessoal não entra nela.
async function matricularAlunoNaoMembro(pool, { nome, contato, dataNascimento, responsavelNome, turmaId, criadoPorMembroId }) {
  const validacao = validarAlunoNaoMembro({ nome, contato, dataNascimento, responsavelNome }, hojeIsoLocal());
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const turma = await buscarTurmaPorId(pool, turmaId);
  if (!turma) return { sucesso: false, mensagem: "Turma não encontrada." };

  const naTurma = await listarAlunosPorTurma(pool, turmaId);
  const repeticao = podeMatricularNaoMembro(naTurma, validacao.dados.nome);
  if (!repeticao.permitido) return { sucesso: false, mensagem: repeticao.mensagem };

  const d = validacao.dados;
  const matricula = await gerarProtocolo(pool, PREFIXO_MATRICULA_EBD, { digitos: 6 });
  const result = await pool.request()
    .input("turmaId", sql.Int, turmaId).input("matricula", sql.NVarChar(20), matricula)
    .input("nome", sql.NVarChar(150), d.nome).input("contato", sql.NVarChar(150), d.contato)
    .input("nascimento", sql.Date, d.dataNascimento).input("responsavel", sql.NVarChar(150), d.responsavelNome)
    .input("criadoPor", sql.Int, criadoPorMembroId || null)
    .query(`
      INSERT INTO EbdAlunos (MembroId, TurmaId, Matricula, NomeNaoMembro, ContatoNaoMembro, DataNascimento, ResponsavelNome, CriadoPorMembroId)
      OUTPUT INSERTED.AlunoId
      VALUES (NULL, @turmaId, @matricula, @nome, @contato, @nascimento, @responsavel, @criadoPor)
    `);
  const alunoId = result.recordset[0].AlunoId;

  await registrarAuditoria({
    tabela: "EbdAlunos", registroId: alunoId, acao: "ALUNO_NAO_MEMBRO_MATRICULADO",
    usuarioId: criadoPorMembroId, dadosAntes: null, dadosDepois: { turmaId, matricula, naoMembro: true }
  });

  return { sucesso: true, alunoId, matricula, mensagem: `✅ Matrícula ${matricula} criada (aluno não-membro).` };
}

// O não-membro virou membro: a matrícula e o histórico de chamada
// continuam os mesmos (AlunoId não muda); os dados soltos da matrícula
// saem (o cadastro do membro passa a ser a fonte única — CHECK da 109).
async function vincularAlunoAMembro(pool, { alunoId, membroId, registradoPorMembroId }) {
  const aluno = await buscarAlunoPorId(pool, alunoId);
  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (aluno && membro.recordset.length === 0) return { sucesso: false, mensagem: "Membro não encontrado." };
  const vinculoDoMembro = await buscarAlunoPorMembro(pool, membroId);
  const validacao = podeVincularAMembro(aluno, vinculoDoMembro);
  if (!validacao.permitido) return { sucesso: false, mensagem: validacao.mensagem };

  await pool.request().input("id", sql.Int, alunoId).input("membroId", sql.Int, membroId).query(`
    UPDATE EbdAlunos
    SET MembroId = @membroId, NomeNaoMembro = NULL, ContatoNaoMembro = NULL, DataNascimento = NULL, ResponsavelNome = NULL,
        AtualizadoEm = SYSUTCDATETIME()
    WHERE AlunoId = @id AND MembroId IS NULL
  `);

  await registrarAuditoria({
    tabela: "EbdAlunos", registroId: alunoId, acao: "ALUNO_VINCULADO_A_MEMBRO",
    usuarioId: registradoPorMembroId, dadosAntes: { naoMembro: true }, dadosDepois: { membroId, matricula: aluno.matricula }
  });

  return { sucesso: true, mensagem: `✅ Matrícula ${aluno.matricula} vinculada ao cadastro do membro.` };
}

// A matrícula deixa de contar nos "matriculados" (caderneta) sem apagar
// nada: chamada e atividades antigas continuam apontando pro AlunoId.
async function encerrarMatricula(pool, { alunoId, registradoPorMembroId }) {
  const aluno = await buscarAlunoPorId(pool, alunoId);
  if (!aluno) return { sucesso: false, mensagem: "Aluno não encontrado." };
  if (!aluno.ativo) return { sucesso: false, mensagem: "Esta matrícula já está encerrada." };

  await pool.request().input("id", sql.Int, alunoId).query(`
    UPDATE EbdAlunos SET Ativo = 0, EncerradoEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME() WHERE AlunoId = @id
  `);

  await registrarAuditoria({
    tabela: "EbdAlunos", registroId: alunoId, acao: "ALUNO_ENCERRADO",
    usuarioId: registradoPorMembroId, dadosAntes: { ativo: true }, dadosDepois: { ativo: false }
  });

  return { sucesso: true, mensagem: `✅ Matrícula ${aluno.matricula} encerrada.` };
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

// Identifica o aluno por `alunoId` (serve também para não-membro, que não
// tem MembroId) ou por `membroId` (o caminho antigo, mantido). Transferir
// uma matrícula ENCERRADA a reativa na turma de destino — é assim que quem
// saiu e voltou reaparece, já que a matrícula é única por membro.
async function transferirAluno(pool, { membroId, alunoId, novaTurmaId, registradoPorMembroId }) {
  const aluno = alunoId ? await buscarAlunoPorId(pool, alunoId) : await buscarAlunoPorMembro(pool, membroId);
  if (!aluno) return { sucesso: false, mensagem: alunoId ? "Aluno não encontrado." : "Este membro não tem matrícula na EBD." };

  const turma = await buscarTurmaPorId(pool, novaTurmaId);
  if (!turma) return { sucesso: false, mensagem: "Turma de destino não encontrada." };
  const reativando = !aluno.ativo;
  if (aluno.turmaId === novaTurmaId && !reativando) return { sucesso: false, mensagem: "O aluno já está nesta turma." };

  await pool.request().input("id", sql.Int, aluno.alunoId).input("turmaId", sql.Int, novaTurmaId).query(`
    UPDATE EbdAlunos SET TurmaId = @turmaId, Ativo = 1, EncerradoEm = NULL, AtualizadoEm = SYSUTCDATETIME() WHERE AlunoId = @id
  `);

  await registrarAuditoria({
    tabela: "EbdAlunos", registroId: aluno.alunoId, acao: reativando ? "ALUNO_REATIVADO" : "ALUNO_TRANSFERIDO",
    usuarioId: registradoPorMembroId, dadosAntes: { turmaId: aluno.turmaId, ativo: aluno.ativo }, dadosDepois: { turmaId: novaTurmaId, ativo: true }
  });

  return { sucesso: true, mensagem: reativando ? "✅ Matrícula reativada na turma." : "✅ Aluno transferido de turma." };
}

async function listarAlunosPorTurma(pool, turmaId) {
  const result = await pool.request().input("turmaId", sql.Int, turmaId).query(`
    SELECT a.*, COALESCE(m.Nome, a.NomeNaoMembro) AS MembroNome
    FROM EbdAlunos a LEFT JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE a.TurmaId = @turmaId AND a.Ativo = 1 ORDER BY COALESCE(m.Nome, a.NomeNaoMembro)
  `);
  return result.recordset.map(row => ({
    alunoId: row.AlunoId, membroId: row.MembroId, membroNome: row.MembroNome, matricula: row.Matricula, matriculadoEm: row.MatriculadoEm,
    naoMembro: row.MembroId == null, contato: row.ContatoNaoMembro || null,
    dataNascimento: row.DataNascimento || null, responsavelNome: row.ResponsavelNome || null
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
  listarTurmasParaVisaoAgrupada, listarTurmasDoProfessor, ehProfessorAtivoDaCongregacao,
  // v6.8 — aluno não-membro
  MAIORIDADE_ANOS, idadeEmAnos, validarAlunoNaoMembro, podeMatricularNaoMembro, podeVincularAMembro,
  buscarAlunoPorId, matricularAlunoNaoMembro, vincularAlunoAMembro, encerrarMatricula
};
