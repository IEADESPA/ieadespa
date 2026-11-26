// PreCadastroSite (FASE 10, v10.1b passo 4, 17/11/2026) — o "Quero me cadastrar" do SITE: a própria pessoa manda o pré-cadastro, que cai na mesma fila da secretaria.
// POST /api/pre-cadastro-site   body:{ nome, cpf, email, telefone?, dataNascimento, sexo, estadoCivil, congregacaoId, consentimento:{ aceito:true, versao }, envioId,
//                                      origemVisitante? }
// GET  /api/pre-cadastro-site   -> { congregacoes: [{ congregacaoId, nome, area }], consentimento: { versao, texto } } — o que a página "Quero me cadastrar" do site
//                                  precisa para montar o formulário (FASE 10, as sobras): só as congregações ativas, sem gente nenhuma, e o texto do consentimento
//       cabeçalho x-site-key = CHAVE_SITE_SISTEMA (a mesma nos dois aplicativos do Azure)
//
// Chamada pelo site, SERVIDOR A SERVIDOR (o navegador do visitante fala só com o site). Como o mural de oração (CuidadoPastoralSite), FALHA FECHADA: sem a chave
// combinada configurada, ninguém entra (401). Regras (decisões do responsável):
//  - só o essencial, tudo obrigatório menos o telefone; o departamento NÃO é pedido; consentimento LGPD registrado (base legal e versão do texto). O TEXTO e a
//    VERSÃO saem do mesmo lugar (shared/preCadastro.js): a página mostra o texto que este GET serve e devolve a versão; só a versão atual é aceita;
//  - a resposta é SEMPRE a mesma para um envio válido ("recebemos…"), quer o CPF já exista numa ficha, quer não: o formulário público nunca revela se alguém já é da
//    Igreja (filiação religiosa é dado sensível). A repetição é tratada na fila: o pré-cadastro não entra e vai para CORREÇÃO com o cadastro mais antigo;
//  - limites: por servidor do site (memória, por instância), por visitante (o site manda um identificador; aqui fica só o hash — 3 por hora) e no total
//    (200 por hora, contados no banco: vale para todas as instâncias). A contagem e a gravação andam na MESMA transação, debaixo da trava do formulário
//    (revisão de 20/11/2026: separadas, uma rajada passava do limite). O erro de formato (campo que falta ou inválido) é só de forma, nunca do banco;
//  - o MESMO envio (envioId, gerado pela página) repetido devolve o mesmo resultado sem gravar de novo (revisão de 20/11/2026: o reenvio depois de um prazo
//    esgotado gravava dois pré-cadastros). Se o primeiro ficou sem avaliar, o reenvio avalia;
//  - o TEMPO da resposta também não pode revelar (revisão de 20/11/2026): o aceite automático (a ficha nova) demora mais que a correção. A resposta sai SEMPRE
//    no TEMPO FIXO contado da chegada (PRE_CADASTRO_SITE_MIN_MS, padrão 3.000 ms; os testes usam 0 = sem tempo fixo), com o trabalho DENTRO da chamada (no
//    Azure Functions, trabalho deixado para depois da resposta não tem garantia de terminar);
//  - BANCO LENTO (decisão do responsável de 22/11/2026: "a secretaria aceita depois"): a resposta NUNCA passa do tempo fixo. O trabalho tem PRAZO (o tempo fixo
//    menos a folga): o processamento que não couber nele é desfeito (é uma transação só) e o pré-cadastro fica gravado e PENDENTE sem avaliar, na fila da
//    secretaria — a mesma resposta "recebemos", no mesmo tempo. Se nem a GRAVAÇÃO do pré-cadastro couber, ela também é desfeita e a resposta, no mesmo tempo
//    fixo, é "envie de novo" (503; não depende do CPF: a gravação não olha a ficha) — o reenvio leva o mesmo envioId e não duplica. Acabou o "próximo múltiplo".
const { getPool } = require("../shared/db");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");
const { conferirChaveDoSite } = require("../shared/chaveSiteSistema");
const regras = require("../shared/preCadastro");
const pdb = require("../shared/preCadastroDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");
// A trava das matrículas (23/11/2026, shared/matriculaNova.js): antes da importação do sistema pago concluída, ninguém se cadastra pelo site — a recusa (409)
// não espera o tempo fixo, como o 400 e o 429: não depende do CPF nem de quem já é da Igreja
const matriculaNova = require("../shared/matriculaNova");

