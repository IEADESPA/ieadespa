// fixtures.js — respostas da API nos formatos REAIS da v7.8, montadas com as PRÓPRIAS funções do servidor: o catálogo, o relógio, os níveis e os textos vêm de
// api/shared/protecaoMenores.js (importado de verdade); o resumo de cada incidente vem de mapearResumo/relogioDoIncidente de api/shared/protecaoDb.js (EXTRAÍDAS do código do
// servidor pela árvore do JavaScript, não copiadas); o catálogo usa o mesmo `lista` do handler GestaoProtecaoMenores. O que o handler monta inline (a ficha do incidente) é
// reproduzido linha a linha, e `contratoComOServidor()` confere por escrito que o código do servidor ainda tem cada campo que a tela lê.
// Nada aqui é "o que a tela espera": é o que o servidor manda.
"use strict";
const fs = require("fs");
const path = require("path");
const API = path.resolve(__dirname, "../../api");
const pm = require(path.join(API, "shared/protecaoMenores"));
const parser = require(path.join(API, "node_modules/@babel/parser"));

// ---- funções do servidor extraídas do código-fonte ----
function extrairDoServidor(rel, nomes, escopo) {
  const codigo = fs.readFileSync(path.join(API, rel), "utf8");
  const ast = parser.parse(codigo, { sourceType: "script", errorRecovery: false });
  const partes = new Map();
  for (const n of ast.program.body) {
    if (n.type === "FunctionDeclaration" && nomes.includes(n.id.name)) partes.set(n.id.name, codigo.slice(n.start, n.end));
    if (n.type === "VariableDeclaration") for (const d of n.declarations) if (d.id.type === "Identifier" && nomes.includes(d.id.name)) partes.set(d.id.name, codigo.slice(n.start, n.end));
  }
  const falta = nomes.filter(x => !partes.has(x));
  if (falta.length) throw new Error(`extrairDoServidor(${rel}): não achei ${falta.join(", ")}`);
  const corpo = nomes.map(x => partes.get(x)).join("\n") + `\nreturn { ${nomes.join(", ")} };`;
  return new Function(...Object.keys(escopo), corpo)(...Object.values(escopo));
}
const { mapearResumo } = extrairDoServidor("shared/protecaoDb.js", ["iso", "relogioDoIncidente", "mapearResumo"], { pm });
const { lista } = extrairDoServidor("GestaoProtecaoMenores/index.js", ["lista"], {});

// o relógio das fixtures é FIXO (o mesmo SRV do roteiro): com AGORA_FIXA o roteiro dependia da hora em que rodava (uma comunicação digitada às 11:30 virava "anterior à ciência" depois das 15h30)
const AGORA_FIXA = Date.parse("2026-10-09T15:00:00.000Z");
const hoje = new Date(AGORA_FIXA).toISOString().slice(0, 10);
const HORA = 3600000;
// texto de ataque: sai do atributo (aspas), sai da tag (>) e abre uma imagem quebrada com onerror; o nome do campo identifica quem vazou
const ATAQUE = (campo) => `"'><img src=x onerror="window.__xss('${campo}')"><svg onload=window.__xss('${campo}')>[${campo}]`;

