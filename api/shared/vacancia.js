// shared/vacancia.js
// Vacância automática ao perder a membresia (v1.5 — Regimento Art. 11): encerra
// Assentos ativos, desativa Liderança e zera Cargo Ministerial/Departamento/Função —
// mesmo UPDATE de Assentos que já existia isolado em EvoluirProcessoDisciplinar
// (exclusão disciplinar), agora generalizado e reaproveitado por qualquer fluxo de
// saída (desligamento manual, Carta de Mudança, abandono material).
const MOTIVOS_QUE_MANTEM_ALUNO_EBD = new Set(["DISCIPLINA", "LICENCA_CANDIDATURA"]);

async function encerrarVinculos(pool, sql, membroId, motivo) {
  await pool.request()
    .input("id", sql.Int, membroId)
    .input("motivo", sql.NVarChar(200), motivo)
    .query(`UPDATE Assentos SET DataFim = CAST(SYSUTCDATETIME() AS DATE), MotivoEncerramento = @motivo
            WHERE MembroId = @id AND DataFim IS NULL`);

  // v7.6 — "ontem", não hoje: o login confere AtivoAte < hoje (mesmo padrão das medidas cautelares e da dissolução de diretoria em shared/psc.js). Com "hoje",
  // quem perdeu a membresia entrava de novo com a senha até a meia-noite — e as sessões derrubadas logo abaixo voltavam no login seguinte.
  await pool.request()
    .input("id", sql.Int, membroId)
    .query(`UPDATE Lideranca SET AtivoAte = DATEADD(day, -1, CAST(SYSUTCDATETIME() AS DATE))
            WHERE MembroId = @id AND (AtivoAte IS NULL OR AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))`);

  await pool.request()
    .input("id", sql.Int, membroId)
    .query(`UPDATE MembroReferencia SET CargoMinisterial = NULL, DepartamentoId = NULL, Funcao = NULL
            WHERE MembroId = @id`);

  // Trava 6-B — EBD: lecionar é função, então sai junto com as outras
  // (quem saiu continuava professor ativo, recebendo aviso de ausência e
  // lançando chamada). A matrícula de ALUNO só se encerra quando a pessoa
  // deixa a igreja: disciplina e licença de candidatura tiram o mandato, não
  // o direito de estudar na EBD. Nada é apagado (Ativo = 0, como em
  // shared/ebdTurmas.js::encerrarMatricula).
  await pool.request()
    .input("id", sql.Int, membroId)
    .query(`UPDATE EbdTurmaProfessores SET Ativo = 0, EncerradoEm = SYSUTCDATETIME() WHERE MembroId = @id AND Ativo = 1`);
  if (!MOTIVOS_QUE_MANTEM_ALUNO_EBD.has(motivo)) {
    await pool.request()
      .input("id", sql.Int, membroId)
      .query(`UPDATE EbdAlunos SET Ativo = 0, EncerradoEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME() WHERE MembroId = @id AND Ativo = 1`);
  }

  // v7.6 — sessão revogável: quem perde a membresia, o mandato (disciplina, licença de candidatura) ou sai do rol perde também as sessões abertas, na hora
  // (antes o token valia até expirar sozinho, 12 h). Usa o mesmo `pool` (dentro da transação de quem chamou, se houver).
  await require("./auth").revogarSessoesDoMembro(pool, sql, membroId);
}

module.exports = { encerrarVinculos };