const limitador = criarLimitador({ janelaMs: 60000, maximo: 60 });
const POR_VISITANTE_HORA = 3;
const TOTAL_HORA = 200;
const FOLGA_MS = 300;   // entre o fim do prazo do trabalho e a resposta: o banco confirma (ou desfaz) o último passo e a resposta sai no tempo fixo
const tempoFixo = () => { const v = Number(process.env.PRE_CADASTRO_SITE_MIN_MS); return Number.isFinite(v) && v >= 0 ? Math.min(v, 20000) : 3000; };
const dormirAte = (instante) => new Promise((r) => setTimeout(r, Math.max(0, instante - Date.now())));
const NAO_COUBE = "Não conseguimos confirmar o envio agora. Envie de novo daqui a pouco.";
const foraDoPrazo = (e) => pdb.ehPrazoEsgotado(e) || !!(e && e.code === "ETIMEOUT");

// O trabalho de um envio: a congregação, a gravação e o processamento (o aceite automático ou a fila), com o prazo `ate` (null = sem prazo). Nunca rejeita:
// devolve { recebido } (gravado: a resposta é "recebemos"), { naoCoube } (nada gravado no prazo) ou { status, body, extra } (a resposta que não espera:
// 400 de forma, 429 do limite, 500). estado.gravado guarda o id assim que a gravação confirma (a rota sabe, no tempo fixo, se pode dizer "recebemos").
async function receber(context, dados, corpo, ate, estado) {
  // o registro só enquanto a chamada não respondeu (depois dela, o Azure avisa "log depois do fim")
  const registrar = (nivel, ...m) => { if (!estado.respondido) context.log[nivel](...m); };
  try {
    const pool = await getPool();
    if (!(await matriculaNova.matriculasLiberadas(() => pdb.pedidoNoPrazo(pool, ate)))) return { status: 409, body: { sucesso: false, mensagem: matriculaNova.MSG_TRAVADA } };
    const cong = await pdb.lerCongregacao(() => pdb.pedidoNoPrazo(pool, ate), dados.congregacaoId);
    if (!cong || !cong.ativa) return { status: 400, body: { sucesso: false, mensagem: "Escolha uma congregação da lista." } };
    const gravado = await pdb.inserirDoSite(pool, dados, { envioId: corpo.envioId, consentimento: regras.CONSENTIMENTO, origemHash: pdb.hashOrigem(corpo.origemVisitante),
      porVisitanteHora: POR_VISITANTE_HORA, totalHora: TOTAL_HORA, ate });
    if (gravado.limite) return { status: 429, body: { sucesso: false, mensagem: "Recebemos muitos cadastros agora. Tente de novo daqui a pouco." }, extra: { "Retry-After": "600" } };
    estado.gravado = gravado.id;
    if (!gravado.avaliado) {
      // o processamento não muda a resposta; se não couber no prazo (ou falhar), foi desfeito e o pré-cadastro gravado fica na fila, PENDENTE sem avaliar
      try { await pdb.processar(pool, gravado.id, { ate }); } catch (e) {
        if (foraDoPrazo(e)) registrar("warn", `[PreCadastroSite] o processamento do pré-cadastro ${gravado.id} não coube no tempo fixo: desfeito; fica na fila, sem avaliar, para a secretaria aceitar.`);
        else registrar("error", `[PreCadastroSite] processar o pré-cadastro ${gravado.id}:`, e && e.stack ? e.stack : e);
      }
    }
    return { recebido: true };
  } catch (e) {
    if (foraDoPrazo(e)) return { naoCoube: true };
    registrar("error", "[PreCadastroSite] erro:", e && e.message);
    return { status: 500, body: { sucesso: false, mensagem: "Erro interno." } };
  }
}

