// shared/credencialDb.js (v8.4 — Credencial digital com QR Code)
// O banco da credencial. A regra pura está em shared/credencial.js; o desenho, em docs/plano/fase-8-ministerial-afm.md.
//
// - Uma credencial VÁLIDA por pessoa (índice filtrado). Emitir, nova via e cancelar correm sob a trava "credencial_<pessoa>": dois cliques ao mesmo tempo não emitem
//   duas. A nova via encerra a anterior (SUBSTITUIDA) na mesma transação; nada se apaga.
// - A situação pública é calculada na hora da leitura (Art. 76 §1º). Para o obreiro, só a sanção aplicada ou o afastamento cautelar suspendem a credencial — um
//   processo apenas aberto, ainda sem julgamento, não aparece para quem lê o QR.
// - A disciplina não muda o cadastro: a exclusão em vigor e a Disciplina Rigorosa em vigor vêm do processo (revisão independente, 28/10/2026). O recurso não tem
//   efeito suspensivo (Art. 92 §2º): o processo original "em recurso" continua valendo até o recurso ser julgado. A exclusão ainda pendente de homologação do CEI
//   não tira a membresia, mas já afasta das funções (o QR diz "Obreiro inativo") — Trava 8-A, o mesmo critério da licença para oficiar e da Comissão de Unção.
const { sql } = require("./db");
const regra = require("./credencial");
const certificados = require("./certificados");
const { obterTrava } = require("./financeiroSeguro");
const { registrarAuditoria } = require("./auditoria");
const { violouUnicidade } = require("./violacaoUnica");

const NAO_EXISTE = { sucesso: false, naoExiste: true };
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });
// a data de Brasília (UTC−3, sem horário de verão) de um instante gravado em UTC
const dia = (v) => (v == null ? null : new Date(new Date(v).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10));

// As marcas da disciplina (excluída, fora da comunhão, afastada das funções) e a matrícula da AFM vêm do lugar único da Trava 8-A (shared/habilitacao.js).
const { MARCAS_DISCIPLINA, STATUS_MATRICULA } = require("./habilitacao");

const SELECT_PESSOA = `
  SELECT m.MembroId, m.Nome, m.Status, m.SituacaoMembro, m.CargoMinisterial, m.FotoUrl, cg.Nome AS Congregacao, ex.Nome AS Extensao,
         ${STATUS_MATRICULA},
         ${MARCAS_DISCIPLINA}
  FROM MembroReferencia m
  LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
  LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId`;

function mapearPessoa(l) {
  return {
    membroId: Number(l.MembroId), nome: l.Nome, status: l.Status, situacaoMembro: l.SituacaoMembro, cargo: l.CargoMinisterial || null, fotoUrl: l.FotoUrl || null,
    congregacao: l.Congregacao || null, extensao: l.Extensao || null, statusMatricula: l.StatusMatricula || null, sobDisciplina: !!l.Afastado,
    excluido: !!l.Excluido, foraDaComunhao: !!l.ForaDaComunhao
  };
}
async function pessoa(conexao, membroId) {
  const r = await new sql.Request(conexao).input("m", sql.Int, Number(membroId)).query(`${SELECT_PESSOA} WHERE m.MembroId = @m`);
  return r.recordset[0] ? mapearPessoa(r.recordset[0]) : null;
}

function mapearCredencial(l) {
  return {
    credencialId: l.CredencialId, membroId: Number(l.MembroId), via: l.Via, codigo: certificados.formatarCodigo(l.Codigo), situacao: l.Situacao,
    emitidaEm: l.EmitidaEm, encerradaEm: l.EncerradaEm || null, motivoEncerramento: l.MotivoEncerramento || null,
    impressaoSolicitadaEm: l.ImpressaoSolicitadaEm || null, impressaEm: l.ImpressaEm || null
  };
}
async function credencialValida(conexao, membroId) {
  const r = await new sql.Request(conexao).input("m", sql.Int, Number(membroId))
    .query(`SELECT * FROM CredenciaisEclesiasticas WHERE MembroId = @m AND Situacao = N'VALIDA'`);
  return r.recordset[0] ? mapearCredencial(r.recordset[0]) : null;
}

const urlCredencial = (codigo) => certificados.urlVerificacao(codigo).replace("/verificar.html?c=", "/credencial.html?c=");

