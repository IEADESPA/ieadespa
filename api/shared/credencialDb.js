// shared/credencialDb.js (v8.4 — Credencial digital com QR Code)
// O banco da credencial. A regra pura está em shared/credencial.js; o desenho, em docs/plano/fase-8-ministerial-afm.md.
//
// - Uma credencial VÁLIDA por pessoa (índice filtrado). Emitir, nova via e cancelar correm sob a trava "credencial_<pessoa>": dois cliques ao mesmo tempo não emitem
//   duas. A nova via encerra a anterior (SUBSTITUIDA) na mesma transação; nada se apaga.
// - A situação pública é calculada na hora da leitura (Art. 76 §1º). Para o obreiro, só a sanção aplicada ou o afastamento cautelar suspendem a credencial — um
//   processo apenas aberto, ainda sem julgamento, não aparece para quem lê o QR.
const { sql } = require("./db");
const regra = require("./credencial");
const certificados = require("./certificados");
const { CONDICAO_SQL_ATIVO } = require("./disciplina");
const { obterTrava } = require("./financeiroSeguro");
const { registrarAuditoria } = require("./auditoria");
const { violouUnicidade } = require("./violacaoUnica");

const NAO_EXISTE = { sucesso: false, naoExiste: true };
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });
const dia = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

const SELECT_PESSOA = `
  SELECT m.MembroId, m.Nome, m.Status, m.SituacaoMembro, m.CargoMinisterial, m.FotoUrl, cg.Nome AS Congregacao, ex.Nome AS Extensao,
         (SELECT TOP 1 a.StatusMatricula FROM Matriculas_AFM a WHERE a.MembroId = m.MembroId ORDER BY a.MatriculaId DESC) AS StatusMatricula,
         CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = ProcessosDisciplinares.PenalidadeId
                           WHERE ProcessosDisciplinares.MembroId = m.MembroId AND ProcessosDisciplinares.Status <> N'EM_ANDAMENTO' AND ${CONDICAO_SQL_ATIVO}) THEN 1 ELSE 0 END AS Afastado
  FROM MembroReferencia m
  LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
  LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId`;

function mapearPessoa(l) {
  return {
    membroId: Number(l.MembroId), nome: l.Nome, status: l.Status, situacaoMembro: l.SituacaoMembro, cargo: l.CargoMinisterial || null, fotoUrl: l.FotoUrl || null,
    congregacao: l.Congregacao || null, extensao: l.Extensao || null, statusMatricula: l.StatusMatricula || null, sobDisciplina: !!l.Afastado
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

// Emissão em lote: os membros ativos em comunhão que ainda não têm credencial válida (até `limite` por vez).
async function emitirEmLote(pool, { por, limite = 300 }) {
  const r = await pool.request().input("lim", sql.Int, limite).query(`
    SELECT TOP (@lim) m.MembroId FROM MembroReferencia m
    WHERE m.Status = N'ATIVO' AND (m.SituacaoMembro = N'EM_COMUNHAO' OR m.SituacaoMembro IS NULL)
      AND NOT EXISTS (SELECT 1 FROM CredenciaisEclesiasticas c WHERE c.MembroId = m.MembroId AND c.Situacao = N'VALIDA')
    ORDER BY m.MembroId`);
  let emitidas = 0;
  for (const l of r.recordset) {
    const x = await emitir(pool, { membroId: l.MembroId, por });
    if (x.sucesso) emitidas++;
  }
  const faltam = Number((await pool.request().query(`
    SELECT COUNT(*) AS n FROM MembroReferencia m
    WHERE m.Status = N'ATIVO' AND (m.SituacaoMembro = N'EM_COMUNHAO' OR m.SituacaoMembro IS NULL)
      AND NOT EXISTS (SELECT 1 FROM CredenciaisEclesiasticas c WHERE c.MembroId = m.MembroId AND c.Situacao = N'VALIDA')`)).recordset[0].n);
  return { sucesso: true, emitidas, faltam, mensagem: `${emitidas} credencial(is) emitida(s).${faltam ? ` Faltam ${faltam}: rode de novo.` : " Todos os membros ativos têm credencial."}` };
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
async function cancelarNoDesligamento(pool, membroId, motivo) {
  await pool.request().input("m", sql.Int, Number(membroId)).input("motivo", sql.NVarChar(300), motivo || "Desligamento")
    .query(`UPDATE CredenciaisEclesiasticas SET Situacao = N'CANCELADA', EncerradaEm = SYSUTCDATETIME(), MotivoEncerramento = @motivo
            WHERE MembroId = @m AND Situacao = N'VALIDA'`);
}

// A pessoa pede a impressão (Art. 76 §2º: só a Secretaria Geral imprime). Pedir de novo não muda nada.
async function pedirImpressao(pool, { membroId }) {
  const upd = await pool.request().input("m", sql.Int, Number(membroId))
    .query(`UPDATE CredenciaisEclesiasticas SET ImpressaoSolicitadaEm = SYSUTCDATETIME() WHERE MembroId = @m AND Situacao = N'VALIDA' AND ImpressaoSolicitadaEm IS NULL AND ImpressaEm IS NULL`);
  if (upd.rowsAffected[0]) {
    await registrarAuditoria({ tabela: "CredenciaisEclesiasticas", registroId: Number(membroId), acao: "CREDENCIAL_IMPRESSAO_PEDIDA", usuarioId: Number(membroId) });
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

// A lista da Secretaria: as credenciais válidas (com o pedido de impressão), as encerradas recentes e quantos membros ativos ainda não têm.
async function listar(pool) {
  const r = await pool.request().query(`
    SELECT TOP 2000 c.*, m.Nome, m.CargoMinisterial, cg.Nome AS Congregacao
    FROM CredenciaisEclesiasticas c JOIN MembroReferencia m ON m.MembroId = c.MembroId LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
    WHERE c.Situacao = N'VALIDA' OR c.EncerradaEm >= DATEADD(day, -60, SYSUTCDATETIME())
    ORDER BY CASE WHEN c.ImpressaoSolicitadaEm IS NOT NULL AND c.ImpressaEm IS NULL THEN 0 ELSE 1 END, m.Nome`);
  const semCredencial = Number((await pool.request().query(`
    SELECT COUNT(*) AS n FROM MembroReferencia m
    WHERE m.Status = N'ATIVO' AND (m.SituacaoMembro = N'EM_COMUNHAO' OR m.SituacaoMembro IS NULL)
      AND NOT EXISTS (SELECT 1 FROM CredenciaisEclesiasticas c WHERE c.MembroId = m.MembroId AND c.Situacao = N'VALIDA')`)).recordset[0].n);
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
  pessoa, credencialValida, urlCredencial, emitir, emitirEmLote, novaVia, cancelar, cancelarNoDesligamento, pedirImpressao, registrarImpressao, listar, minha,
  verificarPublica, dadosDoCartao, dadosDoTitular
};
