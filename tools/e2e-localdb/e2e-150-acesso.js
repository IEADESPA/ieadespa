// e2e-150-acesso.js — as regras de entrada no sistema contra o SQL Server de verdade (ramo v10-acesso-ajustes, 24/11/2026). Monta o próprio cenário sobre
// a base cenario-175 (`BASE=cenario-175 bash rodar.sh roteiro e2e-150-acesso.js`). Cobre:
//   1. o login da liderança (senha e segunda etapa) só para quem está ATIVO no rol de membros;
//   2. o PIN provisório gerado pela Secretaria segue a regra de PESSOA (congregação e Extensão da Tenda);
//   3. o fim do acesso (medida cautelar e vacância) gravado com o dia de Brasília (shared/dataBrasilia.js), a mesma régua do login;
//   4. o freio de tentativas sem acerto por conexão na entrada do membro (IPv4 e rede /64 do IPv6), com a trilha;
//   5. lixo em cada campo das rotas mexidas: nunca 500, nunca texto interno.
process.env.AUTH_SECRET = "segredo-do-roteiro-do-acesso-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, sql } = L;
const { chamarRota } = require("./lib-afm");
const pinMembro = require(path.join(API, "shared/pinMembro.js"));
const { hojeBrasilia } = require(path.join(API, "shared/dataBrasilia.js"));

const BASE_ID = 1500000;
const ID = { dirigente: BASE_ID + 1, encarregado: BASE_ID + 2, membroSede: BASE_ID + 3, membroTenda: BASE_ID + 4, inativado: BASE_ID + 5, comEmail: BASE_ID + 6,
  geral: BASE_ID + 7, suspenso: BASE_ID + 8, desligado: BASE_ID + 9 };
