// GestaoRemessasBancarias (v4.7)
// Gera um único arquivo de remessa bancária (CNAB 240, shared/cnab240.js)
// pra pagar várias Saídas já APROVADAS de uma vez — sobe um arquivo no
// banco em vez de PIX/TED um por um. Só entram Saídas cujo fornecedor tem
// dados bancários confirmados e completos (Banco/Agência/Conta); uma
// Saída que já está em outra remessa ainda pendente/processada não entra
// de novo (mas uma que FALHOU pode ser reincluída numa remessa nova).
// Gerar remessa é restrito a nível Global (move dinheiro de várias
// congregações de uma vez, mesmo princípio de RegistrarRepasseTesouraria).
// Número sequencial do arquivo nunca reinicia (mesmo princípio do Termo
// nº). A leitura do arquivo de retorno fica em ProcessarRetornoRemessa —
// só ali uma Saída realmente vira PAGA.
// GET  /api/remessas-bancarias -> lista
// GET  /api/remessas-bancarias/{id} -> detalhe + itens
// POST /api/remessas-bancarias -> { congregacaoId? } (opcional: restringe a uma congregação)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const cnab240 = require("../shared/cnab240");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT r.RemessaId AS remessaId, r.NumeroSequencial AS numeroSequencial, r.TotalRegistros AS totalRegistros,
             r.ValorTotal AS valorTotal, r.Status AS status, CONVERT(varchar(33), r.CriadoEm, 126) AS criadoEm,
             CONVERT(varchar(33), r.ProcessadoEm, 126) AS processadoEm
      FROM RemessasBancarias r ORDER BY r.NumeroSequencial DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const remessa = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM RemessasBancarias WHERE RemessaId = @id`);
    if (remessa.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Remessa não encontrada." } };
      return;
    }
    const itens = await pool.request().input("id", sql.Int, id).query(`
      SELECT ri.RemessaItemId AS remessaItemId, ri.SaidaId AS saidaId, f.Nome AS fornecedorNome, s.Valor AS valor,
             ri.Status AS status, ri.MotivoFalha AS motivoFalha
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
        itens: itens.recordset
      }
    };
    return;
  }

  if (req.method === "POST") {
    if (usuario.nivel !== "GLOBAL") {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Gerar remessa bancária é restrito a papéis de nível Global." } };
      return;
    }
    const { congregacaoId } = req.body || {};

    const inst = await pool.request().query(`SELECT * FROM DadosBancariosInstituicao WHERE InstituicaoId = 1`);
    const dadosInst = inst.recordset[0];
    if (!dadosInst || !dadosInst.CodigoBanco || !dadosInst.Agencia || !dadosInst.Conta) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Configure os dados bancários da instituição antes de gerar uma remessa (Financeiro → Saídas → Remessa Bancária → Dados da Instituição)." } };
      return;
    }

    const request = pool.request();
    let where = `s.Status = 'APROVADA' AND f.DadosBancariosConfirmados = 1 AND f.Banco IS NOT NULL AND f.Agencia IS NOT NULL AND f.Conta IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM RemessaItens ri WHERE ri.SaidaId = s.SaidaId AND ri.Status IN ('PENDENTE', 'PROCESSADO'))`;
    if (congregacaoId) { request.input("congregacaoId", sql.Int, congregacaoId); where += " AND s.CongregacaoId = @congregacaoId"; }
    const candidatas = await request.query(`
      SELECT s.SaidaId AS saidaId, s.Valor AS valor, f.Nome AS nomeFavorecido, f.Banco AS bancoFavorecido,
             f.Agencia AS agenciaFavorecido, f.Conta AS contaFavorecido
      FROM SaidasTesouraria s JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
      WHERE ${where}
    `);
    if (candidatas.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma Saída aprovada elegível — confira se há solicitações aprovadas com fornecedor de dados bancários confirmados e completos." } };
      return;
    }

    const proximoNumero = await pool.request().query(`SELECT ISNULL(MAX(NumeroSequencial), 0) + 1 AS proximo FROM RemessasBancarias`);
    const numeroSequencial = proximoNumero.recordset[0].proximo;

    const pagamentos = candidatas.recordset.map(c => ({
      saidaId: c.saidaId, valor: c.valor, nomeFavorecido: c.nomeFavorecido,
      bancoFavorecido: c.bancoFavorecido, agenciaFavorecido: c.agenciaFavorecido, digitoAgenciaFavorecido: "",
      contaFavorecido: c.contaFavorecido, digitoContaFavorecido: ""
    }));
    const conteudoArquivo = cnab240.gerarArquivoCnab240({
      codigoBanco: dadosInst.CodigoBanco, cnpj: dadosInst.Cnpj, codigoConvenio: dadosInst.CodigoConvenio,
      agencia: dadosInst.Agencia, digitoAgencia: dadosInst.DigitoAgencia, conta: dadosInst.Conta,
      digitoConta: dadosInst.DigitoConta, razaoSocial: dadosInst.RazaoSocial, nomeBanco: dadosInst.NomeBanco
    }, pagamentos, numeroSequencial);

    const arquivoUrl = await storage.salvarDocumento(Buffer.from(conteudoArquivo, "utf-8"), "text/plain");
    const valorTotal = pagamentos.reduce((soma, p) => soma + Number(p.valor), 0);

    const criada = await pool.request()
      .input("numeroSequencial", sql.Int, numeroSequencial).input("arquivoUrl", sql.NVarChar(500), arquivoUrl)
      .input("totalRegistros", sql.Int, pagamentos.length).input("valorTotal", sql.Decimal(12, 2), valorTotal)
      .input("geradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO RemessasBancarias (NumeroSequencial, ArquivoUrl, TotalRegistros, ValorTotal, GeradoPor)
              OUTPUT INSERTED.RemessaId VALUES (@numeroSequencial, @arquivoUrl, @totalRegistros, @valorTotal, @geradoPor)`);
    const remessaId = criada.recordset[0].RemessaId;

    for (const p of pagamentos) {
      await pool.request().input("remessaId", sql.Int, remessaId).input("saidaId", sql.Int, p.saidaId)
        .query(`INSERT INTO RemessaItens (RemessaId, SaidaId) VALUES (@remessaId, @saidaId)`);
    }

    await registrarAuditoria({
      tabela: "RemessasBancarias", registroId: remessaId, acao: "Gerou remessa bancária", usuarioId: usuario.membroId,
      dadosDepois: { numeroSequencial, totalRegistros: pagamentos.length, valorTotal }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Remessa nº ${numeroSequencial} gerada com ${pagamentos.length} pagamento(s).`, remessaId } };
    return;
  }
};
