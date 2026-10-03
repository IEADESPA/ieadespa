// shared/escopoRotas.js — regras de ESCOPO usadas pelas rotas, num lugar só.
//
// A regra de negócio (decisão do responsável pelo projeto, 02/10/2026): quem tem login de liderança só vê e só altera o que está dentro do seu escopo territorial —
// dirigente da congregação A: a congregação A; pastor da área B: as congregações da área B; e assim sobe (região, quadrante, distrito); o nível GERAL vê tudo.
// A sessão já traz a lista de congregações que a pessoa alcança, com a hierarquia resolvida no login (shared/escopo.js): `escopoCongregacoes` = "TODAS" ou um array de nomes.
//
// Três tipos de dado, três regras:
//  - PESSOA (ficha, disciplina, LGPD, marcos...): vale a congregação da pessoa → carregarPessoa/pessoaAlcancavel/noEscopoDaPessoa/filtrarPorEscopo.
//  - CONGREGAÇÃO (caixa, obra, veículo, turma...): vale a congregação do registro → congregacaoNoEscopo/auth.estaNoEscopo.
//  - INSTITUCIONAL (a igreja como um todo: parâmetros, investimentos, plano estratégico, órgãos centrais...): só o nível GERAL → exigirGeral/ehGeral.
//
// "Geral" = papel de nível GLOBAL E escopo TODAS. Nenhum dos dois sozinho basta: o nível vem do PAPEL e o escopo vem da LIDERANÇA, que são cadastrados em separado — um papel
// Global concedido com escopo de uma congregação, ou um papel local concedido com escopo "global" por esquecimento, passaria numa checagem de um só lado. O Líder Geral de
// Departamento tem escopo TODAS mas nível DEPARTAMENTO (não é geral); quem age por delegação mantém o nível do próprio papel (não é geral).
//
// Fora do escopo a resposta é a MESMA de "não existe": a rota não serve de sonda para descobrir quem tem cadastro.
const auth = require("./auth");
const { sql } = require("./db");

const MSG_GERAL = "Esta função é da administração geral da igreja.";
const FORA_DO_ESCOPO = { sucesso: false, mensagem: "Fora do seu escopo de atuação." };

// O nível geral: papel GLOBAL com escopo de todas as congregações — numa MESMA concessão (v7.6). A visão de várias concessões une nível e escopo, e um cargo
// Global de escopo limitado somado a um Líder Geral de Departamento (escopo TODAS) passaria se a conferência olhasse só os campos de topo.
const concessaoGeral = (c) => !!c && c.nivel === "GLOBAL" && c.escopoCongregacoes === "TODAS";
function ehGeral(usuario) {
  if (!usuario) return false;
  return auth.concessoesDaVisao(usuario).some(concessaoGeral);
}

// Porta de rota institucional. `permissao`: texto, lista (qualquer uma) ou null/undefined (só login). Devolve a visão da sessão SÓ com as concessões do nível
// geral que têm a permissão (ou null, e já deixa context.res preenchido).
function exigirGeral(req, context, permissao) {
  let usuario;
  if (permissao === undefined || permissao === null) usuario = auth.exigirLogin(req, context);
  else if (Array.isArray(permissao)) usuario = auth.exigirAlgumaPermissao(req, context, permissao);
  else usuario = auth.exigirPermissao(req, context, permissao);
  if (!usuario) return null;
  const geral = ehGeral(usuario) ? auth.restringirVisao(usuario, concessaoGeral) : null;
  if (!geral) {
    context.res = { status: 403, body: { sucesso: false, mensagem: MSG_GERAL } };
    return null;
  }
  return geral;
}

// A pessoa (congregação e extensão) está dentro do escopo de quem pergunta? Congregação ausente só é alcançada por quem tem escopo TODAS (auth.estaNoEscopo).
// Escopo por Extensão da Tenda é mais estreito que a Congregação-Mãe: a pessoa precisa ser da mesma Extensão. v7.6 — concessão por concessão: a extensão de uma
// delegação não estreita a congregação inteira do cargo próprio, nem o contrário.
function noEscopoDaPessoa(usuario, congregacaoNome, extensaoNome) {
  const cobre = (c) => auth.estaNoEscopo(c, congregacaoNome) && (!c.escopoExtensaoNome || extensaoNome === c.escopoExtensaoNome);
  const concessoes = usuario && Array.isArray(usuario._daVisao) && usuario._daVisao.length > 1 ? usuario._daVisao : null;
  if (concessoes) return concessoes.some(cobre);
  return !!usuario && cobre(usuario);
}

// Carrega a pessoa com a congregação e a extensão. A matrícula só vale na forma canônica (auth.idDeRota). null = não existe (ou id malformado).
async function carregarPessoa(pool, matricula) {
  const id = auth.idDeRota(matricula);
  if (!id) return null;
  const r = (await pool.request().input("id", sql.Int, id).query(`
    SELECT m.MembroId, m.Nome, m.Status, c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    WHERE m.MembroId = @id`)).recordset[0];
  return r ? { membroId: r.MembroId, nome: r.Nome, status: r.Status, congregacaoNome: r.CongregacaoNome || null, extensaoNome: r.ExtensaoNome || null } : null;
}

// A pessoa, se existir E estiver no escopo; senão null — o chamador devolve a resposta de "não existe" (igual para os dois casos).
async function pessoaAlcancavel(pool, usuario, matricula) {
  const p = await carregarPessoa(pool, matricula);
  return p && noEscopoDaPessoa(usuario, p.congregacaoNome, p.extensaoNome) ? p : null;
}

// Filtra uma lista de linhas pelo escopo da pessoa de cada linha. `congregacaoDe`/`extensaoDe` dizem de onde tirar os nomes em cada linha.
function filtrarPorEscopo(usuario, linhas, congregacaoDe, extensaoDe) {
  return (linhas || []).filter((l) => noEscopoDaPessoa(usuario, congregacaoDe(l), extensaoDe ? extensaoDe(l) : null));
}

// Congregação (por id) dentro do escopo? Congregação inexistente → false (mesma resposta de "fora do escopo").
async function congregacaoNoEscopo(pool, usuario, congregacaoId) {
  const id = auth.idDeRota(congregacaoId);
  if (!id) return false;
  const r = (await pool.request().input("id", sql.Int, id).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`)).recordset[0];
  return !!r && auth.estaNoEscopo(usuario, r.Nome);
}

module.exports = { ehGeral, exigirGeral, noEscopoDaPessoa, carregarPessoa, pessoaAlcancavel, filtrarPorEscopo, congregacaoNoEscopo, FORA_DO_ESCOPO, MSG_GERAL };
