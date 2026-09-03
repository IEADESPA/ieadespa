// shared/vacancia.js
// Vacância automática ao perder a membresia (v1.5 — Regimento Art. 11): encerra
// Assentos ativos, desativa Liderança e zera Cargo Ministerial/Departamento/Função —
// mesmo UPDATE de Assentos que já existia isolado em EvoluirProcessoDisciplinar
// (exclusão disciplinar), agora generalizado e reaproveitado por qualquer fluxo de
// saída (desligamento manual, Carta de Mudança, abandono material).
async function encerrarVinculos(pool, sql, membroId, motivo) {
  await pool.request()
    .input("id", sql.Int, membroId)
    .input("motivo", sql.NVarChar(200), motivo)
    .query(`UPDATE Assentos SET DataFim = CAST(SYSUTCDATETIME() AS DATE), MotivoEncerramento = @motivo
            WHERE MembroId = @id AND DataFim IS NULL`);

  await pool.request()
    .input("id", sql.Int, membroId)
    .query(`UPDATE Lideranca SET AtivoAte = CAST(SYSUTCDATETIME() AS DATE)
            WHERE MembroId = @id AND (AtivoAte IS NULL OR AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))`);

  await pool.request()
    .input("id", sql.Int, membroId)
    .query(`UPDATE MembroReferencia SET CargoMinisterial = NULL, DepartamentoId = NULL, Funcao = NULL
            WHERE MembroId = @id`);
}

module.exports = { encerrarVinculos };
