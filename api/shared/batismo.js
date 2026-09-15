// shared/batismo.js (vB.11 — Esteira de Batismo, Regimento Art. 80)
// Aptidão CALCULADA na leitura, nunca marcação manual (mesmo princípio do
// Art. 7º §1º já usado em todo o resto do sistema) — só o item IV
// (conclusão do Curso de Discipulado) fica como atestação manual até a
// v6.9 (trilha de formação como entidade real) existir; documentado no
// próprio retorno, não escondido atrás de um "ok" genérico.
const { sql } = require("./db");
const estatuto = require("./estatuto");
const { sha256 } = require("./auditoria");

const IDADE_MINIMA_BATISMO = 12; // Art. 80 §2º, I
const MESES_VALIDOS_TURMA = [5, 10]; // maio e outubro, Art. 80 §3º, I
const TIPOS_LOCAL_VEDADOS = ["RIO", "REPRESA"]; // Art. 80 §3º, II-III

// Texto fixo do aceite (Art. 80 §2º, V) — reaproveita a MESMA mecânica de
// hash/trilha de TermosAssinados (vB.6) sem entrar no catálogo de
// shared/termos.js: aquele catálogo gate-ia login de Lideranca
// (exigirLogin -> termosPendentes), e este aceite é sobre virar membro,
// não sobre acesso administrativo — não pode virar pendência de login pra
// quem não tem nada a ver com isso.
const VERSAO_ACEITE_ESTATUTO = "2026-1";
const TEXTO_ACEITE_ESTATUTO =
  "Declaro ter lido e aceito integralmente o Estatuto e o Regimento Interno da IEADESPA, " +
  "comprometendo-me a observá-los como condição do meu vínculo associativo (Regimento, Art. 80 §2º, V).";

function mesValidoParaTurma(dataBatismo) {
  const mes = new Date(dataBatismo).getMonth() + 1;
  return MESES_VALIDOS_TURMA.includes(mes);
}

function localPermitido(tipoLocal) {
  return !TIPOS_LOCAL_VEDADOS.includes(String(tipoLocal || "").toUpperCase());
}

async function possuiCasamentoCivilRegistrado(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT 1 FROM Casamentos WHERE MembroId = @id AND (Modalidade = 'CIVIL_E_RELIGIOSO' OR RegistradoCartorio = 1)
  `);
  return r.recordset.length > 0;
}

// candidato: { membroId, dataNascimento, estadoCivil, parecerVidaPregressa, discipuladoConcluidoManual }
async function calcularAptidaoBatismo(pool, candidato) {
  const idade = estatuto.idadeEm(candidato.dataNascimento);
  const idadeOk = idade !== null && idade >= IDADE_MINIMA_BATISMO;

  const precisaCertidaoCivil = candidato.estadoCivil === "UNIAO_ESTAVEL";
  const certidaoCivilOk = !precisaCertidaoCivil || (await possuiCasamentoCivilRegistrado(pool, candidato.membroId));

  const parecerOk = candidato.parecerVidaPregressa === "FAVORAVEL";
  const discipuladoOk = !!candidato.discipuladoConcluidoManual;

  return {
    apto: idadeOk && certidaoCivilOk && parecerOk && discipuladoOk,
    itens: {
      idadeMinima: { ok: idadeOk, detalhe: idade !== null ? `${idade} anos (mínimo ${IDADE_MINIMA_BATISMO})` : "Data de nascimento ausente" },
      certidaoCivil: {
        ok: certidaoCivilOk,
        detalhe: !precisaCertidaoCivil ? "Não se aplica" : (certidaoCivilOk ? "Casamento civil registrado" : "Coabitante (união estável) sem certidão de casamento civil registrada")
      },
      parecerVidaPregressa: { ok: parecerOk, detalhe: candidato.parecerVidaPregressa || "Pendente" },
      discipulado: { ok: discipuladoOk, detalhe: discipuladoOk ? "Atestado manualmente — a v6.9 vai verificar isso de verdade" : "Pendente" }
    }
  };
}

async function registrarAceiteEstatuto(pool, membroId) {
  const hash = sha256(TEXTO_ACEITE_ESTATUTO);
  const inserido = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("tipo", sql.NVarChar(40), "ACEITE_ESTATUTO_MEMBRESIA")
    .input("versao", sql.NVarChar(20), VERSAO_ACEITE_ESTATUTO)
    .input("hash", sql.NVarChar(64), hash)
    .query(`INSERT INTO TermosAssinados (MembroId, TipoTermo, VersaoTermo, HashConteudo)
            OUTPUT INSERTED.TermoAssinadoId VALUES (@membroId, @tipo, @versao, @hash)`);
  return inserido.recordset[0].TermoAssinadoId;
}

// Efetivação (Art. 7º, II) — ao REALIZAR a turma, todo candidato já
// APROVADO nela vira Membro em Comunhão automaticamente: DataBatismo e
// FormaAdmissao vêm do próprio fluxo, "sem digitação posterior" (mesmo
// texto da versão). Quem não foi aprovado a tempo NÃO é efetivado — fica
// pra reatribuir numa turma seguinte (Status volta a AGUARDANDO_TURMA
// fora daqui, ação separada).
async function efetivarTurma(pool, turmaId) {
  const turma = (await pool.request().input("id", sql.Int, turmaId).query(`SELECT DataBatismo FROM TurmasBatismo WHERE TurmaId = @id`)).recordset[0];
  if (!turma) return 0;
  const aprovados = (await pool.request().input("turmaId", sql.Int, turmaId).query(`
    SELECT CandidatoId, MembroId FROM CandidatosBatismo WHERE TurmaId = @turmaId AND Status = 'APROVADO'
  `)).recordset;

  for (const candidato of aprovados) {
    await pool.request()
      .input("id", sql.Int, candidato.MembroId).input("dataBatismo", sql.Date, turma.DataBatismo)
      .query(`UPDATE MembroReferencia SET SituacaoMembro = 'EM_COMUNHAO', DataBatismo = @dataBatismo, FormaAdmissao = 'BATISMO' WHERE MembroId = @id`);
    await pool.request().input("id", sql.Int, candidato.CandidatoId).query(`UPDATE CandidatosBatismo SET Status = 'BATIZADO' WHERE CandidatoId = @id`);
  }
  return aprovados.length;
}

module.exports = {
  efetivarTurma,
  IDADE_MINIMA_BATISMO, MESES_VALIDOS_TURMA, TIPOS_LOCAL_VEDADOS,
  mesValidoParaTurma, localPermitido, possuiCasamentoCivilRegistrado,
  calcularAptidaoBatismo, registrarAceiteEstatuto,
  TEXTO_ACEITE_ESTATUTO, VERSAO_ACEITE_ESTATUTO
};
