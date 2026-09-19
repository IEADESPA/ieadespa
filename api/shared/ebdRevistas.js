// shared/ebdRevistas.js (v6.6 — EBD: Revistas e pedidos)
//
// Continua a FASE 6 sobre EbdTurmas (v6.1). Duas peças:
//
// 1) Catálogo (EbdCatalogoRevistas) — revistas/trimestre estilo CPAD, por
//    faixa etária. Cadastro simples, sem motor novo.
// 2) Pedido (EbdPedidosRevistas + EbdPedidosRevistasItens) — por TURMA,
//    não por Congregação (ver migração 106 pra decisão completa: a v6.8
//    já amarra "revista/trimestre vigente" à classe, então é a Turma quem
//    sabe quanto pedir; a visão "por congregação" do checklist do v6.6
//    existe como CONSOLIDAÇÃO na leitura, ver consolidarPedidosPorAreaCongregacao,
//    nunca como coluna redundante).
//
// `StatusPagamento` é só um FLAG (PENDENTE/APROVADO) no pedido — não é
// lançamento financeiro, não gera ledger, não integra com
// TesourariasDepartamento (v5.4). Isso é trabalho da v6.7 ("Financeiro da
// EBD", ainda não construída); aqui é só "este pedido já foi pago ou não".
//
// Lógica de decisão pura (testável sem banco) primeiro, funções de banco
// (finas) depois — mesmo padrão do resto da FASE 6.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const ebdTurmas = require("./ebdTurmas");

const STATUS_PEDIDO = { PENDENTE: "PENDENTE", APROVADO: "APROVADO" };
const STATUS_PAGAMENTO = { PENDENTE: "PENDENTE", APROVADO: "APROVADO" };
const TRIMESTRE_REGEX = /^\d{4}-T[1-4]$/;

// ---------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------

function trimestreValido(trimestre) {
  return !!(trimestre && TRIMESTRE_REGEX.test(String(trimestre).trim()));
}

function validarNovaRevista({ nome, trimestre, precoUnitario }) {
  if (!nome || !String(nome).trim() || String(nome).trim().length < 2) {
    return { valido: false, mensagem: "Informe o nome da revista (mínimo 2 caracteres)." };
  }
  if (!trimestreValido(trimestre)) {
    return { valido: false, mensagem: "Informe o trimestre no formato AAAA-T1 a AAAA-T4 (ex: 2026-T1)." };
  }
  if (precoUnitario == null || Number.isNaN(Number(precoUnitario)) || Number(precoUnitario) < 0) {
    return { valido: false, mensagem: "Informe um preço unitário válido (maior ou igual a zero)." };
  }
  return { valido: true };
}

// Validação de forma da lista de itens de um pedido: não vazia, cada item
// com revistaId + quantidade inteira positiva, sem revista repetida (usar
// uma linha só por revista, mesmo espírito de UQ_EbdPedidosRevistasItens).
function validarItensPedido(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    return { valido: false, mensagem: "Informe ao menos um item (revista + quantidade)." };
  }
  const vistos = new Set();
  for (const item of itens) {
    const revistaId = Number(item && item.revistaId);
    const quantidade = Number(item && item.quantidade);
    if (!revistaId || revistaId <= 0) {
      return { valido: false, mensagem: "Todo item precisa de um revistaId válido." };
    }
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      return { valido: false, mensagem: "A quantidade de cada item deve ser um inteiro maior que zero." };
    }
    if (vistos.has(revistaId)) {
      return { valido: false, mensagem: "Este pedido tem a mesma revista repetida em mais de um item — some as quantidades numa única linha." };
    }
    vistos.add(revistaId);
  }
  return { valido: true };
}

// Total do pedido é SEMPRE calculado a partir das linhas (Quantidade *
// PrecoUnitarioRegistrado) — nunca um campo digitado ou uma coluna própria
// no pedido (mesmo princípio de "calculado, nunca digitado" da v5.5.1/
// v5.6/v5.7/v6.2). Cada item já carrega o preço TRAVADO no momento do
// pedido (ver migração 106, decisão 2) — esta função nunca busca o preço
// vigente do catálogo, só soma o que já está gravado no item.
function calcularValorTotalPedido(itensComPreco) {
  return (itensComPreco || []).reduce((soma, item) => {
    const quantidade = Number(item.quantidade) || 0;
    const preco = Number(item.precoUnitarioRegistrado) || 0;
    return soma + quantidade * preco;
  }, 0);
}

