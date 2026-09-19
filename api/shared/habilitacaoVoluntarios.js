// shared/habilitacaoVoluntarios.js (v5.7 — Triagem e habilitação de voluntários)
//
// Hoje o voluntariado é "assinar o termo da Lei 9.608/98 e entrar na
// escala" (v7.5). Este módulo é a esteira sequencial que faltava: ficha de
// inscrição -> referências internas -> entrevista registrada ->
// antecedentes -> treinamento -> termo assinado -> apto. Nenhuma etapa
// pode ser carimbada fora de ordem, e o status (apto/pendente/inapto/
// vencido) nunca é digitado — é sempre CALCULADO a partir das etapas e da
// validade, o mesmo espírito de "vencimento calculado na leitura" que a
// v017 (Cartas de Trânsito) já usa, não um job/timer rodando por trás.
//
// É pré-requisito direto da v7.7 (Habilitação para Ministério com
// Menores, Lei 14.811/2024): `calcularStatusHabilitacao` e
// `podeServirComMenores` abaixo são as duas peças que a v7.7 vai chamar —
// "apto" e a marcação `ContatoComMenores` da equipe (v5.6/EscalasEquipes,
// reaproveitada por ALTER na migração 099).
//
// Toda a lógica de decisão é pura (sem tocar o banco) de propósito, pra
// ser testável sem Azure SQL; as funções que tocam o banco ficam ao
// final, bem mais finas, só orquestrando o que já foi decidido aqui —
// mesmo padrão de shared/escalas.js (v5.6).
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");

// Ordem fixa e obrigatória da esteira. Antecedentes/Treinamento são
// carimbados por atestação manual até a v7.7 existir de verdade (upload de
// certidão com validade de 180 dias, trilha de formação) — mesmo padrão da
// v086 (esteira de batismo) com `DiscipuladoConcluidoManual` até a v6.9.
const ETAPAS = ["FICHA_INSCRICAO", "REFERENCIAS", "ENTREVISTA", "ANTECEDENTES", "TREINAMENTO", "TERMO"];

const CAMPO_ETAPA = {
  FICHA_INSCRICAO: "etapaFichaInscricaoEm",
  REFERENCIAS: "etapaReferenciasEm",
  ENTREVISTA: "etapaEntrevistaEm",
  ANTECEDENTES: "etapaAntecedentesEm",
  TREINAMENTO: "etapaTreinamentoEm",
  TERMO: "etapaTermoAssinadoEm"
};

const TITULO_ETAPA = {
  FICHA_INSCRICAO: "Ficha de inscrição",
  REFERENCIAS: "Referências internas",
  ENTREVISTA: "Entrevista registrada",
  ANTECEDENTES: "Antecedentes (atestação manual — verificação real na v7.7)",
  TREINAMENTO: "Treinamento (atestação manual — verificação real na v7.7)",
  TERMO: "Termo assinado (Lei 9.608/98)"
};

// Validade do "apto" — não há definição explícita no pedido; adotado 24
// meses (meio do intervalo de 2-3 anos que a própria v7.7 cita como padrão
// internacional pra treinamento de proteção). Ver nota na migração 099.
const MESES_VALIDADE_APTO = 24;

// Meses mínimos de membresia/frequência antes de servir com menores
// ("Regra dos 6 meses").
const MESES_REGRA_SEIS_MESES = 6;

const TIPOS_MOTIVO_DESLIGAMENTO = ["PERDA_CONFIANCA", "MUDANCA", "INDISPONIBILIDADE", "SAIDA_DA_IGREJA", "OUTRO"];

function paraData(valor) {
  return valor instanceof Date ? valor : new Date(valor);
}

