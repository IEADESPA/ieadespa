// roteiro.js — prova da tela da v8.3 (Consagração e documentação) sem navegador: o index.html de verdade, o eventos.js, o modulos/consagracoes.js e o modulos/afm.js
// inteiros e o Meus Dados de meu-painel.js, num DOM simulado (tools/front-cuidado/ambiente.js). As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-55
// com os handlers e o banco REAIS (`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-55-consagracao-fluxos.js` em tools/e2e-localdb) — com texto de ataque
// em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-consagracao). MUTAR=1 roda também as mutações (cada uma precisa ser acusada).
"use strict";
const { criarAmbiente, extrair, lerApp } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; if (!process.env.CALADO) console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

// Todo texto que vem de gente ou do servidor ganha o ataque; códigos, datas e números ficam (a tela os usa como chave).
const CAMPOS_TEXTO = ["nome", "congregacao", "proponente", "assunto", "rotulo", "detalhe", "artigo", "alvoRotulo", "cargoAlvoRotulo", "cargoRotulo", "vetoAFMMotivo", "atoReferencia",
  "mensagem", "motivo", "local", "descricao", "homologacaoAto", "motivoCancelamento", "cargoNome", "etapa", "encerramento"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => envenenar(x));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k); return o; }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
const TIPOS = [{ nome: "Consagração a Missionário(a)", ativo: true }];

function montar({ permissoes = ["consagracoes", "afm"], gerais = ["consagracoes", "afm"], mutar } = {}) {
  const amb = criarAmbiente({ semModulo: true, mutar });
  amb.ctx.URLSearchParams = URLSearchParams;
  const { ev } = amb;
  ev(extrair("script.js", ["jsonDaTela", "avisarResultado", "pedirTexto", "geralPara"]), "script.js(extra)");
  ev(`var authPermissoesGerais = ${JSON.stringify(gerais)};`, "permissoes-gerais");
  ev(extrair("modulos/meu-painel.js", ["badgeStatusLgpd", "formatarValorLgpd", "linhaLgpd", "alternarMeusDadosLGPD"]), "meu-painel.js(extraido)");
  // os cartões de outros módulos que o Meus Dados também desenha (voluntariado, menores) têm prova própria
  ev("function volCartaoMeusDados() { return ''; } function volDataParede(x) { return String(x || ''); } function volEsc(x) { return escaparHtmlEbd(x); } function mnrCartaoMeusDados() { return ''; } function mnrCartaoConsentimentosMeusDados() { return ''; }", "stub-cartoes");
  // os documentos (modal de anexos) e o PDF do certificado têm prova própria: aqui só se anota o pedido
  ev("function abrirModalAnexos(tabela, registroId, titulo) { window.__anexos = { tabela, registroId, titulo }; }", "stub-anexos");
  ev("function baixarPdfCertificado(id) { window.__pdf = (window.__pdf || []).concat([id]); }", "stub-pdf");
  ev(MUTADO || lerApp("modulos/consagracoes.js"), "consagracoes.js");
  ev(lerApp("modulos/afm.js"), "afm.js");
  ev("registrarAcoes({ baixarPdfCertificado });", "acoes-stub");
  amb.sessao({ matricula: 1002, token: "tok", nivel: gerais.length ? "GLOBAL" : "CONGREGACAO", permissoes, geral: gerais.length > 0 });
  amb.__lista = [...R.listaFinal];
  Object.assign(amb.api.rotas, {
    "GET catalogos/tiposConsagracao": { corpo: TIPOS },
    "GET turmas-batismo": { corpo: [] },
    "GET candidatos-batismo": { corpo: [] },
    "GET esteira-consagracao/reunioes-cli": { corpo: R.reunioesCLI },
    "GET cerimonias-consagracao": { corpo: R.cerimonias },
    "GET afm/catalogos": { corpo: { sucesso: true, niveis: [], motivosAceitos: [], motivosVedados: [] } },
    "GET afm/matriculas": { corpo: { ...R.matriculas, geral: true } },
    "GET afm/vetaveis": { corpo: { sucesso: true, itens: [] } }
  });
  amb.__fila = R.filaCEISabatina;
  amb.__detalhe = R.detalhePlanejada;
  amb.__respostas = {};
  amb.api.servidor = (c) => {
    if (c.chave === "GET consagracoes") return { corpo: amb.__lista };
    if (c.chave === "GET esteira-consagracao/cei") return { corpo: amb.__fila };
    if (c.chave === "GET cerimonias-consagracao/detalhe") return { corpo: amb.__detalhe };
    if (c.chave === "GET cerimonias-consagracao/diplomas") return { status: 409, corpo: { sucesso: false, mensagem: "Esta cerimônia já foi registrada ou cancelada." } };
    if (/^lgpd\/meus-dados\//.test(c.caminho)) return { corpo: R.meusDados };
    if (amb.__respostas[c.chave]) return amb.__respostas[c.chave];
    if (c.metodo === "POST") return { status: 200, corpo: { sucesso: true, mensagem: "ok" } };
    return null;
  };
  return amb;
}
const semAtaque = (amb, onde) => ok(amb.ctx.__xss.chamadas.length === 0 && amb.doc._ataques.length === 0, `${onde}: nenhum texto do servidor virou código`, { xss: amb.ctx.__xss.chamadas, ataques: amb.doc._ataques.slice(0, 3) });
const todos = (amb, raizId) => { const raiz = amb.e(raizId); return raiz ? [...raiz.descendentes()] : []; };
const botoes = (amb, raizId, acao) => todos(amb, raizId).filter((b) => b.getAttribute("data-on-click") === acao);
const botaoComTexto = (amb, raizId, texto) => todos(amb, raizId).find((b) => b.localName === "button" && b.textContent.includes(texto));
const posts = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "POST" && c.caminho === caminho);
const gets = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "GET" && c.caminho === caminho);
const args = (b) => JSON.parse(b.getAttribute("data-args-click") || "[]");

