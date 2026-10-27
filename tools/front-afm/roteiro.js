// roteiro.js — prova da tela da v8.1 (AFM e faltas da CLI) sem navegador: o index.html de verdade, o eventos.js, o modulos/afm.js inteiro e as funções reais que ele toca
// em projetos-assembleia.js (abrir reunião, lista, frequência, justificar, aprovar), meu-painel.js (painel e pedido de justificativa), catalogos-estrutura.js (Comissões, CDER),
// reunioes.js e script.js, num DOM simulado (tools/front-cuidado/ambiente.js). As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-47 com os handlers e
// o banco REAIS (`E2E_CONTRATO=1 BASE=cenario-afm bash rodar.sh roteiro e2e-47-afm-fluxos.js` em tools/e2e-localdb) — com texto de ataque em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-afm).
"use strict";
const path = require("path");
const { criarAmbiente, extrair, lerApp } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

// Troca todo texto que é NOME, motivo, titulação, ato, descrição... por um texto de ataque (os códigos e datas ficam: a tela os usa como chave).
const CAMPOS_TEXTO = ["nome", "congregacao", "cargoNome", "cargo", "titulacao", "homologacaoAto", "motivoFim", "descricao", "readmissaoAto", "motivoAnulacao", "texto", "qualificacao",
  "justificativaPendente", "motivoJustificativa", "orgaoNome", "funcao", "detalhe", "nivelExigido", "motivo"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => envenenar(x));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k); return o; }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);

function montar({ geral = true, contrato = R } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  const { ev } = amb;
  ev(extrair("script.js", ["jsonDaTela", "avisarResultado", "pedirTexto"]), "script.js(extra)");
  ev(extrair("modulos/reunioes.js", ["statusFrequencia", "badgeStatusPessoa"]), "reunioes.js(extraido)");
  ev(extrair("modulos/catalogos-estrutura.js", ["sessaoFrequenciaAberta", "tabelaComissaoCalculada", "carregarComissoes", "adicionarMembroCDER", "removerMembroComissaoAcao"]), "catalogos-estrutura.js(extraido)");
  ev(extrair("modulos/projetos-assembleia.js", ["abrirReuniao", "carregarReunioes", "verFrequencia", "justificarFalta", "aprovarJustificativaPendente", "rejeitarJustificativaAcao", "marcarPresencaManual"]), "projetos-assembleia.js(extraido)");
  ev(extrair("modulos/meu-painel.js", ["carregarPainelPessoal", "solicitarJustificativaAcao"]), "meu-painel.js(extraido)");
  ev("function carregarConsentimentoLGPD() {} function carregarMinhasSolicitacoesLGPD() {} function carregarConvocacoesPendentes() {} function carregarComposicaoCLI() {}", "stubs");
  ev(lerApp("modulos/afm.js"), "afm.js");
  ev(`registrarAcoes({ adicionarMembroCDER, removerMembroComissaoAcao, abrirReuniao, verFrequencia, justificarFalta, aprovarJustificativaPendente, rejeitarJustificativaAcao, marcarPresencaManual, solicitarJustificativaAcao });`, "acoes");
  amb.sessao({ matricula: 1002, token: "tok", nivel: "GLOBAL", permissoes: ["afm", "reunioes", "pessoas"], geral });
  const rotas = {
    "GET afm/catalogos": { corpo: contrato.catalogos }, "GET afm/matriculas": { corpo: { ...contrato.matriculas, geral } }, "GET afm/corpo-docente": { corpo: { ...contrato["corpo-docente"], geral } },
    "GET afm/sessoes-magnas": { corpo: contrato["sessoes-magnas"] }, "GET afm/faltas-cli": { corpo: contrato["faltas-cli"] }, "GET afm/minha-situacao": { corpo: contrato["minha-situacao"] },
    "GET comissoes": { corpo: contrato.comissoes }, "GET reunioes": { corpo: contrato["reunioes-cli"] }
  };
  Object.assign(amb.api.rotas, rotas);
  amb.api.servidor = (c) => {
    if (c.metodo === "POST") return { status: 200, corpo: { sucesso: true, mensagem: "ok" } };
    if (/^reunioes\/\d+\/frequencia$/.test(c.caminho)) return { corpo: amb.__frequencia || contrato["frequencia-ordinaria"] };
    if (/^membros\/\d+\/frequencia$/.test(c.caminho)) return { corpo: contrato["minha-frequencia"] };
    return null;
  };
  return amb;
}
const posts = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "POST" && c.caminho === caminho);
const semAtaque = (amb, onde) => { ok(amb.ctx.__xss.chamadas.length === 0 && amb.doc._ataques.length === 0, `${onde}: nenhum texto do servidor virou código`, { xss: amb.ctx.__xss.chamadas, ataques: amb.doc._ataques.slice(0, 3) }); };
const botoes = (amb, raizId, acao) => {
  const raiz = amb.e(raizId);
  return raiz ? [...raiz.descendentes()].filter((b) => b.getAttribute("data-on-click") === acao) : [];
};

