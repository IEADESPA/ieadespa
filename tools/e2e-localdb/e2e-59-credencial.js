// e2e-59-credencial.js — v8.4 (Credencial digital com QR): fluxos, segurança e lixo, com os handlers e o banco REAIS, sobre a base "cenario-escada" (já com a 159).
// Emitir, a credencial no Meu Painel (QR, PDF), a leitura pública do QR (só o mínimo; a situação de agora: AFM inativa, afastamento, sem comunhão), nova via, cancelar,
// pedido e registro de impressão, lote, minimização, Meus Dados; quem pode o quê; ids ruins; lixo; o limitador da página pública.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, hojeBr, LIXO } = L;
const E = require("./lib-escada");
const { P, SEC, chamarRota } = E;

console.error = () => { };
// com E2E_CONTRATO=1, as respostas reais vão para tools/front-credencial/contrato-real.json (a prova da tela usa exatamente o que o servidor devolve)
const contrato = {};
const guardar = (nome, r) => { contrato[nome] = r && r.body; return r; };
const cred = (acao, { token, metodo = "GET", corpo, query } = {}) => chamarRota("GestaoCredenciais/index.js", { metodo, binding: acao ? { acao } : {}, token, corpo, query });
let ipN = 0;
const ler = (codigo, ip) => chamarRota("VerificarCredencial/index.js", { binding: { codigo }, headers: { "x-forwarded-for": `9.9.9.9, ${ip || `177.8.${Math.floor(++ipN / 250)}.${ipN % 250}`}:443, 10.0.0.1:80` } });
const MEMBRO = (m) => L.sessao(m, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() } });
const ehPdf = (r) => r.status === 200 && Buffer.isBuffer(r.body) && r.body.slice(0, 5).toString() === "%PDF-";
const valida = (m) => um("SELECT CredencialId, Via, Codigo, Situacao FROM CredenciaisEclesiasticas WHERE MembroId = @m AND Situacao = 'VALIDA'", { m });
const PUBLICAS = new Set(["sucesso", "situacao", "nome", "categoria", "congregacao", "via", "funcao", "consultadoEm", "mensagem"]);

