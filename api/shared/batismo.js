// shared/batismo.js (vB.11 — Esteira de Batismo, Regimento Art. 80)
// Aptidão CALCULADA na leitura, nunca marcação manual (mesmo princípio do
// Art. 7º §1º já usado em todo o resto do sistema). O item IV (conclusão do
// Curso de Discipulado) era atestação manual até a v6.9; agora, quando uma
// trilha de formação está configurada como requisito (TrilhaRequisitos,
// contexto BATISMO_DISCIPULADO), o item é VERIFICADO pela conclusão real da
// trilha. Sem trilha configurada, continua a atestação manual — dita como
// tal no próprio retorno, não escondida atrás de um "ok" genérico.
const { sql } = require("./db");
const estatuto = require("./estatuto");
const auditoria = require("./auditoria");
const { sha256 } = auditoria;
// pela referência ao módulo (a trilha do batismo que completa o arrolamento): o teste espia registrarAuditoria
const registrarAuditoria = (registro) => auditoria.registrarAuditoria(registro);
const trilhas = require("./trilhas");
const auth = require("./auth");
const { ehGeral } = require("./escopoRotas");

const IDADE_MINIMA_BATISMO = 12; // Art. 80 §2º, I

// Auditoria de escopo (02/10/2026): a turma é dado de CONGREGAÇÃO. `turma`: { congregacaoId, congregacaoNome }. Turma com congregação vale para quem alcança essa
// congregação; turma SEM congregação (da igreja toda) só para o nível geral.
function turmaNoEscopo(usuario, turma) {
  if (!turma || !turma.congregacaoId) return ehGeral(usuario);
  return auth.estaNoEscopo(usuario, turma.congregacaoNome);
}
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
  // v6.9 — com trilha configurada, vale a conclusão real (vigente); a
  // atestação manual só vale quando nenhuma trilha foi configurada.
  const formacao = await trilhas.avaliarRequisitos(pool, { contexto: "BATISMO_DISCIPULADO", membroId: candidato.membroId });
  const verificadoPorTrilha = formacao.temRequisitos;
  // Trava 8-B — Art. 70 §5º: o batismo de urgência (com o termo de compromisso do Discipulado Pós-Batismal) não espera o curso
  const urgencia = !!candidato.urgenciaTermoEm;
  const discipuladoOk = urgencia || (verificadoPorTrilha ? !formacao.bloqueado : !!candidato.discipuladoConcluidoManual);

  return {
    apto: idadeOk && certidaoCivilOk && parecerOk && discipuladoOk,
    itens: {
      idadeMinima: { ok: idadeOk, detalhe: idade !== null ? `${idade} anos (mínimo ${IDADE_MINIMA_BATISMO})` : "Data de nascimento ausente" },
      certidaoCivil: {
        ok: certidaoCivilOk,
        detalhe: !precisaCertidaoCivil ? "Não se aplica" : (certidaoCivilOk ? "Casamento civil registrado" : "Coabitante (união estável) sem certidão de casamento civil registrada")
      },
      parecerVidaPregressa: { ok: parecerOk, detalhe: candidato.parecerVidaPregressa || "Pendente" },
      discipulado: {
        ok: discipuladoOk,
        verificadoPorTrilha,
        urgencia,
        detalhe: urgencia
          ? `Batismo de urgência (Regimento, Art. 70 §5º) — termo de compromisso em ${String(candidato.urgenciaTermoEm).split("-").reverse().join("/")}: o Discipulado Pós-Batismal é obrigatório depois`
          : verificadoPorTrilha
          ? (discipuladoOk
              ? "Verificado pela trilha de formação" + (formacao.alertas.length ? ` (atenção: ${formacao.alertas.join("; ")})` : "")
              : formacao.mensagemBloqueio)
          : (discipuladoOk ? "Atestado manualmente (nenhuma trilha de discipulado configurada como requisito)" : "Pendente")
      }
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
//
// A ficha em ARROLAMENTO (veio do sistema pago e ainda não foi completada) que é batizada: a ficha sai do grupo em comunhão, com a forma batismo e a
// data do batismo, então a pendência ARROLAMENTO fecha como COMPLETADA junto com a situação, na mesma transação, e a trilha diz que foi o batismo (A2 da
// revisão de 24/11/2026: antes a ficha saía do grupo e a pendência ficava aberta). A data de entrada (DataAdmissao) NÃO muda aqui, como no batismo de quem
// não veio da importação: se o sistema pago não a trouxe, ela continua vazia, e a Assembleia (que pede 90 dias da entrada) conta a ficha como "dados
// incompletos" até alguém preenchê-la. Se a data do batismo deve virar a data de entrada, é pergunta para o responsável. `por`: quem realizou a turma.
async function efetivarTurma(pool, turmaId, por = null) {
  const turma = (await pool.request().input("id", sql.Int, turmaId).query(`SELECT DataBatismo FROM TurmasBatismo WHERE TurmaId = @id`)).recordset[0];
  if (!turma) return 0;
  const aprovados = (await pool.request().input("turmaId", sql.Int, turmaId).query(`
    SELECT CandidatoId, MembroId FROM CandidatosBatismo WHERE TurmaId = @turmaId AND Status = 'APROVADO'
  `)).recordset;

  for (const candidato of aprovados) {
    const r = await pool.request()
      .input("id", sql.Int, candidato.MembroId).input("dataBatismo", sql.Date, turma.DataBatismo).input("por", sql.Int, por)
      .query(`SET XACT_ABORT ON; BEGIN TRAN;
              UPDATE MembroReferencia SET SituacaoMembro = 'EM_COMUNHAO', DataBatismo = @dataBatismo, FormaAdmissao = 'BATISMO' WHERE MembroId = @id;
              UPDATE FichasPendencias SET Situacao = N'RESOLVIDA', Resolucao = N'COMPLETADA', ResolvidaEm = SYSUTCDATETIME(), ResolvidaPor = @por,
                Nota = N'Completada pelo batismo: em comunhão, a forma batismo e a data do batismo (a data de entrada não muda).'
              WHERE MembroId = @id AND Tipo = N'ARROLAMENTO' AND Situacao = N'ABERTA';
              DECLARE @resolvidas INT = @@ROWCOUNT;
              COMMIT;
              SELECT @resolvidas AS resolvidas;`);
    if (Number(r.recordset && r.recordset[0] && r.recordset[0].resolvidas) > 0) {
      await registrarAuditoria({ tabela: "MembroReferencia", registroId: candidato.MembroId, acao: "O batismo completou o arrolamento", usuarioId: por,
        dadosDepois: { situacaoMembro: "EM_COMUNHAO", formaAdmissao: "BATISMO", turmaId } });
    }
    await pool.request().input("id", sql.Int, candidato.CandidatoId).query(`UPDATE CandidatosBatismo SET Status = 'BATIZADO' WHERE CandidatoId = @id`);
  }
  return aprovados.length;
}

module.exports = {
  efetivarTurma, turmaNoEscopo,
  IDADE_MINIMA_BATISMO, MESES_VALIDOS_TURMA, TIPOS_LOCAL_VEDADOS,
  mesValidoParaTurma, localPermitido, possuiCasamentoCivilRegistrado,
  calcularAptidaoBatismo, registrarAceiteEstatuto,
  TEXTO_ACEITE_ESTATUTO, VERSAO_ACEITE_ESTATUTO
};
