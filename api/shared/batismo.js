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

// A DATA DE ENTRADA PELO BATISMO (decisão dele de 24/11/2026, volta 5): a admissão no rol é quando a pessoa se torna membro. Quem se converteu na nossa igreja
// (o congregado; e quem está com o arrolamento a completar, que ainda não é membro) é admitido no batismo nas águas: a data de entrada (DataAdmissao) passa a
// ser a data do batismo, também por cima de uma data anterior de congregado (ex.: veio em 2006, foi batizado em 2010: a admissão é 2010, e os 90 dias da
// Assembleia contam do batismo; a data de antes fica na trilha). Quem já entrou como membro por outro caminho — carta de mudança ou aclamação (veio de outra
// igreja: a data de entrada é a da chegada, que a secretaria registra) e reconciliação (a volta, com a data dela) — fica com a forma e a data dele.
// E quem JÁ é membro (em comunhão ou sem comunhão) com a data de entrada fica com a forma e a data dele, qualquer que seja a forma (menor 4 do portão da volta
// 5: a ficha antiga com a forma em branco perdia a data e os 90 dias). O membro sem data nenhuma segue como antes (a forma batismo e a data do batismo): não
// foi decidido (pergunta aberta da volta 6).
const FORMAS_DE_OUTRO_CAMINHO = ["CARTA_MUDANCA", "ACLAMACAO", "RECONCILIACAO"];
const JA_MEMBRO = ["EM_COMUNHAO", "SEM_COMUNHAO"];
function jaEraMembro(antes) {
  return !!antes && JA_MEMBRO.includes(antes.situacao);
}
// antes: { situacao, formaAdmissao, dataAdmissao } ("AAAA-MM-DD" ou null); dataBatismo: "AAAA-MM-DD". Devolve { formaAdmissao, dataAdmissao }.
function entradaPeloBatismo(antes, dataBatismo) {
  const a = antes || {};
  if (FORMAS_DE_OUTRO_CAMINHO.includes(a.formaAdmissao)) return { formaAdmissao: a.formaAdmissao, dataAdmissao: a.dataAdmissao || null };
  if (jaEraMembro(a) && a.dataAdmissao) return { formaAdmissao: a.formaAdmissao || null, dataAdmissao: a.dataAdmissao };
  return { formaAdmissao: "BATISMO", dataAdmissao: dataBatismo };
}

