// GestaoLideranca
// Conceder liderança é o que dá acesso de login à Secretaria (ver
// api/shared/auth.js) — por isso exige a permissão "permissoes" E o nível GERAL
// (papel GLOBAL com escopo de todas as congregações): quem concede cargo e escopo
// decide quem vê o quê em toda a igreja, então não pode ser um papel local (um
// "permissoes" local concederia a si mesmo ou a um aliado o papel de Presidente).
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
const trilhas = require("../shared/trilhas");
const pinMembro = require("../shared/pinMembro");
const canaisDb = require("../shared/canaisDb");
const { exigirGeral } = require("../shared/escopoRotas");

// v7.3 — quem sai da liderança de uma congregação/Área/departamento obriga a troca de senha dos canais
// oficiais dele (Regimento Art. 160, §4º, I). Falha aqui nunca derruba a operação de liderança: a próxima
// leitura do painel de canais e a rodada diária de avisos repetem a conferência.
async function conferirSucessaoDeCanais(pool, usuarioId) {
  try { await canaisDb.sincronizarSucessoes(pool, { por: usuarioId }); }
  catch (e) { console.error("[GestaoLideranca] sucessão de canais:", e.message); }
}

// Níveis da Governança Escalonada aceitos como escopo de acesso.
const MAX_LOTE = 200;
const ESCOPO_TIPOS_VALIDOS = ["GLOBAL", "EXTENSAO", "CONGREGACAO", "AREA", "REGIAO", "QUADRANTE", "DISTRITO", "DEPARTAMENTO"];

// Largura de cada escopo, na mesma régua de auth.RANKING_NIVEL (EXTENSAO fica abaixo da congregação). DEPARTAMENTO é à parte: vale para o campo todo, restrito pelo departamento.
const LARGURA_ESCOPO = { EXTENSAO: 0, CONGREGACAO: 1, AREA: 2, REGIAO: 3, QUADRANTE: 4, DISTRITO: 5, GLOBAL: 6 };
// Onde existe o id de cada escopo territorial (para recusar id que não existe, em vez de gravar uma liderança que não alcança nada ou, pior, alcança tudo).
const TABELA_DO_ESCOPO = {
  EXTENSAO: ["ExtensoesTenda", "ExtensaoId"], CONGREGACAO: ["Congregacoes", "CongregacaoId"], AREA: ["Areas", "AreaId"], REGIAO: ["Regioes", "RegiaoId"],
  QUADRANTE: ["Quadrantes", "QuadranteId"], DISTRITO: ["Distritos", "DistritoId"], DEPARTAMENTO: ["Departamentos", "DepartamentoId"]
};

// O escopo é coerente com o nível do papel? Regras: o escopo nunca é MAIS LARGO que o nível do papel (um "Dirigente de Congregação" não recebe escopo Global);
// escopo territorial exige o id; papel de nível DEPARTAMENTO só com escopo DEPARTAMENTO (e vice-versa). Devolve a mensagem do erro ou null.
function incoerenciaDeEscopo(papelNivel, escopoTipo, escopoId) {
  if (!escopoTipo) return "Informe o escopo (onde esta pessoa atua).";
  if (escopoTipo !== "GLOBAL" && !auth.idDeRota(escopoId)) return "Informe qual " + escopoTipo.toLowerCase() + " (o escopo sem a unidade deixaria o acesso aberto demais).";
  if (papelNivel === "DEPARTAMENTO" || escopoTipo === "DEPARTAMENTO") {
    return papelNivel === "DEPARTAMENTO" && escopoTipo === "DEPARTAMENTO" ? null : "Papel de departamento só vale com escopo de departamento.";
  }
  const larguraDoPapel = LARGURA_ESCOPO[papelNivel];
  if (larguraDoPapel === undefined) return "O nível do papel não é reconhecido.";
  if (LARGURA_ESCOPO[escopoTipo] > larguraDoPapel) return "O escopo escolhido é mais largo que o nível do papel (" + papelNivel + ").";
  return null;
}

async function escopoExiste(pool, escopoTipo, escopoId) {
  const alvo = TABELA_DO_ESCOPO[escopoTipo];
  if (!alvo) return true;                       // GLOBAL
  const r = await pool.request().input("id", sql.Int, auth.idDeRota(escopoId)).query(`SELECT 1 AS ok FROM ${alvo[0]} WHERE ${alvo[1]} = @id`);
  return r.recordset.length > 0;
}

