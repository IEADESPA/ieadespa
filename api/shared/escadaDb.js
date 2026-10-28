// shared/escadaDb.js (v8.2 — Escada ministerial e ascensão)
// O banco da escada. A regra pura está em shared/escada.js; o desenho, em docs/plano/fase-8-ministerial-afm.md.
//
// - HISTÓRICO DE CARGOS (CargosMinisteriaisHistorico): uma linha aberta (Ate em branco) por pessoa — o cargo atual e desde quando. É daqui que sai o interstício. A linha só
//   vale se for do MESMO cargo que está no cadastro: cargo trocado por fora (versão antiga, script) aparece como "data de entrada no cargo não informada" e trava a escada
//   até a Secretaria informar — nunca é presumido. Toda troca passa por trocarCargo (consagração concluída ou cadastro no nível geral), sob a trava "escada_<pessoa>".
// - CHM e candidato (Matriculas_AFM): a AFM concede/revoga o Certificado de Habilitação Ministerial da matrícula atual e matricula quem ainda não é oficial (origem CANDIDATO).
// - VETO TÉCNICO (Consagracoes.VetoAFM*): só sobre processo por INDICAÇÃO em andamento; encerra o processo (REPROVADO, com o motivo). O CHECK do banco garante o resto.
const { sql } = require("./db");
const escada = require("./escada");
const estatuto = require("./estatuto");
const afm = require("./afm");
const { CONDICAO_SQL_ATIVO } = require("./disciplina");
const { obterTrava } = require("./financeiroSeguro");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");

const NAO_EXISTE = { sucesso: false, naoExiste: true };
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });
const dia = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const ORIGEM_DA_MODALIDADE = { INDICACAO: "CONSAGRACAO", NOMEACAO_PRESIDENCIAL: "NOMEACAO_PRESIDENCIAL", OUTRA_CONVENCAO: "OUTRA_CONVENCAO" };
const OFICIAIS = new Set(afm.CARGOS_OFICIAIS);

async function fecharTransacao(transaction, ok) {
  try { if (ok) await transaction.commit(); else await transaction.rollback(); } catch (e) { /* a transação já pode ter sido encerrada pelo servidor */ }
}
// `fazer(transaction)` dentro de uma transação com a trava da pessoa. Sem a trava (espera esgotada) devolve "mudou".
async function comTravaDaPessoa(pool, membroId, fazer) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    if (!(await obterTrava(() => new sql.Request(transaction), `escada_${Number(membroId)}`))) {
      await fecharTransacao(transaction, false);
      return MUDOU("Outra alteração desta pessoa está em andamento. Tente de novo.");
    }
    const r = await fazer(transaction);
    await fecharTransacao(transaction, !(r && r.sucesso === false));
    return r;
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
}

// O cargo de destino de um tipo de consagração (null: o tipo não mexe no cargo — Integração, Reintegração, texto livre).
async function cargoDoTipo(pool, assunto) {
  if (typeof assunto !== "string" || !assunto.trim()) return null;
  const r = await pool.request().input("nome", sql.NVarChar(100), assunto).query(`SELECT TOP 1 CargoMinisterialResultante AS cargo FROM TiposConsagracao WHERE Nome = @nome`);
  const cargo = r.recordset[0] && r.recordset[0].cargo;
  return cargo && escada.ESCADA.includes(cargo) && cargo !== "MEMBRO" ? cargo : null;
}

