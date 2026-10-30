// roteiro.js — prova da tela da v8.7 (o Seminário como sistema acadêmico) sem navegador: o index.html de verdade, o eventos.js e o modulos/seminario.js inteiros, num
// DOM simulado (tools/front-cuidado/ambiente.js). As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-66 com os handlers e o banco REAIS
// (`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-66-seminario.js` em tools/e2e-localdb) — com texto de ataque em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-seminario). MUTAR=1 roda também as mutações (cada uma precisa ser acusada).
"use strict";
const { criarAmbiente, lerApp } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; if (!process.env.CALADO) console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

// os campos de texto (os códigos — situação, resultado, área, nível — vêm de listas fechadas do servidor e não carregam HTML; os rótulos deles, sim, são envenenados)
const CAMPOS_TEXTO = ["nome", "congregacao", "disciplina", "curso", "docente", "local", "nivelRotulo", "areaRotulo", "ementa", "lacunasGovernanca", "disciplinaNome", "alvoChave",
  "situacaoRotulo", "faltam", "motivoCancelamento", "area", "resultadoRotulo", "instituicao", "disciplinaOrigem", "notaOrigem", "decisaoRotulo", "parecerista", "parecer",
  "motivoAnulacao", "rotulo", "titulo", "codigo", "mensagem", "TEOLOGIA", "LITURGIA", "LIDERANCA", "ADMINISTRACAO", "COMPLIANCE", "OUTRA", "CONSAGRACAO", "LIDERANCA",
  "HABILITACAO_TREINAMENTO", "BATISMO_DISCIPULADO", "ESCALA_EQUIPE", "EBD_PROFESSOR"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" && CAMPOS_TEXTO.includes(chave) ? `${x} ${ATAQUE}` : envenenar(x)));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k); return o; }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
// alguém pronto para concluir (o contrato termina sem ninguém: a lista também precisa passar pelo escape)
R.painel.prontos = [{ cursoMatriculaId: 777, membroId: 9201, nome: `Pronto E2E ${ATAQUE}`, curso: `Nível Básico ${ATAQUE}`, cargaCumprida: 30 }];
var MUTADO = null;
const TURMA_ABERTA = REAL.turmaAberta.turma.turmaId;

function montar({ geral = true, membro = false, matricula = 1002 } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  amb.ev(MUTADO || lerApp("modulos/seminario.js"), "seminario.js");
  amb.sessao({ matricula, token: "tok", pin: membro, nivel: geral ? "GLOBAL" : "CONGREGACAO", permissoes: ["afm", "pessoas"], geral });
  amb.__respostas = {};
  amb.__pdfs = [];
  amb.__prompt = "Motivo bem explicado (prova)";
  amb.ctx.confirm = () => true;
  amb.ctx.prompt = () => amb.__prompt;
  amb.ctx.baixarPdfCertificado = async (id) => { amb.__pdfs.push(id); };
  amb.api.servidor = (c) => {
    if (amb.__respostas[c.chave]) return amb.__respostas[c.chave];
    if (c.chave === "GET seminario/painel") return { corpo: R.painel };
    if (c.chave === "GET seminario/turma") return { corpo: String(c.consulta.turmaId) === String(TURMA_ABERTA) ? R.turmaAberta : R.turma };
    if (c.chave === "GET seminario/aluno") return { corpo: R.aluno };
    if (c.chave === "GET seminario/pessoa") return { corpo: R.pessoa };
    if (c.chave === "GET seminario/minha") return { corpo: R.minha };
    if (c.chave === "POST seminario/notas") return { status: 200, corpo: { sucesso: true, mensagem: `Notas gravadas ${ATAQUE}`, resultados: c.corpo.itens.map((i) => ({ membroId: i.membroId, sucesso: true })) } };
    if (c.chave === "POST seminario/inscrever") return { status: 200, corpo: { sucesso: true, mensagem: `Inscritos ${ATAQUE}`, resultados: c.corpo.membroIds.map((m) => ({ membroId: /^\d+$/.test(m) ? Number(m) : null, sucesso: /^\d+$/.test(m), mensagem: "Matrícula inválida." })) } };
    if (c.chave === "POST seminario/documento") return { status: 201, corpo: { sucesso: true, certificadoId: 4242, mensagem: `Emitido ${ATAQUE}` } };
    if (c.metodo === "POST") return { status: 200, corpo: { sucesso: true, mensagem: `Salvo ${ATAQUE}`, turmaId: 31337 } };
    return null;
  };
  return amb;
}
const semAtaque = (amb, onde) => ok(amb.ctx.__xss.chamadas.length === 0 && amb.doc._ataques.length === 0, `${onde}: nenhum texto do servidor virou código`, { xss: amb.ctx.__xss.chamadas, ataques: amb.doc._ataques.slice(0, 3) });
const todos = (amb, raizId) => { const raiz = amb.e(raizId); return raiz ? [...raiz.descendentes()] : []; };
const botoes = (amb, raizId, acao) => todos(amb, raizId).filter((b) => b.getAttribute("data-on-click") === acao);
const args = (b) => JSON.parse(b.getAttribute("data-args-click") || "[]");
const posts = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "POST" && c.caminho === caminho);
const gets = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "GET" && c.caminho === caminho);
const abrirSecao = (amb, id) => { for (let el = amb.e(id); el && el.style; el = el.parentNode) { if (el.style.display === "none") el.style.display = ""; if (el.hidden) el.hidden = false; } };
const alunoAberto = REAL.turmaAberta.turma.alunos.find((a) => a.situacao === "INSCRITO");

