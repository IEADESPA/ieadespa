// shared/compliance.js (v4.12)
// Camada de Auditoria/Compliance/Indicadores (nível "pico" — COSO):
//   - Monitoramento Contínuo de Controles (CCM): varre o que já existe e
//     gera AlertasCompliance na hora (pagamento atípico, dado bancário
//     alterado, fracionamento, fornecedor sem histórico).
//   - Indicadores Financeiros calculados na leitura (nunca digitados).
//   - Recertificação de acessos (Revisão Periódica de Acessos).
//   - Parâmetro do Princípio dos Quatro Olhos (dual control).
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const tesouraria = require("./tesouraria");
const demonstracoes = require("./demonstracoes");

async function parametrosCompliance(pool, sql) {
  const r = await pool.request().query(`SELECT * FROM ParametrosCompliance WHERE ParametroId = 1`);
  return r.recordset[0] || { ValorCriticoQuatroOlhos: 10000, PeriodicidadeRecertificacaoMeses: 3 };
}

async function valorCriticoQuatroOlhos(pool, sql) {
  const p = await parametrosCompliance(pool, sql);
  return Number(p.ValorCriticoQuatroOlhos);
}

// Cria um alerta se ainda não existir um ATIVO idêntico (mesmo tipo + origem).
async function criarAlertaSeNovo(pool, sql, { tipo, severidade, descricao, tabelaOrigem, registroOrigemId }) {
  const existente = await pool.request().input("tipo", sql.NVarChar(30), tipo)
    .input("origem", sql.Int, registroOrigemId || null)
    .query(`SELECT 1 FROM AlertasCompliance WHERE Tipo = @tipo AND ISNULL(RegistroOrigemId, -1) = ISNULL(@origem, -1) AND Status = 'ATIVO'`);
  if (existente.recordset.length > 0) return null;
  const criado = await pool.request()
    .input("tipo", sql.NVarChar(30), tipo).input("severidade", sql.NVarChar(20), severidade)
    .input("descricao", sql.NVarChar(500), descricao).input("tabelaOrigem", sql.NVarChar(50), tabelaOrigem || null)
    .input("registroOrigemId", sql.Int, registroOrigemId || null)
    .query(`INSERT INTO AlertasCompliance (Tipo, Severidade, Descricao, TabelaOrigem, RegistroOrigemId)
            OUTPUT INSERTED.AlertaId VALUES (@tipo, @severidade, @descricao, @tabelaOrigem, @registroOrigemId)`);
  return criado.recordset[0].AlertaId;
}

// Monitoramento Contínuo de Controles — varre o que já existe e gera alertas.
async function escanearAlertasCompliance(pool, sql) {
  const criticos = await valorCriticoQuatroOlhos(pool, sql);
  const novos = [];

  // 1) Fornecedor com dado bancário alterado aguardando confirmação.
  const bancarios = await pool.request().query(`
    SELECT FornecedorId AS id, Nome AS nome FROM Fornecedores WHERE DadosBancariosConfirmados = 0
  `);
  for (const f of bancarios.recordset) {
    const id = await criarAlertaSeNovo(pool, sql, {
      tipo: "DADO_BANCARIO_ALTERADO", severidade: "ALTA", tabelaOrigem: "Fornecedores", registroOrigemId: f.id,
      descricao: `Fornecedor "${f.nome}" com dados bancários alterados e ainda não confirmados — pagamentos bloqueados até confirmação de outra pessoa.`
    });
    if (id) novos.push(id);
  }

  // 2) Fracionamento: várias saídas ao mesmo fornecedor no mesmo dia somando
  //    acima do valor crítico, cada uma abaixo dele (indício de fuga de alçada).
  const fracionados = await pool.request().input("critico", sql.Decimal(12, 2), criticos).query(`
    SELECT s.FornecedorId AS id, f.Nome AS nome, CONVERT(varchar(10), s.SolicitadoEm, 120) AS dia,
           SUM(s.Valor) AS total, COUNT(*) AS qtd
    FROM SaidasTesouraria s JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
    WHERE s.Status IN ('APROVADA', 'PAGA') AND s.Valor < @critico
    GROUP BY s.FornecedorId, f.Nome, CONVERT(varchar(10), s.SolicitadoEm, 120)
    HAVING COUNT(*) > 1 AND SUM(s.Valor) >= @critico
  `);
  for (const f of fracionados.recordset) {
    const id = await criarAlertaSeNovo(pool, sql, {
      tipo: "FRACIONAMENTO", severidade: "ALTA", tabelaOrigem: "SaidasTesouraria", registroOrigemId: f.id,
      descricao: `Fornecedor "${f.nome}" recebeu ${f.qtd} saída(s) no dia ${f.dia} somando R$ ${Number(f.total).toFixed(2)} — fracionamento abaixo do teto pode indicar tentativa de fugir da alçada/quatro olhos.`
    });
    if (id) novos.push(id);
  }

  // 3) Fornecedor sem histórico recebendo valor alto.
  const semHistorico = await pool.request().input("critico", sql.Decimal(12, 2), criticos).query(`
    SELECT s.FornecedorId AS id, f.Nome AS nome, MAX(s.Valor) AS maior
    FROM SaidasTesouraria s JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
    WHERE s.Status IN ('APROVADA', 'PAGA')
    GROUP BY s.FornecedorId, f.Nome
    HAVING COUNT(CASE WHEN s.Status = 'PAGA' THEN 1 END) = 0 AND MAX(s.Valor) >= @critico
  `);
  for (const f of semHistorico.recordset) {
    const id = await criarAlertaSeNovo(pool, sql, {
      tipo: "FORNECEDOR_SEM_HISTORICO", severidade: "MEDIA", tabelaOrigem: "SaidasTesouraria", registroOrigemId: f.id,
      descricao: `Fornecedor "${f.nome}" sem histórico de pagamento recebendo valor alto (R$ ${Number(f.maior).toFixed(2)}).`
    });
    if (id) novos.push(id);
  }

  return novos;
}

