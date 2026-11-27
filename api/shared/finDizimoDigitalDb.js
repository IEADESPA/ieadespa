// shared/finDizimoDigitalDb.js (FASE 10, Financeiro, incremento 4, 27/11/2026) — as CONSULTAS do DÍZIMO DIGITAL (migração 206). A regra pura está
// em shared/finDizimoDigital.js; as rotas são FinDizimoDigital (financeiro/dizimo-digital, a tesouraria) e MeuDizimoDigital (meu-dizimo-digital, o
// membro). Tela aprovada: rodada 22, "r22-dizimo-digital", opção 1.
//
// - O membro informa o Pix: quem deu e a congregação vêm da sessão e do cadastro, nunca do corpo; no máximo 5 Pix esperando a tesouraria por membro.
// - A tesouraria liga o Pix à folha que digitar: a folha tem de ser de uma entrega em curso à congregação do Pix, sem destino e sem outro Pix. A
//   folha fica reservada (FinDizimosDigitais.Folha) e se lança na planilha, preenchida com o Pix (finLancamentosDb.salvar); a exceção da folha e a
//   devolução parcial não passam por cima dela (finBlocosDb).
// - Ou exclui com o motivo; o membro é avisado do porquê (o aviso sai depois da transação: nada de espera dentro dela).
// - Quem liga e exclui: a congregação (o nível dela) ou a Tesouraria Geral por ela; a área acompanha. Fora do escopo e o que não existe têm a mesma
//   resposta. A trava do bloco é a mesma do lançamento (a linha de FinBlocos, com UPDLOCK): ligar e lançar a mesma folha não se cruzam.
const { sql } = require("./db");
const auth = require("./auth");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const { condicaoSqlEscopoCongregacao } = require("./escopoRotas");
const { hojeBrasilia } = require("./dataBrasilia");
const { criarNotificacao } = require("./notificacoes");
const { abrirTransacao, pedidoNaTransacao, fecharTransacao } = require("./finBlocosDb");
const { FAIXAS } = require("./finLancamentosDb");
const regraBlocos = require("./finBlocos");
const L = require("./finLancamentos");
const regra = require("./finDizimoDigital");

const MUDOU = (mensagem) => ({ sucesso: false, conflito: true, mensagem });
const milhar = (n) => Number(n).toLocaleString("pt-BR");
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const EXCLUIDO_LGPD = "EXISTS (SELECT 1 FROM SolicitacoesTitularLGPD s WHERE s.MembroId = m.MembroId AND s.Tipo = 'EXCLUSAO' AND s.Status = 'ATENDIDA')";
const CONTA = "Conta geral da Igreja (Pix pelo CNPJ)";
const SEM_FICHA = "Não foi possível informar o Pix por aqui: fale com a secretaria da sua congregação.";
const ehVerdade = (v) => v === true || Number(v) === 1;
const quandoPix = (v) => (v instanceof Date ? v.toISOString().slice(0, 16) : String(v).slice(0, 16));

/** "Há 2 dízimos por Pix para ligar" (o aviso e a trava do salvar) */
const paraLigarTexto = (n) => (n === 1 ? "Há 1 dízimo por Pix para ligar" : `Há ${n} dízimos por Pix para ligar`);

// ---- o membro (meu-dizimo-digital) ----