async function comTrava(pool, membroId, fazer) {
  const t = new sql.Transaction(pool);
  await t.begin();
  const fechar = async (ok) => { try { if (ok) await t.commit(); else await t.rollback(); } catch (e) { /* já encerrada */ } };
  try {
    if (!(await obterTrava(() => new sql.Request(t), `credencial_${Number(membroId)}`))) { await fechar(false); return MUDOU("Outra alteração desta credencial está em andamento. Tente de novo."); }
    const r = await fazer(t);
    await fechar(!(r && r.sucesso === false));
    return r;
  } catch (e) { await fechar(false); throw e; }
}

// Insere a via `via` com um código novo (o código colide com chance astronômica: sorteia de novo; nunca coincide com o de um certificado).
async function inserirVia(t, { membroId, via, por }) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const codigo = certificados.gerarCodigoVerificacao();
    try {
      const r = await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("v", sql.Int, via).input("c", sql.NVarChar(20), codigo).input("por", sql.Int, por)
        .query(`INSERT INTO CredenciaisEclesiasticas (MembroId, Via, Codigo, EmitidaPor) OUTPUT INSERTED.CredencialId
                SELECT @m, @v, @c, @por WHERE NOT EXISTS (SELECT 1 FROM CertificadosEmitidos WHERE CodigoVerificacao = @c)`);
      if (r.recordset[0]) return r.recordset[0].CredencialId;
    } catch (e) {
      if (!violouUnicidade(e) || !/Codigo/.test(String(e.message)) || tentativa === 3) throw e;
    }
  }
  throw new Error("não foi possível gerar um código único para a credencial");
}

async function emitir(pool, { membroId, por }) {
  const r = await comTrava(pool, membroId, async (t) => {
    const p = await pessoa(t, membroId);
    if (!p) return NAO_EXISTE;
    const pode = regra.podeReceber(p);
    if (!pode.pode) return { sucesso: false, mensagem: pode.mensagem };
    if (await credencialValida(t, membroId)) return MUDOU("Esta pessoa já tem uma credencial válida. Para trocar, emita uma nova via.");
    const via = Number((await new sql.Request(t).input("m", sql.Int, Number(membroId)).query(`SELECT ISNULL(MAX(Via), 0) + 1 AS v FROM CredenciaisEclesiasticas WHERE MembroId = @m`)).recordset[0].v);
    const credencialId = await inserirVia(t, { membroId, via, por });
    return { sucesso: true, credencialId, via, nome: p.nome };
  });
  if (!r.sucesso) return r;
  await registrarAuditoria({ tabela: "CredenciaisEclesiasticas", registroId: r.credencialId, acao: "CREDENCIAL_EMITIDA", usuarioId: por, dadosDepois: { membroId: Number(membroId), via: r.via } });
  return { sucesso: true, credencialId: r.credencialId, mensagem: `Credencial emitida (via ${r.via}). A pessoa já a vê no Meu Painel.` };
}

// Quem o lote alcança: membro ativo (ou de licença) em comunhão, ADULTO (a criança recebe pela emissão individual, a pedido da família), que NUNCA teve credencial — quem
// teve a sua cancelada pela Secretaria não volta a receber sozinho (revisão independente, 28/10/2026) — e sem as marcas da disciplina.
const SQL_ELEGIVEIS_LOTE = `
  SELECT x.MembroId FROM (
    SELECT m.MembroId, ${MARCAS_DISCIPLINA}
    FROM MembroReferencia m
    WHERE m.Status IN (N'ATIVO', N'LICENÇA', N'LICENCA_CANDIDATURA') AND (m.SituacaoMembro = N'EM_COMUNHAO' OR m.SituacaoMembro IS NULL)
      AND (m.DataNascimento IS NULL OR m.DataNascimento <= DATEADD(year, -18, CAST(DATEADD(hour, -3, SYSUTCDATETIME()) AS date)))
      AND NOT EXISTS (SELECT 1 FROM CredenciaisEclesiasticas c WHERE c.MembroId = m.MembroId)
  ) x WHERE x.Excluido = 0 AND x.ForaDaComunhao = 0`;

// Emissão em lote, `limite` por vez (cada emissão é uma transação com trava: 60 cabem com folga no prazo de uma requisição).
async function emitirEmLote(pool, { por, limite = 60 }) {
  const r = await pool.request().input("lim", sql.Int, limite).query(`SELECT TOP (@lim) e.MembroId FROM (${SQL_ELEGIVEIS_LOTE}) e ORDER BY e.MembroId`);
  let emitidas = 0;
  for (const l of r.recordset) {
    const x = await emitir(pool, { membroId: l.MembroId, por });
    if (x.sucesso) emitidas++;
  }
  const faltam = Number((await pool.request().query(`SELECT COUNT(*) AS n FROM (${SQL_ELEGIVEIS_LOTE}) e`)).recordset[0].n);
  return { sucesso: true, emitidas, faltam, mensagem: `${emitidas} credencial(is) emitida(s).${faltam ? ` Faltam ${faltam}: clique de novo.` : " Todos os membros adultos ativos que nunca tiveram credencial já têm."}` };
}

