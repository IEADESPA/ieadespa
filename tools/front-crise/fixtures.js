// fixtures.js — o SERVIDOR imitado da v7.15 (crise e segurança), com estado (o que a tela grava fica gravado e volta na próxima leitura).
// Não roda o handler nem o banco: devolve as MESMAS formas de api/GestaoCriseSeguranca/index.js e api/shared/criseSegurancaDb.js (faixa, catálogos, formatarCrise, detalheCrise,
// listarManifestacoes, listarDemandas, painelSeguranca, detalheSeguranca) e os mesmos códigos (200/201/400/403/404/409/422/428). As REGRAS que decidem o que a tela manda são as de
// verdade (api/shared/criseSeguranca.js: validarAbertura, validarPortaVoz, validarEncerramento, validarManifestacao, validarDemanda, validarResposta, validarPlano, validarSimulado,
// validarVistoria, validarEquipe, validarAnulacao, validarResolucao): um campo a mais com tipo errado vira 422, como lá.
// Todo texto que o servidor devolve leva o texto de ataque ATAQUE(campo): se algum virar marcação, o DOM simulado acusa (e executa o onerror, como o navegador).
"use strict";
const fs = require("fs");
const path = require("path");
const API = path.resolve(__dirname, "../../api");
const cs = require(path.join(API, "shared/criseSeguranca"));

const HORA = 3600000, DIA = 24 * HORA;
const ATAQUE = (campo) => `"'><img src=x onerror="window.__xss('${campo}')"><svg onload=window.__xss('${campo}')>[${campo}]`;

