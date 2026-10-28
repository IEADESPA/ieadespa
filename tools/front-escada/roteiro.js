// roteiro.js — prova da tela da v8.2 (Escada ministerial) sem navegador: o index.html de verdade, o eventos.js, o modulos/consagracoes.js e o modulos/afm.js inteiros e as
// funções reais que a escada tocou em pessoas.js (preencher e salvar o cadastro) e meu-painel.js (a data de Meus Dados), num DOM simulado (tools/front-cuidado/ambiente.js).
// As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-51 com os handlers e o banco REAIS (`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro
// e2e-51-escada-fluxos.js` em tools/e2e-localdb) — com texto de ataque em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-escada).
"use strict";
const { criarAmbiente, extrair, lerApp } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

// Todo texto que vem de gente ou do servidor (nome, rótulo, detalhe, motivo do veto, ato...) ganha o ataque; códigos e datas ficam (a tela os usa como chave).
const CAMPOS_TEXTO = ["nome", "congregacao", "cargoNome", "proponente", "assunto", "rotulo", "detalhe", "artigo", "alvoRotulo", "cargoAlvoRotulo", "vetoAFMMotivo", "atoReferencia", "nivelExigido", "mensagem"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => envenenar(x));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k); return o; }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
const TIPOS = [{ nome: "Consagração a Auxiliar", ativo: true }, { nome: "Separação ao Diaconato", ativo: true }, { nome: "Consagração a Pastor", ativo: true }];

function montar({ geral = true, gerais } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  amb.ctx.URLSearchParams = URLSearchParams;   // o navegador tem; o contexto da prova, não
  const { ev } = amb;
  ev(extrair("script.js", ["jsonDaTela", "avisarResultado", "pedirTexto", "geralPara"]), "script.js(extra)");
  // v8.2: o login diz em quais permissões a sessão é do nível geral (o prelude do ambiente não conhece esta variável)
  ev(`var authPermissoesGerais = ${JSON.stringify(gerais || (geral ? ["afm", "consagracoes", "pessoas"] : []))};`, "permissoes-gerais");
  ev(extrair("modulos/pessoas.js", ["editarPessoa", "salvarPessoa", "limparFormPessoa", "travarCamposDoGeralPessoa", "mudouCargoPessoaAcao", "nomeCargoPorSigla"]), "pessoas.js(extraido)");
  ev("async function carregarPessoas() {}", "stub: a lista de pessoas não é desta prova");
  ev(extrair("modulos/meu-painel.js", ["formatarValorLgpd"]), "meu-painel.js(extraido)");
  ev(lerApp("modulos/consagracoes.js"), "consagracoes.js");
  ev(lerApp("modulos/afm.js"), "afm.js");
  ev("registrarAcoes({ mudouCargoPessoaAcao });", "acoes-pessoas");
  amb.sessao({ matricula: 1002, token: "tok", nivel: geral ? "GLOBAL" : "CONGREGACAO", permissoes: ["afm", "consagracoes", "pessoas"], geral });
  Object.assign(amb.api.rotas, {
    "GET catalogos/tiposConsagracao": { corpo: TIPOS },
    "GET consagracoes": { corpo: [...R.listaEmAndamento, ...R.listaConsagracoes] },
    "GET afm/catalogos": { corpo: { sucesso: true, niveis: [{ codigo: "BASICO", rotulo: "Básico" }, { codigo: "MEDIO", rotulo: "Médio" }, { codigo: "AVANCADO", rotulo: "Avançado" }, { codigo: "BACHAREL", rotulo: "Bacharel Livre" }], motivosAceitos: [], motivosVedados: [] } },
    "GET afm/matriculas": { corpo: { ...R.matriculas, geral } },
    "GET afm/vetaveis": geral ? { corpo: R.vetaveis } : { status: 403, corpo: { sucesso: false, mensagem: "Esta função é da administração geral da igreja." } }
  });
  amb.__requisitos = R.requisitosTravados;
  amb.__protocolo = { status: 200, corpo: { sucesso: false, mensagem: R.requisitosTravados.requisitos.mensagemBloqueio, requisitos: R.requisitosTravados.requisitos } };
  amb.api.servidor = (c) => {
    if (c.chave === "GET escada/requisitos") return { corpo: amb.__requisitos };
    if (c.chave === "POST consagracoes") return amb.__protocolo;
    if (/^consagracoes\/[^/]+\/evoluir$/.test(c.caminho)) return { corpo: R.avancarTravado };
    if (c.metodo === "POST") return { status: 200, corpo: { sucesso: true, mensagem: "ok" } };
    return null;
  };
  return amb;
}
const semAtaque = (amb, onde) => ok(amb.ctx.__xss.chamadas.length === 0 && amb.doc._ataques.length === 0, `${onde}: nenhum texto do servidor virou código`, { xss: amb.ctx.__xss.chamadas, ataques: amb.doc._ataques.slice(0, 3) });
const botoes = (amb, raizId, acao) => { const raiz = amb.e(raizId); return raiz ? [...raiz.descendentes()].filter((b) => b.getAttribute("data-on-click") === acao) : []; };
const botaoComTexto = (amb, raizId, texto) => { const raiz = amb.e(raizId); return raiz ? [...raiz.descendentes()].find((b) => b.localName === "button" && b.textContent.includes(texto)) : null; };
const posts = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "POST" && c.caminho === caminho);
const opcoes = (amb) => amb.e("consagracaoModalidade").options;

