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
  // v7.11 — cuidado pastoral, também ANTES dos avisos: encerra o item de quem saiu, detecta quem se afastou do próprio costume, sobe a escada dos itens vencidos (os avisos de
  // "subiu para você" saem nesta mesma rodada), apaga as notas de quem saiu há mais de 30 dias (Regimento Art. 132 §2º, II) e aplica a retenção. Cada passo é fail-soft.
  let cuidado = null;
  try {
    cuidado = await require("../shared/cuidadoPastoralDb").rotinaDiaria(pool);
    context.log(`[CUIDADO] rotina: ${JSON.stringify({ ...cuidado, falhas: undefined })}${cuidado.falhas.length ? ` — FALHOU: ${cuidado.falhas.join(", ")}` : ""}`);
  } catch (e) {
    context.log.error("[CUIDADO] falha na rotina diária:", e.message);
    cuidado = { falhas: ["rotina"] };
  }
  // v7.12 — comunicação: a retenção do registro de entrega e uma rodada da fila (a rotina de 15 em 15 minutos faz o resto). Fail-soft.
  let comunicacao = null;
  try {
    comunicacao = await require("../shared/comunicacaoDb").rotinaDiaria(pool);
    if (comunicacao.falhas.length) context.log.error(`[COMUNICACAO] rotina diária — FALHOU: ${comunicacao.falhas.join(", ")}`);
  } catch (e) {
    context.log.error("[COMUNICACAO] falha na rotina diária:", e.message);
    comunicacao = { falhas: ["rotina"] };
  }
  // v7.14 — identidade visual, também ANTES dos avisos: no dia 22/11 a votação do tema abre (com pelo menos 2 finalistas e a triagem completa), passada a meia-noite do
  // dia 30 ela é fechada e apurada (o primeiro acesso de qualquer pessoa faz o mesmo: a etapa é a data, não esta rotina). A retenção dela (que apaga imagens) vai DEPOIS dos
  // avisos, com orçamento de tempo.
  const identidadeDb = require("../shared/identidadeVisualDb");
  let identidade = null;
  try {
    identidade = await identidadeDb.rotinaAntesDosAvisos(pool);
    context.log(`[IDENTIDADE] rotina: ${JSON.stringify({ ...identidade, falhas: undefined })}${identidade.falhas.length ? ` — FALHOU: ${identidade.falhas.join(", ")}` : ""}`);
  } catch (e) {
    context.log.error("[IDENTIDADE] falha na rotina diária:", e.message);
    identidade = { falhas: ["rotina"] };
  }
  // v7.14 — as enquetes com fechamento marcado que passaram da hora (as da identidade visual são do ciclo, acima): passo próprio, separado da identidade.
  let enquetesAgendadas = null;
  try { enquetesAgendadas = await require("../shared/enquetes").encerrarVencidas(pool); } catch (e) { context.log.error("[ENQUETES] encerramento agendado:", e.message); enquetesAgendadas = { falhas: ["encerramento"] }; }
  // v7.15 — segurança da congregação: quem deixou a congregação, foi desligado ou chegou ao "até" sai da equipe de segurança; a retenção apaga o contato do jornalista e o nome
  // de quem saiu da equipe há mais de 5 anos. ANTES dos avisos (os avisos da segurança já enxergam a equipe limpa). Fail-soft.
  let criseSeguranca = null;
  try {
    criseSeguranca = await require("../shared/criseSegurancaDb").rotinaDiaria(pool);
    if (criseSeguranca.falhas.length) context.log.error(`[SEGURANCA] rotina diária — FALHOU: ${criseSeguranca.falhas.join(", ")}`);
  } catch (e) {
    context.log.error("[SEGURANCA] falha na rotina diária:", e.message);
    criseSeguranca = { falhas: ["rotina"] };
  }
  // Trava 7-C: as retenções e o apagamento da saúde sem consentimento rodam ANTES dos avisos — o motor manda e-mail e, num dia de muitos avisos, a rodada podia passar do
  // tempo da função antes de chegar aqui (o dado vencido ficava mais um dia).
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
  // v7.10 — check-in infantil: o dado de saúde de quem perdeu o consentimento sai, o telefone de visitante e a saúde do balcão saem no prazo curto e, no prazo de guarda, o
  // registro é anonimizado. Fail-soft como as outras retenções (a próxima rodada repete); o que protege criança de verdade — a retirada e os avisos — não depende disto.
  let retencaoCheckin = null;
  try {
    const checkinDb = require("../shared/checkinInfantilDb");
    const saude = await checkinDb.apagarSaudeSemConsentimento(pool);
    retencaoCheckin = { saudeApagada: saude.apagadas, ...(await checkinDb.aplicarRetencao(pool)) };
    context.log(`[CHECKIN] retenção LGPD: ${retencaoCheckin.saudeApagada} saúde(s) sem consentimento apagada(s), ${retencaoCheckin.contatosApagados} contato(s) de visitante apagado(s), ${retencaoCheckin.anonimizados} registro(s) anonimizado(s).`);
  } catch (e) {
    context.log.error("[CHECKIN] falha na retenção LGPD:", e.message);
  }
  // Trava 7-C — as retenções que estavam só "anotadas" desde a v7.2, v7.3 e v7.4 (prazo padrão ajustável em Proteção de Dados → Políticas de retenção): a justificativa de
  // ausência na Santa Ceia sai 2 anos depois da Ceia; a ocorrência de canal encerrada perde a descrição e quem avisou em 5 anos, e o administrador que saiu perde o nome em
  // 5 anos; o contato do convidado externo sai 1 ano depois do último evento dele. Cada uma fail-soft (a próxima rodada repete).
  const retencaoAnotadas = { falhas: [] };
  for (const [chave, modulo] of [["calendario", "../shared/calendarioDb"], ["canais", "../shared/canaisDb"], ["eventos", "../shared/eventosDb"]]) {
    try { retencaoAnotadas[chave] = await require(modulo).aplicarRetencao(pool); } catch (e) { retencaoAnotadas.falhas.push(chave); context.log.error(`[RETENCAO] ${chave}:`, e.message); }
  }
  const { criadas, emailsEnviados, falhas = [] } = await avaliarRegras(pool);
  // v7.14 — depois dos avisos: a retenção da identidade visual (tira o nome, apaga imagens não escolhidas), com orçamento de tempo (o resto fica para amanhã).
  try {
    const depois = await identidadeDb.rotinaDepoisDosAvisos(pool, { orcamentoMs: 15000 });
    identidade = { ...identidade, ...depois, falhas: [...(identidade.falhas || []), ...depois.falhas] };
  } catch (e) {
    context.log.error("[IDENTIDADE] falha na retenção:", e.message);
    identidade = { ...identidade, falhas: [...(identidade.falhas || []), "retencao"] };
  }
  // v7.8 — a marca "há prazo de 24 horas correndo" (que deixa a rotina horária da proteção dormir sem abrir o banco) é regravada todo dia, e os e-mails da proteção que não saíram são reenviados.
  try { await require("../shared/protecaoPendencia").atualizar(pool); await require("../shared/protecaoDb").reenviarEmailsPendentes(pool); } catch (e) { context.log.error("[PROTECAO] marca de pendência / reenvio:", e.message); }
  if (falhas.length) context.log.error(`[NOTIFICACOES] detector(es) que falharam: ${falhas.join(", ")}`);
  context.log(`[NOTIFICACOES] rodada agendada: ${criadas} notificação(ões) nova(s), ${emailsEnviados} e-mail(s) enviado(s).`);
  // A rotina é fail-soft de propósito (uma falha não derruba as outras), mas a retirada que protege criança e os detectores do ministério com menores NÃO podem falhar em silêncio:
  // aí a resposta é 500, o job do GitHub fica vermelho e o aviso de "rotina falhou" sai. (Tudo o mais já rodou: a resposta vem no fim.)
  // (v7.11) O mesmo para o cuidado pastoral: a escada do prazo vencido e a regra dos 30 dias das notas não podem parar sem ninguém saber.
  const falhaMenores = retiradaFalhou || falhas.some((k) => String(k).startsWith("MENORES_") || String(k).startsWith("PROTECAO_") || String(k).startsWith("CHECKIN_") || String(k).startsWith("EBD_PROFESSOR"));
  const falhaCuidado = (cuidado && cuidado.falhas.length > 0) || falhas.some((k) => String(k).startsWith("CUIDADO_"));
  // (v7.14) E a identidade visual: a votação que não fecha (ou não abre) no dia certo não pode parar sem ninguém saber.
  const falhaIdentidade = (identidade && identidade.falhas.length > 0) || falhas.some((k) => String(k).startsWith("IDENTIDADE_")) || !!(enquetesAgendadas && enquetesAgendadas.falhas);
  context.res = {
    status: falhaMenores || falhaCuidado || falhaIdentidade ? 500 : 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: !falhaMenores && !falhaCuidado && !falhaIdentidade, criadas, emailsEnviados, retencaoVoluntariado, retencaoSetores, retencaoMenores, retencaoConsentimentos, retencaoCheckin, retencaoAnotadas, retiradaMenores, retiradaFalhou, cuidado, comunicacao, identidade, enquetesAgendadas, criseSeguranca, detectoresComFalha: falhas },
  };
};
