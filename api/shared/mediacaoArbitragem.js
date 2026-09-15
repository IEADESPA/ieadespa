// shared/mediacaoArbitragem.js (vB.16 — Mediação e Arbitragem Eclesiástica, Reg. Art. 161-A)
// Disputa patrimonial/administrativa ENTRE PARTES (sem réu, sem sanção) —
// via distinta do processo disciplinar (FASE 3), que continua intocada.
// Impedimento de mediador/árbitro é sempre CALCULADO, nunca declarado —
// mesmo princípio de todo o resto do sistema.
const { sql } = require("./db");
const estatuto = require("./estatuto");
const { sha256 } = require("./auditoria");
const { existeParentescoAte2Grau } = require("./parentesco");
const { criarProcessoDisciplinar } = require("./disciplinar");

// Art. 161-A — sistema não fabrica um prazo fixo que o Regimento não
// enuncia aqui (só temos o texto citando "prazo de encerramento com alerta
// calculado, mesmo padrão dos prazos disciplinares"); por isso o prazo é
// PARAMETRIZADO por quem instaura o caso (PrazoDiasEncerramento), e só o
// CÁLCULO do alerta é fixo — mesmo padrão de avaliarPrazoDefesa.
function avaliarPrazoEncerramento(dataInstauracao, prazoDiasEncerramento, hoje) {
  const diasDesdeInstauracao = estatuto.diasDesde(dataInstauracao, hoje);
  const prazoVencido = diasDesdeInstauracao !== null && diasDesdeInstauracao > prazoDiasEncerramento;
  return { diasDesdeInstauracao, prazoVencido };
}

// Cláusula compromissória (Art. 161-A + Lei 9.307 art. 4º §2º — adesão
// precisa ser aceite expresso e datado, nunca presumida). Mesma mecânica
// de hash/trilha de TermosAssinados que shared/batismo.js já usa pro
// aceite do Estatuto — TipoTermo fora do catálogo de shared/termos.js de
// propósito, pra não virar pendência de login de quem não tem nada a ver
// (mesmo motivo documentado lá).
const VERSAO_CLAUSULA_COMPROMISSORIA = "2026-1";
const TEXTO_CLAUSULA_COMPROMISSORIA =
  "Declaro aderir à cláusula compromissória de Mediação e Arbitragem Eclesiástica (Regimento, Art. 161-A): " +
  "conflitos patrimoniais/administrativos envolvendo direitos disponíveis serão submetidos primeiro à Câmara " +
  "de Mediação e, se não houver acordo, à Arbitragem interna, antes de qualquer via judicial, respeitadas as " +
  "matérias de direito indisponível (Lei 9.307/1996, art. 1º e art. 4º §2º).";

async function registrarAceiteClausulaCompromissoria(pool, membroId) {
  const hash = sha256(TEXTO_CLAUSULA_COMPROMISSORIA);
  const inserido = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("tipo", sql.NVarChar(40), "CLAUSULA_COMPROMISSORIA_MEDIACAO")
    .input("versao", sql.NVarChar(20), VERSAO_CLAUSULA_COMPROMISSORIA)
    .input("hash", sql.NVarChar(64), hash)
    .query(`INSERT INTO TermosAssinados (MembroId, TipoTermo, VersaoTermo, HashConteudo)
            OUTPUT INSERTED.TermoAssinadoId VALUES (@membroId, @tipo, @versao, @hash)`);
  return inserido.recordset[0].TermoAssinadoId;
}

async function registrarTermoGenerico(pool, membroId, tipoTermo, versao, texto) {
  const hash = sha256(texto);
  const inserido = await pool.request()
    .input("membroId", sql.Int, membroId).input("tipo", sql.NVarChar(40), tipoTermo)
    .input("versao", sql.NVarChar(20), versao).input("hash", sql.NVarChar(64), hash)
    .query(`INSERT INTO TermosAssinados (MembroId, TipoTermo, VersaoTermo, HashConteudo)
            OUTPUT INSERTED.TermoAssinadoId VALUES (@membroId, @tipo, @versao, @hash)`);
  return inserido.recordset[0].TermoAssinadoId;
}