// Sempre em UTC: datas do sistema chegam como string 'YYYY-MM-DD' (meia-noite
// UTC) ou DATETIME2 do SQL — usar setMonth() (hora LOCAL) faria a comparação
// depender do fuso do servidor, exatamente o tipo de bug que "regra dos 6
// meses" não pode ter.
function adicionarMeses(data, meses) {
  const base = paraData(data);
  return new Date(Date.UTC(
    base.getUTCFullYear(), base.getUTCMonth() + meses, base.getUTCDate(),
    base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds()
  ));
}

// Quais etapas já foram carimbadas, na ordem fixa da esteira.
function etapasConcluidas(hab) {
  return ETAPAS.filter(e => !!(hab || {})[CAMPO_ETAPA[e]]);
}

function todasEtapasConcluidas(hab) {
  return ETAPAS.every(e => !!(hab || {})[CAMPO_ETAPA[e]]);
}

// Próxima etapa pendente da esteira (null quando já completou tudo).
function proximaEtapaPendente(hab) {
  return ETAPAS.find(e => !(hab || {})[CAMPO_ETAPA[e]]) || null;
}

// Núcleo da "esteira sequencial (não dá pra pular)": só permite carimbar
// uma etapa se TODAS as anteriores já estiverem carimbadas, e não permite
// recarimbar uma etapa já concluída.
function podeConcluirEtapa(hab, etapa) {
  const idx = ETAPAS.indexOf(etapa);
  if (idx === -1) return { permitido: false, mensagem: "Etapa inválida." };
  if ((hab || {})[CAMPO_ETAPA[etapa]]) {
    return { permitido: false, mensagem: "Esta etapa já foi concluída." };
  }
  for (let i = 0; i < idx; i++) {
    if (!(hab || {})[CAMPO_ETAPA[ETAPAS[i]]]) {
      return {
        permitido: false,
        mensagem: `Não é possível pular etapa — conclua antes "${TITULO_ETAPA[ETAPAS[i]]}".`
      };
    }
  }
  return { permitido: true };
}

function calcularValidadeApto(aptoDesde) {
  return adicionarMeses(aptoDesde, MESES_VALIDADE_APTO);
}

// Status NUNCA é digitado — sempre calculado a partir das etapas e da
// validade. INAPTO é terminal (marcação explícita) e prevalece sobre
// qualquer etapa concluída; VENCIDO só se aplica a quem já foi APTO um dia
// e passou da validade.
function calcularStatusHabilitacao(hab, agora) {
  const dataRef = agora || new Date();
  if (!hab) return "PENDENTE";
  if (hab.inaptoEm) return "INAPTO";
  if (!todasEtapasConcluidas(hab)) return "PENDENTE";
  if (hab.aptoValidoAte && paraData(hab.aptoValidoAte).getTime() < paraData(dataRef).getTime()) return "VENCIDO";
  return "APTO";
}

// "Regra dos 6 meses": calculada a partir de MembroReferencia.DataAdmissao
// (já é, desde a v1.1, a data da ÚLTIMA recepção — batismo OU carta de
// mudança, zerada a cada saída/retorno) — nunca digitada à parte.
function dataElegibilidadeSeisMeses(dataAdmissao) {
  return adicionarMeses(dataAdmissao, MESES_REGRA_SEIS_MESES);
}

function atendeRegraSeisMeses(dataAdmissao, dataReferencia) {
  if (!dataAdmissao) return false;
  const ref = dataReferencia || new Date();
  return paraData(ref).getTime() >= dataElegibilidadeSeisMeses(dataAdmissao).getTime();
}

// Ponto de integração que a v7.7 vai consumir: só é exigido quando a
// equipe/papel está marcada como "contato com menores" — fora disso a
// esteira de habilitação continua valendo (apto/pendente/inapto/vencido),
// mas a regra dos 6 meses e o bloqueio automático não se aplicam.
function podeServirComMenores({ habilitacao, dataAdmissao, contatoComMenores }, agora) {
  if (!contatoComMenores) return { elegivel: true, motivo: null };
  const status = calcularStatusHabilitacao(habilitacao, agora);
  if (status !== "APTO") {
    return { elegivel: false, motivo: `Habilitação não está apta para servir com menores (status atual: ${status}).` };
  }
  if (!atendeRegraSeisMeses(dataAdmissao, agora)) {
    return { elegivel: false, motivo: "Não atende à Regra dos 6 meses de membresia/frequência (Adventist Risk Management)." };
  }
  return { elegivel: true, motivo: null };
}

