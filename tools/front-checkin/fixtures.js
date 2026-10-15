// fixtures.js — um SERVIDOR SIMULADO COM ESTADO da v7.10 (check-in infantil), nos formatos REAIS do backend. Nada aqui é "o que a tela espera": é o que o servidor manda.
// Como se garante a fidelidade:
//  - toda REGRA que é pura vem do código de verdade do servidor, importado: api/shared/checkinInfantil.js (validar* de cada corpo, avaliarJanela, avaliarLotacao, avaliarSaidaVoluntario,
//    montarAutorizados, classificarRetirante, gerarCodigo/hashCodigo/confereCodigo, montarEtiqueta, linhaDoHistoricoParaResponsavel, MENSAGENS), api/shared/menoresConsentimento.js
//    (o texto de autorização da saúde e o hash) e api/shared/ministerioMenores.js (faixas e proporção). Se a tela mandar um corpo que o validador de verdade recusa, a resposta é o 422 de verdade;
//  - o que o handler (api/GestaoCheckinInfantil/index.js) e a camada do banco (api/shared/checkinInfantilDb.js) montam é reproduzido linha a linha (snapshotDaSala, minhasSalas, fazerCheckin,
//    retirar, segunda via, decidirDivergencia, destravar, autorizados, saúde, histórico, relatório), com as mesmas mensagens e os mesmos códigos HTTP (resposta(): 403 proibido, 404 não achou, 409 mudou, 422 recusa);
//  - `contratoComOServidor()` confere por escrito que o código do servidor ainda tem cada rota, cada método e cada campo que a tela usa.
"use strict";
const fs = require("fs");
const path = require("path");
const API = path.resolve(__dirname, "../../api");
const ck = require(path.join(API, "shared/checkinInfantil"));
const mc = require(path.join(API, "shared/menoresConsentimento"));
const mm = require(path.join(API, "shared/ministerioMenores"));
const vol = require(path.join(API, "shared/voluntariado"));

const SEGREDO = "segredo-de-teste-do-check-in-infantil-0123456789";
const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";
// texto de ataque: sai do atributo (aspas), sai da tag (>) e abre uma imagem quebrada com onerror; o nome do campo identifica quem vazou
const ATAQUE = (campo) => `"'><img src=x onerror="window.__xss('${campo}')"><svg onload=window.__xss('${campo}')>[${campo}]`;
const HORA = 3600000, MIN = 60000;
const lista = (obj) => Object.entries(obj).map(([codigo, rotulo]) => ({ codigo, rotulo }));
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

