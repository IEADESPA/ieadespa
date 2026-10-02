// shared/eventosDb.js (v7.4 — Eventos e Congressos: governança do evento)
//
// A parte com banco. Toda decisão de regra (Protocolo de Convidados, antecedência de 10 dias, fechamento do
// Caixa Flutuante em centavos) está em shared/eventos.js, pura e testada; aqui só se carrega, se chama o motor
// e se grava, com auditoria. O evento em si (data, nível, abrangência) é do calendário: shared/calendarioDb.js.
// Funções devolvem { sucesso, mensagem, ... }; recusa de regra é sucesso:false (o handler a mostra como 422).
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const ev = require("./eventos");
const cal = require("./calendario");
const canaisDb = require("./canaisDb");

const { emMs, isoInstante, lerPrazoDias, notificarAgora } = canaisDb;
const limpar = (v) => String(v == null ? "" : v).trim();
const isoData = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const LIMITE_LISTA = 300;
const DIAS_URGENTE_CONVIDADO = 5;

// ---------------------------------------------------------------
// Destinatários
// ---------------------------------------------------------------

async function portadoresDe(pool, permissao, nivel) {
  return require("./notificacoes").resolverDestinatariosPorPermissao(pool, { permissao, nivel });
}

// Quem organiza o evento: o proponente do calendário e os organizadores ativos.
async function organizadoresDoEvento(pool, eventoId) {
  const r = await pool.request().input("e", sql.Int, eventoId).query(`
    SELECT o.OrganizadorId, o.MembroId, m.Nome, m.Email, o.Papel, o.DesignadoEm
    FROM EventoOrganizadores o JOIN MembroReferencia m ON m.MembroId = o.MembroId WHERE o.EventoId = @e AND o.EncerradoEm IS NULL ORDER BY o.OrganizadorId`);
  return r.recordset.map(x => ({ organizadorId: x.OrganizadorId, membroId: x.MembroId, nome: x.Nome, email: x.Email, papel: x.Papel, rotuloPapel: ev.PAPEIS_ORGANIZADOR[x.Papel], designadoEm: isoInstante(x.DesignadoEm) }));
}

async function destinatariosDaOrganizacao(pool, evento, { papeis = null } = {}) {
  const orgs = (await organizadoresDoEvento(pool, evento.id)).filter(o => !papeis || papeis.includes(o.papel));
  const mapa = new Map(orgs.map(o => [o.membroId, { membroId: o.membroId, nome: o.nome, email: o.email }]));
  if (evento.propostoPorMembroId && (!papeis || papeis.includes("RESPONSAVEL")) && !mapa.has(evento.propostoPorMembroId)) {
    const m = (await pool.request().input("id", sql.Int, evento.propostoPorMembroId).query(`SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @id`)).recordset[0];
    if (m) mapa.set(m.MembroId, { membroId: m.MembroId, nome: m.Nome, email: m.Email });
  }
  return [...mapa.values()];
}

// Papéis de um membro num evento. O proponente do calendário é RESPONSAVEL implícito.
async function papeisNoEvento(pool, evento, membroId) {
  if (!membroId) return { proponente: false, papeis: [], organizador: false, tesoureiro: false, responsavel: false, algum: false };
  const r = await pool.request().input("e", sql.Int, evento.id).input("m", sql.Int, membroId).query(`SELECT Papel FROM EventoOrganizadores WHERE EventoId = @e AND MembroId = @m AND EncerradoEm IS NULL`);
  const papeis = new Set(r.recordset.map(x => x.Papel));
  const proponente = evento.propostoPorMembroId === membroId;
  if (proponente) papeis.add("RESPONSAVEL");
  const responsavel = papeis.has("RESPONSAVEL");
  return {
    proponente, papeis: [...papeis], responsavel,
    organizador: responsavel || papeis.has("ORGANIZADOR"),
    tesoureiro: responsavel || papeis.has("TESOUREIRO"),
    algum: papeis.size > 0
  };
}

// ---------------------------------------------------------------
// Organizadores
// ---------------------------------------------------------------

async function designarOrganizador(pool, { evento, membroId, papel, por, deps }) {
  if (!ev.STATUS_EVENTO_PLANEJAVEL.includes(evento.status)) return { sucesso: false, mensagem: "O evento não está ativo no calendário." };
  const papelNorm = limpar(papel || "ORGANIZADOR").toUpperCase();
  if (!ev.PAPEIS_ORGANIZADOR[papelNorm]) return { sucesso: false, mensagem: "Papel inválido: use Responsável, Organizador ou Tesoureiro." };
  const id = Number(membroId);
  if (!Number.isInteger(id) || id <= 0) return { sucesso: false, mensagem: "Informe a matrícula de quem vai organizar." };
  const m = (await pool.request().input("id", sql.Int, id).query(`SELECT MembroId, Nome, Status, Email FROM MembroReferencia WHERE MembroId = @id`)).recordset[0];
  if (!m) return { sucesso: false, mensagem: "Matrícula não encontrada." };
  if (m.Status !== "ATIVO") return { sucesso: false, mensagem: `${m.Nome} não está com a situação ATIVO no cadastro.` };
  const ja = await pool.request().input("e", sql.Int, evento.id).input("m", sql.Int, id).query(`SELECT OrganizadorId FROM EventoOrganizadores WHERE EventoId = @e AND MembroId = @m AND EncerradoEm IS NULL`);
  if (ja.recordset[0]) return { sucesso: false, mensagem: `${m.Nome} já organiza este evento.` };
  let organizadorId;
  try {
    const r = await pool.request().input("e", sql.Int, evento.id).input("m", sql.Int, id).input("p", sql.NVarChar(14), papelNorm).input("por", sql.Int, por || null)
      .query(`INSERT INTO EventoOrganizadores (EventoId, MembroId, Papel, DesignadoPorMembroId) OUTPUT INSERTED.OrganizadorId VALUES (@e, @m, @p, @por)`);
    organizadorId = r.recordset[0].OrganizadorId;
  } catch (e) {
    if (e && (e.number === 2601 || e.number === 2627)) return { sucesso: false, mensagem: `${m.Nome} já organiza este evento.` };
    throw e;
  }
  await registrarAuditoria({ tabela: "EventoOrganizadores", registroId: organizadorId, acao: "ORGANIZADOR_DESIGNADO", usuarioId: por, dadosDepois: { eventoId: evento.id, membroId: id, papel: papelNorm } });
  await notificarAgora(pool, {
    regraChave: "EVENTOS_ORGANIZADOR_DESIGNADO", destinatarios: [{ membroId: id, email: m.Email }],
    mensagem: `Você foi designado (${ev.PAPEIS_ORGANIZADOR[papelNorm]}) no evento “${evento.titulo}” de ${cal.formatarDataBr(evento.dataInicio)}. Veja em Meu Painel → Eventos.`,
    referenciaId: organizadorId, referenciaTabela: "EventoOrganizadores", deps
  });
  return { sucesso: true, mensagem: `${m.Nome} foi designado.`, organizadorId };
}

async function encerrarOrganizador(pool, { organizadorId, motivo, por }) {
  const o = (await pool.request().input("id", sql.Int, Number(organizadorId)).query(`SELECT OrganizadorId, EventoId, MembroId, Papel, EncerradoEm FROM EventoOrganizadores WHERE OrganizadorId = @id`)).recordset[0];
  if (!o) return { sucesso: false, mensagem: "Designação não encontrada." };
  if (o.EncerradoEm) return { sucesso: false, mensagem: "Esta designação já foi encerrada." };
  const m = limpar(motivo);
  if (m.length < 5 || m.length > 200) return { sucesso: false, mensagem: "Informe o motivo do encerramento (5 a 200 caracteres)." };
  await pool.request().input("id", sql.Int, o.OrganizadorId).input("por", sql.Int, por || null).input("m", sql.NVarChar(200), m)
    .query(`UPDATE EventoOrganizadores SET EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = @por, MotivoEncerramento = @m WHERE OrganizadorId = @id`);
  await registrarAuditoria({ tabela: "EventoOrganizadores", registroId: o.OrganizadorId, acao: "ORGANIZADOR_ENCERRADO", usuarioId: por, dadosAntes: { eventoId: o.EventoId, membroId: o.MembroId, papel: o.Papel }, dadosDepois: { motivo: m } });
  return { sucesso: true, mensagem: "Designação encerrada." };
}

