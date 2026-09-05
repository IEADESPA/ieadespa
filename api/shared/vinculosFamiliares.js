// shared/vinculosFamiliares.js (v1.11)
// Validação/criação de vínculo familiar, extraída de GestaoVinculosFamiliares
// pra ser reaproveitada também pelo autoatendimento (MeusVinculosFamiliares) —
// mesma regra pros dois: não pode vínculo consigo mesmo, as duas matrículas
// precisam existir, tipo de vínculo precisa estar ativo, sem duplicata.
const { registrarAuditoria } = require("./auditoria");

async function listarVinculosDeMembro(pool, sql, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT v.VinculoId AS vinculoId,
           CASE WHEN v.MembroId = @membroId THEN v.MembroParenteId ELSE v.MembroId END AS outraPessoaId,
           m2.Nome AS outraPessoaNome,
           t.Codigo AS tipoCodigo,
           CASE WHEN v.MembroId = @membroId THEN t.RotuloDireto ELSE COALESCE(t.RotuloInverso, t.RotuloDireto) END AS rotulo,
           CASE WHEN v.MembroId = @membroId THEN v.ResponsavelLegal ELSE 0 END AS outraPessoaEhResponsavel
    FROM VinculosFamiliares v
    JOIN TiposVinculoFamiliar t ON t.TipoVinculoId = v.TipoVinculoId
    JOIN MembroReferencia m2 ON m2.MembroId = CASE WHEN v.MembroId = @membroId THEN v.MembroParenteId ELSE v.MembroId END
    WHERE v.MembroId = @membroId OR v.MembroParenteId = @membroId
    ORDER BY m2.Nome`);
  return result.recordset;
}

async function listarTodosVinculos(pool, sql) {
  const result = await pool.request().query(`
    SELECT v.VinculoId AS vinculoId, v.MembroId AS membroId, m1.Nome AS nome,
           v.MembroParenteId AS membroParenteId, m2.Nome AS parenteNome,
           t.Codigo AS tipoCodigo, t.RotuloDireto AS rotulo, v.ResponsavelLegal AS responsavelLegal
    FROM VinculosFamiliares v
    JOIN TiposVinculoFamiliar t ON t.TipoVinculoId = v.TipoVinculoId
    JOIN MembroReferencia m1 ON m1.MembroId = v.MembroId
    JOIN MembroReferencia m2 ON m2.MembroId = v.MembroParenteId
    ORDER BY m1.Nome`);
  return result.recordset;
}

// Retorna { sucesso: false, mensagem } em caso de erro, ou { sucesso: true, mensagem, vinculoId }.
async function criarVinculo(pool, sql, { membroId, membroParenteId, tipoVinculoId, responsavelLegal, criadoPor }) {
  if (!membroId || !membroParenteId || !tipoVinculoId) {
    return { sucesso: false, mensagem: "Campos obrigatórios: membroId, membroParenteId, tipoVinculoId." };
  }
  if (Number(membroId) === Number(membroParenteId)) {
    return { sucesso: false, mensagem: "Uma pessoa não pode ter vínculo familiar consigo mesma." };
  }
  const membrosExistem = await pool.request().input("a", sql.Int, membroId).input("b", sql.Int, membroParenteId)
    .query(`SELECT MembroId FROM MembroReferencia WHERE MembroId IN (@a, @b)`);
  if (membrosExistem.recordset.length < 2) {
    return { sucesso: false, mensagem: "Cadastre as duas pessoas antes de vincular." };
  }
  const tipo = await pool.request().input("id", sql.Int, tipoVinculoId).query(`SELECT TipoVinculoId FROM TiposVinculoFamiliar WHERE TipoVinculoId = @id AND Ativo = 1`);
  if (tipo.recordset.length === 0) {
    return { sucesso: false, mensagem: "Tipo de vínculo inválido." };
  }
  const duplicado = await pool.request().input("a", sql.Int, membroId).input("b", sql.Int, membroParenteId)
    .query(`SELECT 1 FROM VinculosFamiliares WHERE (MembroId = @a AND MembroParenteId = @b) OR (MembroId = @b AND MembroParenteId = @a)`);
  if (duplicado.recordset.length > 0) {
    return { sucesso: false, mensagem: "Já existe um vínculo familiar cadastrado entre essas duas pessoas." };
  }

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("membroParenteId", sql.Int, membroParenteId)
    .input("tipoVinculoId", sql.Int, tipoVinculoId)
    .input("responsavelLegal", sql.Bit, responsavelLegal === true)
    .input("criadoPor", sql.Int, criadoPor)
    .query(`
      INSERT INTO VinculosFamiliares (MembroId, MembroParenteId, TipoVinculoId, ResponsavelLegal, CriadoPor)
      OUTPUT INSERTED.VinculoId
      VALUES (@membroId, @membroParenteId, @tipoVinculoId, @responsavelLegal, @criadoPor)`);
  const vinculoId = result.recordset[0].VinculoId;

  await registrarAuditoria({
    tabela: "VinculosFamiliares",
    registroId: vinculoId,
    acao: "Criou vínculo familiar",
    usuarioId: criadoPor,
    dadosDepois: { membroId, membroParenteId, tipoVinculoId, responsavelLegal: responsavelLegal === true }
  });

  return { sucesso: true, mensagem: "✅ Vínculo familiar cadastrado.", vinculoId };
}

async function removerVinculo(pool, sql, vinculoId, usuarioId) {
  const antes = await pool.request().input("id", sql.Int, vinculoId).query(`SELECT MembroId, MembroParenteId, TipoVinculoId FROM VinculosFamiliares WHERE VinculoId = @id`);
  if (antes.recordset.length === 0) {
    return { sucesso: false, mensagem: "Vínculo não encontrado." };
  }
  await pool.request().input("id", sql.Int, vinculoId).query(`DELETE FROM VinculosFamiliares WHERE VinculoId = @id`);
  await registrarAuditoria({ tabela: "VinculosFamiliares", registroId: Number(vinculoId), acao: "Removeu vínculo familiar", usuarioId, dadosAntes: antes.recordset[0] });
  return { sucesso: true, mensagem: "✅ Vínculo removido.", registroAntes: antes.recordset[0] };
}

module.exports = { listarVinculosDeMembro, listarTodosVinculos, criarVinculo, removerVinculo };
