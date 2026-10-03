// GestaoEbdRevistas (v6.6 — EBD: Revistas e pedidos)
//
// Continua a FASE 6 (aberta em GestaoEbdTurmas/v6.1). Ver shared/ebdRevistas.js
// pra toda a lógica de decisão (pura, testada em isolamento) — catálogo,
// pedido por Turma, aprovação e flag de pagamento.
//
// Permissão — mesmo espírito de GestaoEbdAtividades (v6.3): "ebd_gestao"
// (dentro do escopo territorial) sempre pode administrar. Mas CRIAR/editar
// o pedido de uma Turma específica (enquanto PENDENTE) também é liberado
// pro professor ATIVO daquela Turma (EbdTurmaProfessores, v6.1), sem
// precisar de "ebd_gestao" — quem dá aula na turma sabe quantas revistas
// ela precisa. Já APROVAR o pedido e REGISTRAR o pagamento (flag, ver
// shared/ebdRevistas.js — não é lançamento financeiro, isso é v6.7) exigem
// sempre "ebd_gestao" — decisão de quem administra, não do professor que
// pediu.
//
// Catálogo em si não é territorial (uma edição de revista vale pra
// qualquer Congregação) — por isso listar o catálogo só exige login (o
// professor precisa ver o catálogo pra montar o pedido da própria turma);
// cadastrar/alterar o catálogo exige "ebd_gestao".
//
// GET  /api/ebd-revistas/catalogo?trimestre=&apenasAtivas=1        -> catálogo de revistas
// POST /api/ebd-revistas/catalogo   body:{nome, faixaEtaria?, trimestre, precoUnitario}
// GET  /api/ebd-revistas/pedidos?turmaId=                          -> pedidos de uma turma
// POST /api/ebd-revistas/pedidos    body:{turmaId, trimestre, itens:[{revistaId,quantidade}]}
// GET  /api/ebd-revistas/pedidos/sugestao?turmaId=&trimestre=      -> v6.10: itens sugeridos pela matrícula real
// GET  /api/ebd-revistas/pedido?pedidoId=                          -> detalhe de um pedido (com itens)
// POST /api/ebd-revistas/pedidos/itens     body:{pedidoId, itens}  -> substitui itens (só enquanto PENDENTE)
// POST /api/ebd-revistas/pedidos/aprovar   body:{pedidoId}         -> exige ebd_gestao
// POST /api/ebd-revistas/pedidos/pagamento body:{pedidoId}         -> exige ebd_gestao (flag, não é financeiro — v6.7)
// GET  /api/ebd-revistas/consolidado?trimestre=                    -> Área -> Congregação -> Pedidos, dentro do escopo (exige ebd_gestao)
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const ebdTurmas = require("../shared/ebdTurmas");
const revistas = require("../shared/ebdRevistas");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

function temEbdGestao(usuario) {
  return auth.temPermissao(usuario, "ebd_gestao");
}

async function nomeCongregacao(pool, congregacaoId) {
  const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  return r.recordset[0] ? r.recordset[0].Nome : null;
}

async function podeAcessarCongregacao(pool, usuario, congregacaoId) {
  const nome = await nomeCongregacao(pool, congregacaoId);
  return !!nome && auth.estaNoEscopo(usuario, nome);
}

async function ehProfessorAtivoDaTurma(pool, membroId, turmaId) {
  if (!membroId) return false;
  const r = await pool.request().input("turmaId", sql.Int, turmaId).input("membroId", sql.Int, membroId).query(`
    SELECT TOP 1 1 FROM EbdTurmaProfessores WHERE TurmaId = @turmaId AND MembroId = @membroId AND Ativo = 1
  `);
  return r.recordset.length > 0;
}

// Gerenciar (criar/editar itens) o pedido de uma Turma: ebd_gestao (no
// escopo da congregação da turma) OU professor ativo naquela turma —
// mesma granularidade de GestaoEbdAtividades::podeGerenciarRespostaDoAluno.
async function podeGerenciarPedidoDaTurma(pool, usuario, turma) {
  if (!turma) return false;
  if (temEbdGestao(usuario) && (await podeAcessarCongregacao(pool, usuario, turma.congregacaoId))) return true;
  return ehProfessorAtivoDaTurma(pool, usuario.membroId, turma.turmaId);
}

