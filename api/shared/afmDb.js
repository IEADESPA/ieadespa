// shared/afmDb.js (v8.1 — AFM e faltas da CLI)
// O banco da Academia de Formação Ministerial e do comparecimento obrigatório à CLI. A regra pura está em shared/afm.js; o desenho, em docs/plano/fase-8-ministerial-afm.md.
//
// - MATRÍCULA (Regimento Art. 66 §2º): todo oficial é matriculado sozinho (garantirMatriculas). A matrícula atual é a de maior MatriculaId da pessoa; StatusMatricula é
//   mantido junto com a desmatrícula, na mesma transação. Oficial ainda sem linha conta como ATIVO (a linha nasce na próxima rodada).
// - APURAÇÃO (Estatuto Art. 27 §1º; Regimento Art. 69 §2º): só o sistema exclui da CLI e desmatricula por faltas, sempre a partir das presenças (nunca à mão), e só ele anula
//   quando uma das faltas é justificada depois. Roda sob uma trava única (sp_getapplock "afm_apuracao"): duas reuniões encerradas ao mesmo tempo não gravam a mesma exclusão
//   duas vezes (o índice único das vigentes é a segunda barreira). Chamada ao encerrar a reunião, ao justificar ou corrigir uma presença, e na rotina diária (rede de segurança).
// - O que conta: reunião da CLI ENCERRADA com ContaFaltasCLI = 1 em que a pessoa era esperada pela CLI (EsperadoCLI = 1); para a AFM, a Sessão Magna (TipoSessao 'MAGNA_AFM')
//   em que ela era esperada pela Academia (EsperadoAFM = 1). Depois de uma readmissão (CLI) ou rematrícula (AFM), só contam as reuniões a partir dali.
const { sql } = require("./db");
const afm = require("./afm");
const { obterTrava } = require("./financeiroSeguro");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const escada = require("./escada");
const escadaDb = require("./escadaDb");

const PERMISSAO = "afm";
const OFICIAIS_SQL = afm.CARGOS_OFICIAIS.map((c) => `N'${c}'`).join(", ");
const ORDENACAO_SQL = afm.CARGOS_ORDENACAO_CLI.map((c) => `N'${c}'`).join(", ");
const TRAVA_APURACAO = "afm_apuracao";
const TRAVA_MATRICULAS = "afm_matriculas";
const TRAVA_REITORIA = "afm_reitoria";

const dia = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const NAO_EXISTE = { sucesso: false, naoExiste: true };
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });

async function fecharTransacao(transaction, ok) {
  try { if (ok) await transaction.commit(); else await transaction.rollback(); } catch (e) { /* a transação já pode ter sido encerrada pelo servidor */ }
}

// Executa `fazer(transaction)` dentro de uma transação com a trava de aplicação `recurso`. Sem a trava (espera esgotada), devolve "mudou" — quem chamou tenta de novo.
async function comTrava(pool, recurso, fazer) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    if (!(await obterTrava(() => new sql.Request(transaction), recurso))) { await fecharTransacao(transaction, false); return MUDOU("O sistema está ocupado com outra apuração. Tente de novo."); }
    const r = await fazer(transaction);
    await fecharTransacao(transaction, !(r && r.sucesso === false));
    return r;
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
}