// Só é possível aprovar um pedido PENDENTE com pelo menos um item — evita
// aprovar duas vezes (mesma guarda de shared/escalas.js::decidirTroca) e
// evita aprovar um pedido "vazio" (sem nenhuma linha de revista).
function podeAprovarPedido(pedido) {
  if (!pedido) return { permitido: false, mensagem: "Pedido não encontrado." };
  if (pedido.status !== STATUS_PEDIDO.PENDENTE) {
    return { permitido: false, mensagem: "Este pedido já foi aprovado." };
  }
  if (!pedido.totalItens || pedido.totalItens <= 0) {
    return { permitido: false, mensagem: "Este pedido não tem nenhum item — adicione ao menos uma revista antes de aprovar." };
  }
  return { permitido: true };
}

// Pagar antes de aprovar não faz sentido (não se paga o que ainda não foi
// aceito) — exige Status = APROVADO. Guarda também contra marcar pagamento
// duas vezes.
function podeRegistrarPagamento(pedido) {
  if (!pedido) return { permitido: false, mensagem: "Pedido não encontrado." };
  if (pedido.status !== STATUS_PEDIDO.APROVADO) {
    return { permitido: false, mensagem: "Só é possível registrar pagamento de um pedido já aprovado." };
  }
  if (pedido.statusPagamento === STATUS_PAGAMENTO.APROVADO) {
    return { permitido: false, mensagem: "O pagamento deste pedido já foi registrado." };
  }
  return { permitido: true };
}

// Só é possível substituir os itens de um pedido enquanto ele ainda está
// PENDENTE — depois de aprovado, o pedido é histórico (mesmo espírito de
// "relatório fechado" do resto do sistema: mudar quantidade depois de
// aprovado exigiria reabrir a aprovação, que o checklist do v6.6 não pede).
function podeEditarItensPedido(pedido) {
  if (!pedido) return { permitido: false, mensagem: "Pedido não encontrado." };
  if (pedido.status !== STATUS_PEDIDO.PENDENTE) {
    return { permitido: false, mensagem: "Este pedido já foi aprovado — não é mais possível alterar os itens." };
  }
  return { permitido: true };
}

// Consolidação (item 2 do v6.6): agrupa uma lista PLANA de pedidos (cada
// linha já trazendo areaId/areaNome/congregacaoId/congregacaoNome/turmaId/
// turmaNome/valorTotal/status/statusPagamento) em Área -> Congregação ->
// [Pedidos], com somas de valor por nível — mesmo formato de
// ebdTurmas.js::agruparPorAreaCongregacao, função pura testável sem banco.
// "Por congregação" (texto literal do checklist) é exatamente este nível
// intermediário do agrupamento, ainda que o pedido em si viva na Turma.
function consolidarPedidosPorAreaCongregacao(pedidos) {
  const areas = new Map();
  for (const p of pedidos || []) {
    const areaChave = p.areaId != null ? p.areaId : "SEM_AREA";
    if (!areas.has(areaChave)) {
      areas.set(areaChave, {
        areaId: p.areaId != null ? p.areaId : null, areaNome: p.areaNome || "Sem Área definida",
        valorTotal: 0, congregacoes: new Map()
      });
    }
    const area = areas.get(areaChave);
    area.valorTotal += Number(p.valorTotal) || 0;

    if (!area.congregacoes.has(p.congregacaoId)) {
      area.congregacoes.set(p.congregacaoId, { congregacaoId: p.congregacaoId, congregacaoNome: p.congregacaoNome, valorTotal: 0, pedidos: [] });
    }
    const cong = area.congregacoes.get(p.congregacaoId);
    cong.valorTotal += Number(p.valorTotal) || 0;
    cong.pedidos.push({
      pedidoId: p.pedidoId, turmaId: p.turmaId, turmaNome: p.turmaNome, trimestre: p.trimestre,
      status: p.status, statusPagamento: p.statusPagamento, valorTotal: Number(p.valorTotal) || 0
    });
  }

  return Array.from(areas.values()).map(area => ({
    ...area,
    congregacoes: Array.from(area.congregacoes.values()).sort((a, b) => a.congregacaoNome.localeCompare(b.congregacaoNome))
  })).sort((a, b) => a.areaNome.localeCompare(b.areaNome));
}

