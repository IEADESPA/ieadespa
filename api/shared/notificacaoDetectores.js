// shared/notificacaoDetectores.js
// Um detector por Chave de NotificacaoRegras: consulta a tabela de origem e
// devolve os fatos geradores (quem recebe + de qual registro). O motor
// (shared/notificacoes.js) é quem decide se cria/envia — o detector só
// reaproveita a MESMA leitura que já existe no "alertas" de cada módulo
// (GestaoSeguros, FecharMesTesouraria/PrestacoesContas, RepassesInstitucionais),
// pra não duplicar a regra de negócio de "o que é vencido/atrasado".
//
// Registrar uma regra nova = 1 linha em NotificacaoRegras (migração) + 1
// entrada aqui. O motor em si (AvaliarNotificacoes) não muda.
const { sql } = require("./db");
const trilhas = require("./trilhas");
const ebdSalaAula = require("./ebdSalaAula");

// Seguros (v4.16) — mesma janela de 30 dias e mesmo critério de "vencida"
// que GET /api/seguros/alertas já usa.
async function detectarSegurosVencendo(pool) {
  const result = await pool.request().query(`
    SELECT ApoliceId, Tipo, Seguradora, NumeroApolice, DataFim
    FROM ApolicesSeguro
    WHERE Status = 'ATIVA' AND DataFim <= DATEADD(DAY, 30, CAST(SYSUTCDATETIME() AS DATE))
  `);
  return result.recordset.map(a => ({
    referenciaId: a.ApoliceId,
    fatoGerador: new Date(a.DataFim) < new Date()
      ? `Apólice ${a.NumeroApolice} (${a.Seguradora}, ${a.Tipo}) está VENCIDA desde ${new Date(a.DataFim).toLocaleDateString("pt-BR")}.`
      : `Apólice ${a.NumeroApolice} (${a.Seguradora}, ${a.Tipo}) vence em ${new Date(a.DataFim).toLocaleDateString("pt-BR")}.`
  }));
}

// Prestação de contas (v4.12/Reg. Art. 120) — atrasada é qualquer mês de
// referência anterior ao atual que ainda não fechou PENDENTE→COMPLETA.
async function detectarPrestacaoContasAtrasada(pool) {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const result = await pool.request().input("mesAtual", sql.Char(7), mesAtual).query(`
    SELECT p.PrestacaoId, p.MesReferencia, c.Nome AS congregacaoNome
    FROM PrestacoesContas p
    JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId
    WHERE p.Status = 'PENDENTE' AND p.MesReferencia < @mesAtual
  `);
  return result.recordset.map(p => ({
    referenciaId: p.PrestacaoId,
    fatoGerador: `Prestação de contas de ${p.congregacaoNome} (${p.MesReferencia}) ainda está pendente.`
  }));
}

// Repasse institucional (v4.15) — "parado no malote": mês de referência
// anterior ao atual, ainda sem repasse confirmado.
async function detectarRepasseMaloteParado(pool) {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const result = await pool.request().input("mesAtual", sql.Char(7), mesAtual).query(`
    SELECT RepasseId, OrigemNome, MesReferencia, ValorRepasse
    FROM RepassesInstitucionais
    WHERE Status = 'PENDENTE' AND MesReferencia < @mesAtual
  `);
  return result.recordset.map(r => ({
    referenciaId: r.RepasseId,
    fatoGerador: `Repasse de ${r.OrigemNome} (${r.MesReferencia}, R$ ${Number(r.ValorRepasse).toFixed(2)}) ainda não foi confirmado.`
  }));
}

// Escalas de Serviço (v5.6) — quem não confirmou recebimento até
// PrazoConfirmacaoDias depois de a escala publicar vira pendência.
// CONVIDADO ou ACEITO (mas não CONFIRMADO/RECUSADO/CANCELADO) do lado do
// serviço já publicado — mesmo critério de shared/escalas.js::
// listarPendenciasConfirmacao, só que aqui é a rodada diária (cron, vB.2)
// que varre TODAS as congregações de uma vez pros administradores de
// escala (PermissaoAlvo 'escalas'); o líder de cada equipe já vê a mesma
// lista em tempo real na tela "Pendências de Confirmação" (GestaoEscalas).
async function detectarConfirmacaoEscalaPendente(pool) {
  const result = await pool.request().query(`
    SELECT a.AlocacaoId, m.Nome AS membroNome, eq.Nome AS equipeNome, s.Descricao AS servicoDescricao, s.DataHora AS dataHora
    FROM EscalasAlocacoes a
    JOIN EscalasServicos s ON s.ServicoId = a.ServicoId
    JOIN EscalasEquipes eq ON eq.EquipeId = a.EquipeId
    JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE s.Status = 'PUBLICADA' AND a.Status IN ('CONVIDADO','ACEITO')
      AND DATEDIFF(DAY, s.PublicadaEm, SYSUTCDATETIME()) >= s.PrazoConfirmacaoDias
  `);
  return result.recordset.map(a => ({
    referenciaId: a.AlocacaoId,
    fatoGerador: `${a.membroNome} (equipe ${a.equipeNome}) ainda não confirmou presença no serviço "${a.servicoDescricao || ""}" de ${new Date(a.dataHora).toLocaleDateString("pt-BR")}.`
  }));
}