// ---------------------------------------------------------------
// Convidados — Protocolo de Convidados (Art. 111 e 111-A)
// ---------------------------------------------------------------

function mapearConvidado(r, { verContato }) {
  const c = {
    convidadoId: r.ConvidadoId, eventoId: r.EventoId, nome: r.Nome, tipo: r.Tipo, rotuloTipo: ev.TIPOS_CONVIDADO[r.Tipo],
    ministerioOrigem: r.MinisterioOrigem || null, reputacaoConhecida: !!r.ReputacaoConhecida,
    observacaoOrganizador: r.ObservacaoOrganizador || null, divulgacaoAutorizada: !!r.DivulgacaoAutorizada,
    status: r.Status, rotuloStatus: ev.STATUS_CONVIDADO[r.Status],
    exigeEtica: !!r.ExigeEtica, exigeNadaConsta: !!r.ExigeNadaConsta,
    submetidoEm: isoInstante(r.SubmetidoEm),
    etica: r.EticaParecer ? { parecer: r.EticaParecer, motivo: r.EticaMotivo || null, porNome: r.EticaPorNome || null, em: isoInstante(r.EticaEm) } : null,
    nadaConsta: r.NadaConsta ? { decisao: r.NadaConsta, motivo: r.NadaConstaMotivo || null, porNome: r.NadaConstaPorNome || null, em: isoInstante(r.NadaConstaEm) } : null,
    oficializadoEm: isoInstante(r.OficializadoEm), canceladoEm: isoInstante(r.CanceladoEm), motivoCancelamento: r.MotivoCancelamento || null,
    criadoPorNome: r.CriadoPorNome || null, criadoEm: isoInstante(r.CriadoEm)
  };
  const pend = [];
  if (r.Status === "EM_ANALISE") {
    if (r.ExigeEtica && !r.EticaParecer) pend.push("Aguardando o parecer do Conselho de Ética");
    if (r.ExigeNadaConsta && !r.NadaConsta) pend.push("Aguardando o Nada Consta da Presidência");
  }
  c.pendencias = pend;
  c.podeOficializar = ev.podeOficializar({ status: r.Status, oficializadoEm: r.OficializadoEm });
  c.divulgavel = ev.ehDivulgavel({ status: r.Status, oficializadoEm: r.OficializadoEm, divulgacaoAutorizada: !!r.DivulgacaoAutorizada });
  if (verContato) c.contato = r.Contato || null;
  return c;
}

const SELECT_CONVIDADO = `
  SELECT c.*, cr.Nome AS CriadoPorNome, me.Nome AS EticaPorNome, mp.Nome AS NadaConstaPorNome
  FROM EventoConvidados c
  JOIN MembroReferencia cr ON cr.MembroId = c.CriadoPorMembroId
  LEFT JOIN MembroReferencia me ON me.MembroId = c.EticaPorMembroId
  LEFT JOIN MembroReferencia mp ON mp.MembroId = c.NadaConstaPorMembroId`;

async function carregarConvidados(pool, { eventoId = null, convidadoId = null, status = null, verContato = false } = {}) {
  const req = pool.request();
  const cond = [];
  if (eventoId) { req.input("e", sql.Int, eventoId); cond.push("c.EventoId = @e"); }
  if (convidadoId) { req.input("c", sql.Int, convidadoId); cond.push("c.ConvidadoId = @c"); }
  if (status) { req.input("s", sql.NVarChar(10), status); cond.push("c.Status = @s"); }
  const r = await req.query(`${SELECT_CONVIDADO} ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY c.EventoId, c.ConvidadoId OFFSET 0 ROWS FETCH NEXT ${LIMITE_LISTA} ROWS ONLY`);
  return r.recordset.map(x => mapearConvidado(x, { verContato }));
}

