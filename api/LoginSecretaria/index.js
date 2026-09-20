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
           l.DepartamentoId AS departamentoId,
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

  const permissoesProprias = lideranca.permissoesStr ? lideranca.permissoesStr.split(",").map(p => p.trim()).filter(Boolean) : [];

  // v10.2 — achado real de medição ao vivo (19/09): login media 3.66s numa
  // Function fria / 0.82s já quente, e a fatia "quente" era majoritariamente
  // estas 5 consultas rodando em SÉRIE (await uma a uma) sem nenhuma delas
  // depender do resultado da anterior — só se combinam depois daqui.
  // Promise.all corta ~4 idas e vindas ao Azure SQL do caminho mais sensível
  // a latência do sistema (todo login passa por ele).
  const [escopo, escopoExtensaoNome, pendentes, delegados, expiradas] = await Promise.all([
    resolverEscopoCongregacoes(pool, lideranca.escopoTipo, lideranca.escopoId),
    resolverNomeExtensao(pool, lideranca.escopoTipo, lideranca.escopoId),
    termosPendentes(pool, sql, lideranca.membroId, lideranca.papelNivel),
    // vB.9 — delegação temporária: soma (nunca substitui) o que outra pessoa
    // te delegou por um prazo, sem precisar emprestar senha de ninguém.
    permissoesEscopoDelegados(pool, sql, lideranca.membroId, hoje),
    // vB.9 — revisão periódica com efeito real: permissão cuja recertificação
    // mais recente está EXPIRADA (v4.12, hoje generalizada a todos os papéis)
    // não entra na sessão nova, até alguém confirmar de novo (GestaoCompliance).
    permissoesComRecertificacaoExpirada(pool, sql, lideranca.membroId)
  ]);
  const { permissoesExtras, escopoExtra, delegacoesAtivas } = delegados;
  const uniao = [...new Set([...permissoesProprias, ...permissoesExtras])];
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
    // v5.2 — Líder Local/de Área de um departamento específico (Lideranca.
    // DepartamentoId). NULL = enxerga todos (Dirigente, Pastor de Área, sem
    // mudança). Mesma limitação de sempre no "escolhe 1 vínculo por login"
    // acima: alguém com Líder Local em 2 departamentos na mesma congregação
    // só loga com um por vez, critério de amplitude territorial, não de
    // departamento — documentado, não escondido.
    // v5.3 — Líder Geral (v2.7) guarda o departamento de outro jeito
    // (`EscopoTipo='DEPARTAMENTO'`, `EscopoId`=departamentoId — mecanismo
    // mais antigo, sem território), não na coluna `DepartamentoId` nova.
    // Sem este `||`, o Líder Geral logava sem departamento nenhum na sessão
    // e `auth.podeDepartamento` barrava ele até das próprias aprovações.
    departamentoId: lideranca.escopoTipo === "DEPARTAMENTO" ? lideranca.escopoId : (lideranca.departamentoId || null),
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