// `op`: { ataque, hoje, agoraMs, fatorFresco }
function criarServidor(op = {}) {
  const ataque = !!op.ataque;
  const n = (campo, base) => (ataque ? `${base} ${ATAQUE(campo)}` : base);   // com `ataque`, todo texto do servidor leva o texto de ataque
  const hoje = op.hoje || "2026-10-15";
  const S = { hoje, agoraMs: op.agoraMs || Date.parse("2026-10-15T12:30:00.000Z"), seq: 900, fatorFresco: !!op.fatorFresco, escopo: ["Sede"], erros: [], eventos: [], registros: [], vias: [], codigos: {}, nVias: 0 };
  S.sessao = { membroId: 41, lideranca: false, gestao: false };
  S.pessoas = {
    41: { nome: n("vol41", "Ana Voluntária"), apto: true, adulto: true }, 42: { nome: n("vol42", "Bia Voluntária"), apto: true, adulto: true },
    43: { nome: n("vol43", "Caio Voluntário"), apto: true, adulto: true }, 44: { nome: n("vol44", "Duda Auxiliar"), apto: true, adulto: false },
    45: { nome: n("vol45", "Edu Sem Habilitação"), apto: false, adulto: true }, 9: { nome: n("gestor9", "Líder Gestor"), apto: true, adulto: true }, 8: { nome: n("gestor8", "Segundo Gestor"), apto: true, adulto: true }
  };
  const resp = (id, nome, vinculo, tel) => ({ membroId: id, nome: n(`resp${id}`, nome), vinculo, telefone: tel });
  S.membros = [
    { menorId: 101, nome: n("menor101", "Pedro Souza"), nascimento: "2022-03-10", responsaveis: [resp(201, "Maria Souza", "MAE", "(11) 98888-0001"), resp(202, "José Souza", "PAI", "(11) 98888-0002")], autorizados: [], saude: null, consentimento: false },
    { menorId: 102, nome: n("menor102", "Lia Souza"), nascimento: "2021-06-01", responsaveis: [resp(201, "Maria Souza", "MAE", "(11) 98888-0001"), resp(202, "José Souza", "PAI", "(11) 98888-0002")], autorizados: [], saude: null, consentimento: true },
    { menorId: 103, nome: n("menor103", "Teo Lima"), nascimento: "2022-01-20", responsaveis: [], autorizados: [], saude: null, consentimento: false },
    { menorId: 104, nome: n("menor104", "Davi Costa"), nascimento: "2019-02-02", responsaveis: [resp(203, "Carla Costa", "MAE", "(11) 97777-0003")], autorizados: [], saude: null, consentimento: false },
    { menorId: 105, nome: n("menor105", "Bia Dias"), nascimento: "2024-05-05", responsaveis: [resp(204, "Rita Dias", "MAE", "(11) 96666-0004")], autorizados: [], saude: null, consentimento: false }
  ];
  S.membros.forEach(m => { m.idade = vol.idadeEmAnos(m.nascimento, hoje); m.congregacao = "Sede"; });
  S.membros.push({ menorId: 106, nome: n("menor106", "Noa Norte"), nascimento: "2022-02-02", idade: 4, congregacao: "Norte", responsaveis: [resp(205, "Paula Norte", "MAE", "(11) 95555-0005")], autorizados: [], saude: null, consentimento: false });
  const sala = (servicoId, equipeId, nome, faixa, cong, congId, extra = {}) => Object.assign({
    servicoId, equipeId, equipeNome: n(`equipe${equipeId}`, nome), faixa, liderMembroId: 42, congregacaoId: congId, congregacaoNome: cong, dataHora: "2026-10-15T09:00:00.000Z", descricao: n(`descricao${servicoId}`, "Culto de domingo"),
    servicoStatus: "PUBLICADA", equipeAtiva: true, contatoComMenores: true, escalados: [41, 42, 43, 44, 45], voluntarios: []
  }, extra);
  S.salas = [sala(501, 31, "Maternal", "MATERNAL", "Sede", 2), sala(502, 32, "Juniores", "JUNIORES", "Sede", 2, { escalados: [43] }), sala(503, 33, "Berçário", "BERCARIO", "Norte", 3, { escalados: [] })];
  S.salas[0].voluntarios.push({ membroId: 42, entrouEm: S.agoraMs - 20 * MIN, saiuEm: null });
  const salaDe = (s, e) => S.salas.find(x => x.servicoId === Number(s) && x.equipeId === Number(e)) || null;
  const idDe = ck.idDe;
  const agoraIso = () => new Date(S.agoraMs - 3 * HORA).toISOString().slice(0, 16);
  const prazos = ck.prazosDoCheckin({});
  const params = (s) => ({ adultosMinimos: mm.ADULTOS_MINIMOS_PADRAO, criancasPorAdulto: s.faixa ? mm.criancasPorAdulto(s.faixa) : null });
  const nomeDe = (id) => (S.pessoas[id] ? S.pessoas[id].nome : `Matrícula ${id}`);
  const escopoOk = (s) => !!S.sessao.gestao && !!S.sessao.lideranca && S.escopo.includes(s.congregacaoNome);
  const respostaHttp = (r, statusOk = 200) => ({ status: r.sucesso ? statusOk : r.proibido ? 403 : r.naoAchou ? 404 : r.mudou ? 409 : 422, corpo: r });
  const falha = (status, mensagem) => ({ status, corpo: { sucesso: false, mensagem } });
  const evento = (reg, s, tipo, ator, detalhe) => { S.eventos.push({ eventoId: ++S.seq, registroId: reg ? reg.registroId : null, servicoId: s.servicoId, equipeId: s.equipeId, tipo, ator, em: S.agoraMs, detalhe: detalhe || null }); };

  // ---- quem opera a sala (a aptidão é reavaliada a cada ato) ----
  const papelDoOperador = (s, id) => {
    const alocado = s.escalados.includes(id), lider = s.liderMembroId === id;
    if (!alocado && !lider) return { pode: false, motivo: ck.MENSAGENS.SEM_ACESSO_A_SALA };
    const p = S.pessoas[id] || { apto: false, adulto: false };
    if (!p.apto) return { pode: false, motivo: "Você não está apto hoje para servir com menores: falta a confirmação da sua ficha cadastral." };
    if (!p.adulto) return { pode: false, motivo: "Só adultos (18 anos ou mais) operam o check-in: o adolescente serve como auxiliar na sala." };
    return { pode: true };
  };
  const presente = (s, id) => s.voluntarios.some(v => v.membroId === Number(id) && v.saiuEm == null);
  const conferirOperador = (s, id) => {
    const p = papelDoOperador(s, id);
    if (!p.pode) return { sucesso: false, proibido: true, mensagem: p.motivo };
    if (!presente(s, id)) return { sucesso: false, proibido: true, mensagem: "Entre na sala primeiro (botão \"Entrar na sala\"): só quem está na sala opera o check-in." };
    return { sucesso: true };
  };
  const presentes = (s) => s.voluntarios.filter(v => v.saiuEm == null).map(v => {
    const p = S.pessoas[v.membroId] || { apto: false, adulto: false };
    return { membroId: v.membroId, nome: nomeDe(v.membroId), entrouEm: iso(v.entrouEm), apto: !!p.apto, contaComoAdulto: !!(p.apto && p.adulto) };
  });
  const naSala = (s) => S.registros.filter(r => r.servicoId === s.servicoId && r.equipeId === s.equipeId && r.situacao !== "RETIRADA");
  const membroDe = (id) => S.membros.find(m => m.menorId === Number(id)) || null;

  // ---- quem pode retirar a criança (a regra é a do servidor) ----
  const autorizadosDe = (r) => {
    const m = r.menorId ? membroDe(r.menorId) : null;
    const fixos = m ? m.autorizados.filter(a => !a.revogadoEm).map(a => ({ autorizadoId: a.autorizadoId, membroId: a.membroId, nome: a.nome, parentesco: a.parentesco, validoAte: a.validoAte })) : [];
    const trouxe = r.trouxeMembroId || r.trouxeNome ? { membroId: r.trouxeMembroId || null, nome: r.trouxeMembroId ? nomeDeResponsavel(r.trouxeMembroId) : r.trouxeNome, parentesco: r.trouxeParentesco || null } : null;
    return ck.montarAutorizados({ responsaveis: m ? m.responsaveis.map(x => ({ membroId: x.membroId, nome: x.nome, vinculo: x.vinculo })) : [], fixos, trouxe, daVisita: r.extras.map((x, i) => ({ autorizadoVisitaId: r.registroId * 10 + i + 1, nome: x.nome, parentesco: x.parentesco })), hoje });
  };
  const nomeDeResponsavel = (id) => { for (const m of S.membros) { const r = m.responsaveis.find(x => x.membroId === Number(id)); if (r) return r.nome; } return nomeDe(id); };

  // ---- a lotação e a janela ----
  const lotacaoDe = (s, adicionar) => ck.avaliarLotacao({ adultos: presentes(s).filter(x => x.contaComoAdulto).length, criancas: naSala(s).length, adicionar, faixa: s.faixa, criancasPorAdulto: params(s).criancasPorAdulto, adultosMinimos: params(s).adultosMinimos });
  const janelaDe = (s) => ck.avaliarJanela({ servicoIso: s.dataHora, agoraIso: agoraIso(), antesMin: prazos.abreMinutosAntes, depoisHoras: prazos.fechaHorasDepois });
  const infoDaSala = (s) => ({ servicoId: s.servicoId, equipeId: s.equipeId, equipeNome: s.equipeNome, faixa: s.faixa, liderMembroId: s.liderMembroId, congregacaoId: s.congregacaoId, congregacaoNome: s.congregacaoNome, dataHora: s.dataHora, descricao: s.descricao, servicoStatus: s.servicoStatus, equipeAtiva: s.equipeAtiva });

  // ---- a leitura da sala (snapshotDaSala, linha a linha) ----
  const snapshot = (s, visao) => {
    const regs = naSala(s);
    const viaDe = (r) => S.vias.find(v => v.registroId === r.registroId && !v.confirmadaEm && !v.canceladaEm && S.agoraMs - v.pedidaEm < ck.SEGUNDA_VIA_MINUTOS * MIN);
    const criancas = regs.map(r => {
      const via = viaDe(r);
      const c = {
        registroId: r.registroId, nome: r.nome, tipo: r.menorId ? "MEMBRO" : "VISITANTE", idade: r.idade, foraDaFaixa: !!r.foraDaFaixa, entregueEm: iso(r.entregueEm), situacao: r.situacao, rotuloSituacao: ck.SITUACOES[r.situacao],
        travado: !!r.travado, tentativasRestantes: Math.max(0, prazos.tentativasCodigo - r.tentativas), saude: r.saudeTexto || null,
        quemTrouxe: { nome: r.trouxeMembroId ? nomeDeResponsavel(r.trouxeMembroId) : r.trouxeNome || null, parentesco: r.trouxeParentesco || null },
        quemPodeRetirar: autorizadosDe(r).map(a => ({ ref: a.ref, tipo: a.tipo, nome: a.nome, rotulo: a.rotulo })),
        segundaViaPendente: via ? { viaId: via.viaId, pedidaEm: iso(via.pedidaEm), pedidaPorMembroId: via.pedidaPor, pessoaNome: via.pessoaNome || null } : null,
        divergencia: r.situacao === "RETIRADA_PENDENTE" ? { pedidaEm: iso(r.divergenciaPedidaEm), quem: { nome: r.retiradoNome || null, parentesco: r.retiradoParentesco || null, documento: r.retiradoDocumento || null }, pedidaPorMembroId: r.retiradoPorOperadorId } : null
      };
      if (visao === "GESTOR") {
        c.telefoneDeQuemTrouxe = r.trouxeContato || null;
        if (r.menorId) c.responsaveisParaContato = membroDe(r.menorId).responsaveis.map(x => ({ nome: x.nome, telefone: x.telefone || null }));
      }
      return c;
    });
    const todos = S.registros.filter(r => r.servicoId === s.servicoId && r.equipeId === s.equipeId);
    return {
      sala: Object.assign(infoDaSala(s), { janela: janelaDe(s) }), adultosPresentes: presentes(s), lotacao: lotacaoDe(s, 0), criancas,
      totais: { entregues: todos.length, retiradas: todos.filter(r => r.situacao === "RETIRADA").length, naSala: regs.length },
      pendencias: { divergencias: criancas.filter(c => c.divergencia).length, segundasVias: criancas.filter(c => c.segundaViaPendente).length, travadas: criancas.filter(c => c.travado).length },
      atualizadoEm: iso(S.agoraMs)
    };
  };

  // ---- a sala (par serviço + equipe) e quem age nela (abrirSala do handler) ----
  const abrirSala = (origem, modo) => {
    const v = ck.validarSala(origem);
    if (!v.valido) return { falha: [400, v.mensagem] };
    const s = salaDe(v.servicoId, v.equipeId);
    if (!s) return { falha: [404, ck.MENSAGENS.SALA_NAO_ENCONTRADA] };
    if (!s.contatoComMenores) return { falha: [422, ck.MENSAGENS.SALA_SEM_MARCA] };
    const comoGestor = escopoOk(s);
    if (modo === "sala") return { s, comoGestor };
    if (modo === "gestor") return comoGestor ? { s, comoGestor: true } : { falha: [403, SEM_PERMISSAO] };
    const p = papelDoOperador(s, S.sessao.membroId);
    if (!p.pode && !comoGestor) return { falha: [403, p.motivo || SEM_PERMISSAO] };
    return { s, comoGestor, comoOperador: p.pode };
  };
  const registroComSala = (registroId) => {
    const r = S.registros.find(x => x.registroId === registroId);
    if (!r) return { sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA };
    return { sucesso: true, r, s: salaDe(r.servicoId, r.equipeId) };
  };

  // ---- criar um registro (check-in) ----
  const novoRegistro = (s, c, trouxe, extras, operadorId, saudeTexto) => {
    const codigo = ck.gerarCodigo();
    const r = {
      registroId: ++S.seq, servicoId: s.servicoId, equipeId: s.equipeId, congregacaoId: s.congregacaoId, tipo: c.tipo, menorId: c.tipo === "MEMBRO" ? c.menorId : null, nome: c.nome, nascimento: c.nascimento || null,
      idade: c.idade, foraDaFaixa: ck.idadeForaDaFaixa(c.idade, s.faixa), trouxeMembroId: trouxe.membroId || null, trouxeNome: trouxe.membroId ? null : trouxe.nome, trouxeParentesco: trouxe.parentesco || null,
      trouxeContato: trouxe.contato || null, trouxeDocumento: trouxe.documento || null, saudeTexto: saudeTexto || null, geracao: 1, tentativas: 0, travado: false, situacao: "NA_SALA", entregueEm: S.agoraMs,
      entreguePor: operadorId, extras: (extras || []).map(x => ({ nome: x.nome, parentesco: x.parentesco })), retiradoEm: null, divergente: false
    };
    r.codigoHash = ck.hashCodigo(codigo, { registroId: r.registroId, geracao: 1, segredo: SEGREDO });
    S.codigos[r.registroId] = codigo;
    S.registros.push(r);
    evento(r, s, "CHECKIN", operadorId);
    return { r, codigo };
  };
  S.semear = ({ sala: salaId, menorId, visitante, trouxeMembroId, trouxeNome, trouxeParentesco, trouxeContato, saude, extras, situacao, travado, tentativas } = {}) => {
    const s = salaId ? S.salas.find(x => x.servicoId === salaId) : S.salas[0];
    const m = menorId ? membroDe(menorId) : null;
    const c = m ? { tipo: "MEMBRO", menorId: m.menorId, nome: m.nome, idade: m.idade } : { tipo: "VISITANTE", nome: visitante.nome, nascimento: visitante.nascimento, idade: vol.idadeEmAnos(visitante.nascimento, hoje) };
    const trouxe = trouxeMembroId ? { membroId: trouxeMembroId, parentesco: trouxeParentesco || "MAE" } : { nome: trouxeNome || n("trouxe", "Tia Zeza"), parentesco: trouxeParentesco || "TIO", contato: trouxeContato || (visitante ? "11999990000" : null), documento: "RG" };
    const { r, codigo } = novoRegistro(s, c, trouxe, extras, 42, saude);
    if (situacao) { r.situacao = situacao; if (situacao === "RETIRADA") { r.retiradoEm = S.agoraMs; r.retiradoNome = "Alguém"; } }
    if (travado) { r.travado = true; r.tentativas = tentativas || prazos.tentativasCodigo; } else if (tentativas) r.tentativas = tentativas;
    return { r, codigo, registroId: r.registroId };
  };
  S.pedirDivergencia = (registroId, quem) => {   // um registro que já espera a liderança (retirada por quem não está na lista)
    const r = S.registros.find(x => x.registroId === registroId);
    Object.assign(r, { situacao: "RETIRADA_PENDENTE", divergente: true, divergenciaPedidaEm: S.agoraMs, retiradoNome: quem.nome, retiradoParentesco: quem.parentesco, retiradoDocumento: quem.documento, retiradoPorOperadorId: quem.operadorId || 42 });
  };
  S.entrar = (s, membroId) => { s.voluntarios.push({ membroId, entrouEm: S.agoraMs, saiuEm: null }); };
  S.voluntariosPresentes = (s) => presentes(s || S.salas[0]);

  // ---- o catálogo (GET catalogos, a mesma montagem do handler) ----
  const catalogos = () => {
    const t = mc.textoDe("SAUDE_CRACHA");
    return {
      sucesso: true, parentescos: lista(ck.PARENTESCOS), documentos: lista(ck.DOCUMENTOS), faixas: Object.entries(mm.FAIXAS).map(([codigo, f]) => ({ codigo, rotulo: f.rotulo })),
      textoSaude: { versao: t.versao, titulo: t.titulo, itens: t.itens, aceite: t.aceite, hash: t.hash }, tentativas: prazos.tentativasCodigo, janela: { antesMinutos: prazos.abreMinutosAntes, depoisHoras: prazos.fechaHorasDepois },
      segundaViaMinutos: ck.SEGUNDA_VIA_MINUTOS, maxAutorizados: ck.MAX_AUTORIZADOS_POR_CRIANCA, maxCriancasPorCheckin: ck.MAX_CRIANCAS_POR_CHECKIN, papeis: { gestao: !!(S.sessao.gestao && S.sessao.lideranca) }
    };
  };

  // ---- autorizados e saúde de uma criança membro (o responsável ou a liderança) ----
  const sonda = { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL };
  const ehResponsavel = (m, id) => m.responsaveis.some(x => x.membroId === Number(id));
  const acessoAoMenor = (m) => {
    if (!m || m.idade >= vol.MAIORIDADE) return null;
    return ehResponsavel(m, S.sessao.membroId) || (S.sessao.gestao && S.sessao.lideranca && S.escopo.includes(m.congregacao)) ? m : null;
  };
  const mapearAutorizado = (a) => ({ autorizadoId: a.autorizadoId, nome: a.nome, parentesco: a.parentesco, rotuloParentesco: ck.PARENTESCOS[a.parentesco] || null, membroId: a.membroId || null, validoAte: a.validoAte || null, forma: a.forma, registradoEm: iso(a.registradoEm) });
  const listarAutorizados = (menorId) => {
    const m = acessoAoMenor(membroDe(menorId));
    if (!m) return sonda;
    return { sucesso: true, menor: { menorId: m.menorId, nome: m.nome, idade: m.idade }, responsaveis: m.responsaveis.map(x => ({ nome: x.nome, rotuloVinculo: vol.VINCULOS_RESPONSAVEL[x.vinculo] || null })), autorizados: m.autorizados.filter(a => !a.revogadoEm).map(mapearAutorizado), limite: ck.MAX_AUTORIZADOS_POR_CRIANCA };
  };

  // ============================== o roteador (o handler GestaoCheckinInfantil) ==============================
  const responder = (c) => {
    const m = /^checkin-infantil\/([a-z-]+)$/.exec(c.caminho);
    if (!m) return null;
    const acao = m[1], metodo = c.metodo, corpo = c.corpo && typeof c.corpo === "object" && !Array.isArray(c.corpo) ? c.corpo : {}, q = c.consulta || {};
    S.chamadasDoServidor = (S.chamadasDoServidor || 0) + 1;
    if (S.recusarTudo) return S.recusarTudo;
    const sess = S.sessao, gestao = !!(sess.gestao && sess.lideranca);
    for (const campo of ["servicoId", "equipeId", "menorId", "registroId", "membroId", "autorizadoId"]) for (const origem of [corpo, q]) if (campo in origem && origem[campo] != null && origem[campo] !== "" && !idDe(origem[campo])) return falha(400, `${campo} inválido.`);
    if (metodo === "GET") {
      if (acao === "catalogos") return { status: 200, corpo: catalogos() };
      if (acao === "minhas-salas") {
        const salas = [];
        for (const s of S.salas) {
          const meu = s.escalados.includes(sess.membroId) || s.liderMembroId === sess.membroId, comoGestor = escopoOk(s);
          if (!s.contatoComMenores || (!meu && !comoGestor)) continue;
          salas.push({ servicoId: s.servicoId, equipeId: s.equipeId, equipeNome: s.equipeNome, faixa: s.faixa, congregacaoId: s.congregacaoId, congregacaoNome: s.congregacaoNome, dataHora: s.dataHora, descricao: s.descricao,
            janela: janelaDe(s), ehMinha: meu, ehGestao: comoGestor, criancasNaSala: naSala(s).length, voluntariosNaSala: presentes(s).length });
        }
        return { status: 200, corpo: { sucesso: true, salas } };
      }
      if (acao === "meus-filhos") return { status: 200, corpo: { sucesso: true, filhos: S.membros.filter(x => x.idade < vol.MAIORIDADE && ehResponsavel(x, sess.membroId)).map(x => ({ menorId: x.menorId, nome: x.nome, idade: x.idade, vinculo: x.responsaveis.find(r => r.membroId === sess.membroId).vinculo, rotuloVinculo: vol.VINCULOS_RESPONSAVEL[x.responsaveis.find(r => r.membroId === sess.membroId).vinculo] })) } };
      if (acao === "historico") {
        const menorId = idDe(q.menorId);
        const h = S.registros.filter(r => r.menorId && (!menorId || r.menorId === menorId) && ehResponsavel(membroDe(r.menorId), sess.membroId)).sort((a, b) => b.registroId - a.registroId).map(r => {
          const s = salaDe(r.servicoId, r.equipeId);
          return Object.assign(ck.linhaDoHistoricoParaResponsavel({ registroId: r.registroId, data: s.dataHora.slice(0, 10), salaNome: s.equipeNome, congregacaoNome: s.congregacaoNome, entregueEm: iso(r.entregueEm), retiradoEm: iso(r.retiradoEm), situacao: r.situacao,
            quemTrouxe: r.trouxeMembroId ? nomeDeResponsavel(r.trouxeMembroId) : r.trouxeNome, quemRetirou: r.situacao === "RETIRADA" ? r.retiradoNome : null, divergente: !!r.divergente }), { menorId: r.menorId, crianca: r.nome });
        });
        return { status: 200, corpo: { sucesso: true, historico: h } };
      }
      if (acao === "autorizados") { const menorId = idDe(q.menorId); if (!menorId) return falha(400, "Informe menorId."); return respostaHttp(listarAutorizados(menorId)); }
      if (acao === "saude") {
        const menorId = idDe(q.menorId); if (!menorId) return falha(400, "Informe menorId.");
        const mm1 = acessoAoMenor(membroDe(menorId));
        if (!mm1) return respostaHttp(sonda);
        return respostaHttp({ sucesso: true, menorId: mm1.menorId, consentimentoVigente: !!mm1.consentimento, saude: mm1.consentimento && mm1.saude ? { texto: mm1.saude.texto, forma: mm1.saude.forma, atualizadoEm: iso(mm1.saude.atualizadoEm) } : null });
      }
      if (acao === "sala" || acao === "relatorio") {
        const a = abrirSala(q, "qualquer");
        if (a.falha) return falha(...a.falha);
        if (acao === "sala") return { status: 200, corpo: Object.assign({ sucesso: true }, snapshot(a.s, a.comoGestor ? "GESTOR" : "OPERADOR")) };
        const s = a.s;
        const regs = S.registros.filter(r => r.servicoId === s.servicoId && r.equipeId === s.equipeId);
        return { status: 200, corpo: { sucesso: true, sala: infoDaSala(s), voluntarios: s.voluntarios.map(v => ({ membroId: v.membroId, nome: nomeDe(v.membroId), entrouEm: iso(v.entrouEm), saiuEm: iso(v.saiuEm) })),
          criancas: regs.map(r => ({ registroId: r.registroId, nome: r.nome, tipo: r.menorId ? "MEMBRO" : "VISITANTE", idade: r.idade, entregueEm: iso(r.entregueEm), quemTrouxe: r.trouxeMembroId ? nomeDeResponsavel(r.trouxeMembroId) : r.trouxeNome || null, situacao: r.situacao, retiradoEm: iso(r.retiradoEm), quemRetirou: r.retiradoNome || null, retiradaDivergente: !!r.divergente, tipoRetirante: r.retiradoTipo || null })),
          eventos: S.eventos.filter(e => e.servicoId === s.servicoId && e.equipeId === s.equipeId).map(e => ({ eventoId: e.eventoId, registroId: e.registroId, tipo: e.tipo, rotulo: ck.TIPOS_EVENTO[e.tipo] || e.tipo, ator: nomeDe(e.ator), em: iso(e.em), detalhe: e.detalhe })) } };
      }
      if (acao === "buscar" || acao === "responsaveis") {
        const a = abrirSala(q, "sala");
        if (a.falha) return falha(...a.falha);
        const op = conferirOperador(a.s, sess.membroId);
        if (!op.sucesso) return respostaHttp(op);
        if (acao === "buscar") {
          const t = String(q.q == null ? "" : q.q).trim();
          if (t.length < 3 || t.length > 60 || /[<>%_\[\]]/.test(t)) return respostaHttp({ sucesso: false, mensagem: "Digite ao menos 3 letras do nome da criança." });
          const achados = S.membros.filter(x => x.congregacao === a.s.congregacaoNome && x.idade < vol.MAIORIDADE && x.nome.toLowerCase().includes(t.toLowerCase())).slice(0, 8);
          return respostaHttp({ sucesso: true, criancas: achados.map(x => ({ menorId: x.menorId, nome: x.nome, idade: x.idade, faixa: ck.faixaDaIdade(x.idade), foraDaFaixa: ck.idadeForaDaFaixa(x.idade, a.s.faixa), temResponsavel: x.responsaveis.length > 0, jaNaSala: S.registros.some(r => r.menorId === x.menorId && r.situacao !== "RETIRADA") })) });
        }
        const menorId = idDe(q.menorId);
        if (!menorId) return falha(400, "Informe menorId.");
        const mm2 = membroDe(menorId);
        if (!mm2 || mm2.congregacao !== a.s.congregacaoNome) return respostaHttp({ sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA });
        return respostaHttp({ sucesso: true, responsaveis: mm2.responsaveis.map(x => ({ membroId: x.membroId, nome: x.nome, vinculo: x.vinculo, rotuloVinculo: vol.VINCULOS_RESPONSAVEL[x.vinculo] || null })) });
      }
      return falha(404, "Ação inválida.");
    }
    if (metodo !== "POST") return falha(405, "Método não suportado.");

    // ---- o responsável: lista de autorizados e saúde ----
    if (acao === "autorizado-adicionar") {
      const v = ck.validarAutorizado(corpo);
      if (!v.valido) return falha(422, v.mensagem);
      const ficha = corpo.ficha === true;
      if (ficha && !gestao) return falha(403, SEM_PERMISSAO);
      const mn = membroDe(v.menorId), acesso = acessoAoMenor(mn);
      if (!acesso) return respostaHttp(sonda);
      if (!ficha && !ehResponsavel(mn, sess.membroId)) return respostaHttp(sonda);
      if (ficha && !v.referencia) return respostaHttp({ sucesso: false, mensagem: "Informe a referência da ficha assinada pelo responsável (onde ela está arquivada)." });
      if (v.validoAte && v.validoAte < hoje) return respostaHttp({ sucesso: false, mensagem: "A validade não pode ser uma data que já passou." });
      if (mn.autorizados.filter(a => !a.revogadoEm).length >= ck.MAX_AUTORIZADOS_POR_CRIANCA) return respostaHttp({ sucesso: false, mensagem: `Cada criança pode ter até ${ck.MAX_AUTORIZADOS_POR_CRIANCA} pessoas autorizadas. Revogue uma para incluir outra.` });
      if (mn.autorizados.some(a => !a.revogadoEm && a.nome.toLowerCase() === v.nome.toLowerCase())) return respostaHttp({ sucesso: false, mensagem: "Esta pessoa já está na lista de autorizados desta criança." });
      const a = { autorizadoId: ++S.seq, nome: v.nome, parentesco: v.parentesco, membroId: v.membroId, validoAte: v.validoAte, forma: ficha ? "FICHA_FISICA" : "RESPONSAVEL", referencia: v.referencia, registradoEm: S.agoraMs };
      mn.autorizados.push(a);
      return respostaHttp({ sucesso: true, autorizadoId: a.autorizadoId, mensagem: "Pessoa autorizada a retirar a criança." }, 201);
    }
    if (acao === "autorizado-revogar") {
      const autorizadoId = idDe(corpo.autorizadoId);
      if (!autorizadoId) return falha(400, "Informe autorizadoId.");
      const dono = S.membros.find(x => x.autorizados.some(a => a.autorizadoId === autorizadoId));
      if (!dono || !acessoAoMenor(dono)) return respostaHttp(sonda);
      const a = dono.autorizados.find(x => x.autorizadoId === autorizadoId);
      if (a.revogadoEm) return respostaHttp({ sucesso: true, jaRevogado: true, mensagem: "Esta autorização já estava revogada." });
      a.revogadoEm = S.agoraMs;
      return respostaHttp({ sucesso: true, mensagem: "Autorização revogada: essa pessoa não pode mais retirar a criança (um check-in já aberto continua com a lista de quando foi feito, mas o responsável pode pedir a segunda via)." });
    }
    if (acao === "saude-gravar") {
      const v = ck.validarSaudeDaCrianca(corpo);
      if (!v.valido) return falha(422, v.mensagem);
      const ficha = corpo.ficha === true;
      if (ficha && !gestao) return falha(403, SEM_PERMISSAO);
      const mn = membroDe(v.menorId), acesso = acessoAoMenor(mn);
      if (!acesso || (!ficha && !ehResponsavel(mn, sess.membroId))) return respostaHttp(sonda);
      if (ficha && !v.referencia) return respostaHttp({ sucesso: false, mensagem: "Informe a referência da ficha assinada pelo responsável (onde ela está arquivada)." });
      if (!mn.consentimento) return respostaHttp({ sucesso: false, mensagem: "O responsável precisa autorizar primeiro o uso da informação de saúde no crachá (Meu Painel → Ministério com menores, ou ficha registrada pela Secretaria). Sem a autorização a informação não é guardada." });
      mn.saude = { texto: v.texto, forma: ficha ? "FICHA_FISICA" : "RESPONSAVEL", atualizadoEm: S.agoraMs };
      return respostaHttp({ sucesso: true, mensagem: "Informação de saúde guardada: aparece na etiqueta do check-in." });
    }
    if (acao === "saude-apagar") {
      const menorId = idDe(corpo.menorId);
      if (!menorId) return falha(400, "Informe menorId.");
      const mn = membroDe(menorId);
      if (!acessoAoMenor(mn)) return respostaHttp(sonda);
      const tinha = !!mn.saude; mn.saude = null;
      return { status: 200, corpo: { sucesso: true, mensagem: tinha ? "A informação de saúde foi apagada." : "Não havia informação de saúde guardada." } };
    }

    // ---- a equipe da sala ----
    if (acao === "entrar-na-sala") {
      const a = abrirSala(corpo, "sala");
      if (a.falha) return falha(...a.falha);
      const s = a.s;
      if (s.servicoStatus !== "PUBLICADA") return respostaHttp({ sucesso: false, mensagem: ck.MENSAGENS.SERVICO_NAO_PUBLICADO });
      const j = janelaDe(s);
      if (!j.aberta) return respostaHttp({ sucesso: false, mensagem: j.mensagem });
      const p = papelDoOperador(s, sess.membroId);
      if (!p.pode) return respostaHttp({ sucesso: false, proibido: true, mensagem: p.motivo });
      if (presente(s, sess.membroId)) return respostaHttp({ sucesso: true, jaEstava: true, mensagem: "Você já está na sala." }, 201);
      s.voluntarios.push({ membroId: sess.membroId, entrouEm: S.agoraMs, saiuEm: null });
      evento(null, s, "VOLUNTARIO_ENTROU", sess.membroId);
      return respostaHttp({ sucesso: true, mensagem: "Você entrou na sala." }, 201);
    }
    if (acao === "sair-da-sala") {
      const tiraOutro = corpo.membroId != null && corpo.membroId !== "" && idDe(corpo.membroId) !== Number(sess.membroId);
      const a = abrirSala(corpo, tiraOutro ? "gestor" : "sala");
      if (a.falha) return falha(...a.falha);
      const s = a.s, alvo = tiraOutro ? idDe(corpo.membroId) : Number(sess.membroId);
      if (!presente(s, alvo)) return respostaHttp({ sucesso: false, mensagem: "Esta pessoa não está na sala." });
      const lp = presentes(s), eu = lp.find(x => x.membroId === alvo);
      const saida = ck.avaliarSaidaVoluntario({ adultos: lp.filter(x => x.contaComoAdulto).length, criancas: naSala(s).length, contaComoAdulto: !!(eu && eu.contaComoAdulto), faixa: s.faixa, criancasPorAdulto: params(s).criancasPorAdulto, adultosMinimos: params(s).adultosMinimos });
      if (!saida.ok) return respostaHttp({ sucesso: false, mensagem: saida.mensagem });
      s.voluntarios.find(v => v.membroId === alvo && v.saiuEm == null).saiuEm = S.agoraMs;
      evento(null, s, "VOLUNTARIO_SAIU", tiraOutro ? sess.membroId : alvo, tiraOutro ? "retirado pela liderança" : null);
      return respostaHttp({ sucesso: true, mensagem: "Você saiu da sala." });
    }
    if (acao === "checkin") {
      const v = ck.validarCheckin(corpo, { hoje });
      if (!v.valido) return falha(422, v.mensagem);
      const a = abrirSala(corpo, "sala");
      if (a.falha) return falha(...a.falha);
      const s = a.s;
      if (s.servicoStatus !== "PUBLICADA") return respostaHttp({ sucesso: false, mensagem: ck.MENSAGENS.SERVICO_NAO_PUBLICADO });
      const j = janelaDe(s);
      if (!j.aberta) return respostaHttp({ sucesso: false, mensagem: j.mensagem });
      const op = conferirOperador(s, sess.membroId);
      if (!op.sucesso) return respostaHttp(op);
      const preparadas = [];
      for (const cr of v.criancas) {
        if (cr.tipo === "MEMBRO") {
          const mn = membroDe(cr.menorId);
          if (!mn || mn.congregacao !== s.congregacaoNome) return respostaHttp({ sucesso: false, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA });
          if (v.trouxe.membroId && !ehResponsavel(mn, v.trouxe.membroId)) return respostaHttp({ sucesso: false, mensagem: `${mn.nome}: a pessoa escolhida não é responsável cadastrado desta criança. ${ck.MENSAGENS.SEM_RESPONSAVEL}` });
          preparadas.push({ tipo: "MEMBRO", menorId: mn.menorId, nome: mn.nome, idade: mn.idade, saudeTexto: mn.consentimento && mn.saude ? mn.saude.texto : null });
        } else {
          if (cr.saude && !mc.hashConfere("SAUDE_CRACHA", cr.saude.textoHash)) return respostaHttp({ sucesso: false, termoMudou: true, mensagem: "O texto da autorização de saúde mudou desde que a tela foi aberta: recarregue a tela e peça ao responsável para ler de novo." });
          preparadas.push({ tipo: "VISITANTE", nome: cr.nome, nascimento: cr.nascimento, idade: cr.idade, saudeTexto: cr.saude ? cr.saude.texto : null });
        }
      }
      const lot = lotacaoDe(s, preparadas.length);
      if (!lot.ok) { evento(null, s, "SALA_RECUSOU_CHECKIN", sess.membroId); return respostaHttp({ sucesso: false, lotacao: lot, mensagem: lot.problemas[0].mensagem }); }
      for (const pr of preparadas) if (pr.tipo === "MEMBRO" && S.registros.some(r => r.menorId === pr.menorId && r.situacao !== "RETIRADA")) return respostaHttp({ sucesso: false, mensagem: `${pr.nome}: ${ck.MENSAGENS.JA_NA_SALA}` });
      const criados = preparadas.map(pr => Object.assign(novoRegistro(s, pr, v.trouxe, v.extras, sess.membroId, pr.saudeTexto), { pr }));
      const instante = iso(S.agoraMs);
      const etiquetas = criados.map(x => ({ registroId: x.r.registroId, foraDaFaixa: x.r.foraDaFaixa, etiqueta: ck.montarEtiqueta({ nomeCrianca: x.pr.nome, idade: x.pr.idade, salaNome: s.equipeNome, congregacaoNome: s.congregacaoNome, codigo: x.codigo, saudeTexto: x.pr.saudeTexto, instante }) }));
      return respostaHttp({ sucesso: true, mensagem: criados.length === 1 ? "Criança entregue na sala." : `${criados.length} crianças entregues na sala.`, etiquetas,
        recibo: { sala: s.equipeNome, congregacao: s.congregacaoNome, instante, trouxe: v.trouxe.membroId ? nomeDeResponsavel(v.trouxe.membroId) : v.trouxe.nome, criancas: etiquetas.map(e => ({ nome: e.etiqueta.nome, codigo: e.etiqueta.codigo })), orientacao: "Apresente o código na hora de retirar. Sem o código a criança não é entregue, mesmo a quem a equipe conhece." } }, 201);
    }
    if (acao === "retirar") {
      const v = ck.validarRetirada(corpo);
      if (!v.valido) return falha(422, v.mensagem);
      const rs = registroComSala(v.registroId);
      if (!rs.sucesso) return respostaHttp(rs);
      const { r, s } = rs;
      const op = conferirOperador(s, sess.membroId);
      if (!op.sucesso) return respostaHttp(op);
      if (r.situacao === "RETIRADA") return respostaHttp({ sucesso: false, mensagem: ck.MENSAGENS.JA_RETIRADA });
      if (r.situacao === "RETIRADA_PENDENTE") return respostaHttp({ sucesso: false, mensagem: "Já há um pedido de retirada aguardando a aprovação da liderança para esta criança." });
      if (r.travado) return respostaHttp({ sucesso: false, travada: true, mensagem: ck.MENSAGENS.CRIANCA_TRAVADA });
      const quem = ck.classificarRetirante(v.retirante, autorizadosDe(r));
      if (quem.erro) return respostaHttp({ sucesso: false, mensagem: quem.erro });
      if (r.tentativas >= prazos.tentativasCodigo) return respostaHttp({ sucesso: false, mudou: true, mensagem: ck.MENSAGENS.MUDOU });
      r.tentativas++;
      const certo = ck.confereCodigo(v.codigo, r.codigoHash, { registroId: r.registroId, geracao: r.geracao, segredo: SEGREDO });
      if (!certo) {
        evento(r, s, "CODIGO_ERRADO", sess.membroId, `tentativa=${r.tentativas}/${prazos.tentativasCodigo}`);
        if (r.tentativas >= prazos.tentativasCodigo) { r.travado = true; evento(r, s, "CRIANCA_TRAVADA", sess.membroId); return respostaHttp({ sucesso: false, codigoErrado: true, travada: true, mensagem: `Código errado. A criança foi travada depois de ${prazos.tentativasCodigo} erros: peça à liderança para destravar ou emita a segunda via.` }); }
        return respostaHttp({ sucesso: false, codigoErrado: true, tentativasRestantes: prazos.tentativasCodigo - r.tentativas, mensagem: `${ck.MENSAGENS.CODIGO_ERRADO} Restam ${prazos.tentativasCodigo - r.tentativas} tentativa(s).` });
      }
      if (!quem.divergente) {
        Object.assign(r, { situacao: "RETIRADA", retiradoEm: S.agoraMs, retiradoTipo: quem.tipo, retiradoMembroId: quem.membroId, retiradoNome: quem.membroId ? nomeDeResponsavel(quem.membroId) : quem.nome, retiradoPorOperadorId: sess.membroId, tentativas: 0 });
        evento(r, s, "RETIRADA", sess.membroId, quem.tipo);
        return respostaHttp({ sucesso: true, retirada: true, mensagem: "Criança entregue a quem a retirou." });
      }
      Object.assign(r, { situacao: "RETIRADA_PENDENTE", retiradoTipo: "OUTRO", retiradoMembroId: null, retiradoNome: quem.nome, retiradoParentesco: quem.parentesco, retiradoDocumento: quem.documento, retiradoPorOperadorId: sess.membroId, divergente: true, divergenciaPedidaEm: S.agoraMs, tentativas: 0 });
      evento(r, s, "RETIRADA_DIVERGENTE_PEDIDA", sess.membroId);
      return respostaHttp({ sucesso: true, divergente: true, aguardaLideranca: true, mensagem: "Quem pediu não está na lista de quem pode retirar esta criança. O pedido foi enviado à liderança da congregação; a criança continua na sala até a aprovação." });
    }
    if (acao === "segunda-via-pedir") {
      const v = ck.validarPedidoSegundaVia(corpo);
      if (!v.valido) return falha(422, v.mensagem);
      const rs = registroComSala(v.registroId);
      if (!rs.sucesso) return respostaHttp(rs);
      const { r, s } = rs;
      const op = conferirOperador(s, sess.membroId);
      if (!op.sucesso) return respostaHttp(op);
      if (r.situacao !== "NA_SALA") return respostaHttp({ sucesso: false, mensagem: r.situacao === "RETIRADA" ? ck.MENSAGENS.JA_RETIRADA : "Esta criança tem uma retirada aguardando a liderança: a segunda via não se aplica." });
      const ref = v.pessoa.tipo === "TROUXE" ? "TROUXE" : `${v.pessoa.tipo}:${v.pessoa.id}`;
      const pessoa = autorizadosDe(r).find(x => x.ref === ref);
      if (!pessoa) return respostaHttp({ sucesso: false, mensagem: "Essa pessoa não está na lista de quem pode retirar esta criança: não se emite segunda via para ela. Chame a liderança." });
      if (S.vias.some(x => x.registroId === r.registroId && !x.confirmadaEm && !x.canceladaEm && S.agoraMs - x.pedidaEm < ck.SEGUNDA_VIA_MINUTOS * MIN)) return respostaHttp({ sucesso: false, mensagem: `Já há um pedido de segunda via aguardando a confirmação de outro adulto da sala (vale ${ck.SEGUNDA_VIA_MINUTOS} minutos).` });
      const via = { viaId: ++S.seq, registroId: r.registroId, pedidaPor: sess.membroId, pedidaEm: S.agoraMs, pessoaNome: pessoa.nome || null, documento: v.documento };
      S.vias.push(via);
      evento(r, s, "SEGUNDA_VIA_PEDIDA", sess.membroId);
      return respostaHttp({ sucesso: true, viaId: via.viaId, mensagem: `Pedido registrado. Outro adulto da sala precisa confirmar em até ${ck.SEGUNDA_VIA_MINUTOS} minutos (dois olhares).` }, 201);
    }
    if (acao === "segunda-via-confirmar") {
      const registroId = idDe(corpo.registroId);
      if (!registroId) return falha(400, "Informe registroId.");
      const rs = registroComSala(registroId);
      if (!rs.sucesso) return respostaHttp(rs);
      const { r, s } = rs;
      const op = conferirOperador(s, sess.membroId);
      if (!op.sucesso) return respostaHttp(op);
      if (r.situacao !== "NA_SALA") return respostaHttp({ sucesso: false, mudou: true, mensagem: ck.MENSAGENS.MUDOU });
      const via = S.vias.slice().reverse().find(x => x.registroId === r.registroId && !x.confirmadaEm && !x.canceladaEm && S.agoraMs - x.pedidaEm < ck.SEGUNDA_VIA_MINUTOS * MIN);
      if (!via) return respostaHttp({ sucesso: false, mensagem: "Não há pedido de segunda via aguardando confirmação (ou passou de 10 minutos): peça de novo." });
      if (via.pedidaPor === Number(sess.membroId)) return respostaHttp({ sucesso: false, proibido: true, mensagem: "Quem pediu a segunda via não a confirma: outro adulto da sala precisa conferir e confirmar." });
      via.confirmadaEm = S.agoraMs;
      r.geracao++; r.tentativas = 0; r.travado = false;
      const codigo = ck.gerarCodigo();
      r.codigoHash = ck.hashCodigo(codigo, { registroId: r.registroId, geracao: r.geracao, segredo: SEGREDO });
      S.codigos[r.registroId] = codigo;
      S.nVias++;
      evento(r, s, "SEGUNDA_VIA_EMITIDA", sess.membroId);
      return respostaHttp({ sucesso: true, mensagem: "Segunda via emitida. O código antigo deixou de valer: entregue a etiqueta e o recibo novos a quem pediu.", registroId: r.registroId,
        etiqueta: ck.montarEtiqueta({ nomeCrianca: r.nome, idade: r.idade, salaNome: s.equipeNome, congregacaoNome: s.congregacaoNome, codigo, saudeTexto: r.saudeTexto, instante: iso(S.agoraMs) }) });
    }

    // ---- a liderança ----
    if (acao === "decidir-divergencia" || acao === "destravar") {
      if (!gestao) return falha(403, SEM_PERMISSAO);
      const v = acao === "destravar" ? { valido: !!idDe(corpo.registroId), registroId: idDe(corpo.registroId), mensagem: "Informe registroId." } : ck.validarDecisaoDivergencia(corpo);
      if (!v.valido) return falha(acao === "destravar" ? 400 : 422, v.mensagem);
      const rs = registroComSala(v.registroId);
      if (!rs.sucesso || !escopoOk(rs.s)) return falha(404, ck.MENSAGENS.CRIANCA_NAO_ACHADA);
      const { r, s } = rs;
      if (acao === "decidir-divergencia" && !S.fatorFresco) return { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: "Este ato exige confirmação recente de quem você é (chave de acesso ou código por e-mail)." } };
      if (acao === "destravar") {
        if (!(r.situacao === "NA_SALA" && r.travado)) return respostaHttp({ sucesso: false, mudou: true, mensagem: "Esta criança não está travada." });
        r.travado = false; r.tentativas = 0; evento(r, s, "CRIANCA_DESTRAVADA", sess.membroId);
        return respostaHttp({ sucesso: true, mensagem: "Criança destravada: quem tem o código pode retirá-la." });
      }
      if (r.situacao !== "RETIRADA_PENDENTE") return respostaHttp({ sucesso: false, mudou: true, mensagem: "Não há retirada divergente aguardando decisão para esta criança." });
      if (r.retiradoPorOperadorId === Number(sess.membroId)) return respostaHttp({ sucesso: false, proibido: true, mensagem: "Quem registrou o pedido não decide sobre ele: outra pessoa da liderança precisa aprovar ou negar." });
      if (v.aprovar) {
        r.situacao = "RETIRADA"; r.retiradoEm = S.agoraMs; r.divergenciaMotivo = v.motivo; evento(r, s, "RETIRADA_DIVERGENTE_APROVADA", sess.membroId);
        return respostaHttp({ sucesso: true, aprovada: true, mensagem: "Retirada aprovada: a criança pode ser entregue a quem pediu." });
      }
      Object.assign(r, { situacao: "NA_SALA", retiradoTipo: null, retiradoMembroId: null, retiradoNome: null, retiradoParentesco: null, retiradoDocumento: null, retiradoPorOperadorId: null, divergente: false, divergenciaPedidaEm: null, divergenciaMotivo: v.motivo });
      evento(r, s, "RETIRADA_DIVERGENTE_NEGADA", sess.membroId);
      return respostaHttp({ sucesso: true, negada: true, mensagem: "Retirada negada: a criança continua na sala. Peça a quem a trouxe, ou a alguém da lista, que a retire com o código." });
    }
    return falha(404, "Ação inválida.");
  };

  S.responder = responder;
  S.codigoDe = (registroId) => S.codigos[registroId];
  S.registro = (registroId) => S.registros.find(x => x.registroId === registroId);
  S.definirSessao = (s) => { S.sessao = Object.assign({ lideranca: false, gestao: false }, s); };
  return S;
}

