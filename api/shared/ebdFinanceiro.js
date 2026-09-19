// shared/ebdFinanceiro.js (v6.7 — EBD: Financeiro — ofertas + lançamentos
// manuais por congregação)
//
// Fecha o loop aberto na v5.5 (ver README, item 2 do checklist da v5.5):
// o dia a dia do financeiro da EBD (ofertas lançadas por congregação +
// lançamentos manuais) mora aqui, na FASE 6, perto de onde o trabalho
// acontece. O CONSOLIDADO do mês vira sugestão inicial do campo `ofertas`
// (FINANCEIRO/FLUXO, mensal — migração 092) do relatório departamental do
// depto EBD (shared/relatoriosDepartamentais.js) — quem concilia esse
// valor com o Centro de Custo geral da FASE 4 continua sendo,
// exclusivamente, a v5.4 (GestaoRelatoriosDepartamentais::congelarRateio),
// pelo mesmo caminho que os outros 7 departamentos usam. Este módulo
// NUNCA escreve em TesourariasDepartamento.
//
// Duas peças (ver migração 107 pra decisão completa):
//
// 1) EbdOfertas — a oferta do culto de EBD, ancorada em EbdLicoes (v6.2,
//    já o "domingo" natural da FASE 6): no máximo uma por lição.
// 2) EbdLancamentosFinanceiros — lançamento manual solto por
//    Congregação+Data (ENTRADA/SAÍDA + descrição livre) — cobre o que não
//    é a oferta do culto em si (ex: compra de material, doação extra).
//
// Pré-preenchimento (item 1 do v6.7) é DIFERENTE do mecanismo
// CAMPOS_AUTOMATICOS_AFILIACAO da v5.5: aquele é ESTADO e fica travado
// (recalculado a cada leitura, nunca gravável). Este é FLUXO — o texto da
// própria v5.5 já dizia "o Líder Local/Superintendente só confirma ou
// ajusta" — por isso `buscarValorPrePreenchimentoOfertas` só entrega um
// valor de PARTIDA no momento em que o rascunho nasce
// (GestaoRelatoriosDepartamentais::POST); depois disso o campo segue o
// fluxo normal de PUT/gravarValores, editável como qualquer outro campo
// FLUXO — nunca ganha bloqueio de gravação.
//
// Lógica de decisão pura (testável sem banco) primeiro, funções de banco
// (finas) depois — mesmo padrão do resto da FASE 6 (ebdRevistas.js,
// ebdChamada.js, ebdAtividades.js).
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");

const TIPOS_LANCAMENTO = { ENTRADA: "ENTRADA", SAIDA: "SAIDA" };

// ---------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------

function validarValorOferta(valor) {
  if (valor == null || Number.isNaN(Number(valor)) || Number(valor) < 0) {
    return { valido: false, mensagem: "Informe um valor de oferta válido (maior ou igual a zero)." };
  }
  return { valido: true };
}

function validarLancamento({ data, tipo, descricao, valor }) {
  if (!data || Number.isNaN(new Date(data).getTime())) {
    return { valido: false, mensagem: "Informe uma data válida." };
  }
  if (!Object.prototype.hasOwnProperty.call(TIPOS_LANCAMENTO, tipo)) {
    return { valido: false, mensagem: "Tipo deve ser ENTRADA ou SAIDA." };
  }
  if (!descricao || !String(descricao).trim()) {
    return { valido: false, mensagem: "Informe uma descrição para o lançamento." };
  }
  if (valor == null || Number.isNaN(Number(valor)) || Number(valor) <= 0) {
    return { valido: false, mensagem: "Informe um valor maior que zero." };
  }
  return { valido: true };
}

// Total de ofertas do mês — soma simples das linhas (nunca um número
// digitado à parte, mesmo princípio de somarValoresSemanais/
// calcularValorTotalPedido).
function calcularTotalOfertas(ofertas) {
  return (ofertas || []).reduce((soma, o) => soma + (Number(o.valor) || 0), 0);
}

// Lançamentos manuais netam (ENTRADA soma, SAIDA subtrai) dentro do
// próprio consolidado — não existem dois números "entrada" e "saída"
// competindo por atenção no relatório departamental, que só tem UM campo
// FINANCEIRO (`ofertas`, ver migração 092) pra receber o que a FASE 6 mede.
function calcularTotalLancamentos(lancamentos) {
  return (lancamentos || []).reduce((totais, l) => {
    const valor = Number(l.valor) || 0;
    if (l.tipo === TIPOS_LANCAMENTO.SAIDA) return { ...totais, saidas: totais.saidas + valor, liquido: totais.liquido - valor };
    return { ...totais, entradas: totais.entradas + valor, liquido: totais.liquido + valor };
  }, { entradas: 0, saidas: 0, liquido: 0 });
}