(async () => {
  await obterPool();
  await E.montarCenario();

  console.log("== emitir ==");
  let r = await cred("emitir", { token: SEC(), metodo: "POST", corpo: { membroId: P.auxiliar } });
  ok(r.status === 201 && /via 1/.test(r.body.mensagem), "a Secretaria Geral emite (via 1)", r.body);
  let c = await valida(P.auxiliar);
  ok(c && c.Via === 1 && /^[A-HJ-NP-Z2-9]{16}$/.test(c.Codigo), "uma credencial válida, com o código de 16 caracteres", c);
  r = await cred("emitir", { token: SEC(), metodo: "POST", corpo: { membroId: P.auxiliar } });
  ok(r.status === 409 && /nova via/.test(r.body.mensagem), "emitir de novo: 409 (use nova via)", r.body);
  await q("UPDATE MembroReferencia SET SituacaoMembro = 'CONGREGADO' WHERE MembroId = @m", { m: P.menor });
  r = await cred("emitir", { token: SEC(), metodo: "POST", corpo: { membroId: P.menor } });
  ok(r.status === 422 && /Congregado/.test(r.body.mensagem), "congregado não recebe", r.body);
  r = await cred("emitir", { token: SEC(), metodo: "POST", corpo: { membroId: 999999 } });
  ok(r.status === 404, "matrícula inexistente: 404", r.body);

  console.log("== Meu Painel: a credencial, o QR e o PDF ==");
  r = guardar("minha", await cred("minha", { token: MEMBRO(P.auxiliar) }));
  const minha = r.body.credencial;
  ok(r.status === 200 && minha && minha.categoria === "Obreiro(a) — Auxiliar" && minha.situacaoAgora.situacao === "ATIVA" && minha.situacaoAgora.funcao === "HABILITADO", "a própria credencial com a situação de agora", minha);
  ok(minha && /\/credencial\.html\?c=/.test(minha.url) && minha.codigo.replace(/-/g, "") === c.Codigo && /^http/.test(minha.fotoUrl || ""), "o endereço do QR, o código e a foto do cadastro (link assinado)", minha && { url: minha.url, foto: !!minha.fotoUrl });
  r = guardar("minhaSem", await cred("minha", { token: MEMBRO(P.missionario) }));
  ok(r.status === 200 && r.body.credencial === null, "quem ainda não tem: credencial nula (a tela diz para falar com a Secretaria)");
  r = await cred("qr", { token: MEMBRO(P.auxiliar) });
  ok(r.status === 200 && /svg/.test(r.headers["Content-Type"]) && /<svg/.test(String(r.body)), "o QR em SVG");
  ok(ehPdf(await cred("pdf", { token: MEMBRO(P.auxiliar) })), "o PDF do próprio cartão");
  ok(ehPdf(await cred("pdf", { token: SEC(), query: { membroId: P.auxiliar } })), "a Secretaria Geral baixa o de qualquer um");
  ok((await cred("pdf", { token: MEMBRO(P.missionario), query: { membroId: P.auxiliar } })).status === 403, "outro membro não baixa o PDF de ninguém");
  ok((await cred("qr", { token: L.LIDER(P.lider, ["pessoas"], [E.CENTRAL]), query: { membroId: P.auxiliar } })).status === 403, "nem o Dirigente local (só a Secretaria Geral)");
  ok((await cred("pdf", { token: SEC(), query: { membroId: P.missionario } })).status === 404, "sem credencial: 404");

  console.log("== a leitura pública do QR (Art. 76 §1º) ==");
  r = guardar("publicaAtiva", await ler(c.Codigo));
  ok(r.status === 200 && r.body.situacao === "ATIVA" && r.body.nome && r.body.funcao === "HABILITADO" && r.body.categoria === "Obreiro(a) — Auxiliar", "ativa, obreiro habilitado", r.body);
  ok(Object.keys(r.body).every((k) => PUBLICAS.has(k)) && !JSON.stringify(r.body).includes(String(P.auxiliar)), "só o mínimo: nem matrícula, nem foto, nem contato", Object.keys(r.body));
  ok((await ler(c.Codigo.replace(/(.{4})/g, "$1-").slice(0, 19).toLowerCase())).body.situacao === "ATIVA", "o código com traços e minúsculas também serve");
  await q("UPDATE Matriculas_AFM SET StatusMatricula = 'INATIVA' WHERE MembroId = @m", { m: P.auxiliar });
  r = guardar("publicaObreiroInativo", await ler(c.Codigo));
  ok(r.body.situacao === "ATIVA" && r.body.funcao === "INATIVO" && !/AFM|matr|desmatr/i.test(JSON.stringify(r.body)), "matrícula da AFM inativa: obreiro inativo (sem o motivo)", r.body);
  await q("UPDATE Matriculas_AFM SET StatusMatricula = 'ATIVA' WHERE MembroId = @m", { m: P.auxiliar });
  const proc = await escalar("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) OUTPUT INSERTED.ProcessoId VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.auxiliar, d: hojeBr() });
  ok((await ler(c.Codigo)).body.funcao === "HABILITADO", "processo só aberto (sem julgamento nem afastamento): continua habilitado — nada aparece no QR");
  await q("UPDATE ProcessosDisciplinares SET Status = 'AFASTAMENTO_CAUTELAR' WHERE ProcessoId = @p", { p: proc });
  r = await ler(c.Codigo);
  ok(r.body.funcao === "INATIVO" && !/disciplin|afast/i.test(JSON.stringify(r.body)), "afastamento cautelar: obreiro inativo (sem dizer por quê)", r.body);
  await q("DELETE FROM ProcessosDisciplinares WHERE ProcessoId = @p", { p: proc });
  await q("UPDATE MembroReferencia SET SituacaoMembro = 'SEM_COMUNHAO' WHERE MembroId = @m", { m: P.auxiliar });
  ok((await ler(c.Codigo)).body.situacao === "INATIVA", "sem comunhão: inativa");
  await q("UPDATE MembroReferencia SET SituacaoMembro = 'EM_COMUNHAO' WHERE MembroId = @m", { m: P.auxiliar });
  for (const ruim of ["x", "ABCD", "ABCD-EFGH-JKLM-NPQ1", "'; --", "", "A".repeat(40)]) {
    const x = await ler(ruim);
    ok(x.status === 404 && x.body.situacao === "NAO_ENCONTRADA", `código ${JSON.stringify(ruim).slice(0, 20)}: 404 igual`);
  }
  const tetos = [];
  for (let i = 0; i < 31; i++) tetos.push((await ler(c.Codigo, "200.1.2.3")).status);
  ok(tetos.slice(0, 30).every((s) => s === 200) && tetos[30] === 429, "a página pública tem limite: a 31ª leitura no minuto, da mesma origem, é 429", tetos.slice(-3));

  console.log("== nova via, cancelar ==");
  r = await cred("nova-via", { token: SEC(), metodo: "POST", corpo: { membroId: P.auxiliar, motivo: "x" } });
  ok(r.status === 400, "sem motivo: 400", r.body);
  r = await cred("nova-via", { token: SEC(), metodo: "POST", corpo: { membroId: P.auxiliar, motivo: "Perda do cartão (e2e)" } });
  const c2 = await valida(P.auxiliar);
  ok(r.status === 201 && c2.Via === 2 && c2.Codigo !== c.Codigo, "nova via: via 2 com outro código", { r: r.body, c2 });
  r = guardar("publicaSubstituida", await ler(c.Codigo));
  ok(r.body.situacao === "SUBSTITUIDA" && Object.keys(r.body).every((k) => ["sucesso", "situacao", "nome", "consultadoEm"].includes(k)), "o QR antigo: substituída (e nada além do nome)", r.body);
  ok((await ler(c2.Codigo)).body.situacao === "ATIVA", "o novo: ativa");
  ok((await um("SELECT MotivoEncerramento, EncerradaPor FROM CredenciaisEclesiasticas WHERE CredencialId = @id", { id: c.CredencialId })).MotivoEncerramento === "Perda do cartão (e2e)", "o motivo fica na via antiga");
  r = await cred("cancelar", { token: SEC(), metodo: "POST", corpo: { membroId: P.auxiliar, motivo: "Pedido do próprio membro (e2e)" } });
  ok(r.status === 200 && (await ler(c2.Codigo)).body.situacao === "CANCELADA" && !(await valida(P.auxiliar)), "cancelada: o QR diz 'cancelada' e não há mais válida");
  ok((await cred("cancelar", { token: SEC(), metodo: "POST", corpo: { membroId: P.auxiliar, motivo: "De novo (e2e)" } })).status === 422, "cancelar sem credencial válida: 422");
  ok((await cred("nova-via", { token: SEC(), metodo: "POST", corpo: { membroId: P.auxiliar, motivo: "Sem válida (e2e)" } })).status === 422, "nova via sem credencial válida: 422");
  r = await cred("emitir", { token: SEC(), metodo: "POST", corpo: { membroId: P.auxiliar } });
  ok(r.status === 201 && (await valida(P.auxiliar)).Via === 3, "emitir de novo depois de cancelada: via 3", r.body);

  console.log("== impressão (só a Secretaria Geral) ==");
  r = await cred("pedir-impressao", { token: MEMBRO(P.auxiliar), metodo: "POST" });
  ok(r.status === 200 && /Secretaria Geral/.test(r.body.mensagem), "a pessoa pede a impressão", r.body);
  r = await cred("pedir-impressao", { token: MEMBRO(P.auxiliar), metodo: "POST" });
  ok(r.status === 200 && /já está com a Secretaria/.test(r.body.mensagem), "pedir de novo: já está pedido");
  ok((await cred("pedir-impressao", { token: MEMBRO(P.missionario), metodo: "POST" })).status === 422, "quem não tem credencial não pede");
  r = guardar("lista", await cred(undefined, { token: SEC() }));
  const lista = r.body.itens || [];
  ok(r.status === 200 && lista[0] && lista[0].membroId === P.auxiliar && lista[0].impressaoSolicitadaEm && !("codigo" in lista[0] && lista[0].codigo), "a lista da Secretaria traz o pedido primeiro (sem o código)", lista[0]);
  ok(Number.isInteger(r.body.semCredencial) && r.body.semCredencial > 0, "e quantos ativos ainda não têm", r.body.semCredencial);
  const idImp = (await valida(P.auxiliar)).CredencialId;
  r = await cred("impressa", { token: SEC(), metodo: "POST", corpo: { credencialId: idImp } });
  ok(r.status === 200, "a Secretaria registra a impressão", r.body);
  ok((await cred("impressa", { token: SEC(), metodo: "POST", corpo: { credencialId: idImp } })).status === 409, "registrar de novo: 409");
  r = await cred("pedir-impressao", { token: MEMBRO(P.auxiliar), metodo: "POST" });
  ok(/já foi impressa/.test(r.body.mensagem), "depois de impressa, o pedido diz isso");

  console.log("== lote ==");
  r = await cred("lote", { token: SEC(), metodo: "POST" });
  ok(r.status === 200 && r.body.emitidas > 0 && r.body.faltam === 0, "emite para todos os ativos em comunhão sem credencial", r.body);
  ok(!(await valida(P.menor)), "o congregado ficou de fora");
  r = await cred("lote", { token: SEC(), metodo: "POST" });
  ok(r.body.emitidas === 0, "de novo: nenhuma (todos já têm)", r.body);
  ok((await escalar("SELECT COUNT(*) FROM (SELECT MembroId FROM CredenciaisEclesiasticas WHERE Situacao = 'VALIDA' GROUP BY MembroId HAVING COUNT(*) > 1) x")) === 0, "ninguém com duas válidas");

  console.log("== Meus Dados e a minimização ==");
  r = await chamarRota("MeusDadosLGPD/index.js", { token: MEMBRO(P.auxiliar), binding: { matricula: String(P.auxiliar) } });
  const vias = r.body && r.body.escada && r.body.escada.credenciais;
  ok(Array.isArray(vias) && vias.length === 3 && !JSON.stringify(vias).includes(c.Codigo), "Meus Dados: as três vias, sem o código", vias);
  const cMis = await valida(P.missionario);
  const mini = require(path.join(API, "shared/minimizacaoLgpd.js"));
  await mini.minimizarCamposExMembro(await obterPool(), P.missionario, { dataSaida: hojeBr(), motivo: "Carta de Mudança" });
  ok(!(await valida(P.missionario)) && (await ler(cMis.Codigo)).body.situacao === "CANCELADA", "desligado e minimizado: a credencial é recolhida (cancelada — Art. 95 §2º, IV, a)");

  console.log("== quem pode o quê ==");
  const recusas = [];
  const ATOS = [["", "GET"], ["emitir", "POST"], ["lote", "POST"], ["nova-via", "POST"], ["cancelar", "POST"], ["impressa", "POST"]];
  for (const [nome, tk, esperado] of [["sem sessão", undefined, 401], ["PIN", L.PIN(P.auxiliar), [401, 403]], ["líder local com pessoas", L.LIDER(P.lider, ["pessoas"], [E.CENTRAL]), 403], ["geral sem pessoas", L.GERAL(1003, ["afm", "consagracoes"]), 403]]) {
    for (const [acao, metodo] of ATOS) {
      const x = await cred(acao || undefined, { token: tk, metodo, corpo: { membroId: P.auxiliar, motivo: "Tentativa indevida", credencialId: idImp } });
      if (![].concat(esperado).includes(x.status)) recusas.push(`${nome} ${metodo} ${acao || "lista"}: ${x.status}`);
    }
  }
  ok(recusas.length === 0, "sem sessão 401; PIN, líder local e geral sem 'pessoas': recusados em tudo da Secretaria", recusas);
  ok((await cred("minha", {})).status === 401 && (await cred("pedir-impressao", { metodo: "POST" })).status === 401, "minha e pedir impressão: só com sessão");
  const antes = await escalar("SELECT COUNT(*) FROM CredenciaisEclesiasticas");
  const quebras = [];
  for (const campo of ["membroId", "motivo", "credencialId"]) for (const lixo of LIXO) {
    for (const acao of ["emitir", "nova-via", "cancelar", "impressa"]) {
      const corpo = { membroId: P.vetado, motivo: "Motivo de teste", credencialId: 999999 };
      if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
      const x = await cred(acao, { token: SEC(), metodo: "POST", corpo });
      if (!x.status || x.status >= 500 || /SELECT |mssql|tedious|node_modules/.test(JSON.stringify(x.body))) quebras.push(`${acao}.${campo}=${JSON.stringify(lixo).slice(0, 20)} -> ${x.status}`);
    }
  }
  for (const lixo of LIXO) {
    const x = await cred("pdf", { token: SEC(), query: { membroId: lixo } });
    if (!x.status || x.status >= 500) quebras.push(`pdf.membroId=${JSON.stringify(lixo).slice(0, 20)} -> ${x.status}`);
  }
  ok(quebras.length === 0, "lixo em todo campo: nenhuma 500 nem texto interno", quebras.slice(0, 5));
  void antes;   // os pedidos válidos no meio do lixo (nova via com motivo) criam vias de verdade: o que importa é continuar uma só válida
  ok((await escalar("SELECT COUNT(*) FROM CredenciaisEclesiasticas WHERE MembroId = @m AND Situacao = 'VALIDA'", { m: P.vetado })) <= 1, "depois do lixo, nunca mais de uma credencial válida (o cancelamento válido no meio do lixo pode deixar nenhuma)");

  guardar("publicaNaoEncontrada", await ler("ABCD-EFGH-JKLM-NPQR"));
  guardar("publicaCancelada", await ler(cMis.Codigo));
  if (process.env.E2E_CONTRATO) {
    if (contrato.minha && contrato.minha.credencial) contrato.minha.credencial.fotoUrl = "https://ieadespaarmazenamento.blob.core.windows.net/fotos-membros/membro-1";   // sem o link assinado
    require("fs").mkdirSync(path.join(__dirname, "..", "front-credencial"), { recursive: true });
    require("fs").writeFileSync(path.join(__dirname, "..", "front-credencial", "contrato-real.json"), JSON.stringify(contrato, null, 2));
    console.log("contrato gravado em tools/front-credencial/contrato-real.json");
  }
  fim("e2e-59 credencial");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
