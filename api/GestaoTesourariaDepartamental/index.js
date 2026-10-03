// GestaoTesourariaDepartamental (v5.4 — Tesouraria Central por Departamento
// + Rateio). Fonte: protótipo conceitual `relatorios-departamentos` (ver
// README FASE 5). Este é o lado GERAL/campo inteiro (fundo discricionário
// do próprio departamento, Estatuto Art. 49 — autonomia de gestão): fica
// exclusivo, não se funde no caixa geral compartilhado da FASE 4, mas
// aparece no `RelatorioSituacaoTesouro` (v4.10) pra auditoria do Conselho
// Fiscal/Tesoureiro Geral. O lado LOCAL (por congregação) é diferente:
// gasta pelo `GestaoSaidas`/`SaidasTesouraria` já existente, com Centro de
// Custo `DEPTO_<SIGLA>` — reaproveita a mesma alçada/segregação/quatro-
// olhos que protege qualquer despesa da igreja (migração 097).
//
// GET  /api/tesouraria-departamental?departamentoId=&mes=&ano=   -> resumo do mês (ao vivo ou congelado)
// GET  /api/tesouraria-departamental/perfil?departamentoId=      -> perfil de rateio vigente
// PUT  /api/tesouraria-departamental/perfil                      -> body: {departamentoId, metodo, percentualGeral?, modoEntrada, suporteSecretariaGeralHabilitado, valorSuporteSecretariaGeral?} (só GLOBAL)
// GET  /api/tesouraria-departamental/despesas?departamentoId=&mes=&ano= -> lista
// POST /api/tesouraria-departamental/despesas                    -> body: {departamentoId, mesReferencia, anoReferencia, descricao, valor, autorizadoPor?} (DEPARTAMENTO/GLOBAL)
// POST /api/tesouraria-departamental/fechar                      -> body: {departamentoId, mesReferencia, anoReferencia} (DEPARTAMENTO/GLOBAL)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const td = require("../shared/tesourariaDepartamental");

// v5.4 (correção) — soma o rateio já CONGELADO (ValorParaGeral/ValorParaLocal,
// gravado na aprovação geral/retificação, ver GestaoRelatoriosDepartamentais)
// em vez de recalcular ao vivo com o perfil atual — evita que mudar o
// perfil de rateio depois altere retroativamente o valor de meses já
// fechados ou em curso.
async function movimentacaoDoMes(pool, departamentoId, mes, ano) {
  const result = await pool.request().input("depId", sql.Int, departamentoId).input("mes", sql.Int, mes).input("ano", sql.Int, ano).query(`
    SELECT COUNT(*) AS relatoriosContabilizados,
           ISNULL(SUM(ValorParaGeral), 0) AS movimentacaoGeralMes,
           ISNULL(SUM(ValorParaLocal), 0) AS investidoLocal,
           SUM(CASE WHEN ValorParaLocal IS NULL THEN 1 ELSE 0 END) AS relatoriosSemParaLocalRastreado
    FROM RelatoriosDepartamentais
    WHERE DepartamentoId = @depId AND MesReferencia = @mes AND AnoReferencia = @ano
      AND Status IN ('APROVADO_GERAL', 'RETIFICADO') AND ValorParaGeral IS NOT NULL
  `);
  const linha = result.recordset[0];
  return {
    movimentacaoGeralMes: Number(linha.movimentacaoGeralMes),
    investidoLocal: Number(linha.investidoLocal),
    temParaLocalNaoRastreado: linha.relatoriosSemParaLocalRastreado > 0,
    relatoriosContabilizados: linha.relatoriosContabilizados
  };
}

