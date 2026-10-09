// shared/cadastroNacionalMenores.js (v7.7) — o ADAPTER do futuro cadastro nacional de condenados por crimes contra crianças e adolescentes.
//
// Hoje isso é projeto de lei, não obrigação vigente: este módulo deixa pronto o ENCAIXE (a interface do provedor, a gravação do resultado e o efeito na aptidão) sem criar
// nenhuma dependência. Enquanto nenhum provedor estiver registrado, `consultar` responde "não configurado" e NADA é gravado; nenhuma rota ou rotina o chama ainda. O dia em que
// existir uma consulta oficial, basta registrar o provedor (um arquivo pequeno) e ligar a chamada — e uma linha 'CONSTA' em MinisterioMenoresCadastroNacional passa a bloquear o
// contato com menores (shared/ministerioMenores.js::avaliarAptidao já lê a última consulta da pessoa). 'INDISPONIVEL' (a fonte fora do ar) NUNCA bloqueia: não se presume culpa.
//
// Interface do provedor: `async (dados) => ({ resultado: 'NADA_CONSTA' | 'CONSTA' | 'INDISPONIVEL', fonte?: string })`, com `dados = { membroId, nome, dataNascimento }`
// (o cadastro da Igreja não guarda CPF; um provedor que exija documento terá de pedi-lo no momento, sem gravá-lo aqui).
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");

const RESULTADOS = ["NADA_CONSTA", "CONSTA", "INDISPONIVEL"];
const provedores = new Map();

function registrarProvedor(nome, funcao) {
  if (typeof nome !== "string" || !/^[A-Z0-9_]{2,40}$/.test(nome)) throw new Error("O nome do provedor usa só letras maiúsculas, números e _ (2 a 40 caracteres).");
  if (typeof funcao !== "function") throw new Error("O provedor precisa ser uma função.");
  provedores.set(nome, funcao);
}
function removerProvedor(nome) { provedores.delete(nome); }
function provedorConfigurado(ambiente = process.env) {
  const nome = ambiente.CADASTRO_NACIONAL_MENORES_PROVEDOR;
  return nome && provedores.has(nome) ? { nome, funcao: provedores.get(nome) } : null;
}

// Valida o que o provedor devolveu: só os três resultados; qualquer outra coisa (inclusive erro) vira INDISPONIVEL, que não bloqueia.
function normalizarResposta(resposta, nomeDoProvedor) {
  const resultado = resposta && RESULTADOS.includes(resposta.resultado) ? resposta.resultado : "INDISPONIVEL";
  const fonte = resposta && typeof resposta.fonte === "string" && resposta.fonte.trim() ? resposta.fonte.trim().slice(0, 40) : String(nomeDoProvedor).slice(0, 40);
  return { resultado, fonte };
}

// Consulta (sem gravar). Sem provedor: { configurado: false }.
async function consultar(dados, ambiente = process.env) {
  const p = provedorConfigurado(ambiente);
  if (!p) return { configurado: false };
  try {
    return { configurado: true, ...normalizarResposta(await p.funcao({ membroId: dados.membroId, nome: dados.nome, dataNascimento: dados.dataNascimento }), p.nome) };
  } catch (e) {
    // A fonte caiu ou recusou: registra como indisponível (nunca como "consta") e segue.
    return { configurado: true, resultado: "INDISPONIVEL", fonte: p.nome.slice(0, 40) };
  }
}

// Consulta e GRAVA a linha (só acréscimo; o gatilho impede alterar). Sem provedor, não grava nada.
async function consultarEGravar(pool, { membroId, nome, dataNascimento, por, ambiente = process.env }) {
  const r = await consultar({ membroId, nome, dataNascimento }, ambiente);
  if (!r.configurado) return { sucesso: false, configurado: false, mensagem: "Não há consulta ao cadastro nacional configurada: ele ainda não é uma obrigação em vigor." };
  const ins = await pool.request().input("m", sql.Int, membroId).input("f", sql.NVarChar(40), r.fonte).input("r", sql.NVarChar(12), r.resultado).input("por", sql.Int, por || null)
    .query(`INSERT INTO MinisterioMenoresCadastroNacional (MembroId, Fonte, Resultado, ConsultadoPorMembroId) VALUES (@m, @f, @r, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
  // A trilha só diz que houve consulta (e o resultado fica na tabela, de acesso restrito): um "CONSTA" não pode ir parar na auditoria.
  await registrarAuditoria({ tabela: "MinisterioMenoresCadastroNacional", registroId: ins.recordset[0].id, acao: "MENORES_CADASTRO_NACIONAL_CONSULTADO", usuarioId: por || null, dadosDepois: { membroId } });
  return { sucesso: true, configurado: true, resultado: r.resultado, fonte: r.fonte };
}

module.exports = { RESULTADOS, registrarProvedor, removerProvedor, provedorConfigurado, normalizarResposta, consultar, consultarEGravar };
