// LoginSecretaria
// Só quem tem registro em Lideranca (Dirigente, Pastor de Área etc.) consegue
// logar no painel da Secretaria. Ver api/shared/auth.js.
//
// vD.4 (07/10/2026) — LOGIN EM DUAS ETAPAS. A senha certa não abre mais a sessão sozinha: abre um BILHETE de 5 minutos e
// a resposta diz qual é a segunda etapa — "chave" (chave de acesso do aparelho, se a pessoa já cadastrou) ou "codigo"
// (código de 6 dígitos no e-mail do cadastro). A rota SegundoFator conclui o login (shared/sessaoLideranca.js). Quem não
// tem chave nem e-mail não fica trancado fora: entra com aviso e é levado a cadastrar.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const pinMembro = require("../shared/pinMembro");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");
const sessaoLideranca = require("../shared/sessaoLideranca");
const segundoFator = require("../shared/segundoFator");

// fecho da v7.5 — o login da liderança não tinha limite de tentativas. Agora: contenção por origem (por instância) e bloqueio por pessoa depois de 10 erros
// (15 min, que cresce se continuarem errando). Uma mensagem só para matrícula sem acesso, senha errada e pessoa bloqueada: não diz quem é da liderança.
const limitador = criarLimitador({ janelaMs: 60000, maximo: 30 });
const MENSAGEM_FALHA = "Matrícula ou senha incorreta, ou acesso bloqueado por muitas tentativas.";
// Hash de mentira, só para gastar o mesmo tempo de uma conferência verdadeira: quem pergunta por matrícula que não é da liderança (ou que está bloqueada)
// não distingue pelo tempo da resposta.
const HASH_FALSO = `${"0".repeat(32)}:${"0".repeat(128)}`;
const conferenciaFalsa = (senha) => { auth.verificarSenha(senha, HASH_FALSO); };

module.exports = async function (context, req) {
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." } };
    return;
  }
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const matricula = auth.idDeRota(corpo.matricula);
  const senha = typeof corpo.senha === "string" || typeof corpo.senha === "number" ? corpo.senha : null;

  if (!matricula || senha === null || senha === "") {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe matrícula e senha." } };
    return;
  }

  const pool = await getPool();
  const linhas = await sessaoLideranca.buscarLiderancas(pool, matricula);
  if (linhas.length === 0) {
    conferenciaFalsa(senha);
    context.res = { status: 200, body: { sucesso: false, mensagem: MENSAGEM_FALHA } };
    return;
  }

  // A tentativa é reservada ANTES de conferir a senha (tentativas simultâneas não passam do limite); quem acerta zera o contador.
  const reserva = await pinMembro.reservarTentativa(pool, matricula, "SENHA", pinMembro.LIMITE_FALHAS_SENHA);
  if (reserva.bloqueado) {
    conferenciaFalsa(senha);
    context.res = { status: 200, body: { sucesso: false, mensagem: MENSAGEM_FALHA } };
    return;
  }

  const lideranca = sessaoLideranca.escolherPelaSenha(linhas, senha);
  if (!lideranca) {
    context.res = { status: 200, body: { sucesso: false, mensagem: MENSAGEM_FALHA } };
    return;
  }
  await pinMembro.limparTentativas(pool, matricula, "SENHA");

  // Art. 45 §1º, I — Medida Cautelar de suspensão de acesso ao sistema. v7.6 — "hoje" no calendário de Brasília.
  if (sessaoLideranca.suspensa(lideranca, hojeBrasilia())) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Acesso suspenso — procure a Secretaria Geral." } };
    return;
  }

  // vD.4 — segunda etapa: chave de acesso (se tem), senão código por e-mail (se tem e-mail), senão entra com aviso.
  const situacao = await segundoFator.situacaoDaPessoa(pool, lideranca.membroId);
  if (situacao.temChaves || situacao.email) {
    const bilhete = segundoFator.emitirBilhete({ membroId: lideranca.membroId, papelId: lideranca.papelId, escopoTipo: lideranca.escopoTipo, escopoId: lideranca.escopoId });
    const resposta = { sucesso: true, segundoFator: situacao.temChaves ? "chave" : "codigo", bilhete, nome: lideranca.nome, podeCodigo: !!situacao.email, emailMascarado: situacao.emailMascarado };
    if (situacao.temChaves) {
      const o = await segundoFator.opcoesDeUso(pool, req, lideranca.membroId, "LOGIN");
      if (o.erro) { context.res = { status: 400, body: { sucesso: false, mensagem: o.erro } }; return; }
      resposta.opcoes = o.opcoes;
    } else {
      const e = await segundoFator.enviarCodigo(pool, { membroId: lideranca.membroId, email: situacao.email, nome: lideranca.nome, motivo: "entrar no sistema" });
      if (e.erro) resposta.avisoCodigo = e.erro; // o código anterior (se ainda vale) continua servindo; a tela mostra o aviso
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resposta };
    return;
  }

  const body = await sessaoLideranca.concluirLogin(pool, req, lideranca, { fator: { via: "NENHUM", em: Date.now() } });
  body.avisoFator = "Sua conta ainda não tem chave de acesso nem e-mail cadastrado. Cadastre em Meu Painel → Segurança: sem isso, as aprovações que exigem confirmação ficam bloqueadas.";
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body };
};