async function buscarConvidadoBruto(pool, convidadoId) {
  const id = Number(convidadoId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return (await pool.request().input("id", sql.Int, id).query(`SELECT * FROM EventoConvidados WHERE ConvidadoId = @id`)).recordset[0] || null;
}

async function criarConvidado(pool, { evento, dados, por }) {
  if (!ev.STATUS_EVENTO_PLANEJAVEL.includes(evento.status)) return { sucesso: false, mensagem: "O evento não está ativo no calendário." };
  const v = ev.validarConvidado(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const r = await pool.request().input("e", sql.Int, evento.id).input("nome", sql.NVarChar(150), d.nome).input("tipo", sql.NVarChar(10), d.tipo)
    .input("min", sql.NVarChar(150), d.ministerioOrigem).input("contato", sql.NVarChar(150), d.contato).input("rep", sql.Bit, d.reputacaoConhecida)
    .input("obs", sql.NVarChar(500), d.observacaoOrganizador).input("div", sql.Bit, d.divulgacaoAutorizada).input("por", sql.Int, por)
    .query(`INSERT INTO EventoConvidados (EventoId, Nome, Tipo, MinisterioOrigem, Contato, ReputacaoConhecida, ObservacaoOrganizador, DivulgacaoAutorizada, CriadoPorMembroId)
            OUTPUT INSERTED.ConvidadoId VALUES (@e, @nome, @tipo, @min, @contato, @rep, @obs, @div, @por)`);
  const convidadoId = r.recordset[0].ConvidadoId;
  await registrarAuditoria({ tabela: "EventoConvidados", registroId: convidadoId, acao: "CONVIDADO_REGISTRADO", usuarioId: por, dadosDepois: { eventoId: evento.id, nome: d.nome, tipo: d.tipo, reputacaoConhecida: d.reputacaoConhecida } });
  const ex = ev.exigenciasDoConvite(d, evento);
  return { sucesso: true, convidadoId, mensagem: "Convidado registrado como rascunho. Envie à análise quando a lista estiver pronta.", exigeEtica: ex.exigeEtica, exigeNadaConsta: ex.exigeNadaConsta };
}

async function atualizarConvidado(pool, { convidado, dados, por }) {
  if (convidado.Status !== "RASCUNHO") return { sucesso: false, mensagem: "Só se edita convidado em rascunho. Depois de enviado à análise, cancele e registre de novo." };
  const v = ev.validarConvidado({ ...mapearBruto(convidado), ...dados });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  await pool.request().input("id", sql.Int, convidado.ConvidadoId).input("nome", sql.NVarChar(150), d.nome).input("tipo", sql.NVarChar(10), d.tipo)
    .input("min", sql.NVarChar(150), d.ministerioOrigem).input("contato", sql.NVarChar(150), d.contato).input("rep", sql.Bit, d.reputacaoConhecida)
    .input("obs", sql.NVarChar(500), d.observacaoOrganizador).input("div", sql.Bit, d.divulgacaoAutorizada)
    .query(`UPDATE EventoConvidados SET Nome = @nome, Tipo = @tipo, MinisterioOrigem = @min, Contato = @contato, ReputacaoConhecida = @rep, ObservacaoOrganizador = @obs, DivulgacaoAutorizada = @div
            WHERE ConvidadoId = @id AND Status = 'RASCUNHO'`);
  await registrarAuditoria({ tabela: "EventoConvidados", registroId: convidado.ConvidadoId, acao: "CONVIDADO_ATUALIZADO", usuarioId: por, dadosAntes: { nome: convidado.Nome, tipo: convidado.Tipo }, dadosDepois: { nome: d.nome, tipo: d.tipo, reputacaoConhecida: d.reputacaoConhecida } });
  return { sucesso: true, mensagem: "Convidado atualizado." };
}

function mapearBruto(c) {
  return { nome: c.Nome, tipo: c.Tipo, ministerioOrigem: c.MinisterioOrigem, contato: c.Contato, reputacaoConhecida: !!c.ReputacaoConhecida, observacaoOrganizador: c.ObservacaoOrganizador, divulgacaoAutorizada: !!c.DivulgacaoAutorizada };
}

async function submeterConvidado(pool, { convidado, evento, por, hoje = hojeBrasilia(), deps }) {
  if (convidado.Status !== "RASCUNHO") return { sucesso: false, mensagem: "Este convidado já foi enviado à análise." };
  const antecedencia = await lerPrazoDias(pool, "EVENTO_ETICA_ANTECEDENCIA_DIAS", ev.ANTECEDENCIA_ETICA_DIAS);
  const av = ev.avaliarSubmissao({ reputacaoConhecida: !!convidado.ReputacaoConhecida }, evento, { hoje, antecedenciaDias: antecedencia });
  if (!av.ok) return { sucesso: false, mensagem: av.mensagem };
  const novoStatus = ev.statusDoConvite({ status: "RASCUNHO", exigeEtica: av.exigeEtica, exigeNadaConsta: av.exigeNadaConsta });
  const r = await pool.request().input("id", sql.Int, convidado.ConvidadoId).input("st", sql.NVarChar(10), novoStatus).input("ee", sql.Bit, av.exigeEtica).input("en", sql.Bit, av.exigeNadaConsta).input("por", sql.Int, por)
    .query(`UPDATE EventoConvidados SET Status = @st, ExigeEtica = @ee, ExigeNadaConsta = @en, SubmetidoEm = SYSUTCDATETIME(), SubmetidoPorMembroId = @por WHERE ConvidadoId = @id AND Status = 'RASCUNHO'`);
  if (r.rowsAffected && r.rowsAffected[0] === 0) return { sucesso: false, mensagem: "Este convidado já foi enviado à análise." };
  await registrarAuditoria({ tabela: "EventoConvidados", registroId: convidado.ConvidadoId, acao: "CONVIDADO_SUBMETIDO", usuarioId: por, dadosDepois: { status: novoStatus, exigeEtica: av.exigeEtica, exigeNadaConsta: av.exigeNadaConsta } });

  const resumo = `${convidado.Nome} (${ev.TIPOS_CONVIDADO[convidado.Tipo]}${convidado.MinisterioOrigem ? `, ${convidado.MinisterioOrigem}` : ""}) para “${evento.titulo}” em ${cal.formatarDataBr(evento.dataInicio)}`;
  if (av.exigeEtica) {
    await notificarAgora(pool, {
      regraChave: "EVENTOS_CONVIDADO_PARA_ANALISE", destinatarios: await portadoresDe(pool, "eventos_etica"),
      mensagem: `Parecer do Conselho de Ética: convidado de reputação desconhecida — ${resumo}. O parecer precisa sair até ${cal.formatarDataBr(av.prazoParecerEtica)} (Art. 111).`,
      referenciaId: convidado.ConvidadoId * 2, referenciaTabela: "EventoConvidados", deps
    });
  }
  if (av.exigeNadaConsta) {
    await notificarAgora(pool, {
      regraChave: "EVENTOS_CONVIDADO_PARA_ANALISE", destinatarios: await portadoresDe(pool, "eventos_presidencia"),
      mensagem: `Nada Consta da Presidência: convidado de evento geral — ${resumo}. O convite só pode ser oficializado e divulgado depois (Art. 111-A, §2º).`,
      referenciaId: convidado.ConvidadoId * 2 + 1, referenciaTabela: "EventoConvidados", deps
    });
  }
  const msg = novoStatus === "AUTORIZADO"
    ? "Convidado autorizado: a reputação é conhecida e o evento não é geral, então não há parecer a aguardar. Pode oficializar o convite."
    : `Enviado à análise${av.exigeEtica ? " do Conselho de Ética" : ""}${av.exigeEtica && av.exigeNadaConsta ? " e" : ""}${av.exigeNadaConsta ? " da Presidência" : ""}.`;
  return { sucesso: true, status: novoStatus, exigeEtica: av.exigeEtica, exigeNadaConsta: av.exigeNadaConsta, prazoParecerEtica: av.prazoParecerEtica, mensagem: msg };
}

// Quem decide não é quem convidou, nem quem enviou, nem quem organiza o evento.
async function conflitoDeInteresse(pool, convidado, evento, membroId) {
  if (convidado.CriadoPorMembroId === membroId || convidado.SubmetidoPorMembroId === membroId) return true;
  const p = await papeisNoEvento(pool, evento, membroId);
  return p.algum;
}

async function decidirConvidado(pool, { convidado, evento, por, orgao, valor, motivo, deps }) {
  const etica = orgao === "ETICA";
  if (convidado.Status !== "EM_ANALISE") return { sucesso: false, mensagem: "Este convidado não está em análise." };
  if (etica ? !convidado.ExigeEtica : !convidado.ExigeNadaConsta) return { sucesso: false, mensagem: etica ? "Este convite não exige parecer do Conselho de Ética (a reputação foi declarada como conhecida)." : "Este convite não exige o Nada Consta da Presidência (evento não geral)." };
  if (etica ? convidado.EticaParecer : convidado.NadaConsta) return { sucesso: false, mensagem: "Esta decisão já foi registrada." };
  if (await conflitoDeInteresse(pool, convidado, evento, por)) return { sucesso: false, mensagem: "Quem convidou, enviou ou organiza o evento não decide sobre o próprio convidado." };

  const v = etica ? ev.validarParecerEtica({ parecer: valor, motivo }) : ev.validarNadaConsta({ decisao: valor, motivo });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const estado = {
    status: convidado.Status, exigeEtica: !!convidado.ExigeEtica, exigeNadaConsta: !!convidado.ExigeNadaConsta,
    eticaParecer: etica ? v.valor : convidado.EticaParecer, nadaConsta: etica ? convidado.NadaConsta : v.valor
  };
  const novoStatus = ev.statusDoConvite(estado);
  const colunas = etica ? "EticaParecer = @v, EticaMotivo = @m, EticaPorMembroId = @por, EticaEm = SYSUTCDATETIME()" : "NadaConsta = @v, NadaConstaMotivo = @m, NadaConstaPorMembroId = @por, NadaConstaEm = SYSUTCDATETIME()";
  const r = await pool.request().input("id", sql.Int, convidado.ConvidadoId).input("v", sql.NVarChar(12), v.valor).input("m", sql.NVarChar(500), v.motivo).input("por", sql.Int, por).input("st", sql.NVarChar(10), novoStatus)
    .query(`UPDATE EventoConvidados SET ${colunas}, Status = @st WHERE ConvidadoId = @id AND Status = 'EM_ANALISE' AND ${etica ? "EticaParecer" : "NadaConsta"} IS NULL`);
  if (r.rowsAffected && r.rowsAffected[0] === 0) return { sucesso: false, mensagem: "Esta decisão já foi registrada." };
  await registrarAuditoria({ tabela: "EventoConvidados", registroId: convidado.ConvidadoId, acao: etica ? "CONVIDADO_PARECER_ETICA" : "CONVIDADO_NADA_CONSTA", usuarioId: por, dadosDepois: { decisao: v.valor, statusResultante: novoStatus } });

  const organizacao = await destinatariosDaOrganizacao(pool, evento);
  const orgaoTxt = etica ? "O Conselho de Ética" : "A Presidência";
  const textoDecisao = etica ? (v.valor === "FAVORAVEL" ? "deu parecer favorável a" : "deu parecer CONTRÁRIO a") : (v.valor === "CONCEDIDO" ? "concedeu o Nada Consta a" : "NEGOU o Nada Consta a");
  await notificarAgora(pool, {
    regraChave: "EVENTOS_CONVIDADO_DECIDIDO", destinatarios: organizacao,
    mensagem: `${orgaoTxt} ${textoDecisao} ${convidado.Nome} (evento “${evento.titulo}”). ${novoStatus === "AUTORIZADO" ? "Todos os pareceres exigidos saíram: o convite pode ser oficializado." : novoStatus === "VETADO" ? `Convite vetado${v.motivo ? `: ${v.motivo}` : ""}.` : "Ainda falta outra decisão."}`,
    referenciaId: convidado.ConvidadoId * 4 + (etica ? 0 : 1), referenciaTabela: "EventoConvidados", deps
  });
  return { sucesso: true, status: novoStatus, mensagem: novoStatus === "AUTORIZADO" ? "Decisão registrada. O convidado está autorizado." : novoStatus === "VETADO" ? "Decisão registrada. O convite foi vetado." : "Decisão registrada. Falta a outra decisão exigida." };
}

async function oficializarConvidado(pool, { convidado, por }) {
  if (!ev.podeOficializar({ status: convidado.Status, oficializadoEm: convidado.OficializadoEm })) {
    return { sucesso: false, mensagem: convidado.OficializadoEm ? "O convite já foi oficializado." : "Só se oficializa o convite de convidado AUTORIZADO: antes disso ele não pode ser divulgado (Art. 111-A, §2º)." };
  }
  await pool.request().input("id", sql.Int, convidado.ConvidadoId).input("por", sql.Int, por)
    .query(`UPDATE EventoConvidados SET OficializadoEm = SYSUTCDATETIME(), OficializadoPorMembroId = @por WHERE ConvidadoId = @id AND Status = 'AUTORIZADO' AND OficializadoEm IS NULL`);
  await registrarAuditoria({ tabela: "EventoConvidados", registroId: convidado.ConvidadoId, acao: "CONVIDADO_OFICIALIZADO", usuarioId: por, dadosDepois: { divulgacaoAutorizada: !!convidado.DivulgacaoAutorizada } });
  return { sucesso: true, mensagem: convidado.DivulgacaoAutorizada ? "Convite oficializado. O nome já pode aparecer no site (o convidado autorizou a divulgação)." : "Convite oficializado. O convidado não autorizou a divulgação do nome, então ele não aparece no site." };
}

async function cancelarConvidado(pool, { convidado, motivo, por }) {
  if (convidado.Status === "CANCELADO") return { sucesso: false, mensagem: "O convite já está cancelado." };
  if (convidado.Status === "VETADO") return { sucesso: false, mensagem: "Convidado vetado não precisa ser cancelado." };
  const m = limpar(motivo);
  if (m.length < 5 || m.length > 300) return { sucesso: false, mensagem: "Informe o motivo do cancelamento (5 a 300 caracteres)." };
  await pool.request().input("id", sql.Int, convidado.ConvidadoId).input("por", sql.Int, por).input("m", sql.NVarChar(300), m)
    .query(`UPDATE EventoConvidados SET Status = 'CANCELADO', CanceladoEm = SYSUTCDATETIME(), CanceladoPorMembroId = @por, MotivoCancelamento = @m WHERE ConvidadoId = @id AND Status NOT IN ('CANCELADO','VETADO')`);
  await registrarAuditoria({ tabela: "EventoConvidados", registroId: convidado.ConvidadoId, acao: "CONVIDADO_CANCELADO", usuarioId: por, dadosAntes: { status: convidado.Status }, dadosDepois: { motivo: m } });
  return { sucesso: true, mensagem: convidado.OficializadoEm ? "Convite cancelado. Ele sai do site na próxima atualização." : "Convite cancelado." };
}

// A fila do Conselho de Ética e da Presidência: convites em análise esperando a decisão deles.
async function filaDeAnalise(pool, ctxCal, { etica, presidencia, hoje = hojeBrasilia() }) {
  const r = await pool.request().query(`${SELECT_CONVIDADO} WHERE c.Status = 'EM_ANALISE' ORDER BY c.SubmetidoEm`);
  const calDb = require("./calendarioDb");
  const eventos = new Map();
  const saida = { etica: [], presidencia: [] };
  for (const x of r.recordset) {
    if (!eventos.has(x.EventoId)) eventos.set(x.EventoId, await calDb.buscarEvento(pool, x.EventoId, ctxCal));
    const e = eventos.get(x.EventoId);
    if (!e) continue;
    const item = {
      ...mapearConvidado(x, { verContato: true }),
      evento: { eventoId: e.id, titulo: e.titulo, dataInicio: e.dataInicio, dataFim: e.dataFim, nivel: e.nivel, rotuloNivel: e.rotuloNivel, tipoNome: e.tipo.nome, local: e.local },
      diasAteEvento: cal.diasEntre(hoje, e.dataInicio)
    };
    item.urgente = item.diasAteEvento <= DIAS_URGENTE_CONVIDADO;
    if (etica && x.ExigeEtica && !x.EticaParecer) saida.etica.push(item);
    if (presidencia && x.ExigeNadaConsta && !x.NadaConsta) saida.presidencia.push(item);
  }
  return saida;
}

// ---------------------------------------------------------------
// Caixa Flutuante
// ---------------------------------------------------------------

function mapearLancamento(l) {
  return {
    lancamentoId: l.LancamentoId, tipo: l.Tipo, categoria: l.Categoria,
    rotuloCategoria: (l.Tipo === "ENTRADA" ? ev.CATEGORIAS_ENTRADA : ev.CATEGORIAS_SAIDA)[l.Categoria] || l.Categoria,
    valor: Number(l.Valor), dataLancamento: isoData(l.DataLancamento), descricao: l.Descricao, comprovante: l.Comprovante || null,
    registradoPorNome: l.RegistradoPorNome || null, registradoEm: isoInstante(l.RegistradoEm),
    cancelado: !!l.CanceladoEm, canceladoEm: isoInstante(l.CanceladoEm), motivoCancelamento: l.MotivoCancelamento || null
  };
}

async function buscarCaixa(pool, eventoId, { hoje = hojeBrasilia() } = {}) {
  const c = (await pool.request().input("e", sql.Int, eventoId).query(`
    SELECT c.*, ab.Nome AS AbertoPorNome, en.Nome AS EncerradoPorNome, co.Nome AS ConferidoPorNome, dv.Nome AS DevolvidoPorNome
    FROM EventoCaixas c JOIN MembroReferencia ab ON ab.MembroId = c.AbertoPorMembroId
    LEFT JOIN MembroReferencia en ON en.MembroId = c.EncerradoPorMembroId LEFT JOIN MembroReferencia co ON co.MembroId = c.ConferidoPorMembroId LEFT JOIN MembroReferencia dv ON dv.MembroId = c.DevolvidoPorMembroId
    WHERE c.EventoId = @e`)).recordset[0];
  if (!c) return null;
  const [lancs, dests] = await Promise.all([
    pool.request().input("e", sql.Int, eventoId).query(`SELECT l.*, m.Nome AS RegistradoPorNome FROM EventoCaixaLancamentos l JOIN MembroReferencia m ON m.MembroId = l.RegistradoPorMembroId WHERE l.EventoId = @e ORDER BY l.DataLancamento, l.LancamentoId`),
    pool.request().input("e", sql.Int, eventoId).query(`SELECT * FROM EventoCaixaDestinos WHERE EventoId = @e ORDER BY DestinoId`)
  ]);
  const lancamentos = lancs.recordset.map(mapearLancamento);
  const t = ev.totaisDoCaixa(lancamentos);
  const prazoEm = isoData(c.PrazoEncerramentoEm);
  const sit = ev.situacaoDoCaixa({ status: c.Status, prazoEm }, hoje);
  return {
    eventoId: c.EventoId, status: c.Status, rotuloStatus: ev.STATUS_CAIXA[c.Status], ciclo: c.Ciclo,
    abertoEm: isoInstante(c.AbertoEm), abertoPorNome: c.AbertoPorNome, declaracaoSemContaEm: isoInstante(c.DeclaracaoSemContaEm),
    prazoEncerramentoEm: prazoEm, fase: sit.fase, atrasado: sit.atrasado, diasAtraso: sit.diasAtraso, diasRestantes: sit.diasRestantes != null ? sit.diasRestantes : null,
    encerradoEm: isoInstante(c.EncerradoEm), encerradoPorMembroId: c.EncerradoPorMembroId || null, encerradoPorNome: c.EncerradoPorNome || null, justificativaDeficit: c.JustificativaDeficit || null,
    conferidoEm: isoInstante(c.ConferidoEm), conferidoPorNome: c.ConferidoPorNome || null, conferenciaObs: c.ConferenciaObs || null,
    devolvidoEm: isoInstante(c.DevolvidoEm), devolvidoPorNome: c.DevolvidoPorNome || null, devolvidoMotivo: c.DevolvidoMotivo || null,
    totais: { entradas: t.entradas, saidas: t.saidas, saldo: t.saldo },
    lancamentos,
    destinos: dests.recordset.map(d => ({ destinoId: d.DestinoId, tipo: d.Tipo, rotuloTipo: ev.DESTINOS_SUPERAVIT[d.Tipo], valor: Number(d.Valor), dataDestino: isoData(d.DataDestino), comprovante: d.Comprovante, descricao: d.Descricao || null }))
  };
}

async function abrirCaixa(pool, { evento, declarou, por, hoje = hojeBrasilia() }) {
  const av = ev.avaliarAberturaDeCaixa(evento, declarou);
  if (!av.ok) return { sucesso: false, mensagem: av.mensagem };
  const ja = await pool.request().input("e", sql.Int, evento.id).query(`SELECT EventoId FROM EventoCaixas WHERE EventoId = @e`);
  if (ja.recordset[0]) return { sucesso: false, mensagem: "Este evento já tem caixa aberto." };
  const dias = await lerPrazoDias(pool, "EVENTO_CAIXA_ENCERRAR_DIAS", ev.PRAZO_CAIXA_DIAS);
  const prazo = ev.prazoDeEncerramento(evento.dataFim || evento.dataInicio, dias);
  try {
    await pool.request().input("e", sql.Int, evento.id).input("por", sql.Int, por).input("prazo", sql.Date, prazo)
      .query(`INSERT INTO EventoCaixas (EventoId, AbertoPorMembroId, DeclaracaoSemContaEm, DeclaracaoSemContaPorMembroId, PrazoEncerramentoEm) VALUES (@e, @por, SYSUTCDATETIME(), @por, @prazo)`);
  } catch (e) {
    if (e && (e.number === 2601 || e.number === 2627)) return { sucesso: false, mensagem: "Este evento já tem caixa aberto." };
    throw e;
  }
  await registrarAuditoria({ tabela: "EventoCaixas", registroId: evento.id, acao: "CAIXA_ABERTO", usuarioId: por, dadosDepois: { prazoEncerramentoEm: prazo, declaracaoSemContaParalela: true } });
  return { sucesso: true, mensagem: `Caixa do evento aberto. Encerre e destine o superávit até ${cal.formatarDataBr(prazo)}.`, prazoEncerramentoEm: prazo };
}

async function lerCaixaBruto(pool, eventoId) {
  return (await pool.request().input("e", sql.Int, eventoId).query(`SELECT * FROM EventoCaixas WHERE EventoId = @e`)).recordset[0] || null;
}

async function lancarNoCaixa(pool, { evento, dados, por, hoje = hojeBrasilia() }) {
  const caixa = await lerCaixaBruto(pool, evento.id);
  if (!caixa) return { sucesso: false, mensagem: "Abra o caixa do evento antes de lançar." };
  if (caixa.Status !== "ABERTO") return { sucesso: false, mensagem: "O caixa não está aberto: encerrado não recebe lançamento." };
  const v = ev.validarLancamento(dados, { eventoInicio: evento.dataInicio, hoje });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const r = await pool.request().input("e", sql.Int, evento.id).input("tipo", sql.NVarChar(7), d.tipo).input("cat", sql.NVarChar(24), d.categoria).input("valor", sql.Decimal(12, 2), d.valor)
    .input("data", sql.Date, d.dataLancamento).input("desc", sql.NVarChar(300), d.descricao).input("comp", sql.NVarChar(200), d.comprovante).input("por", sql.Int, por)
    // OUTPUT ... INTO (e não OUTPUT solto): a tabela tem o gatilho do caixa encerrado, e o SQL Server recusa OUTPUT sem INTO nesse caso.
    .query(`DECLARE @novo TABLE (LancamentoId INT);
            INSERT INTO EventoCaixaLancamentos (EventoId, Tipo, Categoria, Valor, DataLancamento, Descricao, Comprovante, RegistradoPorMembroId)
            OUTPUT INSERTED.LancamentoId INTO @novo VALUES (@e, @tipo, @cat, @valor, @data, @desc, @comp, @por);
            SELECT LancamentoId FROM @novo;`);
  const lancamentoId = r.recordset[0].LancamentoId;
  await registrarAuditoria({ tabela: "EventoCaixaLancamentos", registroId: lancamentoId, acao: "CAIXA_LANCAMENTO", usuarioId: por, dadosDepois: { eventoId: evento.id, tipo: d.tipo, categoria: d.categoria, valor: d.valor } });
  return { sucesso: true, lancamentoId, mensagem: `${d.tipo === "ENTRADA" ? "Entrada" : "Saída"} de ${ev.formatarReais(d.centavos)} lançada.` };
}

async function cancelarLancamento(pool, { lancamentoId, motivo, por }) {
  const l = (await pool.request().input("id", sql.Int, Number(lancamentoId)).query(`SELECT l.*, c.Status AS CaixaStatus FROM EventoCaixaLancamentos l JOIN EventoCaixas c ON c.EventoId = l.EventoId WHERE l.LancamentoId = @id`)).recordset[0];
  if (!l) return { sucesso: false, mensagem: "Lançamento não encontrado." };
  if (l.CaixaStatus !== "ABERTO") return { sucesso: false, mensagem: "O caixa não está aberto: o lançamento não pode mais ser cancelado." };
  if (l.CanceladoEm) return { sucesso: false, mensagem: "O lançamento já foi cancelado." };
  const m = limpar(motivo);
  if (m.length < 5 || m.length > 300) return { sucesso: false, mensagem: "Informe o motivo do cancelamento (5 a 300 caracteres)." };
  await pool.request().input("id", sql.Int, l.LancamentoId).input("por", sql.Int, por).input("m", sql.NVarChar(300), m)
    .query(`UPDATE EventoCaixaLancamentos SET CanceladoEm = SYSUTCDATETIME(), CanceladoPorMembroId = @por, MotivoCancelamento = @m WHERE LancamentoId = @id AND CanceladoEm IS NULL`);
  await registrarAuditoria({ tabela: "EventoCaixaLancamentos", registroId: l.LancamentoId, acao: "CAIXA_LANCAMENTO_CANCELADO", usuarioId: por, dadosAntes: { valor: Number(l.Valor), tipo: l.Tipo }, dadosDepois: { motivo: m } });
  return { sucesso: true, mensagem: "Lançamento cancelado (continua visível, fora da conta)." };
}

async function encerrarCaixa(pool, { evento, destinos, justificativaDeficit, por, hoje = hojeBrasilia(), deps }) {
  const caixa = await lerCaixaBruto(pool, evento.id);
  if (!caixa) return { sucesso: false, mensagem: "O evento não tem caixa aberto." };
  if (caixa.Status !== "ABERTO") return { sucesso: false, mensagem: "O caixa já foi encerrado." };
  const lancs = (await pool.request().input("e", sql.Int, evento.id).query(`SELECT Tipo, Valor, CanceladoEm FROM EventoCaixaLancamentos WHERE EventoId = @e`)).recordset
    .map(l => ({ tipo: l.Tipo, valor: Number(l.Valor), cancelado: !!l.CanceladoEm }));
  const t = ev.totaisDoCaixa(lancs);
  const v = ev.validarEncerramento({ saldoCentavos: t.saldoCentavos, destinos, justificativaDeficit }, { hoje });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem, totais: { entradas: t.entradas, saidas: t.saidas, saldo: t.saldo } };

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const d of v.destinos) {
      await new sql.Request(transaction).input("e", sql.Int, evento.id).input("tipo", sql.NVarChar(14), d.tipo).input("valor", sql.Decimal(12, 2), d.valor)
        .input("data", sql.Date, d.dataDestino).input("comp", sql.NVarChar(200), d.comprovante).input("desc", sql.NVarChar(300), d.descricao)
        .query(`INSERT INTO EventoCaixaDestinos (EventoId, Tipo, Valor, DataDestino, Comprovante, Descricao) VALUES (@e, @tipo, @valor, @data, @comp, @desc)`);
    }
    const r = await new sql.Request(transaction).input("e", sql.Int, evento.id).input("por", sql.Int, por)
      .input("ent", sql.Decimal(12, 2), t.entradas).input("sai", sql.Decimal(12, 2), t.saidas).input("saldo", sql.Decimal(12, 2), t.saldo).input("j", sql.NVarChar(500), v.justificativaDeficit)
      .query(`UPDATE EventoCaixas SET Status = 'ENCERRADO', EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = @por, TotalEntradas = @ent, TotalSaidas = @sai, Saldo = @saldo, JustificativaDeficit = @j
              WHERE EventoId = @e AND Status = 'ABERTO'`);
    if (r.rowsAffected && r.rowsAffected[0] === 0) { await transaction.rollback(); return { sucesso: false, mensagem: "O caixa já foi encerrado." }; }
    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch { /* já encerrada */ }
    throw e;
  }
  await registrarAuditoria({ tabela: "EventoCaixas", registroId: evento.id, acao: "CAIXA_ENCERRADO", usuarioId: por, dadosDepois: { entradas: t.entradas, saidas: t.saidas, saldo: t.saldo, destinos: v.destinos.map(d => ({ tipo: d.tipo, valor: d.valor, comprovante: d.comprovante })), deficit: t.saldoCentavos < 0 } });
  await notificarAgora(pool, {
    regraChave: "EVENTOS_CAIXA_PARA_CONFERIR", destinatarios: await portadoresDe(pool, "financeiro"),
    mensagem: `Caixa do evento “${evento.titulo}” encerrado: entradas ${ev.formatarReais(ev.centavos(t.entradas))}, saídas ${ev.formatarReais(ev.centavos(t.saidas))}, ${t.saldoCentavos > 0 ? `superávit de ${t.saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} destinado` : t.saldoCentavos < 0 ? "DÉFICIT justificado" : "saldo zerado"}. Aguarda a conferência da Tesouraria Geral.`,
    referenciaId: evento.id * 100 + caixa.Ciclo, referenciaTabela: "EventoCaixas", deps
  });
  return {
    sucesso: true, totais: { entradas: t.entradas, saidas: t.saidas, saldo: t.saldo },
    mensagem: t.saldoCentavos > 0 ? "Caixa encerrado e superávit destinado. Aguarda a conferência da Tesouraria Geral." : t.saldoCentavos < 0 ? "Caixa encerrado com déficit justificado. Aguarda a conferência da Tesouraria Geral." : "Caixa encerrado com saldo zerado. Aguarda a conferência da Tesouraria Geral."
  };
}