// GET catalogos (GestaoProtecaoMenores): a mesma montagem do handler
function catalogos(papeis = { gestao: true, geral: true }) {
  return {
    sucesso: true, horasPrazo: pm.HORAS_PRAZO,
    niveis: lista(pm.NIVEIS), orgaos: lista(pm.ORGAOS), formas: lista(pm.FORMAS_COMUNICACAO), quemRelatou: lista(pm.QUEM_RELATOU), resultados: lista(pm.RESULTADOS_ENCERRAMENTO), decisoes: lista(pm.DECISOES_CAUTELAR),
    contatosDeAjuda: pm.CONTATOS_DE_AJUDA, roteiroEscuta: pm.ROTEIRO_ESCUTA, naoFaca: pm.NAO_FACA, papeis
  };
}
// o mesmo catálogo, com texto de ataque em todo campo de texto que vem do servidor (rótulos, descrições, roteiro, "não faça", telefones)
function catalogosComAtaque(papeis) {
  const c = catalogos(papeis);
  ["niveis", "orgaos", "formas", "quemRelatou", "resultados", "decisoes"].forEach(k => { c[k] = c[k].map(x => Object.assign({}, x, { rotulo: `${x.rotulo} ${ATAQUE(`${k}-rotulo`)}` }, x.descricao ? { descricao: `${x.descricao} ${ATAQUE(`${k}-descricao`)}` } : {})); });
  c.roteiroEscuta = c.roteiroEscuta.map((p, i) => ({ passo: `${p.passo} ${ATAQUE(`passo${i}`)}`, texto: `${p.texto} ${ATAQUE(`passoTexto${i}`)}` }));
  c.naoFaca = c.naoFaca.map((t, i) => `${t} ${ATAQUE(`naoFaca${i}`)}`);
  c.contatosDeAjuda = c.contatosDeAjuda.map((x, i) => Object.assign({}, x, x.numero ? { numero: `${x.numero}${ATAQUE("contatoNumero")}` } : {}, { nome: `${x.nome} ${ATAQUE(`contatoNome${i}`)}`, descricao: `${x.descricao} ${ATAQUE(`contatoDesc${i}`)}` }));
  return c;
}

// ---- a fila (listarIncidentes: mapearResumo sobre a linha do SELECT) ----
const linhaDoBanco = (o) => ({
  IncidenteId: o.id, Protocolo: o.protocolo || `PRO-2026-${String(o.id).padStart(4, "0")}`, Nivel: o.nivel || "ALEGACAO", Origem: o.origem || "MEMBRO", CongregacaoId: o.congregacaoId === undefined ? 2 : o.congregacaoId,
  CongregacaoNome: o.congregacaoNome === undefined ? "Sede" : o.congregacaoNome, DataOcorrencia: new Date(`${o.dataOcorrencia || hoje}T00:00:00Z`), ExigeComunicacao: o.exigeComunicacao === undefined ? (o.nivel || "ALEGACAO") === "ALEGACAO" : o.exigeComunicacao,
  PrazoNotificacaoEm: o.prazoEm ? new Date(o.prazoEm) : null, Status: o.status || "ABERTO", RegistradoEm: new Date(o.registradoEm || AGORA_FIXA - 3 * HORA), EncerradoEm: o.encerradoEm ? new Date(o.encerradoEm) : null,
  NComunicacoes: o.nComunicacoes || 0, NComComprovante: o.nComComprovante || 0, NAnexos: o.nAnexos || 0, NSemDecisao: o.nSemDecisao || 0
});
const resumo = (o, agora) => mapearResumo(linhaDoBanco(o), agora instanceof Date ? agora : new Date(agora));
// a ordem da fila (listarIncidentes): o que pede ação primeiro — a comunicação mais urgente —, depois os demais abertos e por fim os encerrados
function ordenarComoOServidor(itens) {
  const peso = (i) => (i.status === "ENCERRADO" ? 3 : i.relogio ? 0 : i.exigeComunicacao && !i.comunicado ? 0 : 1);
  return itens.sort((a, b) => peso(a) - peso(b) || (peso(a) === 0 ? String(a.prazoEm).localeCompare(String(b.prazoEm)) : String(b.registradoEm).localeCompare(String(a.registradoEm))));
}
function filaDe(linhas, agora) {
  const itens = ordenarComoOServidor(linhas.map(o => resumo(o, agora)));
  return { sucesso: true, agora: new Date(agora).toISOString(), incidentes: itens };
}

