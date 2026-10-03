// shared/abandonoDigital.js
// Elegibilidade de Abandono Eclesiástico Digital (Estatuto Art. 11, V e Art. 12 §2º):
// precisa de pelo menos 2 tentativas de contato por canais distintos, e os 90 dias
// contam a partir da 1ª tentativa registrada. Depende de banco (histórico de
// tentativas), por isso não é uma função pura em estatuto.js — mesmo espírito de
// shared/disciplina.js/shared/vacancia.js.
const estatuto = require("./estatuto");
const { hojeBrasilia } = require("./dataBrasilia");

// Auditoria de escopo (02/10/2026): a data da tentativa era livre — duas tentativas "de 100 dias atrás" em canais diferentes fabricavam o prazo de 90 dias do Estatuto
// (Art. 12 §2º) e o procedimento nascia com a defesa de 15 dias já vencida. Agora só vale o dia do registro ou até JANELA_DIAS_TENTATIVA dias para trás (o lançamento
// atrasado de um contato que de fato aconteceu); data futura nunca vale.
const JANELA_DIAS_TENTATIVA = 7;

// "AAAA-MM-DD" que existe no calendário (2026-02-31 não existe).
function dataIsoValida(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Resolve a data informada para a tentativa. { data: null } = usar o dia do servidor; { data } = data aceita; { erro } = recusar com a mensagem.
function resolverDataTentativa(informada, hoje = hojeBrasilia()) {
  if (informada === undefined || informada === null || informada === "") return { data: null };
  if (!dataIsoValida(informada)) return { erro: "Data da tentativa inválida. Use o formato AAAA-MM-DD." };
  if (informada > hoje) return { erro: "A data da tentativa não pode ser futura." };
  if (informada < somarDias(hoje, -JANELA_DIAS_TENTATIVA)) {
    return { erro: `A tentativa só pode ser registrada com a data de hoje ou dos últimos ${JANELA_DIAS_TENTATIVA} dias.` };
  }
  return { data: informada };
}

async function elegibilidadeAbandonoDigital(pool, sql, membroId) {
  const result = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT MIN(DataTentativa) AS Primeira, MAX(DataTentativa) AS Ultima, COUNT(DISTINCT CanalId) AS CanaisDistintos
    FROM TentativasContatoAbandono WHERE MembroId = @id`);
  // 03/10/2026: o driver devolve a coluna DATE como objeto Date, e estatuto.diasDesde só entende "AAAA-MM-DD" (com o Date dava null: o Abandono Digital
  // NUNCA ficava elegível — medido no SQL Server de verdade). Vira texto antes.
  const isoDe = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const r0 = result.recordset[0];
  const Primeira = isoDe(r0.Primeira), Ultima = isoDe(r0.Ultima), CanaisDistintos = r0.CanaisDistintos;
  const diasDesdePrimeira = Primeira ? estatuto.diasDesde(Primeira) : null;
  const elegivel =
    CanaisDistintos >= estatuto.MIN_TENTATIVAS_CONTATO_DIGITAL &&
    diasDesdePrimeira !== null &&
    diasDesdePrimeira >= estatuto.DIAS_ABANDONO_DIGITAL;

  return { elegivel, canaisDistintos: CanaisDistintos, diasDesdePrimeira, ultimaTentativa: Ultima };
}

// Fecho dos itens em aberto (03/10/2026) — de onde conta o prazo de defesa de 15 dias (Estatuto Art. 11 §3º, II: "contados da notificação ou da publicação do
// edital"; Art. 12 §2º: a notificação final do Digital "reabra prazo de 15 dias"). Leitura que PROTEGE o membro: conta do ÚLTIMO destes marcos — a data da
// notificação gravada, o dia em que o procedimento foi de fato aberto (registro da notificação formal, no calendário de Brasília) e a publicação do edital,
// se houver. Assim nenhum procedimento nasce com a defesa já vencida, nem os antigos do Digital que herdaram a data da última tentativa de contato.
// Datas em "AAAA-MM-DD" (ou Date); as ausentes são ignoradas.
function inicioPrazoDefesa({ dataNotificacao, abertoEmBrasilia = null, dataEdital = null }) {
  const iso = (v) => (v == null || v === "" ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  return [iso(dataNotificacao), iso(abertoEmBrasilia), iso(dataEdital)].filter(dataIsoValida).sort().pop() || null;
}

// Quantos dias ainda faltam (0 = venceu). `hoje` no calendário de Brasília.
function situacaoPrazoDefesa({ dataNotificacao, abertoEmBrasilia, dataEdital, prazoDias }, hoje = hojeBrasilia()) {
  const inicio = inicioPrazoDefesa({ dataNotificacao, abertoEmBrasilia, dataEdital });
  const dias = inicio ? estatuto.diasDesde(inicio, hoje) : null;
  const vencido = dias !== null && dias >= Number(prazoDias);
  return { inicioPrazo: inicio, diasCorridos: dias, vencido, venceEm: inicio ? somarDias(inicio, Number(prazoDias)) : null };
}

// Regra dos dois olhos: quem abriu o procedimento não homologa. Para a recusa dizer QUEM pode, a lista de quem tem hoje a homologação (nível geral = papel
// Global E escopo Global, permissão "disciplina", cadastro ativo), sem quem abriu. Só nomes (a tela é de quem já tem "disciplina" no nível geral).
async function quemPodeHomologar(pool, sql, { excetoMembroId }) {
  const r = await pool.request().input("exceto", sql.Int, excetoMembroId).query(`
    SELECT DISTINCT m.MembroId, m.Nome
    FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE p.Nivel = 'GLOBAL' AND l.EscopoTipo = 'GLOBAL' AND (',' + ISNULL(p.Permissoes, '') + ',') LIKE '%,disciplina,%'
      AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE)) AND l.MembroId <> @exceto
    ORDER BY m.Nome`);
  return r.recordset.map(x => ({ membroId: x.MembroId, nome: x.Nome }));
}

function mensagemDoisOlhos(outros) {
  const base = "Quem abriu o procedimento não pode homologá-lo (regra dos dois olhos: a perda de membresia é conferida por outra pessoa).";
  if (!outros.length) return `${base} Hoje ninguém mais tem a homologação (nível geral com a permissão 'disciplina'): peça à administração para conceder a outra pessoa, como o Presidente ou o Secretário Geral.`;
  return `${base} Pode homologar: ${outros.slice(0, 8).map(o => o.nome).join(", ")}${outros.length > 8 ? " e outros" : ""}.`;
}

module.exports = { elegibilidadeAbandonoDigital, resolverDataTentativa, dataIsoValida, JANELA_DIAS_TENTATIVA, inicioPrazoDefesa, situacaoPrazoDefesa, quemPodeHomologar, mensagemDoisOlhos, somarDias };