// O membro informa um Pix. `membroId` é o da sessão (a rota confere com exigirTitular).
async function informar(pool, { membroId, dados }) {
  const v = regra.validarInforme(dados, hojeBrasilia());
  if (!v.ok) return { sucesso: false, mensagem: v.mensagem };
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    // a linha do membro travada: dois envios ao mesmo tempo não passam juntos do limite de Pix esperando
    const m = (await pedidoNaTransacao(t).input("m", sql.Int, membroId).query(`
      SELECT m.MembroId, m.CongregacaoId, c.Nome AS Congregacao
      FROM MembroReferencia m WITH (UPDLOCK, ROWLOCK) LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      WHERE m.MembroId = @m AND m.Status = 'ATIVO' AND NOT ${EXCLUIDO_LGPD}`)).recordset[0];
    if (!m || !m.CongregacaoId) return { sucesso: false, mensagem: SEM_FICHA };
    const abertos = Number((await pedidoNaTransacao(t).input("m", sql.Int, membroId)
      .query(`SELECT COUNT(*) AS n FROM FinDizimosDigitais WHERE MembroId = @m AND Situacao = 'INFORMADO'`)).recordset[0].n);
    if (abertos >= regra.MAX_ABERTOS_POR_MEMBRO) {
      return { sucesso: false, mensagem: `Você já tem ${abertos} Pix esperando a tesouraria. Espere ela escrever os recibos de papel.` };
    }
    const id = (await pedidoNaTransacao(t).input("m", sql.Int, membroId).input("c", sql.Int, m.CongregacaoId)
      .input("v", sql.Decimal(14, 2), L.decimalDoBanco(v.valor)).input("p", sql.NVarChar(19), v.pixEm).query(`
        INSERT INTO FinDizimosDigitais (MembroId, CongregacaoId, Valor, PixEm) OUTPUT INSERTED.DizimoDigitalId
        VALUES (@m, @c, @v, CAST(@p AS DATETIME2(0)))`)).recordset[0].DizimoDigitalId;
    await registrarAuditoriaNaTransacao(t, { tabela: "FinDizimosDigitais", registroId: Number(id), acao: "FIN_DIZIMO_DIGITAL_INFORMADO", usuarioId: membroId,
      dadosDepois: { congregacaoId: Number(m.CongregacaoId), valor: v.valor, pixEm: v.pixEm } });
    ok = true;
    return { sucesso: true, id: Number(id), mensagem: `Informado à tesouraria de ${m.Congregacao}. Ela escreve o recibo de papel e você recebe o número aqui.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// Os Pix do membro (os 50 mais novos), com os passos e o número do recibo de papel.
async function meus(pool, { membroId }) {
  const m = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT c.Nome AS Congregacao FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @m`)).recordset[0];
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT TOP 50 d.DizimoDigitalId, d.Valor, d.PixEm, d.Situacao, d.Folha, b.Numero AS Bloco, d.Motivo
    FROM FinDizimosDigitais d LEFT JOIN FinBlocos b ON b.BlocoId = d.BlocoId
    WHERE d.MembroId = @m ORDER BY d.PixEm DESC, d.DizimoDigitalId DESC`);
  return {
    sucesso: true, conta: CONTA, congregacao: (m && m.Congregacao) || null,
    digitais: r.recordset.map((d) => ({
      id: Number(d.DizimoDigitalId), valor: L.centavosDoBanco(d.Valor), pixEm: quandoPix(d.PixEm), situacao: d.Situacao, passo: regra.passoDe(d.Situacao),
      folha: d.Folha === null ? null : Number(d.Folha), bloco: d.Bloco === null || d.Bloco === undefined ? null : Number(d.Bloco), motivo: d.Motivo || null
    }))
  };
}

// ---- a tesouraria (financeiro/dizimo-digital) ----

// A folha digitada vale para ligar? (dentro da transação, com o bloco já travado, ou fora dela, na conferência da tela "livre · bloco 1.401")
async function conferirFolha(pedirSql, { congregacaoId, congregacao, folha }) {
  const n = milhar(folha);
  const fx = (await pedirSql().input("c", sql.Int, congregacaoId).input("f", sql.Int, folha).query(`
    WITH faixas AS (${FAIXAS("s.CongregacaoId = @c")})
    SELECT TOP 1 fx.SaidaId, fx.BlocoId, fx.Numero FROM faixas fx WHERE fx.Aberta = 1 AND @f BETWEEN fx.De AND fx.Ate`)).recordset[0];
  if (!fx) return { ok: false, mensagem: `A folha ${n} não é de um bloco em uso por ${congregacao}.` };
  const x = (await pedirSql().input("f", sql.Int, folha).query(`
    SELECT (SELECT Destino FROM FinFolhas WHERE Folha = @f) AS Destino,
           (SELECT COUNT(*) FROM FinDizimosDigitais WHERE Folha = @f) AS Ligadas`)).recordset[0];
  if (x.Destino === "LANCADA") return { ok: false, mensagem: `A folha ${n} já está lançada: confira no papel a próxima folha em branco.` };
  if (x.Destino) return { ok: false, mensagem: `A folha ${n} está marcada como ${regraBlocos.destinoDaTela(x.Destino)}: escolha outra folha em branco.` };
  if (Number(x.Ligadas)) return { ok: false, mensagem: `A folha ${n} já está ligada a outro dízimo por Pix.` };
  return { ok: true, saidaId: Number(fx.SaidaId), blocoId: Number(fx.BlocoId), bloco: Number(fx.Numero) };
}

// A lista da tesouraria de uma congregação (já conferida no escopo pela rota): os Pix esperando (todos) e os outros do mês de agora e do anterior;
// o último lançamento (a dica "no sistema, o último lançamento parou na 70.086"), os blocos em uso e quantos Pix houve no mês na Igreja toda ("raro").
async function lista(pool, { congregacaoId, podeLigar }) {
  const c = (await pool.request().input("c", sql.Int, congregacaoId).query(`
    SELECT c.CongregacaoId, c.Nome, a.Nome AS Area FROM Congregacoes c LEFT JOIN Areas a ON a.AreaId = c.AreaId WHERE c.CongregacaoId = @c`)).recordset[0];
  if (!c) return { naoExiste: true };
  const hoje = hojeBrasilia(), agora = L.mesDe(hoje), desde = L.mesAnterior(agora), seg = L.mesSeguinte(agora);
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("desde", sql.Date, desde).input("agora", sql.Date, agora).input("seg", sql.Date, seg).query(`
    SELECT TOP 100 d.DizimoDigitalId, m.Nome AS Membro, d.Valor, d.PixEm, d.Situacao, d.Folha, b.Numero AS Bloco, d.LigadoPelaGeral, d.Motivo,
           CASE WHEN l.Valor IS NULL THEN 0 ELSE 1 END AS Lancada
    FROM FinDizimosDigitais d
    JOIN MembroReferencia m ON m.MembroId = d.MembroId
    LEFT JOIN FinBlocos b ON b.BlocoId = d.BlocoId
    LEFT JOIN FinLancamentos l ON l.Folha = d.Folha
    WHERE d.CongregacaoId = @c AND (d.Situacao = 'INFORMADO' OR d.PixEm >= @desde)
    ORDER BY CASE WHEN d.Situacao = 'INFORMADO' THEN 0 ELSE 1 END, CASE WHEN d.Situacao = 'INFORMADO' THEN d.PixEm END, d.PixEm DESC, d.DizimoDigitalId DESC;
    WITH faixas AS (${FAIXAS("s.CongregacaoId = @c")})
    SELECT TOP 1 l.Folha, l.Dia FROM faixas fx JOIN FinLancamentos l ON l.Folha BETWEEN fx.De AND fx.Ate WHERE fx.Aberta = 1 ORDER BY l.Folha DESC;
    SELECT COUNT(*) AS n FROM FinDizimosDigitais WHERE PixEm >= @agora AND PixEm < @seg AND Situacao <> 'EXCLUIDO';
    WITH faixas AS (${FAIXAS("s.CongregacaoId = @c")})
    SELECT DISTINCT fx.Numero FROM faixas fx WHERE fx.Aberta = 1 ORDER BY fx.Numero;`);
  const [digitais, ultimo, igreja, abertos] = r.recordsets;
  const u = ultimo[0];
  return {
    sucesso: true, congregacao: { id: Number(c.CongregacaoId), nome: c.Nome, area: c.Area || null }, podeLigar, mes: agora, hoje,
    paraLigar: digitais.filter((d) => d.Situacao === "INFORMADO").length,
    ultimoLancamento: u ? { folha: Number(u.Folha), dia: iso(u.Dia) } : null,
    // os blocos em uso pela congregação (a trava: "A planilha do bloco 1.401 fica aberta para ver")
    blocos: abertos.map((b) => Number(b.Numero)),
    noMesNaIgreja: Number(igreja[0].n),
    digitais: digitais.map((d) => ({
      id: Number(d.DizimoDigitalId), membro: d.Membro, valor: L.centavosDoBanco(d.Valor), pixEm: quandoPix(d.PixEm), situacao: d.Situacao,
      passo: regra.passoDe(d.Situacao), folha: d.Folha === null ? null : Number(d.Folha), bloco: d.Bloco === null || d.Bloco === undefined ? null : Number(d.Bloco),
      lancada: ehVerdade(d.Lancada), pelaGeral: ehVerdade(d.LigadoPelaGeral), motivo: d.Motivo || null
    }))
  };
}

// A conferência da folha na hora em que se digita ("livre · bloco 1.401"), sem gravar nada (a congregação já conferida no escopo pela rota).
async function folhaParaLigar(pool, { congregacaoId, folha }) {
  const f = regra.folhaParaLigar(folha);
  if (!f) return { sucesso: false, mensagem: "Digite o número da folha do recibo de papel." };
  const c = (await pool.request().input("c", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @c`)).recordset[0];
  if (!c) return { naoExiste: true };
  const x = await conferirFolha(() => pool.request(), { congregacaoId, congregacao: c.Nome, folha: f });
  return x.ok ? { sucesso: true, folha: f, livre: true, bloco: x.bloco } : { sucesso: true, folha: f, livre: false, mensagem: x.mensagem };
}