// Nova via (perda, roubo, foto ou cargo novo): a anterior deixa de valer na mesma hora.
async function novaVia(pool, { membroId, motivo, por }) {
  const r = await comTrava(pool, membroId, async (t) => {
    const p = await pessoa(t, membroId);
    if (!p) return NAO_EXISTE;
    const pode = regra.podeReceber(p);
    if (!pode.pode) return { sucesso: false, mensagem: pode.mensagem };
    const atual = await credencialValida(t, membroId);
    if (!atual) return { sucesso: false, mensagem: "Esta pessoa não tem credencial válida: use \"Emitir\"." };
    await new sql.Request(t).input("id", sql.Int, atual.credencialId).input("motivo", sql.NVarChar(300), motivo).input("por", sql.Int, por)
      .query(`UPDATE CredenciaisEclesiasticas SET Situacao = N'SUBSTITUIDA', EncerradaEm = SYSUTCDATETIME(), EncerradaPor = @por, MotivoEncerramento = @motivo
              WHERE CredencialId = @id AND Situacao = N'VALIDA'`);
    const via = atual.via + 1;
    const credencialId = await inserirVia(t, { membroId, via, por });
    return { sucesso: true, credencialId, via, anterior: atual.credencialId };
  });
  if (!r.sucesso) return r;
  await registrarAuditoria({ tabela: "CredenciaisEclesiasticas", registroId: r.credencialId, acao: "CREDENCIAL_NOVA_VIA", usuarioId: por, dadosDepois: { membroId: Number(membroId), via: r.via, anterior: r.anterior, motivo } });
  return { sucesso: true, credencialId: r.credencialId, mensagem: `Nova via emitida (via ${r.via}): a anterior deixou de valer.` };
}

// Trava 8-A — a diplomação entrega a Credencial Ministerial (Regimento Art. 10) e a v8.4 prometeu "mudou o cargo → nova via". Depois da cerimônia: quem NUNCA teve
// credencial recebe a primeira (quem teve a sua cancelada pela Secretaria não volta a receber sozinho, como no lote); quem tem o cartão IMPRESSO ganha uma nova via
// já com o pedido de impressão (o cartão impresso mostra o cargo anterior; o QR dele passa a dizer "substituída"); a credencial só digital já mostra o cargo novo.
// Nunca derruba a cerimônia: devolve "EMITIDA", "NOVA_VIA", "ATUAL" ou null.
async function aposConsagracao(pool, { membroId, cargoRotulo, por }) {
  try {
    const atual = await credencialValida(pool, membroId);
    if (!atual) {
      const teve = (await pool.request().input("m", sql.Int, Number(membroId)).query(`SELECT TOP 1 1 AS x FROM CredenciaisEclesiasticas WHERE MembroId = @m`)).recordset.length;
      if (teve) return null;
      return (await emitir(pool, { membroId, por })).sucesso ? "EMITIDA" : null;
    }
    if (!atual.impressaEm) return "ATUAL";
    const r = await novaVia(pool, { membroId, motivo: `Consagração a ${cargoRotulo}: o cartão impresso tem o cargo anterior.`, por });
    if (!r.sucesso) return null;
    await pool.request().input("id", sql.Int, r.credencialId).query(`UPDATE CredenciaisEclesiasticas SET ImpressaoSolicitadaEm = SYSUTCDATETIME() WHERE CredencialId = @id AND ImpressaoSolicitadaEm IS NULL`);
    return "NOVA_VIA";
  } catch (e) {
    console.error("[credencial] depois da consagração:", e && e.message);
    return null;
  }
}

async function cancelar(pool, { membroId, motivo, por }) {
  const r = await comTrava(pool, membroId, async (t) => {
    const atual = await credencialValida(t, membroId);
    if (!atual) return { sucesso: false, mensagem: "Esta pessoa não tem credencial válida." };
    await new sql.Request(t).input("id", sql.Int, atual.credencialId).input("motivo", sql.NVarChar(300), motivo).input("por", sql.Int, por)
      .query(`UPDATE CredenciaisEclesiasticas SET Situacao = N'CANCELADA', EncerradaEm = SYSUTCDATETIME(), EncerradaPor = @por, MotivoEncerramento = @motivo
              WHERE CredencialId = @id AND Situacao = N'VALIDA'`);
    return { sucesso: true, credencialId: atual.credencialId };
  });
  if (!r.sucesso) return r;
  await registrarAuditoria({ tabela: "CredenciaisEclesiasticas", registroId: r.credencialId, acao: "CREDENCIAL_CANCELADA", usuarioId: por, dadosDepois: { membroId: Number(membroId), motivo } });
  return { sucesso: true, mensagem: "Credencial cancelada: o QR passa a dizer \"cancelada\"." };
}