module.exports = async function (context, req) {
  const inicio = Date.now();
  const res = (status, body, extra = {}) => { context.res = { status, headers: { "Cache-Control": "no-store", "Content-Type": "application/json", ...extra }, body }; };
  const chave = conferirChaveDoSite(req);
  if (!chave.exigida || !chave.ok) return res(401, { sucesso: false, mensagem: "Não autorizado." });
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) return res(429, { sucesso: false, mensagem: "Muitas chamadas seguidas." }, { "Retry-After": String(limite.retryAposSegundos) });
  if (req.method === "GET") {
    try {
      const pool = await getPool();
      const r = await pool.request().query(`SELECT c.CongregacaoId, c.Nome, a.Nome AS Area FROM Congregacoes c LEFT JOIN Areas a ON a.AreaId = c.AreaId
        WHERE c.Ativa = 1 ORDER BY c.Nome`);
      return res(200, { sucesso: true, consentimento: { versao: regras.CONSENTIMENTO.versao, texto: regras.CONSENTIMENTO.texto },
        congregacoes: r.recordset.map((l) => ({ congregacaoId: Number(l.CongregacaoId), nome: l.Nome, area: l.Area || null })) }, { "Cache-Control": "public, max-age=600" });
    } catch (e) {
      context.log.error("[PreCadastroSite] lista:", e.message);
      return res(500, { sucesso: false, mensagem: "Erro interno." });
    }
  }
  if (req.method !== "POST") return res(405, { sucesso: false, mensagem: "Método não suportado." });
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  const lido = regras.lerEntrada(corpo, { exigirTudo: true, hojeISO: hojeBrasilia() });
  if (!lido.ok) return res(400, { sucesso: false, mensagem: lido.mensagem });
  const cons = corpo.consentimento;
  if (!cons || typeof cons !== "object" || cons.aceito !== true) return res(400, { sucesso: false, mensagem: "Para enviar, marque que você concorda com o uso dos seus dados pela Igreja." });
  if (cons.versao !== regras.CONSENTIMENTO.versao) return res(400, { sucesso: false, mensagem: "O texto do consentimento foi atualizado: recarregue a página e envie de novo." });
  if (corpo.origemVisitante != null && (typeof corpo.origemVisitante !== "string" || corpo.origemVisitante.length > 128)) return res(400, { sucesso: false, mensagem: "Envio inválido." });
  if (typeof corpo.envioId !== "string" || !pdb.ENVIO_ID.test(corpo.envioId)) return res(400, { sucesso: false, mensagem: "Envio inválido: recarregue a página e envie de novo." });

  const fixo = tempoFixo();
  const estado = { gravado: null, respondido: false };
  const responder = (r) => {
    estado.respondido = true;
    if (r && r.status) return res(r.status, r.body, r.extra);
    return estado.gravado ? res(200, { sucesso: true, mensagem: regras.MSG.RECEBIDO }) : res(503, { sucesso: false, mensagem: NAO_COUBE }, { "Retry-After": "60" });
  };
  if (fixo === 0) return responder(await receber(context, lido.dados, corpo, null, estado));   // sem tempo fixo (os testes): o trabalho inteiro, sem prazo

  // Com o tempo fixo: o trabalho corre com prazo, e a resposta sai no tempo fixo, nem antes nem depois — termine o trabalho ou não.
  const respostaEm = inicio + fixo;
  const trabalho = receber(context, lido.dados, corpo, respostaEm - FOLGA_MS, estado);
  const pronto = await Promise.race([trabalho, dormirAte(respostaEm).then(() => null)]);
  if (pronto && pronto.status) return responder(pronto);   // 400, 429 e 500 não esperam (não dependem do CPF)
  if (!pronto) {
    // o tempo fixo chegou com o trabalho ainda no banco: o que não confirmou dentro do prazo é desfeito sozinho (o driver corta o pedido e a transação volta)
    context.log.warn(estado.gravado
      ? `[PreCadastroSite] o processamento do pré-cadastro ${estado.gravado} não terminou no tempo fixo de ${fixo} ms: o que não confirmou é desfeito e ele fica na fila, sem avaliar.`
      : `[PreCadastroSite] a gravação do pré-cadastro não coube no tempo fixo de ${fixo} ms: respondido "envie de novo".`);
  } else {
    if (pronto.naoCoube) context.log.warn(`[PreCadastroSite] a gravação do pré-cadastro não coube no tempo fixo de ${fixo} ms: desfeita; respondido "envie de novo".`);
    await dormirAte(respostaEm);
  }
  return responder(pronto);
};