(async () => {
  console.log("== contrato real ==");
  for (const k of ["catalogos", "matriculas", "corpo-docente", "sessoes-magnas", "faltas-cli", "minha-situacao", "comissoes", "frequencia-magna", "frequencia-ordinaria", "minha-frequencia", "reunioes-cli"]) {
    ok(REAL[k] && REAL[k] !== null, `o e2e-47 gravou a resposta real de ${k}`);
  }
  ok(REAL.catalogos.motivosVedados.length === 4 && REAL.catalogos.motivosAceitos.length === 5, "catálogo: 5 aceitos e 4 vedados");
  ok(REAL.matriculas.itens.every((m) => "membroId" in m && "status" in m && "nivelAtende" in m && "faltasSeguidas" in m && "licenca" in m), "matrículas: os campos que a tela lê");
  ok(REAL["faltas-cli"].exclusoes.every((e) => "providencias" in e && "vigente" in e && "exclusaoId" in e), "faltas-cli: os campos que a tela lê");
  ok(REAL["frequencia-magna"].sessao.orgaoSigla === "CLI" && REAL["frequencia-magna"].sessao.tipoSessao === "MAGNA_AFM", "a frequência diz o órgão e o tipo");
  ok(REAL["minha-frequencia"].historico.every((h) => "ehCLI" in h), "Minha Frequência diz se a reunião é da CLI");

  console.log("== aba Academia: matrículas ==");
  let amb = montar();
  amb.ev('mostrarAbaSecretaria("afm")');
  await amb.ocioso();
  ok(amb.e("abaAfm").style.display === "block", "a aba abre");
  ok(amb.api.chamadas.some((c) => c.chave === "GET afm/matriculas") && amb.api.chamadas.some((c) => c.chave === "GET afm/catalogos"), "carrega o catálogo e as matrículas");
  const tabela = amb.e("afmListaMatriculas").textContent;
  const inativo = REAL.matriculas.itens.find((m) => m.status === "INATIVA");
  ok(/Inativa/.test(tabela) && /Ativa/.test(tabela), "mostra ativas e inativas");
  ok(tabela.includes(ATAQUE), "o nome aparece como TEXTO (com o ataque escapado)");
  semAtaque(amb, "matrículas");
  ok(botoes(amb, "afmListaMatriculas", "afmFormNivelAcao").length > 0 && botoes(amb, "afmListaMatriculas", "afmFormReprovarAcao").length > 0, "o nível geral vê os atos");
  amb.doc.clicar([...amb.e("afmFiltrosMatriculas").children].filter((b) => b.nodeType === 1).find((b) => b.getAttribute("data-filtro") === "INATIVOS"));
  await amb.ocioso();
  const linhas = [...amb.e("afmListaMatriculas").descendentes()].filter((x) => x.localName === "tr").length - 1;
  ok(linhas === REAL.matriculas.itens.filter((m) => m.status === "INATIVA" && (m.oficial || true)).length, "o filtro Inativos mostra só os inativos", { linhas });
  if (inativo) {
    const rem = botoes(amb, "afmListaMatriculas", "afmFormRematricularAcao")[0];
    ok(!!rem, "o inativo tem 'Nova matrícula…'");
    amb.doc.clicar(rem); await amb.ocioso();
    amb.e("afmRemData").value = "2026-10-20"; amb.e("afmRemObs").value = "Turma de outubro";
    amb.doc.clicar(botoes(amb, "afmForm", "afmEnviarRematricularAcao")[0]); await amb.ocioso();
    const p = posts(amb, "afm/rematricular")[0];
    ok(p && p.corpo.reciclagemAprovadaEm === "2026-10-20" && p.corpo.observacao === "Turma de outubro" && typeof p.corpo.membroId === "number", "nova matrícula manda a data da reciclagem", p && p.corpo);
  }
  const ativo = REAL.matriculas.itens.find((m) => m.status === "ATIVA" && m.oficial);
  amb.doc.clicar([...amb.e("afmFiltrosMatriculas").children].filter((b) => b.nodeType === 1).find((b) => b.getAttribute("data-filtro") === "TODOS")); await amb.ocioso();
  amb.doc.clicar(botoes(amb, "afmListaMatriculas", "afmFormNivelAcao").find((b) => JSON.parse(b.getAttribute("data-args-click"))[0] === ativo.membroId)); await amb.ocioso();
  amb.e("afmNivelSel").selectedIndex = 2; amb.e("afmNivelConcluido").checked = true;
  amb.doc.clicar(botoes(amb, "afmForm", "afmEnviarNivelAcao")[0]); await amb.ocioso();
  const pn = posts(amb, "afm/nivel")[0];
  ok(pn && pn.corpo.membroId === ativo.membroId && pn.corpo.nivel === "AVANCADO" && pn.corpo.concluido === true, "nível: manda o código e o concluído de verdade (booleano)", pn && pn.corpo);
  amb.doc.clicar(botoes(amb, "afmListaMatriculas", "afmFormReprovarAcao")[0]); await amb.ocioso();
  amb.e("afmRepDetalhe").value = "Prova de liturgia do Seminário";
  amb.doc.clicar(botoes(amb, "afmForm", "afmEnviarReprovarAcao")[0]);
  const conf = await amb.responderModal(false); await amb.ocioso();
  ok(conf.aberto && /licença para oficiar/.test(conf.texto) && posts(amb, "afm/reprovar").length === 0, "reprovar pede confirmação; cancelar não manda nada");
  amb.doc.clicar(botoes(amb, "afmForm", "afmEnviarReprovarAcao")[0]);
  await amb.responderModal(true); await amb.ocioso();
  ok(posts(amb, "afm/reprovar")[0] && posts(amb, "afm/reprovar")[0].corpo.detalhe === "Prova de liturgia do Seminário", "confirmado, manda a avaliação");

  console.log("== sem o nível geral: só lê ==");
  amb = montar({ geral: false });
  amb.ev('mostrarAbaSecretaria("afm")'); await amb.ocioso();
  ok(botoes(amb, "afmListaMatriculas", "afmFormNivelAcao").length === 0 && botoes(amb, "afmListaMatriculas", "afmFormReprovarAcao").length === 0, "fora do nível geral, nenhum ato aparece");

  console.log("== Reitor e docentes; Sessões Magnas ==");
  amb = montar();
  amb.ev('mostrarAbaSecretaria("afm"); afmMostrarSecaoAcao("corpo")'); await amb.ocioso();
  const corpo = amb.e("afmCorpo").textContent;
  ok(/Em exercício|aguardando|Vaga|vencido/i.test(corpo), "mostra a situação da Reitoria");
  semAtaque(amb, "corpo docente");
  amb.doc.clicar(botoes(amb, "afmCorpo", "afmFormNomearReitorAcao")[0]); await amb.ocioso();
  amb.e("afmReiMat").value = "9109"; amb.e("afmReiData").value = "2026-10-27";
  amb.doc.clicar(botoes(amb, "afmForm", "afmEnviarNomearReitorAcao")[0]); await amb.ocioso();
  const pr = posts(amb, "afm/nomear-reitor")[0];
  ok(pr && pr.corpo.membroId === 9109 && pr.corpo.dataInicio === "2026-10-27" && !("homologadoCLIEm" in pr.corpo), "nomear sem homologação não manda os campos dela", pr && pr.corpo);
  amb.doc.clicar(botoes(amb, "afmCorpo", "afmFormNomearReitorAcao")[0]); await amb.ocioso();
  amb.e("afmReiMat").value = "9109"; amb.e("afmReiData").value = "2026-10-27"; amb.e("afmReiHom").value = "2026-10-27"; amb.e("afmReiAto").value = "Ata 10/2026";
  amb.doc.clicar(botoes(amb, "afmForm", "afmEnviarNomearReitorAcao")[0]); await amb.ocioso();
  const pr2 = posts(amb, "afm/nomear-reitor")[1];
  ok(pr2 && pr2.corpo.homologadoCLIEm === "2026-10-27" && pr2.corpo.homologacaoAto === "Ata 10/2026", "com homologação, manda a data e a ata");
  amb.ev('afmMostrarSecaoAcao("magnas")'); await amb.ocioso();
  ok(amb.api.chamadas.some((c) => c.chave === "GET afm/sessoes-magnas") && /Sessão Magna/.test(amb.e("afmListaMagnas").textContent), "lista as Sessões Magnas");
  semAtaque(amb, "Sessões Magnas");

  console.log("== CLI: Faltas e cadeiras ==");
  amb = montar();
  await amb.ev("afmCarregarFaltasCLI()"); await amb.ocioso();
  const fc = amb.e("afmFaltasCLI").textContent;
  const vig = REAL["faltas-cli"].exclusoes.filter((e) => e.vigente);
  ok(vig.length > 0 && /excluído em/.test(fc) && /Assembleia Geral Extraordinária/.test(fc) && /Prazo:/.test(fc), "mostra as exclusões com as providências e o prazo da AGE");
  semAtaque(amb, "faltas e cadeiras");
  const comBtn = botoes(amb, "afmFaltasCLI", "afmFormComunicarAcao")[0];
  ok(!!comBtn, "o geral pode registrar a comunicação à CLI");
  amb.doc.clicar(comBtn); await amb.ocioso();
  const exId = JSON.parse(comBtn.getAttribute("data-args-click"))[0];
  amb.e(`afmComData${exId}`).value = "2026-10-27";
  amb.doc.clicar(botoes(amb, "afmFaltasCLI", "afmEnviarComunicarAcao")[0]); await amb.ocioso();
  ok(posts(amb, "afm/comunicar-exclusao")[0] && posts(amb, "afm/comunicar-exclusao")[0].corpo.exclusaoId === exId, "comunicar manda a exclusão e a data");
  amb.doc.clicar(botoes(amb, "afmFaltasCLI", "afmFormReadmitirAcao")[0]); await amb.ocioso();
  const reaId = JSON.parse(botoes(amb, "afmFaltasCLI", "afmEnviarReadmitirAcao")[0].getAttribute("data-args-click"))[0];
  amb.e(`afmReaAto${reaId}`).value = "Ata da CLI 12/2026";
  amb.doc.clicar(botoes(amb, "afmFaltasCLI", "afmEnviarReadmitirAcao")[0]); await amb.ocioso();
  ok(posts(amb, "afm/readmitir")[0] && posts(amb, "afm/readmitir")[0].corpo.ato === "Ata da CLI 12/2026", "readmitir manda o ato");
  amb = montar({ contrato: envenenar({ ...REAL, "faltas-cli": REAL["faltas-cli-inativo"] }) });
  await amb.ev("afmCarregarFaltasCLI()"); await amb.ocioso();
  ok(/inativo na AFM/.test(amb.e("afmFaltasCLI").textContent), "lista quem saiu da CLI por estar inativo na AFM");

  console.log("== abrir reunião: só a CLI manda o tipo ==");
  amb = montar();
  amb.ev('afmAjustarTipoReuniao(true)');
  ok(amb.e("blocoTipoReuniaoCLI").style.display === "block", "na CLI aparece o tipo");
  amb.e("reuniaoOrgao").value = "central:2"; amb.e("descricaoReuniao").value = "Magna"; amb.e("senhaNovaReuniao").value = "1"; amb.e("reuniaoTipoSessao").selectedIndex = 1;
  await amb.ev("abrirReuniao()"); await amb.ocioso();
  ok(posts(amb, "reunioes/abrir")[0] && posts(amb, "reunioes/abrir")[0].corpo.tipoSessao === "MAGNA_AFM", "CLI: manda o tipo escolhido");
  amb.ev('afmAjustarTipoReuniao(false)');
  ok(amb.e("blocoTipoReuniaoCLI").style.display === "none", "nos outros órgãos o tipo some");
  ok(amb.e("descricaoReuniao").value === "" && amb.e("senhaNovaReuniao").value === "", "depois de abrir, a tela limpa a descrição e a senha");
  amb.e("descricaoReuniao").value = "Diretoria"; amb.e("senhaNovaReuniao").value = "2";
  await amb.ev("abrirReuniao()"); await amb.ocioso();
  ok(posts(amb, "reunioes/abrir")[1] && !("tipoSessao" in posts(amb, "reunioes/abrir")[1].corpo), "outros órgãos: não manda tipo");
  await amb.ev("carregarReunioes()"); await amb.ocioso();
  ok(/Sessão Magna \(AFM\)/.test(amb.e("resultadoListaReunioes").textContent) && /Extraordinária/.test(amb.e("resultadoListaReunioes").textContent), "a lista mostra o tipo das reuniões da CLI");
  semAtaque(amb, "lista de reuniões");

  console.log("== justificar pela Secretaria: catálogo; vedados bloqueados; documento na Magna ==");
  amb = montar();
  amb.__frequencia = R["frequencia-magna"];
  const falta = R["frequencia-magna"].frequencia.find((f) => !f.presente && !f.faltaJustificada);
  await amb.ev(`verFrequencia(${R["frequencia-magna"].sessao.sessaoId}, "Magna")`); await amb.ocioso();
  semAtaque(amb, "frequência");
  amb.ev(`justificarFalta(${R["frequencia-magna"].sessao.sessaoId}, ${falta.membroId})`);
  for (let i = 0; i < 40 && amb.e("modalOverlay").classList.contains("escondido"); i++) await amb.ocioso();
  const sel = amb.e("afmJustCodigo");
  const ops = sel ? sel.options : [];
  ok(ops.filter((o) => o.disabled && /vedado/.test(o.textContent)).length === 4, "os 4 motivos vedados aparecem BLOQUEADOS", ops.map((o) => o.textContent));
  ok(!!amb.e("afmJustComprovante"), "na Magna aparece a confirmação do documento");
  sel.selectedIndex = ops.findIndex((o) => o.value === "LUTO");
  amb.doc.clicar(amb.e("modalConfirmar")); await amb.ocioso();
  ok(posts(amb, `reunioes/${R["frequencia-magna"].sessao.sessaoId}/justificar`).length === 0 && amb.toasts().some((t) => /documento/.test(t)), "sem marcar o documento, não envia");
  amb.e("afmJustComprovante").checked = true;
  amb.doc.clicar(amb.e("modalConfirmar")); await amb.ocioso();
  const pj = posts(amb, `reunioes/${R["frequencia-magna"].sessao.sessaoId}/justificar`)[0];
  ok(pj && pj.corpo.codigo === "LUTO" && pj.corpo.comprovanteConferido === true && pj.corpo.membroId === falta.membroId && !("motivo" in pj.corpo), "envia o código, o documento conferido e nada de texto livre", pj && pj.corpo);
  // outro fator externo exige detalhe
  amb.ev(`justificarFalta(${R["frequencia-magna"].sessao.sessaoId}, ${falta.membroId})`);
  for (let i = 0; i < 40 && amb.e("modalOverlay").classList.contains("escondido"); i++) await amb.ocioso();
  amb.e("afmJustCodigo").selectedIndex = amb.e("afmJustCodigo").options.findIndex((o) => o.value === "OUTRO_EXTERNO");
  amb.e("afmJustDetalhe").value = "curto"; amb.e("afmJustComprovante").checked = true;
  amb.doc.clicar(amb.e("modalConfirmar")); await amb.ocioso();
  ok(posts(amb, `reunioes/${R["frequencia-magna"].sessao.sessaoId}/justificar`).length === 1, "'outro fator externo' com detalhe curto: não envia");
  amb.doc.clicar(amb.e("modalCancelar")); await amb.ocioso();
  // reunião de outro órgão: segue o texto livre
  amb.__frequencia = { ...R["frequencia-ordinaria"], sessao: { ...R["frequencia-ordinaria"].sessao, orgaoSigla: "DIRETORIA_EXECUTIVA" } };
  await amb.ev(`verFrequencia(${R["frequencia-ordinaria"].sessao.sessaoId}, "Diretoria")`); await amb.ocioso();
  amb.ev(`justificarFalta(${R["frequencia-ordinaria"].sessao.sessaoId}, 1)`);
  for (let i = 0; i < 40 && amb.e("modalOverlay").classList.contains("escondido"); i++) await amb.ocioso();
  ok(!amb.e("afmJustCodigo") && !!amb.e("modalTexto"), "outros órgãos: continua o texto livre");
  amb.doc.clicar(amb.e("modalCancelar")); await amb.ocioso();

  console.log("== Meu Painel ==");
  amb = montar();
  amb.sessao({ matricula: 9103, token: "pin", pin: true });
  await amb.ev("carregarPainelPessoal('9103')"); await amb.ocioso();
  ok(/faltas seguidas sem justificativa/.test(amb.e("cartaoAfmCli").textContent) && /matrícula/.test(amb.e("cartaoAfmCli").textContent), "Meu Painel mostra a situação na CLI e na AFM");
  semAtaque(amb, "Meu Painel");
  const hist = R["minha-frequencia"].historico.find((h) => h.ehCLI && !h.presente && !h.faltaJustificada && !h.justificativaPendente);
  if (hist) {
    amb.ev(`solicitarJustificativaAcao("9103", ${hist.sessaoId}, true)`);
    for (let i = 0; i < 40 && amb.e("modalOverlay").classList.contains("escondido"); i++) await amb.ocioso();
    ok(!amb.e("afmJustComprovante"), "o pedido do obreiro não tem o campo do documento (quem confere é a Secretaria)");
    amb.e("afmJustCodigo").selectedIndex = amb.e("afmJustCodigo").options.findIndex((o) => o.value === "SAUDE");
    amb.doc.clicar(amb.e("modalConfirmar")); await amb.ocioso();
    const ps = posts(amb, `membros/9103/reunioes/${hist.sessaoId}/solicitar-justificativa`)[0];
    ok(ps && ps.corpo.codigo === "SAUDE" && !("motivo" in ps.corpo), "o pedido manda o código do catálogo", ps && ps.corpo);
  } else ok(true, "(sem falta pendente no contrato para pedir)");

  console.log("== Comissões: CDER ==");
  amb = montar();
  await amb.ev("carregarComissoes()"); await amb.ocioso();
  ok(/Reitor da AFM/.test(amb.e("resultadoListaCDER").textContent) && R.comissoes.CDER.mestres.every((m) => amb.e("resultadoListaCDER").textContent.includes(String(m.membroId))), "a CDER mostra o Reitor e os mestres");
  semAtaque(amb, "CDER");
  amb.e("cderMatricula").value = "9110"; amb.e("cderQualificacao").value = "Mestre em Teologia";
  await amb.ev("adicionarMembroCDER()"); await amb.ocioso();
  ok(posts(amb, "comissoes/cder")[0] && posts(amb, "comissoes/cder")[0].corpo.qualificacao === "Mestre em Teologia", "incluir mestre manda a titulação");
  amb.e("cderQualificacao").value = "";
  await amb.ev("adicionarMembroCDER()"); await amb.ocioso();
  ok(posts(amb, "comissoes/cder").length === 1, "sem titulação: não envia");

  console.log(`\nfront-afm: ${total - falhas}/${total} verificações ok${falhas ? ` — ${falhas} FALHA(S)` : ""}`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.log("ERRO FATAL:", e && e.stack); process.exitCode = 1; });