function listaDeIds(ids) {
  if (ids == null) return null;
  return [...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}
// Cláusula "AND <coluna> IN (@id0, @id1, ...)" com os parâmetros já postos no request; lista vazia vira "AND 1 = 0".
function filtroIds(request, coluna, ids, prefixo = "id") {
  if (ids == null) return "";
  if (ids.length === 0) return "AND 1 = 0";
  ids.forEach((id, i) => request.input(`${prefixo}${i}`, sql.Int, id));
  return `AND ${coluna} IN (${ids.map((_, i) => `@${prefixo}${i}`).join(", ")})`;
}

// ============================== MATRÍCULA ==============================

// Matricula todo oficial ATIVO que ainda não tem matrícula (Art. 66 §2º). Idempotente; a trava e o índice único (uma automática por pessoa) impedem a duplicata.
async function garantirMatriculas(pool) {
  const r = await comTrava(pool, TRAVA_MATRICULAS, async (t) => {
    const res = await new sql.Request(t).query(`
      INSERT INTO Matriculas_AFM (MembroId, NivelAtual, StatusMatricula, Origem, DataMatricula)
      SELECT m.MembroId, m.CargoMinisterial, N'ATIVA', N'AUTOMATICA', CAST(SYSUTCDATETIME() AS DATE)
      FROM MembroReferencia m
      WHERE m.Status = N'ATIVO' AND m.CargoMinisterial IN (${OFICIAIS_SQL})
        AND NOT EXISTS (SELECT 1 FROM Matriculas_AFM a WHERE a.MembroId = m.MembroId);
      SELECT @@ROWCOUNT AS n;`);
    return { sucesso: true, criadas: Number((res.recordset[0] || {}).n) || 0 };
  });
  return r.sucesso ? r.criadas : 0;
}

// A matrícula atual de cada pessoa (a de maior id) e a desmatrícula vigente dela, se houver. `requisicao`: () => request (dentro ou fora de transação).
async function matriculasAtuais(requisicao, ids = null) {
  const req = requisicao();
  const filtro = filtroIds(req, "a.MembroId", ids);
  const r = await req.query(`
    SELECT a.MatriculaId, a.MembroId, a.StatusMatricula, a.NivelEscolaridade, a.NivelConcluido, a.Origem,
           CONVERT(varchar(10), a.DataMatricula, 120) AS DataMatricula, CONVERT(varchar(10), a.ReciclagemAprovadaEm, 120) AS ReciclagemAprovadaEm, a.ContagemAposSessaoId,
           d.DesmatriculaId, d.Motivo AS DesmatriculaMotivo, CONVERT(varchar(10), d.DataDesmatricula, 120) AS DataDesmatricula, d.SessoesGatilho, d.Detalhe AS DesmatriculaDetalhe
    FROM Matriculas_AFM a
    LEFT JOIN AFMDesmatriculas d ON d.MatriculaId = a.MatriculaId AND d.AnuladaEm IS NULL
    WHERE a.MatriculaId = (SELECT MAX(a2.MatriculaId) FROM Matriculas_AFM a2 WHERE a2.MembroId = a.MembroId) ${filtro}`);
  const mapa = new Map();
  for (const l of r.recordset) mapa.set(Number(l.MembroId), l);
  return mapa;
}

// Quem a Academia espera numa Sessão Magna: oficial ATIVO cuja matrícula atual está ATIVA (ou que ainda não tem linha — a matrícula é obrigatória e nasce sozinha).
async function universoAFM(pool) {
  const r = await pool.request().query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao, m.SituacaoMembro AS situacaoMembro, m.CargoMinisterial AS cargoMinisterial
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    OUTER APPLY (SELECT TOP 1 a.StatusMatricula FROM Matriculas_AFM a WHERE a.MembroId = m.MembroId ORDER BY a.MatriculaId DESC) mat
    WHERE m.Status = N'ATIVO' AND m.CargoMinisterial IN (${OFICIAIS_SQL}) AND ISNULL(mat.StatusMatricula, N'ATIVA') = N'ATIVA'`);
  return r.recordset;
}

// Obreiros com a matrícula atual INATIVA (Art. 69 §3º: credencial suspensa — quem entra na CLI por Ordenação sai enquanto durar, Estatuto Art. 15 §1º, I).
async function idsInativosAFM(pool) {
  const r = await pool.request().query(`
    SELECT a.MembroId FROM Matriculas_AFM a
    WHERE a.StatusMatricula = N'INATIVA' AND a.MatriculaId = (SELECT MAX(a2.MatriculaId) FROM Matriculas_AFM a2 WHERE a2.MembroId = a.MembroId)`);
  return new Set(r.recordset.map((l) => Number(l.MembroId)));
}

// Quem está excluído da CLI por faltas agora (exclusão vigente: nem readmitida, nem anulada).
async function idsExcluidosCLI(pool) {
  const r = await pool.request().query(`SELECT MembroId FROM CLIExclusoesFaltas WHERE ReadmitidaEm IS NULL AND AnuladaEm IS NULL`);
  return new Set(r.recordset.map((l) => Number(l.MembroId)));
}

// Por onde a pessoa compõe a CLI (todos os caminhos, não só o que a composição exibe): para o retrato da exclusão e as providências do Art. 27 §2º.
async function caminhosNaCLI(pool, membroId) {
  const id = Number(membroId);
  const r = await pool.request().input("id", sql.Int, id).query(`
    SELECT N'ORDENACAO' AS via, NULL AS orgaoSigla, cm.Nome AS cargo
    FROM MembroReferencia m LEFT JOIN CargosMinisteriais cm ON cm.Sigla = m.CargoMinisterial
    WHERE m.MembroId = @id AND m.Status = N'ATIVO' AND m.CargoMinisterial IN (${ORDENACAO_SQL})
    UNION ALL
    SELECT N'ASSENTO', o.Sigla, a.CargoOuFuncao
    FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
    WHERE a.MembroId = @id AND a.DataFim IS NULL
      AND (a.DataTerminoPrevisao IS NULL OR a.DataTerminoPrevisao >= CAST(SYSUTCDATETIME() AS DATE))
      AND o.Sigla IN (N'CLI', N'DIRETORIA_EXECUTIVA', N'CONSELHO_FISCAL', N'CEI')
    UNION ALL
    SELECT N'LIDERANCA', p.Nivel, p.Nome
    FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
    WHERE l.MembroId = @id AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
      AND ((p.Nivel = N'CONGREGACAO' AND l.EscopoTipo = N'CONGREGACAO') OR (p.Nivel = N'DEPARTAMENTO' AND l.EscopoTipo = N'DEPARTAMENTO'))`);
  return r.recordset.map((l) => ({ via: l.via, orgaoSigla: l.via === "LIDERANCA" ? null : l.orgaoSigla, cargo: l.cargo || null }));
}

// ============================== HISTÓRICO ==============================

// As presenças que contam, por pessoa, em ordem. tipo: "CLI" ou "AFM".
// - CLI: reunião da CLI encerrada que conta falta (Ordinária e Sessão Magna; o Seminário de novembro não: Regimento Art. 70 §1º) em que a pessoa era esperada pela CLI;
// - AFM: Sessão Magna ou Seminário encerrados que contam, em que a pessoa era esperada pela Academia.
// Revisão independente (27/10/2026): a reunião que conta mas em que a pessoa NÃO era esperada (fora da CLI, sob disciplina, ainda não oficial) entra como `quebra` — interrompe a
// sequência, para que faltas separadas por um período fora não somem 3. E `pendente` marca o pedido de justificativa esperando a Secretaria.
async function historico(requisicao, tipo, ids = null) {
  const ehAFM = tipo === "AFM";
  const condSessao = ehAFM ? `s.TipoSessao IN (${afm.TIPOS_AFM_SQL})` : "s.TipoSessao <> N'SEMINARIO_AFM'";
  const req = requisicao();
  const filtro = filtroIds(req, "p.MembroId", ids);
  const r = await req.query(`
    SELECT p.MembroId, s.SessaoId, p.Presente, p.FaltaJustificada,
           CASE WHEN p.JustificativaPendente IS NOT NULL OR p.PendenteCodigo IS NOT NULL THEN 1 ELSE 0 END AS Pendente
    FROM Presencas p
    JOIN Sessoes s ON s.SessaoId = p.SessaoId
    JOIN Orgaos o ON o.OrgaoId = s.OrgaoId AND o.Sigla = N'CLI'
    WHERE s.ContaFaltasCLI = 1 AND s.Status = N'ENCERRADA' AND ${condSessao} AND ${ehAFM ? "p.EsperadoAFM = 1" : "p.EsperadoCLI = 1"} ${filtro}`);
  const sessoes = (await requisicao().query(`
    SELECT s.SessaoId, CONVERT(varchar(10), s.DataSessao, 120) AS DataSessao
    FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId AND o.Sigla = N'CLI'
    WHERE s.ContaFaltasCLI = 1 AND s.Status = N'ENCERRADA' AND ${condSessao}
    ORDER BY s.DataSessao, s.SessaoId`)).recordset.map((s) => ({ sessaoId: Number(s.SessaoId), data: s.DataSessao }));
  const daPessoa = new Map();
  for (const l of r.recordset) {
    const id = Number(l.MembroId);
    if (!daPessoa.has(id)) daPessoa.set(id, new Map());
    daPessoa.get(id).set(Number(l.SessaoId), { presente: !!l.Presente, justificada: !!l.FaltaJustificada, pendente: !!l.Pendente });
  }
  const mapa = new Map();
  for (const [id, linhas] of daPessoa) {
    const lista = [];
    let comecou = false;
    for (const s of sessoes) {
      const l = linhas.get(s.sessaoId);
      if (l) comecou = true;
      if (!comecou) continue;                         // antes da primeira reunião em que a pessoa era esperada, nada a contar
      lista.push(l ? { sessaoId: s.sessaoId, data: s.data, ...l } : { sessaoId: s.sessaoId, data: s.data, quebra: true });
    }
    mapa.set(id, lista);
  }
  return mapa;
}

// Depois de uma readmissão (CLI) ou rematrícula (AFM), só contam as reuniões criadas DEPOIS do ato (id maior que o da última reunião existente naquele momento) — pela
// ordem das reuniões, não pela data: no mesmo dia do ato, as reuniões antigas não voltam a contar.
const aPartirDe = (linhas, aposSessaoId) => (aposSessaoId != null ? linhas.filter((h) => h.sessaoId > Number(aposSessaoId)) : linhas);

// O retrato de "por onde a pessoa entrava" sempre como JSON válido dentro da coluna (quem tem muitas lideranças perde as últimas, nunca o formato).
function serializarCaminhos(caminhos) {
  const lista = (Array.isArray(caminhos) ? caminhos : []).slice();
  let texto = JSON.stringify(lista);
  while (texto.length > 4000 && lista.length) { lista.pop(); texto = JSON.stringify(lista); }
  return texto;
}

// ============================== APURAÇÃO ==============================

// Apura as 3 faltas da CLI e da AFM. `membroIds`: só essas pessoas (null = todo mundo). Devolve o que mudou.
// - NASCER: a exclusão/desmatrícula só nasce quando nenhuma das 3 faltas tem pedido de justificativa esperando a Secretaria (Estatuto Art. 27 §1º: "sem justificativa
//   aceitável apresentada") — a recusa do pedido refaz a apuração;
// - ANULAR: o pedido sozinho não desfaz uma exclusão já registrada; a justificativa ACEITA (ou a presença corrigida, ou a reunião marcada "não conta") desfaz;
// - REFAZER: se as faltas da sequência mudaram e ela continua chegando a 3, a exclusão antiga é anulada e uma nova nasce com as reuniões e a data certas (o prazo da AGE
//   corre da data nova).
async function apurar(pool, { membroIds = null } = {}) {
  const ids = listaDeIds(membroIds);
  await garantirMatriculas(pool);
  // Os caminhos de quem PODE ser excluído agora são lidos antes da trava (são várias consultas e não mudam por causa da apuração).
  const preHistCLI = await historico(() => pool.request(), "CLI", ids);
  const candidatos = [...preHistCLI.entries()].filter(([, linhas]) => afm.apurarSequencia(linhas).atingiu).map(([id]) => id);
  const caminhos = new Map();
  for (const id of candidatos) caminhos.set(id, await caminhosNaCLI(pool, id));
  const MOTIVO_ANULA = "Apuração refeita: uma das 3 faltas foi justificada, corrigida ou a reunião deixou de contar — a sequência deixou de existir.";
  const MOTIVO_REFAZ = "Apuração refeita: as faltas da sequência mudaram; o registro foi refeito com as reuniões e a data certas.";

  const r = await comTrava(pool, TRAVA_APURACAO, async (t) => {
    const req = () => new sql.Request(t);
    const out = { sucesso: true, exclusoes: [], anuladasCLI: [], desmatriculas: [], anuladasAFM: [] };

    // ---- CLI ----
    const histCLI = await historico(req, "CLI", ids);
    const exReq = req();
    const exFiltro = filtroIds(exReq, "MembroId", ids);
    const exclusoes = (await exReq.query(`
      SELECT ExclusaoId, MembroId, SessoesGatilho, CONVERT(varchar(10), ReadmitidaEm, 120) AS ReadmitidaEm, ContagemAposSessaoId, AnuladaEm
      FROM CLIExclusoesFaltas WITH (UPDLOCK, HOLDLOCK) WHERE 1 = 1 ${exFiltro}`)).recordset;
    const porMembro = new Map();
    for (const e of exclusoes) {
      const id = Number(e.MembroId);
      if (!porMembro.has(id)) porMembro.set(id, { vigente: null, inicio: null });
      const p = porMembro.get(id);
      if (!e.ReadmitidaEm && !e.AnuladaEm) p.vigente = e;
      if (e.ReadmitidaEm && e.ContagemAposSessaoId != null && (p.inicio == null || Number(e.ContagemAposSessaoId) > p.inicio)) p.inicio = Number(e.ContagemAposSessaoId);
    }
    const inserirExclusao = async (id, gatilho) => {
      const caminho = caminhos.has(id) ? caminhos.get(id) : await caminhosNaCLI(pool, id);
      const ins = await req().input("m", sql.Int, id).input("data", sql.Date, gatilho.data).input("sessoes", sql.NVarChar(60), gatilho.sessoes.join(","))
        .input("como", sql.NVarChar(4000), serializarCaminhos(caminho))
        .query(`INSERT INTO CLIExclusoesFaltas (MembroId, DataExclusao, SessoesGatilho, ComoEntrava) OUTPUT INSERTED.ExclusaoId VALUES (@m, @data, @sessoes, @como)`);
      out.exclusoes.push({ exclusaoId: ins.recordset[0].ExclusaoId, membroId: id, data: gatilho.data });
    };
    const anularExclusao = async (id, exclusaoId, motivo) => {
      await req().input("id", sql.Int, exclusaoId).input("motivo", sql.NVarChar(300), motivo)
        .query(`UPDATE CLIExclusoesFaltas SET AnuladaEm = SYSUTCDATETIME(), MotivoAnulacao = @motivo WHERE ExclusaoId = @id AND AnuladaEm IS NULL AND ReadmitidaEm IS NULL`);
      out.anuladasCLI.push({ exclusaoId, membroId: id });
    };
    for (const id of new Set([...histCLI.keys(), ...porMembro.keys()])) {
      const p = porMembro.get(id) || { vigente: null, inicio: null };
      const linhas = aPartirDe(histCLI.get(id) || [], p.inicio);
      const seq = afm.apurarSequencia(linhas);
      const seqNascer = afm.apurarSequencia(linhas, afm.FALTAS_PARA_PERDA, { pendenteInterrompe: true });
      if (p.vigente && !seq.atingiu) await anularExclusao(id, p.vigente.ExclusaoId, MOTIVO_ANULA);
      else if (p.vigente && seq.gatilho.sessoes.join(",") !== String(p.vigente.SessoesGatilho)) { await anularExclusao(id, p.vigente.ExclusaoId, MOTIVO_REFAZ); await inserirExclusao(id, seq.gatilho); }
      else if (!p.vigente && seqNascer.atingiu) await inserirExclusao(id, seqNascer.gatilho);
    }

    // ---- AFM ----
    const histAFM = await historico(req, "AFM", ids);
    const mats = await matriculasAtuais(req, ids);
    for (const id of new Set([...histAFM.keys(), ...[...mats.values()].filter((m) => m.DesmatriculaMotivo === "FALTAS").map((m) => Number(m.MembroId))])) {
      const mat = mats.get(id);
      if (!mat) continue;            // sem matrícula: não é oficial (a rodada de garantirMatriculas acima já criou a de todo oficial)
      const inicio = mat.Origem === "REMATRICULA" ? mat.ContagemAposSessaoId : null;
      const linhas = aPartirDe(histAFM.get(id) || [], inicio);
      const seq = afm.apurarSequencia(linhas);
      const seqNascer = afm.apurarSequencia(linhas, afm.FALTAS_PARA_PERDA, { pendenteInterrompe: true });
      const porFaltas = mat.DesmatriculaId && mat.DesmatriculaMotivo === "FALTAS";
      const desmatricular = async (gatilho) => {
        const ins = await req().input("mat", sql.Int, mat.MatriculaId).input("m", sql.Int, id).input("data", sql.Date, gatilho.data)
          .input("sessoes", sql.NVarChar(60), gatilho.sessoes.join(","))
          .query(`INSERT INTO AFMDesmatriculas (MatriculaId, MembroId, Motivo, DataDesmatricula, SessoesGatilho) OUTPUT INSERTED.DesmatriculaId VALUES (@mat, @m, N'FALTAS', @data, @sessoes);
                  UPDATE Matriculas_AFM SET StatusMatricula = N'INATIVA' WHERE MatriculaId = @mat;`);
        out.desmatriculas.push({ desmatriculaId: ins.recordset[0].DesmatriculaId, membroId: id, data: gatilho.data });
      };
      const anular = async (motivo) => {
        await req().input("id", sql.Int, mat.DesmatriculaId).input("mat", sql.Int, mat.MatriculaId).input("motivo", sql.NVarChar(300), motivo)
          .query(`UPDATE AFMDesmatriculas SET AnuladaEm = SYSUTCDATETIME(), MotivoAnulacao = @motivo WHERE DesmatriculaId = @id AND AnuladaEm IS NULL;
                  UPDATE Matriculas_AFM SET StatusMatricula = N'ATIVA' WHERE MatriculaId = @mat;`);
        out.anuladasAFM.push({ desmatriculaId: mat.DesmatriculaId, membroId: id });
      };
      if (porFaltas && !seq.atingiu) await anular(MOTIVO_ANULA);
      else if (porFaltas && seq.gatilho.sessoes.join(",") !== String(mat.SessoesGatilho)) { await anular(MOTIVO_REFAZ); await desmatricular(seq.gatilho); }
      else if (!mat.DesmatriculaId && mat.StatusMatricula === "ATIVA" && seqNascer.atingiu) await desmatricular(seqNascer.gatilho);
    }
    return out;
  });
  if (!r.sucesso) return r;
  for (const e of r.exclusoes) await registrarAuditoria({ tabela: "CLIExclusoesFaltas", registroId: e.exclusaoId, acao: "CLI_EXCLUSAO_FALTAS", usuarioId: null, dadosDepois: e });
  for (const e of r.anuladasCLI) await registrarAuditoria({ tabela: "CLIExclusoesFaltas", registroId: e.exclusaoId, acao: "CLI_EXCLUSAO_ANULADA", usuarioId: null, dadosDepois: e });
  for (const d of r.desmatriculas) await registrarAuditoria({ tabela: "AFMDesmatriculas", registroId: d.desmatriculaId, acao: "AFM_DESMATRICULA_FALTAS", usuarioId: null, dadosDepois: d });
  for (const d of r.anuladasAFM) await registrarAuditoria({ tabela: "AFMDesmatriculas", registroId: d.desmatriculaId, acao: "AFM_DESMATRICULA_ANULADA", usuarioId: null, dadosDepois: d });
  return r;
}

// A reunião da CLI aberta ou encerrada por engano (ou a segunda no mesmo dia) deixa de contar falta: ato do nível geral, com o motivo; a apuração é refeita na hora para
// todos os que estavam nela (pode desfazer exclusões e desmatrículas). Não volta a contar depois (a reunião errada vira registro de presença).
async function marcarNaoConta(pool, { sessaoId, motivo, por }) {
  const s = (await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT s.SessaoId, s.ContaFaltasCLI, s.Status, o.Sigla FROM Sessoes s LEFT JOIN Orgaos o ON o.OrgaoId = s.OrgaoId WHERE s.SessaoId = @id`)).recordset[0];
  if (!s || s.Sigla !== "CLI") return NAO_EXISTE;
  if (!s.ContaFaltasCLI) return { sucesso: false, mensagem: "Esta reunião já não conta falta." };
  const upd = await pool.request().input("id", sql.Int, sessaoId).input("motivo", sql.NVarChar(300), motivo).input("por", sql.Int, por)
    .query(`UPDATE Sessoes SET ContaFaltasCLI = 0, NaoContaMotivo = @motivo, NaoContaPor = @por, NaoContaEm = SYSUTCDATETIME() WHERE SessaoId = @id AND ContaFaltasCLI = 1`);
  if (!upd.rowsAffected[0]) return MUDOU("A reunião mudou enquanto isso. Atualize a tela.");
  await registrarAuditoria({ tabela: "Sessoes", registroId: Number(sessaoId), acao: "CLI_REUNIAO_NAO_CONTA", usuarioId: por, dadosDepois: { motivo } });
  const ids = (await pool.request().input("id", sql.Int, sessaoId).query(`SELECT MembroId FROM Presencas WHERE SessaoId = @id`)).recordset.map((l) => Number(l.MembroId));
  const ap = await apurar(pool, { membroIds: ids });
  return { sucesso: true, mensagem: `A reunião deixou de contar falta.${resumoDaApuracao(ap)}` };
}

