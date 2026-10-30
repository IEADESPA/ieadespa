// shared/seminarioDb.js (v8.7 — o Seminário como sistema acadêmico) — o banco do currículo, das turmas, das notas, do aproveitamento, da conclusão e dos documentos da
// AFM. A regra pura está em shared/seminario.js; o desenho, em docs/plano/fase-8-ministerial-afm.md. Quem registra é a AFM do nível geral — e o docente, na própria turma
// (o handler confere); ninguém lança a própria nota nem registra o próprio curso.
//
// Travas (sp_getapplock, na ordem turma -> pessoa, nunca o contrário): "seminario_turma_<id>" para o que muda a turma (inscrever, lançar, encerrar, reabrir, cancelar a
// inscrição) e "seminario_pessoa_<id>" para o que muda o percurso da pessoa (matrícula no curso, conclusão, aproveitamento — e o lançamento que tira um "aprovado").
const { sql } = require("./db");
const regra = require("./seminario");
const afm = require("./afm");
const { obterTrava } = require("./financeiroSeguro");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const certificados = require("./certificados");

const rqDe = (c) => (typeof c.request === "function" ? c.request() : new sql.Request(c));
const naTransacao = (t) => ({ request: () => new sql.Request(t) });
const listaDeIds = (ids) => [...new Set((ids || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0 && n <= 2147483647);
const dia = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const num = (v) => (v == null ? null : Number(v));
const NAO_EXISTE = { sucesso: false, naoExiste: true };
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });
const NATUREZAS = ["DIPLOMA_AFM", "HISTORICO", "DECLARACAO"];
// O treinamento do voluntariado (HABILITACAO_TREINAMENTO) não aceita disciplina: a aptidão do ministério com menores o reavalia só pelas trilhas (revisão, 30/10/2026).
const CONTEXTOS_DISCIPLINA = ["CONSAGRACAO", "LIDERANCA", "BATISMO_DISCIPULADO", "ESCALA_EQUIPE", "EBD_PROFESSOR"];
const sha256 = (texto) => require("crypto").createHash("sha256").update(String(texto), "utf8").digest("hex");
const seloDoConteudo = (hash) => String(hash).slice(0, 12).toUpperCase();
const ROTULO_NATUREZA = { DIPLOMA_AFM: "Diploma", HISTORICO: "Histórico escolar", DECLARACAO: "Declaração de matrícula" };

async function fecharTransacao(t, ok) {
  try { if (ok) await t.commit(); else await t.rollback(); } catch (e) { /* a transação já pode ter sido encerrada pelo servidor */ }
}
// `fazer(t)` numa transação com as travas pedidas (na ordem dada). Sem a trava (espera esgotada) devolve "mudou".
async function comTravas(pool, recursos, fazer) {
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    for (const recurso of recursos) {
      if (!(await obterTrava(() => new sql.Request(t), recurso))) { await fecharTransacao(t, false); return MUDOU("Outra alteração está em andamento. Tente de novo."); }
    }
    const r = await fazer(t);
    await fecharTransacao(t, !(r && r.sucesso === false));
    return r;
  } catch (e) { await fecharTransacao(t, false); throw e; }
}
const travaTurma = (id) => `seminario_turma_${Number(id)}`;
const travaPessoa = (id) => `seminario_pessoa_${Number(id)}`;

// ---------------------------------------------------------------- o que os outros módulos leem
// O nível do Art. 72 que vem do histórico (Map membroId -> [{ nivel, concluido }]). A base sem a migração 163 (testes antigos) responde vazio.
async function niveisHistorico(conexao, ids) {
  const out = new Map();
  const lista = listaDeIds(ids);
  if (!lista.length) return out;
  const r = await rqDe(conexao).query(`IF OBJECT_ID(N'dbo.AFMCursoMatriculas', N'U') IS NOT NULL
    SELECT m.MembroId, c.Nivel, m.Situacao FROM AFMCursoMatriculas m JOIN AFMCursos c ON c.CursoId = m.CursoId WHERE m.MembroId IN (${lista.join(",")}) AND m.Situacao <> N'CANCELADA'`);
  for (const l of r.recordset || []) out.set(Number(l.MembroId), [...(out.get(Number(l.MembroId)) || []), ...regra.paresDeNivel([{ nivel: l.Nivel, situacao: l.Situacao }])]);
  return out;
}

// O que cada pessoa já cumpriu (Map membroId -> Map disciplinaId -> estado — seminario.estadoDasDisciplinas).
async function estados(conexao, ids) {
  const out = new Map();
  const lista = listaDeIds(ids);
  if (!lista.length) return out;
  const tent = (await rqDe(conexao).query(`
    SELECT ta.MembroId, t.DisciplinaId, t.Situacao AS TurmaSituacao, ta.Situacao, ta.Resultado, CONVERT(varchar(10), t.EncerradaEm, 120) AS EncerradaEm
    FROM AFMTurmaAlunos ta JOIN AFMTurmas t ON t.TurmaId = ta.TurmaId WHERE ta.MembroId IN (${lista.join(",")})`)).recordset;
  const apr = (await rqDe(conexao).query(`
    SELECT MembroId, DisciplinaId, Decisao, AnuladoEm, CONVERT(varchar(10), DataParecer, 120) AS DataParecer FROM AFMAproveitamentos WHERE MembroId IN (${lista.join(",")})`)).recordset;
  for (const id of lista) {
    out.set(id, regra.estadoDasDisciplinas(
      tent.filter((l) => Number(l.MembroId) === id).map((l) => ({ disciplinaId: l.DisciplinaId, turmaSituacao: l.TurmaSituacao, situacao: l.Situacao, resultado: l.Resultado, encerradaEm: l.EncerradaEm })),
      apr.filter((l) => Number(l.MembroId) === id).map((l) => ({ disciplinaId: l.DisciplinaId, decisao: l.Decisao, anuladoEm: l.AnuladoEm, dataParecer: l.DataParecer }))));
  }
  return out;
}

// ---------------------------------------------------------------- o requisito de formação que exige uma disciplina (lido por shared/trilhas.js)
async function listarRequisitos(conexao, { contexto = null, apenasAtivos = true } = {}) {
  const rq = rqDe(conexao);
  const cond = [];
  if (apenasAtivos) cond.push("r.Ativo = 1");
  if (contexto) { rq.input("c", sql.NVarChar(30), contexto); cond.push("r.Contexto = @c"); }
  const r = await rq.query(`IF OBJECT_ID(N'dbo.AFMDisciplinaRequisitos', N'U') IS NOT NULL
    SELECT r.RequisitoId, r.Contexto, r.AlvoChave, r.DisciplinaId, r.Modo, r.Ativo, d.Nome AS DisciplinaNome, d.Ativa AS DisciplinaAtiva, c.Nivel
    FROM AFMDisciplinaRequisitos r JOIN AFMDisciplinas d ON d.DisciplinaId = r.DisciplinaId JOIN AFMCursos c ON c.CursoId = d.CursoId
    ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY r.Contexto, r.AlvoChave, d.Nome`);
  return (r.recordset || []).map((l) => ({ requisitoId: l.RequisitoId, contexto: l.Contexto, alvoChave: l.AlvoChave, disciplinaId: l.DisciplinaId,
    disciplinaNome: `${l.DisciplinaNome} (${regra.rotuloNivel(l.Nivel)})`, disciplinaAtiva: !!l.DisciplinaAtiva, modo: l.Modo, ativo: !!l.Ativo }));
}

// Map membroId -> [avaliação] dos requisitos de disciplina que valem no contexto/alvo (o mesmo formato da avaliação da trilha).
async function avaliacoesDeRequisitos(conexao, { contexto, alvoChave = "", membroIds }) {
  const out = new Map();
  const ids = listaDeIds(membroIds);
  if (!ids.length || !CONTEXTOS_DISCIPLINA.includes(contexto)) return out;
  const { alvoCorresponde } = require("./trilhas");
  const reqs = (await listarRequisitos(conexao, { contexto })).filter((r) => alvoCorresponde(r.alvoChave, alvoChave));
  if (!reqs.length) return out;
  const est = await estados(conexao, ids);
  for (const id of ids) out.set(id, reqs.map((r) => regra.avaliarRequisitoDisciplina({ requisito: r, estado: (est.get(id) || new Map()).get(Number(r.disciplinaId)) })));
  return out;
}

async function criarRequisito(pool, { contexto, alvoChave, disciplinaId, modo, por }) {
  const trilhas = require("./trilhas");
  const v = trilhas.validarRequisito({ contexto, alvoChave, trilhaId: disciplinaId, modo });   // a mesma validação do contexto, do alvo e do modo
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem.replace("Informe a trilha exigida.", "Escolha a disciplina exigida.") };
  if (!CONTEXTOS_DISCIPLINA.includes(v.dados.contexto)) return { sucesso: false, mensagem: "O treinamento do voluntariado se exige por trilha de formação (a aptidão do ministério com menores é conferida pelas trilhas)." };
  const d = (await pool.request().input("d", sql.Int, v.dados.trilhaId).query(`SELECT Ativa FROM AFMDisciplinas WHERE DisciplinaId = @d`)).recordset[0];
  if (!d) return { sucesso: false, mensagem: "Disciplina não encontrada." };
  if (!d.Ativa) return { sucesso: false, mensagem: "A disciplina está desativada: ative-a antes de exigi-la." };
  const r = await pool.request().input("c", sql.NVarChar(30), v.dados.contexto).input("a", sql.NVarChar(100), v.dados.alvoChave).input("d", sql.Int, v.dados.trilhaId)
    .input("m", sql.NVarChar(10), v.dados.modo).input("por", sql.Int, por).query(`
      MERGE AFMDisciplinaRequisitos WITH (HOLDLOCK) AS t USING (SELECT @c AS Contexto, @a AS AlvoChave, @d AS DisciplinaId) AS s
        ON t.Contexto = s.Contexto AND t.AlvoChave = s.AlvoChave AND t.DisciplinaId = s.DisciplinaId
      WHEN MATCHED THEN UPDATE SET Ativo = 1, Modo = @m
      WHEN NOT MATCHED THEN INSERT (Contexto, AlvoChave, DisciplinaId, Modo, CriadoPor) VALUES (@c, @a, @d, @m, @por)
      OUTPUT INSERTED.RequisitoId;`);
  const requisitoId = r.recordset[0].RequisitoId;
  await registrarAuditoria({ tabela: "AFMDisciplinaRequisitos", registroId: requisitoId, acao: "AFM_REQUISITO_DISCIPLINA", usuarioId: por,
    dadosDepois: { contexto: v.dados.contexto, alvoChave: v.dados.alvoChave, disciplinaId: v.dados.trilhaId, modo: v.dados.modo } });
  return { sucesso: true, requisitoId, mensagem: `Requisito definido (${trilhas.ROTULO_CONTEXTO[v.dados.contexto]} — ${v.dados.modo === "BLOQUEIA" ? "bloqueia" : "só alerta"}).` };
}
async function removerRequisito(pool, { requisitoId, por }) {
  const r = await pool.request().input("id", sql.Int, Number(requisitoId)).query(`UPDATE AFMDisciplinaRequisitos SET Ativo = 0 WHERE RequisitoId = @id AND Ativo = 1`);
  if (!r.rowsAffected[0]) return NAO_EXISTE;
  await registrarAuditoria({ tabela: "AFMDisciplinaRequisitos", registroId: Number(requisitoId), acao: "AFM_REQUISITO_DISCIPLINA_REMOVIDO", usuarioId: por, dadosAntes: { ativo: true }, dadosDepois: { ativo: false } });
  return { sucesso: true, mensagem: "Requisito removido." };
}