async function prova() {
  total = 0; falhas = 0;
  console.log("== contrato real ==");
  for (const k of ["envioSemDossie", "listaInicio", "filaCEI", "filaCEISabatina", "homologarFalhou", "reunioesCLI", "homologarOk", "taxaOk", "listaHomologados", "matriculas", "detalhePlanejada",
    "registro", "detalheRealizada", "filaCEIDivorciado", "parecerRecusado", "listaFinal", "cerimonias", "meusDados"]) ok(REAL[k] != null, `o e2e-55 gravou a resposta real de ${k}`);
  ok(REAL.listaFinal.every((c) => ["numero", "temFoto", "documentos", "parecerCEI", "homologadoEm", "taxaPagaEm", "cerimoniaId", "motivoEncerramento", "diplomaCertificadoId", "homologacaoPelaCLI", "taxaEmDia", "dataConclusao"].every((k) => k in c)), "lista: os campos que a tela lê");
  ok(!JSON.stringify(REAL).includes("examinados pelo CEI") && !JSON.stringify(REAL).includes("nada encontrou"), "nenhuma resposta da Secretaria traz a fundamentação do CEI");
  ok(REAL.filaCEISabatina.itens.every((p) => ["sabatina", "escrutinio", "excecaoPastor", "numero", "documentos", "cargoAlvoRotulo"].every((k) => k in p)), "fila do CEI: os campos que o formulário lê");
  ok(REAL.detalhePlanejada.roteiro.posicoes.some((x) => x.casal) && REAL.detalhePlanejada.candidatos.every((p) => "taxa" in p), "detalhe: o casal e a taxa de cada candidato");
  ok(REAL.detalheRealizada.resultado.some((p) => p.diplomaCertificadoId) && REAL.detalheRealizada.resultado.some((p) => p.motivoEncerramento === "AUSENCIA_CERIMONIA"), "realizada: diploma e ausente");
  ok(REAL.matriculas.itens.some((m) => m.chmCertificadoId), "matrículas: o documento do CHM");

  console.log("== quem vê o quê na aba ==");
  let amb = montar({ permissoes: ["cei"], gerais: ["cei"] });
  amb.g("consAbrirAba")();
  await amb.ocioso();
  ok(amb.e("consSecaoSecretaria").hidden && !amb.e("consSecaoCEI").hidden && amb.e("consSecaoCerimonias").hidden, "só o CEI: vê só os pareceres");
  ok(gets(amb, "consagracoes").length === 0 && gets(amb, "cerimonias-consagracao").length === 0 && gets(amb, "esteira-consagracao/cei").length === 1, "e só pede a fila do CEI");
  amb = montar({ permissoes: ["consagracoes"], gerais: [] });
  amb.g("consAbrirAba")();
  await amb.ocioso();
  ok(!amb.e("consSecaoSecretaria").hidden && amb.e("consSecaoCEI").hidden && amb.e("consSecaoCerimonias").hidden, "Dirigente local: a esteira, sem CEI e sem cerimônias");
  ok(gets(amb, "esteira-consagracao/cei").length === 0 && gets(amb, "cerimonias-consagracao").length === 0, "e não pede o que não é dele");
  const linhaTexto = amb.e("resultadoListaConsagracoes").textContent;
  ok(botoes(amb, "resultadoListaConsagracoes", "consDocumentosAcao").length > 0 && botoes(amb, "resultadoListaConsagracoes", "avancarConsagracaoAcao").length === 0
    && botoes(amb, "resultadoListaConsagracoes", "consTaxaAcao").length === 0 && botoes(amb, "resultadoListaConsagracoes", "reprovarConsagracaoAcao").length === 0, "local: só 'Documentos' (sem enviar, taxa, reprovar)");
  ok(/Aguardando homologação/.test(linhaTexto), "e vê a etapa");
  semAtaque(amb, "esteira local");

  console.log("== esteira no nível geral ==");
  amb = montar();
  // três momentos do mesmo e2e: cada processo aparece uma vez (o do início ganha outro id — é o mesmo formato real, noutra etapa)
  const homologados = R.listaHomologados.filter((c) => c.status === "HOMOLOGADO");
  const jaTem = new Set(homologados.map((c) => c.consagracaoId));
  const inicio = R.listaInicio.map((c) => ({ ...c, consagracaoId: c.consagracaoId.replace(/.$/, (x) => (x === "0" ? "1" : "0")) }));
  amb.__lista = [...inicio, ...homologados, ...R.listaFinal.filter((c) => !jaTem.has(c.consagracaoId))];
  amb.g("consAbrirAba")();
  await amb.ocioso();
  const txt = amb.e("resultadoListaConsagracoes").textContent;
  ok(/✖ foto/.test(txt) && /0 documento/.test(txt), "protocolado sem foto e sem documento: aparece o que falta", txt.slice(0, 200));
  ok(/homologa: o Pastor Presidente/.test(txt), "quem homologa (o Diácono: o Pastor Presidente)");
  ok(/Homologado — aguardando a cerimônia/.test(txt) && /taxa R\$ 75,40/.test(txt), "homologado com a taxa (com os centavos)");
  ok(/INAPTO pelo CEI/.test(txt) && /Ausente na cerimônia/.test(txt) && /Consagrado\(a\) em/.test(txt), "os encerrados: INAPTO, ausente, consagrado");
  const diplomas = botoes(amb, "resultadoListaConsagracoes", "baixarPdfCertificado");
  ok(diplomas.length > 0 && diplomas.length === amb.__lista.filter((c) => c.status === "CONCLUIDO" && c.diplomaCertificadoId).length, "o consagrado tem o botão do diploma");
  const enviar = botoes(amb, "resultadoListaConsagracoes", "avancarConsagracaoAcao");
  ok(enviar.length >= 1 && enviar.every((b) => /Enviar ao CEI/.test(b.textContent)), "processo de cargo protocolado: 'Enviar ao CEI' (não 'Avançar')");
  ok(!amb.e("consBarraHomologar").hidden, "há processo aguardando homologação: aparece 'Homologar os marcados'");
  semAtaque(amb, "esteira geral");
  amb.doc.clicar(botoes(amb, "resultadoListaConsagracoes", "consDocumentosAcao")[0]);
  await amb.ocioso();
  const primeiro = amb.g("consagracoesCache")[0];
  ok(amb.ctx.__anexos && amb.ctx.__anexos.tabela === "Consagracoes" && amb.ctx.__anexos.registroId === primeiro.numero && amb.ctx.__anexos.titulo.includes("Documentos da indicação"), "'Documentos' abre os anexos do processo pelo número", amb.ctx.__anexos);
  amb.doc.clicar(diplomas[0]);
  ok((amb.ctx.__pdf || []).length === 1 && Number.isInteger(amb.ctx.__pdf[0]), "'Diploma' baixa o certificado", amb.ctx.__pdf);
  // enviar ao CEI: confirmação com o nome
  amb.e("abaConsagracoes").style.display = "block";
  amb.limparRegistro();
  amb.doc.clicar(enviar[0]);
  const conf = await amb.responderModal(true);
  await amb.ocioso();
  ok(conf.aberto && /Enviar o processo de/.test(conf.texto) && /ao CEI/.test(conf.texto), "pede confirmação: enviar ao CEI", conf.texto);
  ok(amb.api.chamadas.some((c) => c.metodo === "POST" && /evoluir$/.test(c.caminho) && c.corpo.acao === "AVANCAR"), "e envia");

  console.log("== homologação em lote ==");
  amb.limparRegistro();
  amb.g("consAbrirHomologarAcao")();
  ok(/Marque na lista/.test(amb.e("consResultadoEsteira").textContent) && amb.e("consPainelHomologar").hidden, "nada marcado: avisa e não abre");
  const cache = amb.g("consagracoesCache");
  const idx = cache.findIndex((c) => c.status === "AGUARDANDO_PLENARIO");
  amb.doc.marcar(amb.e(`consMarcar_${idx}`), true);
  amb.doc.clicar(botaoComTexto(amb, "consBarraHomologar", "Homologar os marcados"));
  ok(!amb.e("consPainelHomologar").hidden && /^\d{4}-\d{2}-\d{2}$/.test(amb.e("consHomData").value), "marcado: o painel abre com a data de hoje");
  ok(amb.e("consHomSessao").options.length === 1 + R.reunioesCLI.itens.length, "as reuniões da CLI encerradas no seletor");
  amb.g("consHomologarAcao")();
  await amb.ocioso();
  ok(posts(amb, "esteira-consagracao/homologar").length === 0 && /ato do Pastor Presidente ou escolha a reunião/.test(amb.e("consResultadoEsteira").textContent), "sem ato e sem reunião: nem envia");
  amb.doc.digitar(amb.e("consHomAto"), "Lista validada");
  amb.__respostas["POST esteira-consagracao/homologar"] = { status: 422, corpo: R.homologarFalhou };
  amb.g("consHomologarAcao")();
  await amb.ocioso();
  let p = posts(amb, "esteira-consagracao/homologar");
  ok(p.length === 1 && p[0].corpo.ids.length === 1 && p[0].corpo.ids[0] === String(cache[idx].consagracaoId) && p[0].corpo.ato === "Lista validada" && !("sessaoId" in p[0].corpo), "envia só o marcado, com o ato e a data (sem reunião)", p[0] && p[0].corpo);
  ok(!amb.e("consPainelHomologar").hidden && amb.e("consResultadoEsteira").textContent.includes(R.homologarFalhou.resultados[0].mensagem), "recusado: o painel fica e diz o porquê de cada um");
  amb.limparRegistro();
  amb.doc.escolher(amb.e("consHomSessao"), String(R.reunioesCLI.itens[0].sessaoId));
  amb.__respostas["POST esteira-consagracao/homologar"] = { corpo: R.homologarOk };
  amb.g("consHomologarAcao")(); amb.g("consHomologarAcao")();
  await amb.ocioso();
  p = posts(amb, "esteira-consagracao/homologar");
  ok(p.length === 1 && p[0].corpo.sessaoId === R.reunioesCLI.itens[0].sessaoId, "duplo clique: um envio só, agora com a reunião", p.map((x) => x.corpo));
  ok(amb.e("consPainelHomologar").hidden && gets(amb, "consagracoes").length === 1, "homologado: o painel fecha e a lista é relida");
  semAtaque(amb, "homologação");

  console.log("== taxa ==");
  const homologado = cache.find((c) => c.status === "HOMOLOGADO" && c.taxaPagaEm);
  amb.limparRegistro();
  amb.doc.clicar(botoes(amb, "resultadoListaConsagracoes", "consTaxaAcao").find((b) => args(b)[0] === String(homologado.consagracaoId)));
  ok(!amb.e("consPainelTaxa").hidden && amb.e("consTaxaTitulo").textContent.includes(homologado.nome) && Number(amb.e("consTaxaValor").value) === homologado.taxaValor && !amb.e("consTaxaRemover").hidden, "o painel da taxa abre com o que já foi pago e o 'Remover'");
  amb.doc.digitar(amb.e("consTaxaValor"), "70,00");
  amb.doc.escolher(amb.e("consTaxaForma"), "BOLETO");
  amb.__respostas["POST esteira-consagracao/taxa"] = { corpo: R.taxaOk };
  amb.g("consRegistrarTaxaAcao")();
  await amb.ocioso();
  p = posts(amb, "esteira-consagracao/taxa");
  ok(p.length === 1 && p[0].corpo.valor === 70 && p[0].corpo.forma === "BOLETO" && /^\d{4}-\d{2}-\d{2}$/.test(p[0].corpo.pagoEm) && p[0].corpo.consagracaoId === String(homologado.consagracaoId), "envia data, valor (vírgula vira número) e forma", p[0] && p[0].corpo);
  ok(amb.e("consPainelTaxa").hidden, "registrada: o painel fecha");
  amb.g("consTaxaAcao")(String(homologado.consagracaoId));
  amb.limparRegistro();
  amb.g("consRemoverTaxaAcao")();
  await amb.responderModal(true);
  await amb.ocioso();
  ok(posts(amb, "esteira-consagracao/taxa").some((x) => x.corpo.remover === true), "remover: pergunta e envia 'remover'");

  console.log("== pareceres do CEI ==");
  amb = montar({ permissoes: ["cei"], gerais: ["cei"] });
  amb.g("consAbrirAba")();
  await amb.ocioso();
  const ev = R.filaCEISabatina.itens[0];
  ok(/sabatina do Art\. 9º/.test(amb.e("consListaCEI").textContent), "a fila diz o que o parecer pede");
  semAtaque(amb, "fila do CEI");
  amb.doc.clicar(botoes(amb, "consListaCEI", "consDarParecerAcao")[0]);
  ok(!amb.e("consFormParecer").hidden && !amb.e("consParecerSabatina").hidden && amb.e("consParecerEscrutinio").hidden && !amb.e("consParecerHistoricoGrupo").hidden && amb.e("consParecerExcecaoGrupo").hidden, "Evangelista: pede a sabatina; o escrutínio só se marcar o histórico");
  ok(amb.e("consParecerTitulo").textContent.includes(ev.nome), "o formulário diz de quem é");
  amb.doc.marcar(amb.e("consParecerHistorico"), true);
  ok(!amb.e("consParecerEscrutinio").hidden, "marcou o histórico de ruptura: o escrutínio aparece");
  amb.doc.digitar(amb.e("consParecerFundamentacao"), "Examinado pelo CEI.");
  for (const x of ["consSabVida", "consSabFinanceira", "consSabDoutrina", "consEscDocumental"]) amb.doc.marcar(amb.e(x), true);
  amb.doc.escolher(amb.e("consEscFundamento"), "TEMPO_IGNORANCIA");
  amb.doc.escolher(amb.e("consEscRecasado"), "nao");
  amb.limparRegistro();
  amb.__respostas["POST esteira-consagracao/parecer"] = { corpo: { sucesso: true, mensagem: "Parecer APTO registrado." } };
  amb.g("consEnviarParecerAcao")(); amb.g("consEnviarParecerAcao")();
  await amb.ocioso();
  p = posts(amb, "esteira-consagracao/parecer");
  ok(p.length === 1, "duplo clique: um parecer só", p.length);
  ok(p[0] && p[0].corpo.resultado === "APTO" && p[0].corpo.sabatina.alinhamentoDoutrinario === true && p[0].corpo.escrutinio.historico === true && p[0].corpo.escrutinio.recasado === false
    && p[0].corpo.escrutinio.fundamento === "TEMPO_IGNORANCIA" && !("excecaoPastorNaoCasado" in p[0].corpo), "envia a sabatina e o escrutínio marcados", p[0] && p[0].corpo);
  ok(amb.e("consFormParecer").hidden && gets(amb, "esteira-consagracao/cei").length === 1 && gets(amb, "consagracoes").length === 0, "registrado: o formulário fecha e a fila é relida (a esteira não, para quem só tem o CEI)");
  // divorciado: o escrutínio já vem aberto; Pastor não casado: pede o motivo da exceção
  amb.__fila = { ...R.filaCEIDivorciado, itens: R.filaCEIDivorciado.itens.map((x) => ({ ...x, excecaoPastor: true })) };
  await amb.g("consCarregarFilaCEI")();
  amb.doc.clicar(botoes(amb, "consListaCEI", "consDarParecerAcao")[0]);
  ok(!amb.e("consParecerEscrutinio").hidden && amb.e("consParecerHistoricoGrupo").hidden && !amb.e("consParecerExcecaoGrupo").hidden, "divorciado: o escrutínio já aberto; Pastor não casado: o motivo da exceção");
  amb.doc.digitar(amb.e("consParecerFundamentacao"), "Examinado.");
  amb.__respostas["POST esteira-consagracao/parecer"] = { status: 422, corpo: R.parecerRecusado };
  amb.limparRegistro();
  amb.g("consEnviarParecerAcao")();
  await amb.ocioso();
  ok(!amb.e("consFormParecer").hidden && amb.e("consResultadoCEI").textContent.includes(R.parecerRecusado.mensagem), "recusado: o formulário fica e diz o porquê");
  amb.doc.escolher(amb.e("consParecerResultado"), "INAPTO");
  amb.limparRegistro();
  amb.g("consEnviarParecerAcao")();
  const inapto = await amb.responderModal(false);
  await amb.ocioso();
  ok(inapto.aberto && /arquivado/.test(inapto.texto) && posts(amb, "esteira-consagracao/parecer").length === 0, "INAPTO: pede confirmação (arquiva); cancelado, nada vai");
  amb.__respostas["POST esteira-consagracao/parecer"] = { status: 422, corpo: { sucesso: false, mensagem: "Requisitos da escada não atendidos.", requisitos: { alvo: "DIACONO", alvoRotulo: `Diácono ${ATAQUE}`, itens: [{ chave: "chm", rotulo: `CHM ${ATAQUE}`, artigo: "Art. 67", situacao: "FALTA", detalhe: `revogado ${ATAQUE}` }], bloqueado: true } } };
  amb.doc.escolher(amb.e("consParecerResultado"), "APTO");
  amb.g("consEnviarParecerAcao")();
  await amb.ocioso();
  ok(/ainda não pode seguir/.test(amb.e("consRequisitosCEI").textContent), "travou na escada: a lista aparece na seção do CEI");
  semAtaque(amb, "parecer");

  console.log("== cerimônias ==");
  amb = montar();
  amb.g("consAbrirAba")();
  await amb.ocioso();
  const listaCer = amb.e("consListaCerimonias").textContent;
  ok(/Realizada/.test(listaCer) && /Cancelada/.test(listaCer) && /consagrado/.test(listaCer), "a lista das cerimônias");
  amb.limparRegistro();
  amb.g("consCriarCerimoniaAcao")();
  await amb.ocioso();
  ok(posts(amb, "cerimonias-consagracao/criar").length === 0 && /data e o local/.test(amb.e("consResultadoCerimonia").textContent), "sem data e local: nem envia");
  amb.doc.digitar(amb.e("consCerData"), "2026-12-20");
  amb.doc.digitar(amb.e("consCerLocal"), "Templo Sede");
  amb.doc.escolher(amb.e("consCerOcasiao"), "SOLENE_CLI");
  amb.__respostas["POST cerimonias-consagracao/criar"] = { status: 201, corpo: { sucesso: true, cerimoniaId: R.detalhePlanejada.cerimonia.cerimoniaId, mensagem: "Cerimônia criada." } };
  amb.g("consCriarCerimoniaAcao")();
  await amb.ocioso();
  p = posts(amb, "cerimonias-consagracao/criar");
  ok(p.length === 1 && p[0].corpo.dataCerimonia === "2026-12-20" && p[0].corpo.ocasiao === "SOLENE_CLI" && !("valorTaxa" in p[0].corpo), "cria (sem valor: o servidor põe R$ 70,00)", p[0] && p[0].corpo);
  ok(gets(amb, "cerimonias-consagracao/detalhe").length === 1 && !amb.e("consCerimoniaDetalhe").hidden, "e abre o detalhe");
  const det = amb.e("consCerimoniaDetalhe").textContent;
  ok(/Comissão de Unção/.test(det) && /✔ completa/.test(det), "a comissão completa");
  ok(/casal, lado a lado/.test(det) && /diplomação/.test(det) && /Insígnias:/.test(det), "o roteiro: o casal, a diplomação e as insígnias");
  semAtaque(amb, "detalhe da cerimônia");
  const cands = R.detalhePlanejada.candidatos;
  ok(cands.every((c, i) => amb.e(`consPresente_${i}`).checked === !!c.taxa.emDia && amb.e(`consPresente_${i}`).disabled === !c.taxa.emDia), "presença: marcada para quem está em dia; travada para quem não está");
  // registrar: um desmarcado vai como ausente; a pergunta diz quantos perdem o ano
  const desmarcar = cands.findIndex((c) => c.taxa.emDia);
  amb.doc.marcar(amb.e(`consPresente_${desmarcar}`), false);
  amb.limparRegistro();
  amb.__respostas["POST cerimonias-consagracao/registrar"] = { corpo: R.registro };
  amb.__detalhe = R.detalheRealizada;
  amb.g("consRegistrarCerimoniaAcao")();
  const pergunta = await amb.responderModal(true);
  await amb.ocioso();
  p = posts(amb, "cerimonias-consagracao/registrar");
  const emDia = cands.filter((c) => c.taxa.emDia).map((c) => String(c.consagracaoId));
  ok(pergunta.aberto && /1 ausente\(s\) perdem a consagração neste ano/.test(pergunta.texto) && /não pode ser desfeito/.test(pergunta.texto), "a pergunta diz quantos perdem o ano", pergunta.texto);
  ok(p.length === 1 && p[0].corpo.presentes.length === emDia.length - 1 && !p[0].corpo.presentes.includes(String(cands[desmarcar].consagracaoId))
    && p[0].corpo.ausentes.includes(String(cands[desmarcar].consagracaoId)) && p[0].corpo.presentes.length + p[0].corpo.ausentes.length === cands.length, "envia a lista inteira: presentes e ausentes (o desmarcado e quem está fora do prazo)", p[0] && p[0].corpo);
  const res = amb.e("consCerimoniaDetalhe").textContent;
  ok(/Perdeu a consagração neste ano/.test(res) && botoes(amb, "consCerimoniaDetalhe", "baixarPdfCertificado").length >= 1, "registrada: o resultado com o diploma de cada consagrado");
  semAtaque(amb, "cerimônia registrada");
  // de novo a planejada: comissão, incluir, retirar, diplomas, cancelar, editar
  amb.__detalhe = R.detalhePlanejada;
  await amb.g("consAbrirCerimoniaAcao")(R.detalhePlanejada.cerimonia.cerimoniaId);
  amb.limparRegistro();
  amb.doc.digitar(amb.e("consCerComissao"), "9221, 9222 9223;9224");
  amb.g("consSalvarComissaoAcao")();
  await amb.ocioso();
  p = posts(amb, "cerimonias-consagracao/comissao");
  ok(p.length === 1 && JSON.stringify(p[0].corpo.membroIds) === "[9221,9222,9223,9224]" && p[0].corpo.cerimoniaId === R.detalhePlanejada.cerimonia.cerimoniaId, "comissão: matrículas com qualquer separador", p[0] && p[0].corpo);
  if (R.detalhePlanejada.disponiveis.length) {
    amb.limparRegistro();
    amb.doc.marcar(amb.e("consIncluir_0"), true);
    amb.g("consIncluirCandidatosAcao")();
    await amb.ocioso();
    p = posts(amb, "cerimonias-consagracao/incluir");
    ok(p.length === 1 && p[0].corpo.ids[0] === String(R.detalhePlanejada.disponiveis[0].consagracaoId), "incluir: o marcado", p[0] && p[0].corpo);
  }
  amb.limparRegistro();
  amb.doc.clicar(botoes(amb, "consCerimoniaDetalhe", "consRetirarCandidatoAcao")[0]);
  await amb.responderModal(true);
  await amb.ocioso();
  ok(posts(amb, "cerimonias-consagracao/retirar").length === 1, "retirar: confirma e envia");
  amb.limparRegistro();
  amb.g("consBaixarDiplomasAcao")();
  await amb.ocioso();
  ok(gets(amb, "cerimonias-consagracao/diplomas").length === 1 && /já foi registrada/.test(amb.e("consResultadoDetalhe").textContent), "diplomas recusados: a tela diz o porquê");
  amb.limparRegistro();
  amb.g("consCancelarCerimoniaAcao")();
  for (let i = 0; i < 30 && amb.e("modalOverlay").classList.contains("escondido"); i++) await new Promise((r) => setImmediate(r));
  amb.doc.digitar(amb.e("modalTexto"), "Chuva forte");
  await amb.responderModal(true);
  await amb.ocioso();
  p = posts(amb, "cerimonias-consagracao/cancelar");
  ok(p.length === 1 && p[0].corpo.motivo === "Chuva forte", "cancelar: pede o motivo e envia", p[0] && p[0].corpo);
  await amb.g("consAbrirCerimoniaAcao")(R.detalhePlanejada.cerimonia.cerimoniaId);
  amb.limparRegistro();
  amb.doc.digitar(amb.e("consEdLocal"), "Templo Novo");
  amb.doc.digitar(amb.e("consEdValor"), "75,40");
  amb.g("consEditarCerimoniaAcao")();
  await amb.ocioso();
  p = posts(amb, "cerimonias-consagracao/editar");
  ok(p.length === 1 && p[0].corpo.local === "Templo Novo" && p[0].corpo.valorTaxa === 75.4, "editar: local e valor (vírgula vira número)", p[0] && p[0].corpo);

  console.log("== Academia: o documento do CHM; Meus Dados ==");
  amb.ev('mostrarAbaSecretaria("afm")');
  await amb.ocioso();
  const chm = botoes(amb, "afmListaMatriculas", "baixarPdfCertificado");
  ok(chm.length === R.matriculas.itens.filter((m) => m.chm && m.chmCertificadoId).length && chm.length > 0, "o CHM com o botão do certificado");
  amb.e("cxMeusDadosLGPD").style.display = "none";
  await amb.g("alternarMeusDadosLGPD")();
  await amb.ocioso();
  const md = amb.e("cxMeusDadosLGPD").textContent;
  ok(/Processos de consagração/.test(md) && /Ausente na cerimônia/.test(md), "Meus Dados: os processos de consagração", md.slice(0, 120));
  semAtaque(amb, "Academia e Meus Dados");

  console.log("== o que a revisão independente da tela pediu ==");
  ok(/#abaConsagracoes \[hidden\] \{ display: none !important; \}/.test(lerApp("style.css")), "o 'escondido' vence o estilo das barras (no navegador de verdade)");
  let rv = montar();
  rv.g("consAbrirAba")();
  await rv.ocioso();
  const A = R.detalhePlanejada.cerimonia.cerimoniaId;
  const B = R.detalheRealizada.cerimonia.cerimoniaId === A ? A + 1000 : R.detalheRealizada.cerimonia.cerimoniaId;
  await rv.g("consAbrirCerimoniaAcao")(A);
  // abriu B (resposta lenta) e, com A ainda na tela, pediu para cancelar: cancela A, não B
  const retB = rv.retem((c) => c.chave === "GET cerimonias-consagracao/detalhe" && c.consulta.cerimoniaId === String(B));
  rv.__detalhe = { ...R.detalhePlanejada, cerimonia: { ...R.detalhePlanejada.cerimonia, cerimoniaId: B } };
  rv.g("consAbrirCerimoniaAcao")(B);
  await rv.ocioso();
  rv.limparRegistro();
  rv.g("consCancelarCerimoniaAcao")();
  for (let i = 0; i < 30 && rv.e("modalOverlay").classList.contains("escondido"); i++) await new Promise((x) => setImmediate(x));
  retB.liberar();
  await rv.ocioso();
  rv.doc.digitar(rv.e("modalTexto"), "Motivo de teste");
  await rv.responderModal(true);
  await rv.ocioso();
  p = posts(rv, "cerimonias-consagracao/cancelar");
  ok(p.length === 1 && p[0].corpo.cerimoniaId === A, "o cancelamento vai para a cerimônia que estava na tela no clique", p.map((x) => x.corpo));
  // a presença desmarcada sobrevive ao redesenho (salvar a comissão redesenha o detalhe)
  rv.__detalhe = R.detalhePlanejada;
  await rv.g("consAbrirCerimoniaAcao")(A);
  const iDes = R.detalhePlanejada.candidatos.findIndex((c) => c.taxa.emDia);
  rv.doc.marcar(rv.e(`consPresente_${iDes}`), false);
  rv.__respostas["POST cerimonias-consagracao/comissao"] = { corpo: { sucesso: true, mensagem: "Comissão salva." } };
  await rv.g("consSalvarComissaoAcao")();
  await rv.ocioso();
  ok(rv.e(`consPresente_${iDes}`).checked === false && /Comissão salva/.test(rv.e("consResultadoDetalhe").textContent), "a presença desmarcada continua desmarcada depois do redesenho (e a mensagem aparece)");
  // o resultado de cada pessoa aparece depois do registro (a realizada também tem a linha de resultado)
  rv.__respostas["POST cerimonias-consagracao/registrar"] = { corpo: R.registro };
  rv.__detalhe = R.detalheRealizada;
  rv.g("consRegistrarCerimoniaAcao")();
  await rv.responderModal(true);
  await rv.ocioso();
  const linhaRes = rv.e("consResultadoDetalhe") && rv.e("consResultadoDetalhe").textContent;
  ok(!!linhaRes && R.registro.resultados.every((x) => linhaRes.includes(REAL.registro.resultados.find((y) => y.consagracaoId === x.consagracaoId).nome)), "registrada: o resultado de cada pessoa aparece no detalhe", linhaRes);
  // resposta atrasada da fila do CEI depois da saída: descartada
  rv = montar({ permissoes: ["cei"], gerais: ["cei"] });
  const retCEI = rv.retem((c) => c.chave === "GET esteira-consagracao/cei");
  rv.g("consCarregarFilaCEI")();
  await rv.ocioso();
  rv.g("limparSessao")();
  retCEI.liberar();
  await rv.ocioso();
  ok(rv.e("consListaCEI").innerHTML === "" && rv.g("consFilaCEI").length === 0, "a fila do CEI que chega depois da saída não aparece");
  // CEI abaixo do nível geral: uma linha, não a aba vazia
  rv = montar({ permissoes: ["cei"], gerais: [] });
  rv.g("consAbrirAba")();
  await rv.ocioso();
  ok(!rv.e("consAvisoSemSecao").hidden && rv.e("consSecaoCEI").hidden, "CEI fora do nível geral: o aviso no lugar da aba vazia");
  // a lista da escada de quem não foi homologado aparece perto do painel
  rv = montar();
  rv.__lista = R.listaFinal;
  rv.g("consAbrirAba")();
  await rv.ocioso();
  const ci = rv.g("consagracoesCache").findIndex((c) => c.status === "AGUARDANDO_PLENARIO");
  rv.doc.marcar(rv.e(`consMarcar_${ci}`), true);
  rv.g("consAbrirHomologarAcao")();
  rv.doc.digitar(rv.e("consHomAto"), "Ato");
  rv.__respostas["POST esteira-consagracao/homologar"] = { status: 422, corpo: { sucesso: false, mensagem: "0 de 1.", resultados: [{ consagracaoId: "x", nome: `Fulano ${ATAQUE}`, sucesso: false, mensagem: "travou", requisitos: { alvo: "DIACONO", alvoRotulo: "Diácono", itens: [{ chave: "chm", rotulo: "CHM", artigo: "Art. 67", situacao: "FALTA", detalhe: "revogado" }], bloqueado: true } }] } };
  rv.g("consHomologarAcao")();
  await rv.ocioso();
  ok(/ainda não pode seguir/.test(rv.e("consRequisitosEsteira").textContent) && rv.e("consagracaoRequisitos").innerHTML === "", "a lista do que falta vai para perto do painel (não para o formulário do protocolo)");
  semAtaque(rv, "revisão da tela");

  console.log("== saída da sessão ==");
  amb.g("limparSessao")();
  ok(amb.e("consListaCEI").innerHTML === "" && amb.e("consCerimoniaDetalhe").hidden && amb.e("consCerimoniaDetalhe").innerHTML === "" && amb.e("consFormParecer").hidden && amb.e("consPainelTaxa").hidden, "saiu: a fila do CEI, o detalhe da cerimônia e os painéis somem");

  return { total, falhas };
}

const MUTACOES = [
  ["tirar o escape do destino do candidato na cerimônia", ['${escaparHtmlEbd(p.cargoAlvoRotulo || p.cargoAlvo)}${p.modalidade === "OUTRA_CONVENCAO"', '${p.cargoAlvoRotulo || p.cargoAlvo}${p.modalidade === "OUTRA_CONVENCAO"']],
  ["mandar só os presentes (sem a lista de ausentes)", ['{ presentes, ausentes: ausenteIds }', "{ presentes }"]],
  ["mostrar as cerimônias a quem não é do nível geral", ['consEl("consSecaoCerimonias").hidden = !geralPara("consagracoes");', 'consEl("consSecaoCerimonias").hidden = false;']]
];

(async () => {
  const r = await prova();
  console.log(`\nprova da tela da v8.3 (consagração): ${r.total - r.falhas}/${r.total} verificações ok${r.falhas ? ` — ${r.falhas} FALHA(S)` : ""}`);
  let mutFalhou = 0;
  if (process.env.MUTAR) {
    const fonte = lerApp("modulos/consagracoes.js");
    for (const [nome, [de, para]] of MUTACOES) {
      if (fonte.split(de).length !== 2) throw new Error(`mutação inaplicável: ${de}`);
      MUTADO = fonte.split(de).join(para);   // a prova inteira de novo, com o módulo mutado
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

var MUTADO = null;   // o texto do módulo com uma mutação (MUTAR=1); null = o módulo de verdade
