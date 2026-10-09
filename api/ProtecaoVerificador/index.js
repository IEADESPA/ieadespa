// ProtecaoVerificador (v7.8) — a rotina horária da proteção de crianças.
// O prazo de 24 horas para comunicar o Conselho Tutelar não espera a rodada diária das 7h: esta rotina roda de hora em hora (.github/workflows/rotinas-protecao.yml, mesmo
// padrão do NotificacoesAgendador: httpTrigger protegido por segredo, shared/cronAuth.js) e faz duas coisas, nesta ordem:
//   1) retira das escalas com menores quem está sob afastamento cautelar (refaz a retirada imediata caso ela tenha falhado);
//   2) avalia SÓ as regras da proteção (aviso do incidente novo, relógio de 12 h / 4 h / vencido, padrão de quebras, Comitê incompleto, afastamento sem decisão). O motor não duplica aviso.
// Resposta 500 quando a retirada ou um detector da proteção falha: o job do GitHub fica vermelho e alguém vê. O que protege criança não falha em silêncio.
const { getPool } = require("../shared/db");
const { avaliarRegras } = require("../shared/notificacaoMotor");
const { exigirSegredoRotina } = require("../shared/cronAuth");
const mmDb = require("../shared/ministerioMenoresDb");

const REGRAS_DA_PROTECAO = ["PROTECAO_INCIDENTE_NOVO", "PROTECAO_PRAZO_24H", "PROTECAO_PADRAO_QUEBRAS", "PROTECAO_COMITE_INCOMPLETO", "PROTECAO_CAUTELAR_SEM_DECISAO"];

module.exports = async function (context, req) {
  if (!exigirSegredoRotina(req, context)) return;
  const pool = await getPool();
  let retirada = null, retiradaFalhou = false;
  try {
    retirada = await mmDb.retirarInaptosDasEscalas(pool);
    if (retirada.retirados) context.log(`[PROTECAO] retirada automática: ${retirada.retirados} pessoa(s), ${retirada.alocacoes} escala(s) desmarcada(s).`);
  } catch (e) {
    context.log.error("[PROTECAO] falha na retirada automática da escala:", e.message);
    retiradaFalhou = true;
  }
  const { criadas = 0, emailsEnviados = 0, falhas = [] } = await avaliarRegras(pool, { chaves: REGRAS_DA_PROTECAO });
  if (falhas.length) context.log.error(`[PROTECAO] detector(es) que falharam: ${falhas.join(", ")}`);
  context.log(`[PROTECAO] rodada horária: ${criadas} aviso(s) novo(s), ${emailsEnviados} e-mail(s).`);
  const falhou = retiradaFalhou || falhas.length > 0;
  context.res = { status: falhou ? 500 : 200, headers: { "Content-Type": "application/json" }, body: { sucesso: !falhou, criadas, emailsEnviados, retirada, retiradaFalhou, detectoresComFalha: falhas } };
};