// Desligamento: só validação de forma (motivo obrigatório, tipo dentro da
// lista fechada) — deliberadamente NADA aqui verifica ou aciona disciplina
// (FASE 3/CEI). "Perda de confiança" é só mais um TipoMotivo de RH.
function validarDesligamento({ motivo, tipoMotivo }) {
  if (!motivo || !motivo.trim()) {
    return { valido: false, mensagem: "Informe o motivo do desligamento." };
  }
  if (tipoMotivo && !TIPOS_MOTIVO_DESLIGAMENTO.includes(tipoMotivo)) {
    return { valido: false, mensagem: `Tipo de motivo inválido. Use um de: ${TIPOS_MOTIVO_DESLIGAMENTO.join(", ")}.` };
  }
  return { valido: true };
}

// ---------------------------------------------------------------
// Funções de banco (finas — só buscam/gravam o que a lógica acima decide).
// ---------------------------------------------------------------

function mapearHabilitacao(row) {
  if (!row) return null;
  return {
    habilitacaoId: row.HabilitacaoId,
    membroId: row.MembroId,
    congregacaoId: row.CongregacaoId,
    etapaFichaInscricaoEm: row.EtapaFichaInscricaoEm,
    etapaReferenciasEm: row.EtapaReferenciasEm,
    etapaReferenciasObservacao: row.EtapaReferenciasObservacao,
    etapaEntrevistaEm: row.EtapaEntrevistaEm,
    etapaEntrevistaEntrevistadorId: row.EtapaEntrevistaEntrevistadorId,
    etapaEntrevistaObservacao: row.EtapaEntrevistaObservacao,
    etapaAntecedentesEm: row.EtapaAntecedentesEm,
    etapaTreinamentoEm: row.EtapaTreinamentoEm,
    etapaTermoAssinadoEm: row.EtapaTermoAssinadoEm,
    aptoDesde: row.AptoDesde,
    aptoValidoAte: row.AptoValidoAte,
    inaptoMotivo: row.InaptoMotivo,
    inaptoRegistradoPorMembroId: row.InaptoRegistradoPorMembroId,
    inaptoEm: row.InaptoEm,
    criadoEm: row.CriadoEm
  };
}