// Tudo o que a escada confere sobre a pessoa, numa ida ao banco. null: a pessoa não existe.
async function dadosDaPessoa(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, Number(membroId)).query(`
    SELECT m.MembroId, m.Status, m.SituacaoMembro, CONVERT(varchar(10), m.DataNascimento, 120) AS DataNascimento, CONVERT(varchar(10), m.DataAdmissao, 120) AS DataAdmissao,
           m.DizimistaFiel, m.Sexo, m.EstadoCivil, m.CargoMinisterial,
           h.Cargo AS HistCargo, CONVERT(varchar(10), h.Desde, 120) AS HistDesde, h.Origem AS HistOrigem,
           CASE WHEN EXISTS (SELECT 1 FROM MarcosMembro mm WHERE mm.MembroId = m.MembroId AND mm.Tipo = N'BATISMO_ESPIRITO_SANTO') THEN 1 ELSE 0 END AS BatismoEspirito,
           CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = ProcessosDisciplinares.PenalidadeId
                             WHERE ProcessosDisciplinares.MembroId = m.MembroId AND ${CONDICAO_SQL_ATIVO}) THEN 1 ELSE 0 END AS SobDisciplina,
           CASE WHEN EXISTS (SELECT 1 FROM CartasTransito ct WHERE ct.MembroId = m.MembroId AND ct.Tipo = N'MUDANCA' AND ct.Status = N'EMITIDA') THEN 1 ELSE 0 END AS CartaMudanca,
           a.StatusMatricula, a.NivelEscolaridade, a.NivelConcluido, a.CertificadoHabilitacao, CONVERT(varchar(10), a.CHMEm, 120) AS CHMEm, a.Origem AS MatriculaOrigem
    FROM MembroReferencia m
    LEFT JOIN CargosMinisteriaisHistorico h ON h.MembroId = m.MembroId AND h.Ate IS NULL
    OUTER APPLY (SELECT TOP 1 * FROM Matriculas_AFM a WHERE a.MembroId = m.MembroId ORDER BY a.MatriculaId DESC) a
    WHERE m.MembroId = @id`);
  const l = r.recordset[0];
  if (!l) return null;
  const cargoAtual = l.CargoMinisterial || "MEMBRO";
  const linhaVale = l.HistCargo && l.HistCargo === l.CargoMinisterial;
  return {
    membroId: Number(l.MembroId),
    cargoAtual,
    cargoDesde: linhaVale ? l.HistDesde : null,
    cargoOrigem: linhaVale ? l.HistOrigem : null,
    status: l.Status,
    emComunhao: estatuto.calcularCapacidadeEleitoral({ situacaoMembro: l.SituacaoMembro, status: l.Status, dataNascimento: l.DataNascimento, dataAdmissao: l.DataAdmissao }).emComunhao,
    sobDisciplina: !!l.SobDisciplina,
    cartaMudanca: !!l.CartaMudanca,
    dataNascimento: l.DataNascimento,
    dataAdmissao: l.DataAdmissao,
    dizimistaFiel: l.DizimistaFiel === null || l.DizimistaFiel === undefined ? null : !!l.DizimistaFiel,
    sexo: l.Sexo ? String(l.Sexo).trim() : null,
    estadoCivil: l.EstadoCivil,
    batismoEspirito: !!l.BatismoEspirito,
    // Oficial ainda sem linha de matrícula conta como ATIVO (a matrícula é obrigatória e nasce sozinha — afmDb.garantirMatriculas); membro sem linha não tem matrícula.
    afm: l.StatusMatricula
      ? { statusMatricula: l.StatusMatricula, nivel: l.NivelEscolaridade, concluido: !!l.NivelConcluido, chm: !!l.CertificadoHabilitacao, chmEm: l.CHMEm, origem: l.MatriculaOrigem }
      : (OFICIAIS.has(cargoAtual) && l.Status === "ATIVO" ? { statusMatricula: "ATIVA", nivel: null, concluido: false, chm: false, chmEm: null, origem: null } : null)
  };
}

// A conferência completa para uma pessoa e um tipo de consagração. { alvo:null } quando o tipo não leva a um cargo da escada.
async function avaliar(pool, { membroId, assunto, modalidade = "INDICACAO", alvo: alvoDado = null }) {
  const alvo = alvoDado || (await cargoDoTipo(pool, assunto));
  if (!alvo) return { alvo: null, avaliacao: null };
  const dados = await dadosDaPessoa(pool, membroId);
  if (!dados) return { alvo, avaliacao: null, naoExiste: true };
  return { alvo, dados, avaliacao: escada.avaliarAscensao(dados, alvo, { modalidade, hojeIso: hojeBrasilia() }) };
}