function mapearRevista(row) {
  if (!row) return null;
  return {
    revistaId: row.RevistaId, nome: row.Nome, faixaEtaria: row.FaixaEtaria,
    trimestre: row.Trimestre, precoUnitario: Number(row.PrecoUnitario), ativa: row.Ativa
  };
}

function mapearPedido(row) {
  if (!row) return null;
  return {
    pedidoId: row.PedidoId, turmaId: row.TurmaId, trimestre: row.Trimestre,
    status: row.Status, statusPagamento: row.StatusPagamento,
    solicitadoPorMembroId: row.SolicitadoPorMembroId, criadoEm: row.CriadoEm,
    aprovadoPorMembroId: row.AprovadoPorMembroId, aprovadoEm: row.AprovadoEm,
    pagamentoRegistradoPorMembroId: row.PagamentoRegistradoPorMembroId, pagamentoRegistradoEm: row.PagamentoRegistradoEm
  };
}

// ---------------------------------------------------------------
// Funções de banco (finas)
// ---------------------------------------------------------------

// ---- Catálogo ----

async function criarRevista(pool, { nome, faixaEtaria, trimestre, precoUnitario, criadoPorMembroId }) {
  const validacao = validarNovaRevista({ nome, trimestre, precoUnitario });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const existente = await pool.request()
    .input("nome", sql.NVarChar(150), String(nome).trim()).input("trimestre", sql.NVarChar(10), String(trimestre).trim())
    .query(`SELECT RevistaId FROM EbdCatalogoRevistas WHERE Nome = @nome AND Trimestre = @trimestre`);
  if (existente.recordset.length > 0) return { sucesso: false, mensagem: "Já existe uma revista com este nome neste trimestre." };

  const result = await pool.request()
    .input("nome", sql.NVarChar(150), String(nome).trim())
    .input("faixaEtaria", sql.NVarChar(50), faixaEtaria || null)
    .input("trimestre", sql.NVarChar(10), String(trimestre).trim())
    .input("preco", sql.Decimal(10, 2), Number(precoUnitario))
    .input("criadoPor", sql.Int, criadoPorMembroId || null)
    .query(`
      INSERT INTO EbdCatalogoRevistas (Nome, FaixaEtaria, Trimestre, PrecoUnitario, CriadoPorMembroId)
      OUTPUT INSERTED.RevistaId
      VALUES (@nome, @faixaEtaria, @trimestre, @preco, @criadoPor)
    `);
  const revistaId = result.recordset[0].RevistaId;

  await registrarAuditoria({
    tabela: "EbdCatalogoRevistas", registroId: revistaId, acao: "REVISTA_CADASTRADA",
    usuarioId: criadoPorMembroId, dadosAntes: null,
    dadosDepois: { nome: String(nome).trim(), trimestre: String(trimestre).trim(), precoUnitario: Number(precoUnitario) }
  });

  return { sucesso: true, revistaId, mensagem: "✅ Revista cadastrada no catálogo." };
}

async function buscarRevistaPorId(pool, revistaId) {
  const result = await pool.request().input("id", sql.Int, revistaId).query(`SELECT * FROM EbdCatalogoRevistas WHERE RevistaId = @id`);
  return mapearRevista(result.recordset[0]);
}

async function listarCatalogo(pool, { trimestre, apenasAtivas } = {}) {
  const request = pool.request();
  const condicoes = [];
  if (trimestre) {
    request.input("trimestre", sql.NVarChar(10), trimestre);
    condicoes.push("Trimestre = @trimestre");
  }
  if (apenasAtivas) condicoes.push("Ativa = 1");
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const result = await request.query(`SELECT * FROM EbdCatalogoRevistas ${where} ORDER BY Trimestre DESC, FaixaEtaria, Nome`);
  return result.recordset.map(mapearRevista);
}

// ---- Pedido ----