// Efetivação (Art. 7º, II) — ao REALIZAR a turma, todo candidato já APROVADO nela vira Membro em Comunhão automaticamente: DataBatismo e FormaAdmissao vêm do
// próprio fluxo, "sem digitação posterior" (mesmo texto da versão), e a data de entrada pela regra acima. Quem não foi aprovado a tempo NÃO é efetivado — fica
// pra reatribuir numa turma seguinte (Status volta a AGUARDANDO_TURMA fora daqui, ação separada).
// Cada candidato numa TRANSAÇÃO própria (menor 6 da revisão do portão de 24/11/2026: antes a trilha ia depois do COMMIT): a ficha lida com trava, a situação, a
// forma e a data de entrada, a pendência ARROLAMENTO fechada como COMPLETADA (a ficha que veio do sistema pago e ainda não tinha sido completada), a trilha
// (com a forma e a data de antes: a data anterior de congregado só sobrevive nela, porque o banco não tem coluna de conversão) e o BATIZADO do candidato.
// Um erro desfaz só o candidato da vez (os anteriores já ficaram) e sobe. `por`: quem realizou a turma.
const NOTA_BATISMO = "Completada pelo batismo: em comunhão, a forma batismo e a data de entrada igual à do batismo.";
const NOME_DA_FORMA = { CARTA_MUDANCA: "carta de mudança", ACLAMACAO: "aclamação", RECONCILIACAO: "reconciliação" };
// A nota da pendência fechada diz o que ficou de verdade naquela ficha (a forma e a data do batismo, ou as de antes de quem entrou por outro caminho ou já
// era membro). Sem a data de entrada (ficha antiga com a forma e sem a data), a nota avisa: a data não se inventa. `dataBatismo` (opcional): sem ela, a forma
// batismo é lida como a do batismo de agora.
function notaDoBatismo(e, dataBatismo = null) {
  const forma = e && e.formaAdmissao;
  const nome = NOME_DA_FORMA[forma];
  if (nome) {
    if (!e.dataAdmissao) return `Completada pelo batismo: em comunhão; a forma de entrada (${nome}) fica, e a data de entrada está em branco: registre na ficha a data de entrada.`;
    return `Completada pelo batismo: em comunhão; a forma de entrada (${nome}) e a data de entrada de antes ficam.`;
  }
  if (forma === "BATISMO" && (!dataBatismo || e.dataAdmissao === dataBatismo)) return NOTA_BATISMO;
  if (forma === "BATISMO") return "Completada pelo batismo: em comunhão; a forma de entrada (batismo) e a data de entrada de antes ficam.";
  return "Completada pelo batismo: em comunhão; a data de entrada de antes fica.";
}
async function efetivarTurma(pool, turmaId, por = null) {
  const turma = (await pool.request().input("id", sql.Int, turmaId)
    .query(`SELECT CONVERT(varchar(10), DataBatismo, 120) AS DataBatismo FROM TurmasBatismo WHERE TurmaId = @id`)).recordset[0];
  if (!turma) return 0;
  const aprovados = (await pool.request().input("turmaId", sql.Int, turmaId).query(`
    SELECT CandidatoId, MembroId FROM CandidatosBatismo WHERE TurmaId = @turmaId AND Status = 'APROVADO'
  `)).recordset;
  const dataBatismo = turma.DataBatismo instanceof Date ? turma.DataBatismo.toISOString().slice(0, 10) : String(turma.DataBatismo).slice(0, 10);

  for (const candidato of aprovados) {
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      const rq = () => new sql.Request(t);
      const f = (await rq().input("id", sql.Int, candidato.MembroId).query(`SET XACT_ABORT ON;
        SELECT SituacaoMembro, FormaAdmissao, CONVERT(varchar(10), DataAdmissao, 120) AS DataAdmissao
        FROM MembroReferencia WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @id`)).recordset[0] || {};
      const antes = { situacaoMembro: f.SituacaoMembro || null, formaAdmissao: f.FormaAdmissao || null, dataAdmissao: f.DataAdmissao || null };
      const lida = { situacao: antes.situacaoMembro, formaAdmissao: antes.formaAdmissao, dataAdmissao: antes.dataAdmissao };
      const e = entradaPeloBatismo(lida, dataBatismo);
      await rq().input("id", sql.Int, candidato.MembroId).input("dataBatismo", sql.Date, dataBatismo).input("forma", sql.NVarChar(30), e.formaAdmissao)
        .input("dataAdmissao", sql.Date, e.dataAdmissao)
        .query(`SET XACT_ABORT ON;
                UPDATE MembroReferencia SET SituacaoMembro = 'EM_COMUNHAO', DataBatismo = @dataBatismo, FormaAdmissao = @forma, DataAdmissao = @dataAdmissao WHERE MembroId = @id;`);
      const p = (await rq().input("id", sql.Int, candidato.MembroId).input("por", sql.Int, por).input("nota", sql.NVarChar(300), notaDoBatismo(e, dataBatismo))
        .query(`SET XACT_ABORT ON;
                UPDATE FichasPendencias SET Situacao = N'RESOLVIDA', Resolucao = N'COMPLETADA', ResolvidaEm = SYSUTCDATETIME(), ResolvidaPor = @por, Nota = @nota
                WHERE MembroId = @id AND Tipo = N'ARROLAMENTO' AND Situacao = N'ABERTA';
                SELECT @@ROWCOUNT AS resolvidas;`)).recordset[0];
      const completouArrolamento = Number(p && p.resolvidas) > 0;
      await auditoria.registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: candidato.MembroId, usuarioId: por,
        acao: completouArrolamento ? "O batismo completou o arrolamento" : jaEraMembro(lida) ? "O batismo foi registrado na ficha de quem já era membro" : "O batismo admitiu o membro",
        dadosAntes: antes, dadosDepois: { situacaoMembro: "EM_COMUNHAO", formaAdmissao: e.formaAdmissao, dataAdmissao: e.dataAdmissao, turmaId } });
      await rq().input("id", sql.Int, candidato.CandidatoId).query(`SET XACT_ABORT ON; UPDATE CandidatosBatismo SET Status = 'BATIZADO' WHERE CandidatoId = @id`);
      await t.commit();
    } catch (erro) {
      try { await t.rollback(); } catch (_) { /* já desfeita */ }
      throw erro;
    }
  }
  return aprovados.length;
}

module.exports = {
  efetivarTurma, entradaPeloBatismo, notaDoBatismo, FORMAS_DE_OUTRO_CAMINHO, turmaNoEscopo,
  IDADE_MINIMA_BATISMO, MESES_VALIDOS_TURMA, TIPOS_LOCAL_VEDADOS,
  mesValidoParaTurma, localPermitido, possuiCasamentoCivilRegistrado,
  calcularAptidaoBatismo, registrarAceiteEstatuto,
  TEXTO_ACEITE_ESTATUTO, VERSAO_ACEITE_ESTATUTO
};
