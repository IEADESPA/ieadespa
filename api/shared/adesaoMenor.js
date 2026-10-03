// shared/adesaoMenor.js (fecho dos itens em aberto, 03/10/2026)
// "Revogar o cadastro do responsável não anula a adesão já dada" estava em aberto. Regra agora: a adesão dada pelo responsável CADASTRADO (CLICK_RESP)
// continua gravada e imutável — é prova —, mas só VALE enquanto o menor tiver ao menos um responsável ATIVO (e enquanto for menor). Se depois do aceite houve
// um instante sem nenhum responsável ativo (o último foi revogado), ela fica SUSPENSA em todos os cálculos — cobertura, aviso de termo pendente, Lista de Ouro,
// habilitação e escala — até uma NOVA adesão dada por um responsável ativo. Tudo calculado na LEITURA: nada é apagado nem reescrito.
// E na escala: menor (idade conhecida, < 18) sem adesão que valha — nunca dada, ou suspensa — não entra na sugestão, não recebe convite e não aceita nem confirma
// escala (shared/escalas.js, GestaoEscalas, shared/voluntariadoDb.js::gerarRodizio). As escalas futuras já marcadas não somem: ficam sinalizadas para a
// Secretaria (voluntariadoDb.coberturaDoTermo, revogarResponsavel).
const { sql } = require("./db");
const vol = require("./voluntariado");
const { hojeBrasilia } = require("./dataBrasilia");

// Trecho de SQL, para o alias `a` de VoluntariadoAdesoes: verdadeiro se a adesão é CLICK_RESP e, DEPOIS do aceite, um responsável foi revogado num instante
// em que não havia outro ativo (cadastrado até ali e não revogado antes dali). Cadastrar outro responsável depois não a restabelece: só uma nova adesão.
const ADESAO_SUSPENSA_SQL = (a) => `(${a}.Forma = 'CLICK_RESP' AND EXISTS (
        SELECT 1 FROM VoluntariadoResponsaveis rv WHERE rv.MenorMembroId = ${a}.MembroId AND rv.RevogadoEm IS NOT NULL AND rv.RevogadoEm >= ${a}.AceitoEm
          AND NOT EXISTS (SELECT 1 FROM VoluntariadoResponsaveis rc WHERE rc.MenorMembroId = ${a}.MembroId AND rc.RegistradoEm <= rv.RevogadoEm
                            AND (rc.RevogadoEm IS NULL OR rc.RevogadoEm > rv.RevogadoEm))))`;

const MOTIVO_SEM_ADESAO = "Menor de 18 anos sem adesão ao Termo de Voluntariado: só serve com a autorização do responsável (Meu Painel do responsável, ou a ficha assinada).";

// Dos `membroIds`, os que são menores (idade conhecida, < 18) SEM adesão que valha. Map membroId -> motivo. Quem tem 18 ou mais, ou não tem data de
// nascimento no cadastro, nunca é barrado aqui (idade desconhecida não se presume — a mesma regra do aceite).
async function menoresSemAdesaoVigente(pool, membroIds, { hoje = hojeBrasilia(), criarRequest = null } = {}) {
  const ids = [...new Set((membroIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  const bloqueados = new Map();
  if (!ids.length) return bloqueados;
  for (let i = 0; i < ids.length; i += 500) {
    const lote = ids.slice(i, i + 500);
    const rq = (criarRequest ? criarRequest() : pool.request()).input("hoje", sql.Date, hoje);
    const lista = lote.map((v, j) => { rq.input(`m${j}`, sql.Int, v); return `@m${j}`; }).join(", ");
    const r = await rq.query(`
      SELECT m.MembroId, m.DataNascimento, a.AdesaoId, a.ResponsavelNome,
             CASE WHEN a.AdesaoId IS NOT NULL AND ${ADESAO_SUSPENSA_SQL("a")} THEN 1 ELSE 0 END AS SuspensaSemResponsavel
      FROM MembroReferencia m
      LEFT JOIN VoluntariadoAdesoes a ON a.AdesaoId = (SELECT MAX(x.AdesaoId) FROM VoluntariadoAdesoes x WHERE x.MembroId = m.MembroId)
      WHERE m.MembroId IN (${lista}) AND m.DataNascimento IS NOT NULL AND m.DataNascimento > DATEADD(YEAR, -${vol.MAIORIDADE}, @hoje)`);
    for (const x of r.recordset) {
      const idade = vol.idadeEmAnos(x.DataNascimento, hoje);
      if (idade == null || idade >= vol.MAIORIDADE) continue;
      const adesao = x.AdesaoId != null ? { responsavelNome: x.ResponsavelNome, suspensaSemResponsavel: !!x.SuspensaSemResponsavel } : null;
      if (vol.adesaoVigente(adesao, idade)) continue;
      bloqueados.set(Number(x.MembroId), adesao && vol.adesaoSuspensa(adesao) ? vol.MENSAGEM_ADESAO_SUSPENSA : MOTIVO_SEM_ADESAO);
    }
  }
  return bloqueados;
}

module.exports = { ADESAO_SUSPENSA_SQL, MOTIVO_SEM_ADESAO, menoresSemAdesaoVigente };
