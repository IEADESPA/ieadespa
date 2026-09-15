// LoginSecretaria
// Só quem tem registro em Lideranca (Dirigente, Pastor de Área etc.) consegue
// logar no painel da Secretaria. Ver api/shared/auth.js.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { resolverEscopoCongregacoes, resolverNomeExtensao } = require("../shared/escopo");
const { termosPendentes } = require("../shared/termos");
const { permissoesEscopoDelegados } = require("../shared/delegacoes");
const { permissoesComRecertificacaoExpirada } = require("../shared/compliance");

module.exports = async function (context, req) {
  const { matricula, senha } = req.body || {};

  if (!matricula || !senha) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe matrícula e senha." } };
    return;
  }

  const pool = await getPool();
  const result = await pool.request().input("mat", sql.Int, matricula).query(`
    SELECT l.MembroId AS membroId, l.EscopoTipo AS escopoTipo, l.EscopoId AS escopoId, l.SenhaHash AS senhaHash,
           CONVERT(varchar(10), l.AtivoAte, 120) AS ativoAte,
           p.Nome AS papelNome, p.Nivel AS papelNivel, p.Permissoes AS permissoesStr, m.Nome AS nome
    FROM Lideranca l
    JOIN Papeis p ON p.PapelId = l.PapelId
    JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE l.MembroId = @mat
  `);
  if (result.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula sem acesso à Secretaria." } };
    return;
  }

  // vB.9 — achado real (v4.5): quando a matrícula tem mais de um papel de
  // Lideranca, não existia critério nenhum pra escolher qual (nem TOP 1,
  // nem ORDER BY) — o SQL Server devolvia em ordem indefinida, então tanto
  // fazia qual senha/permissão/nível "vencia" a cada login, sem ninguém
  // decidir isso de propósito (podia até cair numa linha sem SenhaHash e
  // travar o login de vez). Corrigido: confere a senha contra TODAS as
  // linhas com hash, e entre as que baterem, escolhe a de MAIOR amplitude
  // territorial (RANKING_NIVEL) — critério único e sempre o mesmo.
  const candidatas = result.recordset.filter((l) => l.senhaHash && auth.verificarSenha(senha, l.senhaHash));
  if (candidatas.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Senha incorreta." } };
    return;
  }
  candidatas.sort((a, b) => (auth.RANKING_NIVEL[b.papelNivel] || 0) - (auth.RANKING_NIVEL[a.papelNivel] || 0));
  const lideranca = candidatas[0];

  // Art. 45 §1º, I — Medida Cautelar de suspensão de acesso ao sistema
  // (GestaoMedidasCautelares grava AtivoAte = hoje na hora que aplica).
  const hoje = new Date().toISOString().slice(0, 10);
  if (lideranca.ativoAte && lideranca.ativoAte < hoje) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Acesso suspenso — procure a Secretaria Geral." } };
    return;
  }

  const escopo = await resolverEscopoCongregacoes(pool, lideranca.escopoTipo, lideranca.escopoId);
  const escopoExtensaoNome = await resolverNomeExtensao(pool, lideranca.escopoTipo, lideranca.escopoId);
  const permissoesProprias = lideranca.permissoesStr ? lideranca.permissoesStr.split(",").map(p => p.trim()).filter(Boolean) : [];
  const pendentes = await termosPendentes(pool, sql, lideranca.membroId, lideranca.papelNivel);

  // vB.9 — delegação temporária: soma (nunca substitui) o que outra pessoa
  // te delegou por um prazo, sem precisar emprestar senha de ninguém.
  const { permissoesExtras, escopoExtra, delegacoesAtivas } = await permissoesEscopoDelegados(pool, sql, lideranca.membroId, hoje);
  const uniao = [...new Set([...permissoesProprias, ...permissoesExtras])];
  // vB.9 — revisão periódica com efeito real: permissão cuja recertificação
  // mais recente está EXPIRADA (v4.12, hoje generalizada a todos os papéis)
  // não entra na sessão nova, até alguém confirmar de novo (GestaoCompliance).
  const expiradas = await permissoesComRecertificacaoExpirada(pool, sql, lideranca.membroId);
  const permissoes = uniao.filter((p) => !expiradas.includes(p));
  const escopoFinal = (escopo === "TODAS" || escopoExtra === "TODAS") ? "TODAS" : [...new Set([...escopo, ...escopoExtra])];

  // vB.9 — trilha de sessão: guarda o dispositivo (User-Agent) que logou,
  // pra tela "Minhas Sessões".
  const dispositivoInfo = (req.headers && (req.headers["user-agent"] || req.headers["User-Agent"])) || null;
  const token = await auth.criarSessao(pool, sql, {
    membroId: lideranca.membroId,
    nome: lideranca.nome,
    tipo: lideranca.papelNome,
    nivel: lideranca.papelNivel,
    escopoCongregacoes: escopoFinal,
    escopoExtensaoNome,
    permissoes,
    termosPendentes: pendentes
  }, dispositivoInfo);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      token,
      nome: lideranca.nome,
      tipo: lideranca.papelNome,
      nivel: lideranca.papelNivel,
      escopo: escopoFinal,
      permissoes,
      termosPendentes: pendentes,
      delegacoesAtivas
    }
  };
};
