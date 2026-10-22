// fixtures.js — o SERVIDOR imitado da v7.12 (Comunicação), com estado (o que a tela grava fica gravado e volta na próxima leitura).
// Não roda o handler nem o banco: é um servidor escrito à mão que devolve as MESMAS formas de api/GestaoComunicacao/index.js e api/shared/comunicacaoDb.js (minhasPreferencias,
// meusComunicados, formatarModelo, opcoes, previa, listarGrupos, enviar, relatorio, listarEnvios) e os mesmos códigos (200/201/400/403/404/409/422/428/429). As REGRAS que decidem o
// que a tela manda são as de verdade: cm.validarCriterios (o grupo), cm.validarModelo e cm.validarTexto (modelo e nome do grupo), db.validarMudancas (as escolhas, com a
// impressão digital do texto) e cm.descreverCriterios (a descrição do grupo). Um critério a mais, um tipo errado ou um campo que o servidor não conhece vira 422, como lá.
// Todo texto que o servidor devolve (rótulos, descrições, o texto da autorização, títulos, corpos, nomes, telefones, grupos, mensagens, até a impressão digital e a chave do modelo)
// leva o texto de ataque ATAQUE(campo): se algum virar marcação, o DOM simulado acusa (e executa o onerror, como o navegador).
// `contratoComOServidor()` confere por escrito, contra o código do servidor, as ações que a tela chama e os campos que ela lê.
"use strict";
const fs = require("fs");
const path = require("path");
const API = path.resolve(__dirname, "../../api");
const cm = require(path.join(API, "shared/comunicacao"));
const db = require(path.join(API, "shared/comunicacaoDb"));

const HORA = 3600000, DIA = 24 * HORA;
// texto de ataque: sai do atributo (aspas), sai da tag (>) e abre uma imagem quebrada com onerror; o nome do campo identifica quem vazou (sem dígitos: o telefone é conferido por dígito)
const ATAQUE = (campo) => `"'><img src=x onerror="window.__xss('${campo}')"><svg onload=window.__xss('${campo}')>[${campo}]`;