// Educação continuada (v6.9) — certificado de trilha vencido ou dentro da
// janela de aviso da trilha (Trilhas.AvisoDias, padrão 60 dias). Reaproveita
// a MESMA leitura que a tela de pendências usa (shared/trilhas.js), com
// escopo "tudo" (a rodada diária varre todas as congregações pra quem tem
// `trilhas_gestao`). A chave de deduplicação é o id da matrícula: VENCENDO
// usa o id positivo e VENCIDA o NEGATIVO — assim o aviso "vence em breve" e
// o aviso "venceu" são dois fatos geradores distintos (a deduplicação de
// criarNotificacao só deixa passar um aviso por chave).
async function detectarFormacaoVencendo(pool) {
  const pendencias = await trilhas.listarPendenciasVencimento(pool);
  return pendencias
    .filter(p => !p.renovacaoEmAndamento)
    .map(p => ({
      referenciaId: p.situacao === "VENCIDA" ? -p.matriculaId : p.matriculaId,
      fatoGerador: p.situacao === "VENCIDA"
        ? `O certificado de ${p.membroNome} na trilha "${p.trilhaNome}" VENCEU em ${trilhas.formatarDataBr(p.validoAte)}${p.congregacaoNome ? ` (${p.congregacaoNome})` : ""}.`
        : `O certificado de ${p.membroNome} na trilha "${p.trilhaNome}" vence em ${trilhas.formatarDataBr(p.validoAte)} (${p.diasParaVencer} dia(s))${p.congregacaoNome ? ` (${p.congregacaoNome})` : ""}.`
    }));
}

// EBD (v6.10) — aluno sem presença há N domingos seguidos (N = Prazos
// EBD_AUSENCIA_DOMINGOS, padrão 3), pelo mesmo cálculo da tela "Alunos
// ausentes" (shared/ebdSalaAula.js). Vai DIRETO para os professores ativos da
// turma (cada fato traz `destinatarios`) — turma sem professor não gera aviso,
// só aparece na tela. A chave é a sequência de faltas (EbdAlertasAusencia):
// a mesma sequência avisa uma vez; se o aluno voltar e sumir de novo, avisa
// de novo.
async function detectarAlunoAusenteEbd(pool) {
  const minimo = await ebdSalaAula.lerMinimoDomingosAusencia(pool);
  const porTurma = await ebdSalaAula.calcularAusenciasPorTurma(pool, { minimo });
  if (porTurma.length === 0) return [];
  const professores = await ebdSalaAula.listarProfessoresAtivosPorTurma(pool);
  const fatos = [];
  for (const turma of porTurma) {
    const destinatarios = professores.get(turma.turmaId) || [];
    if (destinatarios.length === 0) continue;
    for (const sequencia of turma.sequencias) {
      const alertaId = await ebdSalaAula.registrarSequenciaAusencia(pool, { turmaId: turma.turmaId, sequencia });
      fatos.push({
        referenciaId: alertaId,
        destinatarios,
        fatoGerador: ebdSalaAula.textoAlertaAusencia({ ...sequencia, turmaNome: turma.turmaNome, congregacaoNome: turma.congregacaoNome })
      });
    }
  }
  return fatos;
}

// PSC (v7.1) — as quatro regras vêm de shared/psc.js. "Pendente" e "para
// validar" avisam só quem tem psc_gestao E alcança a congregação (cada fato
// traz os próprios destinatários); "para homologar" e "reclassificação
// proposta" vão para quem tem psc_homologacao (a CLI, escopo global). A chave
// de "pendente" é congregação * 10000 + ano: um aviso por exercício.
const psc = require("./psc");
const calendarioDb = require("./calendarioDb");
const canaisDb = require("./canaisDb");
const eventosDb = require("./eventosDb");