// Troca o cargo da pessoa e o histórico juntos, dentro da transação `t` (quem chama já tem a trava). Fecha a linha aberta e abre a nova (cargo de oficial) com `desde`.
async function trocarCargoNaTransacao(t, { membroId, cargoNovo, desde, origem, consagracaoId = null, observacao = null, por = null, funcao }) {
  const hoje = hojeBrasilia();
  const novo = cargoNovo && cargoNovo !== "MEMBRO" ? cargoNovo : null;
  await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("c", sql.NVarChar(30), cargoNovo || null).input("f", sql.NVarChar(100), funcao === undefined ? null : funcao)
    .input("mudaFuncao", sql.Bit, funcao === undefined ? 0 : 1)
    .query(`UPDATE MembroReferencia SET CargoMinisterial = @c, Funcao = CASE WHEN @mudaFuncao = 1 THEN @f ELSE Funcao END WHERE MembroId = @m`);
  // Fecha a linha aberta (a data de saída nunca fica antes da de entrada).
  await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("ate", sql.Date, desde || hoje)
    .query(`UPDATE CargosMinisteriaisHistorico SET Ate = CASE WHEN Desde IS NOT NULL AND Desde > @ate THEN Desde ELSE @ate END WHERE MembroId = @m AND Ate IS NULL`);
  if (novo) {
    await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("c", sql.NVarChar(30), novo).input("d", sql.Date, desde || null).input("o", sql.NVarChar(24), origem)
      .input("cid", sql.UniqueIdentifier, consagracaoId).input("obs", sql.NVarChar(300), observacao).input("por", sql.Int, por)
      .query(`INSERT INTO CargosMinisteriaisHistorico (MembroId, Cargo, Desde, Origem, ConsagracaoId, Observacao, CriadoPor) VALUES (@m, @c, @d, @o, @cid, @obs, @por)`);
  }
}

// Cadastro (só o nível geral chega aqui): o cargo mudou e/ou a Secretaria informou "no cargo desde". Sem mudança de cargo, só acerta a data da linha aberta (ou abre a linha
// que faltava). Devolve { mudou:bool }.
async function sincronizarCadastro(pool, { membroId, cargoAnterior, cargoNovo, desde, por }) {
  const anterior = cargoAnterior || null;
  const novo = cargoNovo || null;
  if (anterior === novo && !desde) return { sucesso: true, mudou: false };
  return comTravaDaPessoa(pool, membroId, async (t) => {
    if (anterior !== novo) {
      await trocarCargoNaTransacao(t, { membroId, cargoNovo: novo, desde: desde || null, origem: "CADASTRO", observacao: "Cargo alterado no cadastro pela Secretaria.", por });
    } else if (novo && novo !== "MEMBRO") {
      const upd = await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("c", sql.NVarChar(30), novo).input("d", sql.Date, desde)
        .query(`UPDATE CargosMinisteriaisHistorico SET Desde = @d WHERE MembroId = @m AND Ate IS NULL AND Cargo = @c`);
      if (!upd.rowsAffected[0]) {
        // A linha aberta é de outro cargo (troca antiga por fora) ou não existe: fecha a velha e abre a certa.
        await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("ate", sql.Date, desde)
          .query(`UPDATE CargosMinisteriaisHistorico SET Ate = CASE WHEN Desde IS NOT NULL AND Desde > @ate THEN Desde ELSE @ate END WHERE MembroId = @m AND Ate IS NULL`);
        await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("c", sql.NVarChar(30), novo).input("d", sql.Date, desde).input("por", sql.Int, por)
          .query(`INSERT INTO CargosMinisteriaisHistorico (MembroId, Cargo, Desde, Origem, Observacao, CriadoPor) VALUES (@m, @c, @d, N'CADASTRO', N'Data de entrada no cargo informada pela Secretaria.', @por)`);
      }
    }
    return { sucesso: true, mudou: true };
  });
}

// Histórico de cargos de uma pessoa (cadastro e Meus Dados).
async function historicoDe(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, Number(membroId)).query(`
    SELECT h.Cargo, CONVERT(varchar(10), h.Desde, 120) AS Desde, CONVERT(varchar(10), h.Ate, 120) AS Ate, h.Origem
    FROM CargosMinisteriaisHistorico h WHERE h.MembroId = @m ORDER BY CASE WHEN h.Ate IS NULL THEN 1 ELSE 0 END, h.Ate, h.HistoricoId`);
  return r.recordset.map((l) => ({ cargo: l.Cargo, cargoRotulo: escada.ROTULO_CARGO[l.Cargo] || l.Cargo, desde: l.Desde, ate: l.Ate, origem: l.Origem }));
}

// ============================== AFM: CHM, candidato e veto ==============================

