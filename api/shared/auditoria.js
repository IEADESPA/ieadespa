// shared/auditoria.js
// Módulo interno reaproveitado por outras Functions (GestaoLideranca, EvoluirConsagracao, etc.)
// Grava na tabela AuditLog do Azure SQL (não deixa a falha de auditoria derrubar a operação).
// v4.12 — trilha inviolável: cada registro recebe um HashRegistro (SHA-256)
// calculado sobre os dados do próprio registro + o hash do registro anterior
// da MESMA tabela (cadeia). A ancoragem externa fica em GestaoAuditoria.

const crypto = require("crypto");
const { getPool, sql } = require("./db");

function sha256(texto) {
  return crypto.createHash("sha256").update(texto, "utf8").digest("hex");
}

// Trava 7-B (20/10/2026): antes, ler o topo da cadeia e gravar eram dois comandos soltos — duas gravações da mesma tabela ao mesmo tempo liam o MESMO hash anterior e a cadeia
// bifurcava (a verificação de /api/auditoria/cadeia acusava quebra sem ter havido adulteração). Agora é uma transação curta com o topo lido sob UPDLOCK, HOLDLOCK, exatamente como
// registrarAuditoriaNaTransacao: as gravações da mesma tabela fazem fila. Uma tentativa a mais se o banco escolher esta transação como vítima de impasse (erro 1205).
// A falha de auditoria continua não derrubando a operação.
async function registrarAuditoria(registro) {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let transacao = null;
    try {
      const pool = await getPool();
      transacao = new sql.Transaction(pool);
      await transacao.begin();
      await registrarAuditoriaNaTransacao(transacao, registro);
      await transacao.commit();
      return true;
    } catch (e) {
      if (transacao) { try { await transacao.rollback(); } catch { } }
      if (tentativa === 1 && e && (e.number === 1205 || (e.originalError && e.originalError.info && e.originalError.info.number === 1205))) continue;
      console.error("[AUDITORIA] falha ao gravar:", e.message);
      return true;
    }
  }
  return true;
}

// Variante DENTRO de uma transação (sql.Transaction), para o ato e a trilha entrarem ou saírem juntos (ex.: a homologação do abandono). Ao contrário de
// registrarAuditoria, aqui a falha PROPAGA — quem chama desfaz a transação inteira. O topo da cadeia é lido com UPDLOCK, HOLDLOCK: outra gravação da mesma tabela
// espera esta terminar e nunca calcula o mesmo hash anterior. Mesmo payload e mesmo hash de registrarAuditoria (a verificação da cadeia não distingue as duas).
async function registrarAuditoriaNaTransacao(transacao, { tabela, registroId, acao, usuarioId, dadosAntes, dadosDepois }) {
  const rq = () => new sql.Request(transacao);
  const anterior = await rq().input("tabela", sql.NVarChar(50), tabela)
    .query(`SELECT TOP 1 HashRegistro FROM AuditLog WITH (UPDLOCK, HOLDLOCK) WHERE Tabela = @tabela ORDER BY AuditId DESC`);
  const hashAnterior = anterior.recordset[0] ? (anterior.recordset[0].HashRegistro || "") : "";
  const registroIdNorm = registroId != null ? registroId : null;
  const dadosAntesStr = dadosAntes ? JSON.stringify(dadosAntes) : null;
  const dadosDepoisStr = dadosDepois ? JSON.stringify(dadosDepois) : null;
  const payload = JSON.stringify({ tabela, registroId: registroIdNorm, acao, usuarioId: usuarioId || null, dadosAntes: dadosAntesStr, dadosDepois: dadosDepoisStr });
  await rq()
    .input("tabela", sql.NVarChar(50), tabela).input("registroId", sql.Int, registroIdNorm).input("acao", sql.NVarChar(100), acao)
    .input("usuarioId", sql.Int, usuarioId || null).input("dadosAntes", sql.NVarChar(sql.MAX), dadosAntesStr).input("dadosDepois", sql.NVarChar(sql.MAX), dadosDepoisStr)
    .input("hashRegistro", sql.NVarChar(64), sha256(payload + hashAnterior))
    .query(`INSERT INTO AuditLog (Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois, HashRegistro)
            VALUES (@tabela, @registroId, @acao, @usuarioId, @dadosAntes, @dadosDepois, @hashRegistro)`);
}

// FASE 10 (21/11/2026, a importação dos membros): MUITOS registros da MESMA tabela numa transação, com a mesma cadeia de hashes de registrarAuditoriaNaTransacao
// (o mesmo payload, o mesmo SHA-256 sobre o anterior), em dois comandos: o topo lido uma vez sob UPDLOCK, HOLDLOCK e a gravação de todos de uma vez, na ordem
// da lista (o INSERT ... SELECT com ORDER BY dá os AuditId nessa ordem: a verificação da cadeia, que segue o AuditId, confere). Um lote de 500 fichas
// importadas grava em milissegundos e segura a fila da trilha só esse tempo (registro a registro seriam 1.000 idas ao banco com a fila presa).
// registros: [{ registroId, acao, usuarioId, dadosAntes, dadosDepois }].
async function registrarAuditoriaEmLoteNaTransacao(transacao, tabela, registros) {
  if (!Array.isArray(registros) || !registros.length) return;
  const rq = () => new sql.Request(transacao);
  const anterior = await rq().input("tabela", sql.NVarChar(50), tabela)
    .query(`SELECT TOP 1 HashRegistro FROM AuditLog WITH (UPDLOCK, HOLDLOCK) WHERE Tabela = @tabela ORDER BY AuditId DESC`);
  let hash = anterior.recordset[0] ? (anterior.recordset[0].HashRegistro || "") : "";
  const linhas = registros.map(({ registroId, acao, usuarioId, dadosAntes, dadosDepois }, i) => {
    const registroIdNorm = registroId != null ? registroId : null;
    const dadosAntesStr = dadosAntes ? JSON.stringify(dadosAntes) : null;
    const dadosDepoisStr = dadosDepois ? JSON.stringify(dadosDepois) : null;
    const payload = JSON.stringify({ tabela, registroId: registroIdNorm, acao, usuarioId: usuarioId || null, dadosAntes: dadosAntesStr, dadosDepois: dadosDepoisStr });
    hash = sha256(payload + hash);
    return { o: i, r: registroIdNorm, a: acao, u: usuarioId || null, da: dadosAntesStr, dd: dadosDepoisStr, h: hash };
  });
  await rq().input("tabela", sql.NVarChar(50), tabela).input("j", sql.NVarChar(sql.MAX), JSON.stringify(linhas))
    .query(`INSERT INTO AuditLog (Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois, HashRegistro)
            SELECT @tabela, j.r, j.a, j.u, j.da, j.dd, j.h
            FROM OPENJSON(@j) WITH (o INT '$.o', r INT '$.r', a NVARCHAR(100) '$.a', u INT '$.u', da NVARCHAR(MAX) '$.da', dd NVARCHAR(MAX) '$.dd', h NVARCHAR(64) '$.h') j
            ORDER BY j.o`);
}

module.exports = { registrarAuditoria, registrarAuditoriaNaTransacao, registrarAuditoriaEmLoteNaTransacao, sha256 };