const DETECTORES = {
  SEGUROS_VENCENDO: { tabela: "ApolicesSeguro", detectar: detectarSegurosVencendo },
  PRESTACAO_CONTAS_ATRASADA: { tabela: "PrestacoesContas", detectar: detectarPrestacaoContasAtrasada },
  REPASSE_MALOTE_PARADO: { tabela: "RepassesInstitucionais", detectar: detectarRepasseMaloteParado },
  ESCALA_CONFIRMACAO_PENDENTE: { tabela: "EscalasAlocacoes", detectar: detectarConfirmacaoEscalaPendente },
  FORMACAO_VENCENDO: { tabela: "TrilhaMatriculas", detectar: detectarFormacaoVencendo },
  EBD_ALUNO_AUSENTE: { tabela: "EbdAlertasAusencia", detectar: detectarAlunoAusenteEbd },
  PSC_AVALIACAO_PENDENTE: { tabela: "PscExercicio", detectar: (pool) => psc.detectarAvaliacoesPendentes(pool) },
  PSC_PARA_VALIDAR: { tabela: "PscAvaliacoes", detectar: (pool) => psc.detectarAvaliacoesParaValidar(pool) },
  PSC_PARA_HOMOLOGAR: { tabela: "PscAvaliacoes", detectar: (pool) => psc.detectarAvaliacoesParaHomologar(pool) },
  PSC_RECLASSIFICACAO_PROPOSTA: { tabela: "PscReclassificacoes", detectar: (pool) => psc.detectarReclassificacoesPropostas(pool) },
  // Calendário (v7.2): o prazo de 15/jan avisa quem pode propor e ainda não propôs (30 e 7 dias antes);
  // proposta recusada/absorvida avisa SÓ o proponente; consolidar e homologar vão a quem decide.
  CALENDARIO_PRAZO_PROPOSTAS: { tabela: "CalendarioAnos", detectar: (pool) => calendarioDb.detectarPrazoPropostas(pool, { janelaDias: 30 }) },
  CALENDARIO_PRAZO_URGENTE: { tabela: "CalendarioAnos", detectar: (pool) => calendarioDb.detectarPrazoPropostas(pool, { janelaDias: 7 }) },
  CALENDARIO_PROPOSTA_RECUSADA: { tabela: "CalendarioEventos", detectar: (pool) => calendarioDb.detectarPropostasRecusadas(pool) },
  CALENDARIO_PARA_CONSOLIDAR: { tabela: "CalendarioAnos", detectar: (pool) => calendarioDb.detectarParaConsolidar(pool) },
  CALENDARIO_PARA_HOMOLOGAR: { tabela: "CalendarioAnos", detectar: (pool) => calendarioDb.detectarParaHomologar(pool) },
  // Canais (v7.3): o aviso imediato de conteúdo irregular (CANAIS_OCORRENCIA_NOVA) sai na hora, no ato de avisar,
  // e por isso não tem detector; aqui ficam o prazo vencido, o termo pendente, a troca de senha (que antes confere
  // quem saiu da liderança), canal sem administrador e conferência vencida.
  CANAIS_OCORRENCIA_VENCIDA: { tabela: "CanalOcorrencias", detectar: (pool) => canaisDb.detectarOcorrenciasVencidas(pool) },
  CANAIS_TERMO_PENDENTE: { tabela: "CanalAdministradores", detectar: (pool) => canaisDb.detectarTermosPendentes(pool) },
  CANAIS_TROCA_CREDENCIAL: {
    tabela: "CanalTrocasCredencial",
    detectar: async (pool) => {
      try { await canaisDb.sincronizarSucessoes(pool); } catch (e) { console.error("[CANAIS] sucessão:", e.message); }
      return canaisDb.detectarTrocasCredencial(pool);
    }
  },
  CANAIS_SEM_ADMINISTRADOR: { tabela: "CanaisOficiaisComunicacao", detectar: (pool) => canaisDb.detectarSemAdministrador(pool) },
  CANAIS_CONFERENCIA_VENCIDA: { tabela: "CanaisOficiaisComunicacao", detectar: (pool) => canaisDb.detectarConferenciasVencidas(pool) },
  // Eventos (v7.4): os avisos de organizador designado, convidado para análise/decidido e caixa para conferir saem NA HORA,
  // no ato (por isso não têm detector); aqui ficam a cobrança do convidado sem decisão com o evento perto e o caixa fora do prazo.
  EVENTOS_CONVIDADO_ATRASADO: { tabela: "EventoConvidados", detectar: (pool) => eventosDb.detectarConvidadosAtrasados(pool) },
  EVENTOS_CAIXA_ENCERRAR: { tabela: "EventoCaixas", detectar: (pool) => eventosDb.detectarCaixasForaDoPrazo(pool) }
};

module.exports = { DETECTORES };