// Consolidado do mês (item 2 do v6.7) = ofertas do culto + lançamentos
// manuais líquidos (entradas − saídas). É este número, e só ele, que
// chega ao campo `ofertas` do relatório departamental — nunca uma
// integração direta com TesourariasDepartamento.
function calcularConsolidadoMensal({ ofertas, lancamentos }) {
  const totalOfertas = calcularTotalOfertas(ofertas);
  const totaisLancamentos = calcularTotalLancamentos(lancamentos);
  const consolidado = totalOfertas + totaisLancamentos.liquido;
  return {
    totalOfertas: Math.round(totalOfertas * 100) / 100,
    totalEntradas: Math.round(totaisLancamentos.entradas * 100) / 100,
    totalSaidas: Math.round(totaisLancamentos.saidas * 100) / 100,
    consolidado: Math.round(consolidado * 100) / 100
  };
}

function mapearOferta(row) {
  if (!row) return null;
  return {
    ofertaId: row.OfertaId, licaoId: row.LicaoId, valor: Number(row.Valor),
    registradoPorMembroId: row.RegistradoPorMembroId, registradoEm: row.RegistradoEm, atualizadoEm: row.AtualizadoEm
  };
}

function mapearLancamento(row) {
  if (!row) return null;
  return {
    lancamentoId: row.LancamentoId, congregacaoId: row.CongregacaoId, data: row.Data,
    tipo: row.Tipo, descricao: row.Descricao, valor: Number(row.Valor),
    registradoPorMembroId: row.RegistradoPorMembroId, registradoEm: row.RegistradoEm, atualizadoEm: row.AtualizadoEm
  };
}

// ---------------------------------------------------------------
// Funções de banco (finas)
// ---------------------------------------------------------------

async function buscarDepartamentoEbdId(pool) {
  const result = await pool.request().query(`SELECT DepartamentoId FROM Departamentos WHERE Sigla = 'EBD'`);
  return result.recordset[0] ? result.recordset[0].DepartamentoId : null;
}

async function buscarLicaoPorId(pool, licaoId) {
  const result = await pool.request().input("id", sql.Int, licaoId).query(`SELECT LicaoId, CongregacaoId, Data FROM EbdLicoes WHERE LicaoId = @id`);
  return result.recordset[0] || null;
}

async function buscarOfertaPorLicao(pool, licaoId) {
  const result = await pool.request().input("licaoId", sql.Int, licaoId).query(`SELECT * FROM EbdOfertas WHERE LicaoId = @licaoId`);
  return mapearOferta(result.recordset[0]);
}

// Registra (ou ajusta, se já existir) a oferta da lição — MERGE por
// LicaoId (UNIQUE, migração 107): a mesma "confirma ou ajusta" que a v5.5
// já previa pro financeiro da EBD, só que aqui na origem, não no relatório.
async function registrarOuAtualizarOferta(pool, { licaoId, valor, registradoPorMembroId }) {
  const validacao = validarValorOferta(valor);
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const licao = await buscarLicaoPorId(pool, licaoId);
  if (!licao) return { sucesso: false, mensagem: "Lição não encontrada." };

  const anterior = await buscarOfertaPorLicao(pool, licaoId);

  await pool.request()
    .input("licaoId", sql.Int, licaoId).input("valor", sql.Decimal(14, 2), Number(valor))
    .input("registradoPor", sql.Int, registradoPorMembroId || null)
    .query(`
      MERGE EbdOfertas AS alvo
      USING (SELECT @licaoId AS LicaoId) AS origem ON alvo.LicaoId = origem.LicaoId
      WHEN MATCHED THEN UPDATE SET Valor = @valor, AtualizadoEm = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (LicaoId, Valor, RegistradoPorMembroId) VALUES (@licaoId, @valor, @registradoPor);
    `);

  await registrarAuditoria({
    tabela: "EbdOfertas", registroId: licaoId, acao: anterior ? "OFERTA_AJUSTADA" : "OFERTA_REGISTRADA",
    usuarioId: registradoPorMembroId, dadosAntes: anterior ? { valor: anterior.valor } : null,
    dadosDepois: { licaoId, valor: Number(valor) }
  });

  return { sucesso: true, mensagem: "✅ Oferta registrada." };
}

async function listarOfertasPorCongregacaoMes(pool, { congregacaoId, mes, ano }) {
  const result = await pool.request()
    .input("congId", sql.Int, congregacaoId).input("mes", sql.Int, mes).input("ano", sql.Int, ano)
    .query(`
      SELECT o.* FROM EbdOfertas o
      JOIN EbdLicoes l ON l.LicaoId = o.LicaoId
      WHERE l.CongregacaoId = @congId AND MONTH(l.Data) = @mes AND YEAR(l.Data) = @ano
      ORDER BY l.Data
    `);
  return result.recordset.map(mapearOferta);
}