async function buscarHabilitacaoPorMembro(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT * FROM VoluntariosHabilitacao WHERE MembroId = @membroId
  `);
  return mapearHabilitacao(result.recordset[0]);
}

async function buscarHabilitacaoPorId(pool, habilitacaoId) {
  const result = await pool.request().input("id", sql.Int, habilitacaoId).query(`
    SELECT * FROM VoluntariosHabilitacao WHERE HabilitacaoId = @id
  `);
  return mapearHabilitacao(result.recordset[0]);
}

// Reaproveitada entre ciclos (mesmo espírito da CandidatosBatismo, v086):
// se já existe esteira pra este membro, devolve a existente em vez de
// criar duas.
async function buscarOuCriarHabilitacao(pool, { membroId, congregacaoId, criadoPorMembroId }) {
  const existente = await buscarHabilitacaoPorMembro(pool, membroId);
  if (existente) return existente;

  await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("congregacaoId", sql.Int, congregacaoId)
    .input("criadoPor", sql.Int, criadoPorMembroId || null)
    .query(`
      INSERT INTO VoluntariosHabilitacao (MembroId, CongregacaoId, CriadoPorMembroId)
      VALUES (@membroId, @congregacaoId, @criadoPor)
    `);
  return buscarHabilitacaoPorMembro(pool, membroId);
}

async function listarHabilitacoesPorCongregacao(pool, congregacaoId) {
  const result = await pool.request().input("congregacaoId", sql.Int, congregacaoId).query(`
    SELECT h.*, m.Nome AS MembroNome
    FROM VoluntariosHabilitacao h JOIN MembroReferencia m ON m.MembroId = h.MembroId
    WHERE h.CongregacaoId = @congregacaoId
    ORDER BY m.Nome
  `);
  return result.recordset.map(row => ({ ...mapearHabilitacao(row), membroNome: row.MembroNome, statusCalculado: calcularStatusHabilitacao(mapearHabilitacao(row)) }));
}

// Carimba uma etapa (validando a sequência com podeConcluirEtapa) e, se
// for a última (TERMO), fecha a esteira: AptoDesde = agora, AptoValidoAte
// = agora + 24 meses (ver decisão na migração 099), Status = APTO.
async function concluirEtapa(pool, { habilitacaoId, etapa, registradoPorMembroId, observacao, entrevistadorId }) {
  const hab = await buscarHabilitacaoPorId(pool, habilitacaoId);
  if (!hab) return { sucesso: false, mensagem: "Habilitação não encontrada." };

  const validacao = podeConcluirEtapa(hab, etapa);
  if (!validacao.permitido) return { sucesso: false, mensagem: validacao.mensagem };

  const campo = CAMPO_ETAPA[etapa];
  const agora = new Date();

  if (etapa === "ENTREVISTA") {
    await pool.request()
      .input("id", sql.Int, habilitacaoId)
      .input("entrevistadorId", sql.Int, entrevistadorId || null)
      .input("observacao", sql.NVarChar(500), observacao || null)
      .query(`UPDATE VoluntariosHabilitacao SET ${campo} = SYSUTCDATETIME(), EtapaEntrevistaEntrevistadorId = @entrevistadorId,
              EtapaEntrevistaObservacao = @observacao, AtualizadoEm = SYSUTCDATETIME() WHERE HabilitacaoId = @id`);
  } else if (etapa === "REFERENCIAS") {
    await pool.request()
      .input("id", sql.Int, habilitacaoId)
      .input("observacao", sql.NVarChar(500), observacao || null)
      .query(`UPDATE VoluntariosHabilitacao SET ${campo} = SYSUTCDATETIME(), EtapaReferenciasObservacao = @observacao,
              AtualizadoEm = SYSUTCDATETIME() WHERE HabilitacaoId = @id`);
  } else {
    await pool.request().input("id", sql.Int, habilitacaoId)
      .query(`UPDATE VoluntariosHabilitacao SET ${campo} = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME() WHERE HabilitacaoId = @id`);
  }

  const habAtualizada = await buscarHabilitacaoPorId(pool, habilitacaoId);
  if (etapa === "TERMO" && todasEtapasConcluidas(habAtualizada)) {
    const validoAte = calcularValidadeApto(agora);
    await pool.request()
      .input("id", sql.Int, habilitacaoId)
      .input("validoAte", sql.Date, validoAte)
      .query(`UPDATE VoluntariosHabilitacao SET Status = 'APTO', AptoDesde = SYSUTCDATETIME(), AptoValidoAte = @validoAte,
              AtualizadoEm = SYSUTCDATETIME() WHERE HabilitacaoId = @id`);
  }

  await registrarAuditoria({
    tabela: "VoluntariosHabilitacao", registroId: habilitacaoId, acao: `ETAPA_${etapa}_CONCLUIDA`,
    usuarioId: registradoPorMembroId, dadosAntes: null, dadosDepois: { etapa }
  });

  return { sucesso: true, mensagem: `✅ Etapa "${TITULO_ETAPA[etapa]}" concluída.` };
}

async function marcarInapto(pool, { habilitacaoId, motivo, registradoPorMembroId }) {
  if (!motivo || !motivo.trim()) return { sucesso: false, mensagem: "Informe o motivo da inaptidão." };
  const hab = await buscarHabilitacaoPorId(pool, habilitacaoId);
  if (!hab) return { sucesso: false, mensagem: "Habilitação não encontrada." };

  await pool.request()
    .input("id", sql.Int, habilitacaoId)
    .input("motivo", sql.NVarChar(300), motivo)
    .input("registradoPor", sql.Int, registradoPorMembroId || null)
    .query(`UPDATE VoluntariosHabilitacao SET Status = 'INAPTO', InaptoMotivo = @motivo, InaptoRegistradoPorMembroId = @registradoPor,
            InaptoEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME() WHERE HabilitacaoId = @id`);

  await registrarAuditoria({
    tabela: "VoluntariosHabilitacao", registroId: habilitacaoId, acao: "MARCADO_INAPTO",
    usuarioId: registradoPorMembroId, dadosAntes: null, dadosDepois: { motivo }
  });
  return { sucesso: true, mensagem: "✅ Voluntário marcado como inapto." };
}

// Reverte a marcação de inapto — a esteira não é apagada, o status volta a
// ser o que as etapas já concluídas indicam (calcularStatusHabilitacao).
async function reabilitar(pool, { habilitacaoId, registradoPorMembroId }) {
  const hab = await buscarHabilitacaoPorId(pool, habilitacaoId);
  if (!hab) return { sucesso: false, mensagem: "Habilitação não encontrada." };
  await pool.request().input("id", sql.Int, habilitacaoId).query(`
    UPDATE VoluntariosHabilitacao SET InaptoMotivo = NULL, InaptoRegistradoPorMembroId = NULL, InaptoEm = NULL,
    Status = 'PENDENTE', AtualizadoEm = SYSUTCDATETIME() WHERE HabilitacaoId = @id
  `);
  await registrarAuditoria({
    tabela: "VoluntariosHabilitacao", registroId: habilitacaoId, acao: "REABILITADO",
    usuarioId: registradoPorMembroId, dadosAntes: null, dadosDepois: null
  });
  return { sucesso: true, mensagem: "✅ Voluntário reabilitado — status recalculado pelas etapas já concluídas." };
}

// Dado combinado pra decidir elegibilidade a ministério com menores — é
// isso que a v7.7 vai consumir (mesmo formato do parâmetro de
// podeServirComMenores).
async function buscarDadosElegibilidade(pool, { membroId, equipeId }) {
  const membroResult = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT MembroId, Nome, DataAdmissao FROM MembroReferencia WHERE MembroId = @id
  `);
  const membro = membroResult.recordset[0];
  if (!membro) return null;

  const habilitacao = await buscarHabilitacaoPorMembro(pool, membroId);

  let contatoComMenores = false;
  if (equipeId) {
    const equipeResult = await pool.request().input("id", sql.Int, equipeId).query(`
      SELECT ContatoComMenores FROM EscalasEquipes WHERE EquipeId = @id
    `);
    contatoComMenores = !!(equipeResult.recordset[0] && equipeResult.recordset[0].ContatoComMenores);
  }

  return {
    membroId: membro.MembroId,
    membroNome: membro.Nome,
    dataAdmissao: membro.DataAdmissao,
    habilitacao,
    contatoComMenores
  };
}