const VERSAO_ACORDO_MEDIACAO = "2026-1";
function registrarAceiteAcordoMediacao(pool, membroId, resumoAcordo) {
  return registrarTermoGenerico(pool, membroId, "ACORDO_MEDIACAO", VERSAO_ACORDO_MEDIACAO, `Termo de Acordo de Mediação: ${resumoAcordo}`);
}

const VERSAO_COMPROMISSO_ARBITRAL = "2026-1";
function registrarCompromissoArbitral(pool, membroId, assunto) {
  return registrarTermoGenerico(pool, membroId, "COMPROMISSO_ARBITRAL", VERSAO_COMPROMISSO_ARBITRAL,
    `Compromisso arbitral (Art. 161-A, Lei 9.307/1996): ${assunto}`);
}

// Impedimento do mediador/árbitro (Art. 161-A, item 1): parentesco até 2º
// grau com as partes, vínculo com a congregação envolvida, ou participação
// prévia (em OUTRO caso) com qualquer uma das mesmas partes.
async function calcularImpedimento(pool, candidatoMembroId, mediacao) {
  const idCandidato = Number(candidatoMembroId);
  const idsPartes = new Set([mediacao.parteAId, mediacao.parteBId].filter((id) => id != null).map(Number));

  if (idsPartes.has(idCandidato)) {
    return { impedido: true, motivo: "O candidato é uma das próprias partes do caso." };
  }

  const parentesco = await existeParentescoAte2Grau(pool, sql, idCandidato, idsPartes);
  if (parentesco.encontrado) {
    return { impedido: true, motivo: `Parentesco até 2º grau com uma das partes (matrícula ${parentesco.comMembroId}).` };
  }

  if (idsPartes.size > 0) {
    const congregacoes = await pool.request().query(`
      SELECT MembroId AS membroId, CongregacaoId AS congregacaoId FROM MembroReferencia
      WHERE MembroId IN (${Array.from(idsPartes).map(Number).filter(Number.isInteger).join(",") || "0"})
    `);
    const candidato = (await pool.request().input("id", sql.Int, idCandidato).query(`SELECT CongregacaoId AS congregacaoId FROM MembroReferencia WHERE MembroId = @id`)).recordset[0];
    if (candidato && candidato.congregacaoId != null && congregacoes.recordset.some((p) => p.congregacaoId === candidato.congregacaoId)) {
      return { impedido: true, motivo: "Vínculo com a mesma congregação de uma das partes." };
    }
  }

  if (idsPartes.size > 0) {
    const idsLista = Array.from(idsPartes).map(Number).filter(Number.isInteger).join(",") || "0";
    const anterior = await pool.request().input("candidato", sql.Int, idCandidato).query(`
      SELECT TOP 1 MediacaoId FROM MediacoesArbitragens
      WHERE (MediadorId = @candidato OR ArbitroId = @candidato)
        AND (ParteAId IN (${idsLista}) OR ParteBId IN (${idsLista}))
    `);
    if (anterior.recordset.length > 0) {
      return { impedido: true, motivo: "Já atuou como mediador/árbitro em outro caso envolvendo uma das mesmas partes." };
    }
  }

  return { impedido: false, motivo: null };
}

// Bifurcação (item 4) — fato apurado durante a mediação que configura
// infração ética abre um Processo Disciplinar SEPARADO, sem interromper a
// via patrimonial. Reaproveita a MESMA ponte que a Ouvidoria v3.7 já usa —
// zero lógica de abertura de processo duplicada.
async function bifurcarParaProcessoDisciplinar(pool, mediacao, dadosProcesso, usuarioId) {
  return criarProcessoDisciplinar(pool, sql, {
    ...dadosProcesso,
    motivo: dadosProcesso.motivo || `Bifurcado da Mediação/Arbitragem nº ${mediacao.mediacaoId} (${mediacao.assunto}).`
  }, usuarioId);
}

module.exports = {
  avaliarPrazoEncerramento,
  TEXTO_CLAUSULA_COMPROMISSORIA, VERSAO_CLAUSULA_COMPROMISSORIA, registrarAceiteClausulaCompromissoria,
  registrarAceiteAcordoMediacao, registrarCompromissoArbitral,
  calcularImpedimento, bifurcarParaProcessoDisciplinar
};
