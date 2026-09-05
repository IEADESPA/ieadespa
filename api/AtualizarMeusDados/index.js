// AtualizarMeusDados (v1.11 — público, autoatendimento por matrícula)
// Campos "editável direto, sem aprovação" (classificação registrada no README,
// v1.10): Telefone, E-mail, Endereço, Estado Civil — baixo risco, o próprio
// membro é quem sabe de verdade, e não compensa revisão manual (mesmo racional
// já usado pra Foto). Mesmo modelo de acesso de MeusDadosLGPD/MinhaFoto.
// POST /api/meus-dados/{matricula} -> body: { telefone?, email?, endereco?, estadoCivil? }
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "VIUVO", "DIVORCIADO", "UNIAO_ESTAVEL"];

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }

  const pool = await getPool();

  // ---- GET: valores atuais, pra prefill do formulário (sem trava de LGPD — é
  // só o básico que o próprio membro está prestes a editar, diferente do
  // dossiê completo de MeusDadosLGPD) ----
  if (req.method === "GET") {
    const result = await pool.request().input("id", sql.Int, matricula).query(`
      SELECT Telefone AS telefone, Email AS email, Endereco AS endereco, EstadoCivil AS estadoCivil,
             CONVERT(varchar(10), DataNascimento, 120) AS dataNascimento,
             CONVERT(varchar(10), DataAdmissao, 120) AS dataAdmissao,
             CONVERT(varchar(10), DataBatismo, 120) AS dataBatismo,
             FormaAdmissao AS formaAdmissao, Origem AS origem, IgrejaAnterior AS igrejaAnterior,
             CONVERT(varchar(10), DataRitoRecebimento, 120) AS dataRitoRecebimento,
             NomeLidoRito AS nomeLidoRito, MinistranteRito AS ministranteRito
      FROM MembroReferencia WHERE MembroId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, dados: result.recordset[0] } };
    return;
  }

  const { telefone, email, endereco, estadoCivil } = req.body || {};
  if (estadoCivil && !ESTADOS_CIVIS.includes(estadoCivil)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: `Estado civil inválido. Use um de: ${ESTADOS_CIVIS.join(", ")}.` } };
    return;
  }

  const antes = await pool.request().input("id", sql.Int, matricula)
    .query(`SELECT MembroId, Telefone, Email, Endereco, EstadoCivil FROM MembroReferencia WHERE MembroId = @id`);
  if (antes.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  const atual = antes.recordset[0];

  await pool.request()
    .input("id", sql.Int, matricula)
    .input("telefone", sql.NVarChar(20), telefone !== undefined ? (telefone || null) : atual.Telefone)
    .input("email", sql.NVarChar(150), email !== undefined ? (email || null) : atual.Email)
    .input("endereco", sql.NVarChar(300), endereco !== undefined ? (endereco || null) : atual.Endereco)
    .input("estadoCivil", sql.NVarChar(20), estadoCivil !== undefined ? (estadoCivil || null) : atual.EstadoCivil)
    .query(`UPDATE MembroReferencia SET Telefone = @telefone, Email = @email, Endereco = @endereco, EstadoCivil = @estadoCivil WHERE MembroId = @id`);

  await registrarAuditoria({
    tabela: "MembroReferencia",
    registroId: Number(matricula),
    acao: "Atualizou os próprios dados (autoatendimento)",
    usuarioId: Number(matricula),
    dadosAntes: { telefone: atual.Telefone, email: atual.Email, endereco: atual.Endereco, estadoCivil: atual.EstadoCivil },
    dadosDepois: { telefone, email, endereco, estadoCivil }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Dados atualizados." } };
};