async function criarLancamento(pool, { congregacaoId, data, tipo, descricao, valor, registradoPorMembroId }) {
  const validacao = validarLancamento({ data, tipo, descricao, valor });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT CongregacaoId FROM Congregacoes WHERE CongregacaoId = @id`);
  if (cong.recordset.length === 0) return { sucesso: false, mensagem: "Congregação não encontrada." };

  const result = await pool.request()
    .input("congId", sql.Int, congregacaoId).input("data", sql.Date, data)
    .input("tipo", sql.NVarChar(10), tipo).input("descricao", sql.NVarChar(300), String(descricao).trim())
    .input("valor", sql.Decimal(14, 2), Number(valor)).input("registradoPor", sql.Int, registradoPorMembroId || null)
    .query(`
      INSERT INTO EbdLancamentosFinanceiros (CongregacaoId, Data, Tipo, Descricao, Valor, RegistradoPorMembroId)
      OUTPUT INSERTED.LancamentoId
      VALUES (@congId, @data, @tipo, @descricao, @valor, @registradoPor)
    `);
  const lancamentoId = result.recordset[0].LancamentoId;

  await registrarAuditoria({
    tabela: "EbdLancamentosFinanceiros", registroId: lancamentoId, acao: "LANCAMENTO_CRIADO",
    usuarioId: registradoPorMembroId, dadosAntes: null,
    dadosDepois: { congregacaoId, data, tipo, descricao: String(descricao).trim(), valor: Number(valor) }
  });

  return { sucesso: true, lancamentoId, mensagem: "✅ Lançamento registrado." };
}

async function buscarLancamentoPorId(pool, lancamentoId) {
  const result = await pool.request().input("id", sql.Int, lancamentoId).query(`SELECT * FROM EbdLancamentosFinanceiros WHERE LancamentoId = @id`);
  return mapearLancamento(result.recordset[0]);
}

// Excluir cobre o "ajusta" de um lançamento manual lançado errado (sem
// UPDATE de valor pra não perder o rastro em auditoria — mesmo espírito de
// "correção é uma ação registrada", nunca uma edição silenciosa).
async function excluirLancamento(pool, { lancamentoId, excluidoPorMembroId }) {
  const lancamento = await buscarLancamentoPorId(pool, lancamentoId);
  if (!lancamento) return { sucesso: false, mensagem: "Lançamento não encontrado." };

  await pool.request().input("id", sql.Int, lancamentoId).query(`DELETE FROM EbdLancamentosFinanceiros WHERE LancamentoId = @id`);

  await registrarAuditoria({
    tabela: "EbdLancamentosFinanceiros", registroId: lancamentoId, acao: "LANCAMENTO_EXCLUIDO",
    usuarioId: excluidoPorMembroId, dadosAntes: lancamento, dadosDepois: null
  });

  return { sucesso: true, mensagem: "✅ Lançamento excluído." };
}

async function listarLancamentosPorCongregacaoMes(pool, { congregacaoId, mes, ano }) {
  const result = await pool.request()
    .input("congId", sql.Int, congregacaoId).input("mes", sql.Int, mes).input("ano", sql.Int, ano)
    .query(`
      SELECT * FROM EbdLancamentosFinanceiros
      WHERE CongregacaoId = @congId AND MONTH(Data) = @mes AND YEAR(Data) = @ano
      ORDER BY Data
    `);
  return result.recordset.map(mapearLancamento);
}

// Visão consolidada de uma Congregação+mês — usada tanto pelo painel da
// FASE 6 (ver o quanto já foi lançado) quanto pelo pré-preenchimento do
// relatório departamental (só o número `consolidado` importa lá).
async function buscarConsolidadoMensal(pool, { congregacaoId, mes, ano }) {
  const [ofertas, lancamentos] = await Promise.all([
    listarOfertasPorCongregacaoMes(pool, { congregacaoId, mes, ano }),
    listarLancamentosPorCongregacaoMes(pool, { congregacaoId, mes, ano })
  ]);
  return { ofertas, lancamentos, ...calcularConsolidadoMensal({ ofertas, lancamentos }) };
}

// Ponto de integração com o relatório departamental (item 1 do v6.7,
// hook em GestaoRelatoriosDepartamentais::POST) — só devolve valor quando
// o departamento do rascunho é de fato a EBD; qualquer outro departamento
// mantém o comportamento padrão (campo FLUXO nasce zerado, v5.2).
async function buscarValorPrePreenchimentoOfertas(pool, { departamentoId, congregacaoId, mes, ano }) {
  const ebdId = await buscarDepartamentoEbdId(pool);
  if (!ebdId || Number(departamentoId) !== Number(ebdId)) return null;
  const { consolidado } = await buscarConsolidadoMensal(pool, { congregacaoId, mes, ano });
  return consolidado;
}

module.exports = {
  TIPOS_LANCAMENTO,
  // Lógica pura
  validarValorOferta, validarLancamento, calcularTotalOfertas, calcularTotalLancamentos,
  calcularConsolidadoMensal, mapearOferta, mapearLancamento,
  // Banco
  buscarDepartamentoEbdId, buscarLicaoPorId, buscarOfertaPorLicao, registrarOuAtualizarOferta,
  listarOfertasPorCongregacaoMes, criarLancamento, buscarLancamentoPorId, excluirLancamento,
  listarLancamentosPorCongregacaoMes, buscarConsolidadoMensal, buscarValorPrePreenchimentoOfertas
};