module.exports = async function (context, req) {
  const sessao = auth.exigirLogin(req, context);
  if (!sessao) return;
  // v7.6 — escopo, nível e departamento conferidos adiante são os da permissão ebd_gestao (a visão só com as concessões que a têm; ver shared/auth.js,
  // "Concessões"), não o somado de outro cargo ou delegação. Sem a permissão, a sessão inteira (quem usa a rota como aluno, professor, membro...).
  const usuario = auth.visaoDaPermissao(sessao, "ebd_gestao") || sessao;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  try {
    // ---- Catálogo ----
    if (acao === "catalogo" && metodo === "GET") {
      const trimestre = req.query && req.query.trimestre;
      const apenasAtivas = req.query && req.query.apenasAtivas === "1";
      context.res = { status: 200, body: { sucesso: true, catalogo: await revistas.listarCatalogo(pool, { trimestre, apenasAtivas }) } };
      return;
    }

    if (acao === "catalogo" && metodo === "POST") {
      if (!temEbdGestao(usuario)) return erro(context, 403, "Administrar o catálogo de revistas exige a permissão ebd_gestao.");
      // Revisão de escopo: o catálogo vale para o CAMPO INTEIRO (preço e edição que qualquer congregação pede). Cadastrar nele não é ato de congregação: um gestor de escopo local
      // criava revista com preço errado para todas as unidades (e, como nome + trimestre é único, bloqueava o cadastro correto). Só escopo de TODAS as congregações — o mesmo critério
      // do plano de aula do campo inteiro (GestaoEbdSalaAula). Não exige o nível GLOBAL do papel: o superintendente geral de EBD costuma ser Líder Geral de Departamento (nível DEPARTAMENTO, escopo TODAS).
      if (usuario.escopoCongregacoes !== "TODAS") return erro(context, 403, "O catálogo de revistas vale para o campo inteiro: só quem tem o escopo de todas as congregações cadastra revista.");
      const { nome, faixaEtaria, trimestre, precoUnitario } = req.body || {};
      const resultado = await revistas.criarRevista(pool, { nome, faixaEtaria, trimestre, precoUnitario, criadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    // ---- Pedidos ----
    if (acao === "pedidos" && metodo === "GET") {
      const turmaId = auth.idDeRota(req.query && req.query.turmaId);
      if (!turmaId) return erro(context, 400, "Informe turmaId.");
      const turma = await ebdTurmas.buscarTurmaPorId(pool, turmaId);
      if (!turma) return erro(context, 404, "Turma não encontrada.");
      if (!(await podeGerenciarPedidoDaTurma(pool, usuario, turma))) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      context.res = { status: 200, body: { sucesso: true, pedidos: await revistas.listarPedidosPorTurma(pool, turmaId) } };
      return;
    }

    if (acao === "pedidos" && metodo === "POST") {
      const { trimestre, itens } = req.body || {};
      const turmaId = auth.idDeRota(req.body && req.body.turmaId);
      if (!turmaId || !trimestre) return erro(context, 400, "Informe turmaId e trimestre.");
      const turma = await ebdTurmas.buscarTurmaPorId(pool, turmaId);
      if (!turma) return erro(context, 404, "Turma não encontrada.");
      if (!(await podeGerenciarPedidoDaTurma(pool, usuario, turma))) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const resultado = await revistas.criarPedido(pool, { turmaId, trimestre, itens, solicitadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    // v6.10 — sugestão do pedido pela matrícula real (alunos e professores
    // ativos da turma × catálogo do trimestre na faixa etária da turma).
    if (acao === "pedidos/sugestao" && metodo === "GET") {
      const turmaId = auth.idDeRota(req.query && req.query.turmaId);
      const trimestre = req.query && req.query.trimestre;
      if (!turmaId || !trimestre) return erro(context, 400, "Informe turmaId e trimestre.");
      const turma = await ebdTurmas.buscarTurmaPorId(pool, turmaId);
      if (!turma) return erro(context, 404, "Turma não encontrada.");
      if (!(await podeGerenciarPedidoDaTurma(pool, usuario, turma))) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const resultado = await revistas.sugerirPedidoDaTurma(pool, { turma, trimestre: String(trimestre).trim() });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "pedido" && metodo === "GET") {
      const pedidoId = auth.idDeRota(req.query && req.query.pedidoId);
      if (!pedidoId) return erro(context, 400, "Informe pedidoId.");
      const pedido = await revistas.buscarPedidoPorId(pool, pedidoId);
      if (!pedido) return erro(context, 404, "Pedido não encontrado.");
      const turma = await ebdTurmas.buscarTurmaPorId(pool, pedido.turmaId);
      if (!(await podeGerenciarPedidoDaTurma(pool, usuario, turma))) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      context.res = { status: 200, body: { sucesso: true, pedido } };
      return;
    }

    if (acao === "pedidos/itens" && metodo === "POST") {
      const { itens } = req.body || {};
      const pedidoId = auth.idDeRota(req.body && req.body.pedidoId);
      if (!pedidoId) return erro(context, 400, "Informe pedidoId.");
      const pedido = await revistas.buscarPedidoPorId(pool, pedidoId);
      if (!pedido) return erro(context, 404, "Pedido não encontrado.");
      const turma = await ebdTurmas.buscarTurmaPorId(pool, pedido.turmaId);
      if (!(await podeGerenciarPedidoDaTurma(pool, usuario, turma))) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const resultado = await revistas.atualizarItensPedido(pool, { pedidoId, itens, atualizadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Aprovação e pagamento (sempre ebd_gestao — nunca o professor que pediu) ----
    if (acao === "pedidos/aprovar" && metodo === "POST") {
      if (!temEbdGestao(usuario)) return erro(context, 403, "Aprovar pedido exige a permissão ebd_gestao.");
      const pedidoId = auth.idDeRota(req.body && req.body.pedidoId);
      if (!pedidoId) return erro(context, 400, "Informe pedidoId.");
      const pedido = await revistas.buscarPedidoPorId(pool, pedidoId);
      if (!pedido) return erro(context, 404, "Pedido não encontrado.");
      const turma = await ebdTurmas.buscarTurmaPorId(pool, pedido.turmaId);
      if (!turma || !(await podeAcessarCongregacao(pool, usuario, turma.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await revistas.aprovarPedido(pool, { pedidoId, aprovadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "pedidos/pagamento" && metodo === "POST") {
      if (!temEbdGestao(usuario)) return erro(context, 403, "Registrar pagamento exige a permissão ebd_gestao.");
      const pedidoId = auth.idDeRota(req.body && req.body.pedidoId);
      if (!pedidoId) return erro(context, 400, "Informe pedidoId.");
      const pedido = await revistas.buscarPedidoPorId(pool, pedidoId);
      if (!pedido) return erro(context, 404, "Pedido não encontrado.");
      const turma = await ebdTurmas.buscarTurmaPorId(pool, pedido.turmaId);
      if (!turma || !(await podeAcessarCongregacao(pool, usuario, turma.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await revistas.registrarPagamentoPedido(pool, { pedidoId, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Consolidado (item 2 do v6.6) ----
    if (acao === "consolidado" && metodo === "GET") {
      if (!temEbdGestao(usuario)) return erro(context, 403, "Ver o consolidado exige a permissão ebd_gestao.");
      const trimestre = req.query && req.query.trimestre;
      const nomesCongregacoesPermitidas = usuario.escopoCongregacoes === "TODAS" ? null : (Array.isArray(usuario.escopoCongregacoes) ? usuario.escopoCongregacoes : []);
      const pedidos = await revistas.listarPedidosParaConsolidado(pool, { trimestre, nomesCongregacoesPermitidas });
      context.res = { status: 200, body: { sucesso: true, areas: revistas.consolidarPedidosPorAreaCongregacao(pedidos) } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoEbdRevistas] erro:", e);
    erro(context, 500, "Erro interno ao processar pedidos de revistas.");
  }
};