const SENHA = "Senha-Do-Roteiro#2026";
const PIN_CERTO = "7392";
let ipSeq = 1;
const novoIp = () => `177.150.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
const cab = (ip) => ({ "x-forwarded-for": `${ip}:5000, 40.70.146.136:6000`, "user-agent": "roteiro-e2e" });
const login = (matricula, senha, ip = novoIp()) => chamarRota("LoginSecretaria/index.js", { metodo: "POST", corpo: { matricula, senha }, headers: cab(ip) });
const entrar = (matricula, pin, headers) => chamarRota("MembroEntrar/index.js", { metodo: "POST", corpo: { matricula, pin }, headers });
const gerarPin = (token, membroId) => chamarRota("GestaoPinMembro/index.js", { metodo: "POST", token, corpo: { membroId }, headers: cab(novoIp()) });
const diaAntes = (iso) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) - 1)).toISOString().slice(0, 10);
const textoInterno = (b) => /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules/i.test(JSON.stringify(b || {}));

// O relógio do Node posto num instante (anda junto com o real a partir dali); o banco segue com a hora dele.
const DataReal = Date;
function porRelogio(iso) {
  const alvo = DataReal.parse(iso), inicio = DataReal.now();
  class DataDoRoteiro extends DataReal {
    constructor(...a) { if (a.length === 0) super(alvo + (DataReal.now() - inicio)); else super(...a); }
    static now() { return alvo + (DataReal.now() - inicio); }
  }
  global.Date = DataDoRoteiro;
}
const soltarRelogio = () => { global.Date = DataReal; };

async function principal() {
  const pool = await obterPool();

  console.log("== o cenário: duas congregações, uma Extensão, papéis e pessoas do roteiro ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Acesso E2E150'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const sede = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (N'Sede Acesso E2E150', @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { a: area }))[0].id;
  const tenda = (await q("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId) VALUES (N'Tenda Jardim E2E150', @c); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: sede }))[0].id;
  const pessoa = (id, nome, { ext = null, email = null, status = "ATIVO" } = {}) => q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, ExtensaoId, Status, SituacaoMembro, DataNascimento, Email)
    VALUES (@id, @n, @c, @x, @s, 'EM_COMUNHAO', '1985-06-15', @em)`, { id, n: nome, c: sede, x: ext, s: status, em: email });
  await pessoa(ID.dirigente, "Dirigente Sede E2E150");
  await pessoa(ID.encarregado, "Encarregado Tenda E2E150", { ext: tenda });
  await pessoa(ID.membroSede, "Ana da Sede E2E150");
  await pessoa(ID.membroTenda, "Bia da Tenda E2E150", { ext: tenda });
  await pessoa(ID.inativado, "Carlos Inativado E2E150");
  await pessoa(ID.comEmail, "Gabriela Email E2E150", { email: "gabriela.e2e150@exemplo.org" });
  await pessoa(ID.geral, "Presidente E2E150");
  await pessoa(ID.suspenso, "Tesoureiro Suspenso E2E150");
  await pessoa(ID.desligado, "Diácono Desligado E2E150");
  const papel = async (nome, nivel, perms) => (await q("INSERT INTO Papeis (Nome, Nivel, Permissoes) VALUES (@n, @v, @p); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, v: nivel, p: perms }))[0].id;
  const pLocal = await papel("Dirigente E2E150", "CONGREGACAO", "pessoas");
  const pTenda = await papel("Encarregado E2E150", "CONGREGACAO", "pessoas");
  const pGeral = await papel("Geral E2E150", "GLOBAL", "pessoas,permissoes");
  const hash = L.auth.hashSenha(SENHA);
  const lid = (m, p, t, e) => q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash) VALUES (@m, @p, @t, @e, @h)", { m, p, t, e, h: hash });
  await lid(ID.dirigente, pLocal, "CONGREGACAO", sede);
  await lid(ID.encarregado, pTenda, "EXTENSAO", tenda);
  await lid(ID.inativado, pLocal, "CONGREGACAO", sede);
  await lid(ID.comEmail, pLocal, "CONGREGACAO", sede);
  await lid(ID.geral, pGeral, "GLOBAL", null);
  await lid(ID.suspenso, pLocal, "CONGREGACAO", sede);
  await lid(ID.desligado, pLocal, "CONGREGACAO", sede);
  // os termos da Secretaria assinados (senão toda rota da liderança recusa antes, por termo pendente, e as recusas do roteiro não provariam nada)
  const { TERMOS } = require(path.join(API, "shared/termos.js"));
  for (const m of [ID.dirigente, ID.encarregado, ID.inativado, ID.comEmail, ID.geral, ID.suspenso, ID.desligado]) {
    for (const [tipo, t] of Object.entries(TERMOS)) await q("INSERT INTO TermosAssinados (MembroId, TipoTermo, VersaoTermo) VALUES (@m, @t, @v)", { m, t: tipo, v: t.versao });
  }
  for (const m of [ID.membroSede, ID.membroTenda]) await pinMembro.gravarPin(pool, m, PIN_CERTO);
  ok((await escalar("SELECT COUNT(*) FROM Lideranca WHERE MembroId BETWEEN @a AND @b", { a: BASE_ID, b: BASE_ID + 99 })) === 7, "7 lideranças do roteiro gravadas");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 1. o login da liderança só para quem está ATIVO no rol ==");
  const naoLider = await login(ID.membroSede, SENHA);
  const okAtivo = await login(ID.inativado, SENHA);
  ok(okAtivo.body && okAtivo.body.sucesso === true && typeof okAtivo.body.token === "string", "ATIVO: a senha certa abre a sessão", JSON.stringify(okAtivo.body).slice(0, 160));
  for (const status of ["INATIVO", "LICENÇA", "DESLIGADO"]) {
    await q("UPDATE MembroReferencia SET Status = @s WHERE MembroId = @m", { s: status, m: ID.inativado });
    const sessoesAntes = await escalar("SELECT COUNT(*) FROM SessoesAtivas WHERE MembroId = @m", { m: ID.inativado });
    const tentativasAntes = await escalar("SELECT ISNULL(SUM(Falhas), 0) FROM AcessoTentativas WHERE MembroId = @m AND Canal = 'SENHA'", { m: ID.inativado });
    const r = await login(ID.inativado, SENHA);
    ok(r.body && r.body.sucesso === false && !r.body.token, `${status}: a senha certa NÃO entra`, JSON.stringify(r.body).slice(0, 160));
    ok(r.body && naoLider.body && r.body.mensagem === naoLider.body.mensagem, `${status}: a mesma resposta de quem não é da liderança`);
    ok((await escalar("SELECT COUNT(*) FROM SessoesAtivas WHERE MembroId = @m", { m: ID.inativado })) === sessoesAntes, `${status}: nenhuma sessão nova no banco`);
    ok((await escalar("SELECT ISNULL(SUM(Falhas), 0) FROM AcessoTentativas WHERE MembroId = @m AND Canal = 'SENHA'", { m: ID.inativado })) === tentativasAntes, `${status}: não conta tentativa de senha`);
  }
  await q("UPDATE MembroReferencia SET Status = 'ATIVO' WHERE MembroId = @m", { m: ID.inativado });
  const deVolta = await login(ID.inativado, SENHA);
  ok(deVolta.body && deVolta.body.sucesso === true, "de volta a ATIVO: entra de novo");

  console.log("   a segunda etapa relê a situação");
  const etapa1 = await login(ID.comEmail, SENHA);
  ok(etapa1.body && etapa1.body.sucesso === true && typeof etapa1.body.bilhete === "string" && !etapa1.body.token, "com e-mail: a senha certa abre só a segunda etapa (bilhete)", JSON.stringify(etapa1.body).slice(0, 160));
  await q("UPDATE MembroReferencia SET Status = 'INATIVO' WHERE MembroId = @m", { m: ID.comEmail });
  for (const acao of ["chave/opcoes", "codigo/enviar", "codigo"]) {
    const r = await chamarRota("SegundoFator/index.js", { metodo: "POST", binding: { acao }, corpo: { bilhete: etapa1.body && etapa1.body.bilhete, codigo: "123456" }, headers: { ...cab(novoIp()), origin: "https://app.ieadespa.org.br" } });
    ok(r.status === 401 && !(r.body && r.body.token), `segunda etapa (${acao}) de quem saiu do rol ativo: 401, sem sessão`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  await q("UPDATE MembroReferencia SET Status = 'ATIVO' WHERE MembroId = @m", { m: ID.comEmail });

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 2. o PIN provisório segue a regra de PESSOA (congregação e Extensão) ==");
  const lEnc = await login(ID.encarregado, SENHA);
  const lDir = await login(ID.dirigente, SENHA);
  ok(lEnc.body && lEnc.body.sucesso && lDir.body && lDir.body.sucesso, "o encarregado da Extensão e o dirigente entram pelo login real");
  ok(lEnc.body && Array.isArray(lEnc.body.termosPendentes) && lEnc.body.termosPendentes.length === 0 && lDir.body.termosPendentes.length === 0, "sem termo pendente (a recusa abaixo é a de escopo, não a dos termos)");
  ok(lEnc.body && JSON.stringify(lEnc.body.escopo) === JSON.stringify(["Sede Acesso E2E150"]), "o escopo da Extensão vira a congregação-mãe no login", JSON.stringify(lEnc.body && lEnc.body.escopo));
  const tkEnc = lEnc.body && lEnc.body.token, tkDir = lDir.body && lDir.body.token;
  const pinSedeAntes = await escalar("SELECT PinHash FROM MembroPins WHERE MembroId = @m", { m: ID.membroSede });
  const sessaoAna = await entrar(ID.membroSede, PIN_CERTO, cab(novoIp()));
  ok(sessaoAna.body && sessaoAna.body.sucesso, "Ana (da Sede, fora da Extensão) entra com o PIN dela");
  const foraTenda = await gerarPin(tkEnc, ID.membroSede);
  const inexistente = await gerarPin(tkEnc, BASE_ID + 98);
  ok(foraTenda.status === 403 && !foraTenda.body.pin && foraTenda.body.mensagem === "Fora do seu escopo de atuação.", "o encarregado da Extensão NÃO gera o PIN de quem é da Sede fora da Extensão (403 de escopo)", `${foraTenda.status} ${JSON.stringify(foraTenda.body)}`);
  ok(JSON.stringify(foraTenda.body) === JSON.stringify(inexistente.body) && inexistente.status === 403, "a mesma recusa de quem não existe");
  ok((await escalar("SELECT PinHash FROM MembroPins WHERE MembroId = @m", { m: ID.membroSede })) === pinSedeAntes, "o PIN de Ana continua o mesmo");
  ok(L.auth.getSessao(sessaoAna.body.token) !== null, "a sessão de Ana não caiu");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao = 'PIN_PROVISORIO_GERADO' AND RegistroId = @m", { m: ID.membroSede })) === 0, "nada na trilha de PIN gerado para Ana");
  const daTenda = await gerarPin(tkEnc, ID.membroTenda);
  ok(daTenda.status === 200 && /^\d{4}$/.test(daTenda.body.pin || ""), "o encarregado gera o PIN de quem é da Extensão dele", JSON.stringify(daTenda.body).slice(0, 120));
  const biaEntra = daTenda.body && daTenda.body.pin ? await entrar(ID.membroTenda, daTenda.body.pin, cab(novoIp())) : { body: {} };
  ok(biaEntra.body && biaEntra.body.sucesso && biaEntra.body.pinProvisorio === true, "e Bia entra com o PIN provisório");
  const dirTenda = await gerarPin(tkDir, ID.membroTenda);
  ok(dirTenda.status === 200, "o dirigente da congregação gera o PIN de quem é de uma Extensão dela");
  console.log("   sem sessão, sessão de PIN e lixo no campo");
  ok((await gerarPin(null, ID.membroTenda)).status === 401, "sem sessão: 401");
  ok((await gerarPin(sessaoAna.body.token, ID.membroTenda)).status === 403, "sessão de PIN (membro): 403");
  const quebrasPin = [];
  const somaPins = async () => JSON.stringify(await um("SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM MembroPins"));
  const antesFuzz = await somaPins();
  for (const lixo of L.LIXO) {
    const r = await gerarPin(tkEnc, lixo);
    if (r.status === 500 || ![400, 403].includes(r.status) || textoInterno(r.body)) quebrasPin.push(`${JSON.stringify(lixo).slice(0, 30)} -> ${r.status}`);
  }
  ok(quebrasPin.length === 0, `PIN provisório: ${L.LIXO.length} valores de lixo, só 400/403 e nenhum texto interno`, quebrasPin.slice(0, 5));
  ok((await somaPins()) === antesFuzz, "PIN provisório: o lixo não mexeu em MembroPins");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 3. o fim do acesso com o dia de Brasília ==");
  const diaUtcDoBanco = await escalar("SELECT CONVERT(varchar(10), CAST(SYSUTCDATETIME() AS DATE), 120)");
  porRelogio(`${diaUtcDoBanco}T00:30:00Z`);
  try {
    const hoje = hojeBrasilia();
    ok(hoje === diaAntes(diaUtcDoBanco), `o dia de Brasília (${hoje}) é a véspera do dia UTC do banco (${diaUtcDoBanco})`);
    const tkGeral = L.GERAL(ID.geral, ["pessoas", "permissoes"]);
    const medida = await chamarRota("GestaoMedidasCautelares/index.js", { metodo: "POST", token: tkGeral, corpo: { membroId: ID.suspenso, motivo: "Conferência do caixa (roteiro)", suspenderAcessoSistema: true } });
    ok(medida.status === 201, "a medida cautelar com suspensão do acesso é aplicada", `${medida.status} ${JSON.stringify(medida.body).slice(0, 160)}`);
    const fimSuspenso = await escalar("SELECT CONVERT(varchar(10), AtivoAte, 120) FROM Lideranca WHERE MembroId = @m", { m: ID.suspenso });
    ok(fimSuspenso === diaAntes(hoje), `a suspensão grava a véspera de Brasília (${diaAntes(hoje)})`, fimSuspenso);
    const tentaSuspenso = await login(ID.suspenso, SENHA);
    ok(tentaSuspenso.body && tentaSuspenso.body.sucesso === false && /suspenso/i.test(tentaSuspenso.body.mensagem || "") && !tentaSuspenso.body.token, "e o suspenso NÃO entra", JSON.stringify(tentaSuspenso.body).slice(0, 160));

    await require(path.join(API, "shared/vacancia.js")).encerrarVinculos(pool, sql, ID.desligado, "DESLIGAMENTO");
    const fimDesligado = await escalar("SELECT CONVERT(varchar(10), AtivoAte, 120) FROM Lideranca WHERE MembroId = @m", { m: ID.desligado });
    ok(fimDesligado === diaAntes(hoje), `a vacância grava a véspera de Brasília (${diaAntes(hoje)})`, fimDesligado);
    const tentaDesligado = await login(ID.desligado, SENHA);
    ok(tentaDesligado.body && tentaDesligado.body.sucesso === false && !tentaDesligado.body.token, "e quem saiu NÃO entra", JSON.stringify(tentaDesligado.body).slice(0, 160));
    const outro = await login(ID.dirigente, SENHA);
    ok(outro.body && outro.body.sucesso === true, "quem não foi suspenso continua entrando");
  } finally {
    soltarRelogio();
  }

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 4. o freio de tentativas sem acerto por conexão (entrada do membro) ==");
  const LIMITE = pinMembro.LIMITE_FALHAS_ORIGEM_PIN;
  const alvos = [];
  for (let i = 0; i < 6; i++) { const id = BASE_ID + 20 + i; await pessoa(id, `Pessoa PIN ${i} E2E150`); await pinMembro.gravarPin(pool, id, PIN_CERTO); alvos.push(id); }
  const falhasDe = async (m) => escalar("SELECT ISNULL(SUM(Falhas), 0) FROM AcessoTentativas WHERE MembroId = @m AND Canal = 'PIN'", { m });

  const ipA = novoIp();
  let respostasA = [];
  for (let i = 0; i < LIMITE; i++) {
    const m = i % 3 === 0 ? BASE_ID + 500 + i : i % 3 === 1 ? ID.dirigente : alvos[1 + (i % 5)];          // inexistente, sem PIN, PIN errado
    respostasA.push(await entrar(m, i % 3 === 2 ? "0000" : PIN_CERTO, cab(ipA)));
  }
  ok(respostasA.every((r) => r.status === 200 && r.body.sucesso === false), `as ${LIMITE} primeiras tentativas sem acerto são conferidas (recusa comum)`);
  const falhasAlvo0 = await falhasDe(alvos[0]);
  const freada = await entrar(alvos[0], PIN_CERTO, cab(ipA));
  ok(freada.status === 429 && !freada.body.token && Number((freada.headers || {})["Retry-After"]) > 60, "a seguinte, mesmo com o PIN certo, recebe 429 com Retry-After", `${freada.status} ${JSON.stringify(freada.body)}`);
  ok((await falhasDe(alvos[0])) === falhasAlvo0, "a tentativa freada não gasta a conta da pessoa");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao = 'ORIGEM_BLOQUEADA_POR_TENTATIVAS' AND RegistroId = 0")) >= 1, "a passagem para o bloqueio ficou na trilha (RegistroId 0)");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao = 'ORIGEM_BLOQUEADA_POR_TENTATIVAS' AND (DadosDepois LIKE '%177.%' OR DadosDepois LIKE '%7392%')")) === 0, "sem IP e sem PIN na trilha");
  const outraConexao = await entrar(alvos[0], PIN_CERTO, cab(novoIp()));
  ok(outraConexao.status === 200 && outraConexao.body.sucesso === true, "a mesma pessoa, de outra conexão, entra normalmente");

  console.log("   quem acerta não gasta a conta da conexão");
  const ipB = novoIp();
  let travouCedo = false;
  for (let i = 0; i < 20; i++) {
    const errou = await entrar(alvos[2], "0000", cab(ipB));
    const acertou = await entrar(alvos[2], PIN_CERTO, cab(ipB));
    if (errou.status === 429 || acertou.status === 429 || acertou.body.sucesso !== true) travouCedo = true;
  }
  ok(!travouCedo, "20 erros intercalados com 20 acertos: ninguém é freado (o acerto devolve a tentativa e zera a conta da pessoa)");
  for (let i = 0; i < LIMITE - 20; i++) await entrar(BASE_ID + 700 + i, PIN_CERTO, cab(ipB));
  ok((await entrar(alvos[2], PIN_CERTO, cab(ipB))).status === 429, "e o limite conta só as falhas: completado, a conexão espera");

  console.log("   IPv6: a rede /64 divide a conta");
  const v6 = (sufixo, rede = "2804:14c:5b81:9a10") => ({ "x-forwarded-for": `[${rede}::${sufixo}]:443, 40.70.146.136:6000` });
  for (let i = 0; i < LIMITE; i++) await entrar(BASE_ID + 800 + i, PIN_CERTO, v6((i + 1).toString(16)));
  ok((await entrar(alvos[3], PIN_CERTO, v6("beef"))).status === 429, "outro endereço da mesma /64: 429");
  const outraRede = await entrar(alvos[3], PIN_CERTO, v6("1", "2804:14c:5b81:9a11"));
  ok(outraRede.status === 200 && outraRede.body.sucesso === true, "outra rede /64: entra");

  console.log("   pedidos simultâneos da mesma conexão");
  const ipC = novoIp();
  const simultaneos = await Promise.all(Array.from({ length: LIMITE + 10 }, (_, i) => entrar(BASE_ID + 900 + i, PIN_CERTO, cab(ipC))));
  const conferidos = simultaneos.filter((r) => r.status === 200).length, freados = simultaneos.filter((r) => r.status === 429).length;
  ok(conferidos === LIMITE && freados === 10, `${LIMITE + 10} ao mesmo tempo: ${LIMITE} conferidos e 10 freados`, { conferidos, freados });

  console.log("   lixo nos campos da entrada do membro e do login");
  const quebras = [];
  for (const campo of ["matricula", "pin"]) for (const lixo of L.LIXO) {
    const corpo = { matricula: alvos[4], pin: PIN_CERTO };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const r = await chamarRota("MembroEntrar/index.js", { metodo: "POST", corpo, headers: cab(novoIp()) });
    if (r.status === 500 || ![200, 400, 429].includes(r.status) || textoInterno(r.body)) quebras.push(`entrar.${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status}`);
    const corpoL = { matricula: ID.dirigente, senha: SENHA };
    if (lixo === undefined) delete corpoL[campo === "pin" ? "senha" : campo]; else corpoL[campo === "pin" ? "senha" : campo] = lixo;
    const rl = await chamarRota("LoginSecretaria/index.js", { metodo: "POST", corpo: corpoL, headers: cab(novoIp()) });
    if (rl.status === 500 || ![200, 400, 429].includes(rl.status) || textoInterno(rl.body)) quebras.push(`login.${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${rl.status}`);
  }
  ok(quebras.length === 0, `entrada e login: ${4 * L.LIXO.length} chamadas com lixo, nenhuma 500 nem texto interno`, quebras.slice(0, 6));
}

principal().then(() => fim("e2e-150 (acesso)")).catch((e) => { console.error(e); ok(false, "o roteiro quebrou: " + (e && e.message)); fim("e2e-150 (acesso)"); });