// ---------------------------------------------------------------- o currículo
async function curriculo(conexao) {
  const cursos = (await rqDe(conexao).query(`SELECT CursoId, Nivel, Nome, NotaMinima, FrequenciaMinimaPct FROM AFMCursos`)).recordset
    .map((l) => ({ cursoId: l.CursoId, nivel: l.Nivel, nivelRotulo: regra.rotuloNivel(l.Nivel), nome: l.Nome, notaMinima: Number(l.NotaMinima), frequenciaMinimaPct: l.FrequenciaMinimaPct }))
    .sort((a, b) => afm.NIVEIS[a.nivel].ordem - afm.NIVEIS[b.nivel].ordem);
  const disciplinas = (await rqDe(conexao).query(`SELECT DisciplinaId, CursoId, Nome, Area, CargaHoraria, Obrigatoria, Ativa, Ementa FROM AFMDisciplinas ORDER BY Nome`)).recordset
    .map((l) => ({ disciplinaId: l.DisciplinaId, cursoId: l.CursoId, nome: l.Nome, area: l.Area, areaRotulo: regra.AREAS[l.Area], cargaHoraria: Number(l.CargaHoraria),
      obrigatoria: !!l.Obrigatoria, ativa: !!l.Ativa, ementa: l.Ementa || null, preRequisitos: [] }));
  const porId = new Map(disciplinas.map((d) => [d.disciplinaId, d]));
  for (const l of (await rqDe(conexao).query(`SELECT DisciplinaId, PreRequisitoId FROM AFMDisciplinaPreRequisitos`)).recordset) {
    const d = porId.get(l.DisciplinaId);
    if (d) d.preRequisitos.push(l.PreRequisitoId);
  }
  for (const c of cursos) {
    c.disciplinas = disciplinas.filter((d) => d.cursoId === c.cursoId);
    c.lacunasGovernanca = regra.lacunasGovernanca(c.disciplinas);   // Art. 70 §2º (aviso)
  }
  return { cursos, disciplinas: porId };
}

async function salvarCurso(pool, { curso, por }) {
  const atual = (await pool.request().input("c", sql.Int, curso.cursoId).query(`SELECT Nome, NotaMinima, FrequenciaMinimaPct FROM AFMCursos WHERE CursoId = @c`)).recordset[0];
  if (!atual) return NAO_EXISTE;
  await pool.request().input("c", sql.Int, curso.cursoId).input("n", sql.NVarChar(150), curso.nome).input("nota", sql.Decimal(4, 2), curso.notaMinima).input("f", sql.Int, curso.frequenciaMinimaPct)
    .input("por", sql.Int, por).query(`UPDATE AFMCursos SET Nome = @n, NotaMinima = @nota, FrequenciaMinimaPct = @f, AtualizadoPor = @por, AtualizadoEm = SYSUTCDATETIME() WHERE CursoId = @c`);
  await registrarAuditoria({ tabela: "AFMCursos", registroId: curso.cursoId, acao: "AFM_CURSO_ALTERADO", usuarioId: por,
    dadosAntes: { nome: atual.Nome, notaMinima: Number(atual.NotaMinima), frequenciaMinimaPct: atual.FrequenciaMinimaPct }, dadosDepois: curso });
  return { sucesso: true, mensagem: "Curso atualizado. As turmas já abertas seguem a regra do dia em que foram abertas." };
}

// Cria ou corrige uma disciplina e troca os pré-requisitos dela (sem ciclo — conferido sob a trava do currículo, para dois cadastros ao mesmo tempo não fecharem um ciclo).
async function salvarDisciplina(pool, { disciplina, por }) {
  const r = await comTravas(pool, ["seminario_curriculo"], async (t) => {
    const curso = (await new sql.Request(t).input("c", sql.Int, disciplina.cursoId).query(`SELECT CursoId FROM AFMCursos WHERE CursoId = @c`)).recordset[0];
    if (!curso) return { sucesso: false, mensagem: "Curso não encontrado." };
    let antes = null;
    if (disciplina.disciplinaId) {
      antes = (await new sql.Request(t).input("d", sql.Int, disciplina.disciplinaId).query(`SELECT CursoId, Nome, Area, CargaHoraria, Obrigatoria, Ativa FROM AFMDisciplinas WHERE DisciplinaId = @d`)).recordset[0];
      if (!antes) return NAO_EXISTE;
      if (antes.CursoId !== disciplina.cursoId) return { sucesso: false, mensagem: "A disciplina não muda de curso (cadastre outra no curso novo)." };
      if (antes.Ativa && !disciplina.ativa) {
        const presa = (await new sql.Request(t).input("d", sql.Int, disciplina.disciplinaId).query(`
          SELECT (SELECT COUNT(*) FROM AFMDisciplinaRequisitos WHERE DisciplinaId = @d AND Ativo = 1) AS Requisitos,
                 (SELECT COUNT(*) FROM AFMDisciplinaPreRequisitos p JOIN AFMDisciplinas x ON x.DisciplinaId = p.DisciplinaId WHERE p.PreRequisitoId = @d AND x.Ativa = 1) AS Dependentes`)).recordset[0];
        if (Number(presa.Requisitos)) return { sucesso: false, mensagem: "A disciplina é exigida num fluxo (Requisitos de disciplina): remova a exigência antes de desativá-la, senão ninguém mais a cumpre." };
        if (Number(presa.Dependentes)) return { sucesso: false, mensagem: "A disciplina é pré-requisito de outra disciplina ativa: tire-a dos pré-requisitos antes de desativá-la." };
      }
    }
    if (disciplina.preRequisitos.length) {
      const existem = (await new sql.Request(t).query(`SELECT DisciplinaId FROM AFMDisciplinas WHERE DisciplinaId IN (${listaDeIds(disciplina.preRequisitos).join(",")})`)).recordset.length;
      if (existem !== disciplina.preRequisitos.length) return { sucesso: false, mensagem: "Algum pré-requisito não existe mais. Atualize a tela." };
      const arestas = (await new sql.Request(t).query(`SELECT DisciplinaId AS disciplinaId, PreRequisitoId AS preRequisitoId FROM AFMDisciplinaPreRequisitos`)).recordset;
      if (regra.criariaCiclo(arestas, disciplina.disciplinaId, disciplina.preRequisitos)) return { sucesso: false, mensagem: "Esses pré-requisitos fecham um ciclo (uma disciplina acabaria exigindo a si mesma)." };
    }
    let id = disciplina.disciplinaId;
    const rq = () => new sql.Request(t).input("c", sql.Int, disciplina.cursoId).input("n", sql.NVarChar(150), disciplina.nome).input("a", sql.NVarChar(14), disciplina.area)
      .input("ch", sql.Decimal(5, 1), disciplina.cargaHoraria).input("o", sql.Bit, disciplina.obrigatoria).input("at", sql.Bit, disciplina.ativa).input("e", sql.NVarChar(600), disciplina.ementa)
      .input("por", sql.Int, por);
    if (id) await rq().input("d", sql.Int, id).query(`UPDATE AFMDisciplinas SET Nome = @n, Area = @a, CargaHoraria = @ch, Obrigatoria = @o, Ativa = @at, Ementa = @e, AtualizadaPor = @por, AtualizadaEm = SYSUTCDATETIME() WHERE DisciplinaId = @d`);
    else id = (await rq().query(`INSERT INTO AFMDisciplinas (CursoId, Nome, Area, CargaHoraria, Obrigatoria, Ativa, Ementa, CriadaPor) OUTPUT INSERTED.DisciplinaId VALUES (@c, @n, @a, @ch, @o, @at, @e, @por)`)).recordset[0].DisciplinaId;
    await new sql.Request(t).input("d", sql.Int, id).query(`DELETE FROM AFMDisciplinaPreRequisitos WHERE DisciplinaId = @d`);
    for (const p of disciplina.preRequisitos) await new sql.Request(t).input("d", sql.Int, id).input("p", sql.Int, p).query(`INSERT INTO AFMDisciplinaPreRequisitos (DisciplinaId, PreRequisitoId) VALUES (@d, @p)`);
    return { sucesso: true, disciplinaId: id, antes };
  }).catch((e) => {
    if (require("./violacaoUnica").violouUnicidade(e)) return MUDOU("Já existe uma disciplina com esse nome neste curso.");
    throw e;
  });
  if (!r.sucesso) return r;
  await registrarAuditoria({ tabela: "AFMDisciplinas", registroId: r.disciplinaId, acao: r.antes ? "AFM_DISCIPLINA_ALTERADA" : "AFM_DISCIPLINA_CRIADA", usuarioId: por,
    dadosAntes: r.antes ? { nome: r.antes.Nome, area: r.antes.Area, cargaHoraria: Number(r.antes.CargaHoraria), obrigatoria: !!r.antes.Obrigatoria, ativa: !!r.antes.Ativa } : null, dadosDepois: disciplina });
  return { sucesso: true, disciplinaId: r.disciplinaId, mensagem: r.antes ? "Disciplina atualizada. As turmas já abertas seguem a carga do dia em que foram abertas." : "Disciplina cadastrada." };
}

// ---------------------------------------------------------------- o corpo docente em exercício (o docente da turma e o parecerista do aproveitamento)
// Em exercício na data (hoje, sem data): a linha começou e não terminou; o Reitor, também dentro do mandato (vencido o mandato sem recondução, a Reitoria fica vaga — v8.1).
async function docentesEmExercicio(conexao, { naData = null } = {}) {
  const r = await rqDe(conexao).input("d", sql.Date, naData || hojeBrasilia()).query(`SELECT cd.MembroId, MAX(m.Nome) AS Nome, MAX(CASE WHEN cd.Papel = N'REITOR' THEN 1 ELSE 0 END) AS Reitor
    FROM AFMCorpoDocente cd JOIN MembroReferencia m ON m.MembroId = cd.MembroId
    WHERE cd.DataInicio <= @d AND (cd.DataFim IS NULL OR cd.DataFim >= @d) AND (cd.Papel = N'DOCENTE' OR cd.MandatoAte >= @d)
    GROUP BY cd.MembroId ORDER BY MAX(m.Nome)`);
  return r.recordset.map((l) => ({ membroId: Number(l.MembroId), nome: l.Nome, reitor: !!l.Reitor }));
}
async function ehDocenteEmExercicio(conexao, membroId, naData = null) {
  return (await docentesEmExercicio(conexao, { naData })).some((d) => d.membroId === Number(membroId));
}