// ============================================================================
// O servidor (um por cenário)
// ============================================================================
function criarServidor({ ataque = true, agoraMs = Date.now() } = {}) {
  const A = (campo, base) => (ataque ? `${base} ${ATAQUE(campo)}` : base);
  const iso = (ms) => new Date(ms).toISOString();
  const S = {
    agoraMs, erros: [], fatorOk: false, exigeFator: true, totalPrevia: 42, semNascimento: 3, papeisForcados: null, limitePreferencias: false, limitePrevia: false, fichaDepois: false,
    // quem é quem (o token vira a sessão): 10 = Dirigente da Central (gestão, não geral), 13 = Presidente (geral), 31 = irmã Ana (PIN), 32 = irmão sem e-mail e sem aparelho,
    // 11 = líder com a permissão na tela mas sem gestão no servidor (concessão de Extensão), 14 = outro Dirigente (gestão)
    sessoes: { lid: { membroId: 10, gestao: true, geral: false }, geral: { membroId: 13, gestao: true, geral: true }, pin: { membroId: 31 }, pin2: { membroId: 32 },
      semgestao: { membroId: 11, gestao: false, geral: false }, lid2: { membroId: 14, gestao: true, geral: false } },
    membros: {
      10: { nome: "Dirigente Paulo", congregacaoId: 1, temEmail: true, aparelhos: 1 }, 13: { nome: "Presidente Marcos", congregacaoId: 1, temEmail: true, aparelhos: 2 },
      31: { nome: "Ana Comunicada Silva", congregacaoId: 1, temEmail: true, aparelhos: 1 }, 32: { nome: "Bento Semcontato", congregacaoId: 2, temEmail: false, aparelhos: 0 },
      11: { nome: "Lider Extensao", congregacaoId: 1, temEmail: true, aparelhos: 0 }, 14: { nome: "Dirigente Outro", congregacaoId: 3, temEmail: true, aparelhos: 0 },
      50: { nome: "Carla Ficha", congregacaoId: 1, temEmail: true, aparelhos: 0 }, 60: { nome: "Fora Territorio", congregacaoId: 3, temEmail: true, aparelhos: 0 }
    },
    congregacoes: { 1: A("congNome", "Central"), 2: A("congNomeVila", "Vila Nova"), 3: A("congNomeFora", "Fora") },
    // o texto vigente de cada categoria: a tela recebe "hash" e tem de devolvê-lo IGUAL (com o ataque junto: prova que vai no corpo do POST, não na tela)
    hash: {}, consent: {}, fichas: [], grupos: [], modelos: [], envios: [], entregas: [],
    seq: { grupo: 300, modelo: 20, envio: 700 }
  };
  for (const c of cm.CATEGORIAS_COM_CONSENTIMENTO) S.hash[c] = cm.hashDoTexto(c) + (ataque ? ATAQUE("hash") : "");
  const consentDe = (m) => (S.consent[m] = S.consent[m] || {});
  consentDe(31)["EMAIL|EVENTOS"] = true;
  consentDe(31)["PUSH|FINANCEIRO"] = true;

  // ---- catálogos com ataque ----
  const rotCat = (k) => A(`rotuloCat${k}`, cm.CATEGORIAS[k].rotulo);
  const rotCanal = (k) => A(`rotuloCanal${k}`, cm.CANAIS[k]);
  const catalogoCategorias = () => [...Object.entries(cm.CATEGORIAS).map(([codigo, c]) => ({ codigo, rotulo: rotCat(codigo), descricao: A(`descCat${codigo}`, c.descricao), obrigatoria: !!c.obrigatoria })),
    { codigo: ATAQUE("codigoCat"), rotulo: A("rotuloCatFalsa", "Falsa"), descricao: "x", obrigatoria: false }];
  const catalogoCanais = () => [...Object.entries(cm.CANAIS).map(([codigo]) => ({ codigo, rotulo: rotCanal(codigo) })), { codigo: ATAQUE("codigoCanal"), rotulo: A("rotuloCanalFalso", "Falso") }];
  const situacoes = () => Object.fromEntries(Object.entries(cm.SITUACOES).map(([k, v]) => [k, A(`situacao${k}`, v)]));

  // ---- modelos (forma de formatarModelo) ----
  const novoModelo = (o) => {
    const m = Object.assign({ modeloId: ++S.seq.modelo, chave: `modelo-${S.seq.modelo}`, versao: 1, categoria: "EVENTOS", titulo: "Título", corpo: "Corpo do comunicado.", status: "RASCUNHO",
      criadoEm: iso(agoraMs - 5 * DIA), criadoPor: A("criadoPor", "Presidente Marcos"), aprovadoEm: null, aprovadoPor: null, arquivadoEm: null }, o);
    S.modelos.push(m);
    return m;
  };
  // a impressão digital do texto do modelo (categoria + título + texto): a tela devolve a que viu ao aprovar; mudou no meio = 409
  const hashModelo = (m) => cm.sha256(`${m.categoria}|${m.titulo}|${m.corpo}`) + (ataque ? ATAQUE("hashModelo") : "");
  const formatar = (m) => Object.assign({}, m, { categoriaRotulo: cm.CATEGORIAS[m.categoria] ? rotCat(m.categoria) : A("rotuloCatX", "?"), hash: hashModelo(m) });
  // 21 aprovado (Eventos), 22 aprovado (Convocação), 23 rascunho, 24 arquivado, 25 status desconhecido (texto de ataque no status), modeloId inválido (some da tela)
  S.M = {
    eventos: novoModelo({ chave: A("chaveModelo", "congresso-jovens-a1b2c3"), categoria: "EVENTOS", titulo: A("tituloEventos", "Congresso de jovens"), corpo: A("corpoEventos", "Paz do Senhor, {{primeiro_nome}}! O congresso da {{congregacao}} será no sábado."), status: "APROVADO", aprovadoEm: iso(agoraMs - 4 * DIA), aprovadoPor: A("aprovadoPor", "Presidente Marcos") }),
    convocacao: novoModelo({ chave: "convocacao-ago-d4e5f6", categoria: "CONVOCACAO", titulo: A("tituloConvocacao", "Convocação da AGO"), corpo: A("corpoConvocacao", "Fica convocada a Assembleia Geral Ordinária, {{primeiro_nome}}."), status: "APROVADO", aprovadoEm: iso(agoraMs - 3 * DIA), aprovadoPor: A("aprovadoPor", "Presidente Marcos") }),
    rascunho: novoModelo({ chave: "devocional-semanal-112233", categoria: "DEVOCIONAL", titulo: A("tituloRascunho", "Devocional da semana"), corpo: A("corpoRascunho", "Leitura de hoje: Salmo 23."), status: "RASCUNHO" }),
    arquivado: novoModelo({ chave: "campanha-antiga-445566", categoria: "FINANCEIRO", titulo: A("tituloArquivado", "Campanha antiga"), corpo: A("corpoArquivado", "Prestação de contas antiga."), status: "ARQUIVADO", arquivadoEm: iso(agoraMs - DIA) }),
    estranho: novoModelo({ chave: "estranho-778899", titulo: A("tituloEstranho", "Modelo estranho"), corpo: A("corpoEstranho", "Texto estranho."), status: ATAQUE("statusModelo") })
  };
  S.modeloInvalido = { modeloId: "abc", chave: "x", versao: 1, categoria: "EVENTOS", titulo: A("tituloInvalido", "Sem id"), corpo: "x", status: "APROVADO" };

  // ---- opções (forma de db.opcoes) ----
  const opcoesDe = (ses) => ({
    congregacoes: [{ id: 1, nome: S.congregacoes[1] }, { id: 2, nome: S.congregacoes[2] }, { id: "x", nome: A("congInvalida", "Inválida") }],
    areas: [{ id: 100, nome: A("areaNome", "Área 1") }], regioes: [{ id: 200, nome: A("regiaoNome", "Região Leste") }],
    cargos: [{ sigla: "DIAC", nome: A("cargoDiac", "Diácono") }, { sigla: "PRESB", nome: A("cargoPresb", "Presbítero") }, { sigla: ATAQUE("siglaCargo"), nome: A("cargoFalso", "Falso") }],
    departamentos: [{ id: 5, nome: A("depJovens", "Jovens") }, { id: 6, nome: A("depSenhoras", "Senhoras") }], geral: !!ses.geral
  });
  const nomesDe = () => ({ territorio: { 1: S.congregacoes[1], 2: S.congregacoes[2], 100: A("areaNome", "Área 1"), 200: A("regiaoNome", "Região Leste") }, cargos: { DIAC: "Diácono", PRESB: "Presbítero" }, departamentos: { 5: "Jovens", 6: "Senhoras" } });

  // ---- grupos guardados (forma de listarGrupos) ----
  const novoGrupo = (o) => { const g = Object.assign({ audienciaId: ++S.seq.grupo, criadoEm: iso(agoraMs - DIA), criadoPor: A("grupoCriadoPor", "Dirigente Paulo"), dono: 10 }, o); S.grupos.push(g); return g; };
  S.G = {
    diaconos: novoGrupo({ nome: A("grupoNome", "Diáconos da Área 1"), criterios: { territorio: { tipo: "AREA", ids: [100] }, cargos: ["DIAC"], departamentos: [6], lideranca: true, ebdProfessores: false, formacaoVencendoDias: 15, habilitacaoVencendoDias: 0, assembleiaGeral: false } }),
    todos: novoGrupo({ nome: A("grupoNomeTodos", "Todos"), criterios: { territorio: { tipo: "TODAS", ids: [] }, cargos: [], departamentos: [], lideranca: false, ebdProfessores: false, formacaoVencendoDias: null, habilitacaoVencendoDias: null, assembleiaGeral: false } })
  };

  // ---- envios e entregas (formas de listarEnvios, relatorio e meusComunicados) ----
  const novoEnvio = (o) => {
    const e = Object.assign({ envioId: ++S.seq.envio, modeloId: S.M.eventos.modeloId, categoria: "EVENTOS", grupo: A("grupoDesc", "Congregação Central · Diáconos"), total: 18, status: "CONCLUIDO",
      criadoEm: iso(agoraMs - 2 * DIA), concluidoEm: iso(agoraMs - DIA), enviadoPorId: 10, enviadoPor: A("enviadoPor", "Dirigente Paulo"), naFila: 0,
      canais: { SININHO: { ACEITO: 18 }, EMAIL: { ACEITO: 12, SEM_CONSENTIMENTO: 5, SEM_CONTATO: 1 }, PUSH: { ACEITO: 3, SEM_APARELHO: 15 } }, lidos: 9, ciencia: 0, naoAlcancados: [] }, o);
    const m = S.modelos.find(x => x.modeloId === e.modeloId);
    e.titulo = e.titulo || (m ? m.titulo : "?"); e.corpo = e.corpo || (m ? m.corpo : "?"); e.versao = m ? m.versao : 1;
    S.envios.push(e);
    return e;
  };
  S.E = {
    eventos: novoEnvio({}),
    convocacao: novoEnvio({ modeloId: S.M.convocacao.modeloId, categoria: "CONVOCACAO", total: 3, status: "FILA", naFila: 4, enviadoPorId: 13, enviadoPor: A("enviadoPorPres", "Presidente Marcos"),
      canais: { SININHO: { ACEITO: 3 }, EMAIL: { PENDENTE: 2, ACEITO: 1, [ATAQUE("situacaoFalsa")]: 7 }, PUSH: { SEM_APARELHO: 3 } }, lidos: 1, ciencia: 1, naoAlcancadosTotal: 2, naoAlcancadosCortado: false,
      naoAlcancados: [{ membroId: 31, nome: A("naoAlcNome", "Ana Comunicada Silva"), congregacao: A("naoAlcCong", "Central"), telefone: "(91) 98888-7777" + ATAQUE("telefone") },
        { membroId: 32, nome: A("naoAlcNomeSemTel", "Bento Semcontato"), congregacao: A("naoAlcCong", "Vila Nova"), telefone: null }] }),
    antiga: novoEnvio({ modeloId: S.M.convocacao.modeloId, categoria: "CONVOCACAO", total: 50, status: "CONCLUIDO", enviadoPorId: 13, enviadoPor: A("enviadoPorPres", "Presidente Marcos"), criadoEm: iso(agoraMs - 30 * DIA) }),
    cancelado: novoEnvio({ status: "CANCELADO", total: 7 })
  };
  S.envioInvalido = { envioId: "zz", titulo: A("tituloEnvioInvalido", "Sem id"), categoria: "EVENTOS", status: "FILA" };
  // a irmã Ana (31) recebeu: a convocação nova (sem ciência), a antiga (com ciência) e o evento
  S.entregas.push({ membroId: 31, envioId: S.E.convocacao.envioId, cienciaEm: null, lido: false }, { membroId: 31, envioId: S.E.antiga.envioId, cienciaEm: iso(agoraMs - 29 * DIA), lido: true },
    { membroId: 31, envioId: S.E.eventos.envioId, cienciaEm: null, lido: true });

  const comunicadosDe = (membroId) => {
    const p = S.membros[membroId] || { nome: "", congregacaoId: 1 };
    const vars = { nome: p.nome, congregacao: S.congregacoes[p.congregacaoId] };
    return S.entregas.filter(x => x.membroId === membroId).sort((a, b) => b.envioId - a.envioId).map(x => {
      const e = S.envios.find(y => y.envioId === x.envioId);
      return { envioId: e.envioId, categoria: e.categoria, categoriaRotulo: rotCat(e.categoria), titulo: cm.preencher(e.titulo, vars), texto: cm.preencher(e.corpo, vars),
        recebidoEm: e.criadoEm, lido: !!x.lido, cienciaEm: x.cienciaEm, pedeCiencia: e.categoria === "CONVOCACAO" };
    });
  };
  const preferenciasDe = (membroId) => {
    const p = S.membros[membroId] || { temEmail: false, aparelhos: 0 };
    const v = consentDe(membroId);
    const categorias = Object.entries(cm.CATEGORIAS).map(([codigo, c]) => ({
      categoria: codigo, rotulo: rotCat(codigo), descricao: A(`descPref${codigo}`, c.descricao), obrigatoria: !!c.obrigatoria,
      ...(c.obrigatoria ? {} : { texto: A(`textoAut${codigo}`, cm.textoConsentimento(codigo)), versao: A("versao", cm.TEXTO_VERSAO), hash: S.hash[codigo] }),
      canais: Object.fromEntries(Object.keys(cm.CANAIS).map(canal => [canal, c.obrigatoria ? { concedido: true, obrigatoria: true } : { concedido: !!v[`${canal}|${codigo}`], desde: null, origem: v[`${canal}|${codigo}`] ? A("origem", "MEU_PAINEL") : null }]))
    }));
    categorias.push({ categoria: ATAQUE("categoriaPref"), rotulo: A("rotuloPrefFalsa", "Falsa"), descricao: "x", obrigatoria: false, texto: "x", versao: "x", hash: "x", canais: {} });
    return { categorias, canais: catalogoCanais(), temEmail: !!p.temEmail, aparelhos: p.aparelhos };
  };
  const relatorioDe = (e, ses) => {
    const saida = {
      envio: { envioId: e.envioId, titulo: e.titulo, versao: e.versao, categoria: e.categoria, categoriaRotulo: rotCat(e.categoria), grupo: e.grupo, total: e.total, status: e.status,
        criadoEm: e.criadoEm, concluidoEm: e.concluidoEm, enviadoPor: e.enviadoPor },
      canais: e.canais, lidos: e.lidos, ciencia: e.ciencia
    };
    if (e.categoria === "CONVOCACAO") {
      saida.naoAlcancados = e.naoAlcancados.map(p => Object.assign({ membroId: p.membroId, nome: p.nome, congregacao: p.congregacao }, ses.geral ? { telefone: p.telefone } : {}));
      saida.naoAlcancadosTotal = e.naoAlcancadosTotal == null ? e.naoAlcancados.length : e.naoAlcancadosTotal; saida.naoAlcancadosCortado = !!e.naoAlcancadosCortado;
    }
    return saida;
  };

  // ---- respostas ----
  const ok = (corpo, status = 200) => ({ status, corpo: Object.assign({ sucesso: true }, corpo) });
  const falha = (status, mensagem, extra) => ({ status, corpo: Object.assign({ sucesso: false, mensagem: A(`msg${status}`, mensagem) }, extra || {}) });
  const ID = (v) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
  const LEITURAS = ["catalogos", "preferencias", "meus-comunicados", "modelos", "opcoes", "grupos", "envios", "envio"];
  const ESCRITAS = ["preferencias", "ciencia", "modelo", "aprovar-modelo", "arquivar-modelo", "previa", "grupo", "excluir-grupo", "enviar", "cancelar", "ficha"];
  const SO_GERAL_ASSEMBLEIA = ["previa", "grupo", "enviar"];
  const EXIGE_GESTAO = ["modelos", "opcoes", "grupos", "envios", "envio", "modelo", "aprovar-modelo", "arquivar-modelo", "previa", "grupo", "excluir-grupo", "enviar", "cancelar", "ficha"];
  S.recebidos = [];

  function atender(chamada) {
    const m = /^comunicacao\/([a-z-]+)$/.exec(chamada.caminho);
    if (!m) { S.erros.push(`caminho fora da rota: ${chamada.caminho}`); return falha(404, "Ação inválida."); }
    const acao = m[1];
    const ses = S.sessoes[chamada.token];
    if (!ses) return { status: 401, corpo: { sucesso: false, mensagem: "Sessão expirada." } };
    const corpo = chamada.corpo && typeof chamada.corpo === "object" && !Array.isArray(chamada.corpo) ? chamada.corpo : {};
    S.recebidos.push({ acao, metodo: chamada.metodo, corpo, consulta: chamada.consulta, membroId: ses.membroId });
    if (chamada.metodo === "GET" && !LEITURAS.includes(acao)) { S.erros.push(`GET desconhecido: ${acao}`); return falha(404, "Ação inválida."); }
    if (chamada.metodo === "POST" && !ESCRITAS.includes(acao)) { S.erros.push(`POST desconhecido: ${acao}`); return falha(404, "Ação inválida."); }
    if (chamada.metodo === "GET" && chamada.corpoBruto) S.erros.push(`GET com corpo: ${acao}`);
    // os mesmos campos de id do handler: presentes e não inteiros positivos = 400
    for (const campo of ["modeloId", "envioId", "audienciaId", "membroId"]) {
      for (const origem of [corpo, chamada.consulta]) {
        if (campo in origem && origem[campo] != null && origem[campo] !== "" && !(ID(origem[campo]) || (origem === chamada.consulta && /^[1-9]\d*$/.test(origem[campo])))) return falha(400, `${campo} inválido.`);
      }
    }
    const gestao = !!ses.gestao, geral = !!ses.geral;
    if (EXIGE_GESTAO.includes(acao) && !gestao) return falha(403, "Isto é da liderança que envia comunicados. Fale com quem administra as Permissões.");
    if (acao === "ficha" && !geral) return falha(403, "A ficha em papel é lançada pela Secretaria (nível geral), que guarda a ficha.");
    if (SO_GERAL_ASSEMBLEIA.includes(acao) && corpo.criterios && corpo.criterios.assembleiaGeral === true && !geral) return falha(403, "O grupo da Assembleia Geral é do nível geral.");
    if (chamada.metodo === "POST" && (acao === "aprovar-modelo" || acao === "enviar" || acao === "ficha") && S.exigeFator && !S.fatorOk) return { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: A("msg428", "Confirme quem você é.") } };

    if (chamada.metodo === "GET") {
      if (acao === "catalogos") return ok({ categorias: catalogoCategorias(), canais: catalogoCanais(), situacoes: situacoes(), maxGrupo: db.MAX_GRUPO, papeis: S.papeisForcados || { gestao, geral } });
      if (acao === "preferencias") return ok(preferenciasDe(ses.membroId));
      if (acao === "meus-comunicados") return ok({ comunicados: comunicadosDe(ses.membroId) });
      if (acao === "modelos") {
        const lista = S.modelos.filter(x => (geral ? true : x.status === "APROVADO" && x.categoria !== "CONVOCACAO")).map(formatar);
        if (geral) lista.push(S.modeloInvalido);
        lista.sort((a, b) => ({ APROVADO: 0, RASCUNHO: 1 }[a.status] ?? 2) - ({ APROVADO: 0, RASCUNHO: 1 }[b.status] ?? 2) || (b.modeloId - a.modeloId));
        return ok({ modelos: lista });
      }
      if (acao === "opcoes") return ok(opcoesDe(ses));
      if (acao === "grupos") return ok({ grupos: S.grupos.filter(x => geral || x.dono === ses.membroId).map(({ dono, ...g }) => g) });
      if (acao === "envios") {
        const lista = S.envios.filter(x => geral || x.enviadoPorId === ses.membroId).sort((a, b) => b.envioId - a.envioId)
          .map(e => ({ envioId: e.envioId, titulo: e.titulo, categoria: e.categoria, categoriaRotulo: rotCat(e.categoria), grupo: e.grupo, total: e.total, status: e.status, naFila: e.naFila, criadoEm: e.criadoEm, concluidoEm: e.concluidoEm, enviadoPor: e.enviadoPor }));
        lista.push(S.envioInvalido);
        return ok({ envios: lista });
      }
      if (acao === "envio") {
        const id = Number(chamada.consulta.envioId);
        if (!id) return falha(400, "Informe envioId.");
        const e = S.envios.find(x => x.envioId === id);
        if (!e || !(geral || e.enviadoPorId === ses.membroId)) return falha(404, "Não encontrado.");
        return ok(relatorioDe(e, ses));
      }
    }

    if (acao === "preferencias") {
      // a impressão digital que a tela devolveu é a do texto vigente? (a mesma regra de db.validarMudancas, que roda de verdade com a impressão real no lugar)
      const lista = Array.isArray(corpo.mudancas) ? corpo.mudancas.map(x => (x && typeof x === "object" ? Object.assign({}, x, { hash: x.hash === S.hash[x.categoria] ? cm.hashDoTexto(x.categoria) : "texto-velho" }) : x)) : corpo.mudancas;
      const v = db.validarMudancas(lista);
      if (v.problema) return falha(422, v.problema, v.textoMudou ? { textoMudou: true } : {});
      if (S.ocupado) return falha(429, "Outra mudança está sendo gravada. Tente de novo.");
      if (S.limitePreferencias) return falha(429, "Muitas mudanças seguidas. Espere um minuto.");
      let gravadas = 0;
      for (const x of v.mudancas) { const k = `${x.canal}|${x.categoria}`; if (!!consentDe(ses.membroId)[k] !== x.concedido) { consentDe(ses.membroId)[k] = x.concedido; gravadas++; } }
      return ok(Object.assign({ gravadas }, preferenciasDe(ses.membroId)));
    }
    if (acao === "ciencia") {
      const envioId = ID(corpo.envioId);
      if (!envioId) return falha(400, "Informe envioId.");
      const s = S.entregas.find(x => x.membroId === ses.membroId && x.envioId === envioId);
      if (!s) return falha(404, "Não encontrado.");
      const e = S.envios.find(x => x.envioId === envioId);
      if (e.categoria !== "CONVOCACAO") return falha(422, "Só a convocação oficial pede ciência.");
      if (!s.cienciaEm) s.cienciaEm = iso(S.agoraMs);
      s.lido = true;
      return ok({ comunicados: comunicadosDe(ses.membroId) });
    }
    if (acao === "modelo") {
      if (!geral) return falha(403, "Os modelos são a voz da Igreja: só o nível geral escreve e aprova.");
      // a chave que a tela devolve é a que o servidor deu (aqui com o ataque junto): confere por igualdade e valida o resto com a regra de verdade
      const { chave, ...resto } = corpo;
      const v = cm.validarModelo(resto);
      if (v.problema) return falha(422, v.problema);
      const extras = Object.keys(corpo).filter(k => !["chave", "categoria", "titulo", "corpo"].includes(k));
      if (extras.length) S.erros.push(`modelo com campos a mais: ${extras.join(",")}`);
      if (chave != null && chave !== "") {
        const versoes = S.modelos.filter(x => x.chave === chave).sort((a, b) => b.versao - a.versao);
        if (!versoes.length) return falha(404, "Não encontrado.");
        const rascunho = versoes.find(x => x.status === "RASCUNHO");
        if (rascunho) { Object.assign(rascunho, { categoria: v.dados.categoria, titulo: v.dados.titulo, corpo: v.dados.corpo }); return ok({ modelo: formatar(rascunho) }, 201); }
        return ok({ modelo: formatar(novoModelo({ chave, versao: versoes[0].versao + 1, categoria: v.dados.categoria, titulo: v.dados.titulo, corpo: v.dados.corpo })) }, 201);
      }
      return ok({ modelo: formatar(novoModelo({ chave: cm.chaveDoTitulo(v.dados.titulo), categoria: v.dados.categoria, titulo: v.dados.titulo, corpo: v.dados.corpo })) }, 201);
    }
    if (acao === "aprovar-modelo" || acao === "arquivar-modelo") {
      if (!geral) return falha(403, "Só o nível geral aprova modelos.");
      const id = ID(corpo.modeloId);
      if (!id) return falha(400, "Informe modeloId.");
      const mo = S.modelos.find(x => x.modeloId === id);
      if (!mo) return falha(404, "Não encontrado.");
      if (acao === "aprovar-modelo") {
        const extras = Object.keys(corpo).filter(k => !["modeloId", "hash"].includes(k));
        if (extras.length) S.erros.push(`aprovar com campos a mais: ${extras.join(",")}`);
        if (typeof corpo.hash !== "string" || corpo.hash !== hashModelo(mo)) return falha(409, "O texto deste rascunho mudou depois que você o abriu: leia de novo antes de aprovar.");
        if (mo.status !== "RASCUNHO") return falha(422, mo.status === "APROVADO" ? "Este modelo já está aprovado." : "Este modelo está arquivado.");
        S.modelos.filter(x => x.chave === mo.chave && x.status === "APROVADO").forEach(x => { x.status = "ARQUIVADO"; x.arquivadoEm = iso(S.agoraMs); });
        Object.assign(mo, { status: "APROVADO", aprovadoEm: iso(S.agoraMs), aprovadoPor: A("aprovadoPor", "Presidente Marcos") });
        return ok({ modelo: formatar(mo) });
      }
      if (mo.status === "RASCUNHO") { S.modelos.splice(S.modelos.indexOf(mo), 1); return ok({ apagado: true }); }
      if (mo.status === "ARQUIVADO") return falha(422, "Este modelo já está arquivado.");
      Object.assign(mo, { status: "ARQUIVADO", arquivadoEm: iso(S.agoraMs) });
      return ok({});
    }
    if (acao === "previa") {
      const v = cm.validarCriterios(corpo.criterios);
      if (v.problema) return falha(422, v.problema);
      if (!cm.CATEGORIAS[corpo.categoria]) return falha(422, "Escolha a categoria (ou o modelo).");
      if (corpo.categoria === "CONVOCACAO" && !geral) return falha(403, "A convocação oficial só sai pelo nível geral.");
      if (S.limitePrevia) return falha(429, "Muitas contagens seguidas. Espere um minuto.");
      const total = S.totalPrevia;
      return ok({ total, canais: { EMAIL: { receberao: 12, semConsentimento: 25, semContato: 5 }, PUSH: { receberao: 7, semConsentimento: 30, semContato: 5 } },
        grupo: A("grupoPrevia", cm.descreverCriterios(v.criterios, nomesDe())), criterios: v.criterios, semNascimento: corpo.categoria === "CONVOCACAO" ? 0 : S.semNascimento });
    }
    if (acao === "grupo") {
      const nome = cm.validarTexto(corpo.nome, { campo: "o nome do grupo", max: cm.MAX_NOME_GRUPO, min: 3 });
      if (nome.problema) return falha(422, nome.problema);
      const v = cm.validarCriterios(corpo.criterios);
      if (v.problema) return falha(422, v.problema);
      const g = novoGrupo({ nome: A("grupoNomeNovo", nome.texto), criterios: v.criterios, dono: ses.membroId });
      return ok({ audienciaId: g.audienciaId }, 201);
    }
    if (acao === "excluir-grupo") {
      const id = ID(corpo.audienciaId);
      if (!id) return falha(400, "Informe audienciaId.");
      const g = S.grupos.find(x => x.audienciaId === id && (geral || x.dono === ses.membroId));
      if (!g) return falha(404, "Não encontrado.");
      S.grupos.splice(S.grupos.indexOf(g), 1);
      return ok({});
    }
    if (acao === "enviar") {
      const v = cm.validarCriterios(corpo.criterios);
      if (v.problema) return falha(422, v.problema);
      const mo = S.modelos.find(x => x.modeloId === ID(corpo.modeloId) && x.status === "APROVADO");
      if (!mo) return falha(422, "Escolha um modelo aprovado.");
      if (mo.categoria === "CONVOCACAO" && !geral) return falha(403, "A convocação oficial só sai pelo nível geral.");
      // o mesmo envio (modelo + grupo) nos últimos minutos: devolve o que já foi feito
      const chave = JSON.stringify([mo.modeloId, v.criterios, ses.membroId]);
      const igual = S.envios.find(x => x.chaveRepeticao === chave);
      if (igual) return ok(Object.assign({ envioId: igual.envioId, repetido: true }, relatorioDe(igual, ses)), 201);
      const e = novoEnvio({ modeloId: mo.modeloId, categoria: mo.categoria, grupo: A("grupoEnviado", cm.descreverCriterios(v.criterios, nomesDe())), total: S.totalPrevia, status: "FILA", naFila: 19,
        criadoEm: iso(S.agoraMs), concluidoEm: null, enviadoPorId: ses.membroId, enviadoPor: A("enviadoPorNovo", S.membros[ses.membroId].nome),
        canais: { SININHO: { ACEITO: S.totalPrevia }, EMAIL: { PENDENTE: 12 }, PUSH: { PENDENTE: 7 } }, lidos: 0, ciencia: 0, naoAlcancados: [] });
      e.chaveRepeticao = chave;
      return ok(Object.assign({ envioId: e.envioId, repetido: false }, relatorioDe(e, ses)), 201);
    }
    if (acao === "cancelar") {
      const id = ID(corpo.envioId);
      if (!id) return falha(400, "Informe envioId.");
      const e = S.envios.find(x => x.envioId === id && (geral || x.enviadoPorId === ses.membroId));
      if (!e) return falha(404, "Não encontrado.");
      if (e.status !== "FILA") return falha(409, "O envio já terminou.");
      e.status = "CANCELADO"; e.naFila = 0;
      return { status: 200, corpo: { sucesso: true, mensagem: A("msgCancelado", "Envio cancelado: o que ainda estava na fila não sai. O que já foi entregue (e o sininho) fica.") } };
    }
    if (acao === "ficha") {
      const membroId = ID(corpo.membroId);
      if (!membroId) return falha(422, "Informe a matrícula.");
      if (!cm.CANAIS[corpo.canal] || !cm.CATEGORIAS_COM_CONSENTIMENTO.includes(corpo.categoria) || typeof corpo.concedido !== "boolean") return falha(422, "Escolha o canal, a categoria e se a pessoa autorizou.");
      if (typeof corpo.dataFicha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(corpo.dataFicha)) return falha(422, "Informe a data da ficha.");
      if (typeof corpo.fichaReferencia !== "string" || corpo.fichaReferencia.trim().length < 3 || corpo.fichaReferencia.trim().length > 100) return falha(422, "Informe a referência da ficha.");
      const extras = Object.keys(corpo).filter(k => !["membroId", "canal", "categoria", "concedido", "dataFicha", "fichaReferencia"].includes(k));
      if (extras.length) S.erros.push(`ficha com campos a mais: ${extras.join(",")}`);
      const p = S.membros[membroId];
      if (!p || !(geral || p.congregacaoId === S.membros[ses.membroId].congregacaoId)) return falha(404, "Não encontrado.");
      if (S.fichaDepois) return falha(422, "A pessoa mudou esta escolha no sistema depois da data desta ficha: vale o que ela marcou por último. Se ela quer receber de novo, ela marca em Meu Painel ou assina uma ficha nova.");
      const k = `${corpo.canal}|${corpo.categoria}`;
      const mudou = !!consentDe(membroId)[k] !== corpo.concedido;
      consentDe(membroId)[k] = corpo.concedido;
      S.fichas.push(Object.assign({}, corpo));
      return ok({ gravadas: mudou ? 1 : 0, mensagem: A("msgFicha", mudou ? "Ficha lançada." : "Nada mudou: a pessoa já estava assim.") }, 201);
    }
    S.erros.push(`ação sem imitação: ${chamada.metodo} ${acao}`);
    return falha(404, "Ação inválida.");
  }

  const servidor = async (chamada) => {
    try { return atender(chamada); } catch (e) { S.erros.push(String(e && e.stack || e)); return { status: 500, corpo: { sucesso: false, mensagem: "Erro interno." } }; }
  };
  return { S, servidor, A };
}