async function prova() {
  total = 0; falhas = 0;
  console.log("== contrato real ==");
  for (const k of ["painel", "turma", "turmaAberta", "aluno", "minha", "minhaDocente", "pessoa"]) ok(REAL[k] && REAL[k].sucesso, `o e2e-66 gravou a resposta real de ${k}`);
  ok(["cursos", "turmas", "prontos", "docentes", "requisitos", "areas", "contextos"].every((k) => k in REAL.painel) && REAL.painel.cursos.length === 4, "painel: as listas que a tela lê, os quatro cursos");
  ok(REAL.painel.cursos.every((c) => ["cursoId", "nome", "nivelRotulo", "notaMinima", "frequenciaMinimaPct", "disciplinas", "lacunasGovernanca", "cursando", "concluidos"].every((k) => k in c)), "cursos: os campos");
  ok(REAL.painel.cursos.flatMap((c) => c.disciplinas).some((d) => d.preRequisitos.length) && REAL.painel.cursos.some((c) => c.lacunasGovernanca.length), "uma disciplina com pré-requisito e um curso com o aviso do Art. 70 §2º");
  ok(REAL.painel.turmas.every((t) => ["turmaId", "disciplina", "curso", "docente", "dataInicio", "dataFim", "situacao", "inscritos", "lancados"].every((k) => k in t)), "turmas: os campos");
  ok(REAL.turma.turma.situacao === "ENCERRADA" && REAL.turmaAberta.turma.situacao === "ABERTA" && alunoAberto, "uma turma encerrada e uma aberta com aluno");
  ok(REAL.turma.turma.alunos.every((a) => ["membroId", "nome", "situacao", "nota", "horasPresentes", "resultadoRotulo"].every((k) => k in a)), "alunos da turma: os campos");
  ok(REAL.aluno.cursos.some((c) => c.situacao === "CONCLUIDO" && c.diploma) && REAL.aluno.aproveitamentos.some((a) => a.parecer) && REAL.aluno.documentos.length, "a ficha: o curso concluído com o diploma, o parecer e os documentos");
  ok(REAL.minha.aproveitamentos.every((a) => a.parecer === undefined) && REAL.pessoa.aproveitamentos.every((a) => a.parecer === undefined), "a minha e o perfil: sem o texto do parecer");
  ok(REAL.minhaDocente.docencia.emExercicio && REAL.minhaDocente.docencia.turmas.some((t) => t.situacao === "ABERTA"), "o docente: em exercício, com turma aberta");
  // fora do módulo: a Academia mostra o nível do histórico, o service worker e o script.js
  ok(/pelo histórico/.test(lerApp("modulos/afm.js")) && /SEM_NIVEL: afmSemNivel/.test(lerApp("modulos/afm.js")), "a lista da Academia: o nível pelo histórico (não acusa 'a informar' quem cursa)");
  ok(/semLimparTela\(\)/.test(lerApp("script.js")) && /semCarregarMinha\(\)/.test(lerApp("script.js")) && /semCarregarPessoa\(membroId\)/.test(lerApp("modulos/pessoas.js")), "os ganchos: a saída, Minha Formação e o perfil");

  console.log("== a Academia (nível geral): o painel ==");
  let amb = montar();
  await amb.g("semCarregarPainelAcao")(); await amb.ocioso();
  const lt = amb.e("semListaTurmas").textContent;
  ok(REAL.painel.turmas.every((t) => lt.includes(t.disciplina) && lt.includes(t.docente)), "as turmas com a disciplina e o docente", lt.slice(0, 200));
  const ativas = REAL.painel.cursos.flatMap((c) => c.disciplinas).filter((d) => d.ativa);
  ok(amb.e("semTurmaDisciplina").options.filter((o) => o.value).length === ativas.length, "abrir turma: só as disciplinas ativas");
  ok(amb.e("semTurmaDocente").options.filter((o) => o.value).length === REAL.painel.docentes.length, "e os docentes em exercício");
  ok(/Art\. 70 §2º/.test(amb.e("semListaCursos").textContent), "o aviso das áreas de governança");
  ok(amb.e("semProntos").textContent.includes("Pronto E2E") && botoes(amb, "semProntos", "semConcluirAcao").length === 1, "quem está pronto para concluir, com o botão");
  ok(REAL.painel.requisitos.length === 0 || amb.e("semListaRequisitos").textContent.length > 0, "os requisitos");
  semAtaque(amb, "painel");

  console.log("== abrir turma ==");
  amb.limparRegistro();
  amb.doc.escolher(amb.e("semTurmaDisciplina"), String(ativas[0].disciplinaId));
  amb.doc.escolher(amb.e("semTurmaDocente"), String(REAL.painel.docentes[0].membroId));
  amb.e("semTurmaInicio").value = "2027-03-01"; amb.e("semTurmaFim").value = "2027-06-30"; amb.e("semTurmaLocal").value = "Templo Central";
  const abrir = todos(amb, "afmSecaoSeminario").find((b) => b.getAttribute("data-on-click") === "semAbrirTurmaNovaAcao");
  amb.doc.clicar(abrir); amb.doc.clicar(abrir);
  await amb.ocioso();
  const pt = posts(amb, "seminario/turma");
  ok(pt.length === 1 && pt[0].corpo.disciplinaId === ativas[0].disciplinaId && pt[0].corpo.docenteMembroId === REAL.painel.docentes[0].membroId && pt[0].corpo.dataInicio === "2027-03-01" && pt[0].corpo.local === "Templo Central",
    "o duplo clique envia uma vez, com os campos", pt.map((p) => p.corpo));
  ok(amb.e("semTurmaLocal").value === "" && gets(amb, "seminario/painel").length === 1 && gets(amb, "seminario/turma").length === 1, "o formulário limpa, o painel recarrega e a turma nova abre");
  semAtaque(amb, "abrir turma");

  console.log("== a turma encerrada e a aberta ==");
  amb = montar();
  await amb.g("semCarregarPainelAcao")(); await amb.ocioso();
  abrirSecao(amb, "semTurmaDetalhe");
  await amb.g("semAbrirTurmaAcao")(REAL.turma.turma.turmaId); await amb.ocioso();
  const enc = REAL.turma.turma.alunos.find((a) => a.situacao === "INSCRITO");
  ok(amb.e(`semANota_${enc.membroId}`).disabled && botoes(amb, "semTurmaDetalhe", "semReabrirAcao").length === 1 && !botoes(amb, "semTurmaDetalhe", "semSalvarNotasAcao").length, "encerrada: as notas travadas e só 'Reabrir'");
  ok(amb.foco() === amb.e("semATurmaTitulo"), "o foco vai para a turma aberta");
  amb.limparRegistro();
  amb.__prompt = "curto";
  amb.doc.clicar(botoes(amb, "semTurmaDetalhe", "semReabrirAcao")[0]); await amb.ocioso();
  ok(!posts(amb, "seminario/reabrir").length && /O motivo tem de 10 a 300/.test(amb.e("semMsg").textContent), "reabrir sem o motivo (ou curto): nada vai ao servidor, e diz por quê");
  amb.__prompt = "Nota lançada errada pelo docente";
  amb.doc.clicar(botoes(amb, "semTurmaDetalhe", "semReabrirAcao")[0]); await amb.ocioso();
  ok(posts(amb, "seminario/reabrir").length === 1 && posts(amb, "seminario/reabrir")[0].corpo.motivo === "Nota lançada errada pelo docente", "reabrir com o motivo");
  await amb.g("semAbrirTurmaAcao")(TURMA_ABERTA); await amb.ocioso();
  ok(!amb.e(`semANota_${alunoAberto.membroId}`).disabled && botoes(amb, "semTurmaDetalhe", "semEncerrarAcao").length === 1 && amb.e("semAInscrever"), "aberta: as notas, o 'Encerrar' e o 'Inscrever'");
  ok(botoes(amb, "semTurmaDetalhe", "semSalvarNotasAcao").every((b) => JSON.stringify(args(b)) === JSON.stringify(["academia", TURMA_ABERTA])), "cada botão leva o lugar e a turma");
  amb.limparRegistro();
  amb.doc.clicar(botoes(amb, "semTurmaDetalhe", "semSalvarNotasAcao")[0]); await amb.ocioso();
  ok(!posts(amb, "seminario/notas").length && /Nada mudou/.test(amb.e("semMsg").textContent), "sem mudança: nada vai ao servidor");
  amb.e(`semANota_${alunoAberto.membroId}`).value = "8,5"; amb.e(`semAHoras_${alunoAberto.membroId}`).value = "9";
  amb.doc.clicar(botoes(amb, "semTurmaDetalhe", "semSalvarNotasAcao")[0]); await amb.ocioso();
  const pn = posts(amb, "seminario/notas");
  ok(pn.length === 1 && pn[0].corpo.turmaId === TURMA_ABERTA && pn[0].corpo.itens.length === 1 && pn[0].corpo.itens[0].nota === "8,5" && pn[0].corpo.itens[0].horasPresentes === "9", "a nota e as horas como digitadas (o servidor entende a vírgula)", pn.map((p) => p.corpo));
  ok(gets(amb, "seminario/painel").length === 1 && gets(amb, "seminario/turma").length === 1, "o painel e a turma recarregam");
  // a recusa: o nome e o motivo; a linha volta com o que foi digitado
  amb.__respostas["POST seminario/notas"] = { corpo: { sucesso: false, mensagem: "0 de 1.", resultados: [{ membroId: alunoAberto.membroId, sucesso: false, mensagem: `Já concluiu o curso ${ATAQUE}` }, { membroId: 99999, sucesso: true }] } };
  amb.e(`semANota_${alunoAberto.membroId}`).value = "3";
  amb.doc.clicar(botoes(amb, "semTurmaDetalhe", "semSalvarNotasAcao")[0]); await amb.ocioso();
  ok(amb.e("semMsg").textContent.includes(alunoAberto.nome.split(" ")[0]) && /Já concluiu/.test(amb.e("semMsg").textContent) && amb.e(`semANota_${alunoAberto.membroId}`).value === "3", "a recusa: o nome, o motivo e o que foi digitado fica", amb.e("semMsg").textContent.slice(0, 150));
  delete amb.__respostas["POST seminario/notas"];
  amb.limparRegistro();
  amb.e("semAInscrever").value = "9201, 9202 ;abc";
  amb.doc.clicar(botoes(amb, "semTurmaDetalhe", "semInscreverAcao")[0]); await amb.ocioso();
  ok(!posts(amb, "seminario/inscrever").length && /abc/.test(amb.e("semMsg").textContent) && amb.e("semAInscrever").value === "9201, 9202 ;abc", "matrícula com letra: nem vai, diz qual e o campo fica");
  amb.e("semAInscrever").value = "9201, 009202 9201";
  amb.doc.clicar(botoes(amb, "semTurmaDetalhe", "semInscreverAcao")[0]); await amb.ocioso();
  const pi = posts(amb, "seminario/inscrever");
  ok(pi.length === 1 && JSON.stringify(pi[0].corpo.membroIds) === '["9201","9202"]', "inscrever: as matrículas da lista (sem zero à esquerda, sem repetir)", pi.map((p) => p.corpo));
  amb.limparRegistro();
  amb.e(`semANota_${alunoAberto.membroId}`).value = "7,5";
  amb.doc.clicar(botoes(amb, "semTurmaDetalhe", "semEncerrarAcao")[0]); await amb.ocioso();
  ok(!posts(amb, "seminario/encerrar").length && /salve as notas antes/.test(amb.e("semMsg").textContent), "encerrar com nota digitada e não salva: recusa na tela");
  amb.e(`semANota_${alunoAberto.membroId}`).value = amb.e(`semANota_${alunoAberto.membroId}`).getAttribute("data-original");
  amb.doc.clicar(botoes(amb, "semTurmaDetalhe", "semEncerrarAcao")[0]); await amb.ocioso();
  ok(posts(amb, "seminario/encerrar").length === 1 && posts(amb, "seminario/encerrar")[0].corpo.turmaId === TURMA_ABERTA, "encerrar (depois de confirmar)");
  amb.ctx.confirm = () => false;
  amb.limparRegistro();
  amb.doc.clicar(botoes(amb, "semTurmaDetalhe", "semEncerrarAcao")[0]); await amb.ocioso();
  ok(!posts(amb, "seminario/encerrar").length, "sem confirmar, não encerra");
  semAtaque(amb, "a turma");
  // a própria linha vem travada
  const proprio = montar({ matricula: alunoAberto.membroId });
  await proprio.g("semAbrirTurmaAcao")(TURMA_ABERTA); await proprio.ocioso();
  ok(proprio.e(`semANota_${alunoAberto.membroId}`).disabled, "a própria nota vem travada (ninguém lança a própria nota)");
  // o ano inteiro em lotes de 100, com a vez segurada do primeiro ao último lote
  const muitos = montar();
  const gente = Array.from({ length: 250 }, (_, i) => ({ membroId: 60000 + i, nome: `Aluno ${i}`, congregacao: "Central", situacao: "INSCRITO", nota: null, horasPresentes: null, resultadoRotulo: null }));
  muitos.__respostas["GET seminario/turma"] = { corpo: { sucesso: true, turma: { ...R.turmaAberta.turma, alunos: gente } } };
  await muitos.g("semAbrirTurmaAcao")(TURMA_ABERTA); await muitos.ocioso();
  for (const g of gente) { muitos.e(`semANota_${g.membroId}`).value = "7"; muitos.e(`semAHoras_${g.membroId}`).value = "8"; }
  const ret = muitos.retem((c) => c.chave === "POST seminario/notas");
  const sl = muitos.g("semSalvarNotasAcao")("academia", TURMA_ABERTA);
  await muitos.ocioso();
  await muitos.g("semSalvarNotasAcao")("academia", TURMA_ABERTA); await muitos.ocioso();
  ok(/Aguarde/.test(muitos.e("semMsg").textContent), "um segundo 'Salvar' no meio dos lotes espera");
  ret.liberar(); await sl; await muitos.ocioso();
  ok(JSON.stringify(posts(muitos, "seminario/notas").map((c) => c.corpo.itens.length)) === "[100,100,50]", "250 notas: três pedidos (100, 100 e 50)");

  console.log("== o Reitor: a turma na Academia e outra em Minha Formação ==");
  const dois2 = montar();
  dois2.__respostas["GET seminario/minha"] = { corpo: R.minhaDocente };
  await dois2.g("semCarregarMinha")(); await dois2.ocioso();
  await dois2.g("semAbrirTurmaMinhaAcao")(TURMA_ABERTA); await dois2.ocioso();
  await dois2.g("semAbrirTurmaAcao")(REAL.turma.turma.turmaId); await dois2.ocioso();
  dois2.limparRegistro();
  dois2.e(`semMNota_${alunoAberto.membroId}`).value = "6";
  dois2.doc.clicar(botoes(dois2, "semMinhaTurma", "semSalvarNotasAcao")[0]); await dois2.ocioso();
  const pdois = posts(dois2, "seminario/notas");
  ok(pdois.length === 1 && pdois[0].corpo.turmaId === TURMA_ABERTA, "salvar em Minha Formação grava a turma de lá, mesmo com outra aberta na Academia", pdois.map((p) => p.corpo));
  ok(!!dois2.e("semATurmaTitulo") && !!dois2.e("semMTurmaTitulo"), "as duas tabelas, cada uma com os seus ids");
  // a resposta do salvamento chega depois que a pessoa abriu outra turma no mesmo lugar: o que foi recusado não vai para a outra
  const troca = montar();
  await troca.g("semAbrirTurmaAcao")(TURMA_ABERTA); await troca.ocioso();
  troca.__respostas["POST seminario/notas"] = { corpo: { sucesso: true, mensagem: "1 de 2.", resultados: [{ membroId: alunoAberto.membroId, sucesso: false, mensagem: "recusada" }, { membroId: 1, sucesso: true }] } };
  troca.e(`semANota_${alunoAberto.membroId}`).value = "4";
  const retTroca = troca.retem((c) => c.chave === "POST seminario/notas");
  const sTroca = troca.g("semSalvarNotasAcao")("academia", TURMA_ABERTA);
  await troca.ocioso();
  await troca.g("semAbrirTurmaAcao")(REAL.turma.turma.turmaId); await troca.ocioso();
  retTroca.liberar(); await sTroca; await troca.ocioso();
  ok(!troca.e(`semANota_${alunoAberto.membroId}`) || troca.e(`semANota_${alunoAberto.membroId}`).value !== "4", "a nota recusada de uma turma não aparece em outra");

  console.log("== o currículo ==");
  amb = montar();
  await amb.g("semCarregarPainelAcao")(); await amb.ocioso();
  const comPre = REAL.painel.cursos.flatMap((c) => c.disciplinas).find((d) => d.preRequisitos.length);
  amb.doc.clicar(botoes(amb, "semListaCursos", "semEditarDisciplinaAcao").find((b) => args(b)[0] === comPre.disciplinaId)); await amb.ocioso();
  const pre = amb.e("semDiscPre");
  ok(amb.e("semDiscId").value === String(comPre.disciplinaId) && amb.e("semDiscCurso").disabled && !pre.options.some((o) => o.value === String(comPre.disciplinaId)), "editar: o formulário vem preenchido, sem mudar de curso e sem a própria disciplina nos pré-requisitos");
  ok(JSON.stringify(pre.selectedOptions.map((o) => Number(o.value))) === JSON.stringify(comPre.preRequisitos), "os pré-requisitos dela vêm marcados");
  amb.e("semDiscCarga").value = "12,5";
  amb.limparRegistro();
  amb.doc.clicar(todos(amb, "afmSecaoSeminario").find((b) => b.getAttribute("data-on-click") === "semSalvarDisciplinaAcao")); await amb.ocioso();
  const pd = posts(amb, "seminario/disciplina")[0];
  ok(pd && pd.corpo.disciplinaId === comPre.disciplinaId && pd.corpo.cargaHoraria === "12,5" && pd.corpo.obrigatoria === comPre.obrigatoria && JSON.stringify(pd.corpo.preRequisitos) === JSON.stringify(comPre.preRequisitos), "salvar: os campos e os pré-requisitos", pd && pd.corpo);
  ok(amb.e("semDiscId").value === "" && !amb.e("semDiscCurso").disabled && amb.e("semDiscTitulo").textContent === "Nova disciplina", "depois de salvar, o formulário volta a 'nova disciplina'");
  amb.limparRegistro();
  amb.__prompt = "6,5";
  amb.doc.clicar(botoes(amb, "semListaCursos", "semEditarCursoAcao")[0]); await amb.ocioso();
  ok(posts(amb, "seminario/curso").length === 1 && posts(amb, "seminario/curso")[0].corpo.notaMinima === "6,5", "mudar a regra do curso");
  semAtaque(amb, "currículo");

  console.log("== a ficha do aluno ==");
  amb = montar();
  await amb.g("semCarregarPainelAcao")(); await amb.ocioso();
  abrirSecao(amb, "semFichaAluno");
  amb.limparRegistro();
  amb.e("semAlunoMatricula").value = "12a";
  await amb.g("semBuscarAlunoAcao")(); await amb.ocioso();
  ok(!gets(amb, "seminario/aluno").length && /só números/.test(amb.e("semMsg").textContent), "matrícula com letra: nem pede");
  amb.e("semAlunoMatricula").value = String(REAL.aluno.membroId);
  await amb.g("semBuscarAlunoAcao")(); await amb.ocioso();
  const ficha = amb.e("semFichaAluno").textContent;
  ok(gets(amb, "seminario/aluno")[0].consulta.membroId === String(REAL.aluno.membroId) && ficha.includes(REAL.aluno.aproveitamentos.find((a) => a.parecer).parecer), "a ficha com o parecer do aproveitamento");
  const concl = REAL.aluno.cursos.find((c) => c.situacao === "CONCLUIDO");
  ok(botoes(amb, "semFichaAluno", "semAnularConclusaoAcao").some((b) => args(b)[0] === concl.cursoMatriculaId) && botoes(amb, "semFichaAluno", "baixarPdfCertificado").some((b) => args(b)[0] === concl.diploma.certificadoId),
    "o concluído: anular a conclusão e baixar o diploma");
  ok(!botoes(amb, "semFichaAluno", "semEmitirDocumentoAcao").some((b) => args(b)[0] === "DECLARACAO" && args(b)[1] === concl.cursoMatriculaId), "sem declaração de matrícula do curso concluído");
  ok(amb.foco() === amb.e("semAlunoTitulo"), "o foco vai para a ficha");
  amb.limparRegistro();
  amb.doc.escolher(amb.e("semAprDisciplina"), String(ativas[0].disciplinaId));
  amb.e("semAprInstituicao").value = "Seminário X"; amb.e("semAprDisciplinaOrigem").value = "Teologia I"; amb.e("semAprCarga").value = "30,5"; amb.e("semAprAno").value = "2019";
  amb.doc.escolher(amb.e("semAprParecerista"), String(REAL.painel.docentes[0].membroId)); amb.e("semAprData").value = "2026-10-01";
  amb.e("semAprParecer").value = "Equivalente no conteúdo e na carga horária."; amb.e("semAprDocumento").checked = true;
  amb.doc.clicar(botoes(amb, "semFichaAluno", "semRegistrarAproveitamentoAcao")[0]); await amb.ocioso();
  const pa = posts(amb, "seminario/aproveitamento")[0];
  ok(pa && pa.corpo.membroId === REAL.aluno.membroId && pa.corpo.disciplinaId === ativas[0].disciplinaId && pa.corpo.cargaHorariaOrigem === "30,5" && pa.corpo.anoOrigem === 2019 && pa.corpo.documentoConferido === true
    && pa.corpo.decisao === "DEFERIDO" && pa.corpo.pareceristaMembroId === REAL.painel.docentes[0].membroId, "o aproveitamento com todos os campos", pa && pa.corpo);
  ok(gets(amb, "seminario/aluno").length === 1, "e a ficha recarrega");
  amb.limparRegistro();
  await amb.g("semEmitirDocumentoAcao")("HISTORICO", null, REAL.aluno.membroId); await amb.ocioso();
  const pdoc = posts(amb, "seminario/documento")[0];
  ok(pdoc && pdoc.corpo.tipo === "HISTORICO" && pdoc.corpo.membroId === REAL.aluno.membroId && JSON.stringify(amb.__pdfs) === "[4242]", "a Academia emite o histórico do aluno e o PDF baixa", pdoc && pdoc.corpo);
  amb.e("semAprInstituicao").value = "digitado antes";
  await amb.g("semEmitirDocumentoAcao")("HISTORICO", null, REAL.aluno.membroId); await amb.ocioso();
  ok(amb.e("semAprInstituicao").value === "digitado antes", "o ato na ficha só relê o histórico: o formulário do aproveitamento fica");
  amb.g("semMostrarParteAcao")("turmas"); amb.g("semMostrarParteAcao")("alunos");
  ok(amb.e("semAprInstituicao").value === "digitado antes", "trocar de parte não relê a ficha");
  semAtaque(amb, "ficha do aluno");
  const propria = montar({ matricula: REAL.aluno.membroId });
  await propria.g("semCarregarPainelAcao")(); await propria.ocioso();
  propria.e("semAlunoMatricula").value = String(REAL.aluno.membroId);
  await propria.g("semBuscarAlunoAcao")(); await propria.ocioso();
  ok(!botoes(propria, "semFichaAluno", "semAnularConclusaoAcao").length && !propria.e("semAprInstituicao") && /sua própria ficha/.test(propria.e("semFichaAluno").textContent), "a própria ficha: sem os atos que o servidor recusa");

  console.log("== requisitos de disciplina ==");
  amb.limparRegistro();
  amb.doc.escolher(amb.e("semReqContexto"), "CONSAGRACAO"); amb.e("semReqAlvo").value = "Separação ao Diaconato"; amb.doc.escolher(amb.e("semReqDisciplina"), String(ativas[0].disciplinaId));
  amb.doc.clicar(todos(amb, "afmSecaoSeminario").find((b) => b.getAttribute("data-on-click") === "semSalvarRequisitoAcao")); await amb.ocioso();
  const pr = posts(amb, "seminario/requisito")[0];
  ok(pr && pr.corpo.contexto === "CONSAGRACAO" && pr.corpo.alvoChave === "Separação ao Diaconato" && pr.corpo.disciplinaId === ativas[0].disciplinaId && pr.corpo.modo === "BLOQUEIA", "exigir a disciplina", pr && pr.corpo);

  console.log("== a minha e a do docente ==");
  amb = montar({ geral: false, membro: true, matricula: REAL.aluno.membroId });
  await amb.g("semCarregarMinha")(); await amb.ocioso();
  const minha = amb.e("semMinha").textContent;
  ok(/Meu histórico escolar/.test(minha) && !/Turmas em que leciono/.test(minha) && !botoes(amb, "semMinha", "semAnularConclusaoAcao").length && !botoes(amb, "semMinha", "semAnularAproveitamentoAcao").length,
    "a minha: o histórico, sem os atos da Academia");
  amb.limparRegistro();
  await amb.g("semEmitirDocumentoAcao")("HISTORICO", null, null); await amb.ocioso();
  ok(posts(amb, "seminario/documento")[0].corpo.membroId === undefined && /Emitido/.test(amb.e("semMsgMinha").textContent), "a própria pessoa emite (sem matrícula no pedido), e a mensagem sai em Minha Formação");
  amb.__respostas["GET seminario/minha"] = { corpo: { sucesso: true, cursos: [], turmas: [], aproveitamentos: [], documentos: [], docencia: { emExercicio: false, turmas: [] } } };
  await amb.g("semCarregarMinha")();
  ok(amb.e("semMinha").innerHTML === "", "quem nunca estudou nem lecionou: o bloco não aparece");
  semAtaque(amb, "a minha");
  amb = montar({ geral: false, membro: true, matricula: 9222 });
  amb.__respostas["GET seminario/minha"] = { corpo: R.minhaDocente };
  await amb.g("semCarregarMinha")(); await amb.ocioso();
  ok(/Turmas em que leciono/.test(amb.e("semMinha").textContent), "o docente: as turmas em que leciona");
  amb.doc.clicar(botoes(amb, "semMinha", "semAbrirTurmaMinhaAcao").find((b) => args(b)[0] === TURMA_ABERTA)); await amb.ocioso();
  ok(!!amb.e(`semMNota_${alunoAberto.membroId}`) && !amb.e("semMInscrever") && !botoes(amb, "semMinhaTurma", "semReabrirAcao").length && !botoes(amb, "semMinhaTurma", "semCancelarInscricaoAcao").length,
    "a turma do docente: lança e encerra, sem inscrever, cancelar nem reabrir");
  amb.e(`semMNota_${alunoAberto.membroId}`).value = "9"; amb.e(`semMHoras_${alunoAberto.membroId}`).value = "10";
  amb.limparRegistro();
  amb.doc.clicar(botoes(amb, "semMinhaTurma", "semSalvarNotasAcao")[0]); await amb.ocioso();
  ok(posts(amb, "seminario/notas").length === 1 && gets(amb, "seminario/minha").length === 1 && /1 de 1 gravada/.test(amb.e("semMsgMinha").textContent), "o docente grava: a Minha Formação recarrega e a mensagem sai nela", [posts(amb, "seminario/notas").length, gets(amb, "seminario/minha").length, amb.e("semMsgMinha").textContent]);
  semAtaque(amb, "o docente");
  const fora = montar({ geral: false, membro: true, matricula: 9222 });
  fora.__respostas["GET seminario/minha"] = { corpo: { ...R.minhaDocente, docencia: { ...R.minhaDocente.docencia, emExercicio: false } } };
  await fora.g("semCarregarMinha")(); await fora.ocioso();
  await fora.g("semAbrirTurmaMinhaAcao")(TURMA_ABERTA); await fora.ocioso();
  ok(fora.e(`semMNota_${alunoAberto.membroId}`).disabled && !botoes(fora, "semMinhaTurma", "semSalvarNotasAcao").length, "o docente fora de exercício só vê (campos travados, sem botões)");

  console.log("== o perfil ==");
  amb = montar({ geral: false });
  amb.__respostas["GET seminario/pessoa"] = { corpo: { ...R.pessoa, cursos: R.aluno.cursos } };   // mesmo que um servidor antigo mande o diploma, o perfil não oferece o PDF
  amb.ctx._membroPerfilAtual = REAL.aluno.membroId;
  await amb.g("semCarregarPessoa")(REAL.aluno.membroId);
  ok(/Histórico escolar \(AFM\)/.test(amb.e("semHistoricoPerfil").textContent) && !botoes(amb, "semHistoricoPerfil", "semEmitirDocumentoAcao").length && !botoes(amb, "semHistoricoPerfil", "baixarPdfCertificado").length,
    "o perfil: o histórico, sem emitir documento de ninguém");
  const pp = montar({ geral: false });
  const retA = pp.retem((c) => c.chave === "GET seminario/pessoa" && c.consulta.membroId === "1");
  pp.ctx._membroPerfilAtual = 1;
  const pA = pp.g("semCarregarPessoa")(1);
  await pp.ocioso();
  pp.ctx._membroPerfilAtual = 2;
  pp.__respostas["GET seminario/pessoa"] = { corpo: { sucesso: true, cursos: [], turmas: [], aproveitamentos: [], documentos: [] } };
  await pp.g("semCarregarPessoa")(2);
  retA.liberar(); await pA; await pp.ocioso();
  ok(pp.e("semHistoricoPerfil").innerHTML === "", "a resposta atrasada da pessoa anterior não aparece no perfil da atual");
  semAtaque(amb, "perfil");

  console.log("== a saída e as respostas atrasadas ==");
  amb = montar();
  await amb.g("semCarregarPainelAcao")(); await amb.ocioso();
  await amb.g("semAbrirTurmaAcao")(TURMA_ABERTA); await amb.ocioso();
  amb.e("semAlunoMatricula").value = String(REAL.aluno.membroId); await amb.g("semBuscarAlunoAcao")(); await amb.ocioso();
  await amb.g("semCarregarMinha")(); amb.ctx._membroPerfilAtual = 1; await amb.g("semCarregarPessoa")(1);
  amb.e("semTurmaLocal").value = "digitado"; amb.e("semDiscNome").value = "digitado"; amb.e("semReqAlvo").value = "digitado"; amb.e("semDiscCurso").disabled = true;
  amb.g("semLimparTela")();
  ok(["semListaTurmas", "semTurmaDetalhe", "semFichaAluno", "semListaCursos", "semMinha", "semMinhaTurma", "semHistoricoPerfil", "semTurmaDocente"].every((i) => amb.e(i).innerHTML === "") && amb.g("semPainel") === null,
    "a saída limpa tudo o que estava na tela");
  ok(!amb.e("semDiscCurso").disabled && amb.e("semTurmaLocal").value === "" && amb.e("semDiscNome").value === "" && amb.e("semReqAlvo").value === "" && amb.e("semAlunoMatricula").value === "", "e o que foi digitado");
  const atr = montar();
  const r1 = atr.retem((c) => c.chave === "GET seminario/painel");
  const p1 = atr.g("semCarregarPainelAcao")();
  await atr.ocioso();
  atr.sessao({ matricula: 2002, token: "tok-b", nivel: "CONGREGACAO", permissoes: ["pessoas"], geral: false });
  r1.liberar(); await p1; await atr.ocioso();
  ok(atr.g("semPainel") === null && !atr.e("semListaCursos").textContent, "a resposta atrasada do login anterior não aparece para o novo");
  const dois = montar();
  const r2 = dois.retem((c) => c.chave === "GET seminario/painel");
  const q1 = dois.g("semCarregarPainelAcao")();
  await dois.ocioso();
  dois.__respostas["GET seminario/painel"] = { corpo: { ...R.painel, turmas: [] } };
  await dois.g("semCarregarPainelAcao")();
  r2.liberar(); await q1; await dois.ocioso();
  ok(/Nenhuma turma ainda/.test(dois.e("semListaTurmas").textContent), "dois pedidos do painel: a tela fica com o último");
  return { total, falhas };
}

