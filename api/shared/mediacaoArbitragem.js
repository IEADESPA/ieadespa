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

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Aceite do acordo e do compromisso arbitral — SÓ por ato da parte (fecho dos itens em aberto, 03/10/2026; migração 132)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Antes estas duas funções eram chamadas pela rota do mediador para CADA parte, gravando um aceite que a parte nunca deu. Agora só a rota da própria parte
// (sessão dela) as chama, com o texto que ela leu; o registro presencial (papel assinado) vai para AceitesMediacao com o anexo, sem TermosAssinados.
// O `pool` pode ser um pool de verdade ou { request } de uma transação.
const VERSAO_ACORDO_MEDIACAO = "2026-2";
const VERSAO_COMPROMISSO_ARBITRAL = "2026-2";

// O texto que a parte lê e aceita. Amarra o número do caso e o assunto ao conteúdo: o mesmo resumo em outro caso dá outro hash.
function textoAcordo({ mediacaoId, assunto, resumoAcordo }) {
  return `Termo de Acordo de Mediação nº ${mediacaoId} (Regimento Art. 161-A; Lei 13.140/2015, art. 20). Assunto: ${assunto}. As partes, de livre vontade, ` +
    `declaram encerrada a controvérsia nos seguintes termos: ${String(resumoAcordo).trim()}`;
}
function textoCompromisso({ mediacaoId, assunto, arbitroNome }) {
  return `Compromisso arbitral do caso nº ${mediacaoId} (Regimento Art. 161-A; Lei 9.307/1996, arts. 9º e 10). Assunto: ${assunto}. A parte, de livre vontade, ` +
    `submete esta controvérsia sobre direitos patrimoniais disponíveis à arbitragem eclesiástica interna${arbitroNome ? `, com o árbitro ${arbitroNome}` : ""}, ` +
    `e aceita que a sentença arbitral produza entre as partes os efeitos do art. 31 da Lei 9.307/1996.`;
}
const hashTexto = (texto) => sha256(texto);

function registrarAceiteAcordoMediacao(pool, membroId, texto) {
  return registrarTermoGenerico(pool, membroId, "ACORDO_MEDIACAO", VERSAO_ACORDO_MEDIACAO, texto);
}
function registrarCompromissoArbitral(pool, membroId, texto) {
  return registrarTermoGenerico(pool, membroId, "COMPROMISSO_ARBITRAL", VERSAO_COMPROMISSO_ARBITRAL, texto);
}

const INSTRUMENTOS = ["ACORDO", "COMPROMISSO"];
const DECISOES = ["ACEITE", "RECUSA"];
const CANAIS_VALIDOS = ["PROPRIO", "PRESENCIAL_ANEXO"];
const ROTULO_CANAL = {
  PROPRIO: "pela própria parte, com a sessão dela",
  PRESENCIAL_ANEXO: "presencial, com o documento assinado anexado",
  LEGADO_NAO_VERIFICADO: "registrado antes da verificação por ato da parte"
};

// A situação de um instrumento (acordo ou compromisso) a partir das linhas de AceitesMediacao do caso. Vale, para cada parte, a decisão MAIS RECENTE pelos
// canais válidos (própria ou presencial com anexo) sobre o texto proposto AGORA (hash). Linhas LEGADO e decisões sobre um texto anterior não contam.
// Firmado = as duas partes com ACEITE. `aceites`: [{ aceiteMediacaoId, instrumento, parte, decisao, canal, hashTexto, ... }].
function situacaoInstrumento(aceites, { instrumento, hashAtual }) {
  const doInstrumento = (aceites || []).filter(a => a.instrumento === instrumento).sort((x, y) => x.aceiteMediacaoId - y.aceiteMediacaoId);
  const partes = {};
  for (const parte of ["A", "B"]) {
    const validas = doInstrumento.filter(a => a.parte === parte && CANAIS_VALIDOS.includes(a.canal) && hashAtual && a.hashTexto === hashAtual);
    partes[parte] = validas.length ? validas[validas.length - 1] : null;
  }
  return {
    instrumento, hashAtual: hashAtual || null,
    partes,
    legado: doInstrumento.filter(a => a.canal === "LEGADO_NAO_VERIFICADO"),
    firmado: !!hashAtual && ["A", "B"].every(p => partes[p] && partes[p].decisao === "ACEITE"),
    recusadoPor: ["A", "B"].filter(p => partes[p] && partes[p].decisao === "RECUSA")
  };
}

// O documento assinado do registro presencial: só PDF, JPEG ou PNG, e o conteúdo tem de ser do tipo declarado (mesma conferência de AnexosGenericos).
const MIME_ANEXO = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_ANEXO = 15 * 1024 * 1024;
function conferirAnexo(base64, mimeType) {
  if (typeof base64 !== "string" || !base64 || typeof mimeType !== "string" || !MIME_ANEXO.includes(mimeType)) return { erro: "Anexe o documento assinado pela parte (PDF, JPEG ou PNG)." };
  if (base64.length > Math.ceil(TAMANHO_MAXIMO_ANEXO / 3) * 4 + 4) return { erro: "Arquivo maior que 15 MB." };
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_ANEXO) return { erro: "Arquivo vazio ou maior que 15 MB." };
  const ok = mimeType === "application/pdf" ? buffer.subarray(0, 1024).includes("%PDF-")
    : mimeType === "image/png" ? buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (!ok) return { erro: "O conteúdo do arquivo não é do formato informado (PDF, JPEG ou PNG)." };
  return { buffer, hash: require("crypto").createHash("sha256").update(buffer).digest("hex") };
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
  textoAcordo, textoCompromisso, hashTexto, situacaoInstrumento, conferirAnexo,
  INSTRUMENTOS, DECISOES, CANAIS_VALIDOS, ROTULO_CANAL, VERSAO_ACORDO_MEDIACAO, VERSAO_COMPROMISSO_ARBITRAL,
  calcularImpedimento, bifurcarParaProcessoDisciplinar
};
