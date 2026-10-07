// GestaoRemessasBancarias (v4.7)
// Gera um único arquivo de remessa bancária (CNAB 240, shared/cnab240.js)
// pra pagar várias Saídas já APROVADAS de uma vez — sobe um arquivo no
// banco em vez de PIX/TED um por um. A remessa repete, no instante em que é gerada, as MESMAS conferências do pagamento comum
// (shared/conferenciaPagamento.js): fornecedor ATIVO, com dados bancários confirmados e completos, Fundo PDQ não suspenso, congregação fora de tutela, saldo do centro
// de custo (já descontando o que outras remessas ainda sem retorno reservaram e o que esta própria geração já separou) e campanha de origem não cancelada — as
// condições mudam entre a aprovação e o envio. A Saída que não passa FICA DE FORA do arquivo e a resposta lista cada uma com todos os motivos (`barrados`): nada
// é enviado ao banco em silêncio e um item ruim não derruba o lote inteiro sem explicação. Uma Saída que já está em outra remessa pendente/processada (ou com
// divergência ainda a tratar) não entra de novo (mas uma que FALHOU pode ser reincluída numa remessa nova).
// Tudo aqui — inclusive LER a lista e o detalhe — é da Tesouraria Geral: só o nível GERAL (papel Global com escopo de todas as
// congregações). O arquivo CNAB traz banco, agência, conta, nome e valor de todos os favorecidos de todas as congregações
// (inclusive a prebenda líquida de cada pastor), então o link dele nunca vai para um tesoureiro local.
// A geração é UMA transação com duas travas de aplicação ("RemessaBancaria" e "PagamentoSaida"): a lista de candidatas e o saldo são lidos depois das travas, então
// duas gerações simultâneas (duplo clique) não põem a mesma Saída em duas remessas — o banco pagaria duas vezes —, e um pagamento na mão ou o retorno de outra
// remessa não gastam o mesmo saldo por baixo. Número sequencial do arquivo nunca reinicia (mesmo princípio do Termo nº) e é calculado sob a mesma trava.
// A leitura do arquivo de retorno fica em ProcessarRetornoRemessa — só ali uma Saída realmente vira PAGA. Quando o banco já pagou (ocorrência "00") mas
// a Saída deixou de passar nas conferências, o item fica DIVERGENTE e a Tesouraria Geral trata aqui (PUT): reconhece o pagamento (com justificativa) ou encerra o
// item (valor devolvido/tratado fora do sistema).
// GET  /api/remessas-bancarias -> lista
// GET  /api/remessas-bancarias/{id} -> detalhe + itens (com os motivos das divergências)
// POST /api/remessas-bancarias -> { congregacaoId? } (opcional: restringe a uma congregação) — resposta: { remessaId, barrados: [{ saidaId, fornecedorNome, valor, motivos: [{ codigo, mensagem }] }] }
// PUT  /api/remessas-bancarias/{id} -> { acao: 'TRATAR_DIVERGENCIA', remessaItemId, resolucao: 'RECONHECER_PAGAMENTO'|'ENCERRAR', observacao }
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const cnab240 = require("../shared/cnab240");
const { idOpcional, obterTrava } = require("../shared/financeiroSeguro");
const { violouUnicidade, conflito } = require("../shared/violacaoUnica");
const conferencia = require("../shared/conferenciaPagamento");
const { afetadas } = require("../shared/entradaFinanceira");

const RESOLUCOES = ["RECONHECER_PAGAMENTO", "ENCERRAR"];
const NAO_ENCONTRADA = { sucesso: false, mensagem: "Remessa não encontrada." };

