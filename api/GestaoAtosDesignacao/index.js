// GestaoAtosDesignacao (v4.10, segunda parte — item 2)
// Ato de designação ministerial com o valor fixado em deliberação de
// órgão colegiado, e a ata vinculada ao registro. Não é burocracia: é
// exatamente o que sustenta juridicamente que a prebenda NÃO é
// contraprestação por trabalho — o valor não é auto-atribuído pelo
// ministro, vem de um colegiado (CLI/Assembleia), com ata própria
// (Reg. Art. 134 §5º). Restrito a nível Global.
// GET  /api/atos-designacao -> lista
// GET  /api/atos-designacao/{id} -> detalhe (ata com link assinado)
// POST /api/atos-designacao -> { numeroAto, orgaoColegiado, dataDeliberacao, valorMensal, membroId, ataBase64, mimeType }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Ato de designação é matéria da Tesouraria Geral — restrito a papéis de nível Global." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT a.AtoDesignacaoId AS atoDesignacaoId, a.NumeroAto AS numeroAto, a.OrgaoColegiado AS orgaoColegiado,
             CONVERT(varchar(10), a.DataDeliberacao, 120) AS dataDeliberacao, a.ValorMensal AS valorMensal,
             a.MembroId AS membroId, m.Nome AS nomeMinistro
      FROM AtosDesignacao a JOIN MembroReferencia m ON m.MembroId = a.MembroId
      ORDER BY a.DataDeliberacao DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT a.*, m.Nome AS nomeMinistro FROM AtosDesignacao a
      JOIN MembroReferencia m ON m.MembroId = a.MembroId WHERE a.AtoDesignacaoId = @id
    `);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Ato de designação não encontrado." } };
      return;
    }
    const r = result.recordset[0];
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: {
        atoDesignacaoId: r.AtoDesignacaoId, numeroAto: r.NumeroAto, orgaoColegiado: r.OrgaoColegiado,
        dataDeliberacao: r.DataDeliberacao, valorMensal: r.ValorMensal, membroId: r.MembroId, nomeMinistro: r.nomeMinistro,
        ataUrl: storage.urlDocumentoComSas(r.AtaUrl)
      }
    };
    return;
  }


  if (req.method === "POST") {
    const { numeroAto, orgaoColegiado, dataDeliberacao, valorMensal, membroId, ataBase64, mimeType } = req.body || {};
    if (!numeroAto || !numeroAto.trim() || !orgaoColegiado || !orgaoColegiado.trim() || !dataDeliberacao || !valorMensal || !membroId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: numeroAto, orgaoColegiado, dataDeliberacao, valorMensal, membroId." } };
      return;
    }
    if (Number(valorMensal) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valorMensal deve ser maior que zero." } };
      return;
    }
    if (!ataBase64 || !mimeType) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Anexe a ata da deliberação — é ela que vincula o valor ao colegiado e sustenta a natureza não-trabalhista da prebenda." } };
      return;
    }
    if (!MIME_PERMITIDOS.includes(mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Formato inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` } };
      return;
    }
    const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT Nome FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Membro (ministro) não encontrado. Cadastre a pessoa antes." } };
      return;
    }

    let buffer;
    try { buffer = Buffer.from(ataBase64, "base64"); } catch (e) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo da ata inválido." } };
      return;
    }
    if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo da ata vazio ou maior que 15 MB." } };
      return;
    }
    let ataUrl;
    try { ataUrl = await storage.salvarDocumento(buffer, mimeType); } catch (erro) {
      context.log.error("Falha ao salvar ata:", erro.message);
      context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao salvar a ata. Avise a equipe técnica: " + erro.message } };
      return;
    }

    const criado = await pool.request()
      .input("numeroAto", sql.NVarChar(30), numeroAto.trim()).input("orgaoColegiado", sql.NVarChar(150), orgaoColegiado.trim())
      .input("dataDeliberacao", sql.Date, dataDeliberacao).input("valorMensal", sql.Decimal(10, 2), valorMensal)
      .input("membroId", sql.Int, membroId).input("ataUrl", sql.NVarChar(500), ataUrl).input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO AtosDesignacao (NumeroAto, OrgaoColegiado, DataDeliberacao, ValorMensal, MembroId, AtaUrl, CriadoPor)
              OUTPUT INSERTED.AtoDesignacaoId VALUES (@numeroAto, @orgaoColegiado, @dataDeliberacao, @valorMensal, @membroId, @ataUrl, @criadoPor)`);
    const atoDesignacaoId = criado.recordset[0].AtoDesignacaoId;

    await registrarAuditoria({
      tabela: "AtosDesignacao", registroId: atoDesignacaoId, acao: "Registrou ato de designação ministerial", usuarioId: usuario.membroId,
      dadosDepois: { numeroAto, orgaoColegiado, dataDeliberacao, valorMensal, membroId }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Ato de designação nº ${numeroAto.trim()} registrado com a ata vinculada.`, atoDesignacaoId } };
    return;
  }
};
