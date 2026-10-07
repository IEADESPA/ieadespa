// shared/sessaoLideranca.js (vD.4, 07/10/2026) — o que o login da liderança faz DEPOIS da senha certa, em módulo
// próprio, porque agora duas rotas concluem o login: LoginSecretaria (quem não tem segundo fator) e SegundoFator
// (depois da chave de acesso ou do código). O texto das regras é o mesmo que estava em LoginSecretaria/index.js.
const auth = require("./auth");
const { sql } = require("./db");
const { resolverEscopoCongregacoes, resolverNomeExtensao } = require("./escopo");
const { ehGeral } = require("./escopoRotas");
const { termosPendentes } = require("./termos");
const { concessoesDelegadas } = require("./delegacoes");
const { hojeBrasilia } = require("./dataBrasilia");
const { permissoesComRecertificacaoExpirada } = require("./compliance");

// Todas as linhas de Lideranca da matrícula (uma pessoa pode ter mais de um cargo).
async function buscarLiderancas(pool, matricula) {
  const result = await pool.request().input("mat", sql.Int, matricula).query(`
    SELECT l.MembroId AS membroId, l.PapelId AS papelId, l.EscopoTipo AS escopoTipo, l.EscopoId AS escopoId, l.SenhaHash AS senhaHash,
           l.DepartamentoId AS departamentoId,
           CONVERT(varchar(10), l.AtivoAte, 120) AS ativoAte,
           p.Nome AS papelNome, p.Nivel AS papelNivel, p.Permissoes AS permissoesStr, m.Nome AS nome
    FROM Lideranca l
    JOIN Papeis p ON p.PapelId = l.PapelId
    JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE l.MembroId = @mat
  `);
  return result.recordset;
}

// vB.9 — achado real (v4.5): com mais de um cargo, confere a senha contra TODAS as linhas com hash e, entre as que baterem, escolhe a de MAIOR
// amplitude territorial (RANKING_NIVEL) — critério único e sempre o mesmo.
function escolherPelaSenha(linhas, senha) {
  const candidatas = linhas.filter((l) => l.senhaHash && auth.verificarSenha(senha, l.senhaHash));
  if (candidatas.length === 0) return null;
  candidatas.sort((a, b) => (auth.RANKING_NIVEL[b.papelNivel] || 0) - (auth.RANKING_NIVEL[a.papelNivel] || 0));
  return candidatas[0];
}

// A segunda etapa recebe só a matrícula e o cargo pelo bilhete; a linha é relida do banco (nada de permissão vem do bilhete).
async function reler(pool, { membroId, papelId, escopoTipo, escopoId }) {
  const linhas = await buscarLiderancas(pool, membroId);
  return linhas.find((l) => l.papelId === papelId && l.escopoTipo === escopoTipo && String(l.escopoId) === String(escopoId)) || null;
}

// Art. 45 §1º, I — Medida Cautelar de suspensão de acesso ao sistema (GestaoMedidasCautelares grava AtivoAte = hoje na hora que aplica).
const suspensa = (lideranca, hoje) => !!(lideranca.ativoAte && lideranca.ativoAte < hoje);

// Monta a sessão e a resposta do login. `fator` = { via: "CHAVE" | "CODIGO" | "NENHUM", em: Date.now() } (vD.4): fica na sessão para a
// confirmação reforçada dos quatro atos saber se a confirmação é recente.
async function concluirLogin(pool, req, lideranca, { fator }) {
  const hoje = hojeBrasilia();
  const permissoesProprias = lideranca.permissoesStr ? lideranca.permissoesStr.split(",").map((p) => p.trim()).filter(Boolean) : [];

  // v10.2 — 5 consultas em paralelo (nenhuma depende da anterior): corta ~4 idas e vindas ao Azure SQL do caminho mais sensível a latência.
  const [escopo, escopoExtensaoNome, pendentes, delegados, expiradas] = await Promise.all([
    resolverEscopoCongregacoes(pool, lideranca.escopoTipo, lideranca.escopoId),
    resolverNomeExtensao(pool, lideranca.escopoTipo, lideranca.escopoId),
    termosPendentes(pool, sql, lideranca.membroId, lideranca.papelNivel),
    // vB.9/v7.6 — delegação temporária vira CONCESSÃO à parte (com o escopo e o prazo dela).
    concessoesDelegadas(pool, sql, lideranca.membroId, hoje),
    // vB.9 — permissão com recertificação EXPIRADA não entra na sessão nova (GestaoCompliance).
    permissoesComRecertificacaoExpirada(pool, sql, lideranca.membroId)
  ]);
  const { delegacoesAtivas } = delegados;
  const delegadas = delegados.concessoes.map((c) => ({ ...c, permissoes: c.permissoes.filter((p) => !expiradas.includes(p)) }));

  const concessaoPropria = {
    origem: "PROPRIA",
    ate: lideranca.ativoAte || null,
    permissoes: permissoesProprias.filter((p) => !expiradas.includes(p)),
    nivel: lideranca.papelNivel,
    escopoCongregacoes: escopo,
    escopoExtensaoNome,
    // v5.2/v5.3 — departamento do cargo (coluna DepartamentoId, ou EscopoTipo='DEPARTAMENTO' do Líder Geral)
    departamentoId: lideranca.escopoTipo === "DEPARTAMENTO" ? lideranca.escopoId : (lideranca.departamentoId || null)
  };
  const concessoes = [concessaoPropria, ...delegadas];

  // vB.9 — trilha de sessão: o dispositivo (User-Agent) que logou.
  const dispositivoInfo = (req.headers && (req.headers["user-agent"] || req.headers["User-Agent"])) || null;
  const token = await auth.criarSessao(pool, sql, {
    membroId: lideranca.membroId,
    nome: lideranca.nome,
    tipo: lideranca.papelNome,
    concessoes,
    termosPendentes: pendentes,
    // fecho da v7.5 — a sessão nasceu da SENHA de acesso administrativo (via "SENHA"); as rotas que dependem de "ser a liderança" exigem isso.
    via: "SENHA",
    fator: fator || { via: "NENHUM", em: Date.now() }
  }, dispositivoInfo);
  const sessao = auth.getSessao(token);

  return {
    sucesso: true,
    token,
    nome: lideranca.nome,
    tipo: lideranca.papelNome,
    nivel: lideranca.papelNivel,
    escopo: sessao.escopoCongregacoes,
    // v7.6 — "geral" com a MESMA regra das rotas (escopoRotas.ehGeral). Só decide o que aparece.
    geral: ehGeral(sessao),
    permissoes: sessao.permissoes,
    termosPendentes: pendentes,
    delegacoesAtivas,
    fator: (fator && fator.via) || "NENHUM"
  };
}

module.exports = { buscarLiderancas, escolherPelaSenha, reler, suspensa, concluirLogin };