async function totalDespesasDoMes(pool, departamentoId, mes, ano) {
  const result = await pool.request().input("depId", sql.Int, departamentoId).input("mes", sql.Int, mes).input("ano", sql.Int, ano)
    .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM DespesasTesourariaDepartamento WHERE DepartamentoId = @depId AND MesReferencia = @mes AND AnoReferencia = @ano`);
  return result.recordset[0].total;
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "tesouraria_departamental");
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;

  // ---- GET/PUT: perfil de rateio ----
  if (acao === "perfil") {
    if (req.method === "GET") {
      const departamentoId = Number(req.query && req.query.departamentoId);
      if (!departamentoId || !auth.podeDepartamento(usuario, departamentoId)) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
        return;
      }
      const perfil = await td.buscarPerfilRateio(pool, departamentoId);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: perfil || { sucesso: false, mensagem: "Departamento sem perfil de rateio configurado." } };
      return;
    }
    if (req.method === "PUT") {
      // Docs/03: quem CONFIGURA o perfil de rateio é sempre o Secretário
      // Geral (a pedido do Líder Geral) — nem o próprio Líder Geral edita
      // isso direto.
      if (usuario.nivel !== "GLOBAL") {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Só o Secretário Geral/Presidente configura o perfil de rateio (a pedido do Líder Geral do departamento)." } };
        return;
      }
      const { departamentoId, metodo, percentualGeral, modoEntrada, suporteSecretariaGeralHabilitado, valorSuporteSecretariaGeral } = req.body || {};
      if (!departamentoId || !td.METODOS_VALIDOS.includes(metodo) || !td.MODOS_ENTRADA_VALIDOS.includes(modoEntrada)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: departamentoId, metodo (${td.METODOS_VALIDOS.join("/")}), modoEntrada (${td.MODOS_ENTRADA_VALIDOS.join("/")}).` } };
        return;
      }
      const perfilAntes = await td.buscarPerfilRateio(pool, departamentoId);
      if (!perfilAntes) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Departamento sem schema de relatório configurado (v5.2) — não há o que ratear." } };
        return;
      }
      await pool.request()
        .input("id", sql.Int, perfilAntes.perfilRateioId).input("metodo", sql.NVarChar(20), metodo)
        .input("percentualGeral", sql.Decimal(5, 2), percentualGeral != null ? percentualGeral : null)
        .input("modoEntrada", sql.NVarChar(20), modoEntrada)
        .input("suporte", sql.Bit, !!suporteSecretariaGeralHabilitado)
        .input("valorSuporte", sql.Decimal(14, 2), valorSuporteSecretariaGeral != null ? valorSuporteSecretariaGeral : null)
        .query(`UPDATE PerfisRateioDepartamental SET Metodo = @metodo, PercentualGeral = @percentualGeral, ModoEntrada = @modoEntrada,
                SuporteSecretariaGeralHabilitado = @suporte, ValorSuporteSecretariaGeral = @valorSuporte, Confirmado = 1, AtualizadoEm = SYSUTCDATETIME()
                WHERE PerfilRateioId = @id`);
      await registrarAuditoria({
        tabela: "PerfisRateioDepartamental", registroId: perfilAntes.perfilRateioId, acao: "Configurou perfil de rateio departamental",
        usuarioId: usuario.membroId, dadosAntes: perfilAntes, dadosDepois: { metodo, percentualGeral, modoEntrada, suporteSecretariaGeralHabilitado, valorSuporteSecretariaGeral }
      });
      const perfilDepois = await td.buscarPerfilRateio(pool, departamentoId);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: perfilDepois };
      return;
    }
  }

  // ---- GET/POST: despesas ----
  if (acao === "despesas") {
    const departamentoId = Number((req.query && req.query.departamentoId) || (req.body && req.body.departamentoId));
    if (!departamentoId || !auth.podeDepartamento(usuario, departamentoId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    if (req.method === "GET") {
      const mes = Number(req.query.mes), ano = Number(req.query.ano);
      const result = await pool.request().input("depId", sql.Int, departamentoId).input("mes", sql.Int, mes).input("ano", sql.Int, ano)
        .query(`SELECT d.DespesaId AS despesaId, d.Descricao AS descricao, d.Valor AS valor,
                       d.AutorizadoPor AS autorizadoPor, m2.Nome AS nomeAutorizador,
                       m.Nome AS nomeLancador, d.CriadoEm AS criadoEm
                FROM DespesasTesourariaDepartamento d
                JOIN MembroReferencia m ON m.MembroId = d.LancadoPor
                LEFT JOIN MembroReferencia m2 ON m2.MembroId = d.AutorizadoPor
                WHERE d.DepartamentoId = @depId AND d.MesReferencia = @mes AND d.AnoReferencia = @ano ORDER BY d.CriadoEm DESC`);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
      return;
    }
    if (req.method === "POST") {
      if (!["DEPARTAMENTO", "GLOBAL"].includes(usuario.nivel)) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Só o Líder Geral do departamento (ou GLOBAL) lança despesa." } };
        return;
      }
      const { mesReferencia, anoReferencia, descricao, valor, autorizadoPor } = req.body || {};
      const mes = Number(mesReferencia), ano = Number(anoReferencia), valorNum = Number(valor);
      if (!mes || !ano || !descricao || !String(descricao).trim() || !valorNum || valorNum <= 0) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: mesReferencia, anoReferencia, descricao, valor (> 0)." } };
        return;
      }
      if (await td.balanceteBloqueado(pool, departamentoId, mes, ano)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Balancete do mês anterior não foi entregue (fechado) — liberação de novos recursos bloqueada (Reg. Art. 133-C §2º)." } };
        return;
      }
      const parametros = await pool.request().input("depId", sql.Int, departamentoId)
        .query(`SELECT LimiteDespesaSemAutorizacao AS limite FROM ParametrosTesourariaDepartamento WHERE DepartamentoId = @depId`);
      const limite = parametros.recordset[0] ? parametros.recordset[0].limite : 0;
      if (td.precisaAutorizacao(valorNum, limite) && !autorizadoPor) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Despesa acima de R$ ${Number(limite).toFixed(2)} exige autorização por escrito do Pastor Presidente/1º Secretário (Estatuto, Art. 49, I).` } };
        return;
      }
      if (autorizadoPor) {
        const autorizador = await pool.request().input("id", sql.Int, autorizadoPor).query(`
          SELECT p.Nivel AS nivel FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId WHERE l.MembroId = @id`);
        if (!autorizador.recordset.some(r => r.nivel === "GLOBAL")) {
          context.res = { status: 200, body: { sucesso: false, mensagem: "Quem autoriza precisa ter papel de nível GLOBAL (Pastor Presidente/1º Secretário)." } };
          return;
        }
      }
      const inserido = await pool.request()
        .input("depId", sql.Int, departamentoId).input("mes", sql.Int, mes).input("ano", sql.Int, ano)
        .input("descricao", sql.NVarChar(300), String(descricao).trim()).input("valor", sql.Decimal(14, 2), valorNum)
        .input("autorizadoPor", sql.Int, autorizadoPor || null).input("lancadoPor", sql.Int, usuario.membroId)
        .query(`INSERT INTO DespesasTesourariaDepartamento (DepartamentoId, MesReferencia, AnoReferencia, Descricao, Valor, AutorizadoPor, LancadoPor)
                OUTPUT INSERTED.DespesaId VALUES (@depId, @mes, @ano, @descricao, @valor, @autorizadoPor, @lancadoPor)`);
      await registrarAuditoria({
        tabela: "DespesasTesourariaDepartamento", registroId: inserido.recordset[0].DespesaId,
        acao: `Lançou despesa (${descricao}, R$ ${valorNum.toFixed(2)})`, usuarioId: usuario.membroId,
        dadosDepois: { departamentoId, mesReferencia: mes, anoReferencia: ano, descricao, valor: valorNum, autorizadoPor }
      });
      context.res = { status: 201, body: { sucesso: true, mensagem: "✅ Despesa lançada.", despesaId: inserido.recordset[0].DespesaId } };
      return;
    }
  }

  // ---- POST: fechar mês (gera e congela, mesmo padrão de RelatoriosCredenciamento) ----
  if (acao === "fechar" && req.method === "POST") {
    const { departamentoId, mesReferencia, anoReferencia } = req.body || {};
    const depId = Number(departamentoId), mes = Number(mesReferencia), ano = Number(anoReferencia);
    if (!depId || !mes || !ano) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: departamentoId, mesReferencia, anoReferencia." } };
      return;
    }
    if (!auth.podeDepartamento(usuario, depId) || !["DEPARTAMENTO", "GLOBAL"].includes(usuario.nivel)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Só o Líder Geral do departamento (ou GLOBAL) fecha o mês." } };
      return;
    }

    const existente = await pool.request().input("depId", sql.Int, depId).input("mes", sql.Int, mes).input("ano", sql.Int, ano)
      .query(`SELECT * FROM TesourariasDepartamento WHERE DepartamentoId = @depId AND MesReferencia = @mes AND AnoReferencia = @ano`);
    if (existente.recordset.length > 0) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ...existente.recordset[0], novo: false } };
      return;
    }

    if (await td.balanceteBloqueado(pool, depId, mes, ano)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "O mês anterior ainda não foi fechado — não dá pra fechar fora de ordem (Reg. Art. 133-C §2º)." } };
      return;
    }

    const perfil = await td.buscarPerfilRateio(pool, depId);
    if (!perfil) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Departamento sem perfil de rateio configurado." } };
      return;
    }
    const { movimentacaoGeralMes, investidoLocal } = await movimentacaoDoMes(pool, depId, mes, ano);
    const totalDespesas = await totalDespesasDoMes(pool, depId, mes, ano);
    const ultimoFechamento = await td.buscarUltimoFechamento(pool, depId, mes, ano);
    const saldoTransportado = ultimoFechamento ? ultimoFechamento.saldoMes : 0;
    const suporteSecretariaGeral = perfil.suporteSecretariaGeralHabilitado ? (Number(perfil.valorSuporteSecretariaGeral) || 0) : 0;
    const saldoMes = td.calcularSaldoMes({ saldoTransportado, movimentacaoGeralMes, suporteSecretariaGeral, totalDespesas });

    const inserido = await pool.request()
      .input("depId", sql.Int, depId).input("mes", sql.Int, mes).input("ano", sql.Int, ano)
      .input("saldoTransportado", sql.Decimal(14, 2), saldoTransportado).input("movimentacaoGeralMes", sql.Decimal(14, 2), movimentacaoGeralMes)
      .input("investidoLocal", sql.Decimal(14, 2), investidoLocal).input("suporteSecretariaGeral", sql.Decimal(14, 2), suporteSecretariaGeral)
      .input("totalDespesas", sql.Decimal(14, 2), totalDespesas).input("saldoMes", sql.Decimal(14, 2), saldoMes)
      .input("fechadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO TesourariasDepartamento
                (DepartamentoId, MesReferencia, AnoReferencia, SaldoTransportado, MovimentacaoGeralMes, InvestidoLocal, SuporteSecretariaGeral, TotalDespesas, SaldoMes, FechadoPor)
              OUTPUT INSERTED.*
              VALUES (@depId, @mes, @ano, @saldoTransportado, @movimentacaoGeralMes, @investidoLocal, @suporteSecretariaGeral, @totalDespesas, @saldoMes, @fechadoPor)`);

    await registrarAuditoria({
      tabela: "TesourariasDepartamento", registroId: inserido.recordset[0].TesourariaId,
      acao: `Fechou o balancete do mês (${mes}/${ano}, saldo R$ ${saldoMes.toFixed(2)})`, usuarioId: usuario.membroId,
      dadosDepois: { departamentoId: depId, mesReferencia: mes, anoReferencia: ano, saldoMes }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { ...inserido.recordset[0], novo: true } };
    return;
  }

  // ---- GET: resumo do mês (sem acao) ----
  if (!acao && req.method === "GET") {
    const departamentoId = Number(req.query && req.query.departamentoId);
    const mes = Number(req.query && req.query.mes), ano = Number(req.query && req.query.ano);
    if (!departamentoId || !mes || !ano) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe departamentoId, mes e ano." } };
      return;
    }
    if (!auth.podeDepartamento(usuario, departamentoId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }

    const existente = await pool.request().input("depId", sql.Int, departamentoId).input("mes", sql.Int, mes).input("ano", sql.Int, ano)
      .query(`SELECT * FROM TesourariasDepartamento WHERE DepartamentoId = @depId AND MesReferencia = @mes AND AnoReferencia = @ano`);
    const bloqueado = await td.balanceteBloqueado(pool, departamentoId, mes, ano);

    if (existente.recordset.length > 0) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ...existente.recordset[0], fechado: true, bloqueado } };
      return;
    }

    const perfil = await td.buscarPerfilRateio(pool, departamentoId);
    if (!perfil) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Departamento sem perfil de rateio configurado." } };
      return;
    }
    const { movimentacaoGeralMes, investidoLocal, temParaLocalNaoRastreado, relatoriosContabilizados } = await movimentacaoDoMes(pool, departamentoId, mes, ano);
    const totalDespesas = await totalDespesasDoMes(pool, departamentoId, mes, ano);
    const ultimoFechamento = await td.buscarUltimoFechamento(pool, departamentoId, mes, ano);
    const saldoTransportado = ultimoFechamento ? ultimoFechamento.saldoMes : 0;
    const suporteSecretariaGeral = perfil.suporteSecretariaGeralHabilitado ? (Number(perfil.valorSuporteSecretariaGeral) || 0) : 0;
    const saldoMes = td.calcularSaldoMes({ saldoTransportado, movimentacaoGeralMes, suporteSecretariaGeral, totalDespesas });

    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: {
        departamentoId, mesReferencia: mes, anoReferencia: ano, fechado: false, bloqueado,
        perfil, saldoTransportado, movimentacaoGeralMes, investidoLocal, temParaLocalNaoRastreado,
        suporteSecretariaGeral, totalDespesas, saldoMes, relatoriosContabilizados
      }
    };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método/ação não suportados." } };
};