// Apura sem derrubar quem chamou (encerrar reunião, justificar): a falha fica no log e a rotina diária repete.
async function apurarSemFalhar(pool, opcoes, log) {
  try { return await apurar(pool, opcoes); } catch (e) { (log || console.error)("[AFM] a apuração das faltas falhou (a rotina diária repete):", e && e.message); return null; }
}

// Frase curta para a mensagem de quem encerrou/justificou.
function resumoDaApuracao(r) {
  if (!r || !r.sucesso) return "";
  const partes = [];
  if (r.exclusoes.length) partes.push(`${r.exclusoes.length} exclusão(ões) da CLI por 3 faltas seguidas`);
  if (r.anuladasCLI.length) partes.push(`${r.anuladasCLI.length} exclusão(ões) anulada(s)`);
  if (r.desmatriculas.length) partes.push(`${r.desmatriculas.length} matrícula(s) da AFM inativada(s)`);
  if (r.anuladasAFM.length) partes.push(`${r.anuladasAFM.length} matrícula(s) reativada(s)`);
  return partes.length ? `\nApuração das faltas: ${partes.join("; ")}.` : "";
}

// ============================== ATOS DA SECRETARIA / AFM ==============================

async function dadosDoMembro(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT m.MembroId, m.Nome, m.Status, m.CargoMinisterial, m.SituacaoMembro, c.Nome AS Congregacao
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`);
  return r.recordset[0] || null;
}

// Nível de escolaridade (Art. 72) na matrícula atual.
async function definirNivel(pool, { membroId, nivel, concluido, por }) {
  if (!Object.prototype.hasOwnProperty.call(afm.NIVEIS, nivel)) return { sucesso: false, mensagem: "Nível inválido: Básico, Médio, Avançado ou Bacharel Livre." };
  if (typeof concluido !== "boolean") return { sucesso: false, mensagem: "Diga se o nível está concluído (sim ou não)." };
  await garantirMatriculas(pool);
  const mat = (await matriculasAtuais(() => pool.request(), [membroId])).get(Number(membroId));
  if (!mat) return NAO_EXISTE;
  const upd = await pool.request().input("id", sql.Int, mat.MatriculaId).input("n", sql.NVarChar(30), nivel).input("c", sql.Bit, concluido)
    .query(`UPDATE a SET NivelEscolaridade = @n, NivelConcluido = @c FROM Matriculas_AFM a
            WHERE a.MatriculaId = @id AND NOT EXISTS (SELECT 1 FROM Matriculas_AFM a2 WHERE a2.MembroId = a.MembroId AND a2.MatriculaId > a.MatriculaId)`);
  if (!upd.rowsAffected[0]) return MUDOU("A matrícula mudou enquanto isso. Atualize a tela.");
  await registrarAuditoria({ tabela: "Matriculas_AFM", registroId: mat.MatriculaId, acao: "AFM_NIVEL", usuarioId: por, dadosAntes: { nivel: mat.NivelEscolaridade, concluido: !!mat.NivelConcluido }, dadosDepois: { nivel, concluido } });
  return { sucesso: true, mensagem: `Nível registrado: ${afm.NIVEIS[nivel].rotulo}${concluido ? " (concluído)" : " (cursando)"}.` };
}

// Reprovação técnica (Art. 66 §2º, II): a matrícula fica inativa.
async function registrarReprovacao(pool, { membroId, data, detalhe, por }) {
  await garantirMatriculas(pool);
  const r = await comTrava(pool, TRAVA_APURACAO, async (t) => {
    const mat = (await matriculasAtuais(() => new sql.Request(t), [membroId])).get(Number(membroId));
    if (!mat) return NAO_EXISTE;
    if (mat.StatusMatricula !== "ATIVA" || mat.DesmatriculaId) return { sucesso: false, mensagem: "A matrícula desta pessoa já está inativa." };
    const ins = await new sql.Request(t).input("mat", sql.Int, mat.MatriculaId).input("m", sql.Int, Number(membroId)).input("data", sql.Date, data)
      .input("detalhe", sql.NVarChar(500), detalhe).input("por", sql.Int, por)
      .query(`INSERT INTO AFMDesmatriculas (MatriculaId, MembroId, Motivo, DataDesmatricula, Detalhe, RegistradoPor) OUTPUT INSERTED.DesmatriculaId VALUES (@mat, @m, N'REPROVACAO', @data, @detalhe, @por);
              UPDATE Matriculas_AFM SET StatusMatricula = N'INATIVA' WHERE MatriculaId = @mat;`);
    return { sucesso: true, desmatriculaId: ins.recordset[0].DesmatriculaId, mensagem: "Reprovação registrada: a matrícula ficou inativa e o obreiro perdeu a licença para oficiar (Regimento, Art. 66 §2º, II)." };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "AFMDesmatriculas", registroId: r.desmatriculaId, acao: "AFM_REPROVACAO", usuarioId: por, dadosDepois: { membroId: Number(membroId), data, detalhe } });
  return r;
}

// Anular uma reprovação registrada por engano (a desmatrícula por faltas não se anula à mão: corrige-se a presença ou a justificativa, e a apuração refaz sozinha).
async function anularReprovacao(pool, { membroId, motivo, por }) {
  const r = await comTrava(pool, TRAVA_APURACAO, async (t) => {
    const mat = (await matriculasAtuais(() => new sql.Request(t), [membroId])).get(Number(membroId));
    if (!mat) return NAO_EXISTE;
    if (!mat.DesmatriculaId || mat.DesmatriculaMotivo !== "REPROVACAO") {
      return { sucesso: false, mensagem: "Só a reprovação registrada à mão se anula aqui. A desmatrícula por faltas se desfaz sozinha quando a falta é justificada ou corrigida." };
    }
    await new sql.Request(t).input("id", sql.Int, mat.DesmatriculaId).input("mat", sql.Int, mat.MatriculaId).input("motivo", sql.NVarChar(300), motivo).input("por", sql.Int, por)
      .query(`UPDATE AFMDesmatriculas SET AnuladaEm = SYSUTCDATETIME(), AnuladaPor = @por, MotivoAnulacao = @motivo WHERE DesmatriculaId = @id AND AnuladaEm IS NULL;
              UPDATE Matriculas_AFM SET StatusMatricula = N'ATIVA' WHERE MatriculaId = @mat;`);
    return { sucesso: true, desmatriculaId: mat.DesmatriculaId, mensagem: "Reprovação anulada: a matrícula voltou a ficar ativa." };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "AFMDesmatriculas", registroId: r.desmatriculaId, acao: "AFM_REPROVACAO_ANULADA", usuarioId: por, dadosDepois: { motivo } });
  return r;
}

// Nova matrícula depois da aprovação na reciclagem (Art. 69 §3º). Só oficial ATIVO; o nível segue o da matrícula anterior.
async function rematricular(pool, { membroId, reciclagemAprovadaEm, observacao, por, agora = new Date() }) {
  const pessoa = await dadosDoMembro(pool, membroId);
  if (!pessoa) return NAO_EXISTE;
  if (pessoa.Status !== "ATIVO" || !afm.CARGOS_OFICIAIS.includes(pessoa.CargoMinisterial)) return { sucesso: false, mensagem: "Só oficial ativo é matriculado na AFM (Regimento, Art. 66 §2º)." };
  const r = await comTrava(pool, TRAVA_APURACAO, async (t) => {
    const mat = (await matriculasAtuais(() => new sql.Request(t), [membroId])).get(Number(membroId));
    if (!mat) return NAO_EXISTE;
    if (mat.StatusMatricula !== "INATIVA") return { sucesso: false, mensagem: "A matrícula desta pessoa está ativa: não há o que regularizar." };
    const v = afm.validarRematricula({ reciclagemAprovadaEm, observacao }, { hojeIso: hojeBrasilia(agora), desmatriculaEm: mat.DataDesmatricula });
    if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
    const ins = await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("cargo", sql.NVarChar(30), pessoa.CargoMinisterial)
      .input("nivel", sql.NVarChar(30), mat.NivelEscolaridade || null).input("conc", sql.Bit, !!mat.NivelConcluido)
      .input("rec", sql.Date, v.data).input("obs", sql.NVarChar(300), v.observacao).input("por", sql.Int, por).input("anterior", sql.Int, mat.MatriculaId)
      .query(`INSERT INTO Matriculas_AFM (MembroId, NivelAtual, StatusMatricula, Origem, DataMatricula, NivelEscolaridade, NivelConcluido, ReciclagemAprovadaEm, Observacao, CriadoPor, ContagemAposSessaoId, CertificadoHabilitacao, CHMEm, CHMPor)
              OUTPUT INSERTED.MatriculaId
              SELECT @m, @cargo, N'ATIVA', N'REMATRICULA', CAST(SYSUTCDATETIME() AS DATE), @nivel, @conc, @rec, @obs, @por, (SELECT ISNULL(MAX(SessaoId), 0) FROM Sessoes),
                     ISNULL(ant.CertificadoHabilitacao, 0), ant.CHMEm, ant.CHMPor   -- o CHM (com a data e quem concedeu) não se perde na rematrícula (a CEI o lê da matrícula atual)
              FROM (SELECT 1 AS x) um LEFT JOIN Matriculas_AFM ant ON ant.MatriculaId = @anterior`);
    return { sucesso: true, matriculaId: ins.recordset[0].MatriculaId, mensagem: "Nova matrícula registrada: o obreiro voltou a ficar ativo, com a licença para oficiar. A contagem de faltas recomeça hoje." };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "Matriculas_AFM", registroId: r.matriculaId, acao: "AFM_REMATRICULA", usuarioId: por, dadosDepois: { membroId: Number(membroId), reciclagemAprovadaEm } });
  return r;
}

// Estatuto Art. 27 §2º — a Secretaria Geral registra que comunicou a exclusão à CLI.
async function comunicarExclusao(pool, { exclusaoId, data, por }) {
  const atual = (await pool.request().input("id", sql.Int, exclusaoId).query(`
    SELECT ExclusaoId, MembroId, CONVERT(varchar(10), DataExclusao, 120) AS DataExclusao, ComunicadaCLIEm, ReadmitidaEm, AnuladaEm FROM CLIExclusoesFaltas WHERE ExclusaoId = @id`)).recordset[0];
  if (!atual) return NAO_EXISTE;
  if (atual.AnuladaEm || atual.ReadmitidaEm) return { sucesso: false, mensagem: "Esta exclusão já não está vigente." };
  if (atual.ComunicadaCLIEm) return { sucesso: false, mensagem: "A comunicação à CLI já foi registrada." };
  if (data < atual.DataExclusao) return { sucesso: false, mensagem: "A comunicação não pode ser antes da exclusão." };
  const upd = await pool.request().input("id", sql.Int, exclusaoId).input("data", sql.Date, data).input("por", sql.Int, por)
    .query(`UPDATE CLIExclusoesFaltas SET ComunicadaCLIEm = @data, ComunicadaPor = @por WHERE ExclusaoId = @id AND ComunicadaCLIEm IS NULL AND ReadmitidaEm IS NULL AND AnuladaEm IS NULL`);
  if (!upd.rowsAffected[0]) return MUDOU("A exclusão mudou enquanto isso. Atualize a tela.");
  await registrarAuditoria({ tabela: "CLIExclusoesFaltas", registroId: Number(exclusaoId), acao: "CLI_EXCLUSAO_COMUNICADA", usuarioId: por, dadosDepois: { data } });
  return { sucesso: true, mensagem: "Comunicação à CLI registrada." };
}

// Regimento Art. 149 §1º — readmissão por novo processo de admissão (a data e o ato). A contagem recomeça a partir dela.
async function readmitir(pool, { exclusaoId, data, ato, por }) {
  const r = await comTrava(pool, TRAVA_APURACAO, async (t) => {
    const atual = (await new sql.Request(t).input("id", sql.Int, exclusaoId).query(`
      SELECT ExclusaoId, MembroId, CONVERT(varchar(10), DataExclusao, 120) AS DataExclusao, ReadmitidaEm, AnuladaEm FROM CLIExclusoesFaltas WITH (UPDLOCK) WHERE ExclusaoId = @id`)).recordset[0];
    if (!atual) return NAO_EXISTE;
    if (atual.AnuladaEm || atual.ReadmitidaEm) return { sucesso: false, mensagem: "Esta exclusão já não está vigente." };
    if (data < atual.DataExclusao) return { sucesso: false, mensagem: "A readmissão não pode ser antes da exclusão." };
    await new sql.Request(t).input("id", sql.Int, exclusaoId).input("data", sql.Date, data).input("ato", sql.NVarChar(300), ato).input("por", sql.Int, por)
      .query(`UPDATE CLIExclusoesFaltas SET ReadmitidaEm = @data, ReadmissaoAto = @ato, ReadmitidaPor = @por, ContagemAposSessaoId = (SELECT ISNULL(MAX(SessaoId), 0) FROM Sessoes)
              WHERE ExclusaoId = @id AND ReadmitidaEm IS NULL AND AnuladaEm IS NULL`);
    return { sucesso: true, membroId: Number(atual.MembroId), mensagem: "Readmissão registrada: a pessoa volta a compor a CLI (se ainda tiver por onde entrar) e a contagem de faltas recomeça." };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "CLIExclusoesFaltas", registroId: Number(exclusaoId), acao: "CLI_READMISSAO", usuarioId: por, dadosDepois: { data, ato } });
  return r;
}

// ============================== REITOR E CORPO DOCENTE ==============================

async function corpoDocente(pool, { incluirEncerrados = false } = {}) {
  const r = await pool.request().query(`
    SELECT d.CorpoDocenteId, d.MembroId, m.Nome, d.Papel, d.Titulacao, CONVERT(varchar(10), d.DataInicio, 120) AS DataInicio,
           CONVERT(varchar(10), d.MandatoAte, 120) AS MandatoAte, CONVERT(varchar(10), d.HomologadoCLIEm, 120) AS HomologadoCLIEm, d.HomologacaoAto,
           CONVERT(varchar(10), d.DataFim, 120) AS DataFim, d.MotivoFim
    FROM AFMCorpoDocente d JOIN MembroReferencia m ON m.MembroId = d.MembroId
    ${incluirEncerrados ? "" : "WHERE d.DataFim IS NULL"}
    ORDER BY CASE d.Papel WHEN N'REITOR' THEN 0 ELSE 1 END, d.DataFim, m.Nome`);
  return r.recordset.map((l) => ({
    corpoDocenteId: l.CorpoDocenteId, membroId: l.MembroId, nome: l.Nome, papel: l.Papel, titulacao: l.Titulacao, dataInicio: l.DataInicio, mandatoAte: l.MandatoAte,
    homologadoCLIEm: l.HomologadoCLIEm, homologacaoAto: l.HomologacaoAto, dataFim: l.DataFim, motivoFim: l.MotivoFim
  }));
}

// O Reitor aberto (não encerrado) e a situação dele hoje.
async function reitorAtual(requisicao, hojeIso) {
  const r = await requisicao().query(`
    SELECT TOP 1 d.CorpoDocenteId, d.MembroId, m.Nome, d.Titulacao, CONVERT(varchar(10), d.DataInicio, 120) AS DataInicio, CONVERT(varchar(10), d.MandatoAte, 120) AS MandatoAte,
           CONVERT(varchar(10), d.HomologadoCLIEm, 120) AS HomologadoCLIEm, d.HomologacaoAto
    FROM AFMCorpoDocente d JOIN MembroReferencia m ON m.MembroId = d.MembroId
    WHERE d.Papel = N'REITOR' AND d.DataFim IS NULL`);
  const l = r.recordset[0];
  if (!l) return { situacao: "VAGA", reitor: null };
  const reitor = { corpoDocenteId: l.CorpoDocenteId, membroId: l.MembroId, nome: l.Nome, titulacao: l.Titulacao, dataInicio: l.DataInicio, mandatoAte: l.MandatoAte, homologadoCLIEm: l.HomologadoCLIEm, homologacaoAto: l.HomologacaoAto };
  return { situacao: afm.situacaoReitor({ mandatoAte: l.MandatoAte, homologadoCLIEm: l.HomologadoCLIEm }, hojeIso), reitor };
}

// Regimento Art. 68 §1º — nomeação pelo Pastor Presidente (registrada pela Secretaria); quem estava na Reitoria sai no mesmo ato. Homologação da CLI pode vir junto ou depois.
async function nomearReitor(pool, { membroId, dataInicio, titulacao, homologadoCLIEm, homologacaoAto, por }) {
  const pessoa = await dadosDoMembro(pool, membroId);
  if (!pessoa) return NAO_EXISTE;
  if (pessoa.Status !== "ATIVO") return { sucesso: false, mensagem: "Só membro ativo pode ser nomeado Reitor." };
  if (homologadoCLIEm && homologadoCLIEm < dataInicio) return { sucesso: false, mensagem: "A homologação da CLI não pode ser antes da nomeação." };
  const r = await comTrava(pool, TRAVA_REITORIA, async (t) => {
    const anterior = (await new sql.Request(t).query(`SELECT CorpoDocenteId, MembroId, CONVERT(varchar(10), DataInicio, 120) AS DataInicio FROM AFMCorpoDocente WITH (UPDLOCK, HOLDLOCK) WHERE Papel = N'REITOR' AND DataFim IS NULL`)).recordset[0];
    if (anterior && Number(anterior.MembroId) === Number(membroId)) return { sucesso: false, mensagem: "Esta pessoa já é o Reitor. Para um novo ano, use \"Reconduzir\"." };
    if (anterior && dataInicio < anterior.DataInicio) return { sucesso: false, mensagem: "A nova nomeação não pode ser antes da nomeação do Reitor atual." };
    if (anterior) {
      await new sql.Request(t).input("id", sql.Int, anterior.CorpoDocenteId).input("fim", sql.Date, dataInicio)
        .query(`UPDATE AFMCorpoDocente SET DataFim = @fim, MotivoFim = N'Substituído por nova nomeação do Pastor Presidente' WHERE CorpoDocenteId = @id AND DataFim IS NULL`);
    }
    const ins = await new sql.Request(t).input("m", sql.Int, Number(membroId)).input("tit", sql.NVarChar(150), titulacao || null).input("ini", sql.Date, dataInicio)
      .input("ate", sql.Date, afm.fimDoMandatoReitor(dataInicio)).input("hom", sql.Date, homologadoCLIEm || null).input("ato", sql.NVarChar(300), homologadoCLIEm ? homologacaoAto : null)
      .input("por", sql.Int, por)
      .query(`INSERT INTO AFMCorpoDocente (MembroId, Papel, Titulacao, DataInicio, MandatoAte, HomologadoCLIEm, HomologacaoAto, CriadoPor) OUTPUT INSERTED.CorpoDocenteId
              VALUES (@m, N'REITOR', @tit, @ini, @ate, @hom, @ato, @por)`);
    return { sucesso: true, corpoDocenteId: ins.recordset[0].CorpoDocenteId, anteriorId: anterior ? anterior.CorpoDocenteId : null,
      mensagem: `${pessoa.Nome} registrado(a) como Reitor(a) da AFM, com mandato até 31/12/${String(dataInicio).slice(0, 4)}.${homologadoCLIEm ? "" : " Falta registrar a homologação técnica da CLI."}` };
  });
  if (r.sucesso) await registrarAuditoria({ tabela: "AFMCorpoDocente", registroId: r.corpoDocenteId, acao: "AFM_REITOR_NOMEADO", usuarioId: por, dadosDepois: { membroId: Number(membroId), dataInicio, homologadoCLIEm: homologadoCLIEm || null, anterior: r.anteriorId } });
  return r;
}

async function homologarReitor(pool, { data, ato, por, agora = new Date() }) {
  const atual = await reitorAtual(() => pool.request(), hojeBrasilia(agora));
  if (!atual.reitor) return { sucesso: false, mensagem: "Não há Reitor nomeado." };
  if (atual.reitor.homologadoCLIEm) return { sucesso: false, mensagem: "A homologação deste Reitor já está registrada." };
  if (data < atual.reitor.dataInicio) return { sucesso: false, mensagem: "A homologação não pode ser antes da nomeação." };
  const upd = await pool.request().input("id", sql.Int, atual.reitor.corpoDocenteId).input("data", sql.Date, data).input("ato", sql.NVarChar(300), ato)
    .query(`UPDATE AFMCorpoDocente SET HomologadoCLIEm = @data, HomologacaoAto = @ato WHERE CorpoDocenteId = @id AND DataFim IS NULL AND HomologadoCLIEm IS NULL`);
  if (!upd.rowsAffected[0]) return MUDOU("A Reitoria mudou enquanto isso. Atualize a tela.");
  await registrarAuditoria({ tabela: "AFMCorpoDocente", registroId: atual.reitor.corpoDocenteId, acao: "AFM_REITOR_HOMOLOGADO", usuarioId: por, dadosDepois: { data, ato } });
  return { sucesso: true, mensagem: "Homologação técnica da CLI registrada: o Reitor está em exercício." };
}

// Recondução (Art. 68 §1º, "permitida a recondução indefinida"): o mandato passa a ir até 31/12 do ano informado.
async function reconduzirReitor(pool, { ano, por, agora = new Date() }) {
  const hoje = hojeBrasilia(agora);
  const atual = await reitorAtual(() => pool.request(), hoje);
  if (!atual.reitor) return { sucesso: false, mensagem: "Não há Reitor nomeado." };
  const anoAtual = Number(String(atual.reitor.mandatoAte).slice(0, 4));
  const anoHoje = Number(hoje.slice(0, 4));
  if (!Number.isInteger(ano) || ano <= anoAtual || ano > anoHoje + 1) return { sucesso: false, mensagem: `Informe o ano do novo exercício (depois de ${anoAtual}, até ${anoHoje + 1}).` };
  const ate = `${ano}-12-31`;
  const upd = await pool.request().input("id", sql.Int, atual.reitor.corpoDocenteId).input("ate", sql.Date, ate).input("antes", sql.Date, atual.reitor.mandatoAte)
    .query(`UPDATE AFMCorpoDocente SET MandatoAte = @ate WHERE CorpoDocenteId = @id AND DataFim IS NULL AND MandatoAte = @antes`);
  if (!upd.rowsAffected[0]) return MUDOU("A Reitoria mudou enquanto isso. Atualize a tela.");
  await registrarAuditoria({ tabela: "AFMCorpoDocente", registroId: atual.reitor.corpoDocenteId, acao: "AFM_REITOR_RECONDUZIDO", usuarioId: por, dadosAntes: { mandatoAte: atual.reitor.mandatoAte }, dadosDepois: { mandatoAte: ate } });
  return { sucesso: true, mensagem: `Recondução registrada: mandato até 31/12/${ano}.` };
}

// Encerra o Reitor (exoneração) ou um docente.
async function encerrarCorpoDocente(pool, { corpoDocenteId, data, motivo, por }) {
  const atual = (await pool.request().input("id", sql.Int, corpoDocenteId).query(`
    SELECT CorpoDocenteId, Papel, CONVERT(varchar(10), DataInicio, 120) AS DataInicio, DataFim FROM AFMCorpoDocente WHERE CorpoDocenteId = @id`)).recordset[0];
  if (!atual) return NAO_EXISTE;
  if (atual.DataFim) return { sucesso: false, mensagem: "Já está encerrado." };
  if (data < atual.DataInicio) return { sucesso: false, mensagem: "O encerramento não pode ser antes do início." };
  const upd = await pool.request().input("id", sql.Int, corpoDocenteId).input("data", sql.Date, data).input("motivo", sql.NVarChar(200), motivo)
    .query(`UPDATE AFMCorpoDocente SET DataFim = @data, MotivoFim = @motivo WHERE CorpoDocenteId = @id AND DataFim IS NULL`);
  if (!upd.rowsAffected[0]) return MUDOU("Mudou enquanto isso. Atualize a tela.");
  await registrarAuditoria({ tabela: "AFMCorpoDocente", registroId: Number(corpoDocenteId), acao: atual.Papel === "REITOR" ? "AFM_REITOR_EXONERADO" : "AFM_DOCENTE_ENCERRADO", usuarioId: por, dadosDepois: { data, motivo } });
  return { sucesso: true, mensagem: atual.Papel === "REITOR" ? "Exoneração registrada: a Reitoria fica vaga." : "Docente encerrado." };
}

async function cadastrarDocente(pool, { membroId, titulacao, dataInicio, por }) {
  const pessoa = await dadosDoMembro(pool, membroId);
  if (!pessoa) return NAO_EXISTE;
  if (pessoa.Status !== "ATIVO") return { sucesso: false, mensagem: "Só membro ativo entra no corpo docente." };
  const ja = await pool.request().input("m", sql.Int, Number(membroId)).query(`SELECT 1 AS x FROM AFMCorpoDocente WHERE MembroId = @m AND Papel = N'DOCENTE' AND DataFim IS NULL`);
  if (ja.recordset.length) return { sucesso: false, mensagem: "Esta pessoa já está no corpo docente." };
  const ins = await pool.request().input("m", sql.Int, Number(membroId)).input("tit", sql.NVarChar(150), titulacao).input("ini", sql.Date, dataInicio).input("por", sql.Int, por)
    .query(`INSERT INTO AFMCorpoDocente (MembroId, Papel, Titulacao, DataInicio, CriadoPor) OUTPUT INSERTED.CorpoDocenteId VALUES (@m, N'DOCENTE', @tit, @ini, @por)`);
  const id = ins.recordset[0].CorpoDocenteId;
  await registrarAuditoria({ tabela: "AFMCorpoDocente", registroId: id, acao: "AFM_DOCENTE_CADASTRADO", usuarioId: por, dadosDepois: { membroId: Number(membroId), titulacao, dataInicio } });
  return { sucesso: true, corpoDocenteId: id, mensagem: `${pessoa.Nome} entrou no corpo docente.` };
}

// ============================== LISTAS DAS TELAS ==============================

// A situação de faltas (sequência que está correndo agora) de cada pessoa, para CLI ou AFM, já considerando readmissão/rematrícula.
async function sequenciasAtuais(pool, tipo, ids = null) {
  const hist = await historico(() => pool.request(), tipo, ids);
  const inicios = new Map();
  if (tipo === "CLI") {
    const r = await pool.request().query(`SELECT MembroId, MAX(ContagemAposSessaoId) AS Inicio FROM CLIExclusoesFaltas WHERE ReadmitidaEm IS NOT NULL GROUP BY MembroId`);
    for (const l of r.recordset) inicios.set(Number(l.MembroId), l.Inicio);
  } else {
    const mats = await matriculasAtuais(() => pool.request(), ids);
    for (const [id, m] of mats) if (m.Origem === "REMATRICULA") inicios.set(id, m.ContagemAposSessaoId);
  }
  const out = new Map();
  for (const [id, linhas] of hist) out.set(id, afm.apurarSequencia(aPartirDe(linhas, inicios.has(id) ? inicios.get(id) : null)).atual);
  return out;
}

// Matrículas (aba Academia): todo oficial e quem tem matrícula, com situação, nível, exigência do cargo e faltas seguidas nas Sessões Magnas.
async function listarMatriculas(pool) {
  await garantirMatriculas(pool);
  const r = await pool.request().query(`
    SELECT m.MembroId, m.Nome, m.CargoMinisterial, cm.Nome AS CargoNome, m.Status, c.Nome AS Congregacao,
           a.MatriculaId, a.StatusMatricula, a.NivelEscolaridade, a.NivelConcluido, a.Origem, CONVERT(varchar(10), a.DataMatricula, 120) AS DataMatricula,
           a.CertificadoHabilitacao, CONVERT(varchar(10), a.CHMEm, 120) AS CHMEm,
           d.Motivo AS DesmatriculaMotivo, CONVERT(varchar(10), d.DataDesmatricula, 120) AS DataDesmatricula, d.Detalhe AS DesmatriculaDetalhe, d.SessoesGatilho
    FROM Matriculas_AFM a
    JOIN MembroReferencia m ON m.MembroId = a.MembroId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN CargosMinisteriais cm ON cm.Sigla = m.CargoMinisterial
    LEFT JOIN AFMDesmatriculas d ON d.MatriculaId = a.MatriculaId AND d.AnuladaEm IS NULL
    WHERE a.MatriculaId = (SELECT MAX(a2.MatriculaId) FROM Matriculas_AFM a2 WHERE a2.MembroId = a.MembroId)
    ORDER BY m.Nome`);
  const seq = await sequenciasAtuais(pool, "AFM");
  const origens = await escadaDb.origensDoCargoAtual(pool);   // v8.2: nivelamento obrigatório (Art. 66 §5º)
  return r.recordset.map((l) => {
    const oficial = l.Status === "ATIVO" && afm.CARGOS_OFICIAIS.includes(l.CargoMinisterial);
    const nivel = afm.avaliarNivel(l.CargoMinisterial, l.NivelEscolaridade, l.NivelConcluido);
    return {
      membroId: l.MembroId, nome: l.Nome, cargo: l.CargoMinisterial, cargoNome: l.CargoNome || l.CargoMinisterial, congregacao: l.Congregacao, oficial,
      status: l.StatusMatricula, nivel: l.NivelEscolaridade, nivelConcluido: !!l.NivelConcluido, nivelAtende: nivel.atende, nivelExigido: nivel.exigido,
      origem: l.Origem, dataMatricula: l.DataMatricula, faltasSeguidas: seq.get(Number(l.MembroId)) || 0,
      desmatricula: l.DesmatriculaMotivo ? { motivo: l.DesmatriculaMotivo, data: l.DataDesmatricula, detalhe: l.DesmatriculaDetalhe, sessoes: l.SessoesGatilho } : null,
      licenca: afm.licencaLiturgica({ cargo: oficial ? l.CargoMinisterial : null, statusMatricula: l.StatusMatricula }),
      chm: !!l.CertificadoHabilitacao, chmEm: l.CHMEm || null,
      nivelamento: oficial && escada.emNivelamento(l.CargoMinisterial, origens.get(Number(l.MembroId)), l.NivelEscolaridade, l.NivelConcluido)
    };
  });
}

// Quadro "Faltas e cadeiras" da CLI: quem compõe a CLI com faltas seguidas, as exclusões (vigentes e o histórico) com as providências e os inativos da AFM que entrariam por Ordenação.
async function painelFaltasCLI(pool, composicao) {
  const seq = await sequenciasAtuais(pool, "CLI");
  const emRisco = composicao.map((m) => ({ membroId: m.membroId, nome: m.nome, congregacao: m.congregacao, faltasSeguidas: seq.get(Number(m.membroId)) || 0 }))
    .filter((m) => m.faltasSeguidas > 0).sort((a, b) => b.faltasSeguidas - a.faltasSeguidas || a.nome.localeCompare(b.nome));
  const ex = await pool.request().query(`
    SELECT e.ExclusaoId, e.MembroId, m.Nome, c.Nome AS Congregacao, CONVERT(varchar(10), e.DataExclusao, 120) AS DataExclusao, e.SessoesGatilho, e.ComoEntrava,
           CONVERT(varchar(10), e.ComunicadaCLIEm, 120) AS ComunicadaCLIEm, CONVERT(varchar(10), e.ReadmitidaEm, 120) AS ReadmitidaEm, e.ReadmissaoAto,
           e.AnuladaEm, e.MotivoAnulacao
    FROM CLIExclusoesFaltas e JOIN MembroReferencia m ON m.MembroId = e.MembroId LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    ORDER BY CASE WHEN e.ReadmitidaEm IS NULL AND e.AnuladaEm IS NULL THEN 0 ELSE 1 END, e.DataExclusao DESC, e.ExclusaoId DESC`);
  const exclusoes = ex.recordset.map((l) => {
    let caminhos = [];
    try { caminhos = JSON.parse(l.ComoEntrava || "[]"); } catch (e) { caminhos = []; }
    const vigente = !l.ReadmitidaEm && !l.AnuladaEm;
    return {
      exclusaoId: l.ExclusaoId, membroId: l.MembroId, nome: l.Nome, congregacao: l.Congregacao, dataExclusao: l.DataExclusao,
      sessoes: String(l.SessoesGatilho || "").split(",").filter(Boolean).map(Number), caminhos, vigente,
      comunicadaCLIEm: l.ComunicadaCLIEm, readmitidaEm: l.ReadmitidaEm, readmissaoAto: l.ReadmissaoAto,
      anuladaEm: l.AnuladaEm ? dia(l.AnuladaEm) : null, motivoAnulacao: l.MotivoAnulacao,
      providencias: vigente ? afm.providenciasDaExclusao(caminhos, l.DataExclusao) : []
    };
  });
  const inativos = await pool.request().query(`
    SELECT m.MembroId, m.Nome, c.Nome AS Congregacao, cm.Nome AS CargoNome, CONVERT(varchar(10), d.DataDesmatricula, 120) AS DataDesmatricula, d.Motivo
    FROM Matriculas_AFM a
    JOIN MembroReferencia m ON m.MembroId = a.MembroId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN CargosMinisteriais cm ON cm.Sigla = m.CargoMinisterial
    LEFT JOIN AFMDesmatriculas d ON d.MatriculaId = a.MatriculaId AND d.AnuladaEm IS NULL
    WHERE a.StatusMatricula = N'INATIVA' AND m.Status = N'ATIVO' AND m.CargoMinisterial IN (${ORDENACAO_SQL})
      AND a.MatriculaId = (SELECT MAX(a2.MatriculaId) FROM Matriculas_AFM a2 WHERE a2.MembroId = a.MembroId)
    ORDER BY m.Nome`);
  return {
    limite: afm.FALTAS_PARA_PERDA, emRisco, exclusoes,
    inativosAFM: inativos.recordset.map((l) => ({ membroId: l.MembroId, nome: l.Nome, congregacao: l.Congregacao, cargo: l.CargoNome, desde: l.DataDesmatricula, motivo: l.Motivo }))
  };
}

// Sessões Magnas (aba Academia): data, situação, presentes e faltas dos esperados pela Academia.
async function sessoesMagnas(pool) {
  const r = await pool.request().query(`
    SELECT s.SessaoId, s.Descricao, CONVERT(varchar(10), s.DataSessao, 120) AS DataSessao, s.Status,
           SUM(CASE WHEN p.EsperadoAFM = 1 AND p.Presente = 1 THEN 1 ELSE 0 END) AS Presentes,
           SUM(CASE WHEN p.EsperadoAFM = 1 AND p.Presente = 0 AND ISNULL(p.FaltaJustificada, 0) = 0 THEN 1 ELSE 0 END) AS Faltas,
           SUM(CASE WHEN p.EsperadoAFM = 1 AND p.Presente = 0 AND p.FaltaJustificada = 1 THEN 1 ELSE 0 END) AS Justificadas
    FROM Sessoes s LEFT JOIN Presencas p ON p.SessaoId = s.SessaoId
    WHERE s.TipoSessao IN (${afm.TIPOS_AFM_SQL})
    GROUP BY s.SessaoId, s.Descricao, s.DataSessao, s.Status
    ORDER BY s.DataSessao DESC, s.SessaoId DESC`);
  return r.recordset.map((l) => ({ sessaoId: l.SessaoId, descricao: l.Descricao, data: l.DataSessao, status: l.Status, presentes: l.Presentes || 0, faltas: l.Faltas || 0, justificadas: l.Justificadas || 0 }));
}

// Meu Painel: a situação da própria pessoa na CLI e na AFM.
// Só leitura e só da própria pessoa (abre em todo Meu Painel): nada de calcular a CLI inteira nem de gravar matrícula aqui — a pertença à CLI vem dos caminhos DELA (o mesmo
// critério da composição: a Ordenação não vale com a matrícula da AFM inativa; a exclusão vigente tira por qualquer caminho) e o oficial ainda sem linha conta como ATIVO.
async function minhaSituacao(pool, membroId) {
  const id = Number(membroId);
  const pessoa = await dadosDoMembro(pool, id);
  if (!pessoa) return null;
  const exVig = (await pool.request().input("id", sql.Int, id).query(`
    SELECT TOP 1 CONVERT(varchar(10), DataExclusao, 120) AS DataExclusao FROM CLIExclusoesFaltas WHERE MembroId = @id AND ReadmitidaEm IS NULL AND AnuladaEm IS NULL`)).recordset[0];
  const mat = (await matriculasAtuais(() => pool.request(), [id])).get(id);
  const inativaAFM = !!(mat && mat.StatusMatricula === "INATIVA");
  const caminhos = (await caminhosNaCLI(pool, id)).filter((c) => !(c.via === "ORDENACAO" && inativaAFM));
  const naCLI = caminhos.length > 0 && !exVig;
  const seqCLI = naCLI ? (await sequenciasAtuais(pool, "CLI", [id])).get(id) || 0 : 0;
  const oficial = pessoa.Status === "ATIVO" && afm.CARGOS_OFICIAIS.includes(pessoa.CargoMinisterial);
  let afmInfo = null;
  if (oficial) {
    const nivel = afm.avaliarNivel(pessoa.CargoMinisterial, mat && mat.NivelEscolaridade, mat && mat.NivelConcluido);
    afmInfo = {
      status: mat ? mat.StatusMatricula : "ATIVA", nivel: mat ? mat.NivelEscolaridade : null, nivelConcluido: !!(mat && mat.NivelConcluido), nivelAtende: nivel.atende, nivelExigido: nivel.exigido,
      faltasSeguidas: (await sequenciasAtuais(pool, "AFM", [id])).get(id) || 0,
      desmatricula: mat && mat.DesmatriculaId ? { motivo: mat.DesmatriculaMotivo, data: mat.DataDesmatricula } : null,
      licenca: afm.licencaLiturgica({ cargo: pessoa.CargoMinisterial, statusMatricula: mat ? mat.StatusMatricula : "ATIVA" })
    };
  }
  return {
    limite: afm.FALTAS_PARA_PERDA,
    cli: { naCLI, faltasSeguidas: naCLI ? seqCLI : 0, excluidaEm: exVig ? exVig.DataExclusao : null },
    afm: afmInfo
  };
}

// Licença para oficiar de cada pessoa (turma de batismo): Map membroId -> { podeOficiar, motivo }.
async function licencasDe(pool, membroIds) {
  const ids = listaDeIds(membroIds);
  const out = new Map();
  if (!ids || !ids.length) return out;
  const req = pool.request();
  const filtro = filtroIds(req, "m.MembroId", ids);
  const r = await req.query(`
    SELECT m.MembroId, m.Nome, m.Status, m.CargoMinisterial,
           (SELECT TOP 1 a.StatusMatricula FROM Matriculas_AFM a WHERE a.MembroId = m.MembroId ORDER BY a.MatriculaId DESC) AS StatusMatricula
    FROM MembroReferencia m WHERE 1 = 1 ${filtro}`);
  for (const l of r.recordset) {
    const lic = afm.licencaLiturgica({ cargo: l.Status === "ATIVO" ? l.CargoMinisterial : null, statusMatricula: l.StatusMatricula || "ATIVA" });
    out.set(Number(l.MembroId), { ...lic, nome: l.Nome });
  }
  return out;
}

// ============================== AVISOS (detectores) e ROTINA ==============================

async function contatos(pool, ids) {
  const lista = listaDeIds(ids);
  if (!lista.length) return new Map();
  const req = pool.request();
  const filtro = filtroIds(req, "MembroId", lista);
  const r = await req.query(`SELECT MembroId, Nome, Email FROM MembroReferencia WHERE 1 = 1 ${filtro}`);
  return new Map(r.recordset.map((l) => [Number(l.MembroId), { membroId: Number(l.MembroId), nome: l.Nome, email: l.Email || null }]));
}
async function destinatariosGerais(pool, permissao) {
  return require("./notificacoes").resolverDestinatariosPorPermissao(pool, { permissao, nivel: "GLOBAL" });
}

// CLI_FALTAS_ALERTA — quem compõe a CLI e está com 2 faltas seguidas. Uma vez por sequência (referência = a última reunião faltada).
async function detectarAlertaCLI(pool) {
  const { composicaoCLI } = require("./universo");
  const orgao = (await pool.request().query(`SELECT OrgaoId FROM Orgaos WHERE Sigla = N'CLI'`)).recordset[0];
  if (!orgao) return [];
  const composicao = await composicaoCLI(pool, orgao.OrgaoId);
  const ids = composicao.map((m) => Number(m.membroId));
  if (!ids.length) return [];
  const hist = await historico(() => pool.request(), "CLI", ids);
  const r = await pool.request().query(`SELECT MembroId, MAX(ContagemAposSessaoId) AS Inicio FROM CLIExclusoesFaltas WHERE ReadmitidaEm IS NOT NULL GROUP BY MembroId`);
  const inicios = new Map(r.recordset.map((l) => [Number(l.MembroId), l.Inicio]));
  const alvo = [];
  for (const [id, linhas] of hist) {
    const s = afm.apurarSequencia(aPartirDe(linhas, inicios.has(id) ? inicios.get(id) : null));
    if (s.atual === afm.FALTAS_PARA_PERDA - 1) alvo.push({ id, ultima: s.sessoesAtuais[s.sessoesAtuais.length - 1] });
  }
  const c = await contatos(pool, alvo.map((a) => a.id));
  return alvo.filter((a) => c.has(a.id)).map((a) => ({
    referenciaId: a.ultima, destinatarios: [c.get(a.id)],
    fatoGerador: `Você faltou às 2 últimas reuniões da CLI sem justificativa aceita. Se faltar à próxima, perde automaticamente a cadeira na Câmara (Estatuto, Art. 27 §1º). `
      + `Se a falta teve motivo externo à igreja (saúde, viagem profissional, luto, emergência familiar), peça a justificativa no Meu Painel.`
  }));
}

// CLI_EXCLUSAO_FALTAS — cada exclusão vigente: a própria pessoa e a Secretaria (quem tem "reunioes" no nível geral).
async function detectarExclusoesCLI(pool) {
  const r = await pool.request().query(`
    SELECT e.ExclusaoId, e.MembroId, m.Nome, CONVERT(varchar(10), e.DataExclusao, 120) AS DataExclusao, e.ComoEntrava
    FROM CLIExclusoesFaltas e JOIN MembroReferencia m ON m.MembroId = e.MembroId
    WHERE e.ReadmitidaEm IS NULL AND e.AnuladaEm IS NULL`);
  if (!r.recordset.length) return [];
  const gerais = await destinatariosGerais(pool, "reunioes");
  const c = await contatos(pool, r.recordset.map((l) => l.MembroId));
  const fatos = [];
  for (const l of r.recordset) {
    let caminhos = [];
    try { caminhos = JSON.parse(l.ComoEntrava || "[]"); } catch (e) { caminhos = []; }
    const prov = afm.providenciasDaExclusao(caminhos, l.DataExclusao).filter((p) => p.tipo === "AGE_DESTITUICAO" || p.tipo === "SUBSTITUICAO" || p.tipo === "COMUNICAR_CLI");
    const data = l.DataExclusao.split("-").reverse().join("/");
    const pessoa = c.get(Number(l.MembroId));
    if (pessoa) fatos.push({ referenciaId: l.ExclusaoId, destinatarios: [pessoa],
      fatoGerador: `Você foi excluído(a) da CLI em ${data} por 3 faltas seguidas sem justificativa aceita (Estatuto, Art. 27 §1º). Seu cargo ministerial não muda. A volta é por novo processo de admissão (Regimento, Art. 149 §1º).` });
    const outros = gerais.filter((g) => Number(g.membroId) !== Number(l.MembroId));
    if (outros.length) fatos.push({ referenciaId: l.ExclusaoId, destinatarios: outros,
      fatoGerador: `${l.Nome} foi excluído(a) da CLI em ${data} por 3 faltas seguidas.${prov.length ? ` Providências: ${prov.map((p) => p.texto).join(" ")}` : ""}` });
  }
  return fatos;
}

// AFM_FALTAS_ALERTA — matrícula ativa e 2 Sessões Magnas seguidas sem justificativa.
async function detectarAlertaAFM(pool) {
  const seq = await sequenciasAtuais(pool, "AFM");
  const ids = [...seq.entries()].filter(([, n]) => n === afm.FALTAS_PARA_PERDA - 1).map(([id]) => id);
  if (!ids.length) return [];
  const mats = await matriculasAtuais(() => pool.request(), ids);
  const hist = await historico(() => pool.request(), "AFM", ids);
  const c = await contatos(pool, ids);
  return ids.filter((id) => c.has(id) && mats.get(id) && mats.get(id).StatusMatricula === "ATIVA").map((id) => {
    const linhas = hist.get(id) || [];
    return { referenciaId: linhas.length ? linhas[linhas.length - 1].sessaoId : null, destinatarios: [c.get(id)],
      fatoGerador: "Você faltou às 2 últimas Sessões Magnas da AFM sem justificativa aceita. Na próxima falta, a matrícula fica inativa e você perde a licença para oficiar até nova matrícula e reciclagem (Regimento, Art. 69 §§2º e 3º)." };
  });
}

// AFM_DESMATRICULA — cada desmatrícula vigente: a pessoa e quem tem "afm" no nível geral.
async function detectarDesmatriculas(pool) {
  const r = await pool.request().query(`
    SELECT d.DesmatriculaId, d.MembroId, m.Nome, d.Motivo, CONVERT(varchar(10), d.DataDesmatricula, 120) AS DataDesmatricula
    FROM AFMDesmatriculas d JOIN MembroReferencia m ON m.MembroId = d.MembroId
    WHERE d.AnuladaEm IS NULL AND d.MatriculaId = (SELECT MAX(a.MatriculaId) FROM Matriculas_AFM a WHERE a.MembroId = d.MembroId)`);
  if (!r.recordset.length) return [];
  const gerais = await destinatariosGerais(pool, PERMISSAO);
  const c = await contatos(pool, r.recordset.map((l) => l.MembroId));
  const fatos = [];
  for (const l of r.recordset) {
    const data = l.DataDesmatricula.split("-").reverse().join("/");
    const porque = l.Motivo === "FALTAS" ? "3 Sessões Magnas seguidas sem justificativa" : "reprovação técnica";
    const pessoa = c.get(Number(l.MembroId));
    if (pessoa) fatos.push({ referenciaId: l.DesmatriculaId, destinatarios: [pessoa],
      fatoGerador: `Sua matrícula na AFM ficou inativa em ${data} (${porque}). Você mantém o título, mas está sem licença para oficiar até fazer nova matrícula e ser aprovado(a) na reciclagem (Regimento, Art. 69 §3º).` });
    const outros = gerais.filter((g) => Number(g.membroId) !== Number(l.MembroId));
    if (outros.length) fatos.push({ referenciaId: l.DesmatriculaId, destinatarios: outros,
      fatoGerador: `${l.Nome}: matrícula na AFM inativa desde ${data} (${porque}). Sem licença para oficiar; se tiver acesso de liderança, perdeu os poderes administrativos (Regimento, Art. 69 §3º).` });
  }
  return fatos;
}

// AFM_REITORIA — Reitoria vaga, sem homologação, vencida ou vencendo em 30 dias. Repete uma vez por mês enquanto durar (referência = AAAAMM).
async function detectarReitoria(pool, agora = new Date()) {
  const hoje = hojeBrasilia(agora);
  const { situacao, reitor } = await reitorAtual(() => pool.request(), hoje);
  const ref = Number(hoje.slice(0, 4)) * 100 + Number(hoje.slice(5, 7));
  if (situacao === "VAGA") return [{ referenciaId: ref, fatoGerador: "A Reitoria da AFM está vaga: registre o Reitor nomeado pelo Pastor Presidente (Regimento, Art. 68)." }];
  if (situacao === "AGUARDANDO_HOMOLOGACAO") return [{ referenciaId: ref, fatoGerador: `O Reitor ${reitor.nome} ainda não teve a homologação técnica da CLI registrada (Regimento, Art. 68 §1º).` }];
  if (situacao === "MANDATO_VENCIDO") return [{ referenciaId: ref, fatoGerador: `O mandato do Reitor ${reitor.nome} venceu em ${reitor.mandatoAte.split("-").reverse().join("/")}: registre a recondução ou a nova nomeação.` }];
  if (reitor && afm.somarDias(hoje, 30) >= reitor.mandatoAte) return [{ referenciaId: ref, fatoGerador: `O mandato do Reitor ${reitor.nome} termina em ${reitor.mandatoAte.split("-").reverse().join("/")} (fim do exercício fiscal): registre a recondução ou a nova nomeação.` }];
  return [];
}

// Retenção (LGPD art. 6º, III — necessidade): o DETALHE escrito da justificativa de falta da CLI (pode citar saúde) sai 2 anos depois da reunião; o código do catálogo fica,
// porque é ele que sustenta a contagem das 3 faltas. Prazo ajustável em Proteção de Dados → Políticas de retenção.
const POLITICA_DETALHE_JUSTIFICATIVA = { categoria: "CLI — detalhe da justificativa de falta", padrao: 730 };
async function aplicarRetencao(pool, { hoje = hojeBrasilia() } = {}) {
  const dias = await require("./politicasRetencao").diasDaPolitica(pool, POLITICA_DETALHE_JUSTIFICATIVA.categoria, POLITICA_DETALHE_JUSTIFICATIVA.padrao);
  const r = await pool.request().input("d", sql.Int, dias).input("hoje", sql.Date, hoje).query(`
    UPDATE p SET MotivoJustificativa = CASE WHEN p.MotivoCodigo IS NOT NULL THEN NULL ELSE p.MotivoJustificativa END,
                 JustificativaPendente = CASE WHEN p.PendenteCodigo IS NOT NULL THEN NULL ELSE p.JustificativaPendente END
    FROM Presencas p JOIN Sessoes s ON s.SessaoId = p.SessaoId
    WHERE ((p.MotivoCodigo IS NOT NULL AND p.MotivoJustificativa IS NOT NULL) OR (p.PendenteCodigo IS NOT NULL AND p.JustificativaPendente IS NOT NULL))
      AND s.DataSessao < DATEADD(DAY, -@d, @hoje);
    SELECT @@ROWCOUNT AS n`);
  return { detalhesApagados: Number((r.recordset[0] || {}).n) || 0, retencaoDias: dias };
}

// Rotina diária (antes dos avisos): matricula quem virou oficial, refaz a apuração de todo mundo (rede de segurança se alguma apuração na hora falhou) e aplica a retenção.
async function rotinaDiaria(pool) {
  const out = { matriculadas: 0, exclusoes: 0, anuladasCLI: 0, desmatriculas: 0, anuladasAFM: 0, detalhesApagados: 0, falhas: [] };
  try { out.detalhesApagados = (await aplicarRetencao(pool)).detalhesApagados; } catch (e) { out.falhas.push("retencao"); }
  try { out.matriculadas = await garantirMatriculas(pool); } catch (e) { out.falhas.push("matriculas"); }
  try {
    const r = await apurar(pool, {});
    if (r && r.sucesso) { out.exclusoes = r.exclusoes.length; out.anuladasCLI = r.anuladasCLI.length; out.desmatriculas = r.desmatriculas.length; out.anuladasAFM = r.anuladasAFM.length; }
    else out.falhas.push("apuracao");
  } catch (e) { out.falhas.push("apuracao"); }
  return out;
}

// LGPD (Meus Dados): o que a AFM e a CLI guardam da pessoa.
async function dadosDoTitular(pool, membroId) {
  const id = Number(membroId);
  const mats = (await pool.request().input("id", sql.Int, id).query(`
    SELECT MatriculaId AS matriculaId, Origem AS origem, StatusMatricula AS status, NivelEscolaridade AS nivel, NivelConcluido AS nivelConcluido,
           CONVERT(varchar(10), DataMatricula, 120) AS dataMatricula, CONVERT(varchar(10), ReciclagemAprovadaEm, 120) AS reciclagemAprovadaEm, Observacao AS observacao
    FROM Matriculas_AFM WHERE MembroId = @id ORDER BY MatriculaId`)).recordset;
  const desm = (await pool.request().input("id", sql.Int, id).query(`
    SELECT Motivo AS motivo, CONVERT(varchar(10), DataDesmatricula, 120) AS data, Detalhe AS detalhe, CONVERT(varchar(10), AnuladaEm, 120) AS anuladaEm, MotivoAnulacao AS motivoAnulacao
    FROM AFMDesmatriculas WHERE MembroId = @id ORDER BY DesmatriculaId`)).recordset;
  const exc = (await pool.request().input("id", sql.Int, id).query(`
    SELECT CONVERT(varchar(10), DataExclusao, 120) AS dataExclusao, SessoesGatilho AS reunioes, CONVERT(varchar(10), ComunicadaCLIEm, 120) AS comunicadaCLIEm,
           CONVERT(varchar(10), ReadmitidaEm, 120) AS readmitidaEm, ReadmissaoAto AS readmissaoAto, CONVERT(varchar(10), AnuladaEm, 120) AS anuladaEm, MotivoAnulacao AS motivoAnulacao
    FROM CLIExclusoesFaltas WHERE MembroId = @id ORDER BY ExclusaoId`)).recordset;
  const corpo = (await pool.request().input("id", sql.Int, id).query(`
    SELECT Papel AS papel, Titulacao AS titulacao, CONVERT(varchar(10), DataInicio, 120) AS dataInicio, CONVERT(varchar(10), MandatoAte, 120) AS mandatoAte,
           CONVERT(varchar(10), HomologadoCLIEm, 120) AS homologadoCLIEm, CONVERT(varchar(10), DataFim, 120) AS dataFim, MotivoFim AS motivoFim
    FROM AFMCorpoDocente WHERE MembroId = @id ORDER BY CorpoDocenteId`)).recordset;
  return { matriculasAFM: mats, desmatriculasAFM: desm, exclusoesCLI: exc, corpoDocenteAFM: corpo };
}

module.exports = {
  PERMISSAO, garantirMatriculas, marcarNaoConta, matriculasAtuais, universoAFM, idsInativosAFM, idsExcluidosCLI, caminhosNaCLI, historico, apurar, apurarSemFalhar, resumoDaApuracao,
  definirNivel, registrarReprovacao, anularReprovacao, rematricular, comunicarExclusao, readmitir,
  corpoDocente, reitorAtual, nomearReitor, homologarReitor, reconduzirReitor, encerrarCorpoDocente, cadastrarDocente,
  sequenciasAtuais, listarMatriculas, painelFaltasCLI, sessoesMagnas, minhaSituacao, licencasDe,
  detectarAlertaCLI, detectarExclusoesCLI, detectarAlertaAFM, detectarDesmatriculas, detectarReitoria, rotinaDiaria, dadosDoTitular, aplicarRetencao, POLITICA_DETALHE_JUSTIFICATIVA
};