// ---- a ficha (detalheIncidente: o resumo + o que o handler monta) ----
// o = { id, nivel, status, origem, prazoEm, comunicacoes:[...], envolvidos:[{envolvidoId, membroId, nome, ultimaDecisao, nDecisoes}], nAnexos, relato:{registrado, adendos}, decisoes, reclassificacoes, leituras, geral, texto }
function detalhe(o, agora) {
  const nivel = o.nivel || "ALEGACAO", status = o.status || "ABERTO";
  const i = linhaDoBanco(Object.assign({ nivel, status }, o));
  const com = (o.comunicacoes || []).map((c, k) => ({
    comunicacaoId: c.comunicacaoId || k + 1, orgao: c.orgao || "CONSELHO_TUTELAR", orgaoRotulo: c.orgaoRotulo || pm.ORGAOS[c.orgao || "CONSELHO_TUTELAR"], forma: c.forma || "TELEFONE", formaRotulo: c.formaRotulo || pm.FORMAS_COMUNICACAO[c.forma || "TELEFONE"],
    comunicadoEm: new Date(c.comunicadoEm || AGORA_FIXA - HORA).toISOString(), protocoloExterno: c.protocoloExterno || null, referenciaArquivo: c.referenciaArquivo || null, observacao: c.observacao || null,
    foraDoPrazo: !!c.foraDoPrazo, registradoEm: new Date(c.registradoEm || AGORA_FIXA - HORA).toISOString(), registradoPorNome: c.registradoPorNome || "Dirigente da Sede"
  }));
  const nAnexos = o.nAnexos || 0;
  const envolvidos = (o.envolvidos || []).map(e => ({
    envolvidoId: e.envolvidoId, membroId: e.membroId || null, nome: e.nome, ehMembro: !!e.membroId,
    afastamentoCautelar: !!e.membroId && nivel === "ALEGACAO" && e.ultimaDecisao !== "LIBERADO", ultimaDecisao: e.ultimaDecisao || null, decisoes: Number(e.nDecisoes || 0)
  }));
  const geral = o.geral !== false;
  const comprovante = com.some((c) => pm.temComprovante(c)) || nAnexos > 0;
  const encerrar = pm.podeEncerrar({ nivel, status }, com.map((c) => ({ protocoloExterno: c.protocoloExterno, referenciaArquivo: c.referenciaArquivo, temAnexo: nAnexos > 0 })),
    (o.envolvidos || []).map((e) => ({ membroId: e.membroId || null, nivelAlegacao: nivel === "ALEGACAO", decisao: Number(e.nDecisoes || 0) > 0 ? e.ultimaDecisao : null })));
  if (o.motivoAtaque && !encerrar.ok) encerrar.motivos = encerrar.motivos.map((m, i) => (i === 0 ? `${m} ${o.motivoAtaque}` : m));   // o motivo que o servidor escreve, com texto de ataque
  const base = mapearResumo(Object.assign({}, i, { NComunicacoes: com.length, NComComprovante: com.filter((c) => pm.temComprovante(c)).length, NAnexos: nAnexos, NSemDecisao: envolvidos.filter((e) => e.afastamentoCautelar && !e.decisoes && e.membroId).length }), new Date(agora));
  return {
    sucesso: true, agora: new Date(agora).toISOString(),
    incidente: Object.assign(base, {
      descricao: o.descricao || "Descrição de fatos do incidente", onde: o.onde === undefined ? "Sala do Maternal" : o.onde, equipeNome: o.equipeNome === undefined ? "Maternal" : o.equipeNome, relatadoPor: o.relatadoPor || "VOLUNTARIO",
      relatadoPorRotulo: o.relatadoPorRotulo || pm.QUEM_RELATOU[o.relatadoPor || "VOLUNTARIO"], conhecidoEm: new Date(o.conhecidoEm || AGORA_FIXA - 4 * HORA).toISOString(), contatoCanal: geral ? o.contatoCanal || null : null, registradoPor: geral && o.registradoPor ? { membroId: o.registradoPor.membroId || 5, nome: o.registradoPor.nome || null } : null,
      encerramento: status === "ENCERRADO" ? { resultado: o.resultado || "ENCAMINHADO_AUTORIDADE", resultadoRotulo: o.resultadoRotulo || pm.RESULTADOS_ENCERRAMENTO[o.resultado || "ENCAMINHADO_AUTORIDADE"], providencia: o.providencia || "Providência registrada", em: new Date(o.encerradoEm || AGORA_FIXA).toISOString() } : null
    }),
    envolvidos, comunicacoes: com, anexos: nAnexos, comprovante,
    decisoes: geral ? (o.decisoes || []).map((d) => ({ envolvidoId: d.envolvidoId, decisao: d.decisao, decisaoRotulo: d.decisaoRotulo || pm.DECISOES_CAUTELAR[d.decisao], observacao: d.observacao, decididaEm: new Date(d.decididaEm || AGORA_FIXA - HORA).toISOString(), decididaPorNome: d.decididaPorNome || "Membro do Comitê" })) : [],
    reclassificacoes: (o.reclassificacoes || []).map((x) => ({ de: x.de, para: x.para, motivo: x.motivo, em: new Date(x.em || AGORA_FIXA - HORA).toISOString(), porNome: x.porNome || "Dirigente da Sede" })),
    relato: o.relato || { registrado: true, adendos: 0 },
    leituras: (o.leituras || []).map((l) => ({ nome: l.nome, em: new Date(l.em || AGORA_FIXA - HORA).toISOString() })),
    possiveisMembros: geral ? (o.possiveisMembros || []) : [],
    acoes: {
      vincularEnvolvido: geral && status === "ABERTO",
      arquivarSemConteudo: geral && status === "ABERTO" && i.Origem === "CANAL_AJUDA" && nivel === "ALEGACAO" && !(o.envolvidos || []).some((e) => e.membroId),
      comunicar: status === "ABERTO" && !!i.ExigeComunicacao, encerrar: geral && status === "ABERTO", reclassificar: status === "ABERTO" && nivel !== "ALEGACAO", decidirCautelar: geral && nivel === "ALEGACAO",
      adendo: status === "ABERTO" && nivel === "ALEGACAO"
    },
    encerramentoPossivel: encerrar
  };
}