// ---- Equipes/ministérios: marcação "contato com menores" (v5.6/EscalasEquipes reaproveitada) ----

async function atualizarContatoComMenores(pool, equipeId, contatoComMenores) {
  await pool.request()
    .input("id", sql.Int, equipeId)
    .input("valor", sql.Bit, !!contatoComMenores)
    .query(`UPDATE EscalasEquipes SET ContatoComMenores = @valor WHERE EquipeId = @id`);
}

async function listarEquipesComFlag(pool, congregacaoId) {
  const result = await pool.request().input("congregacaoId", sql.Int, congregacaoId).query(`
    SELECT EquipeId AS equipeId, Nome AS nome, ContatoComMenores AS contatoComMenores
    FROM EscalasEquipes WHERE CongregacaoId = @congregacaoId ORDER BY Nome
  `);
  return result.recordset;
}

// ---- Desligamento (RH, separado de disciplina) ----

async function registrarDesligamento(pool, { membroId, equipeId, tipoMotivo, motivo, removidoDaEscala, registradoPorMembroId }) {
  const validacao = validarDesligamento({ motivo, tipoMotivo });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("equipeId", sql.Int, equipeId || null)
    .input("tipoMotivo", sql.NVarChar(30), tipoMotivo || "OUTRO")
    .input("motivo", sql.NVarChar(300), motivo)
    .input("removidoDaEscala", sql.Bit, !!removidoDaEscala)
    .input("registradoPor", sql.Int, registradoPorMembroId)
    .query(`
      INSERT INTO VoluntariosDesligamentos (MembroId, EquipeId, TipoMotivo, Motivo, RemovidoDaEscala, RegistradoPorMembroId)
      OUTPUT INSERTED.DesligamentoId
      VALUES (@membroId, @equipeId, @tipoMotivo, @motivo, @removidoDaEscala, @registradoPor)
    `);

  // "Remoção da escala por perda de confiança" (v7.5) — tira o voluntário
  // da equipe de fato (EscalasEquipeMembros.Ativo = 0), sem tocar em
  // nenhuma tabela de disciplina/CEI. Só roda quando há EquipeId e foi
  // pedido explicitamente (removidoDaEscala).
  if (equipeId && removidoDaEscala) {
    await pool.request().input("equipeId", sql.Int, equipeId).input("membroId", sql.Int, membroId).query(`
      UPDATE EscalasEquipeMembros SET Ativo = 0 WHERE EquipeId = @equipeId AND MembroId = @membroId
    `);
  }

  await registrarAuditoria({
    tabela: "VoluntariosDesligamentos", registroId: result.recordset[0].DesligamentoId, acao: "DESLIGAMENTO_REGISTRADO",
    usuarioId: registradoPorMembroId, dadosAntes: null, dadosDepois: { membroId, tipoMotivo, motivo, removidoDaEscala: !!removidoDaEscala }
  });

  return { sucesso: true, desligamentoId: result.recordset[0].DesligamentoId, mensagem: "✅ Desligamento registrado." };
}

