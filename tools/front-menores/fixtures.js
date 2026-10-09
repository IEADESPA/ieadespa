// fixtures.js — respostas da API nos formatos REAIS: montadas com as próprias funções do servidor (shared/ministerioMenores.js, menoresConsentimento.js,
// menoresConsentimentoDb.js, ministerioMenoresDb.js) e copiando, linha a linha, a forma que cada handler devolve (GestaoMinisterioMenores, GestaoConsentimentoMenor,
// GestaoEscalas, MinhaFoto, MeusDadosLGPD). Nada aqui é "o que a tela espera": é o que o servidor manda.
"use strict";
const path = require("path");
const API = path.resolve(__dirname, "../../api");
const mm = require(path.join(API, "shared/ministerioMenores"));
const mc = require(path.join(API, "shared/menoresConsentimento"));
const mcDb = require(path.join(API, "shared/menoresConsentimentoDb"));
const mmDb = require(path.join(API, "shared/ministerioMenoresDb"));
const { hojeBrasilia } = require(path.join(API, "shared/dataBrasilia"));

const hoje = hojeBrasilia();
const iso = (dias) => mm.somarDiasIso(hoje, dias);
const instante = (dias, hora = "15:00:00") => `${iso(dias)}T${hora}.000Z`;

// texto de ataque: sai do atributo (aspas), sai da tag (>) e abre uma imagem quebrada com onerror; o nome do campo identifica quem vazou
const ATAQUE = (campo) => `"'><img src=x onerror="window.__xss('${campo}')"><svg onload=window.__xss('${campo}')>[${campo}]`;

// ---- Ministério com menores: a decisão de aptidão, com a regra de verdade ----
function fatos(sobre = {}) {
  return Object.assign({
    membro: { dataNascimento: "1990-05-05", dataAdmissao: "2015-01-01", status: "ATIVO", situacao: "ATIVO" },
    esteira: { existe: true, status: "APTO", validoAte: iso(300) },
    vistoria: { vistoriaId: 7, resultado: "SEM_RESTRICAO", dataVerificacao: iso(-10), documentos: [{ tipo: "ANTECEDENTES_FEDERAL", dataEmissao: iso(-150) }, { tipo: "ANTECEDENTES_ESTADUAL", dataEmissao: iso(-150) }] },
    treinamento: { modo: "MANUAL", atestadoEm: iso(-100) }, fichaEm: iso(-20), politicaVersaoAceita: 1, politicaVersaoVigente: 1, autoDenunciaAberta: false, cadastroNacional: null
  }, sobre);
}
const aptidao = (sobre) => mm.avaliarAptidao(fatos(sobre), { hoje, prazos: {} });

// minha-situacao (GestaoMinisterioMenores → db.minhaSituacao)
function minhaSituacao({ sobre = {}, equipes = [{ equipeId: 3, nome: "Maternal" }], autoDenuncia = null, politicaAceita = false } = {}) {
  const ap = aptidao(sobre);
  return { sucesso: true, situacao: {
    apto: ap.apto, contaComoAdulto: ap.contaComoAdulto, bloqueios: ap.bloqueios, validades: ap.validades, proximoVencimento: ap.proximoVencimento,
    equipes, habilitacaoAberta: true, politica: { vigente: { versao: mm.POLITICA_VERSAO }, aceita: politicaAceita }, autoDenuncia
  } };
}
const politica = (aceita = false) => ({ sucesso: true, politica: mm.politicaVigente(), aceita });
const catalogos = (papeis = { gestao: true, geral: true, diretoria: true }) => ({
  sucesso: true,
  faixas: Object.entries(mm.FAIXAS).map(([codigo, f]) => ({ codigo, rotulo: f.rotulo, criancasPorAdultoPadrao: f.padrao })),
  rotulosBloqueio: mm.ROTULO_BLOQUEIO, alertasDias: mm.ALERTAS_DIAS,
  tiposAutoDenuncia: Object.entries(mm.TIPOS_AUTODENUNCIA).map(([codigo, rotulo]) => ({ codigo, rotulo })),
  decisoesAutoDenuncia: Object.entries(mm.DECISOES_AUTODENUNCIA).map(([codigo, rotulo]) => ({ codigo, rotulo })),
  papeis
});
// auto-denúncia como a lista da Diretoria e a minha-situação a mostram (mapearAutoDenuncia, a função real)
function autoDenunciaRow(sobre = {}) {
  return Object.assign({ AutoDenunciaId: 11, MembroId: 41, Nome: "Fulano de Tal", CongregacaoNome: "Sede", Tipo: "INQUERITO_POLICIAL", DataCiencia: new Date(`${iso(-12)}T00:00:00Z`),
    DeclaradaEm: new Date(instante(-11)), Decisao: null, DecididaEm: null, DecisaoObservacao: null, LiberadoEm: null, LiberacaoObservacao: null }, sobre);
}
const autoDenuncias = (rows) => ({ sucesso: true, autoDenuncias: rows.map(r => mmDb.mapearAutoDenuncia(r, { comPessoa: true })) });
// o `autoDenuncia` de minha-situacao (campos do SELECT TOP 1 + os rótulos)
function autoDenunciaDaSituacao(row) {
  const x = row;
  return {
    autoDenunciaId: x.AutoDenunciaId, tipo: x.Tipo, tipoRotulo: mm.TIPOS_AUTODENUNCIA[x.Tipo], dataCiencia: mm.paraIso(x.DataCiencia), declaradaEm: x.DeclaradaEm.toISOString(),
    decisao: x.Decisao || null, decisaoRotulo: x.Decisao ? mm.DECISOES_AUTODENUNCIA[x.Decisao] : null, decididaEm: x.DecididaEm ? x.DecididaEm.toISOString() : null,
    liberadoEm: x.LiberadoEm ? x.LiberadoEm.toISOString() : null, emAnalise: !x.Decisao
  };
}