async function conferirCaixa(pool, { evento, observacao, por }) {
  const caixa = await lerCaixaBruto(pool, evento.id);
  if (!caixa) return { sucesso: false, mensagem: "O evento não tem caixa." };
  if (caixa.Status !== "ENCERRADO") return { sucesso: false, mensagem: caixa.Status === "CONFERIDO" ? "O caixa já foi conferido." : "O caixa ainda não foi encerrado." };
  if (caixa.EncerradoPorMembroId === por) return { sucesso: false, mensagem: "Quem encerrou o caixa não faz a conferência dele: outra pessoa da Tesouraria precisa conferir." };
  // Segregação: quem propôs ou organiza o evento (qualquer papel) não confere o caixa dele, mesmo que não tenha sido ele quem encerrou — o mesmo princípio do convidado.
  if ((await papeisNoEvento(pool, evento, por)).algum) return { sucesso: false, mensagem: "Quem organiza este evento não faz a conferência do caixa dele: outra pessoa da Tesouraria precisa conferir." };
  const obs = limpar(observacao);
  if (obs.length > 500) return { sucesso: false, mensagem: "A observação aceita até 500 caracteres." };
  await pool.request().input("e", sql.Int, evento.id).input("por", sql.Int, por).input("obs", sql.NVarChar(500), obs || null)
    .query(`UPDATE EventoCaixas SET Status = 'CONFERIDO', ConferidoEm = SYSUTCDATETIME(), ConferidoPorMembroId = @por, ConferenciaObs = @obs WHERE EventoId = @e AND Status = 'ENCERRADO'`);
  await registrarAuditoria({ tabela: "EventoCaixas", registroId: evento.id, acao: "CAIXA_CONFERIDO", usuarioId: por, dadosDepois: { observacao: obs || null } });
  return { sucesso: true, mensagem: "Caixa conferido. A prestação de contas do evento está concluída." };
}