// ---- demais respostas ----
const meus = (lista) => ({ sucesso: true, incidentes: lista });
const confirmacaoDeAjuda = (protocolo = "PRO-2026-0900") => ({ sucesso: true, protocolo, mensagem: pm.textoConfirmacaoDeAjuda(), contatosDeAjuda: pm.CONTATOS_DE_AJUDA });
const falhaDeAjuda = (mensagem) => ({ sucesso: false, mensagem, contatosDeAjuda: pm.CONTATOS_DE_AJUDA });
// GET comite (db.comiteComposicao): a avaliação vem da regra de verdade
function comite(membros) {
  const avaliacao = pm.avaliarComposicao(membros.map(m => ({ membroId: m.membroId, cargoMinisterial: m.cargoMinisterial })));
  return { sucesso: true, comite: { papel: "Comitê de Proteção", membros: membros.map(m => ({ membroId: m.membroId, nome: m.nome, clerigo: pm.ehClerigo(m.cargoMinisterial) })), avaliacao } };
}
// GET padroes (db.padroes): os padrões vêm de pm.padraoDeQuebras; o nome é o que o banco acrescenta
function padroes(eventos, nomes) {
  const achados = pm.padraoDeQuebras(eventos, { hoje });
  return { sucesso: true, padroes: achados.map((a) => ({ ...a, nome: nomes[`${a.tipo}:${a.id}`] || `Matrícula ${a.id}` })) };
}
// GET relatorio-anual (db.relatorioAnual): o formato do retorno
function relatorio(ano) {
  const linha = (nome, extra = {}) => Object.assign({ congregacaoNome: nome, quaseAcidentes: 2, quebrasDePolitica: 1, suspeitasDeViolencia: 3, abertos: 1, suspeitasComunicadasNoPrazo: 2, suspeitasForaDoPrazoOuSemComunicacao: 1, horasMediasAteComunicar: 5.5 }, extra);
  const porCongregacao = [linha("Sede"), linha("Norte", { suspeitasDeViolencia: 0, suspeitasComunicadasNoPrazo: 0, suspeitasForaDoPrazoOuSemComunicacao: 0, horasMediasAteComunicar: null })];
  const total = { quaseAcidentes: 4, quebrasDePolitica: 2, suspeitasDeViolencia: 3, abertos: 2, suspeitasComunicadasNoPrazo: 2, suspeitasForaDoPrazoOuSemComunicacao: 1, afastamentosCautelaresAtivos: 1 };
  const membros = [{ membroId: 1, cargoMinisterial: "PASTOR" }, { membroId: 2, cargoMinisterial: null }, { membroId: 3, cargoMinisterial: null }];
  return {
    sucesso: true,
    relatorio: {
      ano, geradoEm: new Date(AGORA_FIXA).toISOString(), total, porCongregacao, comite: { papel: "Comitê de Proteção", membros: [], avaliacao: pm.avaliarComposicao(membros) },
      habilitacaoPorCongregacao: [{ congregacaoId: 2, congregacaoNome: "Sede", total: 10, aptos: 7, vencendo: 2, bloqueados: 1, porMotivo: {} }]
    }
  };
}