// O Pix travado para ligar ou excluir: fora do escopo e o que não existe têm a mesma resposta.
async function pixTravado(t, usuario, { geral, id }) {
  const d = (await pedidoNaTransacao(t).input("id", sql.Int, id).query(`
    SELECT d.DizimoDigitalId, d.MembroId, d.CongregacaoId, d.Valor, d.PixEm, d.Situacao, d.Folha, c.Nome AS Congregacao
    FROM FinDizimosDigitais d WITH (UPDLOCK, ROWLOCK) JOIN Congregacoes c ON c.CongregacaoId = d.CongregacaoId
    WHERE d.DizimoDigitalId = @id`)).recordset[0];
  if (!d || (!geral && !auth.estaNoEscopo(usuario, d.Congregacao))) return null;
  return d;
}
const jaResolvido = (d) => (d.Situacao === "LIGADO" ? MUDOU(`Este Pix já foi ligado à folha ${milhar(d.Folha)}.`) : MUDOU("Este Pix já foi excluído."));
const idDoPix = (v) => (Number.isInteger(v) && v > 0 && v <= 2147483647 ? v : null);

// Ligar o Pix à folha do recibo de papel: a folha fica reservada para ele e se lança na planilha, preenchida com o Pix.
async function ligar(pool, usuario, { geral, dados, por }) {
  const id = idDoPix(dados.id);
  if (!id) return { naoExiste: true };
  const folha = regra.folhaParaLigar(dados.folha);
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    const d = await pixTravado(t, usuario, { geral, id });
    if (!d) return { sucesso: false, naoExiste: true };
    if (d.Situacao !== "INFORMADO") return jaResolvido(d);
    if (!folha) return { sucesso: false, mensagem: "Digite o número da folha do recibo de papel." };
    // o bloco da folha travado, como no lançamento e na exceção da folha (acha sem trava e trava a linha pela chave)
    const achado = (await pedidoNaTransacao(t).input("f", sql.Int, folha)
      .query(`SELECT TOP 1 BlocoId FROM FinBlocos WHERE PrimeiraFolha <= @f AND UltimaFolha >= @f ORDER BY PrimeiraFolha DESC`)).recordset[0];
    if (achado) await pedidoNaTransacao(t).input("b", sql.Int, achado.BlocoId).query(`SELECT BlocoId FROM FinBlocos WITH (UPDLOCK, ROWLOCK) WHERE BlocoId = @b`);
    const x = await conferirFolha(() => pedidoNaTransacao(t), { congregacaoId: Number(d.CongregacaoId), congregacao: d.Congregacao, folha });
    if (!x.ok) return { sucesso: false, mensagem: x.mensagem, folha };
    const u = await pedidoNaTransacao(t).input("id", sql.Int, id).input("b", sql.Int, x.blocoId).input("f", sql.Int, folha).input("s", sql.Int, x.saidaId)
      .input("por", sql.Int, por).input("g", sql.Bit, geral ? 1 : 0).query(`
        UPDATE FinDizimosDigitais SET Situacao = 'LIGADO', BlocoId = @b, Folha = @f, SaidaId = @s, LigadoPor = @por, LigadoEm = SYSUTCDATETIME(), LigadoPelaGeral = @g
        WHERE DizimoDigitalId = @id AND Situacao = 'INFORMADO'`);
    if (u.rowsAffected[0] !== 1) return MUDOU("Este Pix acabou de mudar. Confira a lista.");
    await registrarAuditoriaNaTransacao(t, { tabela: "FinDizimosDigitais", registroId: id, acao: "FIN_DIZIMO_DIGITAL_LIGADO", usuarioId: por,
      dadosDepois: { congregacaoId: Number(d.CongregacaoId), bloco: x.bloco, folha, pelaGeral: !!geral } });
    ok = true;
    return { sucesso: true, mensagem: `Pix ligado à folha ${milhar(folha)}: ao lançar, ela vem preenchida.`, folha, bloco: x.bloco };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// Excluir o Pix com o motivo; o membro é avisado do porquê (o aviso sai depois da transação e a falha dele não desfaz a exclusão).
async function excluir(pool, usuario, { geral, dados, por, avisar = criarNotificacao }) {
  const id = idDoPix(dados.id);
  if (!id) return { naoExiste: true };
  const v = regra.validarExclusao(dados);
  const t = await abrirTransacao(pool);
  let ok = false, aviso = null;
  try {
    const d = await pixTravado(t, usuario, { geral, id });
    if (!d) return { sucesso: false, naoExiste: true };
    if (d.Situacao !== "INFORMADO") return jaResolvido(d);
    if (!v.ok) return { sucesso: false, mensagem: v.mensagem };
    const u = await pedidoNaTransacao(t).input("id", sql.Int, id).input("motivo", sql.NVarChar(300), v.motivo).input("por", sql.Int, por).query(`
      UPDATE FinDizimosDigitais SET Situacao = 'EXCLUIDO', Motivo = @motivo, ExcluidoPor = @por, ExcluidoEm = SYSUTCDATETIME()
      WHERE DizimoDigitalId = @id AND Situacao = 'INFORMADO'`);
    if (u.rowsAffected[0] !== 1) return MUDOU("Este Pix acabou de mudar. Confira a lista.");
    const valor = L.centavosDoBanco(d.Valor);
    await registrarAuditoriaNaTransacao(t, { tabela: "FinDizimosDigitais", registroId: id, acao: "FIN_DIZIMO_DIGITAL_EXCLUIDO", usuarioId: por,
      dadosDepois: { congregacaoId: Number(d.CongregacaoId), valor, motivo: v.motivo, pelaGeral: !!geral } });
    const p = quandoPix(d.PixEm);
    aviso = {
      regraChave: "DIZIMO_DIGITAL_EXCLUIDO", destinatarioMembroId: Number(d.MembroId), titulo: "O seu dízimo por Pix não foi confirmado",
      mensagem: `A tesouraria de ${d.Congregacao} não confirmou o Pix de R$ ${L.reais(valor)} (${p.slice(8, 10)}/${p.slice(5, 7)}, ${p.slice(11, 13)}h${p.slice(14, 16)}). O motivo: ${v.motivo}`,
      categoria: "FINANCEIRO", referenciaTabela: "FinDizimosDigitais", referenciaId: id
    };
    ok = true;
  } finally {
    await fecharTransacao(t, ok);
  }
  try { await avisar(pool, aviso); } catch { /* o aviso não desfaz a exclusão: o membro vê o motivo na página dele */ }
  return { sucesso: true, mensagem: "Pix excluído. O membro é avisado do motivo." };
}

// A área acompanha: de cada congregação do escopo, os Pix do mês e os que esperam a tesouraria.
async function area(pool, usuario) {
  const hoje = hojeBrasilia(), agora = L.mesDe(hoje), seg = L.mesSeguinte(agora);
  const pedido = pool.request().input("agora", sql.Date, agora).input("seg", sql.Date, seg);
  const cond = await condicaoSqlEscopoCongregacao(pool, usuario, pedido, "c.CongregacaoId");
  if (cond === "") return { sucesso: true, mes: agora, congregacoes: [], resumo: { noMes: 0, paraLigar: 0 } };
  const r = await pedido.query(`
    SELECT c.CongregacaoId, c.Nome, ISNULL(x.NoMes, 0) AS NoMes, ISNULL(x.ParaLigar, 0) AS ParaLigar
    FROM Congregacoes c
    OUTER APPLY (SELECT SUM(CASE WHEN d.PixEm >= @agora AND d.PixEm < @seg AND d.Situacao <> 'EXCLUIDO' THEN 1 ELSE 0 END) AS NoMes,
                        SUM(CASE WHEN d.Situacao = 'INFORMADO' THEN 1 ELSE 0 END) AS ParaLigar
                 FROM FinDizimosDigitais d WHERE d.CongregacaoId = c.CongregacaoId) x
    WHERE c.Ativa = 1 ${cond ? "AND " + cond : ""}
    ORDER BY c.Nome`);
  const congregacoes = r.recordset.map((c) => ({ id: Number(c.CongregacaoId), nome: c.Nome, noMes: Number(c.NoMes), paraLigar: Number(c.ParaLigar) }));
  return {
    sucesso: true, mes: agora, congregacoes,
    resumo: { noMes: congregacoes.reduce((s, c) => s + c.noMes, 0), paraLigar: congregacoes.reduce((s, c) => s + c.paraLigar, 0) }
  };
}

module.exports = { informar, meus, lista, folhaParaLigar, ligar, excluir, area, paraLigarTexto, CONTA };