// ============================================================================
// O contrato: o que a tela chama e lê existe no servidor de verdade
// ============================================================================
function contratoComOServidor() {
  const faltam = [];
  const handler = fs.readFileSync(path.join(API, "GestaoComunicacao/index.js"), "utf8");
  const dbSrc = fs.readFileSync(path.join(API, "shared/comunicacaoDb.js"), "utf8");
  const modulo = fs.readFileSync(path.resolve(__dirname, "../../app/modulos/comunicacao.js"), "utf8");
  const lista = (nome) => { const m = new RegExp(`const ${nome} = \\[([^\\]]+)\\]`).exec(handler); return m ? [...m[1].matchAll(/"([a-z-]+)"/g)].map(x => x[1]) : []; };
  const leituras = lista("LEITURAS"), escritas = lista("ESCRITAS");
  if (leituras.length < 5 || escritas.length < 5) faltam.push("não achei LEITURAS/ESCRITAS no handler");
  const gets = [...modulo.matchAll(/comObter\(["`]([a-z-]+)/g)].map(m => m[1]);
  const posts = [...modulo.matchAll(/comPostar\("([a-z-]+)"/g)].map(m => m[1]);
  for (const a of gets) if (!leituras.includes(a)) faltam.push(`GET ${a} não existe no handler`);
  for (const a of posts) if (!escritas.includes(a)) faltam.push(`POST ${a} não existe no handler`);
  if (new Set(gets).size < 7 || new Set(posts).size < 11) faltam.push(`a tela devia usar 8 leituras e 11 escritas (${new Set(gets).size}/${new Set(posts).size})`);
  // a confirmação reforçada (428) que a tela trata: aprovar o modelo, enviar e lançar a ficha em papel
  const linhaFator = handler.split(/\r?\n/).find(l => /metodo === "POST"/.test(l) && /exigirFatorRecente/.test(l)) || "";
  for (const a of ["aprovar-modelo", "enviar", "ficha"]) if (!linhaFator.includes(`"${a}"`)) faltam.push(`o handler devia pedir a confirmação reforçada em ${a}`);
  // os campos que a tela lê, na forma que o banco devolve
  const campos = ["temEmail", "aparelhos", "obrigatoria", "hash", "versao", "concedido", "pedeCiencia", "cienciaEm", "recebidoEm", "categoriaRotulo", "receberao", "semConsentimento", "semContato",
    "audienciaId", "naFila", "enviadoPor", "repetido", "naoAlcancados", "telefone", "congregacao", "lidos", "ciencia", "aprovadoPor", "aprovadoEm", "chave", "modeloId", "envioId", "textoMudou", "grupo", "total",
    // da revisão de 22/10/2026: a impressão digital do modelo, os sem data de nascimento, a lista cortada e a referência da ficha
    "semNascimento", "naoAlcancadosTotal", "naoAlcancadosCortado", "fichaReferencia"];
  for (const c of campos) if (!new RegExp(`\\b${c}\\b`).test(dbSrc) && !new RegExp(`\\b${c}\\b`).test(handler)) faltam.push(`campo ${c} não aparece no servidor`);
  if (!/papeis: \{ gestao, geral \}/.test(handler)) faltam.push("catalogos devia devolver papeis { gestao, geral }");
  if (!/situacoes: cm\.SITUACOES/.test(handler)) faltam.push("catalogos devia devolver as situações");
  // o 404 do relatório e o textoMudou da recusa
  if (!/textoMudou: true/.test(dbSrc)) faltam.push("salvarPreferencias devia marcar textoMudou");
  if (!/ver\.geral \? \{ telefone/.test(dbSrc)) faltam.push("o telefone de quem não foi alcançado devia ser só do nível geral");
  return faltam;
}

module.exports = { criarServidor, contratoComOServidor, ATAQUE, HORA, DIA };