// ---- contrato: cada rota, método e campo que a tela usa ainda existe no código do servidor ----
// (lê o módulo e o handler como TEXTO: se o servidor mudar o nome de uma rota ou de um campo, isto acusa antes da tela quebrar em silêncio)
function rotasDoModulo(codigoDoModulo) {
  const achadas = new Set();
  for (const m of codigoDoModulo.matchAll(/chk(Obter|Postar)\(\s*[`"]([a-z-]+)/g)) achadas.add(`${m[1] === "Obter" ? "GET" : "POST"} ${m[2]}`);
  return [...achadas];
}
function contratoComOServidor(codigoDoModulo) {
  const handler = fs.readFileSync(path.join(API, "GestaoCheckinInfantil/index.js"), "utf8");
  const db = fs.readFileSync(path.join(API, "shared/checkinInfantilDb.js"), "utf8");
  const regra = fs.readFileSync(path.join(API, "shared/checkinInfantil.js"), "utf8");
  const corte = handler.indexOf("if (metodo !== \"POST\")");
  const blocoGet = handler.slice(0, corte), blocoPost = handler.slice(corte);
  const faltam = [];
  const rotas = rotasDoModulo(codigoDoModulo);
  for (const r of rotas) {
    const [metodo, acao] = r.split(" ");
    if (!new RegExp(`acao === "${acao}"`).test(metodo === "GET" ? blocoGet : blocoPost)) faltam.push(`rota ${r} (o handler não a atende nesse método)`);
  }
  const campos = {
    db: ["adultosPresentes", "lotacao", "criancas", "totais", "pendencias", "atualizadoEm", "sala", "janela", "quemTrouxe", "quemPodeRetirar", "segundaViaPendente", "pedidaPorMembroId", "pessoaNome", "divergencia", "pedidaEm", "documento",
      "parentesco", "telefoneDeQuemTrouxe", "responsaveisParaContato", "telefone", "tentativasRestantes", "travado", "foraDaFaixa", "rotuloSituacao", "saude", "entrouEm", "apto", "contaComoAdulto", "ehMinha", "ehGestao", "criancasNaSala",
      "voluntariosNaSala", "equipeNome", "congregacaoNome", "dataHora", "descricao", "faixa", "temResponsavel", "jaNaSala", "rotuloVinculo", "etiquetas", "recibo", "etiqueta", "termoMudou", "codigoErrado", "travada", "retirada",
      "divergente", "aguardaLideranca", "viaId", "autorizados", "responsaveis", "limite", "consentimentoVigente", "menor", "autorizadoId", "rotuloParentesco", "validoAte", "forma", "filhos", "menorId", "voluntarios",
      "eventos", "rotulo", "ator", "detalhe", "saiuEm", "entregueEm", "retiradoEm", "quemRetirou", "retiradaDivergente", "tipoRetirante", "situacao", "membroId", "nome", "idade", "instante", "orientacao", "criancas", "codigo",
      "registroId", "mensagem", "mudou", "naoAchou", "proibido", "atualizadoEm", "tipo", "ref", "rotulo", "tentativas"],
    handler: ["parentescos", "documentos", "faixas", "textoSaude", "tentativas", "segundaViaMinutos", "maxAutorizados", "maxCriancasPorCheckin", "papeis", "gestao", "salas", "filhos", "historico", "autorizados", "saude",
      "autorizado-adicionar", "autorizado-revogar", "saude-gravar", "saude-apagar", "entrar-na-sala", "sair-da-sala", "checkin", "retirar", "segunda-via-pedir", "segunda-via-confirmar", "decidir-divergencia", "destravar",
      "buscar", "responsaveis", "relatorio", "minhas-salas", "meus-filhos", "catalogos", "exigirFatorRecente", "servicoId", "equipeId", "menorId", "registroId", "membroId", "autorizadoId", "ficha", "referencia", "aprovar", "motivo"],
    regra: ["codigo", "retirante", "outro", "ref", "documento", "parentesco", "nome", "criancas", "visitante", "nascimento", "saude", "texto", "concordo", "textoHash", "trouxe", "responsavelId", "contato", "autorizadosVisita", "pessoa",
      "menorId", "validoAte", "MENSAGENS", "aprovar", "motivo", "referencia"]
  };
  for (const [fonte, texto] of [["db", db], ["handler", handler], ["regra", regra]]) for (const c of campos[fonte]) if (!new RegExp(`(^|[^A-Za-z0-9_])${c.replace(/[-]/g, "\\-")}([^A-Za-z0-9_]|$)`).test(texto)) faltam.push(`${fonte}:${c}`);
  return faltam;
}

module.exports = { ck, mc, mm, vol, ATAQUE, HORA, MIN, SEGREDO, criarServidor, contratoComOServidor, rotasDoModulo };
