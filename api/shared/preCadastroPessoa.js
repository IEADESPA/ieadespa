// shared/preCadastroPessoa.js (FASE 10, as sobras de Membros, 19/11/2026) — A PESSOA COMPLETA O PRÓPRIO CADASTRO PELO E-MAIL (migração 183): a coluna "Falta dado:
// a pessoa completa" da esteira (rodada 10). A secretaria pede; o sistema manda um link que vale 7 dias e uma vez só; a pessoa completa só o que é dela (CPF,
// nascimento, sexo, estado civil) numa página pública; o pré-cadastro passa de novo pela fila (preCadastroDb.processar: entra sozinho se ficou completo).
// O código do link nunca fica guardado (só o resumo SHA-256); a página pública só vê o primeiro nome e o que falta — nunca o CPF, o e-mail ou a congregação.
const crypto = require("crypto");
const { sql } = require("./db");
const regras = require("./preCadastro");
const pdb = require("./preCadastroDb");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");

// o que a própria pessoa completa (o resto — a congregação, um CPF repetido — é com a secretaria)
const DA_PESSOA = { FALTA_CPF: "cpf", FALTA_NASCIMENTO: "dataNascimento", FALTA_SEXO: "sexo", FALTA_ESTADO_CIVIL: "estadoCivil" };
const ROTULO = { cpf: "o CPF", dataNascimento: "a data de nascimento", sexo: "o sexo", estadoCivil: "o estado civil" };
const DIAS = 7;
const RX_TOKEN = /^[A-Za-z0-9_-]{32}$/;
const resumo = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");
const primeiroNome = (nome) => String(nome || "").trim().split(/\s+/)[0] || "";

function faltaDaPessoa(pendencias) {
  return regras.lerPendencias(pendencias).map((c) => DA_PESSOA[c]).filter(Boolean);
}

// A secretaria pede à pessoa. Devolve { sucesso, token, email, nome, falta } — quem chama manda o e-mail e, se não sair, chama desfazerPedido.
async function pedir(pool, { id, por }) {
  const token = crypto.randomBytes(24).toString("base64url");
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    const l = (await new sql.Request(t).input("id", sql.Int, id)
      .query(`SELECT Situacao, Email, Nome, Pendencias, PedidoPessoaEm, PedidoPessoaRespondidoEm, PedidoPessoaExpiraEm FROM PreCadastros WITH (UPDLOCK, HOLDLOCK) WHERE PreCadastroId = @id`)).recordset[0];
    if (!l) { await t.rollback(); return { sucesso: false, mensagem: regras.MSG.NAO_EXISTE }; }
    if (l.Situacao !== "PENDENTE") { await t.rollback(); return { sucesso: false, conflito: true, mensagem: "Só o pré-cadastro com dado faltando vai para a própria pessoa." }; }
    if (!l.Email) { await t.rollback(); return { sucesso: false, mensagem: "Este pré-cadastro não tem e-mail: complete você mesma, ou peça o e-mail à pessoa." }; }
    const falta = faltaDaPessoa(l.Pendencias);
    if (!falta.length) { await t.rollback(); return { sucesso: false, mensagem: "O que falta aqui não é a pessoa que completa (é a secretaria)." }; }
    await new sql.Request(t).input("id", sql.Int, id).input("por", sql.Int, por).input("h", sql.Char(64), resumo(token)).input("dias", sql.Int, DIAS)
      .query(`UPDATE PreCadastros SET PedidoPessoaEm = SYSUTCDATETIME(), PedidoPessoaPor = @por, PedidoPessoaTokenHash = @h,
                PedidoPessoaExpiraEm = DATEADD(day, @dias, SYSUTCDATETIME()), PedidoPessoaRespondidoEm = NULL, AtualizadoEm = SYSUTCDATETIME()
              WHERE PreCadastroId = @id`);
    await t.commit();
    await registrarAuditoria({ tabela: "PreCadastros", registroId: id, acao: "Pediu à pessoa que complete o cadastro (e-mail)", usuarioId: por, dadosDepois: { falta } });
    return { sucesso: true, token, email: l.Email, nome: l.Nome, falta };
  } catch (e) {
    try { await t.rollback(); } catch (x) { /* já encerrada */ }
    throw e;
  }
}
// O e-mail não saiu: o pedido não vale (o link nunca chegou a ninguém)
async function desfazerPedido(pool, { id, token }) {
  await pool.request().input("id", sql.Int, id).input("h", sql.Char(64), resumo(token))
    .query(`UPDATE PreCadastros SET PedidoPessoaEm = NULL, PedidoPessoaPor = NULL, PedidoPessoaTokenHash = NULL, PedidoPessoaExpiraEm = NULL WHERE PreCadastroId = @id AND PedidoPessoaTokenHash = @h`);
}

