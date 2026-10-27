// shared/voluntarioPagamentoDb.js (Trava 7-C, decisão de 23/10/2026 — regras de dinheiro do voluntário: SÓ AVISAR)
//
// A parte com banco da regra pura de shared/voluntarioPagamento.js: reúne os fatos do fornecedor (pessoa física? ligado a qual matrícula? voluntário ativo? prebendado?
// quantos pagamentos nos últimos dias?), grava a saída JUNTO com os avisos que o tesoureiro confirmou (uma transação só: ou os dois, ou nenhum), devolve os avisos de
// uma saída, monta o resumo do mês para a Tesouraria geral e o que a pessoa vê em Meus Dados.
//
// "Voluntário ativo": tem o Termo de Adesão que vale hoje (Lei 9.608/98, art. 2º) OU está ativo numa equipe de escalas (quem serve sem o termo é voluntário do mesmo jeito,
// e o termo pendente já é cobrado pela v7.5).
"use strict";
const { sql } = require("./db");
const { hojeBrasilia } = require("./dataBrasilia");
const vp = require("./voluntarioPagamento");

const LIMITE_BUSCA = 15;

async function lerPrazo(pool, sigla, padrao) {
  const { lerPrazoDias } = require("./canaisDb");
  return lerPrazoDias(pool, sigla, padrao);
}
async function lerLimites(pool) {
  return {
    limite: await lerPrazo(pool, "TESOURARIA_HABITUAL_PAGAMENTOS", vp.LIMITE_PADRAO),
    janela: await lerPrazo(pool, "TESOURARIA_HABITUAL_JANELA_DIAS", vp.JANELA_PADRAO)
  };
}

async function ehVoluntarioAtivo(pool, membroId, hoje = hojeBrasilia()) {
  if (!membroId) return false;
  const { ADESAO_VIGENTE_SQL } = require("./voluntariadoDb");
  const r = await pool.request().input("m", sql.Int, membroId).input("hoje", sql.Date, hoje).query(`
    SELECT CASE WHEN a.AdesaoId IS NOT NULL THEN 1
                WHEN EXISTS (SELECT 1 FROM EscalasEquipeMembros em JOIN EscalasEquipes e ON e.EquipeId = em.EquipeId AND e.Ativa = 1
                             WHERE em.MembroId = m.MembroId AND em.Ativo = 1) THEN 1 ELSE 0 END AS Voluntario
    FROM MembroReferencia m LEFT JOIN ${ADESAO_VIGENTE_SQL}
    WHERE m.MembroId = @m`);
  return !!(r.recordset[0] && Number(r.recordset[0].Voluntario) === 1);
}

// Os fatos do fornecedor para a regra pura. null = fornecedor não existe.
async function fatosDoFornecedor(pool, { fornecedorId, descricao = "", hoje = hojeBrasilia() }) {
  const f = (await pool.request().input("id", sql.Int, fornecedorId).query(`
    SELECT f.FornecedorId, f.Tipo, f.MembroId,
           CASE WHEN EXISTS (SELECT 1 FROM Prebendados pb WHERE pb.FornecedorId = f.FornecedorId) THEN 1 ELSE 0 END AS Prebendado
    FROM Fornecedores f WHERE f.FornecedorId = @id`)).recordset[0];
  if (!f) return null;
  const { limite, janela } = await lerLimites(pool);
  let datas = [];
  if (f.Tipo === "PF") {
    // A data da solicitação em Brasília (UTC-3): a semana do pagamento é a do calendário da Igreja.
    datas = (await pool.request().input("id", sql.Int, fornecedorId).input("janela", sql.Int, janela).query(`
      SELECT CONVERT(varchar(10), DATEADD(HOUR, -3, s.SolicitadoEm), 23) AS Data
      FROM SaidasTesouraria s
      WHERE s.FornecedorId = @id AND s.Status NOT IN ('REJEITADA', 'CANCELADA') AND s.SolicitadoEm >= DATEADD(DAY, -@janela, SYSUTCDATETIME())`)).recordset.map((x) => x.Data);
  }
  return {
    pessoaFisica: f.Tipo === "PF", prebendado: !!Number(f.Prebendado), membroId: f.MembroId || null,
    voluntario: f.Tipo === "PF" && f.MembroId ? await ehVoluntarioAtivo(pool, f.MembroId, hoje) : false,
    datasPagamentos: datas, limite, janela, descricao
  };
}

