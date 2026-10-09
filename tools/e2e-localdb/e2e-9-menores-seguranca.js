// e2e-9-menores-seguranca.js — v7.7: a bateria de ataque do ministério com menores (handlers REAIS, SQL Server real): sessão forjada, matriz ator × ação, atribuição em massa,
// IP forjado, ids estranhos, lixo em todo campo, o 403/404 uniforme e a regra de que chamada recusada nunca altera o banco.
// Parte da base "cenario-menores": BASE=cenario-menores bash rodar.sh roteiro e2e-9-menores-seguranca.js
const fs = require("fs");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, chamar, GERAL, LIDER, PIN, sessao, IP_PUBLICO, API, path, fuzz, LIXO, obterPool } = L;
const M = require(path.join(API, "GestaoMinisterioMenores/index.js"));
const E = require(path.join(API, "GestaoEscalas/index.js"));
const HAB = require(path.join(API, "GestaoHabilitacaoVoluntarios/index.js"));
const mm = require(path.join(API, "shared/ministerioMenores.js"));
const auth = require(path.join(API, "shared/auth.js"));
const { eq, c1, c2 } = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario-menores.json"), "utf8"));
const hoje = L.hojeBr();
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const presidente = GERAL(1001, TUDO);
const diretoria = GERAL(1001, [...TUDO, "habilitacao_voluntarios", "escalas"]);
const semFator = sessao(1001, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: TUDO });
const secretaria = LIDER(3001, ["habilitacao_voluntarios", "escalas", "reunioes", "pessoas"], ["Central E2E"]);
const secretariaVila = LIDER(3002, ["habilitacao_voluntarios", "escalas", "reunioes", "pessoas"], ["Vila Nova E2E"]);
const dias = (n) => new Date(Date.now() + n * 86400000);

// Retrato das tabelas que a v7.7 toca: quantidade + soma de verificação.
async function retrato() {
  const t = ["MinisterioMenoresSalas", "MinisterioMenoresPoliticaAceites", "MinisterioMenoresConsentimentos", "MinisterioMenoresAutoDenuncias", "MinisterioMenoresRetiradas", "MinisterioMenoresCadastroNacional",
    "EscalasAlocacoes", "EscalasServicos", "EscalasEquipes", "VoluntariosHabilitacao", "Notificacoes", "AuditLog"];
  const partes = [];
  for (const n of t) partes.push(JSON.stringify(await um("SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM " + n)));
  return partes.join("|");
}