async function devolverCaixa(pool, { evento, motivo, por, deps }) {
  const caixa = await lerCaixaBruto(pool, evento.id);
  if (!caixa) return { sucesso: false, mensagem: "O evento não tem caixa." };
  if (caixa.Status !== "ENCERRADO") return { sucesso: false, mensagem: caixa.Status === "CONFERIDO" ? "Caixa conferido não volta." : "O caixa já está aberto." };
  const m = limpar(motivo);
  if (m.length < 10 || m.length > 300) return { sucesso: false, mensagem: "Explique o que precisa ser corrigido (10 a 300 caracteres)." };
  const antes = await buscarCaixa(pool, evento.id);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction).input("e", sql.Int, evento.id).query(`DELETE FROM EventoCaixaDestinos WHERE EventoId = @e`);
    await new sql.Request(transaction).input("e", sql.Int, evento.id).input("por", sql.Int, por).input("m", sql.NVarChar(300), m)
      .query(`UPDATE EventoCaixas SET Status = 'ABERTO', Ciclo = Ciclo + 1, EncerradoEm = NULL, EncerradoPorMembroId = NULL, TotalEntradas = NULL, TotalSaidas = NULL, Saldo = NULL, JustificativaDeficit = NULL,
              DevolvidoEm = SYSUTCDATETIME(), DevolvidoPorMembroId = @por, DevolvidoMotivo = @m WHERE EventoId = @e AND Status = 'ENCERRADO'`);
    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch { /* já encerrada */ }
    throw e;
  }
  await registrarAuditoria({ tabela: "EventoCaixas", registroId: evento.id, acao: "CAIXA_DEVOLVIDO", usuarioId: por, dadosAntes: { destinos: antes ? antes.destinos : [], totais: antes ? antes.totais : null }, dadosDepois: { motivo: m } });
  await notificarAgora(pool, {
    regraChave: "EVENTOS_CAIXA_ENCERRAR", destinatarios: await destinatariosDaOrganizacao(pool, evento, { papeis: ["RESPONSAVEL", "TESOUREIRO"] }),
    mensagem: `A Tesouraria Geral devolveu o caixa do evento “${evento.titulo}” para correção: ${m}. Corrija, encerre e destine o superávit de novo.`,
    referenciaId: evento.id * 100 + caixa.Ciclo + 50, referenciaTabela: "EventoCaixas", deps
  });
  return { sucesso: true, mensagem: "Caixa devolvido à organização para correção." };
}