async function buscarPedidoPorId(pool, pedidoId) {
  const result = await pool.request().input("id", sql.Int, pedidoId).query(`SELECT * FROM EbdPedidosRevistas WHERE PedidoId = @id`);
  const pedido = mapearPedido(result.recordset[0]);
  if (!pedido) return null;
  pedido.itens = await listarItensPedido(pool, pedidoId);
  pedido.totalItens = pedido.itens.length;
  pedido.valorTotal = calcularValorTotalPedido(pedido.itens);
  return pedido;
}

async function listarItensPedido(pool, pedidoId) {
  const result = await pool.request().input("pedidoId", sql.Int, pedidoId).query(`
    SELECT i.*, r.Nome AS RevistaNome, r.FaixaEtaria
    FROM EbdPedidosRevistasItens i
    JOIN EbdCatalogoRevistas r ON r.RevistaId = i.RevistaId
    WHERE i.PedidoId = @pedidoId
    ORDER BY r.Nome
  `);
  return result.recordset.map(row => ({
    itemId: row.ItemId, pedidoId: row.PedidoId, revistaId: row.RevistaId, revistaNome: row.RevistaNome,
    faixaEtaria: row.FaixaEtaria, quantidade: row.Quantidade, precoUnitarioRegistrado: Number(row.PrecoUnitarioRegistrado)
  }));
}

async function buscarPedidoPorTurmaTrimestre(pool, turmaId, trimestre) {
  const result = await pool.request().input("turmaId", sql.Int, turmaId).input("trimestre", sql.NVarChar(10), trimestre).query(`
    SELECT * FROM EbdPedidosRevistas WHERE TurmaId = @turmaId AND Trimestre = @trimestre
  `);
  return mapearPedido(result.recordset[0]);
}

// Grava as linhas de itens de um pedido (substitui as anteriores, se
// houver) — sempre travando o PrecoUnitarioRegistrado no valor VIGENTE do
// catálogo neste instante (ver migração 106, decisão 2: é um snapshot,
// nunca mais recalculado depois, mesmo que o catálogo mude de preço).
async function gravarItensPedido(pool, { pedidoId, itens }) {
  await pool.request().input("pedidoId", sql.Int, pedidoId).query(`DELETE FROM EbdPedidosRevistasItens WHERE PedidoId = @pedidoId`);
  for (const item of itens) {
    const revista = await buscarRevistaPorId(pool, item.revistaId);
    if (!revista) return { sucesso: false, mensagem: `Revista ${item.revistaId} não encontrada no catálogo.` };
    if (!revista.ativa) return { sucesso: false, mensagem: `A revista "${revista.nome}" não está mais ativa no catálogo.` };
    await pool.request()
      .input("pedidoId", sql.Int, pedidoId).input("revistaId", sql.Int, item.revistaId)
      .input("quantidade", sql.Int, Number(item.quantidade)).input("preco", sql.Decimal(10, 2), revista.precoUnitario)
      .query(`INSERT INTO EbdPedidosRevistasItens (PedidoId, RevistaId, Quantidade, PrecoUnitarioRegistrado) VALUES (@pedidoId, @revistaId, @quantidade, @preco)`);
  }
  return { sucesso: true };
}

