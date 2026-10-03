// GestaoNif (v4.12 — NIF + COS/COAF)
// Núcleo de Inteligência Financeira: sinalizações de risco (Avaliação de
// Riscos do COSO) e Comunicação de Operações Suspeitas ao COAF
// (Lei 9.613/1998 — obrigação legal com prazo de 24h).
// GET  /api/nif/sinalizacoes
// POST /api/nif/sinalizacoes -> { tipo, descricao, saidaId?, fornecedorId? }
// PUT  /api/nif/sinalizacoes -> { sinalizacaoId, acao: 'CONFIRMAR'|'DESCARTAR' }
// GET  /api/nif/comunicacoes
// POST /api/nif/comunicacoes -> { sinalizacaoId, protocolo?, observacao? }
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { afetadas, textoAte, textoOpcionalAte, violouChaveEstrangeira } = require("../shared/entradaFinanceira");

const TIPOS = ["VALOR_ATIPICO", "FRACIONAMENTO", "FORNECEDOR_SEM_HISTORICO"];

// Id opcional do corpo: ausente → null; presente e malformado → undefined (a rota recusa com 400).
function idOpcional(v) {
  if (v === undefined || v === null || v === "") return null;
  return auth.idDeRota(v) || undefined;
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  // INSTITUCIONAL (NIF/COS é matéria da Tesouraria Geral, sem congregação): só o nível geral — papel Global com escopo de todas as congregações.
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && recurso === "sinalizacoes") {
    const result = await pool.request().query(`
      SELECT s.SinalizacaoId AS sinalizacaoId, s.Tipo AS tipo, s.Descricao AS descricao, s.SaidaId AS saidaId,
             s.FornecedorId AS fornecedorId, f.Nome AS fornecedorNome, s.DoacaoId AS doacaoId,
             d.NumeroRecibo AS doacaoNumeroRecibo, d.DoadorNome AS doacaoDoadorNome, s.Status AS status,
             CONVERT(varchar(33), s.CriadoEm, 126) AS criadoEm
      FROM NifSinalizacoes s LEFT JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
      LEFT JOIN Doacoes d ON d.DoacaoId = s.DoacaoId
      ORDER BY s.Status, s.CriadoEm DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "sinalizacoes") {
    const { tipo, descricao, saidaId, fornecedorId, doacaoId } = req.body || {};
    const descricaoOk = textoAte(descricao, 500);
    if (!tipo || !TIPOS.includes(tipo) || !descricaoOk) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: tipo (${TIPOS.join("|")}), descricao (até 500 caracteres).` } };
      return;
    }
    const saida = idOpcional(saidaId), fornecedor = idOpcional(fornecedorId), doacao = idOpcional(doacaoId);
    if (saida === undefined || fornecedor === undefined || doacao === undefined) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "saidaId, fornecedorId e doacaoId, quando informados, precisam ser números válidos." } };
      return;
    }
    let criada;
    try {
      criada = await pool.request().input("tipo", sql.NVarChar(30), tipo).input("descricao", sql.NVarChar(500), descricaoOk)
        .input("saidaId", sql.Int, saida).input("fornecedorId", sql.Int, fornecedor).input("doacaoId", sql.Int, doacao).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO NifSinalizacoes (Tipo, Descricao, SaidaId, FornecedorId, DoacaoId, RegistradoPor) OUTPUT INSERTED.SinalizacaoId VALUES (@tipo, @descricao, @saidaId, @fornecedorId, @doacaoId, @por)`);
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "A saída, o fornecedor ou a doação informados não existem." } };
        return;
      }
      throw erro;
    }
    await registrarAuditoria({
      tabela: "NifSinalizacoes", registroId: criada.recordset[0].SinalizacaoId, acao: "Registrou sinalização NIF", usuarioId: usuario.membroId,
      dadosDepois: { tipo, descricao: descricaoOk, saidaId: saida, fornecedorId: fornecedor, doacaoId: doacao }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "⚠️ Sinalização de risco registrada (NIF).", sinalizacaoId: criada.recordset[0].SinalizacaoId } };
    return;
  }

  if (req.method === "PUT" && recurso === "sinalizacoes") {
    const { sinalizacaoId: sinalizacaoBruto, acao } = req.body || {};
    const sinalizacaoId = auth.idDeRota(sinalizacaoBruto);
    if (!sinalizacaoId || (acao !== "CONFIRMAR" && acao !== "DESCARTAR")) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sinalizacaoId e acao: 'CONFIRMAR' ou 'DESCARTAR'." } };
      return;
    }
    const novoStatus = acao === "CONFIRMAR" ? "CONFIRMADA" : "DESCARTADA";
    // Só se decide uma sinalização PENDENTE (a tela só oferece isso): uma CONFIRMADA (que pode já ter sido comunicada ao COAF) ou DESCARTADA não volta atrás. A
    // conferência vai dentro do próprio UPDATE e as linhas afetadas dizem se a decisão valeu.
    const decidida = await pool.request().input("id", sql.Int, sinalizacaoId).input("status", sql.NVarChar(20), novoStatus).input("por", sql.Int, usuario.membroId)
      .query(`UPDATE NifSinalizacoes SET Status = @status, DecididoPor = @por, DecididoEm = SYSUTCDATETIME() WHERE SinalizacaoId = @id AND Status = 'PENDENTE'`);
    if (afetadas(decidida) === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Sinalização não encontrada ou já decidida (só se decide uma sinalização pendente)." } };
      return;
    }
    await registrarAuditoria({
      tabela: "NifSinalizacoes", registroId: sinalizacaoId, acao: acao === "CONFIRMAR" ? "Confirmou sinalização NIF" : "Descartou sinalização NIF", usuarioId: usuario.membroId,
      dadosAntes: { status: "PENDENTE" }, dadosDepois: { status: novoStatus }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: acao === "CONFIRMAR" ? "✅ Sinalização confirmada — pronta pra comunicação externa." : "Sinalização descartada." } };
    return;
  }

  if (req.method === "GET" && recurso === "comunicacoes") {
    const result = await pool.request().query(`
      SELECT c.ComunicacaoId AS comunicacaoId, c.SinalizacaoId AS sinalizacaoId, c.Protocolo AS protocolo,
             c.DentroPrazo24h AS dentroPrazo24h, c.Observacao AS observacao, CONVERT(varchar(33), c.DataComunicacao, 126) AS dataComunicacao
      FROM ComunicacoesCoaf c ORDER BY c.ComunicacaoId DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "comunicacoes") {
    const { sinalizacaoId: sinalizacaoBruto, protocolo, observacao } = req.body || {};
    const sinalizacaoId = auth.idDeRota(sinalizacaoBruto);
    if (!sinalizacaoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sinalizacaoId." } };
      return;
    }
    const protocoloOk = textoOpcionalAte(protocolo, 50);
    const observacaoOk = textoOpcionalAte(observacao, 500);
    if (protocoloOk === null || observacaoOk === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "protocolo (até 50) e observacao (até 500 caracteres) são texto curto." } };
      return;
    }
    const sinal = await pool.request().input("id", sql.Int, sinalizacaoId).query(`SELECT CriadoEm, DecididoEm, Status FROM NifSinalizacoes WHERE SinalizacaoId = @id`);
    if (sinal.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Sinalização não encontrada." } };
      return;
    }
    if (sinal.recordset[0].Status !== "CONFIRMADA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Só se comunica ao COAF uma sinalização já CONFIRMADA pelo NIF." } };
      return;
    }
    // O prazo legal de 24h (Lei 9.613/1998) conta a partir do momento em que
    // o NIF CONFIRMA a suspeita (DecididoEm) — não do registro inicial
    // (CriadoEm), que pode ter ficado dias em análise como PENDENTE antes
    // da confirmação. Contar a partir do registro penalizaria uma análise
    // normal do NIF como se já estivesse fora do prazo.
    const referencia = sinal.recordset[0].DecididoEm || sinal.recordset[0].CriadoEm;
    const horas = Math.abs(Date.now() - new Date(referencia).getTime()) / 36e5;
    const dentroPrazo24h = horas <= 24;
    const criada = await pool.request().input("sinal", sql.Int, sinalizacaoId).input("protocolo", sql.NVarChar(50), protocoloOk || null)
      .input("dentroPrazo", sql.Bit, dentroPrazo24h ? 1 : 0).input("obs", sql.NVarChar(500), observacaoOk || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ComunicacoesCoaf (SinalizacaoId, Protocolo, DentroPrazo24h, Observacao, ComunicadoPor) OUTPUT INSERTED.ComunicacaoId VALUES (@sinal, @protocolo, @dentroPrazo, @obs, @por)`);
    await registrarAuditoria({
      tabela: "ComunicacoesCoaf", registroId: criada.recordset[0].ComunicacaoId, acao: "Comunicou operação suspeita ao COAF", usuarioId: usuario.membroId,
      dadosDepois: { sinalizacaoId, protocolo: protocoloOk || null, dentroPrazo24h }
    });
    context.res = {
      status: 201, headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: dentroPrazo24h ? "✅ Comunicação ao COAF registrada dentro do prazo de 24h." : "⚠️ Comunicação ao COAF registrada FORA do prazo de 24h (Lei 9.613/1998).", comunicacaoId: criada.recordset[0].ComunicacaoId }
    };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: sinalizacoes ou comunicacoes." } };
};

