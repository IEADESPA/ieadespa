// GestaoConsentimentoLGPD (público — "Meu Painel", auto-atendimento por matrícula,
// mesmo modelo de acesso de MinhaFrequencia/SolicitarJustificativa)
// GET  /api/lgpd/consentimento/{matricula}  -> estado atual (mais recente) por Tipo
// POST /api/lgpd/consentimento/{matricula}  -> body: { tipo?, concedido, observacao? }
//      Grava um novo evento (trilha append-only: nunca sobrescreve o anterior).
// vB.8 — Correção de base legal: a v1.9 tinha generalizado o Tipo padrão
// (DADOS_CONTATO) pra também travar "ver os próprios dados" — base legal
// ERRADA (direito de acesso, Art. 18, nunca depende de consentimento; dado
// básico de membresia é Art. 11, II, "a", que DISPENSA consentimento).
// Revertido: DADOS_CONTATO volta a significar só "posso usar seu telefone/
// e-mail (e foto) pra contato" — MeusDadosLGPD não checa mais nada daqui.
// v7.7 — revogar o consentimento FOTO (de qualquer membro, pelo titular ou pela
// Secretaria) EXCLUI o arquivo (shared/storage.js::excluirFoto) e zera
// MembroReferencia.FotoUrl: antes a revogação só gravava a linha e o blob ficava
// guardado, o que contradizia o ROPA e o RIPD ("revogação exclui o arquivo").
// Menor de 18 anos: o consentimento que vale é o do RESPONSÁVEL (rota
// consentimento-menor); esta rota continua servindo ao titular adulto.
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");
const { exigirTitularOuPermissao } = require("../shared/titular");
const storage = require("../shared/storage");
const vol = require("../shared/voluntariado");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const TIPO_PADRAO = "DADOS_CONTATO";
const TIPOS_CONSENTIMENTO = ["DADOS_CONTATO", "FOTO"];

module.exports = async function (context, req) {
  // fecho da v7.5 — exige sessão. Quem lê e registra o consentimento é o titular; a Secretaria também o faz na ficha da pessoa (aba Foto), e só com a
  // permissão "pessoas" e a congregação da pessoa no seu escopo. Antes qualquer um concedia ou revogava o consentimento de qualquer matrícula.
  const pool = await getPool();
  const acesso = await exigirTitularOuPermissao(req, context, pool, context.bindingData.matricula, "pessoas");
  if (!acesso) return;
  const { usuario, alvo } = acesso;
  const matricula = alvo;

  const membro = await pool.request().input("mat", sql.Int, matricula).query(`SELECT MembroId, FotoUrl, DataNascimento FROM MembroReferencia WHERE MembroId = @mat`);
  if (membro.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  if (req.method === "GET") {
    const result = await pool.request().input("mat", sql.Int, matricula).query(`
      SELECT c.Tipo AS tipo, c.Concedido AS concedido, c.BaseLegal AS baseLegal, c.Observacao AS observacao,
             CONVERT(varchar(33), c.DataRegistro, 126) AS dataRegistro
      FROM ConsentimentosLGPD c
      WHERE c.MembroId = @mat AND c.ConsentimentoId IN (
        SELECT MAX(ConsentimentoId) FROM ConsentimentosLGPD WHERE MembroId = @mat GROUP BY Tipo
      )
      ORDER BY c.DataRegistro DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, consentimentos: result.recordset } };
    return;
  }

  if (req.method === "POST") {
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { concedido } = corpo;
    if (typeof concedido !== "boolean") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe concedido (true/false)." } };
      return;
    }
    const tipoFinal = corpo.tipo || TIPO_PADRAO;
    if (!TIPOS_CONSENTIMENTO.includes(tipoFinal)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo de consentimento inválido. Use: ${TIPOS_CONSENTIMENTO.join(", ")}.` } };
      return;
    }
    // Menor de 18 anos (idade conhecida): a foto só vale com a autorização do RESPONSÁVEL (rota consentimento-menor); registrar aqui um consentimento "da pessoa" seria sucesso sem efeito.
    if (concedido && tipoFinal === "FOTO") {
      const idade = vol.idadeEmAnos(membro.recordset[0].DataNascimento, hojeBrasilia());
      if (idade != null && idade < vol.MAIORIDADE) {
        context.res = { status: 422, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "Esta pessoa é menor de 18 anos: a foto só vale com a autorização do responsável (Ministério com Menores → autorização do responsável, ou o Meu Painel dele)." } };
        return;
      }
    }
    const observacao = typeof corpo.observacao === "string" ? corpo.observacao.trim().slice(0, 300) : null;
    // Quem registrou é SEMPRE quem está na sessão (antes vinha do corpo, e qualquer um se passava por responsável legal). Se for a Secretaria registrando na ficha
    // da pessoa, fica gravado que não foi o próprio titular.
    await pool.request()
      .input("mat", sql.Int, matricula)
      .input("tipo", sql.NVarChar(40), tipoFinal)
      .input("concedido", sql.Bit, concedido)
      .input("baseLegal", sql.NVarChar(40), "CONSENTIMENTO")
      .input("observacao", sql.NVarChar(300), acesso.proprio ? (observacao || null) : (`Registrado pela Secretaria. ${observacao || ""}`).trim())
      .input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO ConsentimentosLGPD (MembroId, Tipo, Concedido, BaseLegal, Observacao, RegistradoPor)
              VALUES (@mat, @tipo, @concedido, @baseLegal, @observacao, @registradoPor)`);

    await registrarAuditoria({
      tabela: "ConsentimentosLGPD", registroId: Number(matricula),
      acao: concedido ? "Concedeu consentimento LGPD" : "Revogou consentimento LGPD",
      usuarioId: Number(usuario.membroId), dadosDepois: { tipo: tipoFinal, concedido, registradoPelaSecretaria: !acesso.proprio }
    });

    // Revogou a FOTO: o arquivo é apagado de verdade (blob) e a referência zerada. A referência é zerada ANTES, no SQL; apagar o blob é best-effort (excluirFoto nunca lança),
    // como na exclusão LGPD. Revogar o DADOS_CONTATO (telefone/e-mail) não mexe na foto: é outro consentimento.
    let fotoApagada = false;
    if (!concedido && tipoFinal === "FOTO") {
      fotoApagada = !!(membro.recordset[0] && membro.recordset[0].FotoUrl);
      await pool.request().input("mat", sql.Int, matricula).query(`UPDATE MembroReferencia SET FotoUrl = NULL WHERE MembroId = @mat`);
      await storage.excluirFoto(matricula);
      if (fotoApagada) {
        await registrarAuditoria({
          tabela: "MembroReferencia", registroId: Number(matricula), acao: "Excluiu a foto (consentimento de foto revogado)",
          usuarioId: Number(usuario.membroId), dadosDepois: { motivo: "REVOGACAO_FOTO", registradoPelaSecretaria: !acesso.proprio }
        });
      }
    }

    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: concedido ? "✅ Consentimento registrado." : `✅ Consentimento revogado.${fotoApagada ? " O arquivo da foto foi apagado." : ""}`, fotoApagada }
    };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