// Cria (ou reaproveita, se ainda PENDENTE) o pedido da Turma pro
// Trimestre informado — idempotente no sentido de "não duplica pedido",
// mesmo espírito de ebdChamada.js::abrirLicao (UNIQUE já barraria mesmo
// assim, isso só evita a viagem terminar em erro de constraint em uso
// normal).
async function criarPedido(pool, { turmaId, trimestre, itens, solicitadoPorMembroId }) {
  if (!trimestreValido(trimestre)) return { sucesso: false, mensagem: "Informe o trimestre no formato AAAA-T1 a AAAA-T4 (ex: 2026-T1)." };
  const validacaoItens = validarItensPedido(itens);
  if (!validacaoItens.valido) return { sucesso: false, mensagem: validacaoItens.mensagem };

  const turma = await ebdTurmas.buscarTurmaPorId(pool, turmaId);
  if (!turma) return { sucesso: false, mensagem: "Turma não encontrada." };

  const existente = await buscarPedidoPorTurmaTrimestre(pool, turmaId, trimestre);
  if (existente) {
    return { sucesso: false, mensagem: "Esta turma já tem um pedido para este trimestre — use a edição de itens em vez de criar um novo." };
  }

  const result = await pool.request()
    .input("turmaId", sql.Int, turmaId).input("trimestre", sql.NVarChar(10), String(trimestre).trim())
    .input("solicitadoPor", sql.Int, solicitadoPorMembroId || null)
    .query(`
      INSERT INTO EbdPedidosRevistas (TurmaId, Trimestre, SolicitadoPorMembroId)
      OUTPUT INSERTED.PedidoId
      VALUES (@turmaId, @trimestre, @solicitadoPor)
    `);
  const pedidoId = result.recordset[0].PedidoId;

  const gravacao = await gravarItensPedido(pool, { pedidoId, itens });
  if (!gravacao.sucesso) return gravacao;

  await registrarAuditoria({
    tabela: "EbdPedidosRevistas", registroId: pedidoId, acao: "PEDIDO_CRIADO",
    usuarioId: solicitadoPorMembroId, dadosAntes: null, dadosDepois: { turmaId, trimestre, itens }
  });

  return { sucesso: true, pedidoId, mensagem: "✅ Pedido registrado." };
}

async function atualizarItensPedido(pool, { pedidoId, itens, atualizadoPorMembroId }) {
  const validacaoItens = validarItensPedido(itens);
  if (!validacaoItens.valido) return { sucesso: false, mensagem: validacaoItens.mensagem };

  const pedido = await buscarPedidoPorId(pool, pedidoId);
  const validacao = podeEditarItensPedido(pedido);
  if (!validacao.permitido) return { sucesso: false, mensagem: validacao.mensagem };

  const gravacao = await gravarItensPedido(pool, { pedidoId, itens });
  if (!gravacao.sucesso) return gravacao;

  await registrarAuditoria({
    tabela: "EbdPedidosRevistas", registroId: pedidoId, acao: "PEDIDO_ITENS_ATUALIZADOS",
    usuarioId: atualizadoPorMembroId, dadosAntes: { itens: pedido.itens }, dadosDepois: { itens }
  });

  return { sucesso: true, mensagem: "✅ Itens do pedido atualizados." };
}

async function aprovarPedido(pool, { pedidoId, aprovadoPorMembroId }) {
  const pedido = await buscarPedidoPorId(pool, pedidoId);
  const validacao = podeAprovarPedido(pedido);
  if (!validacao.permitido) return { sucesso: false, mensagem: validacao.mensagem };

  await pool.request().input("id", sql.Int, pedidoId).input("aprovadoPor", sql.Int, aprovadoPorMembroId || null).query(`
    UPDATE EbdPedidosRevistas SET Status = 'APROVADO', AprovadoPorMembroId = @aprovadoPor, AprovadoEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME()
    WHERE PedidoId = @id
  `);

  await registrarAuditoria({
    tabela: "EbdPedidosRevistas", registroId: pedidoId, acao: "PEDIDO_APROVADO",
    usuarioId: aprovadoPorMembroId, dadosAntes: { status: pedido.status }, dadosDepois: { status: "APROVADO" }
  });

  return { sucesso: true, mensagem: "✅ Pedido aprovado." };
}

// Só registra o FLAG de pagamento (ver cabeçalho do módulo) — nenhum
// lançamento financeiro, nenhuma integração com v5.4/TesourariasDepartamento.
async function registrarPagamentoPedido(pool, { pedidoId, registradoPorMembroId }) {
  const pedido = await buscarPedidoPorId(pool, pedidoId);
  const validacao = podeRegistrarPagamento(pedido);
  if (!validacao.permitido) return { sucesso: false, mensagem: validacao.mensagem };

  await pool.request().input("id", sql.Int, pedidoId).input("registradoPor", sql.Int, registradoPorMembroId || null).query(`
    UPDATE EbdPedidosRevistas SET StatusPagamento = 'APROVADO', PagamentoRegistradoPorMembroId = @registradoPor, PagamentoRegistradoEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME()
    WHERE PedidoId = @id
  `);

  await registrarAuditoria({
    tabela: "EbdPedidosRevistas", registroId: pedidoId, acao: "PEDIDO_PAGAMENTO_REGISTRADO",
    usuarioId: registradoPorMembroId, dadosAntes: { statusPagamento: pedido.statusPagamento }, dadosDepois: { statusPagamento: "APROVADO" }
  });

  return { sucesso: true, mensagem: "✅ Pagamento registrado." };
}