function lerMotivos(texto) {
  if (!texto) return [];
  try { const lista = JSON.parse(texto); return Array.isArray(lista) ? lista : []; } catch (e) { return []; }
}

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const rota = idOpcional(context.bindingData.id);
  const id = rota.id;
  const pool = await getPool();

  if (req.method === "GET" && !rota.presente) {
    const result = await pool.request().query(`
      SELECT r.RemessaId AS remessaId, r.NumeroSequencial AS numeroSequencial, r.TotalRegistros AS totalRegistros,
             r.ValorTotal AS valorTotal, r.Status AS status, CONVERT(varchar(33), r.CriadoEm, 126) AS criadoEm,
             CONVERT(varchar(33), r.ProcessadoEm, 126) AS processadoEm,
             (SELECT COUNT(*) FROM RemessaItens rd WHERE rd.RemessaId = r.RemessaId AND rd.Status = 'DIVERGENTE') AS divergentes
      FROM RemessasBancarias r ORDER BY r.NumeroSequencial DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && rota.presente) {
    const remessa = id ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM RemessasBancarias WHERE RemessaId = @id`) : { recordset: [] };
    if (remessa.recordset.length === 0) {
      context.res = { status: 200, body: NAO_ENCONTRADA };
      return;
    }
    const itens = await pool.request().input("id", sql.Int, id).query(`
      SELECT ri.RemessaItemId AS remessaItemId, ri.SaidaId AS saidaId, f.Nome AS fornecedorNome, s.Valor AS valor,
             ri.Status AS status, ri.MotivoFalha AS motivoFalha, ri.MotivosJson AS motivosJson, s.Status AS saidaStatus,
             ri.TratamentoResolucao AS tratamentoResolucao, ri.TratamentoObservacao AS tratamentoObservacao,
             CONVERT(varchar(33), ri.TratadoEm, 126) AS tratadoEm
      FROM RemessaItens ri JOIN SaidasTesouraria s ON s.SaidaId = ri.SaidaId JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
      WHERE ri.RemessaId = @id
    `);
    const r = remessa.recordset[0];
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: {
        remessaId: r.RemessaId, numeroSequencial: r.NumeroSequencial, totalRegistros: r.TotalRegistros, valorTotal: r.ValorTotal,
        status: r.Status, arquivoUrl: storage.urlDocumentoComSas(r.ArquivoUrl),
        arquivoRetornoUrl: r.ArquivoRetornoUrl ? storage.urlDocumentoComSas(r.ArquivoRetornoUrl) : null,
        itens: itens.recordset.map(({ motivosJson, ...resto }) => ({ ...resto, motivos: lerMotivos(motivosJson) }))
      }
    };
    return;
  }

  if (req.method === "POST") {
    // vD.4 — gerar remessa bancária (dinheiro de todas as congregações) exige confirmação recente (chave de acesso ou código)
    if (!require("../shared/auth").exigirFatorRecente(req, context)) return;
    const { congregacaoId } = req.body || {};
    const filtroCong = idOpcional(congregacaoId);
    if (filtroCong.presente && !filtroCong.id) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "congregacaoId inválido." } };
      return;
    }

    const inst = await pool.request().query(`SELECT * FROM DadosBancariosInstituicao WHERE InstituicaoId = 1`);
    const dadosInst = inst.recordset[0];
    if (!dadosInst || !dadosInst.CodigoBanco || !dadosInst.Agencia || !dadosInst.Conta) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Configure os dados bancários da instituição antes de gerar uma remessa (Financeiro → Saídas → Remessa Bancária → Dados da Instituição)." } };
      return;
    }

    const transaction = new sql.Transaction(pool);
    const r = () => new sql.Request(transaction);
    const execucao = { request: r };
    await transaction.begin();
    let remessaId, numeroSequencial, pagamentos;
    const barrados = [];
    try {
      if (!(await obterTrava(r, "RemessaBancaria"))) {
        await transaction.rollback();
        context.res = { status: 409, body: { sucesso: false, mensagem: "Já existe uma geração de remessa em andamento — aguarde e confira a lista de remessas antes de tentar de novo." } };
        return;
      }
      // Segunda trava: quem paga na mão, confirma retorno ou gera outra remessa lê o mesmo saldo — um de cada vez.
      if (!(await obterTrava(r, "PagamentoSaida"))) {
        await transaction.rollback();
        context.res = { status: 409, body: { sucesso: false, mensagem: "Há um pagamento ou um retorno de banco em andamento — aguarde alguns segundos e tente de novo." } };
        return;
      }

      // As candidatas são lidas DEPOIS das travas: o que a geração anterior já pôs numa remessa aparece como PENDENTE e fica de fora. Entram TODAS as aprovadas que ainda não
      // estão em remessa (inclusive as de fornecedor sem dado bancário confirmado/completo): quem não passa vira "barrado" com o motivo, em vez de sumir sem explicação.
      // UPDLOCK: um cancelamento simultâneo da Saída espera esta transação em vez de passar por baixo.
      const request = r();
      let where = `s.Status = 'APROVADA'
                   AND NOT EXISTS (SELECT 1 FROM RemessaItens ri WHERE ri.SaidaId = s.SaidaId AND ri.Status IN ('PENDENTE', 'PROCESSADO'))
                   AND NOT EXISTS (SELECT 1 FROM RemessaItens rd WHERE rd.SaidaId = s.SaidaId AND rd.Status = 'DIVERGENTE')`;
      if (filtroCong.id) { request.input("congregacaoId", sql.Int, filtroCong.id); where += " AND s.CongregacaoId = @congregacaoId"; }
      const candidatas = await request.query(`
        SELECT s.SaidaId AS saidaId, s.Valor AS valor, s.CongregacaoId AS congregacaoId, s.CampanhaId AS campanhaId, cs.CentroCusto AS centroCusto,
               s.FornecedorId AS fornecedorId, f.Ativo AS fornecedorAtivo, f.DadosBancariosConfirmados AS dadosBancariosConfirmados,
               f.Nome AS nomeFavorecido, f.Banco AS bancoFavorecido, f.Agencia AS agenciaFavorecido, f.Conta AS contaFavorecido
        FROM SaidasTesouraria s WITH (UPDLOCK)
        LEFT JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo
        LEFT JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
        WHERE ${where}
        ORDER BY s.SaidaId
      `);
      if (candidatas.recordset.length === 0) {
        await transaction.rollback();
        context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma Saída aprovada elegível — confira se há solicitações aprovadas ainda fora de remessa.", barrados: [] } };
        return;
      }

      // A conferência do pagamento comum, uma Saída por vez e em ordem de aprovação: cada uma aceita separa o saldo dela para a seguinte (o centro de custo não é gasto duas vezes).
      const conferidor = conferencia.criarConferidor(execucao, sql, { reservas: "todas" });
      pagamentos = [];
      for (const c of candidatas.recordset) {
        // status: a consulta só traz APROVADA; banco/agência/conta têm os nomes que a conferência entende.
        const saida = { ...c, status: "APROVADA", banco: c.bancoFavorecido, agencia: c.agenciaFavorecido, conta: c.contaFavorecido };
        const conferido = await conferidor.conferir(saida, { exigirContaBancaria: true });
        if (!conferido.ok) {
          barrados.push({ saidaId: c.saidaId, fornecedorNome: c.nomeFavorecido || null, valor: c.valor, motivos: conferido.motivos });
          continue;
        }
        conferidor.reservar(saida);
        pagamentos.push({
          saidaId: c.saidaId, valor: c.valor, nomeFavorecido: c.nomeFavorecido,
          bancoFavorecido: c.bancoFavorecido, agenciaFavorecido: c.agenciaFavorecido, digitoAgenciaFavorecido: "",
          contaFavorecido: c.contaFavorecido, digitoContaFavorecido: ""
        });
      }
      if (pagamentos.length === 0) {
        await transaction.rollback();
        context.res = {
          status: 200,
          body: { sucesso: false, mensagem: `Nenhuma das ${barrados.length} Saída(s) aprovada(s) pôde entrar na remessa — veja o motivo de cada uma e resolva antes de gerar de novo.`, barrados }
        };
        return;
      }

      const proximoNumero = await r().query(`SELECT ISNULL(MAX(NumeroSequencial), 0) + 1 AS proximo FROM RemessasBancarias`);
      numeroSequencial = proximoNumero.recordset[0].proximo;

      const conteudoArquivo = cnab240.gerarArquivoCnab240({
        codigoBanco: dadosInst.CodigoBanco, cnpj: dadosInst.Cnpj, codigoConvenio: dadosInst.CodigoConvenio,
        agencia: dadosInst.Agencia, digitoAgencia: dadosInst.DigitoAgencia, conta: dadosInst.Conta,
        digitoConta: dadosInst.DigitoConta, razaoSocial: dadosInst.RazaoSocial, nomeBanco: dadosInst.NomeBanco
      }, pagamentos, numeroSequencial);

      const arquivoUrl = await storage.salvarDocumento(Buffer.from(conteudoArquivo, "utf-8"), "text/plain");
      const valorTotal = pagamentos.reduce((soma, p) => soma + Number(p.valor), 0);

      const criada = await r()
        .input("numeroSequencial", sql.Int, numeroSequencial).input("arquivoUrl", sql.NVarChar(500), arquivoUrl)
        .input("totalRegistros", sql.Int, pagamentos.length).input("valorTotal", sql.Decimal(12, 2), valorTotal)
        .input("geradoPor", sql.Int, usuario.membroId)
        .query(`INSERT INTO RemessasBancarias (NumeroSequencial, ArquivoUrl, TotalRegistros, ValorTotal, GeradoPor)
                OUTPUT INSERTED.RemessaId VALUES (@numeroSequencial, @arquivoUrl, @totalRegistros, @valorTotal, @geradoPor)`);
      remessaId = criada.recordset[0].RemessaId;

      for (const p of pagamentos) {
        await r().input("remessaId", sql.Int, remessaId).input("saidaId", sql.Int, p.saidaId)
          .query(`INSERT INTO RemessaItens (RemessaId, SaidaId) VALUES (@remessaId, @saidaId)`);
      }

      await transaction.commit();
      await registrarAuditoria({
        tabela: "RemessasBancarias", registroId: remessaId, acao: "Gerou remessa bancária", usuarioId: usuario.membroId,
        dadosDepois: { numeroSequencial, totalRegistros: pagamentos.length, valorTotal, barrados: barrados.map(b => ({ saidaId: b.saidaId, codigos: b.motivos.map(m => m.codigo) })) }
      });
    } catch (erro) {
      try { await transaction.rollback(); } catch (e2) { /* já pode ter sido revertida */ }
      // Rede do banco (UX_RemessaItens_SaidaViva e UX_RemessasBancarias_Numero, migração 129): se, apesar da trava, um pagamento já estiver numa remessa viva ou o número do arquivo
      // já existir, o banco recusa — e a transação inteira volta. Não é falha técnica: é "alguém gerou antes".
      if (violouUnicidade(erro)) {
        context.res = conflito("Não foi possível gerar a remessa: um dos pagamentos já entrou em outra remessa (ou o número do arquivo já foi usado) numa geração simultânea. Nada foi alterado — confira a lista de remessas e tente de novo.");
        return;
      }
      context.log.error("Falha ao gerar remessa bancária:", erro.message);
      context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao gerar a remessa bancária — nada foi alterado. Avise a equipe técnica." } };
      return;
    }
    const aviso = barrados.length ? ` ${barrados.length} Saída(s) aprovada(s) ficaram DE FORA do arquivo — veja o motivo de cada uma abaixo.` : "";
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Remessa nº ${numeroSequencial} gerada com ${pagamentos.length} pagamento(s).${aviso}`, remessaId, barrados } };
    return;
  }

  // Tratar um item DIVERGENTE: o banco devolveu "00" (ou não informou nada) para um pagamento que a Saída já não comporta. Duas saídas honestas: reconhecer que o
  // dinheiro saiu (a Saída vira PAGA, com a justificativa na trilha) ou encerrar o item (valor devolvido pelo banco/tratado fora do sistema: a Saída volta a poder ser paga).
  if (req.method === "PUT") {
    if (!rota.presente || !id) {
      context.res = { status: 200, body: NAO_ENCONTRADA };
      return;
    }
    const { acao, remessaItemId, resolucao, observacao } = req.body || {};
    if (acao !== "TRATAR_DIVERGENCIA") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use: TRATAR_DIVERGENCIA." } };
      return;
    }
    const itemRota = idOpcional(remessaItemId);
    if (!itemRota.id) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o remessaItemId do item a tratar." } };
      return;
    }
    if (!RESOLUCOES.includes(resolucao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `resolucao inválida. Use uma de: ${RESOLUCOES.join(", ")}.` } };
      return;
    }
    const texto = typeof observacao === "string" ? observacao.trim() : "";
    if (texto.length < 5 || texto.length > 300) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Explique o que foi conferido (de 5 a 300 caracteres) — fica na trilha de auditoria." } };
      return;
    }

    const transaction = new sql.Transaction(pool);
    const r = () => new sql.Request(transaction);
    const execucao = { request: r };
    await transaction.begin();
    try {
      if (!(await obterTrava(r, "PagamentoSaida"))) {
        await transaction.rollback();
        context.res = { status: 409, body: { sucesso: false, mensagem: "Há um pagamento ou um retorno de banco em andamento — aguarde alguns segundos e tente de novo." } };
        return;
      }
      const lido = await r().input("remessaId", sql.Int, id).input("itemId", sql.Int, itemRota.id).query(`
        SELECT ri.RemessaItemId, ri.SaidaId, ri.Status, rb.ArquivoRetornoUrl
        FROM RemessaItens ri WITH (UPDLOCK, HOLDLOCK) JOIN RemessasBancarias rb ON rb.RemessaId = ri.RemessaId
        WHERE ri.RemessaItemId = @itemId AND ri.RemessaId = @remessaId`);
      const item = lido.recordset[0];
      if (!item) {
        await transaction.rollback();
        context.res = { status: 200, body: { sucesso: false, mensagem: "Item não encontrado nesta remessa." } };
        return;
      }
      if (item.Status !== "DIVERGENTE") {
        await transaction.rollback();
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este item não está com divergência a tratar (já foi tratado ou nunca divergiu)." } };
        return;
      }
      if (resolucao === "RECONHECER_PAGAMENTO") {
        const saida = await conferencia.carregarSaida(execucao, sql, item.SaidaId, { travar: true });
        if (!saida || saida.status !== "APROVADA") {
          await transaction.rollback();
          context.res = { status: 200, body: { sucesso: false, mensagem: `Esta Saída está ${saida ? saida.status : "inexistente"} — não dá para reconhecê-la como paga. Use ENCERRAR e trate a devolução do valor pela Tesouraria.` } };
          return;
        }
        const pagou = await r().input("saidaId", sql.Int, item.SaidaId).input("pagoPor", sql.Int, usuario.membroId).input("comprovanteUrl", sql.NVarChar(500), item.ArquivoRetornoUrl)
          .query(`UPDATE SaidasTesouraria SET Status = 'PAGA', PagoPor = @pagoPor, PagoEm = SYSUTCDATETIME(), ComprovantePagamentoUrl = @comprovanteUrl
                  WHERE SaidaId = @saidaId AND Status = 'APROVADA'`);
        if (afetadas(pagou) === 0) {
          await transaction.rollback();
          context.res = { status: 200, body: { sucesso: false, mensagem: "A Saída mudou de situação enquanto o item era tratado — atualize a tela." } };
          return;
        }
        await r().input("saidaId", sql.Int, item.SaidaId)
          .query(`UPDATE PrebendaGeracoes SET Status = 'PAGA' WHERE SaidaId = @saidaId AND Status = 'GERADA'`);
      }
      const novoStatus = resolucao === "RECONHECER_PAGAMENTO" ? "PROCESSADO" : "FALHOU";
      const tratou = await r().input("itemId", sql.Int, item.RemessaItemId).input("status", sql.NVarChar(20), novoStatus).input("resolucao", sql.NVarChar(30), resolucao)
        .input("observacao", sql.NVarChar(300), texto).input("tratadoPor", sql.Int, usuario.membroId)
        .query(`UPDATE RemessaItens SET Status = @status, TratamentoResolucao = @resolucao, TratamentoObservacao = @observacao, TratadoPor = @tratadoPor, TratadoEm = SYSUTCDATETIME()
                WHERE RemessaItemId = @itemId AND Status = 'DIVERGENTE'`);
      if (afetadas(tratou) === 0) {
        // Rede: o item foi lido com a linha travada, então não deveria falhar; se falhar, nada é gravado (nem a baixa da Saída, quando reconhecida).
        await transaction.rollback();
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este item mudou de situação enquanto era tratado — atualize a tela." } };
        return;
      }
      await transaction.commit();
      await registrarAuditoria({
        tabela: "RemessaItens", registroId: item.RemessaItemId, acao: "Tratou divergência do retorno bancário", usuarioId: usuario.membroId,
        dadosDepois: { remessaId: id, saidaId: item.SaidaId, resolucao, observacao: texto }
      });
      context.res = {
        status: 200, headers: { "Content-Type": "application/json" },
        body: { sucesso: true, mensagem: resolucao === "RECONHECER_PAGAMENTO" ? "✅ Pagamento reconhecido — a Saída foi marcada como PAGA." : "✅ Item encerrado — a Saída continua aprovada e pode entrar em nova remessa (se passar nas conferências)." }
      };
    } catch (erro) {
      try { await transaction.rollback(); } catch (e2) { /* já pode ter sido revertida */ }
      context.log.error("Falha ao tratar a divergência da remessa:", erro.message);
      context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao tratar a divergência — nada foi alterado. Avise a equipe técnica." } };
    }
    return;
  }
};
