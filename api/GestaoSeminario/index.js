// GestaoSeminario (v8.7 — o Seminário como sistema acadêmico; Regimento Art. 66, 68, 70 §2º e 72). Regra em shared/seminario.js; banco em shared/seminarioDb.js.
//  GET  minha                         (a própria pessoa)   o meu histórico escolar, os meus documentos e as turmas em que leciono
//  GET  pessoa?membroId=              ("pessoas" no território, ou o nível geral de "afm")  o histórico escolar de uma pessoa (o perfil)
//  GET  turma?turmaId=                (nível geral de "afm", ou o docente da turma)  a turma com os alunos
//  POST notas                         (nível geral de "afm", ou o docente em exercício da turma)  body:{turmaId, itens:[{membroId, nota, horasPresentes}]}
//  POST encerrar                      (idem)  body:{turmaId}
//  POST documento                     (a própria pessoa, ou o nível geral de "afm")  body:{tipo: DECLARACAO|HISTORICO, membroId?, cursoMatriculaId?}
//  GET  painel | aluno?membroId=      (nível geral de "afm")  o currículo, as turmas, quem está pronto para concluir, os docentes e os requisitos | a ficha do aluno
//  POST curso | disciplina | turma | excluir-turma | inscrever | cancelar-inscricao | reabrir | matricular-curso | cancelar-curso | concluir-curso | anular-conclusao
//       | aproveitamento | anular-aproveitamento | requisito | remover-requisito   (nível geral de "afm")
// Ninguém lança a própria nota nem registra o próprio percurso. Sem sessão: 401.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { exigirGeral, ehGeral, pessoaAlcancavel, carregarPessoa } = require("../shared/escopoRotas");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const regra = require("../shared/seminario");
const db = require("../shared/seminarioDb");