const MUTACOES = [
  ["tirar o escape do docente na lista de turmas", ["<td>${escaparHtmlEbd(t.docente)}</td><td>${escaparHtmlEbd(semBr(t.dataInicio))} a ${escaparHtmlEbd(semBr(t.dataFim))}</td>\n      <td>${t.situacao === \"ABERTA\" ? \"aberta\" : `encerrada em ${escaparHtmlEbd(semBr(t.encerradaEm))}`}</td><td>${Number(t.lancados)} / ${Number(t.inscritos)}</td>\n      <td><button class=\"btn-link\" data-on-click=\"semAbrirTurmaAcao\"",
    "<td>${t.docente}</td><td>${escaparHtmlEbd(semBr(t.dataInicio))} a ${escaparHtmlEbd(semBr(t.dataFim))}</td>\n      <td>${t.situacao === \"ABERTA\" ? \"aberta\" : `encerrada em ${escaparHtmlEbd(semBr(t.encerradaEm))}`}</td><td>${Number(t.lancados)} / ${Number(t.inscritos)}</td>\n      <td><button class=\"btn-link\" data-on-click=\"semAbrirTurmaAcao\""]],
  ["tirar o escape do parecer", ["a.parecer ? `<br><em>${escaparHtmlEbd(a.parecer)}</em>`", "a.parecer ? `<br><em>${a.parecer}</em>`"]],
  ["tirar o escape do nome do aluno na turma", ["return `<tr><td>${escaparHtmlEbd(a.nome)}</td><td>${escaparHtmlEbd(a.congregacao) || \"-\"}</td>${a.situacao", "return `<tr><td>${a.nome}</td><td>${escaparHtmlEbd(a.congregacao) || \"-\"}</td>${a.situacao"]],
  ["tirar o escape das lacunas do Art. 70", ["${c.lacunasGovernanca.map((x) => escaparHtmlEbd(x)).join(\", \")}", "${c.lacunasGovernanca.join(\", \")}"]],
  ["mandar todas as notas (não só as mexidas)", ["(n.value !== n.getAttribute(\"data-original\") || h.value !== h.getAttribute(\"data-original\"))", "true"]],
  ["não travar a própria nota", ["const pode = editavel && a.situacao === \"INSCRITO\" && a.membroId !== eu;", "const pode = editavel && a.situacao === \"INSCRITO\";"]],
  ["deixar o docente fora de exercício lançar", ["const editavel = aberta && (geral || semDocenteEmExercicio);", "const editavel = aberta;"]],
  ["usar a turma de outro lugar", ["const st = semTurmas[semLugar(lugar)];\n  if (!st || st.turmaId !== Number(turmaId))", "const st = semTurmas.academia || semTurmas.minha;\n  if (!st)"]],
  ["reabrir com o recusado de outra turma", ["if (st && st.turmaId === turmaId) await semAbrirTurma(turmaId, lugar, { manter, foco: false });", "if (st) await semAbrirTurma(st.turmaId, lugar, { manter, foco: false });"]],
  ["encerrar com nota não salva", ["if (semMexidas(lugar, st).length) {", "if (false) {"]],
  ["reler a ficha inteira depois do ato", ["if (soHistorico && hist) {", "if (false && hist) {"]],
  ["oferecer os atos na própria ficha", ["const atos = acoes && Number(membroId) !== semEu();", "const atos = acoes;"]],
  ["não reabilitar o curso na saída", ["  if (curso) curso.disabled = false;", ""]],
  ["mandar tudo num pedido só", ["const SEM_LOTE = 100;", "const SEM_LOTE = 100000;"]],
  ["perder o que foi digitado na linha recusada", ["value=\"${escaparHtmlEbd(d ? String(d.nota ?? \"\") : nota)}\"", "value=\"${escaparHtmlEbd(nota)}\""]],
  ["reabrir sem o motivo", ["  const motivo = semMotivo(\"Por que reabrir a turma?\", lugar);\n  if (!motivo) return;", "  const motivo = semMotivo(\"Por que reabrir a turma?\", lugar) || \"x\";\n  if (!motivo) return;"]],
  ["deixar o docente inscrever", ["${geral && aberta ? `<div class=\"cons-painel\"><div class=\"input-group\"><label for=\"${p}Inscrever\">", "${aberta ? `<div class=\"cons-painel\"><div class=\"input-group\"><label for=\"${p}Inscrever\">"]],
  ["mostrar os atos da Academia na minha", ["if (atos && c.situacao === \"CONCLUIDO\") botoes.push", "if (c.situacao === \"CONCLUIDO\") botoes.push"]],
  ["mostrar o diploma no perfil", ["if ((acoes || proprio) && c.diploma && c.diploma.certificadoId)", "if (c.diploma && c.diploma.certificadoId)"]],
  ["mostrar o bloco a quem não tem nada", ["if (semTemAlgo(data)) partes.push", "partes.push"]],
  ["esquecer o perfil na saída", ["\"semMinhaTurma\",\n    \"semHistoricoPerfil\",", "\"semMinhaTurma\",\n   "]],
  ["esquecer o que foi digitado na saída", ["\"semDiscCarga\", \"semDiscEmenta\", \"semReqAlvo\"]", "\"semDiscCarga\", \"semDiscEmenta\"]"]],
  ["não conferir o login depois do pedido", ["return authToken === token ? data : null;", "return data;"]],
  ["não conferir o pedido mais recente do painel", ["if (data === null || pedido !== semPedidoPainel) return;", "if (data === null) return;"]],
  ["não conferir a pessoa do perfil", ["if (data === null || pedido !== semPedidoPerfil || String(window._membroPerfilAtual) !== String(membroId)) return;", "if (data === null) return;"]],
  ["deixar o duplo clique gravar duas vezes", ["    if (semOcupado) { semMensagem(\"Aguarde: a gravação anterior ainda está em andamento.\", lugar, { turma }); return null; }", ""]],
  ["deixar a própria disciplina nos pré-requisitos", ["c.disciplinas.filter((d) => d.disciplinaId !== proprio)", "c.disciplinas"]],
  ["não mandar o documento conferido", ["documentoConferido: semEl(\"semAprDocumento\").checked", "documentoConferido: false"]]
];

(async () => {
  const r = await prova();
  console.log(`\nprova da tela da v8.7 (seminário): ${r.total - r.falhas}/${r.total} verificações ok${r.falhas ? ` — ${r.falhas} FALHA(S)` : ""}`);
  let mutFalhou = 0;
  if (process.env.MUTAR) {
    const fonte = lerApp("modulos/seminario.js");
    for (const [nome, [de, para]] of MUTACOES) {
      if (fonte.split(de).length !== 2) throw new Error(`mutação inaplicável: ${nome}`);
      MUTADO = fonte.split(de).join(para);
      process.env.CALADO = "1";
      let m;
      try { m = await prova(); } catch (e) { m = { falhas: 1 }; }
      delete process.env.CALADO;
      MUTADO = null;
      console.log(`  mutação "${nome}": ${m.falhas ? `acusada (${m.falhas} falha(s))` : "NÃO acusada"}`);
      if (!m.falhas) mutFalhou++;
    }
  }
  process.exitCode = r.falhas || mutFalhou ? 1 : 0;
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