// Os avisos que valem AGORA para uma saída a este fornecedor com esta descrição.
async function avisosParaSaida(pool, { fornecedorId, descricao, hoje = hojeBrasilia() }) {
  const fatos = await fatosDoFornecedor(pool, { fornecedorId, descricao, hoje });
  return fatos ? vp.avaliarAvisos(fatos, { hoje }) : [];
}

// Grava a saída e os avisos confirmados numa transação só (o lote abaixo roda com XACT_ABORT: um erro desfaz os dois). Devolve o SaidaId.
async function inserirSaidaComAvisos(pool, campos, avisos, por) {
  const lista = (avisos || []).map((a) => ({ codigo: a.codigo, texto: String(a.texto).slice(0, 600) }));
  const r = await pool.request()
    .input("congregacaoId", sql.Int, campos.congregacaoId)
    .input("fornecedorId", sql.Int, campos.fornecedorId)
    .input("tipo", sql.NVarChar(30), campos.tipo)
    .input("descricao", sql.NVarChar(300), campos.descricao)
    .input("valor", sql.Decimal(10, 2), campos.valor)
    .input("campanhaId", sql.Int, campos.campanhaId || null)
    .input("documentoFiscalUrl", sql.NVarChar(500), campos.documentoFiscalUrl)
    .input("solicitadoPor", sql.Int, por)
    .input("bemId", sql.Int, campos.bemId || null)
    .input("notaFiscalCnpj", sql.Bit, campos.notaFiscalCnpj)
    .input("avisos", sql.NVarChar(sql.MAX), JSON.stringify(lista))
    .query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @nova TABLE (SaidaId INT);
      INSERT INTO SaidasTesouraria (CongregacaoId, FornecedorId, Tipo, Descricao, Valor, CampanhaId, DocumentoFiscalUrl, SolicitadoPor, BemId, NotaFiscalCnpjIgrejaConfirmado)
        OUTPUT INSERTED.SaidaId INTO @nova
        VALUES (@congregacaoId, @fornecedorId, @tipo, @descricao, @valor, @campanhaId, @documentoFiscalUrl, @solicitadoPor, @bemId, @notaFiscalCnpj);
      INSERT INTO SaidaAvisosVoluntario (SaidaId, Codigo, Texto, ConfirmadoPorMembroId)
        SELECT n.SaidaId, j.codigo, j.texto, @solicitadoPor
        FROM @nova n CROSS JOIN OPENJSON(@avisos) WITH (codigo NVARCHAR(30) '$.codigo', texto NVARCHAR(600) '$.texto') j;
      COMMIT TRANSACTION;
      SELECT SaidaId FROM @nova;`);
  return r.recordset[0].SaidaId;
}

// Os avisos registrados numa saída (a tela do detalhe mostra a quem aprova e paga).
async function avisosDaSaida(pool, saidaId) {
  const r = await pool.request().input("id", sql.Int, saidaId).query(`
    SELECT a.Codigo, a.Texto, m.Nome AS ConfirmadoPorNome, CONVERT(varchar(33), a.ConfirmadoEm, 126) AS ConfirmadoEm
    FROM SaidaAvisosVoluntario a JOIN MembroReferencia m ON m.MembroId = a.ConfirmadoPorMembroId
    WHERE a.SaidaId = @id ORDER BY a.AvisoId`);
  return r.recordset.map((x) => ({ codigo: x.Codigo, rotulo: vp.ROTULOS[x.Codigo] || x.Codigo, texto: x.Texto, confirmadoPorNome: x.ConfirmadoPorNome, confirmadoEm: x.ConfirmadoEm }));
}

// A busca do membro para ligar ao fornecedor pessoa física: por nome ou matrícula, só quem está no território de quem cadastra.
async function buscarMembros(pool, visao, texto) {
  const { filtrarPorEscopo } = require("./escopoRotas");
  const t = String(texto == null ? "" : texto).trim().slice(0, 100);
  if (t.length < 3 && !/^\d+$/.test(t)) return [];
  const rq = pool.request().input("nome", sql.NVarChar(120), `%${t.replace(/[[%_]/g, "[$&]")}%`).input("mat", sql.Int, /^\d{1,9}$/.test(t) ? Number(t) : null);
  const linhas = (await rq.query(`
    SELECT TOP 60 m.MembroId, m.Nome, c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    WHERE m.Status = 'ATIVO' AND (m.Nome LIKE @nome OR m.MembroId = @mat)
    ORDER BY m.Nome`)).recordset;
  return filtrarPorEscopo(visao, linhas, (l) => l.CongregacaoNome, (l) => l.ExtensaoNome).slice(0, LIMITE_BUSCA)
    .map((l) => ({ membroId: l.MembroId, nome: l.Nome, congregacaoNome: l.CongregacaoNome || null }));
}

// O resumo do mês para a Tesouraria geral (regra TESOURARIA_VOLUNTARIO_PAGO, PermissaoAlvo financeiro, nível Global): as pessoas que receberam pagamentos com aviso
// confirmado nos últimos dias da janela. Um aviso por mês (a referência é o mês), só se houver caso. Roda na rotina diária que já abre o banco (nada de rotina nova).
function chaveMensal(hoje) { const [a, m] = String(hoje).split("-").map(Number); return (a - 2000) * 12 + m; }
async function detectarMensal(pool, { hoje = hojeBrasilia() } = {}) {
  const { janela } = await lerLimites(pool);
  const linhas = (await pool.request().input("janela", sql.Int, janela).query(`
    SELECT f.FornecedorId, f.Nome AS FornecedorNome, a.Codigo
    FROM SaidaAvisosVoluntario a
    JOIN SaidasTesouraria s ON s.SaidaId = a.SaidaId
    JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
    WHERE a.ConfirmadoEm >= DATEADD(DAY, -@janela, SYSUTCDATETIME()) AND s.Status NOT IN ('REJEITADA', 'CANCELADA')
    GROUP BY f.FornecedorId, f.Nome, a.Codigo`)).recordset;
  if (!linhas.length) return [];
  const porFornecedor = new Map();
  for (const l of linhas) {
    if (!porFornecedor.has(l.FornecedorId)) porFornecedor.set(l.FornecedorId, { fornecedorNome: l.FornecedorNome, codigos: [] });
    porFornecedor.get(l.FornecedorId).codigos.push(l.Codigo);
  }
  for (const c of porFornecedor.values()) c.codigos.sort((a, b) => vp.CODIGOS.indexOf(a) - vp.CODIGOS.indexOf(b));
  return [{ referenciaId: chaveMensal(hoje), fatoGerador: vp.textoResumoMensal([...porFornecedor.values()], janela) }];
}

// Meus Dados: o cadastro de fornecedor ligado à pessoa e os avisos registrados nos pagamentos a ela (código e data; o texto é o do catálogo).
async function dadosDoTitular(pool, membroId) {
  const f = (await pool.request().input("m", sql.Int, membroId).query(`SELECT Nome, Tipo, Ativo FROM Fornecedores WHERE MembroId = @m`)).recordset[0];
  const avisos = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT a.Codigo, CONVERT(varchar(33), a.ConfirmadoEm, 126) AS ConfirmadoEm
    FROM SaidaAvisosVoluntario a JOIN SaidasTesouraria s ON s.SaidaId = a.SaidaId JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
    WHERE f.MembroId = @m ORDER BY a.AvisoId DESC`)).recordset;
  return {
    fornecedor: f ? { nome: f.Nome, tipo: f.Tipo, ativo: !!f.Ativo } : null,
    avisosDePagamento: avisos.map((a) => ({ codigo: a.Codigo, rotulo: vp.ROTULOS[a.Codigo] || a.Codigo, em: a.ConfirmadoEm }))
  };
}

module.exports = { lerLimites, ehVoluntarioAtivo, fatosDoFornecedor, avisosParaSaida, inserirSaidaComAvisos, avisosDaSaida, buscarMembros, detectarMensal, dadosDoTitular, chaveMensal };