// ---- contrato: cada campo que a tela lê ainda existe no código do servidor (se o servidor mudar o nome de um campo, isto acusa antes da tela quebrar em silêncio) ----
function contratoComOServidor() {
  const db = fs.readFileSync(path.join(API, "shared/protecaoDb.js"), "utf8");
  const handler = fs.readFileSync(path.join(API, "GestaoProtecaoMenores/index.js"), "utf8");
  const ajuda = fs.readFileSync(path.join(API, "ProtecaoAjuda/index.js"), "utf8");
  const campos = {
    db: ["incidenteId", "protocolo", "nivelRotulo", "origem", "origemRotulo", "congregacaoNome", "dataOcorrencia", "exigeComunicacao", "prazoEm", "relogio", "restanteMs", "faixa", "comunicado", "comComprovante", "cautelarSemDecisao",
      "registradoEm", "encerradoEm", "descricao", "onde", "equipeNome", "relatadoPorRotulo", "conhecidoEm", "contatoCanal", "encerramento", "resultadoRotulo", "providencia", "envolvidoId", "ehMembro", "afastamentoCautelar", "ultimaDecisao",
      "orgaoRotulo", "formaRotulo", "comunicadoEm", "protocoloExterno", "referenciaArquivo", "observacao", "foraDoPrazo", "registradoPorNome", "decisaoRotulo", "decididaPorNome", "reclassificacoes", "relato", "adendos", "leituras",
      "acoes", "comunicar", "encerrar", "reclassificar", "decidirCautelar", "adendo", "encerramentoPossivel", "anexos", "clerigo", "avaliacao", "habilitacaoPorCongregacao", "porCongregacao", "geradoEm", "afastamentosCautelaresAtivos",
      "suspeitasComunicadasNoPrazo", "suspeitasForaDoPrazoOuSemComunicacao", "horasMediasAteComunicar", "quaseAcidentes", "quebrasDePolitica", "suspeitasDeViolencia", "abertos", "motivos", "situacao", "vincularEnvolvido", "arquivarSemConteudo", "possiveisMembros", "registradoPor", "SEM_CONTEUDO_DE_PROTECAO"],
    handler: ["niveis", "orgaos", "formas", "quemRelatou", "resultados", "decisoes", "contatosDeAjuda", "roteiroEscuta", "naoFaca", "horasPrazo", "papeis", "agora", "incidentes", "incidente", "padroes", "comite", "relatorio", "vincular-envolvido"],
    ajuda: ["contatosDeAjuda", "protocolo", "mensagem"]
  };
  const faltam = [];
  for (const [fonte, texto] of [["db", db], ["handler", handler], ["ajuda", ajuda]]) for (const c of campos[fonte]) if (!new RegExp(`\\b${c}\\b`).test(texto)) faltam.push(`${fonte}:${c}`);
  return faltam;
}

module.exports = { pm, hoje, HORA, ATAQUE, catalogos, catalogosComAtaque, resumo, filaDe, ordenarComoOServidor, detalhe, meus, confirmacaoDeAjuda, falhaDeAjuda, comite, padroes, relatorio, contratoComOServidor };