async function listarDesligamentosPorMembro(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT DesligamentoId AS desligamentoId, EquipeId AS equipeId, TipoMotivo AS tipoMotivo, Motivo AS motivo,
           RemovidoDaEscala AS removidoDaEscala, DesligadoEm AS desligadoEm
    FROM VoluntariosDesligamentos WHERE MembroId = @membroId ORDER BY DesligadoEm DESC
  `);
  return result.recordset;
}

module.exports = {
  ETAPAS, CAMPO_ETAPA, TITULO_ETAPA, MESES_VALIDADE_APTO, MESES_REGRA_SEIS_MESES, TIPOS_MOTIVO_DESLIGAMENTO,
  etapasConcluidas, todasEtapasConcluidas, proximaEtapaPendente, podeConcluirEtapa,
  calcularValidadeApto, calcularStatusHabilitacao,
  dataElegibilidadeSeisMeses, atendeRegraSeisMeses, podeServirComMenores,
  validarDesligamento,
  buscarHabilitacaoPorMembro, buscarHabilitacaoPorId, buscarOuCriarHabilitacao, listarHabilitacoesPorCongregacao,
  concluirEtapa, marcarInapto, reabilitar, buscarDadosElegibilidade,
  atualizarContatoComMenores, listarEquipesComFlag,
  registrarDesligamento, listarDesligamentosPorMembro
};
