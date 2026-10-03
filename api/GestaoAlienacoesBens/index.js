// GestaoAlienacoesBens (v4.11 — itens 2 e 3)
// Alienação/venda de bens com rito de alçada (Art. 58 §1º do Estatuto):
//   - Teto de Alçada Patrimonial = 5% do PL (último balanço, calculado na
//     leitura via shared/demonstracoes.js — reaproveita a base da v4.9).
//   - Até o teto (e sem ser Templo Sede) → aprovação da CLI.
//   - Acima do teto OU Templo Sede → Assembleia Geral (exige ata).
//   - Quarentena patrimonial de 12 meses (Art. 58 §7º) trava alienação de
//     imóvel — blindagem contra venda de patrimônio logo após troca de
//     Diretoria por via diversa da eleição ordinária.
// INSTITUCIONAL: só o nível GERAL (papel Global + escopo TODAS) — o nível sozinho é rótulo
// do papel, e o escopo é cadastrado em separado na liderança (alienação é matéria de CLI/Assembleia).
// GET  /api/alienacoes-bens -> lista
// GET  /api/alienacoes-bens/{id} -> detalhe
// POST /api/alienacoes-bens -> { bemId, valorProposto }
// PUT  /api/alienacoes-bens/{id} -> { acao: 'AUTORIZAR'|'REJEITAR'|'CONCLUIR', ataBase64?, mimeType?, motivo? }
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const demonstracoes = require("../shared/demonstracoes");
const patrimonio = require("../shared/patrimonio");
const parecerViabilidade = require("../shared/parecerViabilidade");
const { idOpcional, numeroPositivo, decodificarArquivo } = require("../shared/financeiro1Util");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const ACOES = ["AUTORIZAR", "REJEITAR", "CONCLUIR", "PARECER_VIABILIDADE"];
const VALOR_MAXIMO = 9999999999.99; // DECIMAL(12,2)

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  // Id malformado recebe a mesma resposta de "não existe".
  const { tem: temId, id } = idOpcional(context.bindingData.id);
  if (temId && !id) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Alienação não encontrada." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT a.*, b.Descricao AS bemDescricao, b.Tipo AS bemTipo, m.Nome AS propostoPorNome
      FROM AlienacoesBens a
      JOIN BensPatrimoniais b ON b.BemId = a.BemId
      JOIN MembroReferencia m ON m.MembroId = a.PropostoPor
      ORDER BY a.AlienacaoId DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT a.*, b.Descricao AS bemDescricao, b.Tipo AS bemTipo FROM AlienacoesBens a
      JOIN BensPatrimoniais b ON b.BemId = a.BemId WHERE a.AlienacaoId = @id
    `);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Alienação não encontrada." } };
      return;
    }
    const r = result.recordset[0];
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: Object.assign({}, r, { ataUrl: r.AtaUrl ? storage.urlDocumentoComSas(r.AtaUrl) : null })
    };
    return;
  }

  if (req.method === "POST") {
    const corpo = req.body || {};
    const bemId = auth.idDeRota(corpo.bemId);
    if (!bemId || corpo.valorProposto === undefined || corpo.valorProposto === null || corpo.valorProposto === "") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: bemId, valorProposto." } };
      return;
    }
    const valorProposto = numeroPositivo(corpo.valorProposto, VALOR_MAXIMO);
    if (valorProposto === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valorProposto deve ser um valor maior que zero." } };
      return;
    }
    const bem = await pool.request().input("id", sql.Int, bemId).query(`SELECT * FROM BensPatrimoniais WHERE BemId = @id`);
    if (bem.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Bem não encontrado." } };
      return;
    }
    const b = bem.recordset[0];
    if (b.Status !== "ATIVO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este bem não está mais ativo — não pode ser alienado." } };
      return;
    }

    // Quarentena patrimonial (Art. 58 §7º) — só trava imóveis.
    if (b.Tipo === "IMOVEL" || b.Tipo === "CASA_PASTORAL") {
      const quarentena = await patrimonio.quarentenaPatrimonialAtiva(pool, sql);
      if (quarentena) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Quarentena patrimonial ativa (Art. 58 §7º) até ${new Date(quarentena.dataFim).toISOString().slice(0, 10)} — alienação de imóvel está vedada neste período. Motivo: ${quarentena.motivo}` } };
        return;
      }
    }

    // Teto de Alçada = 5% do PL apurado no último balanço (calculado na leitura).
    const balanco = await demonstracoes.calcularBalancoPatrimonial(pool, sql, new Date());
    const tetoAlcada = patrimonio.calcularTetoAlcadaPatrimonial(balanco.patrimonioLiquido);
    const alvo = patrimonio.alvoAprovacaoAlienacao({ ehTemploSede: !!b.EhTemploSede, valorProposto: Number(valorProposto), tetoAlcada });

    const criada = await pool.request()
      .input("bemId", sql.Int, bemId).input("valorProposto", sql.Decimal(12, 2), valorProposto)
      .input("tetoAlcada", sql.Decimal(12, 2), tetoAlcada).input("alvo", sql.NVarChar(20), alvo)
      .input("propostoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO AlienacoesBens (BemId, ValorProposto, TetoAlcadaPatrimonial, AprovacaoNecessaria, PropostoPor)
              OUTPUT INSERTED.AlienacaoId VALUES (@bemId, @valorProposto, @tetoAlcada, @alvo, @propostoPor)`);
    const alienacaoId = criada.recordset[0].AlienacaoId;

    await registrarAuditoria({
      tabela: "AlienacoesBens", registroId: alienacaoId, acao: "Propôs alienação de bem", usuarioId: usuario.membroId,
      dadosDepois: { bemId, valorProposto, tetoAlcadaPatrimonial: tetoAlcada, aprovacaoNecessaria: alvo }
    });
    context.res = {
      status: 201, headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true, mensagem: `✅ Proposta de alienação registrada — aprovação necessária: ${alvo === "ASSEMBLEIA" ? "Assembleia Geral" : "CLI"} (teto de alçada: R$ ${tetoAlcada.toFixed(2)}).`, alienacaoId,
        tetoAlcadaPatrimonial: tetoAlcada, aprovacaoNecessaria: alvo, patrimonioLiquido: balanco.patrimonioLiquido
      }
    };
    return;
  }


  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/alienacoes-bens/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM AlienacoesBens WHERE AlienacaoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Alienação não encontrada." } };
      return;
    }
    const registro = atual.recordset[0];
    const { acao, ataBase64, mimeType, motivo, decisao, justificativa } = req.body || {};
    if (!ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }

    if (acao === "PARECER_VIABILIDADE") {
      // Art. 31 — só membro com assento ativo no Conselho Consultivo
      // Técnico emite o parecer; não é "qualquer um com permissão financeiro".
      if (!(await parecerViabilidade.membroNoConselhoConsultivo(pool, usuario.membroId))) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Só um membro com assento ativo no Conselho Consultivo Técnico pode emitir Parecer de Viabilidade (Art. 31)." } };
        return;
      }
      if (!["FAVORAVEL", "DESFAVORAVEL"].includes(decisao)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe decisao: FAVORAVEL ou DESFAVORAVEL." } };
        return;
      }
      const parecerId = await parecerViabilidade.registrarParecer(pool, { alienacaoId: Number(id), decisao, justificativa, emitidoPor: usuario.membroId });
      await registrarAuditoria({
        tabela: "PareceresViabilidadeAlienacao", registroId: parecerId, acao: `Emitiu Parecer de Viabilidade: ${decisao}`, usuarioId: usuario.membroId,
        dadosDepois: { alienacaoId: Number(id), decisao }
      });
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parecer de Viabilidade registrado.", parecerId } };
      return;
    }

    if (acao === "AUTORIZAR") {
      if (registro.Status !== "PROPOSTA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta proposta não está mais pendente de autorização." } };
        return;
      }
      // Art. 31 — acima do limite configurável, o ato fica bloqueado
      // enquanto não houver Parecer de Viabilidade FAVORAVEL vinculado.
      const limite = await parecerViabilidade.limiteParecerViabilidade(pool);
      if (Number(registro.ValorProposto) >= limite && !(await parecerViabilidade.possuiParecerFavoravel(pool, Number(id)))) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Valores a partir de R$ ${limite.toFixed(2)} exigem Parecer de Viabilidade FAVORAVEL do Conselho Consultivo Técnico antes da autorização (Art. 31) — ainda não há um vinculado a esta proposta.` } };
        return;
      }
      // Segregação de funções: quem propôs a alienação não a autoriza (outra pessoa da administração geral).
      if (Number(registro.PropostoPor) === Number(usuario.membroId)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Quem propôs a alienação não pode autorizá-la — peça para outra pessoa da administração geral autorizar." } };
        return;
      }
      let ataUrl = null;
      if (registro.AprovacaoNecessaria === "ASSEMBLEIA") {
        if (!ataBase64 || !mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
          context.res = { status: 400, body: { sucesso: false, mensagem: "Alienação aprovada pela Assembleia exige a ata da deliberação anexada (PDF/imagem)." } };
          return;
        }
        const buffer = decodificarArquivo(ataBase64);
        if (!buffer) {
          context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo da ata vazio ou maior que 15 MB." } };
          return;
        }
        try { ataUrl = await storage.salvarDocumento(buffer, mimeType); } catch (erro) {
          context.log.error("Falha ao salvar a ata da alienação:", erro.message);
          context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao salvar a ata. Tente de novo ou avise a equipe técnica." } };
          return;
        }
      }
      const novoStatus = registro.AprovacaoNecessaria === "ASSEMBLEIA" ? "AUTORIZADA_ASSEMBLEIA" : "AUTORIZADA_CLI";
      // O estado entra no WHERE: duas autorizações simultâneas não gravam as duas.
      const autorizou = await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), novoStatus)
        .input("aprovadoPor", sql.Int, usuario.membroId).input("ataUrl", sql.NVarChar(500), ataUrl)
        .query(`UPDATE AlienacoesBens SET Status = @status, AprovadoPor = @aprovadoPor, AprovadoEm = SYSUTCDATETIME(), AtaUrl = ISNULL(@ataUrl, AtaUrl) WHERE AlienacaoId = @id AND Status = 'PROPOSTA'`);
      if (autorizou.rowsAffected && autorizou.rowsAffected[0] === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta proposta não está mais pendente de autorização." } };
        return;
      }
      await registrarAuditoria({
        tabela: "AlienacoesBens", registroId: Number(id), acao: "Autorizou alienação de bem", usuarioId: usuario.membroId,
        dadosDepois: { status: novoStatus, aprovacaoNecessaria: registro.AprovacaoNecessaria }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Alienação autorizada (${registro.AprovacaoNecessaria === "ASSEMBLEIA" ? "Assembleia Geral" : "CLI"}).` } };
      return;
    }

    if (acao === "REJEITAR") {
      if (typeof motivo !== "string" || !motivo.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da rejeição." } };
        return;
      }
      // Só rejeita o que ainda está em aberto (proposta ou autorizada e não concluída): uma alienação CONCLUÍDA já vendeu o bem e uma REJEITADA já está encerrada.
      if (!["PROPOSTA", "AUTORIZADA_CLI", "AUTORIZADA_ASSEMBLEIA"].includes(registro.Status)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta alienação já foi concluída ou rejeitada — não pode mais ser rejeitada." } };
        return;
      }
      const rejeitou = await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim())
        .query(`UPDATE AlienacoesBens SET Status = 'REJEITADA', Motivo = @motivo WHERE AlienacaoId = @id AND Status IN ('PROPOSTA', 'AUTORIZADA_CLI', 'AUTORIZADA_ASSEMBLEIA')`);
      if (rejeitou.rowsAffected && rejeitou.rowsAffected[0] === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta alienação já foi concluída ou rejeitada — não pode mais ser rejeitada." } };
        return;
      }
      await registrarAuditoria({
        tabela: "AlienacoesBens", registroId: Number(id), acao: "Rejeitou alienação de bem", usuarioId: usuario.membroId, dadosDepois: { motivo }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "Alienação rejeitada." } };
      return;
    }

    if (acao === "CONCLUIR") {
      if (registro.Status !== "AUTORIZADA_CLI" && registro.Status !== "AUTORIZADA_ASSEMBLEIA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível concluir uma alienação já autorizada." } };
        return;
      }
      const concluiu = await pool.request().input("id", sql.Int, id)
        .query(`UPDATE AlienacoesBens SET Status = 'CONCLUIDA' WHERE AlienacaoId = @id AND Status IN ('AUTORIZADA_CLI', 'AUTORIZADA_ASSEMBLEIA')`);
      if (concluiu.rowsAffected && concluiu.rowsAffected[0] === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível concluir uma alienação já autorizada." } };
        return;
      }
      await pool.request().input("bemId", sql.Int, registro.BemId).query(`UPDATE BensPatrimoniais SET Status = 'ALIENADO' WHERE BemId = @bemId`);
      await registrarAuditoria({
        tabela: "AlienacoesBens", registroId: Number(id), acao: "Concluiu alienação de bem", usuarioId: usuario.membroId,
        dadosDepois: { bemId: registro.BemId }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Alienação concluída — bem marcado como alienado." } };
      return;
    }
  }
};