function criarServidor({ ataque = true, agoraMs = Date.now(), comCrise = false } = {}) {
  const A = (campo, base) => (ataque ? `${base} ${ATAQUE(campo)}` : base);
  const iso = (ms) => new Date(ms).toISOString();
  const hoje = new Date(agoraMs - 3 * HORA).toISOString().slice(0, 10);
  const S = {
    agoraMs, erros: [], fatorOk: false,
    // quem é quem (o token vira a sessão): geral = Secretário Geral (crise + segurança no nível geral); dir = Dirigente da congregação 1 (segurança); lider = líder sem permissão;
    // pv = o porta-voz designado (membro 30, sem permissão); pin = membro por PIN
    sessoes: { geral: { membroId: 1, crise: true, seguranca: true, geralSeguranca: true }, dir: { membroId: 5, crise: false, seguranca: true, geralSeguranca: false, congs: [1] },
      lider: { membroId: 20, crise: false, seguranca: false }, pv: { membroId: 30, crise: false, seguranca: false }, pin: { pin: true, membroId: 40 } },
    presidente: { membroId: 2, nome: A("presidente", "Pr. Presidente") },
    crise: null, encerradas: [], historico: [], manifestacoes: [], demandas: [],
    congregacoes: { 1: { id: 1, nome: A("congCentral", "Central") }, 2: { id: 2, nome: A("congVila", "Vila Nova") } },
    planos: { 1: [], 2: [] }, simulados: [], vistorias: [], equipe: [],
    membros: [{ membroId: 501, nome: A("membroAna", "Ana Brigadista"), cong: 1 }, { membroId: 502, nome: A("membroBento", "Bento Porteiro"), cong: 1 }],
    seq: { crise: 10, hist: 100, manif: 200, dem: 300, resp: 400, sim: 500, vis: 600, item: 700, eq: 800 }
  };
  const novaCrise = (o = {}) => {
    S.crise = Object.assign({ criseId: ++S.seq.crise, status: "ATIVA", motivo: A("motivo", "Acidente no templo"), alcance: "CAMPO", abertaEm: iso(agoraMs - 2 * HORA), encerradaEm: null,
      resumoEncerramento: null, ordenadoPor: S.presidente.nome, registradoPor: A("registradoPor", "Secretário"), encerradaPor: null,
      portaVoz: { tipo: "DESIGNADO", membroId: 30, nome: A("pvNome", "Joana Assessora"), contato: A("pvContato", "imprensa@igreja.org"), ato: A("pvAto", "Ato nº 12/2026") } }, o);
    S.historico.push({ criseId: S.crise.criseId, evento: "ABERTA", em: S.crise.abertaEm, por: A("histPor", "Secretário"), portaVoz: S.crise.portaVoz, texto: S.crise.motivo,
      aviso: { envioId: 9, total: 37, canais: { SININHO: { ACEITO: 37 }, PUSH: { ACEITO: 5, PENDENTE: 1, SEM_APARELHO: 31 }, EMAIL: { ACEITO: 10, PENDENTE: 25, SEM_CONTATO: 2 } }, lidos: 12, ciencia: 4, emailsPorHora: 30 } });
  };
  if (comCrise) novaCrise();

  const sessaoDe = (c) => S.sessoes[c.token] || null;
  const R = (status, corpo) => ({ status, corpo });
  const recusa = (mensagem) => R(422, { sucesso: false, mensagem: A("msgRecusa", mensagem) });
  const naoAchou = () => R(404, { sucesso: false, mensagem: "Não encontrado." });
  const ehPv = (s) => !!(S.crise && S.crise.portaVoz.membroId && s.membroId === S.crise.portaVoz.membroId);
  const detalhe = (criseId, s) => {
    const c = S.crise && S.crise.criseId === criseId ? S.crise : S.encerradas.find(x => x.criseId === criseId);
    if (!c || (!s.crise && !(ehPv(s) && c === S.crise))) return null;
    return { sucesso: true, crise: Object.assign({}, c, s.crise ? {} : { motivo: null }), historico: S.historico.filter(h => h.criseId === criseId).map(h => Object.assign({}, h, { texto: s.crise ? h.texto : null, aviso: s.crise ? h.aviso : null })),
      manifestacoes: S.manifestacoes.filter(m => m.criseId === criseId).map(m => Object.assign({}, m, { corrigidaPor: (S.manifestacoes.find(y => y.corrige === m.manifestacaoId) || {}).manifestacaoId || null })) };
  };
  const exigeFator = () => (S.fatorOk ? null : R(428, { sucesso: false, precisaFator: true, mensagem: "Este ato exige confirmação recente." }));
  const congAlcancada = (s, id) => !!S.congregacoes[id] && (s.geralSeguranca || (s.congs || []).includes(Number(id)));
  const avaliacao = (id) => {
    const pl = S.planos[id] || [];
    const sims = S.simulados.filter(x => x.cong === id && !x.anulacao).map(x => x.data).sort();
    const vis = S.vistorias.filter(x => x.cong === id && !x.anulacao).sort((a, b) => (a.data < b.data ? 1 : -1));
    const pend = vis[0] ? vis[0].itens.filter(i => i.resultado === "PENDENTE" && !i.resolvidaEm).length : 0;
    const imoveis = id === 1 ? [{ descricao: A("imovel", "Templo Central"), avcbVigenciaFim: "2026-01-01", seguro: "VENCIDO", seguroFim: "2026-03-01", avcbNumero: A("avcbNum", "AVCB-1") }] : [];
    return cs.avaliarSeguranca({ hoje, plano: pl.length ? { versao: pl[pl.length - 1].versao, revisadoEm: pl[pl.length - 1].revisadoEm } : null, simulado: sims[sims.length - 1] || null,
      vistoria: vis[0] ? vis[0].data : null, pendencias: pend, imoveis });
  };

  async function servidor(c) {
    try {
      const m = /^crise\/([a-z-]+)$/.exec(c.caminho);
      if (!m) return null;
      const acao = m[1], s = sessaoDe(c);
      if (!s) return R(401, { sucesso: false, mensagem: "Sessão inválida ou expirada." });
      if (s.pin) return R(403, { sucesso: false, mensagem: "Isto é da liderança." });
      const b = c.corpo || {};
      const GET = c.metodo === "GET", POST = c.metodo === "POST";
      if (GET && acao === "faixa") {
        if (!S.crise) return R(200, { sucesso: true, ativa: false });
        return R(200, { sucesso: true, ativa: true, criseId: S.crise.criseId, desde: S.crise.abertaEm, portaVoz: { tipo: S.crise.portaVoz.tipo, nome: S.crise.portaVoz.nome, contato: S.crise.portaVoz.contato }, souPortaVoz: ehPv(s) });
      }
      if (GET && acao === "catalogos") {
        const lista = (obj, campo) => [...Object.entries(obj).map(([codigo, r]) => ({ codigo, rotulo: A(`${campo}${codigo}`, typeof r === "object" ? r.rotulo : r), ...(typeof r === "object" && r.dica ? { dica: A(`dica${codigo}`, r.dica) } : {}) })),
          { codigo: ATAQUE(`codigo${campo}`), rotulo: A(`falso${campo}`, "Falso") }];
        return R(200, { sucesso: true, papeis: { crise: !!s.crise, seguranca: !!s.seguranca, geralSeguranca: !!s.geralSeguranca }, portaVoz: lista(cs.PORTA_VOZ, "pv"), canais: lista(cs.CANAIS_MANIFESTACAO, "canal"),
          situacoes: lista(cs.SITUACOES_DEMANDA, "sit"), tiposSimulado: lista(cs.TIPOS_SIMULADO, "tipo"), itensVistoria: lista(cs.ITENS_VISTORIA, "item"), resultados: lista(cs.RESULTADOS_ITEM, "res"),
          funcoes: lista(cs.FUNCOES_EQUIPE, "funcao"), contatosEmergencia: [...cs.CONTATOS_EMERGENCIA.map(x => ({ nome: A(`tel${x.numero}`, x.nome), numero: x.numero })), { nome: "Falso", numero: ATAQUE("telefone") }], limites: cs.MAX });
      }
      if (GET && acao === "crises") {
        if (!s.crise) return R(403, { sucesso: false, mensagem: "Isto é do nível geral da crise." });
        return R(200, { sucesso: true, crises: [...(S.crise ? [S.crise] : []), ...S.encerradas].map(x => Object.assign({}, x, { manifestacoes: S.manifestacoes.filter(y => y.criseId === x.criseId).length, demandas: 1 })) });
      }
      if (GET && acao === "crise") {
        const id = Number(c.consulta.criseId);
        const d = detalhe(id, s);
        return d ? R(200, d) : naoAchou();
      }
      if (POST && ["abrir", "porta-voz", "encerrar", "continuar-aviso"].includes(acao) && !s.crise) return R(403, { sucesso: false, mensagem: "Isto é do nível geral da crise." });
      if (POST && ["abrir", "porta-voz", "encerrar"].includes(acao)) { const f = exigeFator(); if (f) return f; }
      if (POST && acao === "abrir") {
        const v = cs.validarAbertura(b, { presidente: S.presidente });
        if (v.problema) return recusa(v.problema);
        if (S.crise) return R(409, { sucesso: false, mudou: true, mensagem: A("msg409", "Já há um regime de crise ativo.") });
        novaCrise({ motivo: v.dados.motivo, abertaEm: iso(S.agoraMs), portaVoz: Object.assign({}, v.dados.portaVoz, { nome: v.dados.portaVoz.nome + (ataque ? ATAQUE("pvNovo") : "") }) });
        return R(201, { sucesso: true, criseId: S.crise.criseId, mensagem: A("msgAberta", "Regime de crise aberto."), ...detalhe(S.crise.criseId, s) });
      }
      if (POST && (acao === "porta-voz" || acao === "encerrar")) {
        if (!S.crise || S.crise.criseId !== Number(b.criseId)) return R(409, { sucesso: false, mudou: true, mensagem: A("msgEncerrada", "Esta crise já foi encerrada.") });
        if (acao === "porta-voz") {
          const v = cs.validarPortaVoz(b.portaVoz, { presidente: S.presidente });
          if (v.problema) return recusa(v.problema);
          S.crise.portaVoz = v.portaVoz;
          S.historico.push({ criseId: S.crise.criseId, evento: "PORTA_VOZ", em: iso(S.agoraMs), por: A("histPor2", "Secretário"), portaVoz: v.portaVoz, texto: null, aviso: { total: 37, canais: {}, lidos: 0, ciencia: 0 } });
          return R(200, { sucesso: true, mensagem: A("msgPv", "Porta-voz designado."), ...detalhe(S.crise.criseId, s) });
        }
        const v = cs.validarEncerramento(b);
        if (v.problema) return recusa(v.problema);
        const c2 = Object.assign({}, S.crise, { status: "ENCERRADA", encerradaEm: iso(S.agoraMs), resumoEncerramento: A("resumoFim", v.dados.resumo) });
        S.encerradas.unshift(c2); S.crise = null;
        return R(200, { sucesso: true, mensagem: A("msgFim", "Regime encerrado."), crise: c2, historico: [], manifestacoes: [] });
      }
      if (POST && acao === "continuar-aviso") return R(200, { sucesso: true, mensagem: A("msgContinuar", "Mais uma rodada.") });
      if (POST && acao === "manifestacao") {
        const id = Number(b.criseId);
        const alvo = S.crise && S.crise.criseId === id ? S.crise : S.encerradas.find(x => x.criseId === id);
        if (!alvo) return naoAchou();
        if (!s.crise && !(ehPv(s) && alvo === S.crise)) return R(403, { sucesso: false, mensagem: "Só o porta-voz e o nível geral registram manifestação." });
        const v = cs.validarManifestacao(b, { agora: new Date(S.agoraMs) });
        if (v.problema) return recusa(v.problema);
        if (v.dados.corrigeManifestacaoId && S.manifestacoes.some(y => y.corrige === v.dados.corrigeManifestacaoId)) return R(409, { sucesso: false, mudou: true, mensagem: A("msgJaCorrigida", "Já corrigida.") });
        S.manifestacoes.push({ criseId: id, manifestacaoId: ++S.seq.manif, dataHora: v.dados.dataHora.toISOString(), canal: v.dados.canal, canalRotulo: A("canalRotulo", cs.CANAIS_MANIFESTACAO[v.dados.canal]),
          quemFalou: v.dados.quemFalou + (ataque ? ATAQUE("quemFalou") : ""), resumo: v.dados.resumo + (ataque ? ATAQUE("resumo") : ""), link: v.dados.link, documento: v.dados.documento,
          autorizadoPor: v.dados.autorizadoPor, corrige: v.dados.corrigeManifestacaoId, registradoPor: A("manifPor", "Secretário"), registradoEm: iso(S.agoraMs) });
        return R(201, { sucesso: true, manifestacaoId: S.seq.manif, mensagem: A("msgManif", "Manifestação registrada.") });
      }
      if (GET && acao === "demandas") {
        const gestor = s.crise || ehPv(s);
        const lista = S.demandas.filter(d => gestor || d.registradoPorId === s.membroId).slice().reverse().map(d => {
          const rs = d.respostas, ult = rs[rs.length - 1] || null;
          const corrigidaPor = (S.demandas.find(y => y.corrige === d.demandaId) || {}).demandaId || null;
          return { demandaId: d.demandaId, criseId: d.criseId, veiculo: d.veiculo, contato: gestor || d.registradoPorId === s.membroId ? d.contato : null, contatoApagado: false, pedido: d.pedido, prazoEm: d.prazoEm,
            recebidaEm: d.recebidaEm, registradoPor: A("demPor", "Dirigente"), minha: d.registradoPorId === s.membroId, corrige: d.corrige, corrigidaPor, situacao: ult ? ult.situacao : "RECEBIDA",
            situacaoRotulo: A("sitRotulo", "x"), ultimaRespostaId: ult ? ult.respostaId : null, podeResponder: gestor && !corrigidaPor, respostas: rs };
        });
        return R(200, { sucesso: true, gestor, criseAtivaId: S.crise ? S.crise.criseId : null, demandas: lista });
      }
      if (POST && acao === "demanda") {
        const v = cs.validarDemanda(b, { agora: new Date(S.agoraMs) });
        if (v.problema) return recusa(v.problema);
        if (v.dados.corrigeDemandaId) {
          const o = S.demandas.find(d => d.demandaId === v.dados.corrigeDemandaId);
          if (!o || !(s.crise || o.registradoPorId === s.membroId)) return naoAchou();
          if (S.demandas.some(d => d.corrige === o.demandaId)) return R(409, { sucesso: false, mudou: true, mensagem: A("msgDemCorrigida", "Já corrigido.") });
        }
        S.demandas.push({ demandaId: ++S.seq.dem, criseId: S.crise ? S.crise.criseId : null, veiculo: v.dados.veiculo + (ataque ? ATAQUE("veiculo") : ""), contato: v.dados.contato + (ataque ? ATAQUE("contato") : ""),
          pedido: v.dados.pedido + (ataque ? ATAQUE("pedido") : ""), prazoEm: v.dados.prazo ? v.dados.prazo.toISOString() : null, recebidaEm: iso(S.agoraMs), registradoPorId: s.membroId, corrige: v.dados.corrigeDemandaId, respostas: [] });
        return R(201, { sucesso: true, demandaId: S.seq.dem, mensagem: A("msgDem", "Pedido registrado e encaminhado.") });
      }
      if (POST && acao === "responder") {
        const d = S.demandas.find(x => x.demandaId === Number(b.demandaId));
        if (!d) return naoAchou();
        if (!(s.crise || ehPv(s))) return d.registradoPorId === s.membroId ? R(403, { sucesso: false, mensagem: "Quem responde é o porta-voz." }) : naoAchou();
        const v = cs.validarResposta(b);
        if (v.problema) return recusa(v.problema);
        const ult = d.respostas[d.respostas.length - 1];
        if ((v.dados.substituiRespostaId || null) !== (ult ? ult.respostaId : null)) return R(409, { sucesso: false, mudou: true, mensagem: A("msgResp409", "Foi respondido enquanto isso.") });
        d.respostas.push({ respostaId: ++S.seq.resp, situacao: v.dados.situacao, resposta: v.dados.resposta + (ataque ? ATAQUE("resposta") : ""), em: iso(S.agoraMs), por: A("respPor", "Porta-voz"), substitui: v.dados.substituiRespostaId });
        return R(201, { sucesso: true, respostaId: S.seq.resp, mensagem: A("msgResp", "Resposta registrada.") });
      }
      // ---- segurança ----
      const SEG = ["seguranca", "congregacao", "plano", "simulado", "vistoria", "resolver-pendencia", "anular-simulado", "anular-vistoria", "buscar-membros", "equipe", "sair-equipe"];
      if (SEG.includes(acao) && !s.seguranca) return R(403, { sucesso: false, mensagem: "Isto é da segurança da congregação." });
      if (GET && acao === "seguranca") {
        return R(200, { sucesso: true, congregacoes: Object.values(S.congregacoes).filter(x => congAlcancada(s, x.id)).map(x => {
          const a = avaliacao(x.id);
          return { congregacaoId: x.id, nome: x.nome, equipe: S.equipe.filter(e => e.cong === x.id && !e.encerradoEm).length, pendencias: 0, plano: a.plano, simulado: a.simulado, vistoria: a.vistoria, imoveis: a.imoveis,
            alertas: a.alertas.map(y => ({ codigo: y.codigo, texto: A(`alerta${y.codigo}`, y.texto) })) };
        }) });
      }
      if (GET && acao === "congregacao") {
        const id = Number(c.consulta.congregacaoId);
        if (!congAlcancada(s, id)) return naoAchou();
        const a = avaliacao(id), pl = S.planos[id];
        const atual = pl[pl.length - 1] || null;
        return R(200, { sucesso: true, congregacao: { congregacaoId: id, nome: S.congregacoes[id].nome }, plano: a.plano, simulado: a.simulado, vistoria: a.vistoria,
          imoveis: a.imoveis.map(i => Object.assign({}, i, { descricao: A("imovelDet", "Templo") })), alertas: a.alertas.map(y => ({ codigo: y.codigo, texto: A(`alertaDet${y.codigo}`, y.texto) })),
          contatosEmergencia: [...cs.CONTATOS_EMERGENCIA.map(x => ({ nome: A(`telDet${x.numero}`, x.nome), numero: x.numero })), { nome: "Falso", numero: ATAQUE("telefoneDet") }],
          planoAtual: atual ? Object.assign({}, atual, { registradoPor: A("planoPor", "Dirigente") }) : null, versoesDoPlano: pl.map(p => ({ versao: p.versao, revisadoEm: p.revisadoEm, registradoPor: A("versaoPor", "Dirigente") })).reverse(),
          simulados: S.simulados.filter(x => x.cong === id).map(x => Object.assign({}, x, { tipoRotulo: A("tipoRotulo", x.tipo) })),
          vistorias: S.vistorias.filter(x => x.cong === id).map(x => Object.assign({}, x, { itens: x.itens.map(i => Object.assign({}, i, { itemRotulo: A("itemRotulo", i.item) })) })),
          equipe: S.equipe.filter(e => e.cong === id).map(e => ({ equipeId: e.equipeId, nome: e.nome, funcao: e.funcao, funcaoRotulo: A("funcaoRotulo", e.funcao), desde: e.desde, ate: e.ate, ativo: !e.encerradoEm, saiuDaCongregacao: false, encerradoEm: e.encerradoEm, motivo: null })) });
      }
      const congId = Number(b.congregacaoId);
      if (POST && ["plano", "simulado", "vistoria", "equipe", "buscar-membros"].includes(acao) && !congAlcancada(s, congId)) return naoAchou();
      if (POST && acao === "plano") {
        const v = cs.validarPlano(b);
        if (v.problema) return recusa(v.problema);
        const pl = S.planos[congId];
        if (pl.length !== v.dados.versaoAtual) return R(409, { sucesso: false, mudou: true, mensagem: A("msgPlano409", "Outra pessoa salvou o plano.") });
        pl.push({ versao: pl.length + 1, rotasEvacuacao: v.dados.rotasEvacuacao + (ataque ? ATAQUE("rotas") : ""), pontosEncontro: v.dados.pontosEncontro, contatosLocais: v.dados.contatosLocais, responsaveis: v.dados.responsaveis, revisadoEm: iso(S.agoraMs) });
        return R(201, { sucesso: true, versao: pl.length, mensagem: A("msgPlano", "Plano registrado.") });
      }
      if (POST && acao === "simulado") {
        const v = cs.validarSimulado(b, { hoje });
        if (v.problema) return recusa(v.problema);
        S.simulados.unshift(Object.assign({ simuladoId: ++S.seq.sim, cong: congId, registradoPor: A("simPor", "Dirigente"), anulacao: null }, v.dados, { correuBem: v.dados.correuBem ? v.dados.correuBem + (ataque ? ATAQUE("correuBem") : "") : null }));
        return R(201, { sucesso: true, simuladoId: S.seq.sim, mensagem: A("msgSim", "Simulado registrado.") });
      }
      if (POST && acao === "vistoria") {
        const v = cs.validarVistoria(b, { hoje });
        if (v.problema) return recusa(v.problema);
        S.vistorias.unshift({ vistoriaId: ++S.seq.vis, cong: congId, data: v.dados.data, observacoes: v.dados.observacoes, registradoPor: A("visPor", "Dirigente"), anulacao: null,
          itens: v.dados.itens.map(i => ({ vistoriaItemId: ++S.seq.item, item: i.item, resultado: i.resultado, pendencia: i.pendencia ? i.pendencia + (ataque ? ATAQUE("pendencia") : "") : null, resolvidaEm: null, resolvidaPor: null, comoResolvida: null })) });
        return R(201, { sucesso: true, vistoriaId: S.seq.vis, mensagem: A("msgVis", "Vistoria registrada.") });
      }
      if (POST && acao === "resolver-pendencia") {
        const item = S.vistorias.flatMap(x => x.itens.map(i => ({ i, x }))).find(o => o.i.vistoriaItemId === Number(b.vistoriaItemId));
        if (!item || !congAlcancada(s, item.x.cong)) return naoAchou();
        if (item.i.resolvidaEm) return R(409, { sucesso: false, mudou: true, mensagem: A("msgJaResolvida", "Já resolvida.") });
        const v = cs.validarResolucao(b);
        if (v.problema) return recusa(v.problema);
        Object.assign(item.i, { resolvidaEm: iso(S.agoraMs), resolvidaPor: A("resolvidaPor", "Dirigente"), comoResolvida: v.dados.como + (ataque ? ATAQUE("como") : "") });
        return R(200, { sucesso: true, mensagem: A("msgResolvida", "Pendência resolvida.") });
      }
      if (POST && (acao === "anular-simulado" || acao === "anular-vistoria")) {
        const lista = acao === "anular-simulado" ? S.simulados : S.vistorias;
        const chave = acao === "anular-simulado" ? "simuladoId" : "vistoriaId";
        const reg = lista.find(x => x[chave] === Number(b[chave]));
        if (!reg || !congAlcancada(s, reg.cong)) return naoAchou();
        if (reg.anulacao) return R(409, { sucesso: false, mudou: true, mensagem: A("msgJaAnulado", "Já anulado.") });
        const v = cs.validarAnulacao(b);
        if (v.problema) return recusa(v.problema);
        reg.anulacao = { anuladoEm: iso(S.agoraMs), anuladoPor: A("anuladoPor", "Dirigente"), motivo: v.dados.motivo + (ataque ? ATAQUE("motivoAnul") : "") };
        return R(200, { sucesso: true, mensagem: A("msgAnulado", "Registro anulado.") });
      }
      if (POST && acao === "buscar-membros") return R(200, { sucesso: true, membros: S.membros.filter(x => x.cong === congId).map(x => ({ membroId: x.membroId, nome: x.nome })) });
      if (POST && acao === "equipe") {
        const v = cs.validarEquipe(b, { hoje });
        if (v.problema) return recusa(v.problema);
        const p = S.membros.find(x => x.membroId === v.dados.membroId && x.cong === congId);
        if (!p) return recusa("A pessoa precisa ser membro ativo desta congregação.");
        S.equipe.push({ equipeId: ++S.seq.eq, cong: congId, nome: p.nome, funcao: v.dados.funcao, desde: v.dados.desde, ate: v.dados.ate, encerradoEm: null });
        return R(201, { sucesso: true, equipeId: S.seq.eq, mensagem: A("msgEquipe", "Incluída.") });
      }
      if (POST && acao === "sair-equipe") {
        const e = S.equipe.find(x => x.equipeId === Number(b.equipeId));
        if (!e || !congAlcancada(s, e.cong)) return naoAchou();
        if (e.encerradoEm) return R(409, { sucesso: false, mudou: true, mensagem: A("msgJaSaiu", "Já saiu.") });
        e.encerradoEm = iso(S.agoraMs);
        return R(200, { sucesso: true, mensagem: A("msgSaiu", "Saída registrada.") });
      }
      S.erros.push(`ação desconhecida: ${c.chave}`);
      return R(404, { sucesso: false, mensagem: "Ação inválida." });
    } catch (e) {
      S.erros.push(String(e && e.stack || e));
      return R(500, { sucesso: false, mensagem: "Erro interno." });
    }
  }
  return { S, servidor, novaCrise };
}

// Confere, contra o código do servidor, as ações que a tela chama, a confirmação reforçada e os campos que ela lê.
function contratoComOServidor() {
  const rota = fs.readFileSync(path.join(API, "GestaoCriseSeguranca/index.js"), "utf8");
  const banco = fs.readFileSync(path.join(API, "shared/criseSegurancaDb.js"), "utf8");
  const lista = (nome) => (new RegExp(`const ${nome} = \\[([^\\]]*)\\]`).exec(rota) || ["", ""])[1].split(",").map(x => x.trim().replace(/"/g, "")).filter(Boolean);
  return { leituras: lista("LEITURAS"), escritas: lista("ESCRITAS"), fator: (/\["abrir", "porta-voz", "encerrar"\]\.includes\(acao\) && !auth\.exigirFatorRecente/.test(rota)), rota, banco };
}

module.exports = { criarServidor, contratoComOServidor, ATAQUE, HORA, DIA };