// ---------------------------------------------------------------- as turmas
const SELECT_TURMA = `SELECT t.TurmaId, t.DisciplinaId, d.Nome AS Disciplina, d.CursoId, c.Nivel, c.Nome AS Curso, d.Obrigatoria, t.DocenteMembroId, md.Nome AS Docente,
    CONVERT(varchar(10), t.DataInicio, 120) AS DataInicio, CONVERT(varchar(10), t.DataFim, 120) AS DataFim, t.Local, t.CargaHoraria, t.NotaMinima, t.FrequenciaMinimaPct,
    t.Situacao, CONVERT(varchar(10), t.EncerradaEm, 120) AS EncerradaEm, t.PrimeiroEncerramentoEm,
    (SELECT COUNT(*) FROM AFMTurmaAlunos x WHERE x.TurmaId = t.TurmaId AND x.Situacao = N'INSCRITO') AS Inscritos,
    (SELECT COUNT(*) FROM AFMTurmaAlunos x WHERE x.TurmaId = t.TurmaId AND x.Situacao = N'INSCRITO' AND x.Resultado IS NOT NULL) AS Lancados
  FROM AFMTurmas t JOIN AFMDisciplinas d ON d.DisciplinaId = t.DisciplinaId JOIN AFMCursos c ON c.CursoId = d.CursoId JOIN MembroReferencia md ON md.MembroId = t.DocenteMembroId`;
const mapaTurma = (l) => ({ turmaId: l.TurmaId, disciplinaId: l.DisciplinaId, disciplina: l.Disciplina, cursoId: l.CursoId, nivel: l.Nivel, curso: l.Curso, obrigatoria: !!l.Obrigatoria,
  docenteMembroId: Number(l.DocenteMembroId), docente: l.Docente, dataInicio: l.DataInicio, dataFim: l.DataFim, local: l.Local || null, cargaHoraria: Number(l.CargaHoraria),
  notaMinima: Number(l.NotaMinima), frequenciaMinimaPct: l.FrequenciaMinimaPct, horasMinimas: regra.horasMinimas({ cargaHoraria: Number(l.CargaHoraria), frequenciaMinimaPct: l.FrequenciaMinimaPct }),
  situacao: l.Situacao, encerradaEm: l.EncerradaEm || null, jaEncerrada: !!l.PrimeiroEncerramentoEm, inscritos: Number(l.Inscritos), lancados: Number(l.Lancados) });

async function cabecalhoTurma(conexao, turmaId) {
  const l = (await rqDe(conexao).input("t", sql.Int, Number(turmaId)).query(`${SELECT_TURMA} WHERE t.TurmaId = @t`)).recordset[0];
  return l ? mapaTurma(l) : null;
}

async function abrirTurma(pool, { turma, por }) {
  const d = (await pool.request().input("d", sql.Int, turma.disciplinaId).query(`SELECT d.Ativa, d.CargaHoraria, c.NotaMinima, c.FrequenciaMinimaPct
    FROM AFMDisciplinas d JOIN AFMCursos c ON c.CursoId = d.CursoId WHERE d.DisciplinaId = @d`)).recordset[0];
  if (!d) return { sucesso: false, mensagem: "Disciplina não encontrada." };
  if (!d.Ativa) return { sucesso: false, mensagem: "A disciplina está desativada." };
  if (!(await ehDocenteEmExercicio(pool, turma.docenteMembroId))) return { sucesso: false, mensagem: "O docente precisa estar em exercício no Corpo Docente da AFM (o Reitor ou um docente — cadastre em Reitor e docentes)." };
  const turmaId = (await pool.request().input("d", sql.Int, turma.disciplinaId).input("doc", sql.Int, turma.docenteMembroId).input("i", sql.Date, turma.dataInicio).input("f", sql.Date, turma.dataFim)
    .input("l", sql.NVarChar(150), turma.local).input("ch", sql.Decimal(5, 1), Number(d.CargaHoraria)).input("n", sql.Decimal(4, 2), Number(d.NotaMinima)).input("fr", sql.Int, d.FrequenciaMinimaPct)
    .input("por", sql.Int, por).query(`INSERT INTO AFMTurmas (DisciplinaId, DocenteMembroId, DataInicio, DataFim, Local, CargaHoraria, NotaMinima, FrequenciaMinimaPct, CriadaPor)
      OUTPUT INSERTED.TurmaId VALUES (@d, @doc, @i, @f, @l, @ch, @n, @fr, @por)`)).recordset[0].TurmaId;
  await registrarAuditoria({ tabela: "AFMTurmas", registroId: turmaId, acao: "AFM_TURMA_ABERTA", usuarioId: por, dadosDepois: turma });
  return { sucesso: true, turmaId, mensagem: "Turma aberta. Agora inscreva os alunos." };
}

async function excluirTurma(pool, { turmaId, por }) {
  const r = await comTravas(pool, [travaTurma(turmaId)], async (t) => {
    const tu = await cabecalhoTurma(naTransacao(t), turmaId);
    if (!tu) return NAO_EXISTE;
    if (tu.situacao !== "ABERTA" || tu.jaEncerrada) return { sucesso: false, mensagem: "A turma já foi encerrada (ela é parte do histórico): não se exclui." };
    const linhas = (await new sql.Request(t).input("t", sql.Int, Number(turmaId)).query(`SELECT COUNT(*) AS n FROM AFMTurmaAlunos WHERE TurmaId = @t`)).recordset[0].n;
    if (Number(linhas)) return { sucesso: false, mensagem: "A turma já teve aluno inscrito (mesmo cancelado, a inscrição fica no histórico): encerre-a em vez de excluir." };
    await new sql.Request(t).input("t", sql.Int, Number(turmaId)).query(`DELETE FROM AFMTurmas WHERE TurmaId = @t AND NOT EXISTS (SELECT 1 FROM AFMTurmaAlunos WHERE TurmaId = @t)`);
    return { sucesso: true, turma: tu };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "AFMTurmas", registroId: Number(turmaId), acao: "AFM_TURMA_EXCLUIDA", usuarioId: por, dadosAntes: { disciplinaId: r.turma.disciplinaId, docente: r.turma.docenteMembroId } });
  return r.sucesso ? { sucesso: true, mensagem: "Turma excluída." } : r;
}

// A turma com os alunos (o formulário do lançamento).
async function turmaComAlunos(pool, turmaId) {
  const tu = await cabecalhoTurma(pool, turmaId);
  if (!tu) return null;
  const al = (await pool.request().input("t", sql.Int, Number(turmaId)).query(`
    SELECT ta.MembroId, m.Nome, cg.Nome AS Congregacao, ta.Situacao, ta.Nota, ta.HorasPresentes, ta.Resultado, ta.MotivoCancelamento
    FROM AFMTurmaAlunos ta JOIN MembroReferencia m ON m.MembroId = ta.MembroId LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
    WHERE ta.TurmaId = @t ORDER BY ta.Situacao DESC, m.Nome`)).recordset;
  tu.alunos = al.map((l) => ({ membroId: Number(l.MembroId), nome: l.Nome, congregacao: l.Congregacao || null, situacao: l.Situacao, nota: num(l.Nota), horasPresentes: num(l.HorasPresentes),
    resultado: l.Resultado || null, resultadoRotulo: l.Resultado ? regra.RESULTADOS[l.Resultado] : null, motivoCancelamento: l.MotivoCancelamento || null }));
  return tu;
}

