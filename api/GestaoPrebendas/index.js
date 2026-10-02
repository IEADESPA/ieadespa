// GestaoPrebendas (v4.10, segunda parte — itens 1, 3, 4 e 6)
// O ciclo mensal de verdade do sustento pastoral:
//   - GERA a prebenda recorrente do mês (bruto - IRRF = líquido) e cria a
//     Saída já APROVADA (pré-autorizada pela deliberação colegiada, não
//     passa pela alçada comum de v4.5) — pronta pra entrar na remessa
//     bancária (v4.7, pagamento em lote).
//   - Calcula o IRRF na fonte (tabela progressiva configurável) e NÃO
//     recolhe cota patronal (20%) — o ministro é contribuinte individual.
//   - Alerta risco de descaracterização de vínculo (jornada, subordinação,
//     controle de horário) se houver marcador ativo.
// Matéria da Tesouraria Geral — só o nível GERAL (papel Global com escopo de todas as congregações).
// A geração da folha é UMA transação com trava de aplicação: Saída e geração do mês nascem juntas ou não nascem, e duas
// chamadas simultâneas (duplo clique, retentativa) não geram duas Saídas aprovadas para o mesmo ministro/mês — uma Saída
// aprovada "solta" seria paga de novo na próxima remessa.
// GET  /api/prebendas?mesReferencia= -> lista de gerações do mês
// GET  /api/prebendas/alertas-risco -> riscos ativos de descaracterização
// GET  /api/prebendas/{id} -> detalhe de uma geração
// POST /api/prebendas -> { mesReferencia? } gera a folha do mês
// POST /api/prebendas/riscos -> { prebendadoId, tipoRisco, descricao } registra risco
// PUT  /api/prebendas/riscos -> { riscoId, acao: 'RESOLVER' } resolve risco
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const prebenda = require("../shared/prebenda");
const { mesReferenciaValido, soDigitos, idOpcional, obterTrava } = require("../shared/financeiroSeguro");

