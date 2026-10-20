// GestaoCheckinInfantil (v7.10 — Check-in infantil com cadeia de custódia)
// ECA arts. 70 e 70-A; Lei 14.811/2024; LGPD arts. 11 e 14.
//
// Toda a regra está em shared/checkinInfantil.js (pura, testada); o banco, em shared/checkinInfantilDb.js. A sala é a da v7.7: o par (serviço da escala, equipe com a marca
// "contato com menores"). Opera a sala quem está escalado nela e apto hoje (a aptidão é reavaliada a cada ato); a liderança da congregação (permissão
// `habilitacao_voluntarios`, sessão de liderança, dentro do escopo) vê a sala, decide as retiradas divergentes e destrava. O responsável (qualquer login) cuida da lista de
// autorizados e da saúde dos próprios filhos e vê o histórico deles: nunca faz o check-in.
//
// ---- Qualquer login (inclusive PIN) ------------------------------------------------------------------------------------------------------------
//  GET  catalogos                -> { parentescos[{codigo,rotulo}], documentos[], faixas[], textoSaude:{versao,titulo,itens,aceite,hash}, tentativas, janela:{antesMinutos,depoisHoras}, segundaViaMinutos, maxAutorizados, papeis:{gestao} }
//  GET  minhas-salas             -> { salas[{servicoId,equipeId,equipeNome,faixa,congregacaoNome,dataHora,janela,ehMinha,ehGestao,criancasNaSala,voluntariosNaSala}] }   as de hoje: as que opera e, para a liderança, as do escopo
//  GET  meus-filhos              -> { filhos[{menorId,nome,idade,vinculo,rotuloVinculo}] }                  só quem é responsável ATIVO (cadastro da Secretaria)
//  GET  historico?menorId=       -> { historico[{registroId,data,sala,congregacao,entregueEm,retiradoEm,situacao,quemTrouxe,quemRetirou,retiradaDivergente,menorId,crianca}] }   só dos próprios filhos
//  GET  autorizados?menorId=     -> { menor, responsaveis[], autorizados[], limite }                         responsável ativo, ou a liderança da congregação da criança
//  GET  saude?menorId=           -> { menorId, consentimentoVigente, saude:{texto,forma,atualizadoEm}|null } o mesmo acesso
//  POST autorizado-adicionar     body:{menorId, nome, parentesco, membroId?, validoAte?, ficha?:true, referencia?}   ficha:true = a Secretaria registra a ficha assinada (liderança)
//  POST autorizado-revogar       body:{autorizadoId}
//  POST saude-gravar             body:{menorId, texto, ficha?:true, referencia?}                              só com o consentimento de saúde da v7.7 vigente
//  POST saude-apagar             body:{menorId}
// ---- A equipe da sala (escalado + apto + adulto; para agir, precisa ter ENTRADO na sala) --------------------------------------------------------
//  GET  sala?servicoId=&equipeId=              -> { sala, adultosPresentes[], lotacao, criancas[], totais, pendencias, atualizadoEm }    a tela atualiza sozinha; a liderança recebe visão com telefones
//                                                                                                                                          (adultosPresentes[].apto só na visão da liderança; o voluntário recebe só contaComoAdulto)
//  GET  buscar?servicoId=&equipeId=&q=         -> { criancas[{menorId,nome,idade,faixa,foraDaFaixa,temResponsavel,jaNaSala}] }          só da congregação da sala, 3+ letras
//  GET  responsaveis?servicoId=&equipeId=&menorId= -> { responsaveis[{membroId,nome,vinculo,rotuloVinculo}] }
//  GET  relatorio?servicoId=&equipeId=         -> { sala, voluntarios[], criancas[], eventos[] }                                          o relatório do dia da sala: ATO DE GESTÃO (só a liderança da congregação)
//  POST entrar-na-sala           body:{servicoId, equipeId}
//  POST sair-da-sala             body:{servicoId, equipeId, membroId?}   membroId só da liderança (tira quem esqueceu de sair)
//  POST checkin                  body:{servicoId, equipeId, criancas[{menorId}|{visitante:{nome,nascimento,saude?:{texto,concordo,textoHash}}}], trouxe:{responsavelId}|{nome,parentesco,documento,contato?}, autorizadosVisita?[{nome,parentesco}]}
//                                -> 201 { etiquetas[{registroId,etiqueta:{nome,idade,sala,codigo,saude,...}}], recibo }   O CÓDIGO SÓ SAI AQUI
//  POST retirar                  body:{registroId, codigo, retirante:{ref}|{outro:{nome,parentesco,documento,motivo?}}}   -> { retirada:true } | { divergente:true, aguardaLideranca:true, avisados, semAviso }
//                                (semAviso:true = a liderança NÃO foi avisada pelo sistema: a tela manda o voluntário ligar para ela)
//  POST segunda-via-pedir        body:{registroId, pessoa:{ref}, documento}
//  POST segunda-via-confirmar    body:{registroId}                       outro adulto da sala; -> { etiqueta, avisados, semAviso }  (o código novo sai só aqui; semAviso:true = o responsável cadastrado não pôde ser avisado)
// ---- Liderança da congregação (permissão habilitacao_voluntarios, sessão de liderança, no escopo) -------------------------------------------------
//  POST decidir-divergencia      body:{registroId, aprovar:true|false, motivo}     pede a confirmação reforçada (428); quem pediu não decide
//  POST destravar                body:{registroId}
//  POST encerrar-sala            body:{servicoId, equipeId, motivo}                -> { baixadas, mensagem }   baixa administrativa das crianças que ficaram sem retirada (só depois que o check-in da sala
//                                fechou); pede a confirmação reforçada (428); motivo de 5 a 300 caracteres; os voluntários presentes saem; repetir não é erro
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim · 403 sem permissão · 404 não achou · 409 corrida perdida.
// Toda resposta leva Cache-Control: no-store (a do check-in e a da segunda via trazem o código). Quem não tem acesso à sala recebe 403 ANTES de qualquer busca; sala que não existe e
// sala de outra congregação recebem a mesma resposta.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const mc = require("../shared/menoresConsentimento");
const mm = require("../shared/ministerioMenores");
const mmDb = require("../shared/ministerioMenoresDb");
const ck = require("../shared/checkinInfantil");
const db = require("../shared/checkinInfantilDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";
const idDe = ck.idDe;
const NO_STORE = { "Cache-Control": "no-store" };

function responder(context, status, body) { context.res = { status, headers: NO_STORE, body }; }
function erro(context, status, mensagem) { responder(context, status, { sucesso: false, mensagem }); }
function resposta(context, r, statusOk = 200) {
  const status = r.sucesso ? statusOk : r.proibido ? 403 : r.naoAchou ? 404 : r.mudou ? 409 : 422;
  responder(context, status, r);
}
const lista = (obj) => Object.entries(obj).map(([codigo, rotulo]) => ({ codigo, rotulo }));

module.exports = async function (context, req) {
  const sessao = auth.exigirLogin(req, context);
  if (!sessao) { if (context.res) context.res.headers = { ...(context.res.headers || {}), ...NO_STORE }; return; }       // até a recusa de sessão leva no-store (a regra é "toda resposta")
  // A permissão da liderança só vale em sessão de liderança: PIN ou código nunca valem como liderança (e não têm permissão alguma).
  const lideranca = auth.ehSessaoDeLideranca(sessao);
  const visaoHab = lideranca ? auth.visaoDaPermissao(sessao, "habilitacao_voluntarios") : null;
  let gestao = !!visaoHab;
  let gestorPodeVer = gestao ? (congregacaoNome) => auth.estaNoEscopo(visaoHab, congregacaoNome) : null;

  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};
  const hoje = hojeBrasilia();

  // Trava 7-B (20/10/2026): a liderança com pendência reservada à Diretoria (afastamento cautelar da v7.8, comunicação em análise, cadastro nacional, restrição nos antecedentes, fora
  // de comunhão) não vê a sala nem age como gestão do check-in — é o mesmo bloqueio que tira o voluntário da sala. Sem isso, um Dirigente afastado por suspeita continuava vendo nomes,
  // saúde e telefones, aprovando divergência e cadastrando autorizado "por ficha". A resposta é a de quem não tem a permissão (o motivo segue reservado). Na dúvida (a aptidão não
  // pôde ser lida), fecha.
  if (gestao) {
    let impedido = true;
    try { const ap = await mmDb.aptidaoDe(await getPool(), sessao.membroId, { hoje }); impedido = !ap || mm.temBloqueioReservado(ap.bloqueios); }
    catch (e) { context.log && context.log.error && context.log.error("[CHECKIN] não foi possível conferir a aptidão da liderança:", e.message); }
    if (impedido) { gestao = false; gestorPodeVer = null; }
  }

  // Identificador que chega de fora: inteiro positivo escrito direito; o resto é 400 (nunca vira consulta ao banco).
  for (const campo of ["servicoId", "equipeId", "menorId", "registroId", "membroId", "autorizadoId"]) {
    for (const origem of [corpo, consulta]) {
      if (campo in origem && origem[campo] != null && origem[campo] !== "" && !idDe(origem[campo])) return erro(context, 400, `${campo} inválido.`);
    }
  }

  // A sala (par serviço + equipe) e quem está agindo nela. `modo`: "sala" (só carrega a sala: a função do banco confere o operador no ato, com a aptidão de AGORA),
  // "gestor" (liderança no escopo) ou "qualquer" (a equipe da sala ou a liderança no escopo: a leitura da sala).
  // `exigirMarca: false` (ler a sala e sair dela): a criança e o voluntário que JÁ estão lá dentro não podem ficar presos se a equipe perder a marca no meio do serviço.
  // `sePresente`: quem tem presença aberta na sala passa da porta mesmo sem estar (mais) na escala (ex.: foi tirado da escala depois de entrar) — só o que o deixa SAIR usa isto.
  async function abrirSala(origem, modo, { exigirMarca = true, sePresente = false } = {}) {
    const v = ck.validarSala(origem);
    if (!v.valido) return { falha: [400, v.mensagem] };
    const pool = await getPool();
    const c = await db.contextoDaSala(pool, { servicoId: v.servicoId, equipeId: v.equipeId }, { exigirMarca: false });
    if (!c.sucesso) return { falha: [c.naoAchou ? 404 : 422, c.mensagem] };
    const comoGestor = gestao && gestorPodeVer(c.sala.congregacaoNome);
    // Sala que não existe, sala de outra congregação e sala em que a pessoa não tem relação nenhuma (não está escalada, não a lidera e não é da gestão da congregação) recebem a MESMA
    // resposta ("não existe"): nem a sala, nem a marca da equipe viram sonda para quem só tem um login (achado na prova no banco real, e2e-20: antes era 403 para uma e 404 para a outra).
    if (!comoGestor && !(await db.relacionadoComASala(pool, c.sala, sessao.membroId)) && !(sePresente && (await db.estaPresente(pool, c.sala, sessao.membroId)))) return { falha: [404, ck.MENSAGENS.SALA_NAO_ENCONTRADA] };
    if (exigirMarca && !c.sala.comMarca) return { falha: [422, ck.MENSAGENS.SALA_SEM_MARCA] };
    if (modo === "sala") return { pool, sala: c.sala, comoGestor };
    if (modo === "gestor") {
      if (!comoGestor) return { falha: [403, SEM_PERMISSAO] };
      return { pool, sala: c.sala, comoGestor: true };
    }
    const p = await db.papelDoOperador(pool, c.sala, sessao.membroId, { hoje });
    if (!p.pode && !comoGestor) return { falha: [403, p.motivo || SEM_PERMISSAO] };
    return { pool, sala: c.sala, comoGestor, comoOperador: p.pode };
  }

  try {
    // =============================== Leitura ===============================
    if (metodo === "GET") {
      if (acao === "catalogos") {
        const pool = await getPool();
        const prazos = await db.lerPrazos(pool);
        const t = mc.textoDe("SAUDE_CRACHA");
        responder(context, 200, {
          sucesso: true,
          parentescos: lista(ck.PARENTESCOS), documentos: lista(ck.DOCUMENTOS),
          faixas: Object.entries(mm.FAIXAS).map(([codigo, f]) => ({ codigo, rotulo: f.rotulo })),
          textoSaude: { versao: t.versao, titulo: t.titulo, itens: t.itens, aceite: t.aceite, hash: t.hash },
          tentativas: prazos.tentativasCodigo, janela: { antesMinutos: prazos.abreMinutosAntes, depoisHoras: prazos.fechaHorasDepois },
          segundaViaMinutos: ck.SEGUNDA_VIA_MINUTOS, maxAutorizados: ck.MAX_AUTORIZADOS_POR_CRIANCA, maxCriancasPorCheckin: ck.MAX_CRIANCAS_POR_CHECKIN,
          papeis: { gestao }
        });
        return;
      }
      if (acao === "minhas-salas") {
        const pool = await getPool();
        responder(context, 200, { sucesso: true, salas: await db.minhasSalas(pool, { membroId: sessao.membroId, gestorPodeVer, hoje }) });
        return;
      }
      if (acao === "meus-filhos") {
        const pool = await getPool();
        responder(context, 200, { sucesso: true, filhos: await db.meusFilhos(pool, { responsavelId: sessao.membroId, hoje }) });
        return;
      }
      if (acao === "historico") {
        const pool = await getPool();
        responder(context, 200, { sucesso: true, historico: await db.historicoDoResponsavel(pool, { responsavelId: sessao.membroId, menorId: idDe(consulta.menorId), hoje }) });
        return;
      }
      if (acao === "autorizados" || acao === "saude") {
        const menorId = idDe(consulta.menorId);
        if (!menorId) return erro(context, 400, "Informe menorId.");
        const pool = await getPool();
        const r = acao === "autorizados"
          ? await db.listarAutorizados(pool, { menorId, atorId: sessao.membroId, gestorPodeVer, hoje })
          : await db.lerSaudeDaCrianca(pool, { menorId, atorId: sessao.membroId, gestorPodeVer, hoje });
        return resposta(context, r);
      }
      if (acao === "sala" || acao === "relatorio") {
        // O relatório do dia é ATO DE GESTÃO (contrato da v7.10): traz os motivos que a liderança escreveu e todos os atos do serviço; o voluntário recebe a tela da sala, não o relatório.
        const a = await abrirSala(consulta, acao === "relatorio" ? "gestor" : "qualquer", { exigirMarca: false });
        if (a.falha) return erro(context, ...a.falha);
        if (acao === "relatorio") return responder(context, 200, { sucesso: true, ...(await db.relatorioDaSala(a.pool, a.sala)) });
        responder(context, 200, { sucesso: true, ...(await db.snapshotDaSala(a.pool, a.sala, { hoje, visao: a.comoGestor ? "GESTOR" : "OPERADOR" })) });
        return;
      }
      if (acao === "buscar" || acao === "responsaveis") {
        const a = await abrirSala(consulta, "sala");
        if (a.falha) return erro(context, ...a.falha);
        const op = await db.conferirOperador(a.pool, a.sala, sessao.membroId, { hoje });
        if (!op.sucesso) return resposta(context, op);
        if (acao === "buscar") return resposta(context, await db.buscarCriancas(a.pool, { sala: a.sala, termo: consulta.q, hoje }));
        const menorId = idDe(consulta.menorId);
        if (!menorId) return erro(context, 400, "Informe menorId.");
        return resposta(context, await db.responsaveisDaCrianca(a.pool, { sala: a.sala, menorId }));
      }
      return erro(context, 404, "Ação inválida.");
    }

    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");

    // =============================== Responsável: lista de autorizados e saúde dos próprios filhos ===============================
    if (acao === "autorizado-adicionar") {
      const v = ck.validarAutorizado(corpo);
      if (!v.valido) return erro(context, 422, v.mensagem);
      const ficha = corpo.ficha === true;
      if (ficha && !gestao) return erro(context, 403, SEM_PERMISSAO);
      // Trava 7-B: a liderança pondo alguém na lista de quem retira a criança "por ficha" é ato tão sensível quanto aprovar uma divergência (a pessoa passa a retirar e a pedir 2ª via)
      if (ficha && !auth.exigirFatorRecente(req, context)) return;
      const pool = await getPool();
      return resposta(context, await db.adicionarAutorizado(pool, { dados: v, atorId: sessao.membroId, forma: ficha ? "FICHA_FISICA" : "RESPONSAVEL", gestorPodeVer, hoje }), 201);
    }
    if (acao === "autorizado-revogar") {
      const autorizadoId = idDe(corpo.autorizadoId);
      if (!autorizadoId) return erro(context, 400, "Informe autorizadoId.");
      const pool = await getPool();
      return resposta(context, await db.revogarAutorizado(pool, { autorizadoId, atorId: sessao.membroId, gestorPodeVer, hoje }));
    }
    if (acao === "saude-gravar") {
      const v = ck.validarSaudeDaCrianca(corpo);
      if (!v.valido) return erro(context, 422, v.mensagem);
      const ficha = corpo.ficha === true;
      if (ficha && !gestao) return erro(context, 403, SEM_PERMISSAO);
      const pool = await getPool();
      return resposta(context, await db.gravarSaude(pool, { dados: v, atorId: sessao.membroId, forma: ficha ? "FICHA_FISICA" : "RESPONSAVEL", gestorPodeVer, hoje }));
    }
    if (acao === "saude-apagar") {
      const menorId = idDe(corpo.menorId);
      if (!menorId) return erro(context, 400, "Informe menorId.");
      const pool = await getPool();
      const acesso = await db.lerSaudeDaCrianca(pool, { menorId, atorId: sessao.membroId, gestorPodeVer, hoje });
      if (!acesso.sucesso) return resposta(context, acesso);
      const r = await db.apagarSaudeDoMenor(pool, { menorId, por: sessao.membroId });
      return responder(context, 200, { sucesso: true, mensagem: r.apagou ? "A informação de saúde foi apagada." : "Não havia informação de saúde guardada." });
    }

    // =============================== A equipe da sala ===============================
    if (acao === "entrar-na-sala") {
      const a = await abrirSala(corpo, "sala");
      if (a.falha) return erro(context, ...a.falha);
      return resposta(context, await db.entrarNaSala(a.pool, { sala: a.sala, membroId: sessao.membroId, hoje }), 201);
    }
    if (acao === "sair-da-sala") {
      const tiraOutro = corpo.membroId != null && corpo.membroId !== "" && idDe(corpo.membroId) !== Number(sessao.membroId);
      const a = await abrirSala(corpo, tiraOutro ? "gestor" : "sala", { exigirMarca: false, sePresente: !tiraOutro });
      if (a.falha) return erro(context, ...a.falha);
      const alvo = tiraOutro ? idDe(corpo.membroId) : Number(sessao.membroId);
      return resposta(context, await db.sairDaSala(a.pool, { sala: a.sala, membroId: alvo, porId: tiraOutro ? Number(sessao.membroId) : null, hoje }));
    }
    if (acao === "checkin") {
      const v = ck.validarCheckin(corpo, { hoje });
      if (!v.valido) return erro(context, 422, v.mensagem);
      const a = await abrirSala(corpo, "sala");
      if (a.falha) return erro(context, ...a.falha);
      return resposta(context, await db.fazerCheckin(a.pool, { sala: a.sala, operadorId: sessao.membroId, dados: v, hoje }), 201);
    }
    // Registro (e não sala) na entrada: quem não tem relação com a sala dele (nem a gestão da congregação) recebe a MESMA resposta de "registro que não existe" (e2e-20).
    async function registroAcessivel(pool, registroId) {
      const rs = await db.registroComSala(pool, registroId);
      if (!rs.sucesso) return rs;
      const gestaoDaCongregacao = gestao && gestorPodeVer(rs.sala.congregacaoNome);
      if (!gestaoDaCongregacao && !(await db.relacionadoComASala(pool, rs.sala, sessao.membroId))) return { sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA };
      return rs;
    }
    if (acao === "retirar") {
      const v = ck.validarRetirada(corpo);
      if (!v.valido) return erro(context, 422, v.mensagem);
      const pool = await getPool();
      const rs = await registroAcessivel(pool, v.registroId);
      if (!rs.sucesso) return resposta(context, rs);
      return resposta(context, await db.retirar(pool, { sala: rs.sala, registroId: v.registroId, operadorId: sessao.membroId, dados: v, hoje }));
    }
    if (acao === "segunda-via-pedir") {
      const v = ck.validarPedidoSegundaVia(corpo);
      if (!v.valido) return erro(context, 422, v.mensagem);
      const pool = await getPool();
      const rs = await registroAcessivel(pool, v.registroId);
      if (!rs.sucesso) return resposta(context, rs);
      return resposta(context, await db.pedirSegundaVia(pool, { sala: rs.sala, operadorId: sessao.membroId, dados: v, hoje }), 201);
    }
    if (acao === "segunda-via-confirmar") {
      const registroId = idDe(corpo.registroId);
      if (!registroId) return erro(context, 400, "Informe registroId.");
      const pool = await getPool();
      const rs = await registroAcessivel(pool, registroId);
      if (!rs.sucesso) return resposta(context, rs);
      return resposta(context, await db.confirmarSegundaVia(pool, { sala: rs.sala, operadorId: sessao.membroId, registroId, hoje }));
    }

    // =============================== Liderança da congregação ===============================
    if (acao === "encerrar-sala") {
      if (!gestao) return erro(context, 403, SEM_PERMISSAO);
      const v = ck.validarEncerramentoSala(corpo);
      if (!v.valido) return erro(context, 422, v.mensagem);
      // sala que não existe e sala fora do escopo: a mesma resposta (404); equipe sem a marca também se encerra (a criança que ficou lá dentro precisa de baixa)
      const a = await abrirSala(corpo, "gestor", { exigirMarca: false });
      if (a.falha) return erro(context, ...a.falha);
      // Dar baixa em criança sem a retirada registrada é ato de peso: a confirmação reforçada da vD.4 (chave de acesso ou código por e-mail, até 10 minutos).
      if (!auth.exigirFatorRecente(req, context)) return;
      return resposta(context, await db.encerrarSala(a.pool, { sala: a.sala, gestorId: sessao.membroId, motivo: v.motivo }));
    }
    if (acao === "decidir-divergencia" || acao === "destravar") {
      if (!gestao) return erro(context, 403, SEM_PERMISSAO);
      const v = acao === "destravar" ? { valido: !!idDe(corpo.registroId), registroId: idDe(corpo.registroId), mensagem: "Informe registroId." } : ck.validarDecisaoDivergencia(corpo);
      if (!v.valido) return erro(context, acao === "destravar" ? 400 : 422, v.mensagem);
      const pool = await getPool();
      const rs = await db.registroComSala(pool, v.registroId);
      // registro que não existe e registro de congregação fora do escopo: a mesma resposta
      if (!rs.sucesso || !gestorPodeVer(rs.sala.congregacaoNome)) return erro(context, 404, ck.MENSAGENS.CRIANCA_NAO_ACHADA);
      // Liberar uma criança a quem não está na lista é ato de peso: a confirmação reforçada da vD.4 (chave de acesso ou código por e-mail, até 10 minutos).
      if (acao === "decidir-divergencia" && !auth.exigirFatorRecente(req, context)) return;
      if (acao === "destravar") return resposta(context, await db.destravar(pool, { sala: rs.sala, registroId: v.registroId, gestorId: sessao.membroId }));
      return resposta(context, await db.decidirDivergencia(pool, { sala: rs.sala, registroId: v.registroId, gestorId: sessao.membroId, aprovar: v.aprovar, motivo: v.motivo }));
    }

    return erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoCheckinInfantil] erro:", e);
    erro(context, 500, "Erro interno ao processar o check-in infantil.");
  }
};