// Concede ou atualiza a liderança de UMA pessoa — usado tanto pelo POST
// individual quanto, em loop, pelo POST em lote. Retorna { sucesso, mensagem }.
async function concederOuAtualizarLideranca(pool, dados, usuarioId) {
  const { duracaoMeses, escopoTipo, senha } = dados;
  const membroId = auth.idDeRota(dados.membroId), papelId = auth.idDeRota(dados.papelId);
  const escopoId = escopoTipo === "GLOBAL" ? null : dados.escopoId;
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
  const papel = await pool.request().input("id", sql.Int, papelId).query(`SELECT PapelId, Nivel FROM Papeis WHERE PapelId = @id`);
  if (papel.recordset.length === 0) {
    return { sucesso: false, mensagem: "Papel inválido." };
  }
  const existente = await pool.request().input("id", sql.Int, membroId).query(`SELECT LiderancaId, PapelId, EscopoTipo, EscopoId FROM Lideranca WHERE MembroId = @id`);
  const jaTemAcesso = existente.recordset.length > 0;

  // O escopo precisa fazer sentido para o papel. Só NÃO se confere quando nada de papel/escopo muda (é só redefinir a senha ou renovar o mandato de uma linha antiga):
  // senão uma linha legada incoerente não poderia nem ter a senha trocada.
  const linhaAtual = jaTemAcesso ? existente.recordset[0] : null;
  const mudaPapelOuEscopo = !linhaAtual || Number(linhaAtual.PapelId) !== papelId || linhaAtual.EscopoTipo !== escopoTipo || Number(linhaAtual.EscopoId || 0) !== Number(escopoId || 0);
  if (mudaPapelOuEscopo) {
    const incoerencia = incoerenciaDeEscopo(papel.recordset[0].Nivel, escopoTipo, escopoId);
    if (incoerencia) return { sucesso: false, mensagem: incoerencia };
    if (!(await escopoExiste(pool, escopoTipo, escopoId))) return { sucesso: false, mensagem: "A unidade do escopo não existe." };
  }
  if (!jaTemAcesso && !senha) {
    return { sucesso: false, mensagem: "Defina uma senha para o primeiro acesso desta pessoa." };
  }

  // v6.9 — formação exigida para este papel (TrilhaRequisitos, contexto
  // LIDERANCA, alvo = PapelId). Vale para nomeação nova, troca de papel e
  // renovação de mandato (duracaoMeses). NÃO vale para só trocar a senha ou o
  // escopo de quem já tem o mesmo papel: redefinir senha não pode ficar
  // preso a um certificado vencido.
  const mesmoPapel = jaTemAcesso && Number(existente.recordset[0].PapelId) === Number(papelId);
  if (!mesmoPapel || duracaoMeses) {
    const formacao = await trilhas.avaliarRequisitos(pool, { contexto: "LIDERANCA", alvoChave: String(papelId), membroId });
    if (formacao.bloqueado) return { sucesso: false, mensagem: formacao.mensagemBloqueio };
  }

  if (jaTemAcesso) {
    const request = pool.request()
      .input("id", sql.Int, membroId)
      .input("papelId", sql.Int, papelId)
      .input("escopoTipo", sql.NVarChar(30), escopoTipo)
      .input("escopoId", sql.Int, escopoId ? auth.idDeRota(escopoId) : null);
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
      .input("escopoTipo", sql.NVarChar(30), escopoTipo)
      .input("escopoId", sql.Int, escopoId ? auth.idDeRota(escopoId) : null)
      .input("senhaHash", sql.NVarChar(200), auth.hashSenha(senha))
      .input("duracaoMeses", sql.Int, duracaoMeses || null);
    await request.query(`
      INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash, AtivoAte)
      VALUES (@membroId, @papelId, @escopoTipo, @escopoId, @senhaHash,
              CASE WHEN @duracaoMeses IS NULL THEN NULL ELSE DATEADD(month, @duracaoMeses, CAST(SYSUTCDATETIME() AS DATE)) END)
    `);
  }

  // Redefinir a senha de quem ficou bloqueado por tentativas é também o desbloqueio (fecho da v7.5): sem isso, um anônimo que errasse a senha de um líder mantinha o
  // acesso dele trancado e a Secretaria não tinha como liberar.
  if (senha) await pinMembro.limparTentativas(pool, membroId, "SENHA");

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
  const usuario = exigirGeral(req, context, "permissoes");
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
      // linha que já está incoerente (escopo mais largo que o papel, ou território sem unidade): aparece sinalizada para a Secretaria corrigir
      escopoIncoerente: !!incoerenciaDeEscopo(l.nivel, l.escopoTipo, l.escopoId),
      // papel de nível Global com escopo menor que "todas as congregações": coerente, mas NÃO é o nível geral — essa pessoa não alcança as telas da administração geral
      semAcessoGeral: l.nivel === "GLOBAL" && l.escopoTipo !== "GLOBAL",
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

    if (membroIds.length > MAX_LOTE) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Conceda no máximo ${MAX_LOTE} pessoas por vez.` } };
      return;
    }

    const resultados = [];
    for (const membroIdBruto of membroIds) {
      const membroId = auth.idDeRota(membroIdBruto);
      if (!membroId) {
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

    await conferirSucessaoDeCanais(pool, usuarioId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, resultados } };
    return;
  }

  // ---- POST: conceder ou atualizar acesso ----
  if (method === "POST") {
    const resultado = await concederOuAtualizarLideranca(pool, req.body || {}, usuarioId);
    if (resultado.sucesso) await conferirSucessaoDeCanais(pool, usuarioId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resultado };
    return;
  }

  // ---- DELETE: remover ----
  if (method === "DELETE") {
    if (!auth.idDeRota(membroIdRota)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o membroId na rota: /api/lideranca/{membroId}" } };
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
    await conferirSucessaoDeCanais(pool, usuarioId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Liderança removida." } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