// `filtrarEvento(eventoReal)`: escopo de quem pergunta, aplicado ao evento COMPLETO do calendário (com as Áreas e a congregação) — o mesmo filtro do painel. Antes o filtro
// era feito fora, sobre um evento montado sem Áreas, e deixava passar todos os caixas de evento de Áreas.
async function listarCaixas(pool, ctxCal, { status = null, hoje = hojeBrasilia(), filtrarEvento = null } = {}) {
  const req = pool.request();
  if (status) req.input("s", sql.NVarChar(10), status);
  const r = await req.query(`SELECT EventoId FROM EventoCaixas ${status ? "WHERE Status = @s" : ""} ORDER BY EventoId DESC OFFSET 0 ROWS FETCH NEXT ${LIMITE_LISTA} ROWS ONLY`);
  const calDb = require("./calendarioDb");
  const saida = [];
  for (const x of r.recordset) {
    const e = await calDb.buscarEvento(pool, x.EventoId, ctxCal);
    if (e && filtrarEvento && !filtrarEvento(e)) continue;
    const c = await buscarCaixa(pool, x.EventoId, { hoje });
    if (e && c) saida.push({ evento: resumoDoEvento(e), caixa: { status: c.status, rotuloStatus: c.rotuloStatus, fase: c.fase, atrasado: c.atrasado, diasAtraso: c.diasAtraso, prazoEncerramentoEm: c.prazoEncerramentoEm, totais: c.totais, encerradoPorNome: c.encerradoPorNome, conferidoPorNome: c.conferidoPorNome } });
  }
  return saida;
}