// Concede (com a data) ou revoga o CHM da matrícula atual. Matrícula inativa não recebe CHM (a credencial está suspensa — Art. 69 §3º).
async function definirCHM(pool, { membroId, conceder, data, por }) {
  const r = await pool.request().input("m", sql.Int, Number(membroId))
    .query(`SELECT TOP 1 MatriculaId, StatusMatricula, CertificadoHabilitacao, CONVERT(varchar(10), CHMEm, 120) AS CHMEm FROM Matriculas_AFM WHERE MembroId = @m ORDER BY MatriculaId DESC`);
  const mat = r.recordset[0];
  if (!mat) return { sucesso: false, mensagem: "Esta pessoa não tem matrícula na AFM." };
  if (conceder && mat.StatusMatricula === "INATIVA") return { sucesso: false, mensagem: "A matrícula está inativa: o CHM só depois da nova matrícula com a reciclagem (Regimento, Art. 69 §3º)." };
  if (!conceder && !mat.CertificadoHabilitacao) return { sucesso: false, mensagem: "Esta pessoa não tem CHM para revogar." };
  const upd = await pool.request().input("id", sql.Int, mat.MatriculaId).input("c", sql.Bit, conceder ? 1 : 0).input("d", sql.Date, conceder ? data : null).input("por", sql.Int, conceder ? por : null)
    .query(`UPDATE a SET CertificadoHabilitacao = @c, CHMEm = @d, CHMPor = @por FROM Matriculas_AFM a
            WHERE a.MatriculaId = @id AND NOT EXISTS (SELECT 1 FROM Matriculas_AFM a2 WHERE a2.MembroId = a.MembroId AND a2.MatriculaId > a.MatriculaId)`);
  if (!upd.rowsAffected[0]) return MUDOU("A matrícula mudou enquanto isso. Atualize a tela.");
  await registrarAuditoria({ tabela: "Matriculas_AFM", registroId: mat.MatriculaId, acao: conceder ? "AFM_CHM_CONCEDIDO" : "AFM_CHM_REVOGADO", usuarioId: por,
    dadosAntes: { chm: !!mat.CertificadoHabilitacao, chmEm: mat.CHMEm }, dadosDepois: { chm: !!conceder, chmEm: conceder ? data : null } });
  return { sucesso: true, mensagem: conceder ? "CHM concedido (Regimento, Art. 67)." : "CHM revogado." };
}