// Inscreve várias pessoas (uma a uma: a que falhar não leva as outras). Sob a trava da turma e de cada pessoa.
async function inscrever(pool, { turmaId, membroIds, por }) {
  const resultados = [];
  for (const bruto of membroIds) {
    const membroId = regra.idValido(bruto);
    if (!membroId) { resultados.push({ membroId: null, sucesso: false, mensagem: "Matrícula inválida." }); continue; }
    if (membroId === Number(por)) { resultados.push({ membroId, sucesso: false, mensagem: "Ninguém inscreve a si mesmo (outra pessoa da Academia faz a inscrição)." }); continue; }
    const r = await comTravas(pool, [travaTurma(turmaId), travaPessoa(membroId)], async (t) => {
      const tu = await cabecalhoTurma(naTransacao(t), turmaId);
      if (!tu) return NAO_EXISTE;
      if (tu.situacao !== "ABERTA") return { sucesso: false, mensagem: "A turma está encerrada." };
      const afmAtiva = await matriculaAFMAtiva(naTransacao(t), membroId);
      if (afmAtiva && !afmAtiva.ativa) return { sucesso: false, mensagem: "Sem a matrícula ativa na AFM (desmatriculado ou fora do rol): não se inscreve." };
      if (membroId === tu.docenteMembroId) return { sucesso: false, mensagem: "O docente não é aluno da própria turma." };
      const p = (await new sql.Request(t).input("m", sql.Int, membroId).query(`SELECT Status FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
      if (!p) return { sucesso: false, mensagem: "Matrícula não encontrada." };
      if (p.Status !== "ATIVO") return { sucesso: false, mensagem: "Só membro ativo se inscreve." };
      const mc = (await new sql.Request(t).input("m", sql.Int, membroId).input("c", sql.Int, tu.cursoId).query(`SELECT Situacao FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c AND Situacao <> N'CANCELADA'`)).recordset[0];
      if (!mc) return { sucesso: false, mensagem: `Não está matriculado(a) no ${tu.curso}: faça a matrícula no curso antes.` };
      if (mc.Situacao !== "CURSANDO") return { sucesso: false, mensagem: `Já concluiu o ${tu.curso}.` };
      const est = (await estados(naTransacao(t), [membroId])).get(membroId) || new Map();
      if ((est.get(tu.disciplinaId) || {}).cumprida) return { sucesso: false, mensagem: "Já foi aprovado(a) nesta disciplina (ou a aproveitou)." };
      const outra = (await new sql.Request(t).input("m", sql.Int, membroId).input("d", sql.Int, tu.disciplinaId).input("t", sql.Int, tu.turmaId).query(`
        SELECT TOP 1 1 AS x FROM AFMTurmaAlunos ta JOIN AFMTurmas tt ON tt.TurmaId = ta.TurmaId
        WHERE ta.MembroId = @m AND tt.DisciplinaId = @d AND tt.Situacao = N'ABERTA' AND ta.Situacao = N'INSCRITO' AND tt.TurmaId <> @t`)).recordset.length;
      if (outra) return { sucesso: false, mensagem: "Já está inscrito(a) em outra turma aberta desta disciplina." };
      const pre = (await new sql.Request(t).input("d", sql.Int, tu.disciplinaId).query(`SELECT p.PreRequisitoId, d.Nome FROM AFMDisciplinaPreRequisitos p JOIN AFMDisciplinas d ON d.DisciplinaId = p.PreRequisitoId WHERE p.DisciplinaId = @d`)).recordset;
      const faltam = pre.filter((x) => !(est.get(x.PreRequisitoId) || {}).cumprida).map((x) => x.Nome);
      if (faltam.length) return { sucesso: false, mensagem: `Falta o pré-requisito: ${faltam.join(", ")}.` };
      const ja = (await new sql.Request(t).input("t", sql.Int, tu.turmaId).input("m", sql.Int, membroId).query(`SELECT Situacao FROM AFMTurmaAlunos WHERE TurmaId = @t AND MembroId = @m`)).recordset[0];
      if (ja && ja.Situacao === "INSCRITO") return { sucesso: false, mensagem: "Já está inscrito(a) nesta turma." };
      if (ja) await new sql.Request(t).input("t", sql.Int, tu.turmaId).input("m", sql.Int, membroId).input("por", sql.Int, por)
        .query(`UPDATE AFMTurmaAlunos SET Situacao = N'INSCRITO', CanceladoEm = NULL, MotivoCancelamento = NULL, InscritoPor = @por, InscritoEm = SYSUTCDATETIME() WHERE TurmaId = @t AND MembroId = @m`);
      else await new sql.Request(t).input("t", sql.Int, tu.turmaId).input("m", sql.Int, membroId).input("por", sql.Int, por).query(`INSERT INTO AFMTurmaAlunos (TurmaId, MembroId, InscritoPor) VALUES (@t, @m, @por)`);
      return { sucesso: true };
    });
    if (r.naoExiste) return NAO_EXISTE;
    if (r.sucesso) await registrarAuditoria({ tabela: "AFMTurmaAlunos", registroId: Number(turmaId), acao: "AFM_TURMA_INSCRICAO", usuarioId: por, dadosDepois: { turmaId: Number(turmaId), membroId } });
    resultados.push({ membroId, sucesso: !!r.sucesso, mensagem: r.mensagem });
  }
  const ok = resultados.filter((x) => x.sucesso).length;
  return { sucesso: ok > 0, resultados, mensagem: ok === resultados.length ? `${ok} inscrição(ões) feita(s).` : `${ok} de ${resultados.length} inscrita(s). Veja as que não passaram.` };
}

async function cancelarInscricao(pool, { turmaId, membroId, motivo, por }) {
  if (Number(membroId) === Number(por)) return { sucesso: false, mensagem: "Ninguém cancela a própria inscrição por aqui (fale com outra pessoa da Academia)." };
  const r = await comTravas(pool, [travaTurma(turmaId), travaPessoa(membroId)], async (t) => {
    const tu = await cabecalhoTurma(naTransacao(t), turmaId);
    if (!tu) return NAO_EXISTE;
    if (tu.situacao !== "ABERTA") return { sucesso: false, mensagem: "A turma está encerrada: a inscrição faz parte do histórico." };
    // reabrir e cancelar não apaga um resultado que já valeu (nem a aprovação que concluiu um curso, nem uma reprovação): corrige-se a nota, com a auditoria
    const comNota = (await new sql.Request(t).input("t", sql.Int, Number(turmaId)).input("m", sql.Int, Number(membroId)).query(`SELECT Resultado FROM AFMTurmaAlunos WHERE TurmaId = @t AND MembroId = @m AND Situacao = N'INSCRITO'`)).recordset[0];
    if (tu.jaEncerrada && comNota && comNota.Resultado) return { sucesso: false, mensagem: "A turma já foi encerrada uma vez e esta inscrição tem nota: é histórico (corrija a nota, se for o caso)." };
    const u = await new sql.Request(t).input("t", sql.Int, Number(turmaId)).input("m", sql.Int, Number(membroId)).input("mo", sql.NVarChar(300), motivo)
      .query(`UPDATE AFMTurmaAlunos SET Situacao = N'CANCELADO', CanceladoEm = SYSUTCDATETIME(), MotivoCancelamento = @mo, Nota = NULL, HorasPresentes = NULL, Resultado = NULL, LancadoPor = NULL, LancadoEm = NULL
              WHERE TurmaId = @t AND MembroId = @m AND Situacao = N'INSCRITO'`);
    if (!u.rowsAffected[0]) return NAO_EXISTE;
    return { sucesso: true };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "AFMTurmaAlunos", registroId: Number(turmaId), acao: "AFM_TURMA_INSCRICAO_CANCELADA", usuarioId: por, dadosDepois: { membroId: Number(membroId), motivo } });
  return r.sucesso ? { sucesso: true, mensagem: "Inscrição cancelada." } : r;
}

// A nota e as horas de vários alunos (a que falhar não leva as outras). Ninguém lança a própria nota. A nota de quem já concluiu o curso com esta disciplina obrigatória
// não pode deixar de ser "aprovado" (anule a conclusão antes) — conferido sob a trava da pessoa.
async function lancarNotas(pool, { turmaId, itens, por, hojeIso = hojeBrasilia() }) {
  const pre = await cabecalhoTurma(pool, turmaId);
  if (!pre) return NAO_EXISTE;
  if (pre.dataInicio > hojeIso) return { sucesso: false, mensagem: "A turma ainda não começou: a nota se lança depois do início." };
  const resultados = [];
  for (const item of itens) {
    const membroId = regra.idValido(item && item.membroId);
    if (!membroId) { resultados.push({ membroId: null, sucesso: false, mensagem: "Matrícula inválida." }); continue; }
    if (membroId === Number(por)) { resultados.push({ membroId, sucesso: false, mensagem: "Ninguém lança a própria nota." }); continue; }
    const v = regra.validarLancamento(item, pre);
    if (!v.valido) { resultados.push({ membroId, sucesso: false, mensagem: v.mensagem }); continue; }
    const r = await comTravas(pool, [travaTurma(turmaId), travaPessoa(membroId)], async (t) => {
      const tu = await cabecalhoTurma(naTransacao(t), turmaId);
      if (!tu) return NAO_EXISTE;
      if (tu.situacao !== "ABERTA") return { sucesso: false, mensagem: "A turma está encerrada: só o nível geral reabre (com o motivo)." };
      const a = (await new sql.Request(t).input("t", sql.Int, tu.turmaId).input("m", sql.Int, membroId).query(`SELECT Situacao, Resultado, Nota, HorasPresentes FROM AFMTurmaAlunos WHERE TurmaId = @t AND MembroId = @m`)).recordset[0];
      if (!a || a.Situacao !== "INSCRITO") return { sucesso: false, mensagem: "Não está inscrito(a) nesta turma." };
      if (a.Resultado === "APROVADO" && v.lancamento.resultado !== "APROVADO") {
        const concl = (await new sql.Request(t).input("m", sql.Int, membroId).input("c", sql.Int, tu.cursoId).query(`SELECT 1 AS x FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c AND Situacao = N'CONCLUIDO'`)).recordset.length;
        if (concl) return { sucesso: false, mensagem: `Já concluiu o ${tu.curso} com esta disciplina: anule a conclusão antes de mudar o resultado.` };
      }
      await new sql.Request(t).input("t", sql.Int, tu.turmaId).input("m", sql.Int, membroId).input("n", sql.Decimal(4, 2), v.lancamento.nota).input("h", sql.Decimal(5, 1), v.lancamento.horasPresentes)
        .input("r", sql.NVarChar(16), v.lancamento.resultado).input("por", sql.Int, por)
        .query(`UPDATE AFMTurmaAlunos SET Nota = @n, HorasPresentes = @h, Resultado = @r, LancadoPor = @por, LancadoEm = SYSUTCDATETIME() WHERE TurmaId = @t AND MembroId = @m AND Situacao = N'INSCRITO'`);
      return { sucesso: true, antes: a.Resultado ? { resultado: a.Resultado, nota: num(a.Nota), horas: num(a.HorasPresentes) } : null };
    });
    if (r.sucesso) await registrarAuditoria({ tabela: "AFMTurmaAlunos", registroId: Number(turmaId), acao: "AFM_NOTA_LANCADA", usuarioId: por, dadosAntes: r.antes, dadosDepois: { membroId, ...v.lancamento } });
    resultados.push({ membroId, sucesso: !!r.sucesso, mensagem: r.naoExiste ? "Turma não encontrada." : r.mensagem, resultado: r.sucesso ? v.lancamento.resultado : undefined });
  }
  const ok = resultados.filter((x) => x.sucesso).length;
  return { sucesso: ok > 0, resultados, mensagem: ok === resultados.length ? `${ok} nota(s) lançada(s).` : `${ok} de ${resultados.length} lançada(s). Veja as que não passaram.` };
}

async function encerrarTurma(pool, { turmaId, por, hojeIso = hojeBrasilia() }) {
  const r = await comTravas(pool, [travaTurma(turmaId)], async (t) => {
    const tu = await cabecalhoTurma(naTransacao(t), turmaId);
    if (!tu) return NAO_EXISTE;
    if (tu.situacao !== "ABERTA") return MUDOU("A turma já está encerrada.");
    if (tu.dataInicio > hojeIso) return { sucesso: false, mensagem: "A turma ainda não começou." };
    if (!tu.inscritos) return { sucesso: false, mensagem: "A turma não tem aluno inscrito: exclua-a em vez de encerrar." };
    if (tu.lancados < tu.inscritos) return { sucesso: false, mensagem: `Falta lançar a nota de ${tu.inscritos - tu.lancados} aluno(s) (ou cancelar a inscrição de quem desistiu).` };
    await new sql.Request(t).input("t", sql.Int, tu.turmaId).input("h", sql.Date, hojeIso).input("por", sql.Int, por)
      .query(`UPDATE AFMTurmas SET Situacao = N'ENCERRADA', EncerradaEm = @h, EncerradaPor = @por, PrimeiroEncerramentoEm = ISNULL(PrimeiroEncerramentoEm, @h) WHERE TurmaId = @t AND Situacao = N'ABERTA'`);
    return { sucesso: true };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "AFMTurmas", registroId: Number(turmaId), acao: "AFM_TURMA_ENCERRADA", usuarioId: por, dadosDepois: { encerradaEm: hojeIso } });
  return r.sucesso ? { sucesso: true, mensagem: "Turma encerrada: as notas passam a valer no histórico." } : r;
}

async function reabrirTurma(pool, { turmaId, motivo, por }) {
  const r = await comTravas(pool, [travaTurma(turmaId)], async (t) => {
    const tu = await cabecalhoTurma(naTransacao(t), turmaId);
    if (!tu) return NAO_EXISTE;
    if (tu.situacao !== "ENCERRADA") return MUDOU("A turma já está aberta.");
    if ((await new sql.Request(t).input("t", sql.Int, tu.turmaId).input("m", sql.Int, Number(por)).query(`SELECT 1 AS x FROM AFMTurmaAlunos WHERE TurmaId = @t AND MembroId = @m AND Situacao = N'INSCRITO'`)).recordset.length) {
      return { sucesso: false, mensagem: "Você é aluno desta turma: outra pessoa da Academia a reabre." };
    }
    const duplo = (await new sql.Request(t).input("t", sql.Int, tu.turmaId).input("d", sql.Int, tu.disciplinaId).query(`
      SELECT TOP 5 m.Nome FROM AFMTurmaAlunos a JOIN AFMTurmaAlunos b ON b.MembroId = a.MembroId AND b.Situacao = N'INSCRITO'
      JOIN AFMTurmas tb ON tb.TurmaId = b.TurmaId AND tb.TurmaId <> @t AND tb.DisciplinaId = @d AND tb.Situacao = N'ABERTA'
      JOIN MembroReferencia m ON m.MembroId = a.MembroId WHERE a.TurmaId = @t AND a.Situacao = N'INSCRITO'`)).recordset;
    if (duplo.length) return { sucesso: false, mensagem: `Reabrir deixaria em duas turmas abertas da mesma disciplina: ${duplo.map((x) => x.Nome).join(", ")}. Resolva a outra turma antes.` };
    await new sql.Request(t).input("t", sql.Int, tu.turmaId).query(`UPDATE AFMTurmas SET Situacao = N'ABERTA', EncerradaEm = NULL, EncerradaPor = NULL WHERE TurmaId = @t AND Situacao = N'ENCERRADA'`);
    return { sucesso: true, encerradaEm: tu.encerradaEm };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "AFMTurmas", registroId: Number(turmaId), acao: "AFM_TURMA_REABERTA", usuarioId: por, dadosAntes: { encerradaEm: r.encerradaEm }, dadosDepois: { motivo } });
  return r.sucesso ? { sucesso: true, mensagem: "Turma reaberta: enquanto estiver aberta, as notas dela não valem no histórico. Corrija e encerre de novo." } : r;
}

// ---------------------------------------------------------------- a matrícula no curso
// A pessoa precisa da matrícula ATIVA na AFM: o oficial em atividade (a matrícula é automática — sem linha, conta como ativa) ou o candidato matriculado (v8.2).
async function matriculaAFMAtiva(conexao, membroId) {
  const l = (await rqDe(conexao).input("m", sql.Int, Number(membroId)).query(`SELECT m.Status, m.CargoMinisterial,
    (SELECT TOP 1 a.StatusMatricula FROM Matriculas_AFM a WHERE a.MembroId = m.MembroId ORDER BY a.MatriculaId DESC) AS StatusMatricula
    FROM MembroReferencia m WHERE m.MembroId = @m`)).recordset[0];
  if (!l) return null;
  const oficial = l.Status === "ATIVO" && afm.CARGOS_OFICIAIS.includes(l.CargoMinisterial);
  return { existe: true, ativa: l.Status === "ATIVO" && (l.StatusMatricula ? l.StatusMatricula === "ATIVA" : oficial) };
}

async function matricularNoCurso(pool, { membroId, cursoId, data, por, hojeIso = hojeBrasilia() }) {
  if (Number(membroId) === Number(por)) return { sucesso: false, mensagem: "Ninguém registra a própria matrícula no curso." };
  if (!regra.dataValida(data) || data > hojeIso || data < "2020-01-01") return { sucesso: false, mensagem: "Informe a data da matrícula (até hoje)." };
  const r = await comTravas(pool, [travaPessoa(membroId)], async (t) => {
    const c = (await new sql.Request(t).input("c", sql.Int, Number(cursoId)).query(`SELECT Nome FROM AFMCursos WHERE CursoId = @c`)).recordset[0];
    if (!c) return { sucesso: false, mensagem: "Curso não encontrado." };
    const a = await matriculaAFMAtiva(naTransacao(t), membroId);
    if (!a) return NAO_EXISTE;
    if (!a.ativa) return { sucesso: false, mensagem: "Só quem tem a matrícula ativa na AFM (o oficial, ou o candidato matriculado em Escada e veto) se matricula num curso." };
    const ja = (await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("c", sql.Int, Number(cursoId)).query(`SELECT Situacao FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c AND Situacao <> N'CANCELADA'`)).recordset[0];
    if (ja) return MUDOU(ja.Situacao === "CONCLUIDO" ? `Já concluiu o ${c.Nome}.` : `Já está matriculado(a) no ${c.Nome}.`);
    const id = (await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("c", sql.Int, Number(cursoId)).input("d", sql.Date, data).input("por", sql.Int, por)
      .query(`INSERT INTO AFMCursoMatriculas (CursoId, MembroId, DataInicio, CriadaPor) OUTPUT INSERTED.CursoMatriculaId VALUES (@c, @m, @d, @por)`)).recordset[0].CursoMatriculaId;
    return { sucesso: true, cursoMatriculaId: id, curso: c.Nome };
  });
  if (!r.sucesso) return r;
  await registrarAuditoria({ tabela: "AFMCursoMatriculas", registroId: r.cursoMatriculaId, acao: "AFM_CURSO_MATRICULA", usuarioId: por, dadosDepois: { membroId: Number(membroId), cursoId: Number(cursoId), data } });
  return { sucesso: true, cursoMatriculaId: r.cursoMatriculaId, mensagem: `Matriculado(a) no ${r.curso}.` };
}

async function linhaCursoMatricula(conexao, cursoMatriculaId) {
  const l = (await rqDe(conexao).input("id", sql.Int, Number(cursoMatriculaId)).query(`SELECT m.CursoMatriculaId, m.CursoId, m.MembroId, m.Situacao, CONVERT(varchar(10), m.DataInicio, 120) AS DataInicio,
    CONVERT(varchar(10), m.DataConclusao, 120) AS DataConclusao, m.DiplomaCertificadoId, c.Nome AS Curso, c.Nivel FROM AFMCursoMatriculas m JOIN AFMCursos c ON c.CursoId = m.CursoId WHERE m.CursoMatriculaId = @id`)).recordset[0];
  return l || null;
}

async function cancelarCursoMatricula(pool, { cursoMatriculaId, motivo, por, hojeIso = hojeBrasilia() }) {
  const pre = await linhaCursoMatricula(pool, cursoMatriculaId);
  if (!pre) return NAO_EXISTE;
  if (Number(pre.MembroId) === Number(por)) return { sucesso: false, mensagem: "Ninguém cancela a própria matrícula no curso por aqui (fale com a Academia)." };
  const r = await comTravas(pool, [travaPessoa(pre.MembroId)], async (t) => {
    const m = await linhaCursoMatricula(naTransacao(t), cursoMatriculaId);
    if (m.Situacao === "CONCLUIDO") return { sucesso: false, mensagem: "O curso foi concluído: anule a conclusão antes (com o motivo)." };
    if (m.Situacao !== "CURSANDO") return MUDOU("A matrícula já está cancelada.");
    const abertas = (await new sql.Request(t).input("m", sql.Int, m.MembroId).input("c", sql.Int, m.CursoId).query(`SELECT d.Nome FROM AFMTurmaAlunos ta JOIN AFMTurmas tt ON tt.TurmaId = ta.TurmaId
      JOIN AFMDisciplinas d ON d.DisciplinaId = tt.DisciplinaId WHERE ta.MembroId = @m AND d.CursoId = @c AND tt.Situacao = N'ABERTA' AND ta.Situacao = N'INSCRITO'`)).recordset;
    if (abertas.length) return { sucesso: false, mensagem: `Está inscrito(a) em turma aberta deste curso (${abertas.map((x) => x.Nome).join(", ")}): cancele a inscrição antes.` };
    await new sql.Request(t).input("id", sql.Int, m.CursoMatriculaId).input("h", sql.Date, hojeIso).input("mo", sql.NVarChar(300), motivo)
      .query(`UPDATE AFMCursoMatriculas SET Situacao = N'CANCELADA', CanceladaEm = @h, MotivoCancelamento = @mo WHERE CursoMatriculaId = @id AND Situacao = N'CURSANDO'`);
    await new sql.Request(t).input("id", sql.Int, m.CursoMatriculaId).input("por", sql.Int, por).query(`UPDATE ce SET RevogadoEm = SYSUTCDATETIME(), MotivoRevogacao = N'Matrícula no curso cancelada.', RevogadoPorMembroId = @por
      FROM CertificadosEmitidos ce JOIN AFMDocumentosAcademicos da ON da.CertificadoId = ce.CertificadoId WHERE da.CursoMatriculaId = @id AND ce.Natureza = N'DECLARACAO' AND ce.RevogadoEm IS NULL`);
    return { sucesso: true };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "AFMCursoMatriculas", registroId: Number(cursoMatriculaId), acao: "AFM_CURSO_MATRICULA_CANCELADA", usuarioId: por, dadosAntes: { situacao: "CURSANDO" }, dadosDepois: { situacao: "CANCELADA", motivo } });
  return r.sucesso ? { sucesso: true, mensagem: "Matrícula no curso cancelada. As disciplinas aprovadas continuam valendo numa matrícula nova." } : r;
}

// ---------------------------------------------------------------- a conclusão e o diploma
async function concluirCurso(pool, { cursoMatriculaId, data, por, hojeIso = hojeBrasilia() }) {
  const pre = await linhaCursoMatricula(pool, cursoMatriculaId);
  if (!pre) return NAO_EXISTE;
  if (Number(pre.MembroId) === Number(por)) return { sucesso: false, mensagem: "Ninguém registra a conclusão do próprio curso." };
  if (!regra.dataValida(data) || data > hojeIso) return { sucesso: false, mensagem: "Informe a data da conclusão (até hoje)." };
  const r = await comTravas(pool, [travaPessoa(pre.MembroId)], async (t) => {
    const m = await linhaCursoMatricula(naTransacao(t), cursoMatriculaId);
    if (m.Situacao !== "CURSANDO") return MUDOU(m.Situacao === "CONCLUIDO" ? "O curso já foi concluído." : "A matrícula no curso está cancelada.");
    if (data < m.DataInicio) return { sucesso: false, mensagem: "A conclusão não pode ser antes da matrícula no curso." };
    const ativo = (await new sql.Request(t).input("m", sql.Int, Number(m.MembroId)).query(`SELECT Status FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
    if (!ativo || ativo.Status !== "ATIVO") return { sucesso: false, mensagem: "A pessoa não está no rol de membros ativos: o diploma não se emite." };
    const { cursos } = await curriculo(naTransacao(t));
    const curso = cursos.find((c) => c.cursoId === m.CursoId);
    const est = (await estados(naTransacao(t), [m.MembroId])).get(Number(m.MembroId)) || new Map();
    const av = regra.avaliarConclusao(curso.disciplinas, est);
    if (av.semObrigatorias) return { sucesso: false, mensagem: "O curso ainda não tem disciplina obrigatória cadastrada." };
    if (!av.completo) return { sucesso: false, mensagem: `Faltam disciplinas obrigatórias: ${av.faltam.join(", ")}.` };
    const ultima = curso.disciplinas.filter((d) => d.obrigatoria && d.ativa).map((d) => (est.get(d.disciplinaId) || {}).data).filter(Boolean).sort().pop();
    if (ultima && data < ultima) return { sucesso: false, mensagem: `A conclusão não pode ser antes da última obrigatória cumprida (${ultima.split("-").reverse().join("/")}).` };
    const cumpridas = curso.disciplinas.filter((d) => (est.get(d.disciplinaId) || {}).cumprida).length;
    const diploma = await certificados.emitirCertificado(naTransacao(t), { membroId: Number(m.MembroId), titulo: `Diploma — ${m.Curso}`.slice(0, 150),
      descricao: regra.descricaoDiploma({ curso: m.Curso, dataConclusao: data, cargaCumprida: av.cargaCumprida, disciplinas: cumpridas }), emitidoPorMembroId: por, natureza: "DIPLOMA_AFM", auditar: false });
    if (!diploma.sucesso) throw new Error(`diploma não emitido: ${diploma.mensagem}`);
    await new sql.Request(t).input("id", sql.Int, m.CursoMatriculaId).input("d", sql.Date, data).input("cert", sql.Int, diploma.certificadoId)
      .query(`UPDATE AFMCursoMatriculas SET Situacao = N'CONCLUIDO', DataConclusao = @d, DiplomaCertificadoId = @cert WHERE CursoMatriculaId = @id AND Situacao = N'CURSANDO'`);
    return { sucesso: true, certificadoId: diploma.certificadoId, codigo: diploma.codigoVerificacao, curso: m.Curso, carga: av.cargaCumprida };
  });
  if (!r.sucesso) return r;
  await registrarAuditoria({ tabela: "AFMCursoMatriculas", registroId: Number(cursoMatriculaId), acao: "AFM_CURSO_CONCLUIDO", usuarioId: por, dadosDepois: { data, certificadoId: r.certificadoId, cargaCumprida: r.carga } });
  return { sucesso: true, certificadoId: r.certificadoId, codigoVerificacao: r.codigo, mensagem: `${r.curso} concluído. Diploma emitido (código ${r.codigo}).` };
}

async function anularConclusao(pool, { cursoMatriculaId, motivo, por }) {
  const pre = await linhaCursoMatricula(pool, cursoMatriculaId);
  if (!pre) return NAO_EXISTE;
  if (Number(pre.MembroId) === Number(por)) return { sucesso: false, mensagem: "Ninguém anula a conclusão do próprio curso." };
  const r = await comTravas(pool, [travaPessoa(pre.MembroId)], async (t) => {
    const m = await linhaCursoMatricula(naTransacao(t), cursoMatriculaId);
    if (m.Situacao !== "CONCLUIDO") return MUDOU("O curso não está concluído.");
    if (m.DiplomaCertificadoId) await new sql.Request(t).input("c", sql.Int, m.DiplomaCertificadoId).input("mo", sql.NVarChar(300), `Conclusão anulada: ${motivo}`.slice(0, 300)).input("por", sql.Int, por)
      .query(`UPDATE CertificadosEmitidos SET RevogadoEm = SYSUTCDATETIME(), MotivoRevogacao = @mo, RevogadoPorMembroId = @por WHERE CertificadoId = @c AND RevogadoEm IS NULL`);
    await new sql.Request(t).input("id", sql.Int, m.CursoMatriculaId)
      .query(`UPDATE AFMCursoMatriculas SET Situacao = N'CURSANDO', DataConclusao = NULL, DiplomaCertificadoId = NULL WHERE CursoMatriculaId = @id AND Situacao = N'CONCLUIDO'`);
    return { sucesso: true, dataConclusao: m.DataConclusao, certificadoId: m.DiplomaCertificadoId };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "AFMCursoMatriculas", registroId: Number(cursoMatriculaId), acao: "AFM_CURSO_CONCLUSAO_ANULADA", usuarioId: por,
    dadosAntes: { situacao: "CONCLUIDO", dataConclusao: r.dataConclusao, certificadoId: r.certificadoId }, dadosDepois: { situacao: "CURSANDO", motivo } });
  return r.sucesso ? { sucesso: true, mensagem: "Conclusão anulada: o diploma foi revogado e o curso voltou a \"cursando\"." } : r;
}

// ---------------------------------------------------------------- o aproveitamento
async function registrarAproveitamento(pool, { aproveitamento: a, por }) {
  if (a.membroId === Number(por)) return { sucesso: false, mensagem: "Ninguém registra o próprio aproveitamento." };
  const r = await comTravas(pool, [travaPessoa(a.membroId)], async (t) => {
    if (!(await new sql.Request(t).input("m", sql.Int, a.membroId).query(`SELECT 1 AS x FROM MembroReferencia WHERE MembroId = @m`)).recordset.length) return { sucesso: false, mensagem: "Matrícula do aluno não encontrada." };
    const d = (await new sql.Request(t).input("d", sql.Int, a.disciplinaId).query(`SELECT d.Ativa, d.Nome, d.CursoId FROM AFMDisciplinas d WHERE d.DisciplinaId = @d`)).recordset[0];
    if (!d) return { sucesso: false, mensagem: "Disciplina não encontrada." };
    if (!d.Ativa) return { sucesso: false, mensagem: "A disciplina está desativada." };
    if (!(await ehDocenteEmExercicio(naTransacao(t), a.pareceristaMembroId, a.dataParecer))) return { sucesso: false, mensagem: "Quem deu o parecer precisa estar no Corpo Docente da AFM (o Reitor ou um docente) na data do parecer." };
    if (a.decisao === "DEFERIDO") {
      const est = ((await estados(naTransacao(t), [a.membroId])).get(a.membroId) || new Map()).get(a.disciplinaId) || {};
      if (est.cumprida) return MUDOU("A disciplina já está cumprida (aprovada ou aproveitada).");
      if (est.cursando) return { sucesso: false, mensagem: "Está inscrito(a) numa turma aberta desta disciplina: cancele a inscrição antes de aproveitar." };
    }
    const id = (await new sql.Request(t).input("m", sql.Int, a.membroId).input("d", sql.Int, a.disciplinaId).input("i", sql.NVarChar(150), a.instituicao).input("do", sql.NVarChar(150), a.disciplinaOrigem)
      .input("ch", sql.Decimal(5, 1), a.cargaHorariaOrigem).input("ano", sql.Int, a.anoOrigem).input("no", sql.NVarChar(20), a.notaOrigem).input("de", sql.NVarChar(10), a.decisao)
      .input("pa", sql.NVarChar(600), a.parecer).input("pe", sql.Int, a.pareceristaMembroId).input("dp", sql.Date, a.dataParecer).input("por", sql.Int, por)
      .query(`INSERT INTO AFMAproveitamentos (MembroId, DisciplinaId, Instituicao, DisciplinaOrigem, CargaHorariaOrigem, AnoOrigem, NotaOrigem, Decisao, Parecer, PareceristaMembroId, DataParecer, RegistradoPor)
              OUTPUT INSERTED.AproveitamentoId VALUES (@m, @d, @i, @do, @ch, @ano, @no, @de, @pa, @pe, @dp, @por)`)).recordset[0].AproveitamentoId;
    return { sucesso: true, aproveitamentoId: id, disciplina: d.Nome };
  }).catch((e) => {
    if (require("./violacaoUnica").violouUnicidade(e)) return MUDOU("A disciplina acabou de ser aproveitada por outro registro.");
    throw e;
  });
  if (!r.sucesso) return r;
  // a auditoria guarda a decisão e de onde veio; o parecer fica na tabela
  await registrarAuditoria({ tabela: "AFMAproveitamentos", registroId: r.aproveitamentoId, acao: "AFM_APROVEITAMENTO", usuarioId: por,
    dadosDepois: { membroId: a.membroId, disciplinaId: a.disciplinaId, decisao: a.decisao, instituicao: a.instituicao, parecerista: a.pareceristaMembroId } });
  return { sucesso: true, aproveitamentoId: r.aproveitamentoId, mensagem: a.decisao === "DEFERIDO" ? `Aproveitamento deferido: "${r.disciplina}" conta como cumprida.` : "Aproveitamento indeferido (registrado com o parecer)." };
}

async function anularAproveitamento(pool, { aproveitamentoId, motivo, por }) {
  const pre = (await pool.request().input("id", sql.Int, Number(aproveitamentoId)).query(`SELECT MembroId FROM AFMAproveitamentos WHERE AproveitamentoId = @id`)).recordset[0];
  if (!pre) return NAO_EXISTE;
  if (Number(pre.MembroId) === Number(por)) return { sucesso: false, mensagem: "Ninguém anula o próprio aproveitamento." };
  const r = await comTravas(pool, [travaPessoa(pre.MembroId)], async (t) => {
    const a = (await new sql.Request(t).input("id", sql.Int, Number(aproveitamentoId)).query(`SELECT a.MembroId, a.Decisao, a.AnuladoEm, d.CursoId, c.Nome AS Curso FROM AFMAproveitamentos a
      JOIN AFMDisciplinas d ON d.DisciplinaId = a.DisciplinaId JOIN AFMCursos c ON c.CursoId = d.CursoId WHERE a.AproveitamentoId = @id`)).recordset[0];
    if (a.AnuladoEm) return MUDOU("O aproveitamento já foi anulado.");
    if (a.Decisao === "DEFERIDO") {
      const concl = (await new sql.Request(t).input("m", sql.Int, a.MembroId).input("c", sql.Int, a.CursoId).query(`SELECT 1 AS x FROM AFMCursoMatriculas WHERE MembroId = @m AND CursoId = @c AND Situacao = N'CONCLUIDO'`)).recordset.length;
      if (concl) return { sucesso: false, mensagem: `Já concluiu o ${a.Curso} com este aproveitamento: anule a conclusão antes.` };
    }
    await new sql.Request(t).input("id", sql.Int, Number(aproveitamentoId)).input("mo", sql.NVarChar(300), motivo).input("por", sql.Int, por)
      .query(`UPDATE AFMAproveitamentos SET AnuladoEm = SYSUTCDATETIME(), MotivoAnulacao = @mo, AnuladoPor = @por WHERE AproveitamentoId = @id AND AnuladoEm IS NULL`);
    return { sucesso: true };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "AFMAproveitamentos", registroId: Number(aproveitamentoId), acao: "AFM_APROVEITAMENTO_ANULADO", usuarioId: por, dadosDepois: { motivo } });
  return r.sucesso ? { sucesso: true, mensagem: "Aproveitamento anulado." } : r;
}

// ---------------------------------------------------------------- o histórico escolar (o perfil, a minha, a ficha da Academia, Meus Dados)
async function historicoDe(conexao, membroId, { comParecer = false, comCodigos = true } = {}) {
  const id = Number(membroId);
  const { cursos, disciplinas } = await curriculo(conexao);
  const mats = (await rqDe(conexao).input("m", sql.Int, id).query(`SELECT m.CursoMatriculaId, m.CursoId, m.Situacao, CONVERT(varchar(10), m.DataInicio, 120) AS DataInicio,
    CONVERT(varchar(10), m.DataConclusao, 120) AS DataConclusao, CONVERT(varchar(10), m.CanceladaEm, 120) AS CanceladaEm, m.MotivoCancelamento, m.DiplomaCertificadoId, ce.CodigoVerificacao, ce.RevogadoEm
    FROM AFMCursoMatriculas m LEFT JOIN CertificadosEmitidos ce ON ce.CertificadoId = m.DiplomaCertificadoId WHERE m.MembroId = @m ORDER BY m.CursoMatriculaId`)).recordset;
  const tent = (await rqDe(conexao).input("m", sql.Int, id).query(`SELECT t.TurmaId, t.DisciplinaId, t.Situacao AS TurmaSituacao, CONVERT(varchar(10), t.DataInicio, 120) AS DataInicio,
    CONVERT(varchar(10), t.DataFim, 120) AS DataFim, CONVERT(varchar(10), t.EncerradaEm, 120) AS EncerradaEm, t.CargaHoraria, md.Nome AS Docente,
    ta.Situacao, ta.Nota, ta.HorasPresentes, ta.Resultado FROM AFMTurmaAlunos ta JOIN AFMTurmas t ON t.TurmaId = ta.TurmaId JOIN MembroReferencia md ON md.MembroId = t.DocenteMembroId
    WHERE ta.MembroId = @m ORDER BY t.DataInicio, t.TurmaId`)).recordset;
  const apr = (await rqDe(conexao).input("m", sql.Int, id).query(`SELECT a.AproveitamentoId, a.DisciplinaId, a.Instituicao, a.DisciplinaOrigem, a.CargaHorariaOrigem, a.AnoOrigem, a.NotaOrigem, a.Decisao,
    a.Parecer, mp.Nome AS Parecerista, CONVERT(varchar(10), a.DataParecer, 120) AS DataParecer, a.AnuladoEm, a.MotivoAnulacao
    FROM AFMAproveitamentos a JOIN MembroReferencia mp ON mp.MembroId = a.PareceristaMembroId WHERE a.MembroId = @m ORDER BY a.AproveitamentoId`)).recordset;
  const est = regra.estadoDasDisciplinas(
    tent.map((l) => ({ disciplinaId: l.DisciplinaId, turmaSituacao: l.TurmaSituacao, situacao: l.Situacao, resultado: l.Resultado, encerradaEm: l.EncerradaEm })),
    apr.map((l) => ({ disciplinaId: l.DisciplinaId, decisao: l.Decisao, anuladoEm: l.AnuladoEm, dataParecer: l.DataParecer })));
  const nomeDisc = (dId) => (disciplinas.get(dId) || {}).nome || "—";
  const cursoDaDisc = (dId) => cursos.find((c) => c.cursoId === (disciplinas.get(dId) || {}).cursoId) || null;
  const docs = (await rqDe(conexao).input("m", sql.Int, id).query(`SELECT CertificadoId, Natureza, Titulo, DataEmissao, CodigoVerificacao, CONVERT(varchar(10), ValidoAte, 120) AS ValidoAte, RevogadoEm
    FROM CertificadosEmitidos WHERE MembroId = @m AND Natureza IN (N'DIPLOMA_AFM', N'HISTORICO', N'DECLARACAO') ORDER BY CertificadoId DESC`)).recordset;
  return {
    cursos: mats.map((m) => {
      const curso = cursos.find((c) => c.cursoId === m.CursoId);
      const av = regra.avaliarConclusao(curso.disciplinas, est);
      return { cursoMatriculaId: m.CursoMatriculaId, cursoId: m.CursoId, nivel: curso.nivel, curso: curso.nome, situacao: m.Situacao, situacaoRotulo: regra.SITUACOES_CURSO[m.Situacao],
        dataInicio: m.DataInicio, dataConclusao: m.DataConclusao || null, canceladaEm: m.CanceladaEm || null, motivoCancelamento: m.MotivoCancelamento || null,
        diploma: m.DiplomaCertificadoId ? (comCodigos ? { certificadoId: m.DiplomaCertificadoId, codigo: m.CodigoVerificacao && !m.RevogadoEm ? certificados.formatarCodigo(m.CodigoVerificacao) : null } : { certificadoId: null, codigo: null }) : null,
        cargaCumprida: av.cargaCumprida, cargaObrigatoria: av.cargaObrigatoria, faltam: av.faltam, prontoParaConcluir: m.Situacao === "CURSANDO" && av.completo,
        disciplinas: curso.disciplinas.filter((d) => d.ativa || (est.get(d.disciplinaId) || {}).cumprida).map((d) => {
          const e = est.get(d.disciplinaId) || {};
          return { disciplinaId: d.disciplinaId, nome: d.nome, area: d.areaRotulo, cargaHoraria: d.cargaHoraria, obrigatoria: d.obrigatoria,
            estado: e.cumprida ? (e.fonte === "APROVEITAMENTO" ? "APROVEITADA" : "APROVADA") : e.cursando ? "CURSANDO" : "PENDENTE", data: e.data || null };
        }) };
    }),
    turmas: tent.map((l) => ({ turmaId: l.TurmaId, disciplinaId: l.DisciplinaId, disciplina: nomeDisc(l.DisciplinaId), curso: (cursoDaDisc(l.DisciplinaId) || {}).nome || "—",
      periodo: `${l.DataInicio} a ${l.DataFim}`, dataInicio: l.DataInicio, dataFim: l.DataFim, encerradaEm: l.EncerradaEm || null, turmaSituacao: l.TurmaSituacao, docente: l.Docente,
      cargaHoraria: Number(l.CargaHoraria), situacao: l.Situacao,
      // a nota só aparece da turma encerrada (a da aberta ainda pode mudar)
      nota: l.TurmaSituacao === "ENCERRADA" ? num(l.Nota) : null, horasPresentes: l.TurmaSituacao === "ENCERRADA" ? num(l.HorasPresentes) : null,
      frequenciaPct: l.TurmaSituacao === "ENCERRADA" && l.HorasPresentes != null ? Math.floor((Number(l.HorasPresentes) / Number(l.CargaHoraria)) * 1000) / 10 : null,
      resultado: l.TurmaSituacao === "ENCERRADA" ? l.Resultado || null : null, resultadoRotulo: l.TurmaSituacao === "ENCERRADA" && l.Resultado ? regra.RESULTADOS[l.Resultado] : null })),
    aproveitamentos: apr.map((l) => ({ aproveitamentoId: l.AproveitamentoId, disciplinaId: l.DisciplinaId, disciplina: nomeDisc(l.DisciplinaId), curso: (cursoDaDisc(l.DisciplinaId) || {}).nome || "—",
      instituicao: l.Instituicao, disciplinaOrigem: l.DisciplinaOrigem, cargaHorariaOrigem: Number(l.CargaHorariaOrigem), anoOrigem: l.AnoOrigem, notaOrigem: l.NotaOrigem || null,
      decisao: l.Decisao, decisaoRotulo: regra.DECISOES[l.Decisao], parecerista: l.Parecerista, dataParecer: l.DataParecer, parecer: comParecer ? l.Parecer : undefined,
      anulado: !!l.AnuladoEm, motivoAnulacao: comParecer ? l.MotivoAnulacao || null : undefined })),
    documentos: !comCodigos ? [] : docs.map((l) => ({ certificadoId: l.CertificadoId, natureza: l.Natureza, rotulo: ROTULO_NATUREZA[l.Natureza], titulo: l.Titulo, emitidoEm: dia(l.DataEmissao),
      validoAte: l.ValidoAte || null, revogado: !!l.RevogadoEm, codigo: l.CodigoVerificacao && !l.RevogadoEm ? certificados.formatarCodigo(l.CodigoVerificacao) : null }))
  };
}
const temHistorico = (h) => !!(h && (h.cursos.length || h.turmas.length || h.aproveitamentos.length));

// As turmas em que a pessoa leciona (Minha Formação). `emExercicio`: se ainda pode lançar (o docente que saiu do Corpo Docente só vê).
async function docenciaDe(pool, membroId) {
  const turmas = (await pool.request().input("m", sql.Int, Number(membroId)).query(`${SELECT_TURMA} WHERE t.DocenteMembroId = @m ORDER BY CASE WHEN t.Situacao = N'ABERTA' THEN 0 ELSE 1 END, t.DataInicio DESC`)).recordset.map(mapaTurma);
  return { emExercicio: turmas.length ? await ehDocenteEmExercicio(pool, membroId) : false, turmas: turmas.slice(0, 40) };
}

// ---------------------------------------------------------------- os documentos (declaração de matrícula e histórico escolar; o diploma sai na conclusão)
async function emitirDocumento(pool, { membroId, tipo, cursoMatriculaId = null, por, hojeIso = hojeBrasilia() }) {
  if (!regra.TIPOS_DOCUMENTO[tipo]) return { sucesso: false, mensagem: "Escolha o documento: declaração de matrícula ou histórico escolar." };
  const r = await comTravas(pool, [travaPessoa(membroId)], async (t) => {
    const cx = naTransacao(t);
    if (!(await new sql.Request(t).input("m", sql.Int, Number(membroId)).query(`SELECT 1 AS x FROM MembroReferencia WHERE MembroId = @m`)).recordset.length) return NAO_EXISTE;
    const h = await historicoDe(cx, membroId);
    let titulo; let descricao; let validoAte = null; let conteudo; let cmId = null;
    if (tipo === "DECLARACAO") {
      const c = h.cursos.find((x) => x.cursoMatriculaId === Number(cursoMatriculaId));
      if (!c) return { sucesso: false, mensagem: "Escolha a matrícula no curso." };
      if (c.situacao !== "CURSANDO") return { sucesso: false, mensagem: "A declaração de matrícula é de quem está cursando (o concluído tem o diploma)." };
      const afmAtiva = await matriculaAFMAtiva(cx, membroId);
      if (!afmAtiva || !afmAtiva.ativa) return { sucesso: false, mensagem: "Sem a matrícula ativa na AFM (desmatriculado ou fora do rol): a declaração de matrícula não se emite." };
      const abertas = h.turmas.filter((x) => x.turmaSituacao === "ABERTA" && x.situacao === "INSCRITO" && x.curso === c.curso).map((x) => x.disciplina);
      titulo = `Declaração de matrícula — ${c.curso}`.slice(0, 150);
      descricao = regra.descricaoDeclaracao({ curso: c.curso, dataInicio: c.dataInicio, hojeIso, turmas: abertas });
      validoAte = regra.somarDias(hojeIso, regra.DIAS_DECLARACAO);
      cmId = c.cursoMatriculaId;
      conteudo = { tipo, emitidoEm: hojeIso, curso: c.curso, nivel: c.nivel, dataInicio: c.dataInicio, turmas: abertas, cargaCumprida: c.cargaCumprida, cargaObrigatoria: c.cargaObrigatoria };
    } else {
      if (!temHistorico(h)) return { sucesso: false, mensagem: "Ainda não há histórico escolar na Academia." };
      const cumpridas = new Set(h.cursos.flatMap((c) => c.disciplinas.filter((d) => d.estado === "APROVADA" || d.estado === "APROVEITADA").map((d) => d.disciplinaId)));
      const carga = Math.round(h.cursos.reduce((s, c) => s + (c.situacao === "CANCELADA" ? 0 : c.cargaCumprida), 0) * 10) / 10;
      titulo = "Histórico escolar — Academia de Formação Ministerial";
      descricao = regra.descricaoHistorico({ hojeIso, cursos: h.cursos.filter((c) => c.situacao !== "CANCELADA").map((c) => `${c.curso} (${c.situacaoRotulo.toLowerCase()})`), disciplinasCumpridas: cumpridas.size, cargaCumprida: carga });
      // a fotografia do dia: só a turma encerrada e o aproveitamento valendo (o nome da pessoa vem do cadastro na impressão; o parecer não vai para o papel)
      conteudo = { tipo, emitidoEm: hojeIso,
        cursos: h.cursos.map((c) => ({ curso: c.curso, nivel: c.nivel, situacao: c.situacaoRotulo, inicio: c.dataInicio, conclusao: c.dataConclusao, cargaCumprida: c.cargaCumprida, cargaObrigatoria: c.cargaObrigatoria })),
        linhas: [
          ...h.turmas.filter((x) => x.turmaSituacao === "ENCERRADA" && x.situacao === "INSCRITO").map((x) => ({ curso: x.curso, disciplina: x.disciplina, cargaHoraria: x.cargaHoraria,
            periodo: `${x.dataInicio} a ${x.dataFim}`, nota: x.nota, frequenciaPct: x.frequenciaPct, resultado: x.resultadoRotulo })),
          ...h.aproveitamentos.filter((a) => a.decisao === "DEFERIDO" && !a.anulado).map((a) => {
            const d = h.cursos.flatMap((c) => c.disciplinas).find((x) => x.disciplinaId === a.disciplinaId);
            return { curso: a.curso, disciplina: a.disciplina, cargaHoraria: d ? d.cargaHoraria : null, periodo: `aproveitamento (${a.anoOrigem})`, nota: null, frequenciaPct: null,
              resultado: `Aproveitada — ${a.instituicao}` };
          })
        ] };
    }
    const texto = JSON.stringify(conteudo);
    const hash = sha256(texto);
    if (tipo === "HISTORICO") titulo = `Histórico escolar (AFM) — selo ${seloDoConteudo(hash)}`;   // o título entra no selo do certificado: mexer no conteúdo quebra a verificação
    // o mesmo documento, com o mesmo conteúdo, no mesmo dia: devolve o já emitido (o duplo clique não gera dois)
    const igual = (await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("n", sql.NVarChar(12), tipo).input("h", sql.Date, hojeIso).input("c", sql.NVarChar(sql.MAX), texto).query(`
      SELECT TOP 1 ce.CertificadoId, ce.CodigoVerificacao FROM CertificadosEmitidos ce JOIN AFMDocumentosAcademicos da ON da.CertificadoId = ce.CertificadoId
      WHERE ce.MembroId = @m AND ce.Natureza = @n AND ce.RevogadoEm IS NULL AND CONVERT(date, DATEADD(HOUR, -3, ce.DataEmissao)) = @h AND da.Conteudo = @c ORDER BY ce.CertificadoId DESC`)).recordset[0];
    if (igual) return { sucesso: true, certificadoId: igual.CertificadoId, codigo: certificados.formatarCodigo(igual.CodigoVerificacao), jaExistia: true };
    const emissao = await certificados.emitirCertificado(cx, { membroId: Number(membroId), titulo, descricao, emitidoPorMembroId: por, validoAte, natureza: tipo, auditar: false });
    if (!emissao.sucesso) throw new Error(`documento não emitido: ${emissao.mensagem}`);
    await new sql.Request(t).input("cert", sql.Int, emissao.certificadoId).input("cm", sql.Int, cmId).input("c", sql.NVarChar(sql.MAX), texto).input("h", sql.NVarChar(64), hash)
      .query(`INSERT INTO AFMDocumentosAcademicos (CertificadoId, CursoMatriculaId, Conteudo, ConteudoHash) VALUES (@cert, @cm, @c, @h)`);
    return { sucesso: true, certificadoId: emissao.certificadoId, codigo: emissao.codigoVerificacao };
  });
  if (!r.sucesso) return r;
  if (!r.jaExistia) await registrarAuditoria({ tabela: "CertificadosEmitidos", registroId: r.certificadoId, acao: "AFM_DOCUMENTO_EMITIDO", usuarioId: por, dadosDepois: { membroId: Number(membroId), tipo } });
  return { sucesso: true, certificadoId: r.certificadoId, codigoVerificacao: r.codigo, mensagem: `${regra.TIPOS_DOCUMENTO[tipo]} emitido(a) (código ${r.codigo}).` };
}

// A verificação pública do histórico escolar: a fotografia confere com o hash gravado e com o selo do título (que o selo do certificado cobre)? Devolve o resumo
// (os cursos e as disciplinas, com nota, frequência e resultado) — é o que a outra instituição precisa conferir — ou { ok:false } se não confere.
async function conferirHistoricoPublico(pool, certificado) {
  const l = (await pool.request().input("c", sql.Int, Number(certificado.certificadoId)).query(`SELECT Conteudo, ConteudoHash FROM AFMDocumentosAcademicos WHERE CertificadoId = @c`)).recordset[0];
  if (!l || !l.ConteudoHash) return { ok: false };
  const hash = sha256(l.Conteudo);
  if (hash !== l.ConteudoHash || !String(certificado.titulo || "").endsWith(`selo ${seloDoConteudo(hash)}`)) return { ok: false };
  let c;
  try { c = JSON.parse(l.Conteudo); } catch (e) { return { ok: false }; }
  return { ok: true, resumo: { cursos: (c.cursos || []).map((x) => ({ curso: x.curso, situacao: x.situacao, conclusao: x.conclusao || null })),
    disciplinas: (c.linhas || []).map((x) => ({ disciplina: x.disciplina, curso: x.curso, nota: x.nota, frequenciaPct: x.frequenciaPct, resultado: x.resultado })) } };
}

// A fotografia gravada de um documento acadêmico (o PDF do histórico e da declaração).
async function conteudoDoDocumento(pool, certificadoId) {
  const l = (await pool.request().input("c", sql.Int, Number(certificadoId)).query(`SELECT Conteudo FROM AFMDocumentosAcademicos WHERE CertificadoId = @c`)).recordset[0];
  if (!l) return null;
  try { return JSON.parse(l.Conteudo); } catch (e) { return null; }
}
// O Reitor em exercício no dia da emissão (o nome sobre a assinatura do diploma, da declaração e do histórico).
async function reitorEm(pool, naData) {
  const l = (await pool.request().input("d", sql.Date, naData).query(`SELECT TOP 1 m.Nome FROM AFMCorpoDocente cd JOIN MembroReferencia m ON m.MembroId = cd.MembroId
    WHERE cd.Papel = N'REITOR' AND cd.DataInicio <= @d AND (cd.DataFim IS NULL OR cd.DataFim >= @d) AND cd.MandatoAte >= @d ORDER BY cd.DataInicio DESC`)).recordset[0];
  return l ? l.Nome : null;
}

// ---------------------------------------------------------------- o painel da seção Seminário (nível geral)
async function painel(pool) {
  const { cursos } = await curriculo(pool);
  const turmas = (await pool.request().query(`${SELECT_TURMA} WHERE t.Situacao = N'ABERTA' OR t.EncerradaEm >= DATEADD(MONTH, -18, SYSUTCDATETIME())
    ORDER BY CASE WHEN t.Situacao = N'ABERTA' THEN 0 ELSE 1 END, t.DataInicio DESC, t.TurmaId DESC`)).recordset.map(mapaTurma).slice(0, 200);
  // quem está pronto para concluir: todas as obrigatórias cumpridas e o curso ainda "cursando"
  const cursando = (await pool.request().query(`SELECT m.CursoMatriculaId, m.MembroId, m.CursoId, mr.Nome FROM AFMCursoMatriculas m JOIN MembroReferencia mr ON mr.MembroId = m.MembroId WHERE m.Situacao = N'CURSANDO'`)).recordset;
  const est = await estados(pool, cursando.map((l) => l.MembroId));
  const prontos = cursando.map((l) => {
    const curso = cursos.find((c) => c.cursoId === l.CursoId);
    return { cursoMatriculaId: l.CursoMatriculaId, membroId: Number(l.MembroId), nome: l.Nome, curso: curso.nome, av: regra.avaliarConclusao(curso.disciplinas, est.get(Number(l.MembroId)) || new Map()) };
  }).filter((x) => x.av.completo).map(({ av, ...x }) => ({ ...x, cargaCumprida: av.cargaCumprida }));
  const contagem = (await pool.request().query(`SELECT CursoId, Situacao, COUNT(*) AS n FROM AFMCursoMatriculas GROUP BY CursoId, Situacao`)).recordset;
  for (const c of cursos) {
    c.cursando = Number((contagem.find((x) => x.CursoId === c.cursoId && x.Situacao === "CURSANDO") || {}).n || 0);
    c.concluidos = Number((contagem.find((x) => x.CursoId === c.cursoId && x.Situacao === "CONCLUIDO") || {}).n || 0);
  }
  const trilhas = require("./trilhas");
  return { cursos, turmas, prontos, docentes: await docentesEmExercicio(pool), requisitos: await listarRequisitos(pool),
    areas: regra.AREAS, resultados: regra.RESULTADOS, contextos: trilhas.ROTULO_CONTEXTO, contextosComAlvo: trilhas.CONTEXTOS_COM_ALVO };
}

// Meus Dados (LGPD): o histórico escolar inteiro (com o parecer do aproveitamento) e a docência.
async function dadosDoTitular(pool, membroId) {
  const tem = await pool.request().query(`SELECT OBJECT_ID(N'dbo.AFMCursoMatriculas', N'U') AS id`);
  if (!(tem && tem.recordset && tem.recordset[0] && tem.recordset[0].id)) return null;   // base sem a migração 163
  const h = await historicoDe(pool, membroId, { comParecer: true });
  const doc = await docenciaDe(pool, membroId);
  return { cursos: h.cursos.map(({ disciplinas, ...c }) => c), turmas: h.turmas, aproveitamentos: h.aproveitamentos, documentos: h.documentos,
    turmasComoDocente: doc.turmas.map((t) => ({ disciplina: t.disciplina, curso: t.curso, dataInicio: t.dataInicio, dataFim: t.dataFim, situacao: t.situacao })) };
}

module.exports = { NATUREZAS, ROTULO_NATUREZA, niveisHistorico, estados, listarRequisitos, avaliacoesDeRequisitos, criarRequisito, removerRequisito, curriculo, salvarCurso,
  salvarDisciplina, docentesEmExercicio, ehDocenteEmExercicio, cabecalhoTurma, abrirTurma, excluirTurma, turmaComAlunos, inscrever, cancelarInscricao, lancarNotas,
  encerrarTurma, reabrirTurma, matriculaAFMAtiva, matricularNoCurso, linhaCursoMatricula, cancelarCursoMatricula, concluirCurso, anularConclusao, registrarAproveitamento,
  anularAproveitamento, historicoDe, temHistorico, docenciaDe, emitirDocumento, conteudoDoDocumento, conferirHistoricoPublico, seloDoConteudo, reitorEm, painel, dadosDoTitular,
  CONTEXTOS_DISCIPLINA };
