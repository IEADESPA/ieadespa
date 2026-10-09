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
const protecaoDb = require("../shared/protecaoDb");
const pendencia = require("../shared/protecaoPendencia");

// De hora em hora só o que não pode esperar: o aviso do incidente novo e o relógio de 24 horas. Padrões, Comitê incompleto, afastamento sem decisão e o resumo diário rodam na rodada
// diária das 7h (NotificacoesAgendador), que avalia todas as regras.
const REGRAS_DA_PROTECAO = ["PROTECAO_INCIDENTE_NOVO", "PROTECAO_PRAZO_24H"];

module.exports = async function (context, req) {
  if (!exigirSegredoRotina(req, context)) return;
  // CUSTO: o banco é serverless e só pausa se ficar uma hora sem uso. Com o cabeçalho `x-somente-se-pendente` (o workflow horário o envia), a rotina pergunta primeiro ao blob do Storage
  // se há suspeita com prazo correndo e, se NÃO há, responde sem abrir o banco. Sem blob (ou sem Storage), na dúvida, olha o banco. A rodada diária e toda mudança regravam o blob.
  if (req.headers && req.headers["x-somente-se-pendente"]) {
    const g = await pendencia.lerGuardada();
    if (g && g.pendentes === 0) { context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, ocioso: true, motivo: "nenhuma suspeita com prazo correndo" } }; return; }
  }
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
  // os e-mails que não saíram no ato (serviço fora do ar) são reenviados; a marca de pendência é refeita (o banco já está acordado)
  let reenvio = null;
  try { reenvio = await protecaoDb.reenviarEmailsPendentes(pool); } catch (e) { context.log.error("[PROTECAO] reenvio de e-mails:", e.message); }
  await pendencia.atualizar(pool);
  context.log(`[PROTECAO] rodada horária: ${criadas} aviso(s) novo(s), ${emailsEnviados} e-mail(s), ${reenvio ? reenvio.tentados : 0} reenvio(s).`);
  const falhou = retiradaFalhou || falhas.length > 0;
  context.res = { status: falhou ? 500 : 200, headers: { "Content-Type": "application/json" }, body: { sucesso: !falhou, criadas, emailsEnviados, retirada, retiradaFalhou, detectoresComFalha: falhas, reenvio } };
};