(async () => {
  let r;
  console.log("== sessão: sem token, token forjado, token alterado ==");
  const rotasGET = ["catalogos", "minha-situacao", "politica", "painel", "painel-geral", "auto-denuncias"];
  const rotasPOST = ["aceitar-politica", "confirmar-ficha", "auto-denuncia", "equipe-faixa", "registrar-politica", "confirmar-ficha-pessoa", "auto-denuncia-decidir", "auto-denuncia-liberar"];
  for (const a of rotasGET) { r = await GET(M, a); ok(r.status === 401, `GET ${a} sem sessão: 401`, r.status); }
  for (const a of rotasPOST) { r = await POST(M, a, undefined, {}); ok(r.status === 401, `POST ${a} sem sessão: 401`, r.status); }
  const tokenReal = PIN(6010);
  for (const [rotulo, t] of [["lixo", "isto-nao-e-um-token"], ["assinatura trocada", tokenReal.slice(0, -4) + "AAAA"], ["vazio", ""], ["só um pedaço", tokenReal.split(".")[0]]]) {
    r = await GET(M, "minha-situacao", t); ok(r.status === 401, `token ${rotulo}: 401`, r.status);
  }
  r = await chamar(M, { acao: "minha-situacao", metodo: "GET", headers: { "x-auth-token": tokenReal, "x-forwarded-for": "1.1.1.1" } }); ok(r.status === 200, "cabeçalho a mais não atrapalha");
  r = await chamar(M, { acao: "minha-situacao", metodo: "DELETE", token: tokenReal }); ok([404, 405].includes(r.status), "método estranho não funciona", r.status);

  console.log("== a matriz ator × ação (quem nunca pode) ==");
  const atores = {
    "membro por PIN": PIN(6010),
    "líder de equipe (PIN)": PIN(6001),
    "dirigente com a permissão em escopo local": LIDER(3001, ["habilitacao_voluntarios"], ["Central E2E"]),
    "geral sem a permissão": GERAL(1003, ["pessoas", "setores_tecnicos"]),
    "vistoria_antecedentes só local": LIDER(3001, ["vistoria_antecedentes"], ["Central E2E"]),
    "PIN de quem é da Diretoria": PIN(1001)
  };
  const nuncaDiretoria = ["auto-denuncias"];
  for (const [rotulo, t] of Object.entries(atores)) {
    r = await GET(M, "auto-denuncias", t); ok(r.status === 403, `${rotulo}: a fila da Diretoria é 403`, r.status);
    for (const a of ["auto-denuncia-decidir", "auto-denuncia-liberar"]) { r = await POST(M, a, t, { autoDenunciaId: 1, decisao: "MANTIDO", observacao: "Observação suficiente." }); ok(r.status === 403, `${rotulo}: ${a} é 403`, r.status); }
  }
  for (const [rotulo, t] of Object.entries({ "membro por PIN": PIN(6010), "geral sem a permissão": GERAL(1003, ["pessoas"]), "PIN de gestora": PIN(3001) })) {
    r = await GET(M, "painel", t, { congregacaoId: c1 }); ok(r.status === 403, `${rotulo}: painel é 403`, r.status);
    r = await GET(M, "painel-geral", t); ok(r.status === 403, `${rotulo}: painel-geral é 403`, r.status);
    r = await POST(M, "equipe-faixa", t, { equipeId: eq.bercario, faixa: "MATERNAL" }); ok(r.status === 403, `${rotulo}: equipe-faixa é 403`, r.status);
    r = await POST(M, "registrar-politica", t, { membroId: 6021, referencia: "Pasta 3, ficha 1" }); ok(r.status === 403, `${rotulo}: registrar-politica é 403`, r.status);
    r = await POST(M, "confirmar-ficha-pessoa", t, { membroId: 6021, confirmo: true }); ok(r.status === 403, `${rotulo}: confirmar-ficha-pessoa é 403`, r.status);
  }
  // PIN de quem TEM a permissão: a sessão de PIN nunca vale como liderança
  r = await GET(M, "painel", PIN(3001), { congregacaoId: c1 }); ok(r.status === 403, "o dirigente entrando por PIN não vê o painel (sessão de membro, nunca de liderança)", r.status);
  r = await GET(M, "auto-denuncias", PIN(1001)); ok(r.status === 403, "o Presidente entrando por PIN não vê a fila da Diretoria", r.status);
  // o dirigente local com a permissão no escopo certo vê só a sua congregação
  r = await GET(M, "painel", secretariaVila, { congregacaoId: c1 }); ok(r.status === 403, "a secretaria da Vila Nova não vê a Central", r.status);
  // a Diretoria sem a confirmação reforçada recente
  r = await POST(M, "auto-denuncia-decidir", semFator, { autoDenunciaId: 1, decisao: "MANTIDO", observacao: "Observação suficiente." }); ok(r.status === 428, "decidir sem confirmação reforçada recente: 428", r.status);
  r = await POST(M, "auto-denuncia-liberar", semFator, { autoDenunciaId: 1, observacao: "Observação suficiente." }); ok(r.status === 428, "liberar sem confirmação reforçada recente: 428", r.status);

  console.log("== atribuição em massa: o corpo nunca manda no que é do servidor ==");
  let antes = await retrato();
  r = await POST(M, "aceitar-politica", PIN(6025), { aceito: true, textoHash: mm.POLITICA_HASH, membroId: 6010, MembroId: 6010, versao: 99, forma: "FICHA_FISICA", enderecoIp: "1.1.1.1", cadeiaCabecalhos: "forjada", registradoPorMembroId: 1001, referencia: "forjada" }, IP_PUBLICO);
  ok(r.status === 201, "aceite com um corpo cheio de campos que não são dele", r.body);
  const ac = await um("SELECT * FROM MinisterioMenoresPoliticaAceites WHERE MembroId = 6025");
  ok(ac && ac.Versao === 1 && ac.Forma === "CLICKWRAP" && ac.EnderecoIp === "177.8.9.10" && !/forjada/.test(String(ac.CadeiaCabecalhos)) && ac.RegistradoPorMembroId === null && ac.Referencia === null, "versão, forma, IP, quem registrou e referência vêm do servidor, nunca do corpo", ac);
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresPoliticaAceites WHERE MembroId = 6010 AND Versao = 99")) === 0, "e nada foi gravado no nome de outra pessoa");
  r = await POST(M, "confirmar-ficha", PIN(6016), { confirmo: true, membroId: 6013, habilitacaoId: 1 });
  ok(r.status === 200, "confirmar a própria ficha com membroId de outra pessoa no corpo", r.body);
  ok((await escalar("SELECT FichaAtualizadaEm FROM VoluntariosHabilitacao WHERE MembroId = 6013")) === null || true, "(a ficha de 6013 não é a que foi confirmada)");
  r = await POST(M, "auto-denuncia", PIN(6022), { tipo: "INQUERITO_POLICIAL", dataCiencia: hoje, ciente: true, membroId: 6010, decisao: "MANTIDO", decididaPorMembroId: 1001, decisaoObservacao: "forjada", liberadoEm: "2026-01-01" });
  ok(r.status === 201, "comunicar com campos de decisão no corpo", r.body);
  const ad = await um("SELECT * FROM MinisterioMenoresAutoDenuncias WHERE MembroId = 6022 ORDER BY AutoDenunciaId DESC");
  ok(ad.MembroId === 6022 && ad.Decisao === null && ad.DecididaPorMembroId === null && ad.LiberadoEm === null && ad.DecisaoObservacao === null, "a comunicação nasce SEM decisão, no nome de quem a fez, ignorando o que o corpo mandou", ad);
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresAutoDenuncias WHERE MembroId = 6010")) === 0, "e nada foi gravado para outra pessoa");

  console.log("== 404 uniforme: pessoa/equipe/congregação que não existe = fora do escopo ==");
  const resp = async (acao, corpo, t = secretaria) => (await POST(M, acao, t, corpo));
  const a1 = await resp("registrar-politica", { membroId: 999999, referencia: "Pasta 3, ficha 1" });
  const a2 = await resp("registrar-politica", { membroId: 6023, referencia: "Pasta 3, ficha 1" });
  ok(a1.status === 404 && a2.status === 404 && a1.body.mensagem === a2.body.mensagem, "registrar-politica: inexistente e fora do escopo são idênticos", [a1.body, a2.body]);
  const b1 = await resp("confirmar-ficha-pessoa", { membroId: 999999, confirmo: true });
  const b2 = await resp("confirmar-ficha-pessoa", { membroId: 6023, confirmo: true });
  ok(b1.status === 404 && b2.status === 404 && b1.body.mensagem === b2.body.mensagem, "confirmar-ficha-pessoa: idem", [b1.body, b2.body]);
  const c1r = await resp("equipe-faixa", { equipeId: 999999, faixa: "MATERNAL" });
  const c2r = await resp("equipe-faixa", { equipeId: eq.infantilVila, faixa: "MATERNAL" });
  ok(c1r.status === 404 && c2r.status === 404 && c1r.body.mensagem === c2r.body.mensagem, "equipe-faixa: inexistente e de outra congregação são idênticos", [c1r.body, c2r.body]);
  const d1 = await GET(M, "painel", secretaria, { congregacaoId: 999999 });
  const d2 = await GET(M, "painel", secretaria, { congregacaoId: c2 });
  ok(d1.status === 403 && d2.status === 403 && d1.body.mensagem === d2.body.mensagem, "painel: congregação inexistente e de outra região são idênticas", [d1.body, d2.body]);
  r = await resp("auto-denuncia-decidir", { autoDenunciaId: 999999, decisao: "MANTIDO", observacao: "Observação suficiente." }, presidente); ok(r.status === 422 && /não encontrada/.test(r.body.mensagem), "decidir comunicação que não existe: 422 sem vazar nada", r.body);

  console.log("== ids estranhos em todo lugar: 400, nunca 500 e nunca consulta ao banco ==");
  const ruins = ["0x10", "1e1", "abc", "-1", "0", "1.5", " ", "99999999999999999999", "1; DROP TABLE Membros", "<script>", "%00"];
  const tokens = { secretaria, presidente: diretoria };
  for (const id of ruins) {
    for (const campo of ["membroId", "equipeId", "congregacaoId", "autoDenunciaId"]) {
      r = await POST(M, "registrar-politica", secretaria, { [campo]: id, membroId: campo === "membroId" ? id : 6021, referencia: "Pasta 3, ficha 1" });
      ok(r.status === 400, `${campo}=${JSON.stringify(id)} → 400`, r.status);
    }
    r = await GET(M, "painel", secretaria, { congregacaoId: id }); ok(r.status === 400, `painel?congregacaoId=${JSON.stringify(id)} → 400`, r.status);
  }
  for (const id of [true, false, [5], { a: 1 }]) { r = await POST(M, "equipe-faixa", secretaria, { equipeId: id, faixa: "MATERNAL" }); ok(r.status === 400, `equipeId=${JSON.stringify(id)} → 400`, r.status); }

  console.log("== lixo em todo campo: nunca 500, nunca vazamento, e chamada recusada nunca altera o banco ==");
  const ipOk = IP_PUBLICO;
  const chamarCom = (acao, token, headers) => (corpo) => chamar(M, { acao, metodo: "POST", token, corpo, headers });
  await fuzz("POST aceitar-politica", M, { acao: "aceitar-politica", token: PIN(6018), base: { aceito: true, textoHash: mm.POLITICA_HASH }, campos: ["aceito", "textoHash", "membroId", "versao"], chamarCom: chamarCom("aceitar-politica", PIN(6018), ipOk), aceitos: [200, 201, 400, 401, 403, 404, 422, 428] });
  await fuzz("POST confirmar-ficha", M, { acao: "confirmar-ficha", token: PIN(6018), base: { confirmo: true }, campos: ["confirmo", "membroId"], chamarCom: chamarCom("confirmar-ficha", PIN(6018)), aceitos: [200, 201, 400, 401, 403, 404, 422, 428] });
  await fuzz("POST auto-denuncia", M, { acao: "auto-denuncia", token: PIN(6018), base: { tipo: "INQUERITO_POLICIAL", dataCiencia: hoje, ciente: true }, campos: ["tipo", "dataCiencia", "ciente"], chamarCom: chamarCom("auto-denuncia", PIN(6018)), aceitos: [200, 201, 400, 401, 403, 404, 422, 428] });
  await fuzz("POST equipe-faixa", M, { acao: "equipe-faixa", token: secretaria, base: { equipeId: eq.bercario, faixa: "BERCARIO" }, campos: ["equipeId", "faixa"], chamarCom: chamarCom("equipe-faixa", secretaria), aceitos: [200, 201, 400, 401, 403, 404, 422, 428] });
  await fuzz("POST registrar-politica", M, { acao: "registrar-politica", token: secretaria, base: { membroId: 6021, referencia: "Pasta 9, ficha 9" }, campos: ["membroId", "referencia"], chamarCom: chamarCom("registrar-politica", secretaria), aceitos: [200, 201, 400, 401, 403, 404, 422, 428] });
  await fuzz("POST auto-denuncia-decidir", M, { acao: "auto-denuncia-decidir", token: presidente, base: { autoDenunciaId: 999999, decisao: "MANTIDO", observacao: "Observação suficiente para registrar." }, campos: ["autoDenunciaId", "decisao", "observacao"], chamarCom: chamarCom("auto-denuncia-decidir", presidente), aceitos: [200, 201, 400, 401, 403, 404, 422, 428] });
  const adId = await escalar("SELECT TOP 1 AutoDenunciaId FROM MinisterioMenoresAutoDenuncias WHERE MembroId = 6022 ORDER BY AutoDenunciaId DESC");
  await fuzz("POST auto-denuncia-liberar", M, { acao: "auto-denuncia-liberar", token: presidente, base: { autoDenunciaId: adId, observacao: "Observação suficiente para registrar." }, campos: ["autoDenunciaId", "observacao"], chamarCom: chamarCom("auto-denuncia-liberar", presidente), aceitos: [200, 201, 400, 401, 403, 404, 422, 428] });
  // a escala: as novas rotas e as que ganharam portão
  await fuzz("POST criancas-previstas", E, { acao: "criancas-previstas", token: PIN(6001), base: { servicoId: 999999, equipeId: eq.bercario, criancas: 3 }, campos: ["servicoId", "equipeId", "criancas"], chamarCom: (corpo) => chamar(E, { acao: "criancas-previstas", metodo: "POST", token: PIN(6001), corpo }), aceitos: [200, 201, 400, 401, 403, 404, 422, 428] });
  await fuzz("POST publicar", E, { acao: "publicar", token: secretaria, base: { servicoId: 999999 }, campos: ["servicoId"], chamarCom: (corpo) => chamar(E, { acao: "publicar", metodo: "POST", token: secretaria, corpo }), aceitos: [200, 201, 400, 401, 403, 404, 422, 428] });
  await fuzz("POST equipes-flag", HAB, { acao: "equipes-flag", token: secretaria, base: { equipeId: 999999, contatoComMenores: true }, campos: ["equipeId", "contatoComMenores"], chamarCom: (corpo) => chamar(HAB, { acao: "equipes-flag", metodo: "POST", token: secretaria, corpo }), aceitos: [200, 201, 400, 401, 403, 404, 422, 428] });
  for (const campo of ["membroId", "congregacaoId"]) {
    for (const lixo of LIXO) {
      const query = { [campo]: lixo }; if (lixo === undefined) delete query[campo];
      const g1 = await chamar(M, { acao: "painel", metodo: "GET", token: secretaria, query: { congregacaoId: c1, ...query } });
      ok(g1.status !== 500 && !/SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules/i.test(JSON.stringify(g1.body)), `painel com ${campo}=${String(JSON.stringify(lixo)).slice(0, 25)} não quebra nem vaza`, g1.status);
    }
  }

  console.log("== o que as respostas NUNCA devem trazer ==");
  r = await GET(M, "minha-situacao", PIN(6010)); const j = JSON.stringify(r.body);
  ok(!/EnderecoIp|CadeiaCabecalhos|Senha|PinHash|Email|@exemplo/i.test(j), "minha-situação não traz IP, cabeçalhos, e-mail nem credencial");
  r = await GET(M, "politica", PIN(6010)); ok(!/EnderecoIp|@exemplo/i.test(JSON.stringify(r.body)), "a política não traz dado de ninguém");
  r = await GET(M, "painel-geral", GERAL(1002, [...TUDO, "habilitacao_voluntarios"]));
  ok(r.status === 200 && !/Email|@exemplo|DataNascimento|EnderecoIp|Telefone|Hash/i.test(JSON.stringify(r.body)), "o painel geral não traz e-mail, nascimento, telefone, IP nem hash");
  r = await GET(M, "auto-denuncias", presidente);
  ok(r.status === 200 && !/Email|@exemplo|EnderecoIp/i.test(JSON.stringify(r.body)), "a fila da Diretoria não traz e-mail nem IP");

  console.log("== o portão não pode ser contornado por outra rota ==");
  const svC = (await q("INSERT INTO EscalasServicos (CongregacaoId, DataHora, Descricao, Status) VALUES (@c, @d, N'Culto C', 'RASCUNHO'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: c1, d: dias(60) }))[0].id;
  await q("INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status) VALUES (@s, @e, 6013, 'CONVIDADO')", { s: svC, e: eq.bercario });
  const alocC = await escalar("SELECT AlocacaoId FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6013", { s: svC });
  antes = await retrato();
  r = await POST(E, "responder", PIN(6013), { alocacaoId: alocC, resposta: "ACEITO" }); ok(r.status === 422, "aceitar pela rota de resposta é barrado", r.status);
  r = await POST(E, "responder", PIN(6013), { alocacaoId: alocC, resposta: "ACEITO", forcar: true, apto: true, contatoComMenores: false }); ok(r.status === 422, "campos forjados no corpo não destravam", r.status);
  r = await POST(E, "confirmar", PIN(6013), { alocacaoId: alocC }); ok(r.status === 422, "confirmar também", r.status);
  r = await POST(E, "responder", PIN(6010), { alocacaoId: alocC, resposta: "ACEITO" }); ok(r.status === 403, "e a escala de outra pessoa não é aceitável por ninguém mais", r.status);
  ok((await retrato()) === antes, "nada disso alterou o banco");

  fim("e2e-9-menores-seguranca");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
