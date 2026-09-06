// GestaoLideranca
// Conceder liderança é o que dá acesso de login à Secretaria (ver
// api/shared/auth.js) — por isso exige a permissão "permissoes" pra mexer
// aqui: só quem já administra acesso pode conceder acesso a outra pessoa.
// GET    /api/lideranca            -> lista todos os líderes
// POST   /api/lideranca            -> body: { membroId, papelId, escopoTipo, escopoId, senha, duracaoMeses? } -> concede/atualiza acesso
// POST   /api/lideranca/lote       -> body: { membroIds[], papelId, escopoTipo, escopoId?, senha, duracaoMeses? } -> concede em massa
// DELETE /api/lideranca/{membroId} -> remove liderança (e o acesso de login) daquele membro
//
// "Papel" (Papeis) é quem carrega as Permissões de verdade (Papeis.Permissoes,
// chaves separadas por vírgula). "Tipo"/"Escopo" (colunas antigas da tabela)
// não são mais usadas — ver migração 003 (Lideranca.Tipo/Escopo viraram opcionais).
//
// duracaoMeses (opcional, mesmo padrão de api/GestaoAssentos): quando
// informado, calcula Lideranca.AtivoAte = hoje + N meses — mandato com prazo
// automático (ex: 1 ano), sem depender de alguém lembrar de tirar o acesso
// manualmente. AtivoAte já existia desde a migração 001 e já é checado no
// login (LoginSecretaria) e na composição da CLI (shared/universo.js) — até
// agora só era setado pelo fluxo de Medida Cautelar (v2.6); aqui passa a
// representar fim de mandato normal também. Se duracaoMeses não vier, não
// mexe em AtivoAte (não pode sobrescrever sem querer uma suspensão em
// andamento só porque a pessoa teve outro dado atualizado).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

// Níveis da Governança Escalonada aceitos como escopo de acesso.
const ESCOPO_TIPOS_VALIDOS = ["GLOBAL", "EXTENSAO", "CONGREGACAO", "AREA", "REGIAO", "QUADRANTE", "DISTRITO", "DEPARTAMENTO"];

