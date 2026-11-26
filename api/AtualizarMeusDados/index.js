// AtualizarMeusDados (v1.11 — autoatendimento por matrícula)
// O que o próprio membro muda SOZINHO, sem a secretaria conferir: o contato (telefone, e-mail), o endereço e — FASE 10, v10.1b passo 5 (18/11/2026, rodada 10
// da gestão de membros) — o que estiver VAZIO na ficha (nascimento, sexo, estado civil, escolaridade, CPF, nome da mãe e do pai). O que já está preenchido ele
// SUGERE (SolicitarEdicaoPessoa) e a secretaria confere na caixa de sugestões (GestaoFilaAprovacoes). Antes, o estado civil mudava direto mesmo preenchido: era o
// atalho da Trava 8-A (o estado civil conta para a escada); agora preenchido = sugestão.
// GET  /api/meus-dados/{matricula} -> os dados, as linhas do endereço, a lista de bairros e `campos` (o modo de cada campo: MUDA, SUGERE, NAO; e se já há sugestão
//                                      esperando a secretaria)
// POST /api/meus-dados/{matricula} -> body: { telefone?, email?, endereco?, enderecoPartes?, estadoCivil?, dataNascimento?, sexo?, escolaridade?, cpf?, nomeMae?, nomePai? }
// Tudo numa transação com a ficha travada (shared/edicaoFichaDb.js): o que mudou no meio (uma sugestão aplicada, a secretaria) nunca volta ao valor antigo.
// v9.5 — o endereço em linhas (enderecoPartes: logradouro, número, complemento, bairro da lista ou escrito, cidade, UF e CEP); a linha única é montada com elas.
const { getPool, sql } = require("../shared/db");
const auth = require("../shared/auth");
const territorioDb = require("../shared/territorioDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { enviarEmailNotificacao } = require("../shared/notificacaoEmail");
const edicaoFichaDb = require("../shared/edicaoFichaDb");

// os campos que o membro manda por aqui (o endereço vai à parte); qualquer outro é ignorado, como antes
const CAMPOS_DO_MEMBRO = ["telefone", "email", "estadoCivil", "dataNascimento", "sexo", "escolaridade", "cpf", "nomeMae", "nomePai"];

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
      SELECT m.Nome AS nome, m.Telefone AS telefone, m.Email AS email, m.Endereco AS endereco, m.EstadoCivil AS estadoCivil, m.Sexo AS sexo, ${territorioDb.SELECT_PARTES_MEUS},
             CONVERT(varchar(10), DataNascimento, 120) AS dataNascimento,
             CONVERT(varchar(10), DataAdmissao, 120) AS dataAdmissao,
             CONVERT(varchar(10), DataBatismo, 120) AS dataBatismo,
             FormaAdmissao AS formaAdmissao, Origem AS origem, IgrejaAnterior AS igrejaAnterior,
             CONVERT(varchar(10), DataRitoRecebimento, 120) AS dataRitoRecebimento,
             NomeLidoRito AS nomeLidoRito, MinistranteRito AS ministranteRito,
             m.Cpf AS cpf, m.NomeMae AS nomeMae, m.NomePai AS nomePai, m.Escolaridade AS escolaridade
      FROM MembroReferencia m LEFT JOIN Bairros bm ON bm.BairroId = m.EnderecoBairroId WHERE m.MembroId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    const linha = result.recordset[0];
    const dados = {};
    for (const [k, v] of Object.entries(linha)) if (!/^(Endereco|BairroNome)/.test(k)) dados[k] = v;
    dados.enderecoPartes = territorioDb.partesDaLinha(linha);
    // v10.1b (decisão do responsável, 13/11/2026) — a própria pessoa vê o próprio CPF inteiro em Meus Dados (a rota só abre para a matrícula da sessão: exigirTitular)
    const cpfProprio = linha.cpf ? String(linha.cpf).trim() : null;
    dados.cpf = cpfProprio && cpfProprio.length === 11 ? `${cpfProprio.slice(0, 3)}.${cpfProprio.slice(3, 6)}.${cpfProprio.slice(6, 9)}-${cpfProprio.slice(9)}` : null;
    const bairros = await territorioDb.bairrosParaEscolher(pool);
    const campos = await edicaoFichaDb.regrasDoMembro(pool, matricula);
    context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: { sucesso: true, dados, bairros, campos } };
    return;
  }

  const corpo = req.body && typeof req.body === "object" ? req.body : {};
  const valores = {};
  for (const k of CAMPOS_DO_MEMBRO) if (Object.prototype.hasOwnProperty.call(corpo, k) && corpo[k] !== undefined) valores[k] = corpo[k];

  // o endereço: as linhas novas (a linha única montada com elas) ou só a linha única (tela antiga: as linhas ficam se ela não mudou, somem se mudou)
  let prepEnd = null;
  if (corpo.enderecoPartes !== undefined && corpo.enderecoPartes !== null) {
    const prep = await territorioDb.prepararEnderecoMembro(() => pool.request(), corpo.enderecoPartes, { membroId: matricula });
    if (!prep.sucesso) { context.res = { status: 200, body: { sucesso: false, mensagem: prep.mensagem } }; return; }
    prepEnd = { partes: prep.partes, endereco: prep.endereco };
  } else if (corpo.endereco !== undefined) {
    const enderecoFinal = typeof corpo.endereco === "string" ? corpo.endereco.replace(/\s+/g, " ").trim().slice(0, 300) || null : null;
    prepEnd = { endereco: enderecoFinal, partes: await territorioDb.linhasDiantedaLinhaLegada(() => pool.request(), matricula, enderecoFinal) };
  }

  const r = await edicaoFichaDb.gravarDoMembro(pool, { membroId: Number(matricula), valores, prepEnd, hoje: hojeBrasilia() });
  if (r.sucesso && r.emailAnterior) {
    // quem toma a sessão de alguém e troca o e-mail fica com o código de acesso: o endereço antigo é avisado (a mesma regra da secretaria)
    try {
      await enviarEmailNotificacao({ email: r.emailAnterior, titulo: "O e-mail do seu cadastro na IEADESPA foi alterado",
        mensagem: `O e-mail do cadastro da matrícula ${matricula} foi alterado em Meus Dados. Se foi você, não há nada a fazer; se não foi, avise a Secretaria da sua congregação.` });
    } catch (e) { context.log.error("Falha ao avisar o e-mail antigo:", e.message); }
  }
  context.res = { status: 200, headers: { "Content-Type": "application/json" },
    body: { sucesso: !!r.sucesso, mensagem: r.mensagem, ...(r.mudou ? { mudou: r.mudou } : {}), ...(r.campo ? { campo: r.campo } : {}) } };
};
