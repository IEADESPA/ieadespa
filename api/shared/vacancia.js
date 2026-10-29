// shared/vacancia.js
// Vacância automática ao perder a membresia (v1.5 — Regimento Art. 11): encerra
// Assentos ativos, desativa Liderança e zera Cargo Ministerial/Departamento/Função —
// mesmo UPDATE de Assentos que já existia isolado em EvoluirProcessoDisciplinar
// (exclusão disciplinar), agora generalizado e reaproveitado por qualquer fluxo de
// saída (desligamento manual, Carta de Mudança, abandono material).
const MOTIVOS_QUE_MANTEM_ALUNO_EBD = new Set(["DISCIPLINA", "LICENCA_CANDIDATURA"]);

// Trava 8-A — o motivo gravado no processo de cargo que a vacância encerra (CK_Consagracoes_Encerramento, migração 160).
const motivoDoProcesso = (motivo) => (motivo === "DISCIPLINA" ? "DISCIPLINA" : motivo === "LICENCA_CANDIDATURA" ? "LICENCA_CANDIDATURA" : "SAIDA_DO_ROL");

async function encerrarVinculos(pool, sql, membroId, motivo) {
  // Decisão do responsável (29/10/2026) — Regimento Art. 157 §2º: a licença de candidatura afasta das FUNÇÕES (púlpito, Ceia, dirigir culto — a licença para
  // oficiar já cai com o status) e dos cargos que poderiam servir à campanha (dirigente, tesouraria, diretoria, conselho: Assentos e Liderança), mas não tira o
  // título (o Presbítero continua Presbítero e volta a exercer depois do pleito, "a critério da Diretoria") nem trava os processos de consagração.
  const licenca = motivo === "LICENCA_CANDIDATURA";
  // Trava 8-A — PRIMEIRO os processos de cargo em andamento (protocolado até homologado): fecham como REPROVADO com o motivo, soltando a cerimônia e o código de
  // diploma reservado. Vem antes de zerar o cargo de propósito: se uma cerimônia está registrando esta pessoa agora, ela segura a linha do processo; este UPDATE
  // espera ela terminar e só então o cargo é zerado — a cerimônia nunca escreve o cargo DEPOIS da vacância (revisão independente da Trava 8-A).
  if (!licenca) await pool.request()
    .input("id", sql.Int, membroId)
    .input("motivo", sql.NVarChar(24), motivoDoProcesso(motivo))
    .input("hoje", sql.Date, require("./dataBrasilia").hojeBrasilia())
    .query(`UPDATE c SET Status = N'REPROVADO', MotivoEncerramento = @motivo, DataConclusao = @hoje, CerimoniaId = NULL, DiplomaCodigo = NULL
            FROM Consagracoes c LEFT JOIN TiposConsagracao t ON t.Nome = c.Assunto
            WHERE c.MembroId = @id AND c.Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO', N'HOMOLOGADO')
              AND ISNULL(c.CargoAlvo, t.CargoMinisterialResultante) IS NOT NULL`);
  // Trava 8-A — o CHM (Art. 67) não sobrevive à saída nem à exclusão / Disciplina Rigorosa: o certificado público é revogado e a matrícula perde a marca (quem volta,
  // volta sem o CHM antigo). A licença de candidatura é temporária (Art. 157): o CHM fica.
  if (!licenca) {
    await pool.request()
      .input("id", sql.Int, membroId)
      .input("motivoRev", sql.NVarChar(300), motivo === "DISCIPLINA" ? "Revogado pela decisão disciplinar (Regimento, Art. 95 §2º, III e IV)." : "Revogado na saída do rol de membros.")
      .query(`UPDATE ce SET RevogadoEm = SYSUTCDATETIME(), MotivoRevogacao = @motivoRev
              FROM CertificadosEmitidos ce WHERE ce.MembroId = @id AND ce.Natureza = N'CHM' AND ce.RevogadoEm IS NULL;
              UPDATE CertificadosEmitidos SET MotivoRevogacao = LEFT(MotivoRevogacao + N' Perdeu o efeito na saída ou na decisão disciplinar.', 300)
              WHERE MembroId = @id AND Natureza = N'CHM' AND MotivoRevogacao LIKE N'Usado na consagração%' AND MotivoRevogacao NOT LIKE N'%Perdeu o efeito%';
              UPDATE Matriculas_AFM SET CertificadoHabilitacao = 0, CHMEm = NULL, CHMPor = NULL, CHMCertificadoId = NULL WHERE MembroId = @id AND CertificadoHabilitacao = 1;`);
  }

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
    .query(licenca
      ? `UPDATE MembroReferencia SET DepartamentoId = NULL WHERE MembroId = @id`
      : `UPDATE MembroReferencia SET CargoMinisterial = NULL, DepartamentoId = NULL, Funcao = NULL WHERE MembroId = @id`);
  // v8.2 — o histórico de cargos fecha junto (a data de saída nunca fica antes da de entrada). Na licença de candidatura o cargo fica, e o histórico também.
  if (!licenca) await pool.request()
    .input("id", sql.Int, membroId)
    .input("hoje", sql.Date, require("./dataBrasilia").hojeBrasilia())
    .query(`UPDATE CargosMinisteriaisHistorico SET Ate = CASE WHEN Desde IS NOT NULL AND Desde > @hoje THEN Desde ELSE @hoje END
            WHERE MembroId = @id AND Ate IS NULL`);

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