// Matricula na AFM quem ainda não é oficial (o candidato a Auxiliar cursa o Básico — Art. 72, I, b). Uma matrícula por vez: quem já tem não ganha outra aqui.
async function matricularCandidato(pool, { membroId, nivel, data, por }) {
  if (!Object.prototype.hasOwnProperty.call(afm.NIVEIS, nivel)) return { sucesso: false, mensagem: "Nível inválido: Básico, Médio, Avançado ou Bacharel Livre." };
  const r = await comTravaDaPessoa(pool, membroId, async (t) => {
    const p = (await new sql.Request(t).input("m", sql.Int, Number(membroId)).query(`SELECT Status, SituacaoMembro, CargoMinisterial FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
    if (!p) return NAO_EXISTE;
    if (p.Status !== "ATIVO") return { sucesso: false, mensagem: "Só membro ativo é matriculado como candidato." };
    if (OFICIAIS.has(p.CargoMinisterial)) return { sucesso: false, mensagem: "Esta pessoa já é oficial: a matrícula dela é automática." };
    const ja = await new sql.Request(t).input("m", sql.Int, Number(membroId)).query(`SELECT TOP 1 1 AS x FROM Matriculas_AFM WHERE MembroId = @m`);
    if (ja.recordset.length) return { sucesso: false, mensagem: "Esta pessoa já tem matrícula na AFM." };
    const ins = await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("n", sql.NVarChar(30), nivel).input("d", sql.Date, data).input("por", sql.Int, por)
      .query(`INSERT INTO Matriculas_AFM (MembroId, NivelAtual, StatusMatricula, Origem, DataMatricula, NivelEscolaridade, NivelConcluido, CriadoPor)
              OUTPUT INSERTED.MatriculaId VALUES (@m, N'MEMBRO', N'ATIVA', N'CANDIDATO', @d, @n, 0, @por)`);
    return { sucesso: true, matriculaId: ins.recordset[0].MatriculaId };
  });
  if (r.sucesso) {
    await registrarAuditoria({ tabela: "Matriculas_AFM", registroId: r.matriculaId, acao: "AFM_MATRICULA_CANDIDATO", usuarioId: por, dadosDepois: { membroId: Number(membroId), nivel, data } });
    r.mensagem = `Candidato matriculado na AFM (${afm.NIVEIS[nivel].rotulo}, cursando).`;
  }
  return r;
}

// Processos por INDICAÇÃO em andamento com cargo de destino: os que a AFM pode vetar (Art. 66 §3º).
async function processosVetaveis(pool) {
  const r = await pool.request().query(`
    SELECT c.ConsagracaoId, c.MembroId, m.Nome, cg.Nome AS Congregacao, c.Assunto, ISNULL(c.CargoAlvo, t.CargoMinisterialResultante) AS CargoAlvo, c.Status,
           CONVERT(varchar(10), c.DataProtocolo, 120) AS DataProtocolo
    FROM Consagracoes c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
    LEFT JOIN TiposConsagracao t ON t.Nome = c.Assunto
    WHERE c.Modalidade = N'INDICACAO' AND c.Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO')
      AND ISNULL(c.CargoAlvo, t.CargoMinisterialResultante) IS NOT NULL
    ORDER BY c.DataProtocolo, m.Nome`);
  return r.recordset.map((l) => ({
    consagracaoId: l.ConsagracaoId, membroId: l.MembroId, nome: l.Nome, congregacao: l.Congregacao, assunto: l.Assunto,
    cargoAlvo: l.CargoAlvo, cargoAlvoRotulo: escada.ROTULO_CARGO[l.CargoAlvo] || l.CargoAlvo, status: l.Status, dataProtocolo: l.DataProtocolo
  }));
}

// O veto técnico encerra a indicação (Art. 67 §2º). A nomeação direta do Presidente não é vetável (Art. 66 §4º) — o UPDATE só acha INDICAÇÃO em andamento.
async function vetar(pool, { consagracaoId, motivo, por }) {
  const atual = (await pool.request().input("id", sql.UniqueIdentifier, consagracaoId)
    .query(`SELECT MembroId, Modalidade, Status FROM Consagracoes WHERE ConsagracaoId = @id`)).recordset[0];
  if (!atual) return NAO_EXISTE;
  if (atual.Modalidade !== "INDICACAO") return { sucesso: false, mensagem: "A nomeação direta do Pastor Presidente e a recepção de ministro de outra convenção não estão sujeitas ao veto técnico (Regimento, Art. 66 §4º)." };
  if (Number(atual.MembroId) === Number(por)) return { sucesso: false, mensagem: "Ninguém veta o próprio processo." };
  const upd = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId).input("motivo", sql.NVarChar(500), motivo).input("por", sql.Int, por)
    .query(`UPDATE Consagracoes SET Status = N'REPROVADO', DataConclusao = CAST(SYSUTCDATETIME() AS DATE), VetoAFMEm = SYSUTCDATETIME(), VetoAFMPor = @por, VetoAFMMotivo = @motivo
            WHERE ConsagracaoId = @id AND Modalidade = N'INDICACAO' AND Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO')`);
  if (!upd.rowsAffected[0]) return MUDOU("Este processo já foi concluído, reprovado ou vetado. Atualize a lista.");
  await registrarAuditoria({ tabela: "Consagracoes", registroId: Number(atual.MembroId), acao: "AFM_VETO_TECNICO", usuarioId: por, dadosDepois: { consagracaoId, motivo } });
  return { sucesso: true, mensagem: "Veto técnico registrado: a indicação foi encerrada (Regimento, Art. 67 §2º)." };
}

// Origem do cargo atual (para o "nivelamento obrigatório" da Academia). Map membroId -> origem, só das linhas abertas que valem (mesmo cargo do cadastro).
async function origensDoCargoAtual(pool) {
  const r = await pool.request().query(`
    SELECT h.MembroId, h.Origem FROM CargosMinisteriaisHistorico h JOIN MembroReferencia m ON m.MembroId = h.MembroId AND m.CargoMinisterial = h.Cargo WHERE h.Ate IS NULL`);
  const mapa = new Map();
  for (const l of r.recordset) mapa.set(Number(l.MembroId), l.Origem);
  return mapa;
}

module.exports = {
  ORIGEM_DA_MODALIDADE, comTravaDaPessoa, cargoDoTipo, dadosDaPessoa, avaliar, trocarCargoNaTransacao, sincronizarCadastro, historicoDe,
  definirCHM, matricularCandidato, processosVetaveis, vetar, origensDoCargoAtual, dia
};