(async () => {
  console.log("== contrato real ==");
  for (const k of ["requisitosCandidatoSemMatricula", "requisitosCandidatoPronto", "requisitosTravados", "protocoloCriado", "listaEmAndamento", "listaConsagracoes", "matriculas", "vetaveis", "pessoa", "avancarTravado"]) {
    ok(REAL[k] != null, `o e2e-51 gravou a resposta real de ${k}`);
  }
  ok(REAL.requisitosTravados.requisitos.itens.every((i) => ["chave", "rotulo", "artigo", "situacao", "detalhe"].every((c) => c in i)), "requisitos: os campos que a tela lê");
  ok(REAL.listaEmAndamento.every((c) => "cargoAlvo" in c && "modalidade" in c && "vetoAFMEm" in c), "lista: destino, modalidade e veto");
  ok(REAL.vetaveis.itens.length > 0 && REAL.vetaveis.itens.every((p) => "consagracaoId" in p && "cargoAlvoRotulo" in p), "vetáveis: os campos que a tela lê");
  ok(REAL.matriculas.itens.every((m) => "chm" in m && "chmEm" in m && "nivelamento" in m && "origem" in m), "matrículas: CHM, nivelamento e origem");
  ok("sexo" in REAL.pessoa && "cargoDesde" in REAL.pessoa, "cadastro: sexo e 'no cargo desde'");
  ok(REAL.avancarTravado.sucesso === false && REAL.avancarTravado.requisitos, "o avanço travado traz a lista");

  console.log("== Consagrações: modalidade por nível ==");
  let amb = montar({ geral: false });
  await amb.g("carregarTiposConsagracao")();
  await amb.ocioso();
  let op = opcoes(amb);
  ok(op.filter((o) => o.classList.contains("so-geral-escada")).every((o) => o.hidden && o.disabled), "fora do nível geral, nomeação e outra convenção somem");
  ok(amb.e("grupoConsagracaoAto").style.display === "none", "o campo do ato fica escondido na indicação");
  amb = montar({ geral: true });
  await amb.g("carregarTiposConsagracao")();
  await amb.ocioso();
  op = opcoes(amb);
  ok(op.filter((o) => o.classList.contains("so-geral-escada")).every((o) => !o.hidden && !o.disabled), "no nível geral, aparecem");
  amb.doc.escolher(amb.e("consagracaoModalidade"), "NOMEACAO_PRESIDENCIAL");
  ok(amb.e("grupoConsagracaoAto").style.display === "block" && /ato da Presidência/.test(amb.e("rotuloConsagracaoAto").textContent), "nomeação: pede a referência do ato");
  amb.doc.escolher(amb.e("consagracaoModalidade"), "OUTRA_CONVENCAO");
  ok(/convenção de origem/.test(amb.e("rotuloConsagracaoAto").textContent), "outra convenção: pede a igreja ou convenção de origem");

  console.log("== Conferir requisitos ==");
  amb.doc.escolher(amb.e("consagracaoModalidade"), "INDICACAO");
  amb.doc.digitar(amb.e("consagracaoMatricula"), "9204");
  amb.doc.escolher(amb.e("consagracaoAssunto"), "Separação ao Diaconato");
  amb.doc.digitar(amb.e("consagracaoProponente"), "1002");
  amb.limparRegistro();
  amb.doc.clicar(botaoComTexto(amb, "abaConsagracoes", "Conferir requisitos"));
  await amb.ocioso();
  const pedido = amb.api.chamadas.find((c) => c.chave === "GET escada/requisitos");
  ok(pedido && pedido.consulta.membroId === "9204" && pedido.consulta.assunto === "Separação ao Diaconato" && pedido.consulta.modalidade === "INDICACAO", "pede a conferência com matrícula, tipo e modalidade", pedido && pedido.consulta);
  let caixa = amb.e("consagracaoRequisitos").textContent;
  ok(/ainda não pode seguir/.test(caixa) && /falta/.test(caixa) && /Art\. 71, III/.test(caixa), "mostra a lista: não pode seguir, o que falta e o artigo", caixa.slice(0, 200));
  ok(caixa.includes(ATAQUE), "rótulo e detalhe aparecem como TEXTO");
  semAtaque(amb, "requisitos");
  amb.doc.digitar(amb.e("consagracaoMatricula"), "9205");
  ok(amb.e("consagracaoRequisitos").innerHTML === "", "mudou a matrícula: a lista antiga some");
  // resposta atrasada: a matrícula muda enquanto a conferência volta — a lista velha não aparece
  const ret = amb.retem((c) => c.chave === "GET escada/requisitos");
  amb.doc.clicar(botaoComTexto(amb, "abaConsagracoes", "Conferir requisitos"));
  await amb.ocioso();
  amb.doc.digitar(amb.e("consagracaoMatricula"), "9206");
  ret.liberar();
  await amb.ocioso();
  ok(amb.e("consagracaoRequisitos").innerHTML === "", "resposta atrasada de outra matrícula é descartada");
  amb.__requisitos = R.requisitosCandidatoPronto;
  amb.doc.clicar(botaoComTexto(amb, "abaConsagracoes", "Conferir requisitos"));
  await amb.ocioso();
  ok(/pode seguir/.test(amb.e("consagracaoRequisitos").textContent) && !/ainda não/.test(amb.e("consagracaoRequisitos").textContent), "quem atende: 'pode seguir'");

  console.log("== Protocolar ==");
  amb.limparRegistro();
  amb.doc.digitar(amb.e("consagracaoMatricula"), "9204");
  amb.g("salvarConsagracao")();
  await amb.ocioso();
  let p = posts(amb, "consagracoes");
  ok(p.length === 1 && p[0].corpo.modalidade === "INDICACAO" && !("atoReferencia" in p[0].corpo), "a indicação vai sem o ato", p[0] && p[0].corpo);
  ok(/ainda não pode seguir/.test(amb.e("consagracaoRequisitos").textContent), "travou: a lista do que falta aparece");
  semAtaque(amb, "protocolo travado");
  amb.limparRegistro();
  amb.doc.escolher(amb.e("consagracaoModalidade"), "NOMEACAO_PRESIDENCIAL");
  amb.g("salvarConsagracao")();
  await amb.ocioso();
  ok(posts(amb, "consagracoes").length === 0 && /ato da Presidência/.test(amb.e("resultadoConsagracao").textContent), "nomeação sem o ato: nem envia");
  amb.doc.digitar(amb.e("consagracaoAto"), "Ato 2/2026");
  amb.__protocolo = { status: 201, corpo: R.protocoloCriado };
  // duplo clique: o segundo envio espera o primeiro
  amb.g("salvarConsagracao")(); amb.g("salvarConsagracao")();
  await amb.ocioso();
  p = posts(amb, "consagracoes");
  ok(p.length === 1 && p[0].corpo.modalidade === "NOMEACAO_PRESIDENCIAL" && p[0].corpo.atoReferencia === "Ato 2/2026", "duplo clique: um envio só, com a modalidade e o ato", p.map((x) => x.corpo));
  ok(amb.e("consagracaoMatricula").value === "" && amb.e("consagracaoAto").value === "" && amb.e("consagracaoModalidade").value === "INDICACAO" && amb.e("grupoConsagracaoAto").style.display === "none", "protocolado: o formulário volta à indicação");

  console.log("== Esteira: destino, modalidade e veto ==");
  await amb.g("carregarConsagracoes")();
  await amb.ocioso();
  const lista = amb.e("resultadoListaConsagracoes").textContent;
  const vet = R.listaConsagracoes.find((c) => c.vetoAFMEm);
  const nom = R.listaEmAndamento.find((c) => c.modalidade === "NOMEACAO_PRESIDENCIAL");
  ok(/Vetado pela AFM/.test(lista) && lista.includes(vet.vetoAFMMotivo), "o processo vetado aparece com o motivo");
  ok(/Nomeação direta do Pastor Presidente/.test(lista) && lista.includes(nom.atoReferencia), "a nomeação aparece com o ato");
  ok(/Presbítero/.test(lista) && /Missionário\(a\)/.test(lista), "o destino de cada processo");
  const avancar = botoes(amb, "resultadoListaConsagracoes", "avancarConsagracaoAcao");
  ok(avancar.length === R.listaEmAndamento.length && !avancar.some((b) => JSON.parse(b.getAttribute("data-args-click"))[0] === vet.consagracaoId), "o vetado não tem 'Avançar'");
  semAtaque(amb, "esteira");
  amb.e("abaConsagracoes").style.display = "block";   // a aba aberta (a lista travada só ganha o foco se estiver visível)
  amb.limparRegistro();
  amb.doc.clicar(avancar[0]);
  await amb.responderModal(true);
  await amb.ocioso();
  ok(posts(amb, `consagracoes/${nom.consagracaoId}/evoluir`).length === 1 && /ainda não pode seguir/.test(amb.e("consagracaoRequisitos").textContent), "avanço travado: a lista do que falta aparece");
  ok(amb.e("consagracaoRequisitos").textContent.includes(nom.nome) && amb.foco() === amb.e("consagracaoRequisitos"), "com o nome de quem é o processo, e a tela vai até ela");
  semAtaque(amb, "avanço travado");

  console.log("== revisão da tela: ocupado, saída, geral só em outra permissão ==");
  const ret2 = amb.retem((c) => c.chave === "GET escada/requisitos");
  amb.doc.digitar(amb.e("consagracaoMatricula"), "9204");
  amb.doc.escolher(amb.e("consagracaoAssunto"), "Separação ao Diaconato");
  amb.doc.digitar(amb.e("consagracaoProponente"), "1002");
  amb.limparRegistro();
  amb.doc.clicar(botaoComTexto(amb, "abaConsagracoes", "Conferir requisitos"));
  await amb.ocioso();
  amb.g("salvarConsagracao")();
  await amb.ocioso();
  ok(/Aguarde/.test(amb.e("resultadoConsagracao").textContent) && posts(amb, "consagracoes").length === 0, "protocolar com a conferência em andamento: avisa 'Aguarde' (não some o clique)");
  ret2.liberar();
  await amb.ocioso();
  ok(/pode seguir/.test(amb.e("consagracaoRequisitos").textContent), "a conferência volta e mostra a lista");
  amb.g("limparSessao")();
  ok(amb.e("consagracaoRequisitos").innerHTML === "" && amb.e("consagracaoMatricula").value === "" && amb.e("resultadoListaConsagracoes").innerHTML === "", "saiu da sessão: a lista de requisitos, o formulário e a esteira somem");
  amb.sessao({ matricula: 1002, token: "tok", nivel: "GLOBAL", permissoes: ["afm", "consagracoes", "pessoas"], geral: true });
  amb.ev(`authPermissoesGerais = ${JSON.stringify(["afm", "consagracoes", "pessoas"])};`);
  const soFin = montar({ geral: true, gerais: ["financeiro"] });
  await soFin.g("carregarTiposConsagracao")();
  await soFin.ocioso();
  ok(opcoes(soFin).filter((o) => o.classList.contains("so-geral-escada")).every((o) => o.hidden && o.disabled), "geral só no financeiro: a nomeação não aparece nas consagrações");
  await soFin.g("carregarConsagracoes")();
  await soFin.ocioso();
  ok(botoes(soFin, "resultadoListaConsagracoes", "avancarConsagracaoAcao").length === 0, "e não ganha 'Avançar'");

  console.log("== Academia: CHM, nivelamento, candidatos e veto ==");
  amb.ev('mostrarAbaSecretaria("afm")');
  await amb.ocioso();
  const tab = amb.e("afmListaMatriculas").textContent;
  ok(/CHM/.test(tab) && /nivelamento obrigatório/.test(tab) && /Candidato/.test(tab), "a lista mostra CHM, nivelamento e candidato");
  semAtaque(amb, "matrículas");
  const filtro = (f) => { amb.doc.clicar([...amb.e("afmFiltrosMatriculas").children].filter((b) => b.nodeType === 1).find((b) => b.getAttribute("data-filtro") === f)); };
  const linhas = () => Math.max(0, [...amb.e("afmListaMatriculas").descendentes()].filter((x) => x.localName === "tr").length - 1);
  filtro("CANDIDATOS"); await amb.ocioso();
  ok(linhas() === R.matriculas.itens.filter((m) => !m.oficial && m.origem === "CANDIDATO" && m.status === "ATIVA").length, "filtro Candidatos");
  filtro("SEM_CHM"); await amb.ocioso();
  ok(linhas() === R.matriculas.itens.filter((m) => !m.chm && m.status === "ATIVA" && (m.oficial || m.origem === "CANDIDATO")).length, "filtro Sem CHM");
  filtro("TODOS"); await amb.ocioso();
  const conceder = botoes(amb, "afmListaMatriculas", "afmFormCHMAcao");
  const revogar = botoes(amb, "afmListaMatriculas", "afmRevogarCHMAcao");
  ok(conceder.length > 0 && revogar.length > 0, "conceder e revogar CHM aparecem para o nível geral");
  amb.limparRegistro();
  amb.doc.clicar(conceder[0]);
  await amb.ocioso();
  amb.doc.clicar(botaoComTexto(amb, "afmForm", "Conceder CHM"));
  await amb.ocioso();
  p = posts(amb, "afm/chm");
  ok(p.length === 1 && p[0].corpo.conceder === true && /^\d{4}-\d{2}-\d{2}$/.test(p[0].corpo.data), "conceder: envia a data", p[0] && p[0].corpo);
  amb.limparRegistro();
  amb.doc.clicar(revogar[0]);
  await amb.responderModal(true);
  await amb.ocioso();
  p = posts(amb, "afm/chm");
  ok(p.length === 1 && p[0].corpo.conceder === false && !("data" in p[0].corpo), "revogar: pede confirmação e envia sem data");
  amb.doc.clicar(amb.e("btnAfmSecaoEscada"));
  await amb.ocioso();
  const vetaveis = amb.e("afmListaVetaveis").textContent;
  ok(vetaveis.includes(R.vetaveis.itens[0].nome) && /Missionário/.test(vetaveis), "a seção Escada lista as indicações vetáveis");
  semAtaque(amb, "vetáveis");
  amb.limparRegistro();
  amb.doc.clicar(botoes(amb, "afmListaVetaveis", "afmFormVetarAcao")[0]);
  await amb.ocioso();
  amb.doc.digitar(amb.e("afmVetoMotivo"), "Reprovou na prova de liturgia");
  amb.doc.clicar(botaoComTexto(amb, "afmForm", "Vetar a indicação"));
  await amb.responderModal(true);
  await amb.ocioso();
  p = posts(amb, "afm/vetar");
  ok(p.length === 1 && String(p[0].corpo.consagracaoId) === String(REAL.vetaveis.itens[0].consagracaoId) && p[0].corpo.motivo === "Reprovou na prova de liturgia", "vetar: confirma e envia o processo e o motivo", p[0] && p[0].corpo);
  semAtaque(amb, "form do veto");
  amb.limparRegistro();
  amb.doc.clicar(botaoComTexto(amb, "afmSecaoEscada", "Matricular candidato"));
  await amb.ocioso();
  amb.doc.digitar(amb.e("afmCandMatricula"), "9201");
  amb.doc.escolher(amb.e("afmCandNivel"), "BASICO");
  amb.doc.clicar(botaoComTexto(amb, "afmForm", "Matricular"));
  await amb.ocioso();
  p = posts(amb, "afm/matricular-candidato");
  ok(p.length === 1 && String(p[0].corpo.membroId) === "9201" && p[0].corpo.nivel === "BASICO", "matricular candidato: envia matrícula e nível", p[0] && p[0].corpo);
  let local = montar({ geral: false });
  local.ev('mostrarAbaSecretaria("afm")');
  await local.ocioso();
  ok(botoes(local, "afmListaMatriculas", "afmFormCHMAcao").length === 0, "fora do nível geral: sem botões de CHM");
  local.doc.clicar(local.e("btnAfmSecaoEscada"));
  await local.ocioso();
  ok(/nível geral/.test(local.e("afmListaVetaveis").textContent), "fora do nível geral: o veto avisa que é do geral");

  console.log("== cadastro da pessoa ==");
  amb.ev(`window._pessoasCache = ${JSON.stringify([{ ...R.pessoa }])}; window._cargosCache = [];`);
  amb.g("editarPessoa")(R.pessoa.membroId);
  ok(amb.e("pessoaSexo").value === R.pessoa.sexo && amb.e("pessoaCargoDesde").value === R.pessoa.cargoDesde, "preenche sexo e 'no cargo desde'");
  ok(!amb.e("pessoaCargoMinisterial").disabled && !amb.e("pessoaCargoDesde").disabled && !amb.e("pessoaDizimista").disabled, "o nível geral pode mudar cargo, data e dízimo");
  amb.limparRegistro();
  amb.g("salvarPessoa")();
  await amb.ocioso();
  p = posts(amb, "pessoas");
  ok(p.length === 1 && p[0].corpo.sexo === R.pessoa.sexo && !("cargoDesde" in p[0].corpo), "salvar sem mudar a data: não reenvia 'no cargo desde'", p[0] && p[0].corpo);
  amb.g("editarPessoa")(R.pessoa.membroId);   // salvar uma pessoa nova limpa o formulário: reabre
  amb.doc.digitar(amb.e("pessoaCargoDesde"), "2018-03-01");
  amb.limparRegistro();
  amb.g("salvarPessoa")();
  await amb.ocioso();
  ok(posts(amb, "pessoas")[0].corpo.cargoDesde === "2018-03-01", "data mudada: vai");
  local = montar({ geral: false });
  local.ev(`window._pessoasCache = ${JSON.stringify([{ ...R.pessoa }])}; window._cargosCache = [];`);
  local.g("editarPessoa")(R.pessoa.membroId);
  ok(local.e("pessoaCargoMinisterial").disabled && local.e("pessoaCargoDesde").disabled && local.e("pessoaDizimista").disabled, "fora do nível geral: cargo, data e dízimo travados");
  local.doc.digitar(local.e("pessoaCargoDesde"), "2018-03-01");
  local.limparRegistro();
  local.g("salvarPessoa")();
  await local.ocioso();
  ok(!("cargoDesde" in posts(local, "pessoas")[0].corpo), "e não envia 'no cargo desde'");

  console.log("== cadastro: troca de cargo, cargo fora do catálogo, geral só em outra permissão ==");
  amb.g("editarPessoa")(R.pessoa.membroId);
  ok([...amb.e("pessoaCargoMinisterial").options].some((o) => o.value === R.pessoa.cargoMinisterial) && amb.e("pessoaCargoMinisterial").value === R.pessoa.cargoMinisterial, "cargo que não está na lista: entra como 'fora do catálogo' e não se perde");
  amb.doc.escolher(amb.e("pessoaCargoMinisterial"), "");
  ok(amb.e("pessoaCargoDesde").value === "" , "trocou o cargo: a data do cargo antigo some");
  amb.doc.escolher(amb.e("pessoaCargoMinisterial"), R.pessoa.cargoMinisterial);
  ok(amb.e("pessoaCargoDesde").value === R.pessoa.cargoDesde && amb.e("pessoaCargoDesdeDica").textContent === "", "voltou ao cargo de antes: a data volta");
  amb.ev(`document.getElementById("pessoaCargoMinisterial").innerHTML += '<option value="PRESBITERO">Presbítero</option>';`);
  amb.doc.escolher(amb.e("pessoaCargoMinisterial"), "PRESBITERO");
  ok(/novo cargo/.test(amb.e("pessoaCargoDesdeDica").textContent), "cargo novo: pede a data do novo cargo");
  amb.doc.digitar(amb.e("pessoaCargoDesde"), R.pessoa.cargoDesde);
  amb.limparRegistro();
  amb.g("salvarPessoa")();
  await amb.ocioso();
  p = posts(amb, "pessoas");
  ok(p.length === 1 && p[0].corpo.cargoMinisterial === "PRESBITERO" && p[0].corpo.cargoDesde === R.pessoa.cargoDesde, "cargo mudou: a data vai mesmo igual à antiga", p[0] && p[0].corpo);
  const finCad = montar({ geral: true, gerais: ["financeiro"] });
  finCad.ev(`window._pessoasCache = ${JSON.stringify([{ ...R.pessoa }])}; window._cargosCache = [];`);
  finCad.g("editarPessoa")(R.pessoa.membroId);
  ok(finCad.e("pessoaCargoMinisterial").disabled && finCad.e("pessoaDizimista").disabled, "geral só no financeiro: cargo e dízimo travados no cadastro");

  console.log("== Meus Dados: data pura sem o dia a menos ==");
  ok(amb.g("formatarValorLgpd")("2026-10-28", "data") === "28/10/2026", "2026-10-28 aparece 28/10/2026");
  ok(amb.g("formatarValorLgpd")(null, "data") === "-", "sem data: '-'");

  console.log(`\nprova da tela da v8.2 (escada): ${total - falhas}/${total} verificações ok`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