const LIMITE_ITENS = 500;
function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, "Não encontrado.");
  const status = resultado.sucesso ? statusOk : resultado.mudou ? 409 : 422;
  const { naoExiste, mudou, ...corpo } = resultado;
  context.res = { status, body: corpo };
}
const geralDaAfm = (usuario) => { const v = auth.visaoDaPermissao(usuario, "afm"); return !!v && ehGeral(v); };

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);   // a sessão antes de tudo: nem a ação desconhecida responde a quem não entrou
  if (!usuario) return;
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const query = req.query || {};
  const hojeIso = hojeBrasilia();

  // ---- a própria pessoa ----
  if (acao === "minha" && metodo === "GET") {
    const pool = await getPool();
    const h = await db.historicoDe(pool, usuario.membroId);
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { sucesso: true, ...h, docencia: await db.docenciaDe(pool, usuario.membroId) } };
    return;
  }
  if (acao === "documento" && metodo === "POST") {
    const alvo = corpo.membroId == null || corpo.membroId === "" ? Number(usuario.membroId) : regra.idValido(corpo.membroId);
    if (!alvo) return erro(context, 404, "Matrícula não encontrada.");
    // a própria pessoa emite os seus; de outra pessoa, só o nível geral da Academia (a mesma resposta para quem não pode e para quem não existe)
    if (alvo !== Number(usuario.membroId) && !geralDaAfm(usuario)) return erro(context, 404, "Matrícula não encontrada.");
    const pool = await getPool();
    return resposta(context, await db.emitirDocumento(pool, { membroId: alvo, tipo: corpo.tipo, cursoMatriculaId: regra.idValido(corpo.cursoMatriculaId), por: usuario.membroId, hojeIso }), 201);
  }
  if (acao === "pessoa" && metodo === "GET") {
    const u = auth.exigirAlgumaPermissao(req, context, ["pessoas", "afm"]);
    if (!u) return;
    const pool = await getPool();
    const visaoPessoas = auth.visaoDaPermissao(u, "pessoas");
    const p = geralDaAfm(u) ? await carregarPessoa(pool, query.membroId) : visaoPessoas ? await pessoaAlcancavel(pool, visaoPessoas, query.membroId) : null;
    if (!p) return erro(context, 404, "Matrícula não encontrada.");
    // o perfil não leva os códigos de verificação nem os documentos (são da própria pessoa e da Academia, como o CHM e o diploma na v8.3)
    context.res = { status: 200, body: { sucesso: true, ...(await db.historicoDe(pool, p.membroId, { comCodigos: false })) } };
    return;
  }

  // ---- a turma: o nível geral, ou o docente dela ----
  if ((acao === "turma" && metodo === "GET") || (["notas", "encerrar"].includes(acao) && metodo === "POST")) {
    const turmaId = regra.idValido(metodo === "GET" ? query.turmaId : corpo.turmaId);
    if (!turmaId) return erro(context, 404, "Turma não encontrada.");
    const pool = await getPool();
    const geral = geralDaAfm(usuario);
    const cab = await db.cabecalhoTurma(pool, turmaId);
    const docente = !!cab && cab.docenteMembroId === Number(usuario.membroId);
    // quem não é do nível geral nem o docente dela recebe o mesmo 404 da turma que não existe
    if (!cab || (!geral && !docente)) return erro(context, 404, "Turma não encontrada.");
    if (metodo === "GET") { context.res = { status: 200, body: { sucesso: true, turma: await db.turmaComAlunos(pool, turmaId) } }; return; }
    if (!geral && !(await db.ehDocenteEmExercicio(pool, usuario.membroId))) return erro(context, 403, "Você não está mais em exercício no Corpo Docente: a nota agora é lançada pela Academia.");
    if (acao === "encerrar") return resposta(context, await db.encerrarTurma(pool, { turmaId, por: usuario.membroId, hojeIso }));
    const itens = Array.isArray(corpo.itens) ? corpo.itens : null;
    if (!itens || !itens.length || itens.length > LIMITE_ITENS) return erro(context, 400, `Envie de 1 a ${LIMITE_ITENS} notas.`);
    return resposta(context, await db.lancarNotas(pool, { turmaId, itens, por: usuario.membroId, hojeIso }));
  }

  // ---- o resto é do nível geral da Academia ----
  const atosGet = ["painel", "aluno"];
  const atosPost = ["curso", "disciplina", "turma", "excluir-turma", "inscrever", "cancelar-inscricao", "reabrir", "matricular-curso", "cancelar-curso", "concluir-curso",
    "anular-conclusao", "aproveitamento", "anular-aproveitamento", "requisito", "remover-requisito"];
  if (!(metodo === "GET" ? atosGet : metodo === "POST" ? atosPost : []).includes(acao)) return erro(context, 404, "Ação inválida.");
  if (!exigirGeral(req, context, "afm")) return;
  const pool = await getPool();
  const por = usuario.membroId;

  if (metodo === "GET") {
    if (acao === "painel") { context.res = { status: 200, body: { sucesso: true, ...(await db.painel(pool)) } }; return; }
    const p = await carregarPessoa(pool, query.membroId);
    if (!p) return erro(context, 404, "Matrícula não encontrada.");
    const afmAtiva = await db.matriculaAFMAtiva(pool, p.membroId);
    context.res = { status: 200, body: { sucesso: true, membroId: p.membroId, nome: p.nome || null, matriculaAFMAtiva: !!(afmAtiva && afmAtiva.ativa), ...(await db.historicoDe(pool, p.membroId, { comParecer: true })) } };
    return;
  }

  const motivo = () => regra.textoMotivo(corpo.motivo);
  const SEM_MOTIVO = "Escreva o motivo (de 10 a 300 caracteres).";
  switch (acao) {
    case "curso": {
      const v = regra.validarCurso(corpo);
      return v.valido ? resposta(context, await db.salvarCurso(pool, { curso: v.curso, por })) : erro(context, 400, v.mensagem);
    }
    case "disciplina": {
      const v = regra.validarDisciplina(corpo);
      return v.valido ? resposta(context, await db.salvarDisciplina(pool, { disciplina: v.disciplina, por }), v.disciplina.disciplinaId ? 200 : 201) : erro(context, 400, v.mensagem);
    }
    case "turma": {
      const v = regra.validarTurma(corpo, hojeIso);
      return v.valido ? resposta(context, await db.abrirTurma(pool, { turma: v.turma, por }), 201) : erro(context, 400, v.mensagem);
    }
    case "excluir-turma": {
      const id = regra.idValido(corpo.turmaId);
      return id ? resposta(context, await db.excluirTurma(pool, { turmaId: id, por })) : erro(context, 404, "Turma não encontrada.");
    }
    case "inscrever": {
      const id = regra.idValido(corpo.turmaId);
      if (!id) return erro(context, 404, "Turma não encontrada.");
      const ids = Array.isArray(corpo.membroIds) ? corpo.membroIds : null;
      if (!ids || !ids.length || ids.length > LIMITE_ITENS) return erro(context, 400, `Envie de 1 a ${LIMITE_ITENS} matrículas.`);
      return resposta(context, await db.inscrever(pool, { turmaId: id, membroIds: ids, por }));
    }
    case "cancelar-inscricao": {
      const id = regra.idValido(corpo.turmaId);
      const m = regra.idValido(corpo.membroId);
      if (!id || !m) return erro(context, 404, "Inscrição não encontrada.");
      if (!motivo()) return erro(context, 400, SEM_MOTIVO);
      return resposta(context, await db.cancelarInscricao(pool, { turmaId: id, membroId: m, motivo: motivo(), por }));
    }
    case "reabrir": {
      const id = regra.idValido(corpo.turmaId);
      if (!id) return erro(context, 404, "Turma não encontrada.");
      if (!motivo()) return erro(context, 400, SEM_MOTIVO);
      return resposta(context, await db.reabrirTurma(pool, { turmaId: id, motivo: motivo(), por }));
    }
    case "matricular-curso": {
      const m = regra.idValido(corpo.membroId);
      const c = regra.idValido(corpo.cursoId);
      if (!m) return erro(context, 404, "Matrícula não encontrada.");
      if (!c) return erro(context, 400, "Escolha o curso.");
      return resposta(context, await db.matricularNoCurso(pool, { membroId: m, cursoId: c, data: corpo.data || hojeIso, por, hojeIso }), 201);
    }
    case "cancelar-curso": case "anular-conclusao": {
      const id = regra.idValido(corpo.cursoMatriculaId);
      if (!id) return erro(context, 404, "Matrícula no curso não encontrada.");
      if (!motivo()) return erro(context, 400, SEM_MOTIVO);
      return resposta(context, acao === "cancelar-curso" ? await db.cancelarCursoMatricula(pool, { cursoMatriculaId: id, motivo: motivo(), por, hojeIso })
        : await db.anularConclusao(pool, { cursoMatriculaId: id, motivo: motivo(), por }));
    }
    case "concluir-curso": {
      const id = regra.idValido(corpo.cursoMatriculaId);
      if (!id) return erro(context, 404, "Matrícula no curso não encontrada.");
      return resposta(context, await db.concluirCurso(pool, { cursoMatriculaId: id, data: corpo.data || hojeIso, por, hojeIso }));
    }
    case "aproveitamento": {
      const v = regra.validarAproveitamento(corpo, hojeIso);
      return v.valido ? resposta(context, await db.registrarAproveitamento(pool, { aproveitamento: v.aproveitamento, por }), 201) : erro(context, 400, v.mensagem);
    }
    case "anular-aproveitamento": {
      const id = regra.idValido(corpo.aproveitamentoId);
      if (!id) return erro(context, 404, "Aproveitamento não encontrado.");
      if (!motivo()) return erro(context, 400, SEM_MOTIVO);
      return resposta(context, await db.anularAproveitamento(pool, { aproveitamentoId: id, motivo: motivo(), por }));
    }
    case "requisito":
      return resposta(context, await db.criarRequisito(pool, { contexto: corpo.contexto, alvoChave: corpo.alvoChave, disciplinaId: regra.idValido(corpo.disciplinaId), modo: corpo.modo, por }), 201);
    case "remover-requisito": {
      const id = regra.idValido(corpo.requisitoId);
      return id ? resposta(context, await db.removerRequisito(pool, { requisitoId: id, por })) : erro(context, 404, "Requisito não encontrado.");
    }
    default:
      return erro(context, 404, "Ação inválida.");
  }
};
