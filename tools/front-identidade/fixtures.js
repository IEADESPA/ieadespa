// fixtures.js — o SERVIDOR imitado da v7.14 (Identidade Visual), com estado (o que a tela grava fica gravado e volta na próxima leitura).
// Não roda o handler nem o banco: é um servidor escrito à mão que devolve as MESMAS formas de api/GestaoIdentidadeVisual/index.js e api/shared/identidadeVisualDb.js
// (painelMembro, painelGestao, detalheCiclo, formatarCiclo, votacaoDoCiclo, resultadoDoCiclo, listarTemas e a resposta de cada ato) e os mesmos códigos (200/201/400/403/404/
// 409/422/428/429), e as formas de api/GestaoEnquetes/index.js (GET ?paraVotar=1, POST {id}/votar, GET e POST da lista da liderança). As REGRAS que decidem o que é aceito são
// as de verdade (api/shared/identidadeVisual.js): calendario, fase, anoAlvoDoDia, podeAbrirCiclo, votacaoFechou, validarTema, validarTextoLivre, conferirTemasUsados, normalizar,
// validarCor, base64CabeNoLimite, conferirImagem, apurar e validarResultado. As listas de ações (LEITURAS, ESCRITAS, EXIGE_GESTAO) e os atos que pedem a confirmação reforçada
// (428) são LIDOS do handler de verdade: se o servidor mudar, o imitado muda junto (ou a leitura falha alto).
// Todo texto que o servidor devolve (temas, sugestões, finalistas, critérios, motivos, observações, nomes, autores, congregações, títulos, descrições, ocasiões, cores, atas,
// mensagens) leva o texto de ataque ATAQUE(campo): se algum virar marcação, o DOM simulado acusa (e executa o onerror, como o navegador).
// `contratoComOServidor()` confere por escrito, contra o código do servidor, as ações que a tela chama, os campos que ela lê e a confirmação reforçada.
"use strict";
const fs = require("fs");
const path = require("path");
const API = path.resolve(__dirname, "../../api");
const iv = require(path.join(API, "shared/identidadeVisual"));

const HANDLER = fs.readFileSync(path.join(API, "GestaoIdentidadeVisual/index.js"), "utf8");
const listaDoHandler = (nome) => {
  const m = new RegExp(`const ${nome} = \\[([^\\]]+)\\]`).exec(HANDLER);
  if (!m) throw new Error(`fixtures: não achei ${nome} no handler`);
  return [...m[1].matchAll(/"([a-z-]+)"/g)].map(x => x[1]);
};
const LEITURAS = listaDoHandler("LEITURAS"), ESCRITAS = listaDoHandler("ESCRITAS"), EXIGE_GESTAO = listaDoHandler("EXIGE_GESTAO");
// a linha do handler que decide o 428: `const pedeFator = metodo === "POST" && ([...].includes(acao) || (acao === "triar" && corpo.decisao === "FINALISTA"));`
const LINHA_FATOR = HANDLER.split(/\r?\n/).find(l => /const pedeFator =/.test(l)) || "";
const FATOR_ACOES = ((/\(\[([^\]]+)\]\.includes\(acao\)/.exec(LINHA_FATOR) || [])[1] || "").match(/[a-z-]+/g) || [];
const FATOR_TRIAR = /acao === "triar" && corpo\.decisao === "FINALISTA"/.test(LINHA_FATOR);
if (!FATOR_ACOES.length) throw new Error("fixtures: não achei a lista de atos com confirmação reforçada no handler");

const HORA = 3600000, DIA = 24 * HORA;
// texto de ataque: sai do atributo (aspas), sai da tag (>) e abre uma imagem quebrada com onerror; o nome do campo identifica quem vazou
const ATAQUE = (campo) => `"'><img src=x onerror="window.__xss('${campo}')"><svg onload=window.__xss('${campo}')>[${campo}]`;
// o endereço assinado da imagem (o de verdade vem do Storage com SAS)
const URL_IMAGEM = (arteId) => `https://armazenamento.exemplo/identidade/arte-${arteId}.png?sv=2024&sig=abc`;
// o mesmo inteiroPositivo do handler (shared/voluntariado.js)
const ID = (v) => ((typeof v === "number" || (typeof v === "string" && /^\d{1,10}$/.test(v.trim()))) && Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 2147483647 ? Number(v) : null);