// Recertificação de acessos: gera pendências pra todo mundo com permissão
// `financeiro` (papéis cujo Permissoes contém 'financeiro'), com prazo a
// partir de hoje + periodicidade configurável.
async function gerarRecertificacoesFinanceiro(pool, sql) {
  const p = await parametrosCompliance(pool, sql);
  const meses = Number(p.PeriodicidadeRecertificacaoMeses) || 3;
  const alvos = await pool.request().query(`
    SELECT l.MembroId AS membroId, l.PapelId AS papelId
    FROM Lideranca l JOIN Papeis pa ON pa.PapelId = l.PapelId
    WHERE pa.Permissoes LIKE '%financeiro%'
  `);
  let criados = 0;
  for (const a of alvos.recordset) {
    const existe = await pool.request().input("membro", sql.Int, a.membroId)
      .query(`SELECT 1 FROM RecertificacoesAcesso WHERE MembroId = @membro AND Status = 'PENDENTE'`);
    if (existe.recordset.length > 0) continue;
    const prazo = new Date(Date.now() + meses * 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await pool.request().input("membro", sql.Int, a.membroId).input("papel", sql.Int, a.papelId)
      .input("permissao", sql.NVarChar(50), "financeiro").input("prazo", sql.Date, prazo)
      .query(`INSERT INTO RecertificacoesAcesso (MembroId, PapelId, Permissao, Prazo) VALUES (@membro, @papel, @permissao, @prazo)`);
    criados++;
  }
  return criados;
}

// Indicadores Financeiros (calculados na leitura):
//  - mesesReservaCaixa = saldo GERAL / média mensal de saídas (meta 3)
//  - indiceAplicacaoAtividadesFim = % do gasto em ATIVIDADES_FIM (meta 70-80%)
//  - indiceLiquidez = (caixa + contasReceber) / contasPagar
async function calcularIndicadoresFinanceiros(pool, sql) {
  const saldoGeral = await tesouraria.saldoCentroCusto(pool, sql, "GERAL", null);

  const saidas = await pool.request().query(`
    SELECT TOP 3 CONVERT(varchar(7), PagoEm, 120) AS mes, SUM(Valor) AS total
    FROM SaidasTesouraria WHERE Status = 'PAGA' GROUP BY CONVERT(varchar(7), PagoEm, 120) ORDER BY mes DESC
  `);
  const mediaSaidas = saidas.recordset.length > 0
    ? round2(saidas.recordset.reduce((s, r) => s + Number(r.total), 0) / saidas.recordset.length)
    : 0;
  const mesesReservaCaixa = mediaSaidas > 0 ? round2(saldoGeral / mediaSaidas) : 0;

  const balanco = await demonstracoes.calcularBalancoPatrimonial(pool, sql, new Date());
  const liquidez = balanco.passivo.total > 0 ? round2(balanco.ativo.total / balanco.passivo.total) : 0;

  const hoje = new Date();
  const drp = await demonstracoes.calcularDRP(pool, sql, new Date(hoje.getFullYear(), 0, 1), hoje);
  const totalDespesas = drp.totalDespesas || 0;
  const atividadesFim = drp.classificacaoFuncional ? drp.classificacaoFuncional.atividadesFim : 0;
  const indiceAtividadesFim = totalDespesas > 0 ? round2(atividadesFim / totalDespesas * 100) : 0;

  return {
    mesesReservaCaixa, mediaSaidasMensais: mediaSaidas, saldoCentroCustoGeral: saldoGeral,
    indiceAplicacaoAtividadesFim: indiceAtividadesFim,
    indiceLiquidez: liquidez,
    ativoTotal: balanco.ativo.total, passivoTotal: balanco.passivo.total, patrimonioLiquido: balanco.patrimonioLiquido
  };
}

module.exports = {
  parametrosCompliance,
  valorCriticoQuatroOlhos,
  escanearAlertasCompliance,
  gerarRecertificacoesFinanceiro,
  calcularIndicadoresFinanceiros
};