// painel (db.painel): a mesma montagem do servidor, sobre linhas sintéticas
function painel(linhas, { reservado = false, equipesSemMarca = [] } = {}) {
  const itens = linhas.map((l) => {
    const status = mm.statusDaLinha(l.aptidao);
    return {
      membroId: l.membroId, nome: l.nome, congregacaoId: l.congregacaoId, congregacaoNome: l.congregacaoNome, equipes: l.equipes.map((e) => e.nome),
      status, bloqueios: mm.bloqueiosParaPainel(l.aptidao.bloqueios, { reservado }), proximoVencimento: l.aptidao.proximoVencimento,
      validades: reservado ? l.aptidao.validades : mm.validadesParaGestao(l.aptidao.validades)
    };
  }).sort((a, b) => ({ BLOQUEADO: 0, VENCENDO: 1, APTO: 2 }[a.status] - { BLOQUEADO: 0, VENCENDO: 1, APTO: 2 }[b.status]) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  return { sucesso: true, resumo: mm.resumirPainel(linhas, { reservado }), porCongregacao: mm.agruparPorCongregacao(linhas, { reservado }), voluntarios: itens, equipesSemMarca };
}
const linha = (membroId, nome, cong, sobre, equipes = [{ equipeId: 3, nome: "Maternal", liderMembroId: 9 }]) => ({
  membroId, nome, congregacaoId: cong.id, congregacaoNome: cong.nome, equipes, aptidao: aptidao(sobre)
});

// ---- Consentimento do responsável ----
const ativos = [{ responsavelId: 20, nome: "Maria Responsável", vinculo: "MAE", rotuloVinculo: "Mãe" }];
function linhaConsent(finalidade, concedido, responsavelId = 20, extra = {}) {
  const t = mc.textoDe(finalidade);
  return Object.assign({ consentimentoId: 1, menorId: 40, responsavelId, finalidade, concedido, textoVersao: t.versao, textoHash: t.hash, forma: "CLICK_RESP", registradoEm: instante(-3), referencia: null }, extra);
}
function estados(linhas, opcoes) { return mcDb.estadosDoContexto({ linhas, ativos }, opcoes); }
const menoresDoResponsavel = (lista) => ({ sucesso: true, menores: lista });
const menorDaLista = (menorId, nome, estadosObj) => ({ menorId, nome, idade: 10, vinculo: "MAE", rotuloVinculo: "Mãe", estados: estadosObj });
const textos = () => ({ sucesso: true, versao: mc.CONSENTIMENTO_VERSAO, finalidades: mc.CODIGOS_FINALIDADE.map((codigo) => ({ codigo, rotulo: mc.FINALIDADES[codigo] })), textos: mc.textosVigentes() });
// consentimento-menor/menor?menorId= (visão da Secretaria)
function menorGestao({ nome = "Pedro Menor", idade = 10, estadosObj, responsaveis = [{ membroId: 20, nome: "Maria Responsável", vinculo: "MAE", rotuloVinculo: "Mãe" }], aindaMenor = true, mensagem } = {}) {
  if (!aindaMenor) return { sucesso: true, menor: { membroId: 40, nome, idade, aindaMenor: false, congregacaoNome: "Sede" }, estados: null, responsaveis: [], mensagem: mensagem || mc.condicaoDoMenor(idade).motivo, visao: "GESTAO" };
  return { sucesso: true, menor: { membroId: 40, nome, idade, aindaMenor: true, congregacaoNome: "Sede" }, estados: estadosObj || estados({}, { paraGestao: true }), responsaveis, visao: "GESTAO" };
}

// ---- Escalas (servicos-detalhe com as salas) ----
function salaDe({ servicoId = 5, equipeId, equipeNome, faixa, criancasPrevistas, adultos, semHabilitacao = [] }) {
  const porAdulto = faixa ? mm.criancasPorAdulto(faixa, {}) : null;
  const av = mm.avaliarSala({ equipeNome, faixa, criancasPrevistas, adultos, semHabilitacao, adultosMinimos: 2, criancasPorAdulto: porAdulto });
  return { equipeId, equipeNome, faixa: faixa || null, criancasPrevistas: criancasPrevistas == null ? null : criancasPrevistas, adultos, necessarios: av.necessarios, ok: av.ok, _problemas: av.problemas.map(p => ({ equipeId, equipeNome, codigo: p.codigo, mensagem: p.mensagem })) };
}
function menoresDoServico(salas) {
  const problemas = salas.flatMap(s => s._problemas);
  return { ok: problemas.length === 0, salas: salas.map(({ _problemas, ...s }) => s), problemas };
}
const servicoDetalhe = (salas, status = "RASCUNHO") => ({ sucesso: true, servico: { servicoId: 5, descricao: "Culto Infantil", dataHora: `${iso(3)}T19:00:00.000Z`, status }, alocacoes: [{ equipeId: 3, membroId: 20, status: "ACEITO" }], menores: menoresDoServico(salas) });

module.exports = { mm, mc, mcDb, mmDb, hoje, iso, instante, ATAQUE, fatos, aptidao, minhaSituacao, politica, catalogos, autoDenunciaRow, autoDenuncias, autoDenunciaDaSituacao, painel, linha, ativos,
  linhaConsent, estados, menoresDoResponsavel, menorDaLista, textos, menorGestao, salaDe, menoresDoServico, servicoDetalhe };