// ============================================================================
// O servidor (um por cenário)
// ============================================================================
// hoje = o dia de Brasília do servidor (a etapa do ciclo é a data); comCiclo = o ciclo da identidade de 2027 aberto; comAntigo = o de 2026, encerrado, com o resultado
function criarServidor({ ataque = true, hoje = "2026-11-05", comCiclo = true, comAntigo = false } = {}) {
  const A = (campo, base) => (ataque ? `${base} ${ATAQUE(campo)}` : base);
  const S = {
    hoje, erros: [], recebidos: [], fatorOk: false, limiteEnvios: false, ocupado: false, urlImagem: URL_IMAGEM, imagemFalha: null,
    // quem é quem (o token vira a sessão): 13 = Presidente (Diretoria do nível Geral), 10 = líder sem a gestão no servidor, 31 = irmã Ana (PIN, apta), 32 = irmão não apto
    // (PIN), 33 e 34 = outros membros aptos, 14 = Secretário Geral (gestão)
    sessoes: { geral: { membroId: 13, gestao: true }, geral2: { membroId: 14, gestao: true }, semgestao: { membroId: 10, gestao: false }, pin: { membroId: 31 }, pin2: { membroId: 32 }, pin3: { membroId: 33 } },
    aptos: new Set([13, 14, 31, 33, 34]),
    membros: {
      13: { nome: A("nomePresidente", "Presidente Marcos"), congregacao: A("congCentral", "Central") }, 14: { nome: A("nomeSecretario", "Secretário Jonas"), congregacao: null },
      31: { nome: A("nomeAna", "Ana Sugestora Silva"), congregacao: A("congVila", "Vila Nova") }, 33: { nome: A("nomeBento", "Bento Artista"), congregacao: A("congCentral", "Central") },
      34: { nome: A("nomeCarla", "Carla Membro"), congregacao: null }
    },
    ciclos: [], sugestoes: [], cores: [], artes: [], temas: [], enquetes: [],
    seq: { ciclo: 7, sugestao: 200, cor: 400, arte: 500, tema: 600, enquete: 800, pergunta: 900, opcao: 1000, resultado: 1100 }
  };
  const agora = () => new Date(Date.parse(`${S.hoje}T15:00:00Z`));
  const iso = (ms) => new Date(ms).toISOString();
  const nomeDe = (m) => (S.membros[m] ? S.membros[m].nome : null);

  // ---- os dados iniciais ----
  const novoCiclo = (o) => { const c = Object.assign({ cicloId: ++S.seq.ciclo, anoAlvo: 2027, abertoEm: "2026-10-20T13:00:00.000Z", abertoPorId: 13, enqueteId: null, votacaoCriadaEm: null,
    votacaoCriadaPorId: null, apuracao: null, apuradoEm: null, votosTotal: null, tema: null, resultado: null }, o); S.ciclos.push(c); return c; };
  const novaSugestao = (o) => { const s = Object.assign({ sugestaoId: ++S.seq.sugestao, cicloId: S.C.cicloId, membroId: 31, texto: "Tema", textoFinal: null, status: "ENVIADA", parecido: null,
    criterio: null, observacao: null, triadoPorId: null, triadoEm: null, criadaEm: "2026-11-02T12:00:00.000Z", retiradaEm: null, anonimizada: false, opcaoId: null }, o);
    s.normalizado = iv.normalizar(s.texto); S.sugestoes.push(s); return s; };
  const novaArte = (o) => { const a = Object.assign({ arteId: ++S.seq.arte, cicloId: S.C.cicloId, membroId: 31, titulo: null, descricao: null, status: "ENVIADA", motivoRecusa: null,
    criadaEm: "2026-12-03T12:00:00.000Z", temImagem: true, tamanho: 20, tipo: "image/png" }, o); S.artes.push(a); return a; };
  const novoTema = (o) => { const t = Object.assign({ temaUsadoId: ++S.seq.tema, origem: "MANUAL", cicloId: null, registradoPorId: 13, registradoEm: "2026-10-01T12:00:00.000Z", atualizadoPorId: null, atualizadoEm: null }, o);
    t.normalizado = iv.normalizar(t.tema); S.temas.push(t); return t; };
  // os temas já usados (a Secretaria cadastra): texto com ataque, um PROCESSO (o de 2026, quando há o ciclo antigo)
  S.T = {
    t2019: novoTema({ ano: 2019, tema: A("temaUsado2019", "Raízes da fé") }),
    t2020: novoTema({ ano: 2020, tema: "Avante, Igreja!" }),
    t2025: novoTema({ ano: 2025, tema: A("temaUsado2025", "Tempo de colheita"), atualizadoPorId: 14, atualizadoEm: "2026-10-05T12:00:00.000Z" })
  };
  if (comAntigo) {
    S.antigo = novoCiclo({ cicloId: 6, anoAlvo: 2026, abertoEm: "2025-10-15T13:00:00.000Z", enqueteId: null, apuracao: "VENCEDOR", apuradoEm: "2025-12-01T03:00:00.000Z", votosTotal: 50,
      tema: { sugestaoId: 150, texto: A("temaAntigo", "Firmes na rocha"), votos: 30, definidoPor: "VOTACAO", desempate: null } });
    const corAntiga = { corId: 390, cicloId: 6, ordem: 1, nome: A("corAntiga", "Vinho"), hex: "#7A1F2B" };
    S.cores.push(corAntiga);
    const arteAntiga = { arteId: 490, cicloId: 6, membroId: 33, titulo: A("tituloAntiga", "Rocha"), descricao: null, status: "ESCOLHIDA", motivoRecusa: null, criadaEm: "2025-12-05T12:00:00.000Z", temImagem: true, tamanho: 20, tipo: "image/png" };
    S.artes.push(arteAntiga);
    S.antigo.resultado = { resultadoId: 1090, arteId: 490, corId: 390, tema: S.antigo.tema.texto, cor: { nome: corAntiga.nome, hex: corAntiga.hex }, dataCulto: "2025-12-14", ocasiao: "CULTO_ADMINISTRATIVO",
      votosVencedor: 120, presentes: 300, ata: A("ataAntiga", "Ata 12/2025"), registradoPorId: 13, registradoEm: "2025-12-15T12:00:00.000Z" };
    novoTema({ ano: 2026, tema: S.antigo.tema.texto, origem: "PROCESSO", cicloId: 6 });
  }
  if (comCiclo) {
    S.C = novoCiclo({ cicloId: 7, anoAlvo: 2027 });
    S.S = {
      // da irmã Ana (31): uma com ataque e parecida com um tema já usado, uma limpa, uma retirada
      ana1: novaSugestao({ texto: A("sugAna", "Raízes profundas"), parecido: { ano: 2019, tema: A("parecidoTema", "Raízes da fé") } }),
      ana2: novaSugestao({ texto: "Frutos que permanecem" }),
      anaRetirada: novaSugestao({ texto: A("sugRetirada", "Caminhando juntos"), status: "RETIRADA", retiradaEm: "2026-11-03T12:00:00.000Z" }),
      // de outros membros
      bento: novaSugestao({ membroId: 33, texto: A("sugBento", "Luz do mundo") }),
      carla: novaSugestao({ membroId: 34, texto: "Fé que vence" }),
      anonima: novaSugestao({ membroId: null, texto: "(removida a pedido do titular)", anonimizada: true })
    };
  }
  // enquetes comuns (Meu Painel → Votações): uma de opções, uma de texto livre já respondida pela Ana, uma só de uma lista sem ela, uma encerrada, uma vencida
  const novaEnquete = (o, perguntas) => {
    const e = Object.assign({ enqueteId: ++S.seq.enquete, titulo: "Enquete", descricao: null, visibilidade: "SECRETA", publicoTipo: "TODOS_ATIVOS", lista: [], status: "ABERTA",
      dataAbertura: "2026-10-20T12:00:00.000Z", dataFechamentoPrevista: null, criadoPorId: 13, respostas: [], identidade: null, vinculante: false }, o);
    e.perguntas = perguntas.map((p, i) => ({ perguntaId: ++S.seq.pergunta, ordem: i + 1, titulo: p.titulo, tipo: p.tipo, opcoes: (p.opcoes || []).map(t => ({ opcaoId: ++S.seq.opcao, texto: t })) }));
    S.enquetes.push(e);
    return e;
  };
  S.E = {
    dia: novaEnquete({ titulo: A("enqTitulo", "Dia do culto de jovens"), descricao: A("enqDescricao", "Escolha o melhor dia."), dataFechamentoPrevista: "2026-12-01T02:59:00" },
      [{ titulo: A("enqPergunta", "Qual dia?"), tipo: "OPCOES", opcoes: [A("enqOpcaoSab", "Sábado"), "Domingo"] }, { titulo: A("enqPerguntaTexto", "Sugestão de pregador"), tipo: "TEXTO_LIVRE" }]),
    respondida: novaEnquete({ titulo: A("enqRespondida", "Horário da EBD") }, [{ titulo: "Melhor horário?", tipo: "OPCOES", opcoes: ["8h", "9h"] }]),
    lista: novaEnquete({ titulo: A("enqLista", "Só da comissão"), publicoTipo: "LISTA_CUSTOM", lista: [33] }, [{ titulo: "Ok?", tipo: "OPCOES", opcoes: ["Sim", "Não"] }]),
    encerrada: novaEnquete({ titulo: "Encerrada", status: "ENCERRADA" }, [{ titulo: "x", tipo: "OPCOES", opcoes: ["a", "b"] }]),
    vencida: novaEnquete({ titulo: "Vencida", dataFechamentoPrevista: "2026-10-01T12:00:00" }, [{ titulo: "x", tipo: "OPCOES", opcoes: ["a", "b"] }])
  };
  S.E.respondida.respostas.push({ membroId: 31, perguntaId: S.E.respondida.perguntas[0].perguntaId, opcaoId: S.E.respondida.perguntas[0].opcoes[0].opcaoId, textoResposta: null, em: "2026-10-21T13:10:00.000" });

  // ---- regras do servidor (as mesmas consultas de identidadeVisualDb.js, em memória) ----
  const ciclo = (id) => S.ciclos.find(c => c.cicloId === id) || null;
  const cicloDoAno = (ano) => S.ciclos.find(c => c.anoAlvo === ano) || null;
  const faseDe = (c) => iv.fase(c.anoAlvo, S.hoje, { encerrado: !!c.resultado });
  const enquete = (id) => S.enquetes.find(e => e.enqueteId === id) || null;
  const passou = (e) => !!e.dataFechamentoPrevista && agora().getTime() >= Date.parse(`${e.dataFechamentoPrevista}Z`);
  const elegivel = (e, m) => (e.publicoTipo === "LISTA_CUSTOM" ? e.lista.includes(m) : S.aptos.has(m));
  const textoDaFinalista = (s) => s.textoFinal || s.texto;
  const finalistas = (cicloId) => S.sugestoes.filter(s => s.cicloId === cicloId && s.status === "FINALISTA");
  const votosDe = (e, opcaoId) => e.respostas.filter(r => r.opcaoId === opcaoId).length;

  function formatarCiclo(c) {
    const fase = faseDe(c);
    return {
      cicloId: c.cicloId, anoAlvo: c.anoAlvo, fase, faseRotulo: iv.FASES[fase].rotulo, calendario: iv.calendario(c.anoAlvo),
      abertoEm: c.abertoEm, abertoPor: nomeDe(c.abertoPorId),
      enqueteId: c.enqueteId || null, votacaoCriadaEm: c.votacaoCriadaEm, votacaoAutomatica: !!c.enqueteId && !c.votacaoCriadaPorId,
      apuracao: c.apuracao, apuradoEm: c.apuradoEm, votosTotal: c.votosTotal,
      tema: c.tema ? { sugestaoId: c.tema.sugestaoId, texto: c.tema.texto, votos: c.tema.votos, definidoPor: c.tema.definidoPor,
        desempate: c.tema.definidoPor === "DESEMPATE" ? { motivo: c.tema.desempate.motivo, por: nomeDe(c.tema.desempate.porId), em: c.tema.desempate.em } : null } : null,
      encerrado: !!c.resultado,
      resultadoPendente: !c.resultado && S.hoje >= iv.calendario(c.anoAlvo).arte.inicio
    };
  }
  function criarVotacao(c, porMembroId) {
    if (c.enqueteId) return { sucesso: true, jaExistia: true, enqueteId: c.enqueteId, mensagem: A("msgJaAberta", "A votação já está aberta.") };
    const cal = iv.calendario(c.anoAlvo);
    if (S.hoje < cal.votacao.inicio) return { sucesso: false, mensagem: A("msg422", `A votação só começa em ${iv.dataBr(cal.votacao.inicio)}.`) };
    if (iv.votacaoFechou(c.anoAlvo, agora())) return { sucesso: false, mensagem: A("msg422", `O período da votação terminou em ${iv.dataBr(cal.votacao.fim)}.`) };
    const lista = finalistas(c.cicloId).sort((a, b) => iv.normalizar(textoDaFinalista(a)).localeCompare(iv.normalizar(textoDaFinalista(b))));
    if (lista.length < iv.MIN_FINALISTAS) return { sucesso: false, faltamFinalistas: true, mensagem: A("msg422", `A votação precisa de pelo menos ${iv.MIN_FINALISTAS} finalistas aprovados na triagem (há ${lista.length}).`) };
    const e = novaEnquete({ titulo: `Tema da Identidade Visual de ${c.anoAlvo}`, descricao: `Escolha um dos temas finalistas para a Identidade Visual de ${c.anoAlvo}.`, criadoPorId: porMembroId,
      dataFechamentoPrevista: cal.votacaoFechaEm.slice(0, 19), identidade: c.anoAlvo, dataAbertura: agora().toISOString() }, [{ titulo: `Qual tema você escolhe para a Identidade Visual de ${c.anoAlvo}?`, tipo: "OPCOES", opcoes: lista.map(textoDaFinalista) }]);
    lista.forEach((s, i) => { s.opcaoId = e.perguntas[0].opcoes[i].opcaoId; });
    Object.assign(c, { enqueteId: e.enqueteId, votacaoCriadaEm: agora().toISOString(), votacaoCriadaPorId: porMembroId });
    return { sucesso: true, enqueteId: e.enqueteId, finalistas: lista.length, mensagem: A("msgVotacao", `Votação aberta com ${lista.length} finalistas: os membros votam em Meu Painel até ${iv.dataBr(cal.votacao.fim)}.`) };
  }
  function apurar(c) {
    const e = enquete(c.enqueteId);
    if (e.status === "ABERTA") e.status = "ENCERRADA";
    const opcoes = finalistas(c.cicloId).filter(s => s.opcaoId).map(s => ({ s, opcaoId: s.opcaoId, votos: votosDe(e, s.opcaoId) }));
    const ap = iv.apurar(opcoes);
    const venc = ap.situacao === "VENCEDOR" ? opcoes.find(o => o.opcaoId === ap.vencedor) : null;
    Object.assign(c, { apuracao: ap.situacao, apuradoEm: agora().toISOString(), votosTotal: ap.total,
      tema: venc ? { sugestaoId: venc.s.sugestaoId, texto: textoDaFinalista(venc.s), votos: ap.maior, definidoPor: "VOTACAO", desempate: null } : null });
  }
  // o que a data já decidiu (a votação que abre sozinha no dia 22; a apuração depois da meia-noite do dia 30)
  function materializar(c) {
    if (!c || c.resultado) return;
    if (!c.enqueteId && iv.fase(c.anoAlvo, S.hoje) === "VOTACAO" && !iv.votacaoFechou(c.anoAlvo, agora()) && finalistas(c.cicloId).length >= iv.MIN_FINALISTAS) criarVotacao(c, null);
    if (c.enqueteId && !c.apuracao && iv.votacaoFechou(c.anoAlvo, agora())) apurar(c);
  }
  function votacaoDoCiclo(c, { membroId = null, comVotos = false } = {}) {
    if (!c.enqueteId) return null;
    const e = enquete(c.enqueteId);
    const p = e.perguntas[0];
    const fechada = !!c.apuracao || e.status !== "ABERTA" || iv.votacaoFechou(c.anoAlvo, agora());
    const mostrar = comVotos || fechada;
    const minha = membroId ? e.respostas.find(r => r.membroId === membroId) : null;
    return { enqueteId: e.enqueteId, perguntaId: p.perguntaId, aberta: !fechada, fechaEm: iv.calendario(c.anoAlvo).votacaoFechaEm, participantes: new Set(e.respostas.map(r => r.membroId)).size,
      opcoes: p.opcoes.map(o => { const s = S.sugestoes.find(x => x.opcaoId === o.opcaoId); return { opcaoId: o.opcaoId, sugestaoId: s ? s.sugestaoId : null, texto: o.texto, ...(mostrar ? { votos: votosDe(e, o.opcaoId) } : {}) }; }),
      ...(membroId ? { jaVotou: !!minha, votouEm: minha ? minha.em : null } : {}) };
  }
  const coresDoCiclo = (cicloId) => S.cores.filter(k => k.cicloId === cicloId).sort((a, b) => a.ordem - b.ordem).map(k => ({ corId: k.corId, ordem: k.ordem, nome: k.nome, hex: k.hex }));
  function resultadoDoCiclo(c) {
    const r = c.resultado;
    if (!r) return null;
    return { resultadoId: r.resultadoId, arteId: r.arteId, corId: r.corId, tema: r.tema, cor: r.cor, dataCulto: r.dataCulto, ocasiao: r.ocasiao,
      ocasiaoRotulo: A("ocasiaoRotulo", iv.OCASIOES[r.ocasiao] || r.ocasiao), votosVencedor: r.votosVencedor, presentes: r.presentes, ata: r.ata || null,
      registradoPor: nomeDe(r.registradoPorId), registradoEm: r.registradoEm };
  }
  function painelMembro(membroId) {
    const anoAtual = Number(S.hoje.slice(0, 4)), proximo = anoAtual + 1;
    let c = cicloDoAno(proximo);
    if (!c) c = cicloDoAno(anoAtual);
    materializar(c);
    const vigente = S.temas.find(t => t.ano === anoAtual);
    const base = { sucesso: true, hoje: S.hoje, apto: S.aptos.has(membroId), maxSugestoes: iv.MAX_SUGESTOES, maxArtes: iv.MAX_ARTES, maxTexto: iv.MAX_TEXTO, maxImagemBytes: iv.MAX_IMAGEM_BYTES,
      identidadeVigente: vigente ? { ano: vigente.ano, tema: vigente.tema } : null, proximoAno: proximo, calendarioProximo: iv.calendario(proximo) };
    if (!c) return { ...base, ciclo: null };
    const f = formatarCiclo(c);
    const minhas = S.sugestoes.filter(s => s.cicloId === c.cicloId && s.membroId === membroId).sort((a, b) => a.sugestaoId - b.sugestaoId)
      .map(s => ({ sugestaoId: s.sugestaoId, texto: s.texto, situacao: s.status === "RETIRADA" ? "RETIRADA" : c.enqueteId || c.apuracao ? s.status : "ENVIADA",
        textoNaVotacao: c.enqueteId && s.status === "FINALISTA" ? (s.textoFinal || s.texto) : null, enviadaEm: s.criadaEm, retiradaEm: s.retiradaEm }));
    const cores = ["ARTE", "ENCERRADO"].includes(f.fase) ? coresDoCiclo(c.cicloId) : [];
    const minhasArtes = S.artes.filter(a => a.cicloId === c.cicloId && a.membroId === membroId).sort((a, b) => a.arteId - b.arteId)
      .map(a => ({ arteId: a.arteId, titulo: a.titulo || null, situacao: a.status, motivoRecusa: a.motivoRecusa || null, enviadaEm: a.criadaEm, temImagem: !!a.temImagem }));
    return { ...base, ciclo: f, minhasSugestoes: minhas, votacao: votacaoDoCiclo(c, { membroId }), cores, minhasArtes, resultado: f.encerrado ? resultadoDoCiclo(c) : null };
  }
  function painelGestao() {
    const proximo = iv.anoAlvoDoDia(S.hoje);
    const ciclos = [...S.ciclos].sort((a, b) => b.anoAlvo - a.anoAlvo).map(c => {
      materializar(c);
      return { ...formatarCiclo(c), sugestoes: S.sugestoes.filter(s => s.cicloId === c.cicloId && s.status !== "RETIRADA").length, finalistas: finalistas(c.cicloId).length,
        artes: S.artes.filter(a => a.cicloId === c.cicloId && ["ENVIADA", "ESCOLHIDA"].includes(a.status)).length };
    });
    const jaTem = ciclos.some(c => c.anoAlvo === proximo);
    const pode = iv.podeAbrirCiclo(proximo, S.hoje);
    return { sucesso: true, hoje: S.hoje, proximoAno: proximo, calendarioProximo: iv.calendario(proximo), podeAbrir: !jaTem && !pode.problema,
      motivoNaoAbre: jaTem ? null : pode.problema ? A("motivoNaoAbre", pode.problema) : null, ciclos };
  }
  function detalheCiclo(cicloId) {
    const c = ciclo(cicloId);
    if (!c) return null;
    materializar(c);
    const sugestoes = S.sugestoes.filter(s => s.cicloId === cicloId && s.status !== "RETIRADA").sort((a, b) => a.sugestaoId - b.sugestaoId)
      .map(s => ({ sugestaoId: s.sugestaoId, texto: s.texto, textoFinal: s.textoFinal || null, situacao: s.status, parecido: s.parecido,
        criterio: s.criterio ? { codigo: s.criterio, rotulo: A("criterioRotulo", iv.CRITERIOS[s.criterio].rotulo) } : null, observacao: s.observacao || null, enviadaEm: s.criadaEm,
        triadaEm: s.triadoEm, triadaPor: nomeDe(s.triadoPorId), anonimizada: !!s.anonimizada }));
    const retiradas = S.sugestoes.filter(s => s.cicloId === cicloId && s.status === "RETIRADA").length;
    const participantes = new Set(S.sugestoes.filter(s => s.cicloId === cicloId && s.status !== "RETIRADA").map(s => s.membroId)).size;
    const artes = S.artes.filter(a => a.cicloId === cicloId && a.status !== "RETIRADA").sort((a, b) => a.arteId - b.arteId)
      .map(a => ({ arteId: a.arteId, titulo: a.titulo || null, descricao: a.descricao || null, situacao: a.status, motivoRecusa: a.motivoRecusa || null, enviadaEm: a.criadaEm,
        tamanho: a.tamanho, tipo: a.tipo, temImagem: !!a.temImagem, autor: nomeDe(a.membroId) || "(anonimizado)", congregacao: S.membros[a.membroId] ? S.membros[a.membroId].congregacao : null }));
    return { sucesso: true, ciclo: formatarCiclo(c), sugestoes, retiradas, participantes, criterios: Object.values(iv.CRITERIOS),
      votacao: votacaoDoCiclo(c, { comVotos: false }), cores: coresDoCiclo(cicloId), artes, resultado: resultadoDoCiclo(c),
      ocasioes: Object.entries(iv.OCASIOES).map(([codigo, rotulo]) => ({ codigo, rotulo })) };
  }

  // ---- respostas (a função `resposta` do handler: naoExiste = 404; proibido = 403; mudou = 409; limite = 429; outra recusa = 422) ----
  const ok = (corpo, status = 200) => ({ status, corpo: Object.assign({ sucesso: true }, corpo) });
  const falha = (status, mensagem, extra) => ({ status, corpo: Object.assign({ sucesso: false, mensagem: A(`msg${status}`, mensagem) }, extra || {}) });
  const recusa = (mensagem, extra) => falha(422, mensagem, extra);
  const NAO_EXISTE = () => falha(404, "Não encontrado.");
  const NAO_APTO = "Só quem é membro ativo e em comunhão participa da escolha da identidade visual (Regimento, Art. 159). Se acha que é engano, fale com a Secretaria.";

  function atenderIdentidade(chamada, ses) {
    const m = /^identidade-visual\/([a-z-]+)$/.exec(chamada.caminho);
    if (!m) { S.erros.push(`caminho fora da rota: ${chamada.caminho}`); return falha(404, "Ação inválida."); }
    const acao = m[1];
    const corpo = chamada.corpo && typeof chamada.corpo === "object" && !Array.isArray(chamada.corpo) ? chamada.corpo : {};
    const consulta = chamada.consulta;
    S.recebidos.push({ acao, metodo: chamada.metodo, corpo, consulta, membroId: ses.membroId });
    for (const campo of ["cicloId", "sugestaoId", "arteId", "corId", "temaUsadoId"]) {
      for (const origem of [corpo, consulta]) if (campo in origem && origem[campo] != null && origem[campo] !== "" && !ID(origem[campo])) return falha(400, `${campo} inválido.`);
    }
    if (chamada.metodo === "GET" && !LEITURAS.includes(acao)) { S.erros.push(`GET desconhecido: ${acao}`); return falha(404, "Ação inválida."); }
    if (chamada.metodo === "POST" && !ESCRITAS.includes(acao)) { S.erros.push(`POST desconhecido: ${acao}`); return falha(404, "Ação inválida."); }
    if (chamada.metodo === "GET" && chamada.corpoBruto) S.erros.push(`GET com corpo: ${acao}`);
    const gestao = !!ses.gestao;
    if (EXIGE_GESTAO.includes(acao) && !gestao) return falha(403, "Isto é da Diretoria (nível Geral) que conduz a escolha da identidade visual. Fale com quem administra as Permissões.");
    const pedeFator = chamada.metodo === "POST" && (FATOR_ACOES.includes(acao) || (FATOR_TRIAR && acao === "triar" && corpo.decisao === "FINALISTA"));
    if (pedeFator && !S.fatorOk) return { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: A("msg428", "Confirme quem você é.") } };
    if (chamada.metodo === "POST" && (acao === "sugerir" || acao === "arte") && S.limiteEnvios) return falha(429, "Muitos envios seguidos. Espere alguns minutos e tente de novo.");
    if (chamada.metodo === "POST" && S.ocupado) return falha(429, "Muita gente mexendo neste ciclo agora. Espere alguns segundos e tente de novo.");
    const membroId = ses.membroId;
    const exigir = (campo) => ID(corpo[campo]);

    if (chamada.metodo === "GET") {
      if (acao === "catalogos") {
        return ok({ papeis: { gestao }, fases: Object.entries(iv.FASES).map(([codigo, f]) => ({ codigo, rotulo: A("faseRotulo", f.rotulo) })),
          // um critério e uma ocasião de código inválido: a tela não pode usá-los
          criterios: [...Object.values(iv.CRITERIOS).map(k => Object.assign({}, k, { rotulo: A(`criterio${k.codigo}`, k.rotulo), descricao: A("criterioDesc", k.descricao) })), { codigo: ATAQUE("criterioCodigo"), rotulo: A("criterioFalso", "Falso") }, { codigo: 9, rotulo: A("criterioNove", "Nove") }],
          ocasioes: [...Object.entries(iv.OCASIOES).map(([codigo, rotulo]) => ({ codigo, rotulo: A(`ocasiao${codigo}`, rotulo) })), { codigo: ATAQUE("ocasiaoCodigo"), rotulo: A("ocasiaoFalsa", "Falsa") }],
          limites: { sugestoes: iv.MAX_SUGESTOES, texto: iv.MAX_TEXTO, artes: iv.MAX_ARTES, imagemBytes: iv.MAX_IMAGEM_BYTES, cores: iv.MAX_CORES, finalistas: iv.MAX_FINALISTAS } });
      }
      if (acao === "meu") return { status: 200, corpo: painelMembro(membroId) };
      if (acao === "imagem") {
        const arteId = ID(consulta.arteId);
        if (!arteId) return falha(400, "Informe arteId.");
        const a = S.artes.find(x => x.arteId === arteId);
        const c = a && ciclo(a.cicloId);
        if (!a || !(gestao || a.membroId === membroId || (a.status === "ESCOLHIDA" && c && c.resultado && c.resultado.arteId === a.arteId))) return NAO_EXISTE();
        if (!a.temImagem) return recusa("A imagem desta arte já foi apagada.");
        if (S.imagemFalha) return S.imagemFalha;
        return ok({ url: S.urlImagem(arteId) });
      }
      if (acao === "painel") return { status: 200, corpo: painelGestao() };
      if (acao === "temas") {
        return ok({ temas: [...S.temas].sort((a, b) => b.ano - a.ano).map(t => ({ temaUsadoId: t.temaUsadoId, ano: t.ano, tema: t.tema, origem: t.origem, registradoPor: nomeDe(t.registradoPorId),
          registradoEm: t.registradoEm, atualizadoPor: nomeDe(t.atualizadoPorId), atualizadoEm: t.atualizadoEm })) });
      }
      if (acao === "ciclo") {
        const cicloId = ID(consulta.cicloId);
        if (!cicloId) return falha(400, "Informe cicloId.");
        const d = detalheCiclo(cicloId);
        return d ? { status: 200, corpo: d } : NAO_EXISTE();
      }
    }

    if (acao === "sugerir") {
      const ano = iv.anoAlvoDoDia(S.hoje);
      const c = cicloDoAno(ano);
      if (!c) return recusa(`Ainda não há processo de escolha aberto para a Identidade Visual de ${ano}: a Diretoria abre o ciclo do ano.`);
      const cal = iv.calendario(ano);
      if (faseDe(c) !== "SUGESTAO") return recusa(`As sugestões para ${ano} vão de ${iv.dataBr(cal.sugestao.inicio)} a ${iv.dataBr(cal.sugestao.fim)}.`);
      const v = iv.validarTema(corpo.texto);
      if (v.problema) return recusa(v.problema);
      if (!S.aptos.has(membroId)) return recusa(NAO_APTO);
      const conf = iv.conferirTemasUsados(v.normalizado, S.temas.map(t => ({ ano: t.ano, tema: t.tema, normalizado: t.normalizado })));
      if (conf.igual) return recusa(`Esse tema já foi usado pela Igreja em ${conf.igual.ano} ("${conf.igual.tema}"). O Regimento veda tema repetido (Art. 159): pense em outro.`, { jaUsado: { ano: conf.igual.ano } });
      const minhas = S.sugestoes.filter(s => s.cicloId === c.cicloId && s.membroId === membroId && s.status !== "RETIRADA").length;
      if (minhas >= iv.MAX_SUGESTOES) return recusa(`Você já mandou ${iv.MAX_SUGESTOES} sugestões este ano (o máximo). Para mandar outra, retire uma das suas antes.`);
      const repetida = S.sugestoes.find(s => s.cicloId === c.cicloId && s.normalizado === v.normalizado && s.status !== "RETIRADA");
      if (repetida) return recusa(repetida.membroId === membroId ? "Você já mandou esse tema." : "Esse tema já foi sugerido por outro membro: ele já está na lista da triagem.");
      const s = novaSugestao({ cicloId: c.cicloId, membroId, texto: v.texto, criadaEm: agora().toISOString(), parecido: conf.parecido ? { ano: conf.parecido.ano, tema: conf.parecido.tema } : null });
      return ok({ sugestaoId: s.sugestaoId, parecido: s.parecido, mensagem: conf.parecido ? A("msgSugestaoParecida", `Sugestão recebida. Ela lembra o tema de ${conf.parecido.ano}: a Diretoria vai conferir na triagem.`) : A("msgSugestao", "Sugestão recebida. Obrigado por participar!") }, 201);
    }
    if (acao === "retirar-sugestao") {
      const id = exigir("sugestaoId"); if (!id) return falha(400, "Informe sugestaoId.");
      const s = S.sugestoes.find(x => x.sugestaoId === id && x.membroId === membroId);
      if (!s) return NAO_EXISTE();
      const c = ciclo(s.cicloId);
      if (faseDe(c) !== "SUGESTAO") return recusa(`A sugestão só pode ser retirada até ${iv.dataBr(iv.calendario(c.anoAlvo).sugestao.fim)}.`);
      if (s.status !== "ENVIADA") return recusa("Esta sugestão já foi retirada.");
      Object.assign(s, { status: "RETIRADA", retiradaEm: agora().toISOString() });
      return ok({ mensagem: A("msgRetirada", "Sugestão retirada.") });
    }
    if (acao === "arte") {
      const ano = iv.anoAlvoDoDia(S.hoje);
      const c = cicloDoAno(ano);
      if (!c) return recusa(`Ainda não há processo de escolha aberto para a Identidade Visual de ${ano}: a Diretoria abre o ciclo do ano.`);
      if (faseDe(c) !== "ARTE") return recusa("O concurso de arte é em dezembro (até a escolha final do culto).");
      if (!coresDoCiclo(c.cicloId).length) return recusa("A Diretoria ainda não registrou as cores: a arte é feita com elas. Volte em alguns dias.");
      const titulo = iv.validarTextoLivre(corpo.titulo, { campo: "o título da arte", max: 80, opcional: true, umaLinha: true });
      if (titulo.problema) return recusa(titulo.problema);
      const descricao = iv.validarTextoLivre(corpo.descricao, { campo: "a descrição", max: 300, opcional: true });
      if (descricao.problema) return recusa(descricao.problema);
      if (!iv.TIPOS_IMAGEM.includes(corpo.tipo)) return recusa("A arte tem de ser uma imagem PNG ou JPEG.");
      if (!iv.base64CabeNoLimite(corpo.imagemBase64)) return recusa("A imagem está vazia, corrompida ou passa de 5 MB.");
      const buffer = Buffer.from(corpo.imagemBase64, "base64");
      const img = iv.conferirImagem(buffer, corpo.tipo);
      if (img.problema) return recusa(img.problema);
      if (!S.aptos.has(membroId)) return recusa(NAO_APTO);
      const ativas = S.artes.filter(a => a.cicloId === c.cicloId && a.membroId === membroId && ["ENVIADA", "ESCOLHIDA"].includes(a.status)).length;
      if (ativas >= iv.MAX_ARTES) return recusa(`Você já mandou ${iv.MAX_ARTES} artes este ano (o máximo). Para mandar outra, retire uma das suas antes.`);
      const a = novaArte({ cicloId: c.cicloId, membroId, titulo: titulo.texto, descricao: descricao.texto, tamanho: buffer.length, tipo: corpo.tipo, criadaEm: agora().toISOString(), bytes: buffer });
      return ok({ arteId: a.arteId, mensagem: A("msgArte", "Arte recebida. A escolha final (arte + cor) é no culto de dezembro.") }, 201);
    }
    if (acao === "retirar-arte") {
      const id = exigir("arteId"); if (!id) return falha(400, "Informe arteId.");
      const a = S.artes.find(x => x.arteId === id && x.membroId === membroId);
      if (!a) return NAO_EXISTE();
      if (a.status !== "ENVIADA") return recusa(a.status === "ESCOLHIDA" ? "Esta arte foi a escolhida no culto: não pode mais ser retirada." : "Esta arte já não está no concurso.");
      Object.assign(a, { status: "RETIRADA", temImagem: false });
      return ok({ mensagem: A("msgArteRetirada", "Arte retirada (a imagem foi apagada).") });
    }
    if (acao === "abrir-ciclo") {
      const ano = Number.isInteger(corpo.anoAlvo) ? corpo.anoAlvo : (typeof corpo.anoAlvo === "string" && /^\d{4}$/.test(corpo.anoAlvo) ? Number(corpo.anoAlvo) : null);
      const pode = iv.podeAbrirCiclo(ano, S.hoje);
      if (pode.problema) return recusa(pode.problema);
      const ja = cicloDoAno(ano);
      if (ja) return recusa(`O ciclo da identidade de ${ano} já está aberto.`, { cicloId: ja.cicloId });
      const c = novoCiclo({ cicloId: ++S.seq.ciclo, anoAlvo: ano, abertoEm: agora().toISOString(), abertoPorId: membroId });
      return ok({ cicloId: c.cicloId, mensagem: A("msgCicloAberto", `Ciclo da Identidade Visual de ${ano} aberto.`) }, 201);
    }
    if (acao === "cancelar-ciclo") {
      const id = exigir("cicloId"); if (!id) return falha(400, "Informe cicloId.");
      const c = ciclo(id);
      if (!c) return NAO_EXISTE();
      if (c.enqueteId || S.sugestoes.some(s => s.cicloId === id) || S.cores.some(k => k.cicloId === id) || S.artes.some(a => a.cicloId === id) || S.temas.some(t => t.cicloId === id)) return recusa("Este ciclo já tem sugestões, cores ou artes: não pode mais ser cancelado.");
      S.ciclos = S.ciclos.filter(x => x !== c);
      return ok({ mensagem: A("msgCancelado", `Ciclo de ${c.anoAlvo} cancelado.`) });
    }
    if (acao === "tema") {
      const anoMax = Number(S.hoje.slice(0, 4)) + 1;
      const ano = Number.isInteger(corpo.ano) ? corpo.ano : (typeof corpo.ano === "string" && /^\d{4}$/.test(corpo.ano) ? Number(corpo.ano) : null);
      if (!ano || ano < iv.PRIMEIRO_ANO_TEMAS || ano > anoMax) return recusa(`Informe o ano (de ${iv.PRIMEIRO_ANO_TEMAS} a ${anoMax}).`);
      const v = iv.validarTema(corpo.tema, { max: iv.MAX_TEMA_USADO, campo: "o tema" });
      if (v.problema) return recusa(v.problema);
      const tid = corpo.temaUsadoId == null || corpo.temaUsadoId === "" ? null : ID(corpo.temaUsadoId);
      if (tid) {
        const t = S.temas.find(x => x.temaUsadoId === tid);
        if (!t) return NAO_EXISTE();
        if (t.origem !== "MANUAL") return recusa("O tema escolhido pelo processo da identidade visual não se edita.");
        if (S.temas.some(x => x !== t && x.ano === ano)) return recusa(`Já há um tema cadastrado para ${ano}: corrija o que está na lista.`);
        Object.assign(t, { ano, tema: v.texto, normalizado: v.normalizado, atualizadoPorId: membroId, atualizadoEm: agora().toISOString() });
        return ok({ temaUsadoId: tid, mensagem: A("msgTemaCorrigido", `Tema de ${ano} corrigido.`) });
      }
      if (S.temas.some(x => x.ano === ano)) return recusa(`Já há um tema cadastrado para ${ano}: corrija o que está na lista.`);
      const t = novoTema({ ano, tema: v.texto, registradoPorId: membroId, registradoEm: agora().toISOString() });
      return ok({ temaUsadoId: t.temaUsadoId, mensagem: A("msgTemaNovo", `Tema de ${ano} cadastrado.`) }, 201);
    }
    if (acao === "excluir-tema") {
      const id = exigir("temaUsadoId"); if (!id) return falha(400, "Informe temaUsadoId.");
      const t = S.temas.find(x => x.temaUsadoId === id);
      if (!t) return NAO_EXISTE();
      if (t.origem !== "MANUAL") return recusa("O tema escolhido pelo processo da identidade visual não se apaga.");
      S.temas = S.temas.filter(x => x !== t);
      return ok({ mensagem: A("msgTemaApagado", `Tema de ${t.ano} apagado da lista.`) });
    }
    if (acao === "triar") {
      const id = exigir("sugestaoId"); if (!id) return falha(400, "Informe sugestaoId.");
      const decisao = corpo.decisao;
      if (!["FINALISTA", "DESCARTADA", "ENVIADA"].includes(decisao)) return recusa("Escolha a decisão: finalista, descartada ou voltar para a triagem.");
      let textoFinal = null, normalFinal = null, criterio = null, observacao = null;
      if (decisao === "FINALISTA" && corpo.textoAjustado !== undefined && corpo.textoAjustado !== null && corpo.textoAjustado !== "") {
        const v = iv.validarTema(corpo.textoAjustado, { campo: "a redação ajustada" });
        if (v.problema) return recusa(v.problema);
        textoFinal = v.texto; normalFinal = v.normalizado;
      }
      if (decisao === "DESCARTADA") {
        criterio = Number.isInteger(corpo.criterio) ? corpo.criterio : (typeof corpo.criterio === "string" && /^[1-3]$/.test(corpo.criterio) ? Number(corpo.criterio) : null);
        if (!criterio || !iv.CRITERIOS[criterio]) return recusa("Escolha o critério do descarte (1, 2 ou 3 do Art. 159, § 1º, I, a).");
      }
      if (decisao !== "ENVIADA") {
        const o = iv.validarTextoLivre(corpo.observacao, { campo: "a observação", max: 300, opcional: true });
        if (o.problema) return recusa(o.problema);
        observacao = o.texto;
      }
      const s = S.sugestoes.find(x => x.sugestaoId === id);
      if (!s) return NAO_EXISTE();
      const c = ciclo(s.cicloId);
      const fase = faseDe(c);
      if (c.enqueteId) return falha(409, "A votação já começou: a lista de finalistas não muda mais.");
      if (!(fase === "TRIAGEM" || (fase === "VOTACAO" && !iv.votacaoFechou(c.anoAlvo, agora())))) return recusa(`A triagem vai de ${iv.dataBr(iv.calendario(c.anoAlvo).triagem.inicio)} a ${iv.dataBr(iv.calendario(c.anoAlvo).triagem.fim)}.`);
      if (s.status === "RETIRADA") return recusa("Esta sugestão foi retirada por quem mandou.");
      if (s.anonimizada && decisao === "FINALISTA" && s.status !== "FINALISTA") return recusa("Esta sugestão foi removida a pedido do titular (LGPD) e não pode ser finalista.");
      if (decisao === "FINALISTA") {
        if (textoFinal && textoFinal === s.texto) { textoFinal = null; normalFinal = null; }
        const normal = normalFinal || s.normalizado;
        const conf = iv.conferirTemasUsados(normal, S.temas.map(t => ({ ano: t.ano, tema: t.tema, normalizado: t.normalizado })));
        if (conf.igual) return recusa(`Essa redação é igual ao tema de ${conf.igual.ano}: tema repetido não vai à votação (Art. 159).`);
        const outras = finalistas(c.cicloId).filter(o => o !== s);
        if (outras.length >= iv.MAX_FINALISTAS) return recusa(`A votação leva no máximo ${iv.MAX_FINALISTAS} finalistas.`);
        if (outras.some(o => iv.normalizar(textoDaFinalista(o)) === normal)) return recusa("Já há uma finalista com esta mesma redação.");
      }
      Object.assign(s, { status: decisao, textoFinal, criterio, observacao, triadoPorId: decisao === "ENVIADA" ? null : membroId, triadoEm: decisao === "ENVIADA" ? null : agora().toISOString() });
      return ok({ mensagem: A("msgTriar", decisao === "FINALISTA" ? (textoFinal ? "Aprovada como finalista, com a redação ajustada (a original fica guardada)." : "Aprovada como finalista.")
        : decisao === "DESCARTADA" ? `Descartada: ${iv.CRITERIOS[criterio].rotulo}.` : "A sugestão voltou para a triagem.") });
    }
    if (acao === "abrir-votacao") {
      const id = exigir("cicloId"); if (!id) return falha(400, "Informe cicloId.");
      const c = ciclo(id);
      if (!c) return NAO_EXISTE();
      const r = criarVotacao(c, membroId);
      return r.sucesso ? ok(r, 201) : { status: 422, corpo: r };
    }
    if (acao === "desempate") {
      const id = exigir("sugestaoId"); if (!id) return falha(400, "Informe sugestaoId.");
      const motivo = iv.validarTextoLivre(corpo.motivo, { campo: "o motivo da decisão", max: 300, min: 5 });
      if (motivo.problema) return recusa(motivo.problema);
      const s0 = S.sugestoes.find(x => x.sugestaoId === id);
      if (!s0) return NAO_EXISTE();
      const c = ciclo(s0.cicloId);
      if (!c.apuracao) return recusa("A votação ainda não foi apurada.");
      if (c.tema) return recusa("O tema deste ano já está definido.");
      const e = enquete(c.enqueteId);
      const opcoes = finalistas(c.cicloId).filter(s => s.opcaoId).map(s => ({ s, votos: votosDe(e, s.opcaoId) }));
      const maior = Math.max(0, ...opcoes.map(o => o.votos));
      const escolhida = opcoes.find(o => o.s.sugestaoId === id);
      if (!escolhida || escolhida.votos !== maior) return recusa(c.apuracao === "EMPATE" ? "Escolha um dos temas empatados em primeiro lugar." : "Escolha um dos temas finalistas.");
      c.tema = { sugestaoId: id, texto: textoDaFinalista(escolhida.s), votos: escolhida.votos, definidoPor: "DESEMPATE", desempate: { motivo: A("desempateMotivo", motivo.texto), porId: membroId, em: agora().toISOString() } };
      return ok({ mensagem: A("msgDesempate", `Tema definido pela Diretoria: "${c.tema.texto}".`) });
    }
    if (acao === "cor") {
      const id = exigir("cicloId"); if (!id) return falha(400, "Informe cicloId.");
      const v = iv.validarCor(corpo);
      if (v.problema) return recusa(v.problema);
      const c = ciclo(id);
      if (!c) return NAO_EXISTE();
      if (!["TRIAGEM", "VOTACAO", "ARTE"].includes(faseDe(c))) return recusa("As cores se registram da triagem (16/11) até a escolha final.");
      const artes = S.artes.filter(a => a.cicloId === id && ["ENVIADA", "ESCOLHIDA"].includes(a.status)).length;
      const existe = S.cores.find(k => k.cicloId === id && k.ordem === v.dados.ordem);
      if (existe && artes) return recusa("As cores não mudam depois que chegou a primeira arte (os membros desenharam com elas).");
      if (existe) Object.assign(existe, { nome: v.dados.nome, hex: v.dados.hex });
      else S.cores.push({ corId: ++S.seq.cor, cicloId: id, ordem: v.dados.ordem, nome: v.dados.nome, hex: v.dados.hex });
      const k = S.cores.find(x => x.cicloId === id && x.ordem === v.dados.ordem);
      return ok({ corId: k.corId, mensagem: A("msgCor", `Cor ${v.dados.ordem} registrada.`) });
    }
    if (acao === "excluir-cor") {
      const id = exigir("corId"); if (!id) return falha(400, "Informe corId.");
      const k = S.cores.find(x => x.corId === id);
      if (!k) return NAO_EXISTE();
      if (!["TRIAGEM", "VOTACAO", "ARTE"].includes(faseDe(ciclo(k.cicloId)))) return recusa("As cores se registram da triagem (16/11) até a escolha final.");
      if (S.artes.some(a => a.cicloId === k.cicloId && ["ENVIADA", "ESCOLHIDA"].includes(a.status))) return recusa("As cores não mudam depois que chegou a primeira arte (os membros desenharam com elas).");
      S.cores = S.cores.filter(x => x !== k);
      return ok({ mensagem: A("msgCorApagada", "Cor apagada.") });
    }
    if (acao === "recusar-arte") {
      const id = exigir("arteId"); if (!id) return falha(400, "Informe arteId.");
      const mo = iv.validarTextoLivre(corpo.motivo, { campo: "o motivo", max: 300, min: 3 });
      if (mo.problema) return recusa(mo.problema);
      const a = S.artes.find(x => x.arteId === id);
      if (!a) return NAO_EXISTE();
      if (ciclo(a.cicloId).resultado) return recusa("A escolha final deste ano já foi registrada.");
      if (a.status !== "ENVIADA") return recusa("Esta arte já não está no concurso.");
      Object.assign(a, { status: "RECUSADA", motivoRecusa: mo.texto });
      return ok({ mensagem: A("msgRecusada", "Arte retirada do concurso, com o motivo.") });
    }
    if (acao === "resultado") {
      const cicloId = exigir("cicloId"); if (!cicloId) return falha(400, "Informe cicloId.");
      const arteId = exigir("arteId"); if (!arteId) return falha(400, "Informe arteId.");
      const corId = exigir("corId"); if (!corId) return falha(400, "Informe corId.");
      const c = ciclo(cicloId);
      if (!c) return NAO_EXISTE();
      if (S.hoje < iv.calendario(c.anoAlvo).arte.inicio) return recusa("A escolha final é em dezembro, depois da votação do tema.");
      const v = iv.validarResultado({ ...corpo, arteId, corId }, { anoAlvo: c.anoAlvo, hoje: S.hoje });
      if (v.problema) return recusa(v.problema);
      if (c.resultado) return recusa("A escolha final deste ano já foi registrada.");
      if (!c.tema) return recusa("O tema do ano ainda não está definido (a votação não foi apurada ou o empate não foi decidido).");
      const a = S.artes.find(x => x.arteId === arteId && x.cicloId === cicloId);
      if (!a || a.status !== "ENVIADA" || !a.temImagem) return recusa("Escolha uma das artes do concurso deste ano.");
      const k = S.cores.find(x => x.corId === corId && x.cicloId === cicloId);
      if (!k) return recusa("Escolha uma das cores registradas para este ano.");
      if (S.temas.some(t => t.ano === c.anoAlvo)) return recusa(`Já há um tema cadastrado à mão para ${c.anoAlvo} em "Temas já usados": apague-o lá antes de registrar o resultado do processo.`);
      a.status = "ESCOLHIDA";
      c.resultado = { resultadoId: ++S.seq.resultado, arteId, corId, tema: c.tema.texto, cor: { nome: k.nome, hex: k.hex }, ...v.dados, registradoPorId: membroId, registradoEm: agora().toISOString() };
      novoTema({ ano: c.anoAlvo, tema: c.tema.texto, origem: "PROCESSO", cicloId, registradoPorId: membroId });
      return ok({ resultadoId: c.resultado.resultadoId, mensagem: A("msgResultado", `Resultado registrado: é a Identidade Visual oficial de ${c.anoAlvo}.`) }, 201);
    }
    S.erros.push(`ação sem imitação: ${chamada.metodo} ${acao}`);
    return falha(404, "Ação inválida.");
  }

  // ---- as Enquetes (GestaoEnquetes): ?paraVotar=1, {id}/votar, e a lista e a criação da liderança ----
  const ok200 = (corpo) => ({ status: 200, corpo });
  const recusa200 = (mensagem) => ({ status: 200, corpo: { sucesso: false, mensagem: A("msgEnq", mensagem) } });
  function atenderEnquetes(chamada, ses) {
    const membroId = ses.membroId;
    const corpo = chamada.corpo && typeof chamada.corpo === "object" && !Array.isArray(chamada.corpo) ? chamada.corpo : {};
    const m = /^enquetes(?:\/([^/]+)\/([a-z]+))?$/.exec(chamada.caminho);
    if (!m) { S.erros.push(`caminho fora da rota: ${chamada.caminho}`); return { status: 404, corpo: { sucesso: false, mensagem: "rota" } }; }
    S.recebidos.push({ acao: m[2] ? `enquetes/${m[2]}` : "enquetes", metodo: chamada.metodo, corpo, consulta: chamada.consulta, membroId });
    if (chamada.metodo === "POST" && m[1] && m[2] === "votar") {
      const enqueteId = ID(m[1]);
      const { respostas } = corpo;
      if (!enqueteId || !Array.isArray(respostas) || respostas.length === 0 || respostas.length > 50) return { status: 400, corpo: { sucesso: false, mensagem: "Informe a enquete e as respostas." } };
      if (corpo.membroId !== undefined && corpo.membroId !== null && String(corpo.membroId) !== String(membroId)) return { status: 403, corpo: { sucesso: false, mensagem: "Cada pessoa vota só por si mesma." } };
      for (const r of respostas) {
        if (!r || typeof r !== "object" || Array.isArray(r) || !ID(r.perguntaId) || (r.opcaoId != null && !ID(r.opcaoId)) || (r.textoResposta != null && (typeof r.textoResposta !== "string" || r.textoResposta.length > 500))) {
          return { status: 400, corpo: { sucesso: false, mensagem: "Respostas inválidas." } };
        }
      }
      const e = enquete(enqueteId);
      if (!e) return recusa200("Enquete não encontrada.");
      if (e.status !== "ABERTA" || passou(e)) return recusa200("Esta enquete já foi encerrada.");
      if (!elegivel(e, membroId)) return recusa200("Esta matrícula não está no público desta enquete.");
      const porPergunta = {};
      respostas.forEach(r => { porPergunta[Number(r.perguntaId)] = r; });
      for (const p of e.perguntas) {
        const r = porPergunta[p.perguntaId];
        if (!r) return recusa200(`Falta responder: "${p.titulo}".`);
        if (p.tipo === "OPCOES" && !r.opcaoId) return recusa200(`Escolha uma opção pra: "${p.titulo}".`);
        if (p.tipo === "OPCOES" && !p.opcoes.some(o => o.opcaoId === Number(r.opcaoId))) return { status: 400, corpo: { sucesso: false, mensagem: `A opção escolhida não é de: "${p.titulo}".` } };
        if (p.tipo === "TEXTO_LIVRE" && !r.textoResposta) return recusa200(`Informe uma resposta pra: "${p.titulo}".`);
      }
      if (e.respostas.some(r => r.membroId === membroId)) return recusa200("Esta matrícula já respondeu este formulário.");
      for (const p of e.perguntas) { const r = porPergunta[p.perguntaId]; e.respostas.push({ membroId, perguntaId: p.perguntaId, opcaoId: p.tipo === "OPCOES" ? Number(r.opcaoId) : null, textoResposta: p.tipo === "TEXTO_LIVRE" ? r.textoResposta : null, em: agora().toISOString().slice(0, 23) }); }
      return ok200({ sucesso: true, mensagem: "✅ Respostas registradas." });
    }
    if (chamada.metodo === "GET" && !m[1] && chamada.consulta.paraVotar === "1") {
      const lista = S.enquetes.filter(e => e.status === "ABERTA" && !passou(e) && elegivel(e, membroId)).sort((a, b) => b.dataAbertura.localeCompare(a.dataAbertura)).map(e => {
        const minha = e.respostas.find(r => r.membroId === membroId);
        return { enqueteId: e.enqueteId, titulo: e.titulo, descricao: e.descricao, visibilidade: e.visibilidade, dataAbertura: e.dataAbertura, dataFechamentoPrevista: e.dataFechamentoPrevista || null,
          perguntas: e.perguntas.map(p => ({ perguntaId: p.perguntaId, ordem: p.ordem, titulo: p.titulo, tipo: p.tipo, opcoes: p.tipo === "OPCOES" ? p.opcoes.map(o => ({ opcaoId: o.opcaoId, texto: o.texto })) : [] })),
          jaRespondeu: !!minha, respondidaEm: minha ? minha.em : null, identidadeVisual: e.identidade };
      });
      return ok200({ sucesso: true, enquetes: lista });
    }
    if (chamada.metodo === "GET" && !m[1]) {
      return ok200(S.enquetes.map(e => ({ enqueteId: e.enqueteId, titulo: e.titulo, descricao: e.descricao, visibilidade: e.visibilidade, publicoTipo: e.publicoTipo, vinculante: e.vinculante, quorumTipo: null,
        status: e.status === "ABERTA" && passou(e) ? "ENCERRADA" : e.status, dataFechamentoPrevista: e.dataFechamentoPrevista || null, totalVotos: new Set(e.respostas.map(r => r.membroId)).size,
        perguntas: e.perguntas.map(p => ({ ...p, totalRespostas: e.respostas.filter(r => r.perguntaId === p.perguntaId).length, opcoes: p.opcoes.map(o => ({ ...o, votos: votosDe(e, o.opcaoId) })) })), participantes: [] })));
    }
    if (chamada.metodo === "POST" && !m[1]) {
      let prevista = null;
      if (corpo.dataFechamentoPrevista !== undefined && corpo.dataFechamentoPrevista !== null && corpo.dataFechamentoPrevista !== "") {
        const v = corpo.dataFechamentoPrevista;
        const instante = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? Date.parse(`${v}:00-03:00`) : NaN;
        if (!Number.isFinite(instante) || new Date(instante - 3 * HORA).toISOString().slice(0, 16) !== v) return { status: 400, corpo: { sucesso: false, mensagem: "Data de fechamento inválida (use dia e hora)." } };
        if (instante <= agora().getTime() + 5 * 60000 || instante > agora().getTime() + 366 * DIA) return recusa200("A enquete precisa fechar no futuro (pelo menos 5 minutos a partir de agora) e em até 1 ano.");
        prevista = new Date(instante).toISOString().slice(0, 19);
      }
      const e = novaEnquete({ titulo: corpo.titulo, descricao: corpo.descricao || null, publicoTipo: corpo.publicoTipo, dataFechamentoPrevista: prevista, criadoPorId: membroId },
        (corpo.perguntas || []).map(p => ({ titulo: p.titulo, tipo: p.tipo, opcoes: p.opcoes || [] })));
      return { status: 201, corpo: { sucesso: true, mensagem: "✅ Enquete criada.", enquete: { enqueteId: e.enqueteId } } };
    }
    S.erros.push(`enquetes sem imitação: ${chamada.metodo} ${chamada.caminho}`);
    return { status: 405, corpo: { sucesso: false, mensagem: "Método/rota não suportado." } };
  }

  function atender(chamada) {
    const ses = S.sessoes[chamada.token];
    if (!ses) return { status: 401, corpo: { sucesso: false, mensagem: "Sessão expirada." } };
    if (/^identidade-visual\//.test(chamada.caminho)) return atenderIdentidade(chamada, ses);
    if (/^enquetes(\/|$)/.test(chamada.caminho)) return atenderEnquetes(chamada, ses);
    S.erros.push(`caminho fora da rota: ${chamada.caminho}`);
    return { status: 404, corpo: { sucesso: false, mensagem: "rota" } };
  }

  const servidor = async (chamada) => {
    try { return atender(chamada); } catch (e) { S.erros.push(String(e && e.stack || e)); return { status: 500, corpo: { sucesso: false, mensagem: "Erro interno." } }; }
  };
  // atalhos do roteiro para pôr o ciclo numa etapa (o que a Diretoria e os membros teriam feito antes)
  const atalhos = {
    agora,
    // triagem feita: Frutos (ana2) e Luz (bento) finalistas, Raízes (ana1) descartada pelo critério 3 com observação; a votação abre sozinha no dia 22
    triagemFeita() {
      Object.assign(S.S.ana2, { status: "FINALISTA", textoFinal: A("textoFinal", "Frutos que permanecem para sempre"), triadoPorId: 13, triadoEm: "2026-11-17T12:00:00.000Z" });
      Object.assign(S.S.bento, { status: "FINALISTA", triadoPorId: 14, triadoEm: "2026-11-17T12:00:00.000Z" });
      Object.assign(S.S.ana1, { status: "DESCARTADA", criterio: 3, observacao: A("obsTriagem", "Parecido demais com 2019"), triadoPorId: 13, triadoEm: "2026-11-17T12:00:00.000Z" });
    },
    // a votação de 22 a 30/11 (criada como a rotina do dia 22 faria)
    votacaoAberta() { atalhos.triagemFeita(); const h = S.hoje; S.hoje = "2026-11-22"; criarVotacao(S.C, null); S.hoje = h; return enquete(S.C.enqueteId); },
    votar(membroId, sugestao) { const e = enquete(S.C.enqueteId); e.respostas.push({ membroId, perguntaId: e.perguntas[0].perguntaId, opcaoId: sugestao.opcaoId, textoResposta: null, em: "2026-11-23T12:00:00.000" }); },
    enquete, novaArte, novaSugestao, novoTema, novaEnquete, novoCiclo
  };
  return { S, servidor, A, ...atalhos };
}

