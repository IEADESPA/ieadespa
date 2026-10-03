// GestaoCalendario (v7.2 — Calendário Oficial e Agenda Unificada, Regimento Art. 79, 81, 147, 154 e 154-A)
//
// Toda a regra (precedência por nível, conflito territorial, Direito Adquirido
// Temporal, trava de Área, Esgotamento de Pauta, antecedência de 48 h) está em
// shared/calendario.js (pura, testada); o banco e as decisões, em
// shared/calendarioDb.js. Este arquivo só expõe HTTP + permissão + escopo.
//
// Três permissões (migração 114), nunca concedidas a papel nenhum por padrão:
//   "calendario_proposta"     líderes gerais, supervisores de Área, dirigentes e coordenadores
//                             PROPÕEM datas dentro do próprio escopo (eventos de Nível 2 a 5);
//   "calendario_secretaria"   Secretaria Geral: gera o ciclo mensal, CONSOLIDA o ano (aplica a
//                             Tabela de Hierarquia), defere/indefere, propõe Nível 1 e registra a
//                             presença do dirigente na Ceia Geral;
//   "calendario_homologacao"  CLI: HOMOLOGA o ano, mexe na agenda litúrgica (Art. 79, parágrafo
//                             único) e no catálogo de tipos, e decide em caráter excepcional.
//                             Vale para o campo todo, então exige escopo GLOBAL.
// Qualquer login lê a agenda (oficial + liturgia).
//
// GET  /api/calendario/agenda?de=&ate=&congregacaoId=&camadas=OFICIAL,LITURGIA,SESSAO   -> agenda unificada (login)
// GET  /api/calendario/referencias                   -> { escopoGlobal, congregacoes[{id,nome,areaId,sede,noMeuEscopo}], areas[{id,nome}] } (login)
// GET  /api/calendario/tipos[?todos=1]               -> catálogo de tipos de evento (com nível, onde pode acontecer, regras)
// GET  /api/calendario/anos                          -> anos do calendário com a contagem por situação
// GET  /api/calendario/eventos?ano=&status=&nivel=&meus=1&congregacaoId=   -> pauta (o que o usuário pode ver)
// GET  /api/calendario/evento?eventoId=              -> um evento, com o choque atual e as ações que cabem ao usuário
// GET  /api/calendario/liturgia[?todas=1]            -> agenda litúrgica oficial (regras) + como o site a mostra
// GET  /api/calendario/presencas-dirigente?eventoId= -> Ceia Geral: situação do dirigente de cada congregação (secretaria/CLI)
// GET  /api/calendario/site-status                   -> versão publicada no site x versão do sistema (secretaria/CLI)
// POST /api/calendario/anos/abrir                    body:{ano}                       — secretaria
// POST /api/calendario/anos/gerar-ciclo              body:{ano}                       — secretaria (Ceia, CLI, NIF, CEI)
// POST /api/calendario/anos/consolidar               body:{ano}                       — secretaria
//        -> { deferidos, indeferidos (quantidade), mantidos, analisados, listaIndeferidos[{eventoId,titulo}] }
// POST /api/calendario/anos/homologar                body:{ano, ata}                  — CLI (global)
// POST /api/calendario/eventos/verificar             body:{evento}  -> o que aconteceria, sem gravar (propostas)
// POST /api/calendario/eventos                       body:{tipoId, titulo, dataInicio, ... , remarcacaoDeEventoId?}  — propostas
// POST /api/calendario/eventos/atualizar             body:{eventoId, titulo?, descricao?, local?, slugSite?, publicoNoSite?}
// POST /api/calendario/eventos/cancelar              body:{eventoId, motivo}          — quem propôs ou a secretaria
// POST /api/calendario/eventos/deferir               body:{eventoId}                  — secretaria
// POST /api/calendario/eventos/indeferir             body:{eventoId, motivo}          — secretaria
// POST /api/calendario/eventos/absorver              body:{eventoId, motivo, resolucao}   — CLI (global)
// POST /api/calendario/presencas-dirigente           body:{eventoId, congregacaoId, situacao, justificativa?}  — secretaria
// POST /api/calendario/liturgia/regra                body:{dia, escopo, ocorrencia?, titulo, horaInicio?, tipo?, departamentoSigla?, resolucao}   — CLI (global)
// POST /api/calendario/liturgia/regra/atualizar      body:{regraId, ativo?, resolucao, ...campos}  — CLI (global)
// POST /api/calendario/tipos                         body:{codigo, nome, nivel, abrangenciasPermitidas, ...}   — CLI (global)
// POST /api/calendario/tipos/atualizar               body:{tipoId, nome, nivel, ..., ativo?}                   — CLI (global)
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const cal = require("../shared/calendario");
const db = require("../shared/calendarioDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

function resposta(context, resultado, statusOk = 200) {
  context.res = { status: resultado.sucesso ? statusOk : 422, body: resultado };
}

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const perms = usuario.permissoes || [];
  const ehSecretaria = perms.includes("calendario_secretaria");
  const ehHomologacao = perms.includes("calendario_homologacao");
  const ehProposta = perms.includes("calendario_proposta");
  const temAlgum = ehSecretaria || ehHomologacao || ehProposta;
  // v7.6 — escopo das permissões do CALENDÁRIO (só as concessões que têm alguma delas), não o somado de outro cargo ou delegação; a homologação, que exige
  // o campo todo, olha só as concessões de "calendario_homologacao".
  const escopoDe = (v) => (!v.escopoCongregacoes || v.escopoCongregacoes === "TODAS") ? "TODAS" : v.escopoCongregacoes;
  const vCalendario = auth.visaoDaPermissao(usuario, ["calendario_secretaria", "calendario_homologacao", "calendario_proposta"]) || usuario;
  const vHomologacao = auth.visaoDaPermissao(usuario, "calendario_homologacao");
  const escopo = escopoDe(vCalendario);
  const escopoGlobal = escopo === "TODAS";
  const homologacaoGlobal = !!vHomologacao && escopoDe(vHomologacao) === "TODAS";

  const acao = context.bindingData.acao || "";
  const metodo = req.method;
  const q = req.query || {};
  const corpo = req.body || {};
  const hoje = hojeBrasilia();

  const pool = await getPool();
  const ctx = await db.carregarContextoTerritorial(pool);

  function exigirSecretaria() {
    if (!ehSecretaria) { erro(context, 403, SEM_PERMISSAO); return false; }
    return true;
  }
  function exigirHomologacaoGlobal() {
    if (!ehHomologacao) { erro(context, 403, SEM_PERMISSAO); return false; }
    if (!homologacaoGlobal) { erro(context, 403, "Esta decisão vale para o campo todo — exige escopo global."); return false; }
    return true;
  }
  function exigirAlgumaPermissao() {
    if (!temAlgum) { erro(context, 403, SEM_PERMISSAO); return false; }
    return true;
  }
  const eventoNoEscopo = (e) => cal.escopoCobreEvento(escopo, e, ctx).ok;
  const adminCalendario = ehSecretaria || ehHomologacao;
  const podeAgirNoEvento = (e) => adminCalendario || (ehProposta && e.propostoPorMembroId === usuario.membroId);
  function visivel(e) {
    if (adminCalendario || e.status === "HOMOLOGADO") return true;
    if (!ehProposta) return false;
    return e.propostoPorMembroId === usuario.membroId || eventoNoEscopo(e);
  }

  async function eventoDoCorpo(origem) {
    const eventoId = Number(origem.eventoId);
    if (!eventoId) { erro(context, 400, "Informe eventoId."); return null; }
    const evento = await db.buscarEvento(pool, eventoId, ctx);
    if (!evento) { erro(context, 404, "Evento não encontrado."); return null; }
    return evento;
  }

  function anoDoCorpo() {
    const v = db.validarAnoCalendario(corpo.ano, hoje);
    if (!v.valido) { erro(context, 400, v.mensagem); return null; }
    return v.ano;
  }

  // Valida a proposta do corpo e confere permissão por nível e escopo. Devolve { tipo, dados } ou null (já respondeu).
  async function proposta(corpoProposta) {
    const tipo = await db.buscarTipo(pool, corpoProposta.tipoId);
    if (!tipo) { erro(context, 400, "Tipo de evento não encontrado."); return null; }
    if (!cal.podeProporNivel(perms, tipo.nivel)) {
      erro(context, 403, tipo.nivel === 1 ? "Eventos de Nível 1 (estratégico-institucional) são da Secretaria Geral e da CLI." : SEM_PERMISSAO);
      return null;
    }
    const v = cal.validarProposta(corpoProposta, { tipo, hoje, agoraMs: Date.now() });
    if (!v.valido) { erro(context, 400, v.mensagem); return null; }
    const d = v.dados;
    if (d.abrangencia === "CONGREGACAO") {
      const c = ctx.congregacoes.get(d.congregacaoId);
      if (!c || !c.ativa) { erro(context, 404, "Congregação não encontrada."); return null; }
    }
    if (d.abrangencia === "AREAS" && d.areaIds.some(a => !ctx.areas.has(a))) { erro(context, 404, "Área não encontrada."); return null; }
    const cobre = cal.escopoCobreEvento(escopo, d, ctx);
    if (!cobre.ok) { erro(context, 403, cobre.mensagem); return null; }
    return { tipo, dados: d };
  }

  try {
    // ================= Leitura =================
    if (metodo === "GET") {
      if (acao === "agenda") {
        const de = q.de || hoje;
        const ate = q.ate || cal.somarDias(de, 59);
        let camadas = q.camadas ? String(q.camadas).toUpperCase().split(",").map(s => s.trim()).filter(Boolean) : null;
        if (camadas && camadas.some(c => !["OFICIAL", "LITURGIA", "SESSAO"].includes(c))) return erro(context, 400, "Camada inválida — use OFICIAL, LITURGIA e/ou SESSAO.");
        const resultado = await db.montarAgenda(pool, {
          de, ate, congregacaoId: q.congregacaoId ? Number(q.congregacaoId) : null, camadas, ctx,
          veTudo: temAlgum, veSessoes: perms.some(p => ["reunioes", "assembleia", "cli"].includes(p))
        });
        return resposta(context, resultado);
      }

      // Nomes de congregações e Áreas (informação pública) para os seletores das telas.
      if (acao === "referencias") {
        const congregacoes = [...ctx.congregacoes.values()].filter(c => c.ativa)
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }))
          .map(c => ({ id: c.id, nome: c.nomePublico, areaId: c.areaId, sede: c.slug === "sede", noMeuEscopo: escopoGlobal || escopo.includes(c.nome) }));
        const areas = [...ctx.areas.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
        context.res = { status: 200, body: { sucesso: true, escopoGlobal, congregacoes, areas } };
        return;
      }

      if (acao === "tipos") {
        if (!exigirAlgumaPermissao()) return;
        context.res = { status: 200, body: { sucesso: true, tipos: await db.listarTipos(pool, { incluirInativos: q.todos === "1" && ehHomologacao }) } };
        return;
      }

      if (acao === "anos") {
        if (!exigirAlgumaPermissao()) return;
        context.res = { status: 200, body: { sucesso: true, hoje, anos: await db.listarAnos(pool, { hoje }) } };
        return;
      }

      if (acao === "eventos") {
        if (!exigirAlgumaPermissao()) return;
        const ano = q.ano ? Number(q.ano) : null;
        if (q.ano && (!Number.isInteger(ano) || ano < 2000 || ano > 2200)) return erro(context, 400, "Ano inválido.");
        const status = q.status ? String(q.status).toUpperCase().split(",").filter(s => cal.STATUS_EVENTO.includes(s)) : null;
        const eventos = await db.carregarEventos(pool, {
          ano, status, nivel: q.nivel ? Number(q.nivel) : null, propostoPor: q.meus === "1" ? usuario.membroId : null,
          congregacaoId: q.congregacaoId ? Number(q.congregacaoId) : null, limite: db.LIMITE_LISTA + 1
        }, ctx);
        const visiveis = eventos.filter(visivel);
        context.res = { status: 200, body: { sucesso: true, eventos: visiveis.slice(0, db.LIMITE_LISTA), truncado: visiveis.length > db.LIMITE_LISTA } };
        return;
      }

      if (acao === "evento") {
        const eventoId = Number(q.eventoId);
        if (!eventoId) return erro(context, 400, "Informe eventoId.");
        const evento = await db.buscarEvento(pool, eventoId, ctx);
        if (!evento) return erro(context, 404, "Evento não encontrado.");
        if (!visivel(evento)) return erro(context, 403, SEM_PERMISSAO);
        let conflitos = [];
        if (temAlgum && ["PROPOSTO", "DEFERIDO"].includes(evento.status)) {
          const pauta = await db.carregarPautaAtiva(pool, evento, ctx);
          const aval = cal.avaliarProposta(evento, pauta, ctx, { tardia: evento.tardia && !evento.remarcacaoDeEventoId });
          conflitos = aval.conflitos.map(c => ({ eventoId: c.evento.id, titulo: c.evento.titulo, nivel: c.evento.nivel, status: c.evento.status, dataInicio: c.evento.dataInicio, motivoConflito: c.motivoConflito }));
        }
        let prevalecidoPor = null;
        if (evento.prevalecidoPorEventoId) {
          const p = await db.buscarEvento(pool, evento.prevalecidoPorEventoId, ctx);
          if (p && (adminCalendario || p.status === "HOMOLOGADO")) prevalecidoPor = { eventoId: p.id, titulo: p.titulo, nivel: p.nivel, dataInicio: p.dataInicio, dataFim: p.dataFim, status: p.status };
        }
        const meu = podeAgirNoEvento(evento);
        const vivo = ["PROPOSTO", "DEFERIDO", "HOMOLOGADO"].includes(evento.status);
        context.res = {
          status: 200,
          body: {
            sucesso: true, evento: adminCalendario || evento.propostoPorMembroId === usuario.membroId ? evento : { ...evento, propostoPorNome: null, propostoPorMembroId: null },
            conflitos, prevalecidoPor,
            acoes: {
              editar: meu && vivo,
              cancelar: meu && vivo && (evento.origem !== "REGRA" || ehSecretaria),
              deferir: ehSecretaria && evento.status === "PROPOSTO",
              indeferir: ehSecretaria && ["PROPOSTO", "DEFERIDO"].includes(evento.status),
              absorver: ehHomologacao && homologacaoGlobal &&["DEFERIDO", "HOMOLOGADO"].includes(evento.status),
              remarcar: meu && (evento.status === "ABSORVIDO" || (evento.status === "INDEFERIDO" && evento.motivoIndeferimento !== "ESGOTAMENTO_PAUTA")),
              registrarPresenca: ehSecretaria && evento.tipo.registraPresencaDirigente && ["DEFERIDO", "HOMOLOGADO"].includes(evento.status)
            }
          }
        };
        return;
      }

      if (acao === "liturgia") {
        const regras = await db.listarRegrasLiturgicas(pool, { incluirInativas: q.todas === "1" && ehHomologacao });
        context.res = { status: 200, body: { sucesso: true, regras, paraSite: cal.liturgiaParaSite(regras.filter(r => r.ativo)) } };
        return;
      }

      if (acao === "presencas-dirigente") {
        if (!adminCalendario) return erro(context, 403, SEM_PERMISSAO);
        const evento = await eventoDoCorpo(q);
        if (!evento) return;
        if (!evento.tipo.registraPresencaDirigente) return erro(context, 422, "Este tipo de evento não registra presença de dirigente.");
        context.res = { status: 200, body: { sucesso: true, ...(await db.listarPresencasDirigente(pool, evento, ctx)) } };
        return;
      }

      if (acao === "site-status") {
        if (!adminCalendario) return erro(context, 403, SEM_PERMISSAO);
        context.res = { status: 200, body: { sucesso: true, ...(await db.statusSincronizacaoSite(pool, ctx)) } };
        return;
      }

      return erro(context, 404, "Ação inválida.");
    }

    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");

    // ================= Ano do calendário =================
    if (acao === "anos/abrir") {
      if (!exigirSecretaria()) return;
      const ano = anoDoCorpo(); if (!ano) return;
      const jaExiste = await db.lerAno(pool, ano);
      const row = await db.garantirAno(pool, ano, usuario.membroId);
      return resposta(context, { sucesso: true, mensagem: jaExiste ? `O calendário ${ano} já estava aberto.` : `Calendário ${ano} aberto: propostas até ${cal.formatarDataBr(row.prazoPropostas)}.`, ano: row });
    }

    if (acao === "anos/gerar-ciclo") {
      if (!exigirSecretaria()) return;
      const ano = anoDoCorpo(); if (!ano) return;
      return resposta(context, await db.gerarCicloDoAno(pool, { ano, membroId: usuario.membroId, ctx, hoje }));
    }

    if (acao === "anos/consolidar") {
      if (!exigirSecretaria()) return;
      const ano = anoDoCorpo(); if (!ano) return;
      return resposta(context, await db.consolidarAno(pool, { ano, membroId: usuario.membroId, ctx }));
    }

    if (acao === "anos/homologar") {
      if (!exigirHomologacaoGlobal()) return;
      const ano = anoDoCorpo(); if (!ano) return;
      return resposta(context, await db.homologarAno(pool, { ano, ata: corpo.ata, membroId: usuario.membroId }));
    }

    // ================= Eventos =================
    if (acao === "eventos/verificar") {
      if (!exigirAlgumaPermissao()) return;
      const p = await proposta(corpo.evento || corpo); if (!p) return;
      context.res = { status: 200, body: { sucesso: true, ...(await db.verificarProposta(pool, { dados: p.dados, tipo: p.tipo, ctx, hoje })) } };
      return;
    }

    if (acao === "eventos") {
      if (!exigirAlgumaPermissao()) return;
      const p = await proposta(corpo); if (!p) return;
      let remarcacaoDe = null;
      if (corpo.remarcacaoDeEventoId) {
        remarcacaoDe = await db.buscarEvento(pool, Number(corpo.remarcacaoDeEventoId), ctx);
        if (!remarcacaoDe) return erro(context, 404, "O evento a remarcar não foi encontrado.");
        if (!podeAgirNoEvento(remarcacaoDe)) return erro(context, 403, SEM_PERMISSAO);
      }
      return resposta(context, await db.propor(pool, { dados: p.dados, tipo: p.tipo, ctx, membroId: usuario.membroId, remarcacaoDe, hoje }), 201);
    }

    if (acao === "eventos/atualizar") {
      if (!exigirAlgumaPermissao()) return;
      const evento = await eventoDoCorpo(corpo); if (!evento) return;
      if (!podeAgirNoEvento(evento)) return erro(context, 403, SEM_PERMISSAO);
      return resposta(context, await db.atualizarDescritivo(pool, {
        evento, titulo: corpo.titulo, descricao: corpo.descricao, local: corpo.local, slugSite: corpo.slugSite, publicoNoSite: corpo.publicoNoSite, membroId: usuario.membroId
      }));
    }

    if (acao === "eventos/cancelar") {
      if (!exigirAlgumaPermissao()) return;
      const evento = await eventoDoCorpo(corpo); if (!evento) return;
      if (!podeAgirNoEvento(evento)) return erro(context, 403, SEM_PERMISSAO);
      if (evento.origem === "REGRA" && !ehSecretaria) return erro(context, 403, "Os eventos do ciclo mensal só a Secretaria cancela.");
      return resposta(context, await db.cancelarEvento(pool, { evento, motivo: corpo.motivo, membroId: usuario.membroId }));
    }

    if (acao === "eventos/deferir") {
      if (!exigirSecretaria()) return;
      const evento = await eventoDoCorpo(corpo); if (!evento) return;
      return resposta(context, await db.deferirEvento(pool, { evento, membroId: usuario.membroId, ctx }));
    }

    if (acao === "eventos/indeferir") {
      if (!exigirSecretaria()) return;
      const evento = await eventoDoCorpo(corpo); if (!evento) return;
      return resposta(context, await db.indeferirEvento(pool, { evento, motivo: corpo.motivo, membroId: usuario.membroId }));
    }

    if (acao === "eventos/absorver") {
      if (!exigirHomologacaoGlobal()) return;
      const evento = await eventoDoCorpo(corpo); if (!evento) return;
      return resposta(context, await db.absorverPorDecisaoDaCli(pool, { evento, motivo: corpo.motivo, resolucao: corpo.resolucao, membroId: usuario.membroId }));
    }

    if (acao === "presencas-dirigente") {
      if (!exigirSecretaria()) return;
      const evento = await eventoDoCorpo(corpo); if (!evento) return;
      return resposta(context, await db.registrarPresencaDirigente(pool, {
        evento, congregacaoId: corpo.congregacaoId, situacao: String(corpo.situacao || "").toUpperCase(), justificativa: corpo.justificativa, membroId: usuario.membroId, ctx, hoje
      }));
    }

    // ================= Agenda litúrgica e tipos (CLI) =================
    if (acao === "liturgia/regra") {
      if (!exigirHomologacaoGlobal()) return;
      const v = cal.validarRegraLiturgica(corpo);
      if (!v.valido) return erro(context, 400, v.mensagem);
      return resposta(context, await db.criarRegraLiturgica(pool, { dados: v.dados, resolucao: corpo.resolucao, membroId: usuario.membroId }), 201);
    }

    if (acao === "liturgia/regra/atualizar") {
      if (!exigirHomologacaoGlobal()) return;
      const regraId = Number(corpo.regraId);
      if (!regraId) return erro(context, 400, "Informe regraId.");
      let dados = null;
      if (corpo.titulo !== undefined || corpo.dia !== undefined) {
        const v = cal.validarRegraLiturgica(corpo);
        if (!v.valido) return erro(context, 400, v.mensagem);
        dados = v.dados;
      }
      if (corpo.ativo != null && typeof corpo.ativo !== "boolean") return erro(context, 400, "O campo ativo deve ser verdadeiro ou falso.");
      return resposta(context, await db.atualizarRegraLiturgica(pool, { regraId, dados, ativo: corpo.ativo, resolucao: corpo.resolucao, membroId: usuario.membroId }));
    }

    if (acao === "tipos") {
      if (!exigirHomologacaoGlobal()) return;
      const v = cal.validarTipo(corpo, { criando: true });
      if (!v.valido) return erro(context, 400, v.mensagem);
      return resposta(context, await db.criarTipo(pool, { dados: v.dados, membroId: usuario.membroId }), 201);
    }

    if (acao === "tipos/atualizar") {
      if (!exigirHomologacaoGlobal()) return;
      const tipoId = Number(corpo.tipoId);
      if (!tipoId) return erro(context, 400, "Informe tipoId.");
      const v = cal.validarTipo(corpo);
      if (!v.valido) return erro(context, 400, v.mensagem);
      if (corpo.ativo != null && typeof corpo.ativo !== "boolean") return erro(context, 400, "O campo ativo deve ser verdadeiro ou falso.");
      return resposta(context, await db.atualizarTipo(pool, { tipoId, dados: v.dados, ativo: corpo.ativo, membroId: usuario.membroId }));
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoCalendario] erro:", e);
    erro(context, 500, "Erro interno ao processar o calendário.");
  }
};