// Desligamento e minimização (o recolhimento do Art. 95 §2º, IV, a): a credencial válida é cancelada junto.
async function cancelarNoDesligamento(pool, membroId, motivo, por = null) {
  const r = await pool.request().input("m", sql.Int, Number(membroId)).input("motivo", sql.NVarChar(300), motivo || "Desligamento").input("por", sql.Int, por)
    .query(`UPDATE CredenciaisEclesiasticas SET Situacao = N'CANCELADA', EncerradaEm = SYSUTCDATETIME(), EncerradaPor = @por, MotivoEncerramento = @motivo
            OUTPUT INSERTED.CredencialId
            WHERE MembroId = @m AND Situacao = N'VALIDA'`);
  const cancelada = r && r.recordset && r.recordset[0];
  if (cancelada) {
    await registrarAuditoria({ tabela: "CredenciaisEclesiasticas", registroId: cancelada.CredencialId, acao: "CREDENCIAL_RECOLHIDA", usuarioId: por, dadosDepois: { membroId: Number(membroId), motivo: motivo || "Desligamento" } });
  }
}

// Os desligamentos que não passam pela minimização (saída registrada, abandono, exclusão homologada): o recolhimento é melhor esforço — a situação do QR já é calculada
// na hora; isto só tira a via da lista de "válidas" da Secretaria. Nunca derruba o ato principal.
async function recolherSemFalhar(pool, membroId, motivo, por) {
  try { await cancelarNoDesligamento(pool, membroId, motivo, por); } catch (e) { console.error("[credencial] recolhimento não gravado (o QR já mostra a situação):", e && e.message); }
}

// A pessoa pede a impressão (Art. 76 §2º: só a Secretaria Geral imprime). Pedir de novo não muda nada.
async function pedirImpressao(pool, { membroId }) {
  const upd = await pool.request().input("m", sql.Int, Number(membroId))
    .query(`UPDATE CredenciaisEclesiasticas SET ImpressaoSolicitadaEm = SYSUTCDATETIME() WHERE MembroId = @m AND Situacao = N'VALIDA' AND ImpressaoSolicitadaEm IS NULL AND ImpressaEm IS NULL`);
  if (upd.rowsAffected[0]) {
    const c = await credencialValida(pool, membroId);
    await registrarAuditoria({ tabela: "CredenciaisEclesiasticas", registroId: c ? c.credencialId : 0, acao: "CREDENCIAL_IMPRESSAO_PEDIDA", usuarioId: Number(membroId), dadosDepois: { membroId: Number(membroId) } });
    return { sucesso: true, mensagem: "Pedido enviado à Secretaria Geral. A impressão é gratuita." };
  }
  const atual = await credencialValida(pool, membroId);
  if (!atual) return { sucesso: false, mensagem: "Você ainda não tem credencial. Fale com a Secretaria." };
  return { sucesso: true, mensagem: atual.impressaEm ? "Esta via já foi impressa pela Secretaria." : "O pedido já está com a Secretaria." };
}

async function registrarImpressao(pool, { credencialId, por }) {
  const upd = await pool.request().input("id", sql.Int, Number(credencialId)).input("por", sql.Int, por)
    .query(`UPDATE CredenciaisEclesiasticas SET ImpressaEm = SYSUTCDATETIME(), ImpressaPor = @por WHERE CredencialId = @id AND Situacao = N'VALIDA' AND ImpressaEm IS NULL`);
  if (!upd.rowsAffected[0]) return MUDOU("Esta credencial já foi impressa ou não vale mais. Atualize a lista.");
  await registrarAuditoria({ tabela: "CredenciaisEclesiasticas", registroId: Number(credencialId), acao: "CREDENCIAL_IMPRESSA", usuarioId: por });
  return { sucesso: true, mensagem: "Impressão registrada." };
}