function textoDoEmail({ nome, falta, url }) {
  const lista = falta.map((k) => ROTULO[k]).join(", ").replace(/, ([^,]*)$/, " e $1");
  return `Graça e paz, ${primeiroNome(nome)}!\n\nPara terminar o seu cadastro na Igreja Evangélica Assembleia de Deus (IEADESPA), falta ${lista}.\n\n` +
    `Complete neste endereço (vale 7 dias e uma vez só; não precisa de senha):\n${url}\n\n` +
    "Se você não pediu cadastro na Igreja, ignore esta mensagem: nada será feito.";
}

// A página pública lê: o primeiro nome e o que falta. Código errado, vencido, já usado ou pré-cadastro já resolvido: a MESMA resposta (null).
async function ler(pool, token) {
  if (!RX_TOKEN.test(String(token || ""))) return null;
  const l = (await pool.request().input("h", sql.Char(64), resumo(token))
    .query(`SELECT Nome, Pendencias FROM PreCadastros WHERE PedidoPessoaTokenHash = @h AND PedidoPessoaExpiraEm > SYSUTCDATETIME()
              AND PedidoPessoaRespondidoEm IS NULL AND Situacao = N'PENDENTE'`)).recordset[0];
  if (!l) return null;
  const falta = faltaDaPessoa(l.Pendencias);
  return falta.length ? { nome: primeiroNome(l.Nome), falta } : null;
}

// A pessoa completa: só os campos que faltavam e são dela; o link deixa de valer; o pré-cadastro passa de novo pela fila.
async function completar(pool, { token, campos }) {
  if (!RX_TOKEN.test(String(token || ""))) return { sucesso: false, naoExiste: true };
  const c = campos && typeof campos === "object" && !Array.isArray(campos) ? campos : {};
  const t = new sql.Transaction(pool);
  await t.begin();
  let id;
  try {
    const l = (await new sql.Request(t).input("h", sql.Char(64), resumo(token))
      .query(`SELECT PreCadastroId, Nome, Cpf, Email, Telefone, CONVERT(varchar(10), DataNascimento, 120) AS DataNascimento, Sexo, EstadoCivil, CongregacaoId, Pendencias
              FROM PreCadastros WITH (UPDLOCK, HOLDLOCK) WHERE PedidoPessoaTokenHash = @h AND PedidoPessoaExpiraEm > SYSUTCDATETIME()
                AND PedidoPessoaRespondidoEm IS NULL AND Situacao = N'PENDENTE'`)).recordset[0];
    if (!l) { await t.rollback(); return { sucesso: false, naoExiste: true }; }
    id = l.PreCadastroId;
    const falta = faltaDaPessoa(l.Pendencias);
    const novo = { nome: l.Nome, cpf: l.Cpf ? String(l.Cpf).trim() : null, email: l.Email, telefone: l.Telefone, dataNascimento: l.DataNascimento || null,
      sexo: l.Sexo ? String(l.Sexo).trim() : null, estadoCivil: l.EstadoCivil, congregacaoId: l.CongregacaoId == null ? null : Number(l.CongregacaoId) };
    for (const k of falta) {
      const v = c[k];
      if (v === undefined || v === null || String(v).trim() === "") { await t.rollback(); return { sucesso: false, mensagem: `Preencha ${ROTULO[k]}.` }; }
      novo[k] = v;
    }
    const lido = regras.lerEntrada(novo, { hojeISO: hojeBrasilia() });
    if (!lido.ok) { await t.rollback(); return { sucesso: false, mensagem: lido.mensagem }; }
    const d = lido.dados;
    await new sql.Request(t).input("id", sql.Int, id).input("cpf", sql.Char(11), d.cpf).input("nasc", sql.Date, d.dataNascimento).input("sexo", sql.NChar(1), d.sexo)
      .input("ec", sql.NVarChar(20), d.estadoCivil)
      .query(`UPDATE PreCadastros SET Cpf = @cpf, DataNascimento = @nasc, Sexo = @sexo, EstadoCivil = @ec, PedidoPessoaTokenHash = NULL,
                PedidoPessoaRespondidoEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME() WHERE PreCadastroId = @id`);
    await t.commit();
  } catch (e) {
    try { await t.rollback(); } catch (x) { /* já encerrada */ }
    throw e;
  }
  await registrarAuditoria({ tabela: "PreCadastros", registroId: id, acao: "A pessoa completou o próprio cadastro (link do e-mail)", usuarioId: null, dadosDepois: { pelaPessoa: true } });
  // de novo pela fila: entra sozinha se ficou completa e não é parecida com ninguém (a resposta à pessoa é a mesma em qualquer caso: nada revela se já é da Igreja)
  try { await pdb.processar(pool, id); } catch (e) { console.error("[preCadastroPessoa] processar:", e && e.message); }
  return { sucesso: true, mensagem: "Pronto! Recebemos. A secretaria da sua congregação confere e você recebe um e-mail para criar a senha." };
}

module.exports = { DA_PESSOA, DIAS, pedir, desfazerPedido, textoDoEmail, ler, completar, faltaDaPessoa, RX_TOKEN };