const MSG_MES = "mesReferencia deve estar no formato AAAA-MM.";

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const idBruto = context.bindingData.id;
  const especial = idBruto === "alertas-risco" || idBruto === "riscos";
  const rota = especial ? { presente: true, id: null } : idOpcional(idBruto);
  const id = rota.id;
  const pool = await getPool();

  if (req.method === "GET" && idBruto === "alertas-risco") {
    const result = await pool.request().query(`
      SELECT rv.RiscoVinculoId AS riscoVinculoId, rv.PrebendadoId AS prebendadoId, m.Nome AS nome,
             rv.TipoRisco AS tipoRisco, rv.Descricao AS descricao, CONVERT(varchar(33), rv.CriadoEm, 126) AS criadoEm
      FROM PrebendaRiscosVinculo rv
      JOIN Prebendados p ON p.PrebendadoId = rv.PrebendadoId
      JOIN MembroReferencia m ON m.MembroId = p.MembroId
      WHERE rv.Status = 'ATIVO' ORDER BY rv.CriadoEm DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && !rota.presente) {
    const { mesReferencia } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (mesReferencia !== undefined && mesReferencia !== "") {
      if (!mesReferenciaValido(mesReferencia)) { context.res = { status: 400, body: { sucesso: false, mensagem: MSG_MES } }; return; }
      request.input("mes", sql.Char(7), mesReferencia); where += " AND g.MesReferencia = @mes";
    }
    const result = await request.query(`
      SELECT g.PrebendaGeracaoId AS prebendaGeracaoId, g.MesReferencia AS mesReferencia, g.PrebendadoId AS prebendadoId,
             m.Nome AS nome, g.ValorBruto AS valorBruto, g.IrrfRetido AS irrfRetido, g.ValorLiquido AS valorLiquido,
             g.SaidaId AS saidaId, g.Status AS status, g.AlertaRisco AS alertaRisco
      FROM PrebendaGeracoes g
      JOIN Prebendados p ON p.PrebendadoId = g.PrebendadoId
      JOIN MembroReferencia m ON m.MembroId = p.MembroId
      WHERE ${where} ORDER BY g.MesReferencia DESC, m.Nome
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && rota.presente) {
    if (!id) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Geração de prebenda não encontrada." } };
      return;
    }
    const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT g.*, m.Nome AS nome, f.Nome AS fornecedorNome FROM PrebendaGeracoes g
      JOIN Prebendados p ON p.PrebendadoId = g.PrebendadoId
      JOIN MembroReferencia m ON m.MembroId = p.MembroId
      JOIN Fornecedores f ON f.FornecedorId = p.FornecedorId
      WHERE g.PrebendaGeracaoId = @id
    `);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Geração de prebenda não encontrada." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset[0] };
    return;
  }

  if (req.method === "POST" && idBruto === "riscos") {
    const { prebendadoId, tipoRisco, descricao } = req.body || {};
    if (!prebendadoId || !tipoRisco || typeof descricao !== "string" || !descricao.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: prebendadoId, tipoRisco, descricao." } };
      return;
    }
    if (!prebenda.TIPOS_RISCO_VINCULO.includes(tipoRisco)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `tipoRisco inválido. Use um de: ${prebenda.TIPOS_RISCO_VINCULO.join(", ")}.` } };
      return;
    }
    const prebendadoNum = auth.idDeRota(prebendadoId);
    const alvo = prebendadoNum ? await pool.request().input("id", sql.Int, prebendadoNum).query(`SELECT PrebendadoId FROM Prebendados WHERE PrebendadoId = @id`) : { recordset: [] };
    if (alvo.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Prebendado não encontrado." } };
      return;
    }
    const criado = await pool.request()
      .input("prebendadoId", sql.Int, prebendadoNum).input("tipoRisco", sql.NVarChar(20), tipoRisco)
      .input("descricao", sql.NVarChar(300), descricao.trim()).input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO PrebendaRiscosVinculo (PrebendadoId, TipoRisco, Descricao, RegistradoPor)
              OUTPUT INSERTED.RiscoVinculoId VALUES (@prebendadoId, @tipoRisco, @descricao, @registradoPor)`);
    await registrarAuditoria({
      tabela: "PrebendaRiscosVinculo", registroId: criado.recordset[0].RiscoVinculoId,
      acao: "Registrou risco de descaracterização de vínculo", usuarioId: usuario.membroId,
      dadosDepois: { prebendadoId: prebendadoNum, tipoRisco, descricao }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "⚠️ Risco de descaracterização de vínculo registrado — jornada, subordinação ou controle de horário são os elementos que a Justiça do Trabalho usa pra reconhecer vínculo empregatício." } };
    return;
  }

  if (req.method === "PUT" && idBruto === "riscos") {
    const { riscoId, acao } = req.body || {};
    if (acao !== "RESOLVER" || !riscoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe riscoId e acao: 'RESOLVER'." } };
      return;
    }
    const riscoNum = auth.idDeRota(riscoId);
    const alvo = riscoNum ? await pool.request().input("id", sql.Int, riscoNum).query(`SELECT * FROM PrebendaRiscosVinculo WHERE RiscoVinculoId = @id`) : { recordset: [] };
    if (alvo.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Risco não encontrado." } };
      return;
    }
    await pool.request().input("id", sql.Int, riscoNum)
      .query(`UPDATE PrebendaRiscosVinculo SET Status = 'RESOLVIDO', ResolvidoEm = SYSUTCDATETIME() WHERE RiscoVinculoId = @id`);
    await registrarAuditoria({
      tabela: "PrebendaRiscosVinculo", registroId: riscoNum, acao: "Resolveu risco de descaracterização de vínculo", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Risco resolvido." } };
    return;
  }


  if (req.method === "POST" && !rota.presente) {
    const hoje = new Date();
    const pedido = req.body && req.body.mesReferencia;
    const mesReferencia = pedido || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    if (!mesReferenciaValido(mesReferencia)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: MSG_MES } };
      return;
    }

    // Tudo dentro de UMA transação, sob trava de aplicação: ou a folha do mês nasce por completo (Saída + geração de cada ministro) ou não nasce nada.
    const transaction = new sql.Transaction(pool);
    const r = () => new sql.Request(transaction);
    const executor = { request: r };
    await transaction.begin();
    try {
      if (!(await obterTrava(r, "PrebendaFolha"))) {
        await transaction.rollback();
        context.res = { status: 409, body: { sucesso: false, mensagem: "Já existe uma geração da folha de prebenda em andamento — aguarde e confira o resultado antes de tentar de novo." } };
        return;
      }

      // Prebendados ativos, com ato de designação vinculado (a ata sustenta a
      // natureza não-trabalhista) e fornecedor PF com dados bancários
      // confirmados e completos (pré-requisito da remessa, v4.7). A lista é lida
      // DEPOIS da trava: quem esperou vê as gerações que a chamada anterior já gravou.
      const candidatos = await r().input("mes", sql.Char(7), mesReferencia).query(`
        SELECT p.PrebendadoId AS prebendadoId, p.MembroId AS membroId, m.Nome AS nome, m.CongregacaoId AS congregacaoId,
               p.FornecedorId AS fornecedorId, p.ValorMensalReferencia AS valorMensalReferencia, p.Cpf AS cpf, f.CpfCnpj AS fornecedorCpfCnpj,
               p.AtoDesignacaoId AS atoDesignacaoId, a.NumeroAto AS numeroAto, a.AtaUrl AS ataUrl, a.ValorMensal AS valorAto
        FROM Prebendados p
        JOIN MembroReferencia m ON m.MembroId = p.MembroId
        LEFT JOIN AtosDesignacao a ON a.AtoDesignacaoId = p.AtoDesignacaoId
        JOIN Fornecedores f ON f.FornecedorId = p.FornecedorId
        WHERE p.Status = 'ATIVO' AND f.Tipo = 'PF' AND f.DadosBancariosConfirmados = 1
          AND f.Banco IS NOT NULL AND f.Agencia IS NOT NULL AND f.Conta IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM PrebendaGeracoes g WHERE g.PrebendadoId = p.PrebendadoId AND g.MesReferencia = @mes)
        ORDER BY m.Nome
      `);

      const geradas = [];
      const puladas = [];

      for (const c of candidatos.recordset) {
        if (!c.atoDesignacaoId || !c.ataUrl) {
          puladas.push({ prebendadoId: c.prebendadoId, nome: c.nome, motivo: "Sem Ato de Designação vinculado (ata obrigatória)." });
          continue;
        }
        if (!c.congregacaoId) {
          puladas.push({ prebendadoId: c.prebendadoId, nome: c.nome, motivo: "Membro sem congregação vinculada — corrija o cadastro da pessoa." });
          continue;
        }
        // O valor nunca passa do que o ato deliberou, e a conta que recebe é a do próprio ministro (confere de novo aqui: cadastros antigos não passaram por essas travas).
        if (Number(c.valorMensalReferencia) > Number(c.valorAto)) {
          puladas.push({ prebendadoId: c.prebendadoId, nome: c.nome, motivo: "Valor de referência acima do valor do Ato de Designação — corrija o cadastro do prebendado." });
          continue;
        }
        if (soDigitos(c.cpf) !== soDigitos(c.fornecedorCpfCnpj)) {
          puladas.push({ prebendadoId: c.prebendadoId, nome: c.nome, motivo: "O CPF do fornecedor PF não confere com o CPF do prebendado — corrija o cadastro." });
          continue;
        }
        const valorBruto = prebenda.round2(Number(c.valorMensalReferencia));
        const irrfRetido = await prebenda.calcularIrrf(executor, sql, valorBruto);
        const valorLiquido = prebenda.round2(valorBruto - irrfRetido);

        const riscos = await prebenda.riscosAtivosVinculo(executor, sql, c.prebendadoId);
        const alertaRisco = riscos.length > 0
          ? "⚠️ ATENÇÃO — risco de descaracterização de vínculo: " + riscos.map(x => `${x.tipoRisco} (${x.descricao})`).join("; ")
          : null;

        // A Saída nasce APROVADA: é pré-autorizada pela deliberação colegiada
        // (ata), não é uma "solicitação de pagamento" sujeita à alçada comum
        // de v4.5. O documento que a sustenta é a própria ata.
        const saida = await r()
          .input("congregacaoId", sql.Int, c.congregacaoId).input("fornecedorId", sql.Int, c.fornecedorId)
          .input("tipo", sql.NVarChar(30), "PREBENDA_PASTORAL")
          .input("descricao", sql.NVarChar(300), `Prebenda Pastoral — ${mesReferencia} (Ato ${c.numeroAto || "sem número"})`)
          .input("valor", sql.Decimal(10, 2), valorLiquido).input("documentoFiscalUrl", sql.NVarChar(500), c.ataUrl)
          .input("solicitadoPor", sql.Int, usuario.membroId)
          .query(`INSERT INTO SaidasTesouraria (CongregacaoId, FornecedorId, Tipo, Descricao, Valor, DocumentoFiscalUrl, SolicitadoPor, Status)
                  OUTPUT INSERTED.SaidaId VALUES (@congregacaoId, @fornecedorId, @tipo, @descricao, @valor, @documentoFiscalUrl, @solicitadoPor, 'APROVADA')`);
        const saidaId = saida.recordset[0].SaidaId;

        const geracao = await r()
          .input("mes", sql.Char(7), mesReferencia).input("prebendadoId", sql.Int, c.prebendadoId)
          .input("valorBruto", sql.Decimal(10, 2), valorBruto).input("irrfRetido", sql.Decimal(10, 2), irrfRetido)
          .input("valorLiquido", sql.Decimal(10, 2), valorLiquido).input("saidaId", sql.Int, saidaId)
          .input("alertaRisco", sql.NVarChar(500), alertaRisco).input("geradaPor", sql.Int, usuario.membroId)
          .query(`INSERT INTO PrebendaGeracoes (MesReferencia, PrebendadoId, ValorBruto, IrrfRetido, ValorLiquido, SaidaId, AlertaRisco, GeradaPor)
                  OUTPUT INSERTED.PrebendaGeracaoId VALUES (@mes, @prebendadoId, @valorBruto, @irrfRetido, @valorLiquido, @saidaId, @alertaRisco, @geradaPor)`);

        geradas.push({ prebendaGeracaoId: geracao.recordset[0].PrebendaGeracaoId, prebendadoId: c.prebendadoId, nome: c.nome, valorBruto, irrfRetido, valorLiquido, saidaId, alertaRisco });
      }

      await transaction.commit();

      const nenhumaGerada = geradas.length === 0;
      const mensagem = nenhumaGerada
        ? "Nenhuma prebenda a gerar — confira se há prebendados ativos com ato de designação e fornecedor PF de dados bancários confirmados."
        : `✅ Folha de prebenda de ${mesReferencia} gerada: ${geradas.length} prebenda(s). IRRF retido na fonte; cota patronal (20%) NÃO recolhida — ministro é contribuinte individual.${puladas.length ? ` ${puladas.length} pulado(s).` : ""}`;

      await registrarAuditoria({
        tabela: "PrebendaGeracoes", registroId: geradas.length > 0 ? geradas[0].prebendaGeracaoId : 0,
        acao: "Gerou folha mensal de prebenda", usuarioId: usuario.membroId,
        dadosDepois: { mesReferencia, geradas: geradas.length, puladas: puladas.length }
      });

      context.res = {
        status: 201, headers: { "Content-Type": "application/json" },
        body: { sucesso: !nenhumaGerada, mensagem, mesReferencia, geradas, puladas,
          recolhimentos: { irrfRetido: prebenda.round2(geradas.reduce((s, g) => s + g.irrfRetido, 0)), inssPatronal: 0, contribuinteIndividual: true } }
      };
    } catch (erro) {
      try { await transaction.rollback(); } catch (e2) { /* já pode ter sido revertida */ }
      context.log.error("Falha ao gerar a folha de prebenda:", erro.message);
      context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao gerar a folha de prebenda — nada foi gravado. Avise a equipe técnica." } };
    }
    return;
  }
};