// ---------------------------------------------------------------
// Visões do evento
// ---------------------------------------------------------------

function resumoDoEvento(e) {
  return {
    eventoId: e.id, titulo: e.titulo, dataInicio: e.dataInicio, dataFim: e.dataFim, horaInicio: e.horaInicio, local: e.local,
    tipoCodigo: e.tipo.codigo, tipoNome: e.tipo.nome, nivel: e.nivel, rotuloNivel: e.rotuloNivel, abrangencia: e.abrangencia,
    congregacaoNome: e.congregacaoNome, areaNomes: e.areaNomes, status: e.status, slugSite: e.slugSite, publicoNoSite: e.publicoNoSite,
    congresso: /^CONGRESSO_UNIFICADO/.test(e.tipo.codigo)
  };
}

async function contagemDeConvidados(pool, eventoIds) {
  const mapa = new Map();
  if (eventoIds.length === 0) return mapa;
  const r = await pool.request().query(`SELECT EventoId, Status, COUNT(*) AS n FROM EventoConvidados WHERE EventoId IN (${eventoIds.map(Number).filter(Number.isInteger).join(",") || "0"}) GROUP BY EventoId, Status`);
  for (const x of r.recordset) {
    if (!mapa.has(x.EventoId)) mapa.set(x.EventoId, { total: 0, rascunho: 0, emAnalise: 0, autorizados: 0, vetados: 0, cancelados: 0 });
    const c = mapa.get(x.EventoId);
    const chave = { RASCUNHO: "rascunho", EM_ANALISE: "emAnalise", AUTORIZADO: "autorizados", VETADO: "vetados", CANCELADO: "cancelados" }[x.Status];
    c[chave] += x.n;
    if (x.Status !== "CANCELADO") c.total += x.n;
  }
  return mapa;
}
const SEM_CONVIDADOS = { total: 0, rascunho: 0, emAnalise: 0, autorizados: 0, vetados: 0, cancelados: 0 };

async function resumoDeCaixas(pool, eventoIds, hoje) {
  const mapa = new Map();
  if (eventoIds.length === 0) return mapa;
  const r = await pool.request().query(`SELECT EventoId, Status, CONVERT(varchar(10), PrazoEncerramentoEm, 23) AS PrazoEm FROM EventoCaixas WHERE EventoId IN (${eventoIds.map(Number).filter(Number.isInteger).join(",") || "0"})`);
  for (const x of r.recordset) {
    const sit = ev.situacaoDoCaixa({ status: x.Status, prazoEm: x.PrazoEm }, hoje);
    mapa.set(x.EventoId, { status: x.Status, rotuloStatus: ev.STATUS_CAIXA[x.Status], fase: sit.fase, atrasado: sit.atrasado, prazoEncerramentoEm: x.PrazoEm });
  }
  return mapa;
}

