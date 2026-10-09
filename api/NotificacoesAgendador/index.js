// NotificacoesAgendador (vB.2 — Motor de notificações)
// Rodada diária (10h UTC = 7h em Brasília) do avaliador de regras.
// Achado real da Trava B-A: Azure Static Web Apps (modelo gerenciado) não
// aceita timerTrigger nas Functions internas — bloqueava o deploy inteiro.
// Virou httpTrigger acionado por um workflow agendado do GitHub Actions
// (.github/workflows/rotinas-diarias.yml), protegido por segredo
// (shared/cronAuth.js) em vez de sessão de usuário — rotina automática não
// tem "usuário logado". avaliarRegras já é idempotente por origem, então
// rodar isso todo dia nunca duplica aviso do mesmo fato gerador.
const { getPool } = require("../shared/db");
const { avaliarRegras } = require("../shared/notificacaoMotor");
const { exigirSegredoRotina } = require("../shared/cronAuth");
const { anonimizarIpsVencidos } = require("../shared/voluntariadoDb");
const setoresTecnicosDb = require("../shared/setoresTecnicosDb");
const mmDb = require("../shared/ministerioMenoresDb");
const menoresConsentimentoDb = require("../shared/menoresConsentimentoDb");

module.exports = async function (context, req) {
  if (!exigirSegredoRotina(req, context)) return;
  const pool = await getPool();
  // v7.7 (Lei 14.811/2024) — ANTES dos avisos: quem deixou de estar habilitado (certidão vencida, treinamento vencido...) sai das escalas futuras das equipes com
  // menores, e os avisos seguintes já enxergam a escala limpa. Fail-soft: uma falha aqui não derruba a rodada de avisos (a próxima repete; a escala também é
  // bloqueada na hora em que alguém tenta escalar).
  let retiradaMenores = null;
  let retiradaFalhou = false;
  try {
    retiradaMenores = await mmDb.retirarInaptosDasEscalas(pool);
    context.log(`[MENORES] retirada automática: ${retiradaMenores.retirados} pessoa(s), ${retiradaMenores.alocacoes} escala(s) desmarcada(s).`);
  } catch (e) {
    context.log.error("[MENORES] falha na retirada automática da escala:", e.message);
    retiradaFalhou = true;
  }
  const { criadas, emailsEnviados, falhas = [] } = await avaliarRegras(pool);
  if (falhas.length) context.log.error(`[NOTIFICACOES] detector(es) que falharam: ${falhas.join(", ")}`);
  context.log(`[NOTIFICACOES] rodada agendada: ${criadas} notificação(ões) nova(s), ${emailsEnviados} e-mail(s) enviado(s).`);
  // v7.5 — retenção LGPD do voluntariado: o IP do aceite digital é anonimizado 5 anos depois do último serviço. Fail-soft: uma falha aqui não derruba a rodada de avisos.
  let retencaoVoluntariado = null;
  try {
    retencaoVoluntariado = await anonimizarIpsVencidos(pool);
    context.log(`[VOLUNTARIADO] retenção LGPD: ${retencaoVoluntariado.anonimizados} IP(s) de aceite anonimizado(s) (prazo ${retencaoVoluntariado.retencaoDias} dias).`);
  } catch (e) {
    context.log.error("[VOLUNTARIADO] falha na retenção LGPD:", e.message);
  }
  // v7.6 — o mesmo para o Termo de Adesão dos Setores Técnicos: o IP do aceite digital é anonimizado 5 anos depois que o vínculo termina. Fail-soft também.
  let retencaoSetores = null;
  try {
    retencaoSetores = await setoresTecnicosDb.anonimizarIpsVencidos(pool);
    context.log(`[SETORES] retenção LGPD: ${retencaoSetores.anonimizados} IP(s) de aceite anonimizado(s) (prazo ${retencaoSetores.retencaoDias} dias).`);
  } catch (e) {
    context.log.error("[SETORES] falha na retenção LGPD:", e.message);
  }
  // v7.7 — o IP do aceite da política de comunicação com menores, pela mesma regra de retenção. Fail-soft.
  let retencaoMenores = null;
  try {
    retencaoMenores = await mmDb.anonimizarIpsVencidos(pool);
    context.log(`[MENORES] retenção LGPD: ${retencaoMenores.anonimizados} IP(s) de aceite anonimizado(s) (prazo ${retencaoMenores.retencaoDias} dias).`);
  } catch (e) {
    context.log.error("[MENORES] falha na retenção LGPD:", e.message);
  }
  // v7.7 — o IP do consentimento do responsável (imagem e saúde de menor), pela mesma regra. Fail-soft.
  let retencaoConsentimentos = null;
  try {
    retencaoConsentimentos = await menoresConsentimentoDb.anonimizarIpsVencidos(pool);
    // a foto de menor sem a autorização do responsável vigente não fica guardada (a revogação, a saída do responsável e a foto enviada antes da v7.7 caem aqui)
    retencaoConsentimentos.fotosApagadas = (await menoresConsentimentoDb.apagarFotosDeMenoresSemConsentimento(pool)).apagadas;
    context.log(`[MENORES] retenção LGPD dos consentimentos: ${retencaoConsentimentos.anonimizados} IP(s) anonimizado(s) (prazo ${retencaoConsentimentos.retencaoDias} dias).`);
  } catch (e) {
    context.log.error("[MENORES] falha na retenção LGPD dos consentimentos:", e.message);
  }
  // A rotina é fail-soft de propósito (uma falha não derruba as outras), mas a retirada que protege criança e os detectores do ministério com menores NÃO podem falhar em silêncio:
  // aí a resposta é 500, o job do GitHub fica vermelho e o aviso de "rotina falhou" sai. (Tudo o mais já rodou: a resposta vem no fim.)
  const falhaMenores = retiradaFalhou || falhas.some((k) => String(k).startsWith("MENORES_"));
  context.res = {
    status: falhaMenores ? 500 : 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: !falhaMenores, criadas, emailsEnviados, retencaoVoluntariado, retencaoSetores, retencaoMenores, retencaoConsentimentos, retiradaMenores, retiradaFalhou, detectoresComFalha: falhas },
  };
};