async function listarPedidosPorTurma(pool, turmaId) {
  const result = await pool.request().input("turmaId", sql.Int, turmaId).query(`
    SELECT * FROM EbdPedidosRevistas WHERE TurmaId = @turmaId ORDER BY Trimestre DESC
  `);
  const pedidos = result.recordset.map(mapearPedido);
  for (const pedido of pedidos) {
    pedido.itens = await listarItensPedido(pool, pedido.pedidoId);
    pedido.totalItens = pedido.itens.length;
    pedido.valorTotal = calcularValorTotalPedido(pedido.itens);
  }
  return pedidos;
}

// Visão consolidada (item 2 do v6.6) — todos os pedidos de um Trimestre,
// já com Turma/Congregação/Área resolvidos (mesma cadeia territorial de
// shared/escopo.js/ebdTurmas.js::listarTurmasParaVisaoAgrupada) e
// valorTotal calculado por SUM dos itens — pronta pra
// consolidarPedidosPorAreaCongregacao agrupar por cima, sem outra query.
// Escopo é aplicado ANTES desta função (mesmo princípio do resto do
// sistema: nunca uma segunda checagem de permissão dentro do SQL).
async function listarPedidosParaConsolidado(pool, { trimestre, nomesCongregacoesPermitidas } = {}) {
  const request = pool.request();
  const condicoes = [];
  if (trimestre) {
    request.input("trimestre", sql.NVarChar(10), trimestre);
    condicoes.push("p.Trimestre = @trimestre");
  }
  if (Array.isArray(nomesCongregacoesPermitidas)) {
    if (nomesCongregacoesPermitidas.length === 0) return [];
    const params = nomesCongregacoesPermitidas.map((nome, i) => {
      request.input(`cong${i}`, sql.NVarChar(150), nome);
      return `@cong${i}`;
    });
    condicoes.push(`c.Nome IN (${params.join(",")})`);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT p.PedidoId, p.TurmaId, t.Nome AS TurmaNome, p.Trimestre, p.Status, p.StatusPagamento,
           c.CongregacaoId, c.Nome AS CongregacaoNome, a.AreaId, a.Nome AS AreaNome,
           ISNULL((SELECT SUM(i.Quantidade * i.PrecoUnitarioRegistrado) FROM EbdPedidosRevistasItens i WHERE i.PedidoId = p.PedidoId), 0) AS ValorTotal
    FROM EbdPedidosRevistas p
    JOIN EbdTurmas t ON t.TurmaId = p.TurmaId
    JOIN Congregacoes c ON c.CongregacaoId = t.CongregacaoId
    LEFT JOIN Areas a ON a.AreaId = c.AreaId
    ${where}
    ORDER BY a.Nome, c.Nome, t.Nome
  `);

  return result.recordset.map(row => ({
    pedidoId: row.PedidoId, turmaId: row.TurmaId, turmaNome: row.TurmaNome, trimestre: row.Trimestre,
    status: row.Status, statusPagamento: row.StatusPagamento,
    congregacaoId: row.CongregacaoId, congregacaoNome: row.CongregacaoNome,
    areaId: row.AreaId, areaNome: row.AreaNome, valorTotal: Number(row.ValorTotal)
  }));
}

module.exports = {
  STATUS_PEDIDO, STATUS_PAGAMENTO,
  // Lógica pura
  trimestreValido, validarNovaRevista, validarItensPedido, calcularValorTotalPedido,
  podeAprovarPedido, podeRegistrarPagamento, podeEditarItensPedido, consolidarPedidosPorAreaCongregacao,
  mapearRevista, mapearPedido,
  // Banco — catálogo
  criarRevista, buscarRevistaPorId, listarCatalogo,
  // Banco — pedido
  criarPedido, atualizarItensPedido, buscarPedidoPorId, buscarPedidoPorTurmaTrimestre, listarItensPedido,
  listarPedidosPorTurma, aprovarPedido, registrarPagamentoPedido, listarPedidosParaConsolidado
};