// Os eventos de que a pessoa participa (proponente ou organizador), com o que está pendente.
async function meusEventos(pool, ctxCal, membroId, { hoje = hojeBrasilia() } = {}) {
  const ids = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT DISTINCT e.EventoId FROM CalendarioEventos e
    LEFT JOIN EventoOrganizadores o ON o.EventoId = e.EventoId AND o.MembroId = @m AND o.EncerradoEm IS NULL
    LEFT JOIN EventoCaixas c ON c.EventoId = e.EventoId
    WHERE e.Status IN ('PROPOSTO','DEFERIDO','HOMOLOGADO') AND (e.PropostoPorMembroId = @m OR o.MembroId IS NOT NULL)
      AND (e.DataFim >= DATEADD(DAY, -60, CAST(SYSUTCDATETIME() AS DATE)) OR ISNULL(c.Status, 'CONFERIDO') <> 'CONFERIDO')`)).recordset.map(x => x.EventoId);
  if (ids.length === 0) return [];
  const calDb = require("./calendarioDb");
  const eventos = [];
  for (const id of ids.slice(0, 100)) { const e = await calDb.buscarEvento(pool, id, ctxCal); if (e) eventos.push(e); }
  const [conv, caixas] = await Promise.all([contagemDeConvidados(pool, ids), resumoDeCaixas(pool, ids, hoje)]);
  const itens = [];
  for (const e of eventos) {
    const p = await papeisNoEvento(pool, e, membroId);
    itens.push({
      ...resumoDoEvento(e), papeis: p.papeis, rotuloPapeis: p.papeis.map(x => ev.PAPEIS_ORGANIZADOR[x]),
      convidados: conv.get(e.id) || SEM_CONVIDADOS, caixa: caixas.get(e.id) || null,
      podeCaixa: p.tesoureiro && ev.ABRANGENCIAS_COM_CAIXA.includes(e.abrangencia)
    });
  }
  return itens.sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
}

// O painel da Secretaria: os eventos gerais, de Área e Regionais do ano, e o que falta em cada um.
async function painelDoAno(pool, ctxCal, ano, { filtrarEvento = () => true, hoje = hojeBrasilia() } = {}) {
  const calDb = require("./calendarioDb");
  const todos = await calDb.carregarEventos(pool, { de: `${ano}-01-01`, ate: `${ano}-12-31`, status: ev.STATUS_EVENTO_PLANEJAVEL }, ctxCal);
  const relevantes = todos.filter(e => (e.nivel <= 3 || ev.ABRANGENCIAS_COM_CAIXA.includes(e.abrangencia)) && e.origem !== "REGRA" && filtrarEvento(e)).slice(0, LIMITE_LISTA);
  const ids = relevantes.map(e => e.id);
  const [conv, caixas, orgs] = await Promise.all([
    contagemDeConvidados(pool, ids), resumoDeCaixas(pool, ids, hoje),
    ids.length ? pool.request().query(`SELECT EventoId, COUNT(*) AS n FROM EventoOrganizadores WHERE EncerradoEm IS NULL AND EventoId IN (${ids.join(",")}) GROUP BY EventoId`) : { recordset: [] }
  ]);
  const nOrgs = new Map(orgs.recordset.map(x => [x.EventoId, x.n]));
  const eventos = relevantes.map(e => {
    const c = conv.get(e.id) || SEM_CONVIDADOS;
    const cx = caixas.get(e.id) || null;
    const atencao = [];
    if ((nOrgs.get(e.id) || 0) === 0 && !e.propostoPorMembroId) atencao.push("Sem organizador designado");
    if (c.emAnalise > 0) atencao.push(`${c.emAnalise} convidado(s) em análise`);
    if (cx && cx.atrasado) atencao.push("Caixa fora do prazo");
    if (cx && cx.status === "ENCERRADO") atencao.push("Caixa aguarda conferência");
    return { ...resumoDoEvento(e), organizadores: nOrgs.get(e.id) || 0, convidados: c, caixa: cx, atencao };
  });
  return {
    ano,
    resumo: {
      eventos: eventos.length, congressos: eventos.filter(e => e.congresso).length,
      convidadosEmAnalise: eventos.reduce((s, e) => s + e.convidados.emAnalise, 0),
      caixasAbertos: eventos.filter(e => e.caixa && e.caixa.status === "ABERTO").length,
      caixasForaDoPrazo: eventos.filter(e => e.caixa && e.caixa.atrasado).length,
      caixasParaConferir: eventos.filter(e => e.caixa && e.caixa.status === "ENCERRADO").length,
      semOrganizador: eventos.filter(e => e.atencao.includes("Sem organizador designado")).length
    },
    eventos
  };
}

// ---------------------------------------------------------------
// Site: só o convidado AUTORIZADO, OFICIALIZADO e que autorizou a divulgação
// ---------------------------------------------------------------

async function convidadosPublicos(pool, eventoIds) {
  const mapa = new Map();
  const ids = (eventoIds || []).map(Number).filter(Number.isInteger);
  if (ids.length === 0) return mapa;
  const r = await pool.request().query(`
    SELECT EventoId, Nome, Tipo, MinisterioOrigem FROM EventoConvidados
    WHERE Status = 'AUTORIZADO' AND OficializadoEm IS NOT NULL AND DivulgacaoAutorizada = 1 AND EventoId IN (${ids.join(",")}) ORDER BY EventoId, ConvidadoId`);
  for (const x of r.recordset) {
    if (!mapa.has(x.EventoId)) mapa.set(x.EventoId, []);
    mapa.get(x.EventoId).push({ nome: x.Nome, tipo: x.Tipo, rotuloTipo: ev.TIPOS_CONVIDADO[x.Tipo], ministerio: x.MinisterioOrigem || null });
  }
  return mapa;
}

// ---------------------------------------------------------------
// Fatos para o motor de notificações (vB.2)
// ---------------------------------------------------------------

// Convite em análise com o evento perto e ainda sem decisão do órgão: cobra o órgão que falta.
async function detectarConvidadosAtrasados(pool, { hoje = hojeBrasilia() } = {}) {
  const r = await pool.request().query(`
    SELECT c.ConvidadoId, c.Nome, c.ExigeEtica, c.EticaParecer, c.ExigeNadaConsta, c.NadaConsta, e.Titulo, CONVERT(varchar(10), e.DataInicio, 23) AS DataInicio
    FROM EventoConvidados c JOIN CalendarioEventos e ON e.EventoId = c.EventoId WHERE c.Status = 'EM_ANALISE' AND e.Status IN ('PROPOSTO','DEFERIDO','HOMOLOGADO')`);
  const fatos = [];
  let etica = null, presidencia = null;
  for (const x of r.recordset) {
    const dias = cal.diasEntre(hoje, x.DataInicio);
    if (dias > DIAS_URGENTE_CONVIDADO) continue;
    const quando = dias < 0 ? "o evento já começou" : dias === 0 ? "o evento é hoje" : `o evento é em ${dias} dia(s)`;
    if (x.ExigeEtica && !x.EticaParecer) {
      etica = etica || await portadoresDe(pool, "eventos_etica");
      fatos.push({ referenciaId: x.ConvidadoId * 2, destinatarios: etica, fatoGerador: `Falta o parecer do Conselho de Ética sobre ${x.Nome} (evento “${x.Titulo}”): ${quando}.` });
    }
    if (x.ExigeNadaConsta && !x.NadaConsta) {
      presidencia = presidencia || await portadoresDe(pool, "eventos_presidencia");
      fatos.push({ referenciaId: x.ConvidadoId * 2 + 1, destinatarios: presidencia, fatoGerador: `Falta o Nada Consta da Presidência sobre ${x.Nome} (evento “${x.Titulo}”): ${quando}.` });
    }
  }
  return fatos;
}

// Caixa aberto depois do prazo: avisa a organização do evento e a Tesouraria Geral.
async function detectarCaixasForaDoPrazo(pool, { hoje = hojeBrasilia() } = {}) {
  const r = await pool.request().input("hoje", sql.Date, hoje).query(`
    SELECT c.EventoId, e.Titulo, CONVERT(varchar(10), c.PrazoEncerramentoEm, 23) AS Prazo FROM EventoCaixas c JOIN CalendarioEventos e ON e.EventoId = c.EventoId
    WHERE c.Status = 'ABERTO' AND c.PrazoEncerramentoEm < @hoje`);
  if (r.recordset.length === 0) return [];
  const tesouraria = await portadoresDe(pool, "financeiro");
  const fatos = [];
  for (const x of r.recordset) {
    const evento = { id: x.EventoId, propostoPorMembroId: (await pool.request().input("e", sql.Int, x.EventoId).query(`SELECT PropostoPorMembroId FROM CalendarioEventos WHERE EventoId = @e`)).recordset[0].PropostoPorMembroId };
    const organizacao = await destinatariosDaOrganizacao(pool, evento, { papeis: ["RESPONSAVEL", "TESOUREIRO"] });
    fatos.push({
      referenciaId: x.EventoId, destinatarios: [...organizacao, ...tesouraria],
      fatoGerador: `O caixa do evento “${x.Titulo}” passou do prazo de encerramento (${cal.formatarDataBr(x.Prazo)}). Encerre e destine o superávit à Sede ou a uma benfeitoria: o saldo não pode ficar com a Área ou a Região (Art. 53-E, §2º).`
    });
  }
  return fatos;
}

module.exports = {
  portadoresDe, organizadoresDoEvento, destinatariosDaOrganizacao, papeisNoEvento,
  designarOrganizador, encerrarOrganizador,
  mapearConvidado, carregarConvidados, buscarConvidadoBruto, criarConvidado, atualizarConvidado, submeterConvidado, decidirConvidado, oficializarConvidado, cancelarConvidado, filaDeAnalise,
  buscarCaixa, abrirCaixa, lancarNoCaixa, cancelarLancamento, encerrarCaixa, conferirCaixa, devolverCaixa, listarCaixas,
  resumoDoEvento, meusEventos, painelDoAno, convidadosPublicos,
  detectarConvidadosAtrasados, detectarCaixasForaDoPrazo
};