// Concede ou atualiza a liderança de UMA pessoa — usado tanto pelo POST
// individual quanto, em loop, pelo POST em lote. Retorna { sucesso, mensagem }.
async function concederOuAtualizarLideranca(pool, dados, usuarioId) {
  const { membroId, papelId, escopoTipo, escopoId, senha, duracaoMeses } = dados;
  if (!membroId || !papelId) {
    return { sucesso: false, mensagem: "Campos obrigatórios: membroId, papelId." };
  }
  if (escopoTipo && !ESCOPO_TIPOS_VALIDOS.includes(escopoTipo)) {
    return { sucesso: false, mensagem: "Tipo de escopo inválido." };
  }
  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) {
    return { sucesso: false, mensagem: "Cadastre a pessoa antes de conceder liderança." };
  }
  const papel = await pool.request().input("id", sql.Int, papelId).query(`SELECT PapelId FROM Papeis WHERE PapelId = @id`);
  if (papel.recordset.length === 0) {
    return { sucesso: false, mensagem: "Papel inválido." };
  }
  const existente = await pool.request().input("id", sql.Int, membroId).query(`SELECT LiderancaId FROM Lideranca WHERE MembroId = @id`);
  const jaTemAcesso = existente.recordset.length > 0;
  if (!jaTemAcesso && !senha) {
    return { sucesso: false, mensagem: "Defina uma senha para o primeiro acesso desta pessoa." };
  }

  if (jaTemAcesso) {
    const request = pool.request()
      .input("id", sql.Int, membroId)
      .input("papelId", sql.Int, papelId)
      .input("escopoTipo", sql.NVarChar(30), escopoTipo || "GLOBAL")
      .input("escopoId", sql.Int, escopoId || null);
    let query = `UPDATE Lideranca SET PapelId = @papelId, EscopoTipo = @escopoTipo, EscopoId = @escopoId`;
    if (senha) {
      request.input("senhaHash", sql.NVarChar(200), auth.hashSenha(senha));
      query += `, SenhaHash = @senhaHash`;
    }
    if (duracaoMeses) {
      request.input("duracaoMeses", sql.Int, duracaoMeses);
      query += `, AtivoAte = DATEADD(month, @duracaoMeses, CAST(SYSUTCDATETIME() AS DATE))`;
    }
    query += ` WHERE MembroId = @id`;
    await request.query(query);
  } else {
    const request = pool.request()
      .input("membroId", sql.Int, membroId)
      .input("papelId", sql.Int, papelId)
      .input("escopoTipo", sql.NVarChar(30), escopoTipo || "GLOBAL")
      .input("escopoId", sql.Int, escopoId || null)
      .input("senhaHash", sql.NVarChar(200), auth.hashSenha(senha))
      .input("duracaoMeses", sql.Int, duracaoMeses || null);
    await request.query(`
      INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash, AtivoAte)
      VALUES (@membroId, @papelId, @escopoTipo, @escopoId, @senhaHash,
              CASE WHEN @duracaoMeses IS NULL THEN NULL ELSE DATEADD(month, @duracaoMeses, CAST(SYSUTCDATETIME() AS DATE)) END)
    `);
  }

  await registrarAuditoria({
    tabela: "Lideranca",
    registroId: Number(membroId),
    acao: jaTemAcesso ? "Atualizou liderança" : "Concedeu liderança",
    usuarioId,
    dadosDepois: { membroId, papelId, escopoTipo, escopoId, duracaoMeses: duracaoMeses || null }
  });

  return { sucesso: true, mensagem: "✅ Liderança registrada." };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "permissoes");
  if (!usuario) return;

  const method = req.method;
  const membroIdRota = context.bindingData.membroId;
  const usuarioId = usuario.membroId;
  const pool = await getPool();

  // ---- GET: listar ----
  if (method === "GET") {
    const result = await pool.request().query(`
      SELECT l.LiderancaId AS liderancaId, l.MembroId AS membroId, m.Nome AS nome,
             l.PapelId AS papelId, p.Nome AS papel, p.Nivel AS nivel,
             l.EscopoTipo AS escopoTipo, l.EscopoId AS escopoId, p.Permissoes AS permissoesStr
      FROM Lideranca l
      JOIN MembroReferencia m ON m.MembroId = l.MembroId
      JOIN Papeis p ON p.PapelId = l.PapelId
    `);
    const liderancas = result.recordset.map(l => ({
      liderancaId: l.liderancaId,
      membroId: l.membroId,
      nome: l.nome,
      papelId: l.papelId,
      papel: l.papel,
      nivel: l.nivel,
      escopoTipo: l.escopoTipo,
      escopoId: l.escopoId,
      permissoes: l.permissoesStr ? l.permissoesStr.split(",").map(p => p.trim()).filter(Boolean) : []
    }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: liderancas };
    return;
  }

  // ---- POST /lideranca/lote: conceder o mesmo papel a várias matrículas ----
  if (method === "POST" && membroIdRota === "lote") {
    const { membroIds, papelId, escopoTipo, escopoId, senha, duracaoMeses } = req.body || {};
    if (!Array.isArray(membroIds) || membroIds.length === 0 || !papelId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroIds (lista), papelId." } };
      return;
    }
    if (escopoTipo && !ESCOPO_TIPOS_VALIDOS.includes(escopoTipo)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Tipo de escopo inválido." } };
      return;
    }

    const resultados = [];
    for (const membroIdBruto of membroIds) {
      const membroId = Number(membroIdBruto);
      if (!Number.isInteger(membroId)) {
        resultados.push({ membroId: membroIdBruto, sucesso: false, mensagem: "Matrícula inválida." });
        continue;
      }

      let escopoIdEfetivo = escopoId || null;
      if (escopoTipo === "CONGREGACAO" && !escopoIdEfetivo) {
        const cong = await pool.request().input("id", sql.Int, membroId)
          .query(`SELECT CongregacaoId FROM MembroReferencia WHERE MembroId = @id`);
        if (cong.recordset.length === 0) {
          resultados.push({ membroId, sucesso: false, mensagem: "Matrícula não encontrada." });
          continue;
        }
        if (!cong.recordset[0].CongregacaoId) {
          resultados.push({ membroId, sucesso: false, mensagem: "Esta pessoa não tem congregação cadastrada — informe o escopo manualmente ou cadastre a congregação dela antes." });
          continue;
        }
        escopoIdEfetivo = cong.recordset[0].CongregacaoId;
      }

      const resultado = await concederOuAtualizarLideranca(
        pool, { membroId, papelId, escopoTipo, escopoId: escopoIdEfetivo, senha, duracaoMeses }, usuarioId
      );
      resultados.push(Object.assign({ membroId }, resultado));
    }

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, resultados } };
    return;
  }

  // ---- POST: conceder ou atualizar acesso ----
  if (method === "POST") {
    const resultado = await concederOuAtualizarLideranca(pool, req.body || {}, usuarioId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resultado };
    return;
  }

  // ---- DELETE: remover ----
  if (method === "DELETE") {
    if (!membroIdRota) {
      context.res = { status: 400, body: { erro: "Informe o membroId na rota: /api/lideranca/{membroId}" } };
      return;
    }

    // Mesma trava de segurança do GestaoMedidasCautelares: nunca deixa zerar
    // quem tem a permissão "permissoes" — senão ninguém mais gerencia acesso
    // de ninguém depois.
    const outrosComPermissao = await pool.request().input("id", sql.Int, membroIdRota).query(`
      SELECT COUNT(*) AS total
      FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
      WHERE l.MembroId <> @id AND (',' + p.Permissoes + ',') LIKE '%,permissoes,%'
    `);
    const estaRemovendoPermissoes = await pool.request().input("id", sql.Int, membroIdRota).query(`
      SELECT 1 FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
      WHERE l.MembroId = @id AND (',' + p.Permissoes + ',') LIKE '%,permissoes,%'
    `);
    if (estaRemovendoPermissoes.recordset.length > 0 && outrosComPermissao.recordset[0].total === 0) {
      context.res = {
        status: 200,
        body: { sucesso: false, mensagem: "Não é possível remover: essa pessoa é a única com a permissão \"permissoes\" — ninguém mais conseguiria gerenciar acesso depois. Conceda a permissão a outra pessoa antes." }
      };
      return;
    }

    const del = await pool.request().input("id", sql.Int, membroIdRota).query(`DELETE FROM Lideranca WHERE MembroId = @id`);
    if (del.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta pessoa não tem liderança registrada." } };
      return;
    }
    await registrarAuditoria({ tabela: "Lideranca", registroId: Number(membroIdRota), acao: "Removeu liderança", usuarioId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Liderança removida." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
