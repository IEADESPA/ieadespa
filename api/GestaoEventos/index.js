// GestaoEventos (v7.4 — Eventos e Congressos: governança do evento)
// Regimento Art. 53-E §2º e §3º (Caixa Flutuante de Eventos), Art. 111 e 111-A (Protocolo de Convidados), Art. 152.
//
// O evento é do CALENDÁRIO (v7.2, /api/calendario). O SITE continua dono da inscrição, lista de espera, check-in,
// certificado e programação do evento com página — este sistema não duplica isso. Aqui ficam os organizadores do
// evento, os convidados externos (com o parecer do Conselho de Ética e o Nada Consta da Presidência) e o Caixa
// Flutuante (arrecadação, custeio e a destinação obrigatória do superávit).
// Toda a regra está em shared/eventos.js (pura, testada); o banco, em shared/eventosDb.js.
//
// Permissões (migração 116), nunca concedidas a papel nenhum por padrão:
//   "eventos_gestao"       Secretaria Geral: painel de eventos, designa organizadores, registra convidados em qualquer evento do escopo;
//   "eventos_etica"        Conselho de Ética: parecer sobre convidado de reputação desconhecida (escopo GLOBAL);
//   "eventos_presidencia"  Presidência: Nada Consta dos convidados dos eventos gerais (escopo GLOBAL);
//   "financeiro" (já existe) com escopo global: Tesouraria Geral confere ou devolve o caixa encerrado.
// Quem NÃO tem permissão nenhuma mas organiza um evento (proponente do calendário ou designado) age no que é dele:
//   RESPONSAVEL (tudo; o proponente é responsável implícito), ORGANIZADOR (convidados), TESOUREIRO (caixa).
// Segregação: quem convidou, enviou ou organiza o evento NÃO decide sobre o próprio convidado; quem encerrou o caixa NÃO o confere.
//
// ---- Leitura (GET /api/eventos-gestao/...) -------------------------------------------------------
//  catalogos      -> { papeis[{codigo,rotulo}], tiposConvidado[], statusConvidado[], categoriasEntrada[], categoriasSaida[], destinosSuperavit[],
//                      statusCaixa[], regras:{ antecedenciaEticaDias, nivelMaximoNadaConsta, prazoCaixaDias } }                          (login)
//  meus           -> { eventos[{...resumo, papeis[], rotuloPapeis[], convidados:{total,rascunho,emAnalise,autorizados,vetados,cancelados},
//                      caixa:{status,rotuloStatus,fase,atrasado,prazoEncerramentoEm}|null, podeCaixa}] }                                 (login)
//  painel[?ano=]  -> { ano, resumo:{eventos,congressos,convidadosEmAnalise,caixasAbertos,caixasForaDoPrazo,caixasParaConferir,semOrganizador},
//                      eventos[{...resumo, organizadores, convidados, caixa, atencao[]}] }                                               (eventos_gestao)
//  evento?eventoId= -> { evento:{eventoId,titulo,dataInicio,dataFim,horaInicio,local,tipoCodigo,tipoNome,nivel,rotuloNivel,abrangencia,
//                      congregacaoNome,areaNomes[],status,slugSite,publicoNoSite,congresso}, meusPapeis[], organizadores[], convidados[], caixa|null,
//                      regras:{ exigeNadaConsta, antecedenciaEticaDias, prazoParecerEtica, caixaDisponivel, motivoSemCaixa },
//                      acoes:{ designarOrganizador, registrarConvidado, abrirCaixa, lancarNoCaixa, encerrarCaixa, conferirCaixa, devolverCaixa } }
//                      (gestão no escopo, organizador do evento, Conselho de Ética ou Presidência — o contato do convidado só a organização, a gestão e quem analisa)
//  fila           -> { ehEtica, ehPresidencia, etica[{...convidado, evento:{...}, diasAteEvento, urgente}], presidencia[...] }            (eventos_etica ou eventos_presidencia)
//  caixa?eventoId= -> { caixa:{eventoId,status,rotuloStatus,ciclo,prazoEncerramentoEm,fase,atrasado,diasAtraso,totais:{entradas,saidas,saldo},
//                      lancamentos[],destinos[],encerradoPorMembroId,...}, acoes }                                                       (organização, gestão ou financeiro global)
//  caixas[?status=ABERTO|ENCERRADO|CONFERIDO] -> { caixas[{evento:{...}, caixa:{...}}] }                                                 (financeiro global ou eventos_gestao)
//
// ---- Escrita (POST /api/eventos-gestao/...) ------------------------------------------------------
//  organizadores/designar   body:{eventoId, membroId, papel:RESPONSAVEL|ORGANIZADOR|TESOUREIRO}                (gestão ou responsável do evento)
//  organizadores/encerrar   body:{organizadorId, motivo}                                                       (gestão ou responsável do evento)
//  convidados               body:{eventoId, nome, tipo, ministerioOrigem?, contato?, reputacaoConhecida:true|false, observacaoOrganizador?, divulgacaoAutorizada?}  -> 201 rascunho
//  convidados/atualizar     body:{convidadoId, ...campos}   só rascunho
//  convidados/submeter      body:{convidadoId}   rascunho -> em análise (ou direto AUTORIZADO se nada é exigido); recusa se faltam menos de 10 dias e o parecer de Ética é exigido
//  convidados/parecer-etica body:{convidadoId, parecer:FAVORAVEL|DESFAVORAVEL, motivo?}                       (eventos_etica, global)
//  convidados/nada-consta   body:{convidadoId, decisao:CONCEDIDO|NEGADO, motivo?}                             (eventos_presidencia, global)
//  convidados/oficializar   body:{convidadoId}   só AUTORIZADO; só então o nome pode ir ao site (se o convidado autorizou)
//  convidados/cancelar      body:{convidadoId, motivo}
//  caixa/abrir              body:{eventoId, declaracaoSemContaParalela:true}  só evento de Área/Região/Geral, deferido ou homologado        (tesoureiro/responsável)
//  caixa/lancar             body:{eventoId, tipo:ENTRADA|SAIDA, categoria, valor, dataLancamento?, descricao, comprovante?}  saída exige comprovante
//  caixa/cancelar-lancamento body:{lancamentoId, motivo}
//  caixa/encerrar           body:{eventoId, destinos:[{tipo:RECOLHIDO_SEDE|BENFEITORIA, valor, data?, comprovante, descricao?}], justificativaDeficit?}
//                           superávit: os destinos somam EXATAMENTE o saldo; déficit: justificativa obrigatória
//  caixa/conferir           body:{eventoId, observacao?}   (financeiro global; não pode ser quem encerrou)
//  caixa/devolver           body:{eventoId, motivo}        (financeiro global) volta a ABERTO para correção
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim · 403 sem permissão · 404 não achou.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const canaisDb = require("../shared/canaisDb");
const cal = require("../shared/calendario");
const calDb = require("../shared/calendarioDb");
const ev = require("../shared/eventos");
const db = require("../shared/eventosDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) { context.res = { status: resultado.sucesso ? statusOk : 422, body: resultado }; }
const lista = (obj) => Object.entries(obj).map(([codigo, rotulo]) => ({ codigo, rotulo }));
const idDe = auth.idDeRota; // só inteiro positivo na forma canônica ("0x10", "1e1", " 5", "05" e objetos viram null → 400/404, nunca outro registro)

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const perms = usuario.permissoes || [];
  const ehGestao = perms.includes("eventos_gestao");
  // Revisão de escopo: FECHADO — sessão sem a lista de congregações (claim ausente) não é global e não alcança nada.
  // v7.6 — cada papel do evento com o escopo DA SUA permissão (só as concessões que a têm): o escopo de gestão é o de "eventos_gestao"; ética, presidência
  // e tesouraria exigem o campo todo na própria permissão. Quem não tem "eventos_gestao" usa a sessão inteira (só para a tela).
  const escopoTodas = (chave) => { const v = auth.visaoDaPermissao(usuario, chave); return !!v && v.escopoCongregacoes === "TODAS"; };
  const vGestao = auth.visaoDaPermissao(usuario, "eventos_gestao") || usuario;
  const escopoGlobal = vGestao.escopoCongregacoes === "TODAS";
  const escopo = escopoGlobal ? "TODAS" : (Array.isArray(vGestao.escopoCongregacoes) ? vGestao.escopoCongregacoes : []);
  const ehEtica = escopoTodas("eventos_etica");
  const ehPresidencia = escopoTodas("eventos_presidencia");
  const ehTesouraria = escopoTodas("financeiro");
  const membroId = usuario.membroId || null;

  const acao = context.bindingData.acao || "";
  const metodo = req.method;
  const q = req.query || {};
  const corpo = req.body || {};
  const hoje = hojeBrasilia();

  const pool = await getPool();
  const ctxCal = await calDb.carregarContextoTerritorial(pool);

  // Evento + o que ESTA pessoa é nele. Devolve null (já respondeu) se o evento não existe.
  async function contexto(origem) {
    const eventoId = idDe(origem.eventoId);
    if (!eventoId) { erro(context, 400, "Informe o eventoId."); return null; }
    const evento = await calDb.buscarEvento(pool, eventoId, ctxCal);
    if (!evento) { erro(context, 404, "Evento não encontrado."); return null; }
    const p = await db.papeisNoEvento(pool, evento, membroId);
    const gestao = ehGestao && cal.escopoCobreEvento(escopo, evento, ctxCal).ok;
    return { evento, p, gestao };
  }
  const podeVer = (c) => c.gestao || c.p.algum || ehEtica || ehPresidencia;
  const podeConvidados = (c) => c.gestao || c.p.organizador;
  const podeDesignar = (c) => c.gestao || c.p.responsavel;

  async function convidadoDoCorpo(origem) {
    const id = idDe(origem.convidadoId);
    if (!id) { erro(context, 400, "Informe o convidadoId."); return null; }
    const bruto = await db.buscarConvidadoBruto(pool, id);
    if (!bruto) { erro(context, 404, "Convidado não encontrado."); return null; }
    const c = await contexto({ eventoId: bruto.EventoId });
    return c ? { bruto, c } : null;
  }

  function acoesDoEvento(c, caixa) {
    const planejavel = ev.STATUS_EVENTO_PLANEJAVEL.includes(c.evento.status);
    const avCaixa = ev.avaliarAberturaDeCaixa(c.evento, true);
    return {
      designarOrganizador: podeDesignar(c) && planejavel,
      registrarConvidado: podeConvidados(c) && planejavel,
      abrirCaixa: c.p.tesoureiro && !caixa && avCaixa.ok,
      lancarNoCaixa: c.p.tesoureiro && !!caixa && caixa.status === "ABERTO",
      encerrarCaixa: c.p.tesoureiro && !!caixa && caixa.status === "ABERTO",
      conferirCaixa: ehTesouraria && !!caixa && caixa.status === "ENCERRADO" && caixa.encerradoPorMembroId !== membroId && !c.p.algum,
      devolverCaixa: ehTesouraria && !!caixa && caixa.status === "ENCERRADO"
    };
  }

  try {
    // ================= Leitura =================
    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = { status: 200, body: {
          sucesso: true, papeis: lista(ev.PAPEIS_ORGANIZADOR), tiposConvidado: lista(ev.TIPOS_CONVIDADO), statusConvidado: lista(ev.STATUS_CONVIDADO),
          categoriasEntrada: lista(ev.CATEGORIAS_ENTRADA), categoriasSaida: lista(ev.CATEGORIAS_SAIDA), destinosSuperavit: lista(ev.DESTINOS_SUPERAVIT), statusCaixa: lista(ev.STATUS_CAIXA),
          regras: { antecedenciaEticaDias: ev.ANTECEDENCIA_ETICA_DIAS, nivelMaximoNadaConsta: ev.NIVEL_MAXIMO_NADA_CONSTA, prazoCaixaDias: ev.PRAZO_CAIXA_DIAS }
        } };
        return;
      }
      if (acao === "meus") {
        context.res = { status: 200, body: { sucesso: true, eventos: membroId ? await db.meusEventos(pool, ctxCal, membroId, { hoje }) : [] } };
        return;
      }
      if (acao === "painel") {
        if (!ehGestao) { erro(context, 403, SEM_PERMISSAO); return; }
        const ano = q.ano ? Number(q.ano) : Number(hoje.slice(0, 4));
        if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) { erro(context, 400, "Ano inválido."); return; }
        const painel = await db.painelDoAno(pool, ctxCal, ano, { hoje, filtrarEvento: (e) => cal.escopoCobreEvento(escopo, e, ctxCal).ok });
        context.res = { status: 200, body: { sucesso: true, ...painel } };
        return;
      }
      if (acao === "evento") {
        const c = await contexto(q);
        if (!c) return;
        if (!podeVer(c)) { erro(context, 403, SEM_PERMISSAO); return; }
        const verContato = c.gestao || c.p.organizador || ehEtica || ehPresidencia;
        const verCaixa = c.gestao || c.p.algum || ehTesouraria;
        const [organizadores, convidados, caixa, antecedencia] = await Promise.all([
          db.organizadoresDoEvento(pool, c.evento.id),
          db.carregarConvidados(pool, { eventoId: c.evento.id, verContato }),
          verCaixa ? db.buscarCaixa(pool, c.evento.id, { hoje }) : null,
          canaisDb.lerPrazoDias(pool, "EVENTO_ETICA_ANTECEDENCIA_DIAS", ev.ANTECEDENCIA_ETICA_DIAS)
        ]);
        const avCaixa = ev.avaliarAberturaDeCaixa(c.evento, true);
        context.res = { status: 200, body: {
          sucesso: true, evento: db.resumoDoEvento(c.evento), meusPapeis: c.p.papeis, organizadores, convidados, caixa,
          regras: {
            exigeNadaConsta: c.evento.nivel <= ev.NIVEL_MAXIMO_NADA_CONSTA, antecedenciaEticaDias: antecedencia,
            prazoParecerEtica: cal.somarDias(c.evento.dataInicio, -antecedencia), caixaDisponivel: avCaixa.ok, motivoSemCaixa: avCaixa.ok ? null : avCaixa.mensagem
          },
          acoes: acoesDoEvento(c, caixa)
        } };
        return;
      }
      if (acao === "fila") {
        if (!ehEtica && !ehPresidencia) { erro(context, 403, SEM_PERMISSAO); return; }
        const fila = await db.filaDeAnalise(pool, ctxCal, { etica: ehEtica, presidencia: ehPresidencia, hoje });
        context.res = { status: 200, body: { sucesso: true, ehEtica, ehPresidencia, ...fila } };
        return;
      }
      if (acao === "caixa") {
        const c = await contexto(q);
        if (!c) return;
        if (!(c.gestao || c.p.algum || ehTesouraria)) { erro(context, 403, SEM_PERMISSAO); return; }
        const caixa = await db.buscarCaixa(pool, c.evento.id, { hoje });
        context.res = { status: 200, body: { sucesso: true, evento: db.resumoDoEvento(c.evento), caixa, acoes: acoesDoEvento(c, caixa) } };
        return;
      }
      if (acao === "caixas") {
        if (!ehTesouraria && !ehGestao) { erro(context, 403, SEM_PERMISSAO); return; }
        const status = q.status ? String(q.status).toUpperCase() : null;
        if (status && !ev.STATUS_CAIXA[status]) { erro(context, 400, "Situação inválida."); return; }
        // A Tesouraria Geral (financeiro + escopo global) vê todos; a gestão de eventos só os de eventos que o escopo cobre (conferido com o evento REAL, com as Áreas dele).
        const caixas = await db.listarCaixas(pool, ctxCal, { status, hoje, filtrarEvento: ehTesouraria ? null : (e) => cal.escopoCobreEvento(escopo, e, ctxCal).ok });
        context.res = { status: 200, body: { sucesso: true, caixas } };
        return;
      }
      erro(context, 404, "Ação inválida.");
      return;
    }

    // ================= Escrita =================
    if (metodo !== "POST") { erro(context, 405, "Método não suportado."); return; }

    if (acao === "organizadores/designar") {
      const c = await contexto(corpo);
      if (!c) return;
      if (!podeDesignar(c)) { erro(context, 403, "Só a Secretaria (no escopo) ou o responsável pelo evento designa organizadores."); return; }
      resposta(context, await db.designarOrganizador(pool, { evento: c.evento, membroId: corpo.membroId, papel: corpo.papel, por: membroId }), 201);
      return;
    }
    if (acao === "organizadores/encerrar") {
      const id = idDe(corpo.organizadorId);
      if (!id) { erro(context, 400, "Informe o organizadorId."); return; }
      const o = (await pool.request().input("id", sql.Int, id).query(`SELECT EventoId FROM EventoOrganizadores WHERE OrganizadorId = @id`)).recordset[0];
      if (!o) { erro(context, 404, "Designação não encontrada."); return; }
      const c = await contexto({ eventoId: o.EventoId });
      if (!c) return;
      if (!podeDesignar(c)) { erro(context, 403, "Só a Secretaria (no escopo) ou o responsável pelo evento encerra a designação."); return; }
      resposta(context, await db.encerrarOrganizador(pool, { organizadorId: id, motivo: corpo.motivo, por: membroId }));
      return;
    }

    if (acao === "convidados") {
      const c = await contexto(corpo);
      if (!c) return;
      if (!podeConvidados(c)) { erro(context, 403, "Só a organização do evento (ou a Secretaria) registra convidados."); return; }
      resposta(context, await db.criarConvidado(pool, { evento: c.evento, dados: corpo, por: membroId }), 201);
      return;
    }
    if (acao === "convidados/atualizar" || acao === "convidados/submeter" || acao === "convidados/oficializar" || acao === "convidados/cancelar") {
      const x = await convidadoDoCorpo(corpo);
      if (!x) return;
      if (!podeConvidados(x.c)) { erro(context, 403, "Só a organização do evento (ou a Secretaria) faz isto."); return; }
      if (acao === "convidados/atualizar") resposta(context, await db.atualizarConvidado(pool, { convidado: x.bruto, dados: corpo, por: membroId }));
      else if (acao === "convidados/submeter") resposta(context, await db.submeterConvidado(pool, { convidado: x.bruto, evento: x.c.evento, por: membroId, hoje }));
      else if (acao === "convidados/oficializar") resposta(context, await db.oficializarConvidado(pool, { convidado: x.bruto, por: membroId }));
      else resposta(context, await db.cancelarConvidado(pool, { convidado: x.bruto, motivo: corpo.motivo, por: membroId }));
      return;
    }
    if (acao === "convidados/parecer-etica" || acao === "convidados/nada-consta") {
      const etica = acao === "convidados/parecer-etica";
      if (etica ? !ehEtica : !ehPresidencia) { erro(context, 403, etica ? "O parecer é do Conselho de Ética (permissão eventos_etica, escopo global)." : "O Nada Consta é da Presidência (permissão eventos_presidencia, escopo global)."); return; }
      const x = await convidadoDoCorpo(corpo);
      if (!x) return;
      resposta(context, await db.decidirConvidado(pool, { convidado: x.bruto, evento: x.c.evento, por: membroId, orgao: etica ? "ETICA" : "PRESIDENCIA", valor: etica ? corpo.parecer : corpo.decisao, motivo: corpo.motivo }));
      return;
    }

    if (acao === "caixa/abrir" || acao === "caixa/lancar" || acao === "caixa/encerrar") {
      const c = await contexto(corpo);
      if (!c) return;
      if (!c.p.tesoureiro) { erro(context, 403, "O caixa é do responsável ou do tesoureiro designado para o evento."); return; }
      if (acao === "caixa/abrir") resposta(context, await db.abrirCaixa(pool, { evento: c.evento, declarou: corpo.declaracaoSemContaParalela === true, por: membroId, hoje }), 201);
      else if (acao === "caixa/lancar") resposta(context, await db.lancarNoCaixa(pool, { evento: c.evento, dados: corpo, por: membroId, hoje }), 201);
      else resposta(context, await db.encerrarCaixa(pool, { evento: c.evento, destinos: corpo.destinos, justificativaDeficit: corpo.justificativaDeficit, por: membroId, hoje }));
      return;
    }
    if (acao === "caixa/cancelar-lancamento") {
      const id = idDe(corpo.lancamentoId);
      if (!id) { erro(context, 400, "Informe o lancamentoId."); return; }
      const l = (await pool.request().input("id", sql.Int, id).query(`SELECT EventoId FROM EventoCaixaLancamentos WHERE LancamentoId = @id`)).recordset[0];
      if (!l) { erro(context, 404, "Lançamento não encontrado."); return; }
      const c = await contexto({ eventoId: l.EventoId });
      if (!c) return;
      if (!c.p.tesoureiro) { erro(context, 403, "O caixa é do responsável ou do tesoureiro designado para o evento."); return; }
      resposta(context, await db.cancelarLancamento(pool, { lancamentoId: id, motivo: corpo.motivo, por: membroId }));
      return;
    }
    if (acao === "caixa/conferir" || acao === "caixa/devolver") {
      if (!ehTesouraria) { erro(context, 403, "A conferência é da Tesouraria Geral (permissão financeiro, escopo global)."); return; }
      const c = await contexto(corpo);
      if (!c) return;
      if (acao === "caixa/conferir") resposta(context, await db.conferirCaixa(pool, { evento: c.evento, observacao: corpo.observacao, por: membroId }));
      else resposta(context, await db.devolverCaixa(pool, { evento: c.evento, motivo: corpo.motivo, por: membroId }));
      return;
    }
    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoEventos] erro:", e);
    context.res = { status: 500, body: { sucesso: false, mensagem: "Erro interno ao processar os eventos." } };
  }
};