// ============================================================================
// O contrato: o que a tela chama e lê existe no servidor de verdade
// ============================================================================
function contratoComOServidor() {
  const faltam = [];
  const dbSrc = fs.readFileSync(path.join(API, "shared/identidadeVisualDb.js"), "utf8");
  const enqSrv = fs.readFileSync(path.join(API, "GestaoEnquetes/index.js"), "utf8");
  const { lerApp } = require("./ambiente");
  const modulo = lerApp("modulos/identidade-visual.js");
  const enq = lerApp("modulos/enquetes.js");
  // as ações: cada GET da tela é uma LEITURA do handler; cada POST, uma ESCRITA
  const gets = [...modulo.matchAll(/idvObter\(["`]([a-z-]+)/g)].map(m => m[1]);
  const posts = [...modulo.matchAll(/idvPostar\("([a-z-]+)"/g), ...modulo.matchAll(/idvAtoNoCiclo\(botao, "([a-z-]+)"/g)].map(m => m[1]);
  for (const a of gets) if (!LEITURAS.includes(a)) faltam.push(`GET ${a} não existe no handler`);
  for (const a of posts) if (!ESCRITAS.includes(a)) faltam.push(`POST ${a} não existe no handler`);
  if (new Set(gets).size !== LEITURAS.length) faltam.push(`a tela devia usar as ${LEITURAS.length} leituras do handler (usa ${[...new Set(gets)].join(",")})`);
  if (new Set(posts).size !== ESCRITAS.length) faltam.push(`a tela devia usar as ${ESCRITAS.length} escritas do handler (usa ${[...new Set(posts)].join(",")})`);
  // o 428: exatamente abrir-votacao, desempate, resultado e o finalista da triagem
  if (JSON.stringify([...FATOR_ACOES].sort()) !== JSON.stringify(["abrir-votacao", "desempate", "resultado"]) || !FATOR_TRIAR) faltam.push(`a confirmação reforçada do handler mudou: ${LINHA_FATOR.trim()}`);
  if (!/if \(r\.res\.status === 428\) \{ const ok = await confirmarFatorAgora\(\); if \(ok\) r = await idvTentar\(url, opcoes\); \}/.test(modulo)) faltam.push("a tela devia tratar o 428 com confirmarFatorAgora e repetir a chamada uma vez");
  // os campos que a tela lê, na forma que o banco devolve
  const campos = ["identidadeVigente", "proximoAno", "calendarioProximo", "apto", "maxSugestoes", "maxTexto", "maxArtes", "maxImagemBytes", "minhasSugestoes", "textoNaVotacao", "situacao",
    "sugestaoId", "votacao", "aberta", "jaVotou", "votouEm", "enqueteId", "perguntaId", "opcaoId", "votos", "participantes", "cores", "minhasArtes", "arteId", "temImagem", "motivoRecusa",
    "enviadaEm", "resultado", "dataCulto", "ocasiaoRotulo", "votosVencedor", "presentes", "podeAbrir", "motivoNaoAbre", "ciclos", "cicloId", "anoAlvo", "fase", "calendario", "abertoEm",
    "abertoPor", "votacaoAutomatica", "apuracao", "tema", "desempate", "motivo", "resultadoPendente", "sugestoes", "retiradas", "textoFinal", "parecido", "criterio", "rotulo", "observacao",
    "triadaPor", "triadaEm", "anonimizada", "corId", "ordem", "nome", "hex", "artes", "titulo", "descricao", "autor", "congregacao", "registradoPor", "registradoEm", "ata", "temaUsadoId", "origem"];
  for (const c of campos) if (!new RegExp(`\\b${c}\\b`).test(dbSrc) && !new RegExp(`\\b${c}\\b`).test(HANDLER)) faltam.push(`campo ${c} não aparece no servidor`);
  // os campos que a tela LÊ e o servidor manda: d.X / c.X / v.X ... no módulo, conferidos um a um contra o servidor
  const lidos = new Set([...modulo.matchAll(/\b(?:d|c|v|r|s|a|k|o|p|t|data|cor|ciclo|votacao|idvMeu|idvCat)\.([a-z][A-Za-z]+)\b/g)].map(m => m[1]));
  const daTela = new Set(["length", "map", "filter", "some", "find", "reduce", "join", "includes", "push", "value", "checked", "files", "size", "type", "sucesso", "mensagem", "httpStatus", "jaAvisado",
    "classList", "setAttribute", "style", "innerHTML", "textContent", "className", "disabled", "toUpperCase", "test", "gestao", "criterios", "ocasioes", "limites", "abort", "signal", "res", "corpo",
    "status", "json", "subarray", "precisaFator", "url", "papeis", "codigo", "g", "ctx", "slice", "falhaDeRede", "tempoEsgotado", "name", "message", "arrayBuffer", "inicio", "fim", "sugestao",
    "triagem", "arte", "texto", "ano"]);
  const desconhecidos = [...lidos].filter(x => !daTela.has(x) && !new RegExp(`\\b${x}\\b`).test(dbSrc) && !new RegExp(`\\b${x}\\b`).test(HANDLER));
  if (desconhecidos.length) faltam.push(`campos que a tela lê e o servidor não manda: ${desconhecidos.join(", ")}`);
  if (!/papeis: \{ gestao \}/.test(HANDLER)) faltam.push("catalogos devia devolver papeis { gestao }");
  if (!/criterios: Object\.values\(iv\.CRITERIOS\)/.test(HANDLER) || !/ocasioes: Object\.entries\(iv\.OCASIOES\)/.test(HANDLER)) faltam.push("catalogos devia devolver os critérios e as ocasiões");
  // o voto e Meu Painel → Votações (GestaoEnquetes)
  if (!/String\(req\.query\.paraVotar\) === "1"/.test(enqSrv)) faltam.push("GestaoEnquetes devia atender GET ?paraVotar=1");
  for (const c of ["jaRespondeu", "respondidaEm", "identidadeVisual", "dataFechamentoPrevista", "perguntas", "enquetes"]) if (!new RegExp(`\\b${c}\\b`).test(enqSrv)) faltam.push(`GestaoEnquetes não manda ${c}`);
  if (!/acao === "votar"/.test(enqSrv) || !/const \{ respostas \} = corpo;/.test(enqSrv)) faltam.push("GestaoEnquetes devia receber o voto em {id}/votar com { respostas }");
  if (!/body: JSON\.stringify\(\{ respostas: \[\{ perguntaId, opcaoId: idvInteiro\(escolhida\.opcaoId\) \}\] \}\)/.test(modulo)) faltam.push("o voto da Identidade Visual devia mandar { respostas: [{ perguntaId, opcaoId }] }");
  if (!/enquetes\?paraVotar=1/.test(enq) || !/\/enquetes\/\$\{id\}\/votar/.test(enq)) faltam.push("Meu Painel → Votações devia usar GET ?paraVotar=1 e POST {id}/votar");
  if (!/perguntaId: pid, opcaoId:/.test(enq) || !/perguntaId: pid, textoResposta: texto/.test(enq)) faltam.push("Meu Painel → Votações devia mandar opcaoId (OPCOES) ou textoResposta (TEXTO_LIVRE)");
  if (!/dataFechamentoPrevista/.test(enq) || !/corpo\.dataFechamentoPrevista/.test(enqSrv)) faltam.push("o formulário da enquete devia mandar dataFechamentoPrevista e o servidor ler");
  // a enquete da votação do tema: um voto por pessoa, as opções = os finalistas
  if (!/'TODOS_ATIVOS'/.test(dbSrc) || !/'OPCOES'/.test(dbSrc)) faltam.push("a votação do tema devia ser uma enquete de todos os ativos, com uma pergunta de opções");
  return faltam;
}

module.exports = { criarServidor, contratoComOServidor, ATAQUE, URL_IMAGEM, HORA, DIA, LEITURAS, ESCRITAS, EXIGE_GESTAO, FATOR_ACOES };
