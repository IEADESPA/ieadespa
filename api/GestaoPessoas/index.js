// GestaoPessoas
// Cadastro de obreiros (MembroReferencia). Exige a permissão "pessoas".
// GET    /api/pessoas            -> lista (filtrada pelo escopo de quem está logado)
// POST   /api/pessoas            -> body: { membroId, nome, funcao, congregacaoId, status, ... } -> cria ou atualiza
// DELETE /api/pessoas/{membroId} -> não remove de verdade: marca status = DESLIGADO
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const disciplina = require("../shared/disciplina");

const SELECT_MEMBRO = `
  SELECT m.MembroId AS membroId, m.Nome AS nome, m.Funcao AS funcao, m.CongregacaoId AS congregacaoId,
         c.Nome AS congregacao, m.Status AS status,
         CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento,
         CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
         m.DizimistaFiel AS dizimistaFiel, m.SituacaoMembro AS situacaoMembro, m.DepartamentoId AS departamentoId,
         m.CargoMinisterial AS cargoMinisterial, m.Telefone AS telefone, m.Email AS email, m.Endereco AS endereco,
         m.ExtensaoId AS extensaoId, e.Nome AS extensao
  FROM MembroReferencia m
  LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
  LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const membroIdRota = context.bindingData.membroId;
  const pool = await getPool();

  // ---- GET: listar (só quem está no escopo de quem está logado) ----
  if (method === "GET") {
    // Mascaramento intencional (sigilo do processo disciplinar): só quem tem a
    // permissão "disciplina" recebe o dado real de processo ativo — sem ele, o membro
    // aparece com a categoria normal na lista, mesmo estando sob disciplina de verdade.
    const idsSobDisciplina = usuario.permissoes.includes("disciplina")
      ? await disciplina.membrosSobDisciplina(pool)
      : new Set();
    const result = await pool.request().query(`${SELECT_MEMBRO} ORDER BY m.Nome`);
    const membros = result.recordset
      .filter(m => auth.estaNoEscopo(usuario, m.congregacao))
      // Escopo EXTENSAO é mais estreito que a Congregação-Mãe (já garantida acima):
      // só quem tem exatamente essa Extensão vinculada entra na lista.
      .filter(m => !usuario.escopoExtensaoNome || m.extensao === usuario.escopoExtensaoNome)
      .map(m => Object.assign({}, m, { processoDisciplinarAtivo: idsSobDisciplina.has(m.membroId) }))
      .map(m => Object.assign({}, m, { capacidade: estatuto.calcularCapacidadeEleitoral(m) }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: membros };
    return;
  }

  // ---- POST: criar ou atualizar ----
  if (method === "POST") {
    const {
      membroId, nome, funcao, congregacaoId, status, dataNascimento, dataAdmissao, dizimistaFiel,
      situacaoMembro, departamentoId, cargoMinisterial, telefone, email, endereco, extensaoId
    } = req.body || {};
    if (!membroId || !nome) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, nome." } };
      return;
    }
    if (funcao) {
      const f = await pool.request().input("nome", sql.NVarChar(100), funcao).query(`SELECT TOP 1 1 AS x FROM Funcoes WHERE Nome = @nome`);
      if (f.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Função "${funcao}" não está cadastrada.` } };
        return;
      }
    }
    if (congregacaoId) {
      const c = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT TOP 1 1 AS x FROM Congregacoes WHERE CongregacaoId = @id`);
      if (c.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação inválida." } };
        return;
      }
    }
    if (departamentoId) {
      const d = await pool.request().input("id", sql.Int, departamentoId).query(`SELECT TOP 1 1 AS x FROM Departamentos WHERE DepartamentoId = @id`);
      if (d.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Departamento inválido." } };
        return;
      }
    }
    if (cargoMinisterial) {
      const cm = await pool.request().input("sigla", sql.NVarChar(30), cargoMinisterial).query(`SELECT TOP 1 1 AS x FROM CargosMinisteriais WHERE Sigla = @sigla`);
      if (cm.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Cargo ministerial "${cargoMinisterial}" não está cadastrado.` } };
        return;
      }
    }
    if (extensaoId) {
      const ex = await pool.request().input("id", sql.Int, extensaoId).query(`SELECT TOP 1 1 AS x FROM ExtensoesTenda WHERE ExtensaoId = @id`);
      if (ex.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Extensão da Tenda inválida." } };
        return;
      }
    }

    const existente = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    const existia = existente.recordset.length > 0;
    const situacaoFinal = situacaoMembro || (status === "ATIVO" ? "EM_COMUNHAO" : "SEM_COMUNHAO");

    const request = pool.request()
      .input("id", sql.Int, membroId)
      .input("nome", sql.NVarChar(200), nome)
      .input("funcao", sql.NVarChar(100), funcao || null)
      .input("congregacaoId", sql.Int, congregacaoId || null)
      .input("status", sql.NVarChar(20), status || "ATIVO")
      .input("dataNascimento", sql.Date, dataNascimento || null)
      .input("dataAdmissao", sql.Date, dataAdmissao || null)
      .input("dizimistaFiel", sql.Bit, dizimistaFiel === undefined ? null : dizimistaFiel)
      .input("situacaoMembro", sql.NVarChar(30), situacaoFinal)
      .input("departamentoId", sql.Int, departamentoId || null)
      .input("cargoMinisterial", sql.NVarChar(30), cargoMinisterial || null)
      .input("telefone", sql.NVarChar(20), telefone || null)
      .input("email", sql.NVarChar(150), email || null)
      .input("endereco", sql.NVarChar(300), endereco || null)
      .input("extensaoId", sql.Int, extensaoId || null);

    if (existia) {
      await request.query(`
        UPDATE MembroReferencia SET Nome = @nome, Funcao = @funcao, CongregacaoId = @congregacaoId, Status = @status,
               DataNascimento = @dataNascimento, DataAdmissao = @dataAdmissao, DizimistaFiel = @dizimistaFiel,
               SituacaoMembro = @situacaoMembro, DepartamentoId = @departamentoId, CargoMinisterial = @cargoMinisterial,
               Telefone = @telefone, Email = @email, Endereco = @endereco, ExtensaoId = @extensaoId
        WHERE MembroId = @id`);
    } else {
      await request.query(`
        INSERT INTO MembroReferencia (MembroId, Nome, Funcao, CongregacaoId, Status, DataNascimento, DataAdmissao, DizimistaFiel, SituacaoMembro, DepartamentoId, CargoMinisterial, Telefone, Email, Endereco, ExtensaoId)
        VALUES (@id, @nome, @funcao, @congregacaoId, @status, @dataNascimento, @dataAdmissao, @dizimistaFiel, @situacaoMembro, @departamentoId, @cargoMinisterial, @telefone, @email, @endereco, @extensaoId)`);
    }

    const result = await pool.request().input("id", sql.Int, membroId).query(`${SELECT_MEMBRO} WHERE m.MembroId = @id`);
    const membro = result.recordset[0];
    if (usuario.permissoes.includes("disciplina")) {
      const idsSobDisciplina = await disciplina.membrosSobDisciplina(pool);
      membro.processoDisciplinarAtivo = idsSobDisciplina.has(membro.membroId);
    }
    membro.capacidade = estatuto.calcularCapacidadeEleitoral(membro);

    await registrarAuditoria({
      tabela: "MembroReferencia",
      registroId: Number(membroId),
      acao: existia ? "Atualizou pessoa" : "Cadastrou pessoa",
      usuarioId: usuario.membroId,
      dadosDepois: { nome, funcao, congregacaoId, status }
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: existia ? "✅ Pessoa atualizada." : "✅ Pessoa cadastrada.", membro } };
    return;
  }

  // ---- DELETE: desligar (não remove de verdade) ----
  if (method === "DELETE") {
    if (!membroIdRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o membroId na rota: /api/pessoas/{membroId}" } };
      return;
    }
    const upd = await pool.request().input("id", sql.Int, membroIdRota).query(`UPDATE MembroReferencia SET Status = 'DESLIGADO' WHERE MembroId = @id`);
    if (upd.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    await registrarAuditoria({ tabela: "MembroReferencia", registroId: Number(membroIdRota), acao: "Desligou pessoa", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Pessoa desligada." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
