// GestaoPrestacoesContas (v4.12 — itens 9 e 10; prazo fatal + Ata automática
// implementados na Trava de Revisão 4-A)
// Prestação de contas mensal (Reg. Art. 120): comprovantes de água/luz,
// prazo fatal (1º útil, tolerância dia 5), Ata de Pendência automática e
// bloqueio de repasse por falta de prestação.
// GET  /api/prestacoes-contas?mesReferencia=&congregacaoId=
// POST /api/prestacoes-contas -> { congregacaoId, mesReferencia, comprovanteAguaBase64?, mimeTypeAgua?, comprovanteLuzBase64?, mimeTypeLuz? }
// PUT  /api/prestacoes-contas/{id} -> { acao: 'LIBERAR'|'BLOQUEAR' }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { estaEmAtraso, gerarTextoAtaPendencia } = require("../shared/prestacoesContas");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

// Gera a Ata de Pendência (texto simples, mesmo tratamento de "documento" que
// os comprovantes: sobe pro Blob Storage e guarda só a URL) e materializa a
// pendência da congregação/mês como um registro real em PrestacoesContas,
// bloqueando o repasse — reaproveitado tanto para linhas já existentes
// (submetidas incompletas) quanto para congregações que não registraram nada.
async function gerarAtaEBloquear(pool, { prestacaoId, congregacaoId, congregacaoNome, mesReferencia, temAgua, temLuz }) {
  const textoAta = gerarTextoAtaPendencia({ congregacaoNome, mesReferencia, temAgua, temLuz });
  const ataUrl = await storage.salvarDocumento(Buffer.from(textoAta, "utf-8"), "text/plain");

  if (prestacaoId) {
    await pool.request().input("id", sql.Int, prestacaoId).input("ata", sql.NVarChar(500), ataUrl)
      .query(`UPDATE PrestacoesContas SET Status = 'ATA_PENDENCIA', BloqueioRepasse = 1, AtaPendenciaUrl = @ata WHERE PrestacaoId = @id`);
    await registrarAuditoria({
      tabela: "PrestacoesContas", registroId: prestacaoId, acao: "Ata de Pendência gerada automaticamente (prazo vencido)",
      dadosDepois: { congregacaoId, mesReferencia, status: "ATA_PENDENCIA", bloqueioRepasse: true }
    });
    return prestacaoId;
  }

  const criada = await pool.request().input("cong", sql.Int, congregacaoId).input("mes", sql.Char(7), mesReferencia)
    .input("status", sql.NVarChar(20), "ATA_PENDENCIA").input("ata", sql.NVarChar(500), ataUrl)
    .query(`INSERT INTO PrestacoesContas (CongregacaoId, MesReferencia, Status, BloqueioRepasse, AtaPendenciaUrl)
            OUTPUT INSERTED.PrestacaoId VALUES (@cong, @mes, @status, 1, @ata)`);
  const novoId = criada.recordset[0].PrestacaoId;
  await registrarAuditoria({
    tabela: "PrestacoesContas", registroId: novoId, acao: "Ata de Pendência gerada automaticamente (prestação não registrada até o prazo)",
    dadosDepois: { congregacaoId, mesReferencia, status: "ATA_PENDENCIA", bloqueioRepasse: true }
  });
  return novoId;
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Prestação de contas é conferida pela Tesouraria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { mesReferencia, congregacaoId } = req.query || {};
    const hoje = new Date();

    if (mesReferencia) {
      // Com mês de referência informado dá pra calcular o prazo fatal: parte
      // de TODAS as congregações (LEFT JOIN), não só das que já registraram
      // algo, senão quem nunca prestou contas simplesmente some da listagem
      // em vez de aparecer "EM ATRASO".
      const request = pool.request().input("mes", sql.Char(7), mesReferencia);
      let where = "1=1";
      if (congregacaoId) { request.input("cong", sql.Int, congregacaoId); where += " AND c.CongregacaoId = @cong"; }
      const result = await request.query(`
        SELECT c.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
               p.PrestacaoId AS prestacaoId, p.Status AS status, p.BloqueioRepasse AS bloqueioRepasse,
               CASE WHEN p.ComprovanteAguaUrl IS NOT NULL THEN 1 ELSE 0 END AS temAgua,
               CASE WHEN p.ComprovanteLuzUrl IS NOT NULL THEN 1 ELSE 0 END AS temLuz
        FROM Congregacoes c
        LEFT JOIN PrestacoesContas p ON p.CongregacaoId = c.CongregacaoId AND p.MesReferencia = @mes
        WHERE ${where} ORDER BY c.Nome
      `);

      const emAtraso = estaEmAtraso(mesReferencia, hoje);
      const linhas = [];
      for (const row of result.recordset) {
        const jaCompleta = row.status === "COMPLETA";
        const jaComAta = row.status === "ATA_PENDENCIA";
        if (!jaCompleta && !jaComAta && emAtraso) {
          // Transição automática: prazo (com tolerância) estourou e a
          // prestação continua incompleta/inexistente — gera a Ata de
          // Pendência e bloqueia o repasse agora, na leitura.
          const novoId = await gerarAtaEBloquear(pool, {
            prestacaoId: row.prestacaoId, congregacaoId: row.congregacaoId, congregacaoNome: row.congregacaoNome,
            mesReferencia, temAgua: !!row.temAgua, temLuz: !!row.temLuz
          });
          linhas.push({
            congregacaoId: row.congregacaoId, congregacaoNome: row.congregacaoNome, mesReferencia,
            prestacaoId: novoId, status: "ATA_PENDENCIA", bloqueioRepasse: true, emAtraso: true,
            temAgua: !!row.temAgua, temLuz: !!row.temLuz
          });
        } else {
          linhas.push({
            congregacaoId: row.congregacaoId, congregacaoNome: row.congregacaoNome, mesReferencia,
            prestacaoId: row.prestacaoId, status: row.status || "PENDENTE", bloqueioRepasse: !!row.bloqueioRepasse,
            emAtraso, temAgua: !!row.temAgua, temLuz: !!row.temLuz
          });
        }
      }
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: linhas };
      return;
    }

    // Sem mês de referência: listagem geral (histórico), só com o que já foi
    // registrado — mantém o comportamento original.
    const request = pool.request();
    let where = "1=1";
    if (congregacaoId) { request.input("cong", sql.Int, congregacaoId); where += " AND p.CongregacaoId = @cong"; }
    const result = await request.query(`
      SELECT p.PrestacaoId AS prestacaoId, p.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
             p.MesReferencia AS mesReferencia, p.Status AS status, p.BloqueioRepasse AS bloqueioRepasse,
             CASE WHEN p.ComprovanteAguaUrl IS NOT NULL THEN 1 ELSE 0 END AS temAgua,
             CASE WHEN p.ComprovanteLuzUrl IS NOT NULL THEN 1 ELSE 0 END AS temLuz
      FROM PrestacoesContas p JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId
      WHERE ${where} ORDER BY p.MesReferencia DESC, c.Nome
    `);
    const linhas = result.recordset.map(row => ({ ...row, emAtraso: estaEmAtraso(row.mesReferencia, hoje) }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: linhas };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, mesReferencia, comprovanteAguaBase64, mimeTypeAgua, comprovanteLuzBase64, mimeTypeLuz } = req.body || {};
    if (!congregacaoId || !mesReferencia) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, mesReferencia." } };
      return;
    }
    const existente = await pool.request().input("cong", sql.Int, congregacaoId).input("mes", sql.Char(7), mesReferencia)
      .query(`SELECT PrestacaoId FROM PrestacoesContas WHERE CongregacaoId = @cong AND MesReferencia = @mes`);
    if (existente.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe prestação de contas para esta congregação e mês." } };
      return;
    }

    let aguaUrl = null;
    let luzUrl = null;
    if (comprovanteAguaBase64) {
      if (!mimeTypeAgua || !MIME_PERMITIDOS.includes(mimeTypeAgua)) { context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de comprovante de água inválido." } }; return; }
      aguaUrl = await storage.salvarDocumento(Buffer.from(comprovanteAguaBase64, "base64"), mimeTypeAgua);
    }
    if (comprovanteLuzBase64) {
      if (!mimeTypeLuz || !MIME_PERMITIDOS.includes(mimeTypeLuz)) { context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de comprovante de luz inválido." } }; return; }
      luzUrl = await storage.salvarDocumento(Buffer.from(comprovanteLuzBase64, "base64"), mimeTypeLuz);
    }

    const completa = !!(aguaUrl && luzUrl);
    // Se o prazo (com tolerância até o dia 5) já estourou no momento do
    // registro, a prestação chega atrasada: qualquer coisa que não seja
    // "completa" já nasce com Ata de Pendência + bloqueio. Se ainda está
    // dentro do prazo, fica só como PENDENTE (sem Ata, sem bloqueio) — a
    // congregação ainda tem até o dia 5 pra regularizar.
    const emAtraso = estaEmAtraso(mesReferencia, new Date());
    const geraAtaImediata = !completa && emAtraso;
    const status = completa ? "COMPLETA" : (geraAtaImediata ? "ATA_PENDENCIA" : "PENDENTE");
    const bloqueio = completa ? 0 : (geraAtaImediata ? 1 : 0);

    let ataUrl = null;
    if (geraAtaImediata) {
      const cong = await pool.request().input("cong", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @cong`);
      const congregacaoNome = cong.recordset[0] ? cong.recordset[0].Nome : String(congregacaoId);
      const textoAta = gerarTextoAtaPendencia({ congregacaoNome, mesReferencia, temAgua: !!aguaUrl, temLuz: !!luzUrl });
      ataUrl = await storage.salvarDocumento(Buffer.from(textoAta, "utf-8"), "text/plain");
    }

    const criada = await pool.request().input("cong", sql.Int, congregacaoId).input("mes", sql.Char(7), mesReferencia)
      .input("agua", sql.NVarChar(500), aguaUrl).input("luz", sql.NVarChar(500), luzUrl)
      .input("status", sql.NVarChar(20), status).input("bloqueio", sql.Bit, bloqueio).input("por", sql.Int, usuario.membroId)
      .input("ata", sql.NVarChar(500), ataUrl)
      .query(`INSERT INTO PrestacoesContas (CongregacaoId, MesReferencia, ComprovanteAguaUrl, ComprovanteLuzUrl, Status, BloqueioRepasse, RegistradoPor, AtaPendenciaUrl)
              OUTPUT INSERTED.PrestacaoId VALUES (@cong, @mes, @agua, @luz, @status, @bloqueio, @por, @ata)`);
    await registrarAuditoria({
      tabela: "PrestacoesContas", registroId: criada.recordset[0].PrestacaoId,
      acao: geraAtaImediata ? "Registrou prestação de contas em atraso — Ata de Pendência gerada" : "Registrou prestação de contas",
      usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, mesReferencia, status, bloqueioRepasse: !!bloqueio }
    });

    let mensagem;
    if (completa) mensagem = "✅ Prestação de contas completa.";
    else if (geraAtaImediata) mensagem = "⚠️ Prazo fatal já vencido (tolerância até o dia 5) e comprovante(s) de água/luz ausente(s) — Ata de Pendência gerada e repasse BLOQUEADO (Reg. Art. 120 §3º).";
    else mensagem = "ℹ️ Prestação registrada incompleta, mas ainda dentro do prazo de tolerância (até o dia 5) — regularize os comprovantes de água/luz antes do vencimento.";
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem } };
    return;
  }

  if (req.method === "PUT" && id) {
    const { acao } = req.body || {};
    if (acao !== "LIBERAR" && acao !== "BLOQUEAR") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida — use 'LIBERAR' ou 'BLOQUEAR'." } };
      return;
    }
    const novoBloqueio = acao === "BLOQUEAR" ? 1 : 0;
    await pool.request().input("id", sql.Int, id).input("bloqueio", sql.Bit, novoBloqueio)
      .query(`UPDATE PrestacoesContas SET BloqueioRepasse = @bloqueio WHERE PrestacaoId = @id`);
    await registrarAuditoria({
      tabela: "PrestacoesContas", registroId: Number(id), acao: acao === "BLOQUEAR" ? "Bloqueou repasse por prestação de contas" : "Liberou repasse (prestação regularizada)", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: acao === "BLOQUEAR" ? "🔒 Repasse bloqueado." : "✅ Repasse liberado." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Rota inválida." } };
};