// A lista da Secretaria. Sem busca: os pedidos de impressão pendentes e as mais recentes (até 300). Com busca (parte do nome ou a matrícula): as que batem, de qualquer
// época — assim nenhuma credencial fica fora do alcance de "nova via", "cancelar" e PDF, por maior que seja a igreja (revisão independente, 28/10/2026).
async function listar(pool, { busca } = {}) {
  const termo = typeof busca === "string" ? busca.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 100) : "";
  const req = pool.request().input("nome", sql.NVarChar(120), `%${termo.replace(/[[\]%_]/g, (x) => `[${x}]`)}%`).input("mat", sql.Int, /^\d{1,9}$/.test(termo) ? Number(termo) : -1);
  const r = await req.query(`
    SELECT TOP 300 c.*, m.Nome, m.CargoMinisterial, cg.Nome AS Congregacao
    FROM CredenciaisEclesiasticas c JOIN MembroReferencia m ON m.MembroId = c.MembroId LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
    WHERE ${termo ? "(m.Nome LIKE @nome OR m.MembroId = @mat)" : "(c.Situacao = N'VALIDA' OR c.EncerradaEm >= DATEADD(day, -60, SYSUTCDATETIME()))"}
    ORDER BY CASE WHEN c.Situacao = N'VALIDA' AND c.ImpressaoSolicitadaEm IS NOT NULL AND c.ImpressaEm IS NULL THEN 0 ELSE 1 END,
             ${termo ? "m.Nome, c.Via DESC" : "c.EmitidaEm DESC"}`);
  const semCredencial = Number((await pool.request().query(`SELECT COUNT(*) AS n FROM (${SQL_ELEGIVEIS_LOTE}) e`)).recordset[0].n);
  return {
    itens: r.recordset.map((l) => ({ ...mapearCredencial(l), codigo: undefined, nome: l.Nome, categoria: regra.categoria(l.CargoMinisterial), congregacao: l.Congregacao || null })),
    semCredencial
  };
}

// A credencial da própria pessoa (Meu Painel), com a situação de agora e a foto do cadastro (link assinado). `urlFoto`: função que assina o link (o storage).
async function minha(pool, membroId, urlFoto) {
  const c = await credencialValida(pool, membroId);
  if (!c) return { sucesso: true, credencial: null };
  const p = await pessoa(pool, membroId);
  let foto = null;
  try { foto = p && p.fotoUrl && urlFoto ? urlFoto(p.fotoUrl) : null; } catch (e) { foto = null; }
  return {
    sucesso: true,
    credencial: { ...c, nome: p.nome, matricula: p.membroId, categoria: regra.categoria(p.cargo), congregacao: p.congregacao, fotoUrl: foto, url: urlCredencial(c.codigo),
      situacaoAgora: regra.situacaoPublica(c, p) }
  };
}

// A leitura pública do QR. Só o mínimo (shared/credencial.js, situacaoPublica).
async function verificarPublica(pool, codigo) {
  if (!certificados.codigoValido(codigo)) return { situacao: "NAO_ENCONTRADA" };
  const r = await pool.request().input("c", sql.NVarChar(20), certificados.normalizarCodigo(codigo))
    .query(`SELECT MembroId, Situacao, Via FROM CredenciaisEclesiasticas WHERE Codigo = @c`);
  const c = r.recordset[0];
  if (!c) return { situacao: "NAO_ENCONTRADA" };
  return regra.situacaoPublica({ situacao: c.Situacao, via: c.Via }, await pessoa(pool, c.MembroId));
}

// Os dados que o PDF da credencial precisa (a credencial válida da pessoa).
async function dadosDoCartao(pool, membroId) {
  const c = await credencialValida(pool, membroId);
  if (!c) return null;
  const p = await pessoa(pool, membroId);
  return { ...c, nome: p.nome, matricula: p.membroId, categoria: regra.categoria(p.cargo), congregacao: p.congregacao, fotoUrlCrua: p.fotoUrl, url: urlCredencial(c.codigo), emitidaEmDia: dia(c.emitidaEm) };
}

// Meus Dados (LGPD): as vias (sem o código, que é o segredo do QR).
async function dadosDoTitular(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, Number(membroId))
    .query(`SELECT Via, Situacao, EmitidaEm, EncerradaEm, ImpressaoSolicitadaEm, ImpressaEm FROM CredenciaisEclesiasticas WHERE MembroId = @m ORDER BY Via`);
  return r.recordset.map((l) => ({ via: l.Via, situacao: l.Situacao, emitidaEm: dia(l.EmitidaEm), encerradaEm: dia(l.EncerradaEm), impressaEm: dia(l.ImpressaEm) }));
}

module.exports = {
  aposConsagracao,
  pessoa, credencialValida, urlCredencial, emitir, emitirEmLote, novaVia, cancelar, cancelarNoDesligamento, recolherSemFalhar, pedirImpressao, registrarImpressao, listar, minha,
  verificarPublica, dadosDoCartao, dadosDoTitular
};
