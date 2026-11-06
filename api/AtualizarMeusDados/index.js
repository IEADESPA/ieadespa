// AtualizarMeusDados (v1.11 — público, autoatendimento por matrícula)
// Campos "editável direto, sem aprovação" (classificação registrada no README,
// v1.10): Telefone, E-mail, Endereço, Estado Civil — baixo risco, o próprio
// membro é quem sabe de verdade, e não compensa revisão manual (mesmo racional
// já usado pra Foto). Mesmo modelo de acesso de MeusDadosLGPD/MinhaFoto.
// POST /api/meus-dados/{matricula} -> body: { telefone?, email?, endereco?, enderecoPartes?, estadoCivil? }
// v9.5 — o endereço em linhas (enderecoPartes: logradouro, número, complemento, bairro da lista ou escrito, cidade, UF e CEP); a linha única é montada com elas.
// O GET devolve também as linhas e a lista dos bairros cadastrados (nome, cidade e UF — catálogo, sem dado de ninguém).
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const auth = require("../shared/auth");
const territorioDb = require("../shared/territorioDb");

const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "VIUVO", "DIVORCIADO", "UNIAO_ESTAVEL"];

module.exports = async function (context, req) {
  // fecho da v7.5 — exige sessão e só a matrícula da própria sessão. Antes, quem soubesse o número lia e TROCAVA telefone, e-mail e endereço de qualquer
  // pessoa (e o e-mail é para onde vai o código de acesso).
  const matricula = context.bindingData.matricula;
  if (!auth.exigirTitular(req, context, matricula)) return;

  const pool = await getPool();

  // ---- GET: valores atuais, pra prefill do formulário (sem trava de LGPD — é
  // só o básico que o próprio membro está prestes a editar, diferente do
  // dossiê completo de MeusDadosLGPD) ----
  if (req.method === "GET") {
    const result = await pool.request().input("id", sql.Int, matricula).query(`
      SELECT m.Telefone AS telefone, m.Email AS email, m.Endereco AS endereco, m.EstadoCivil AS estadoCivil, ${territorioDb.SELECT_PARTES_MEUS},
             CONVERT(varchar(10), DataNascimento, 120) AS dataNascimento,
             CONVERT(varchar(10), DataAdmissao, 120) AS dataAdmissao,
             CONVERT(varchar(10), DataBatismo, 120) AS dataBatismo,
             FormaAdmissao AS formaAdmissao, Origem AS origem, IgrejaAnterior AS igrejaAnterior,
             CONVERT(varchar(10), DataRitoRecebimento, 120) AS dataRitoRecebimento,
             NomeLidoRito AS nomeLidoRito, MinistranteRito AS ministranteRito
      FROM MembroReferencia m LEFT JOIN Bairros bm ON bm.BairroId = m.EnderecoBairroId WHERE m.MembroId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    const linha = result.recordset[0];
    const dados = {};
    for (const [k, v] of Object.entries(linha)) if (!/^(Endereco|BairroNome)/.test(k)) dados[k] = v;
    dados.enderecoPartes = territorioDb.partesDaLinha(linha);
    const bairros = await territorioDb.bairrosParaEscolher(pool);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, dados, bairros } };
    return;
  }

  const { telefone, email, endereco, estadoCivil, enderecoPartes } = req.body || {};
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

  // o endereço: as linhas novas (a linha única montada com elas) ou só a linha única (tela antiga: as linhas ficam se ela não mudou, somem se mudou)
  let enderecoFinal = atual.Endereco, partesFinais, mexeuNoEndereco = false;
  if (enderecoPartes !== undefined && enderecoPartes !== null) {
    const prep = await territorioDb.prepararEnderecoMembro(() => pool.request(), enderecoPartes);
    if (!prep.sucesso) { context.res = { status: 200, body: { sucesso: false, mensagem: prep.mensagem } }; return; }
    enderecoFinal = prep.endereco; partesFinais = prep.partes; mexeuNoEndereco = true;
  } else if (endereco !== undefined) {
    enderecoFinal = endereco || null;
    partesFinais = await territorioDb.linhasDiantedaLinhaLegada(() => pool.request(), matricula, enderecoFinal);
    mexeuNoEndereco = true;
  }

  const gravar = pool.request()
    .input("id", sql.Int, matricula)
    .input("telefone", sql.NVarChar(20), telefone !== undefined ? (telefone || null) : atual.Telefone)
    .input("email", sql.NVarChar(150), email !== undefined ? (email || null) : atual.Email)
    .input("endereco", sql.NVarChar(300), enderecoFinal)
    .input("estadoCivil", sql.NVarChar(20), estadoCivil !== undefined ? (estadoCivil || null) : atual.EstadoCivil);
  if (mexeuNoEndereco) territorioDb.entradasEndereco(gravar, partesFinais);
  await gravar.query(`UPDATE MembroReferencia SET Telefone = @telefone, Email = @email, Endereco = @endereco, EstadoCivil = @estadoCivil${mexeuNoEndereco ? `, ${territorioDb.SET_ENDERECO}` : ""} WHERE MembroId = @id`);

  await registrarAuditoria({
    tabela: "MembroReferencia",
    registroId: Number(matricula),
    acao: "Atualizou os próprios dados (autoatendimento)",
    usuarioId: Number(matricula),
    dadosAntes: { telefone: atual.Telefone, email: atual.Email, endereco: atual.Endereco, estadoCivil: atual.EstadoCivil },
    dadosDepois: { telefone, email, endereco: mexeuNoEndereco ? enderecoFinal : undefined, estadoCivil }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Dados atualizados." } };
};
