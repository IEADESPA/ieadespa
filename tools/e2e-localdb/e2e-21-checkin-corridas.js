// e2e-21-checkin-corridas.js — v7.10: corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server e TODOS com o MESMO AUTH_SECRET) nas rotas do check-in infantil:
// duas retiradas do mesmo código, as tentativas de código em paralelo (o teto de 5 não fura), o check-in duplicado (criança membro e visitante, na mesma sala e em salas diferentes),
// a entrada na sala, a lotação, a saída contra o check-in, a decisão da divergência, a segunda via, o destravar, a lista de autorizados, a revogação do consentimento contra o
// check-in e a rotina diária. Em cada uma: nenhuma 500, e o estado final do banco tem de ser um estado que UMA ordem qualquer de execução produziria. Parte da base "cenario-checkin".
process.env.AUTH_SECRET = "segredo-das-corridas-do-checkin-" + "x".repeat(24);
process.env.CRON_SECRET = "segredo-cron-so-do-teste-e2e";
const { spawn } = require("child_process");
const H = require("./lib-checkin");
const { L, q, um, escalar, cenario, pin, gestao, ckPost, consGet, consPost, visitante, trouxeLivre, checkin, codigosDe, registrosDe, codigoErradoDe, ckRegra, IP_PUBLICO, retratoCk, notif } = H;
const { ok, fim, obterPool, path } = L;
const C = cenario();
const { c1, eq, pessoas: P, criancas: K } = C;
const CENTRAL = ["Central E2E"];
const ANA = 6010, BRUNO = 6011, CARLA = 6012, OLGA = 6024, MARIA = 6001;
const sala = (sv, e = eq.maternal) => ({ servicoId: sv, equipeId: e });

async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 700;       // folga para todos os processos subirem a ponte e conectarem; todos chamam no mesmo instante
  const procs = chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1, erro: "sem resultado" }); });
  }));
  return Promise.all(procs);
}
const contar = (rs) => rs.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
const semFalha = (rs) => rs.every((x) => x.status > 0 && x.status !== 500);
const quantos = (rs, status) => rs.filter((x) => x.status === status).length;
const PIN = (id) => ({ tipo: "PIN", membroId: id });
const GESTAO = (id = C.secretaria.central) => ({ tipo: "LIDER", membroId: id, permissoes: ["habilitacao_voluntarios"], escopo: CENTRAL, nivel: "CONGREGACAO" });
const ck = (acao, token, corpo) => ({ handler: "checkin", acao, token, corpo });
const eventosDe = async (regId, tipo) => escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE RegistroId = @r AND Tipo = @t", { r: regId, t: tipo });
const estado = (id) => um("SELECT Situacao, Tentativas, Travado, CodigoGeracao, CodigoHash, RetiradoTipo, Divergente, DivergenciaDecididaPorId FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: id });
const abrir = async (voluntarios = [ANA, BRUNO, CARLA], e = eq.maternal) => H.abrirSala(c1, e, voluntarios);
const um1 = async (sv, nome, token = pin(ANA)) => { const x = await checkin(token, sv, eq.maternal, [visitante(nome, 4)], trouxeLivre("Tia Corrida Teste")); if (x.status !== 201) throw new Error(`check-in de ${nome}: ${JSON.stringify(x.body)}`); return { reg: registrosDe(x)[0], cod: codigosDe(x)[0] }; };
const R = (token, registroId, codigo, retirante) => ck("retirar", token, { registroId, codigo, retirante });

(async () => {
  await obterPool();
  let rs, b;
  const CODIGOS = [];

  console.log("== 8 retiradas ao mesmo tempo da MESMA criança com o código CERTO (2 voluntários) ==");
  let sv = await abrir();
  let v = await um1(sv, "Visitante Corrida Um Teste"); CODIGOS.push(v.cod);
  rs = await disparar(Array.from({ length: 8 }, (_, i) => R(PIN(i % 2 ? BRUNO : ANA), v.reg, v.cod, { ref: "TROUXE" })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 200) === 1 && rs.every((x) => [200, 409, 422].includes(x.status)), "exatamente UMA retirada vale; as outras 7 recebem 'o registro mudou' (409) ou 'já foi retirada' (422); nenhuma 500", contar(rs));
  b = await estado(v.reg);
  ok(b.Situacao === "RETIRADA" && b.Tentativas === 0 && (await eventosDe(v.reg, "RETIRADA")) === 1 && (await eventosDe(v.reg, "CODIGO_ERRADO")) === 0, "no banco: retirada UMA vez, UM evento RETIRADA, nenhum erro de código", b);
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao = 'CHECKIN_INFANTIL_RETIRADA' AND RegistroId = @r", { r: v.reg })) === 1, "e UMA entrada de auditoria");

  console.log("== retirada pela mãe e pedido divergente de um estranho ao mesmo tempo (o mesmo código certo) ==");
  v = await um1(sv, "Visitante Corrida Dois Teste"); CODIGOS.push(v.cod);
  rs = await disparar([...Array.from({ length: 3 }, (_, i) => R(PIN(i % 2 ? BRUNO : ANA), v.reg, v.cod, { ref: "TROUXE" })),
    ...Array.from({ length: 3 }, (_, i) => R(PIN(i % 2 ? CARLA : ANA), v.reg, v.cod, { outro: { nome: "Estranho Da Corrida Teste", parentesco: "OUTRO", documento: "RG" } }))]);
  console.log("   ", JSON.stringify(contar(rs)));
  b = await estado(v.reg);
  const pedidos = await eventosDe(v.reg, "RETIRADA_DIVERGENTE_PEDIDA"), retiradas = await eventosDe(v.reg, "RETIRADA");
  ok(semFalha(rs) && rs.every((x) => [200, 409, 422].includes(x.status)) && quantos(rs, 200) === 1, "um só pedido vence (200) e nenhum dá 500", contar(rs));
  ok((b.Situacao === "RETIRADA" && retiradas === 1 && pedidos === 0 && b.Divergente === false) || (b.Situacao === "RETIRADA_PENDENTE" && pedidos === 1 && retiradas === 0 && b.Divergente === true), "o estado final é UM dos dois (retirada pela lista OU pedido pendente), com os eventos de acordo; nunca os dois", [b, pedidos, retiradas]);

  console.log("== 14 tentativas de código ERRADO ao mesmo tempo na mesma criança (3 voluntários): o teto de 5 não fura ==");
  v = await um1(sv, "Visitante Corrida Tres Teste"); CODIGOS.push(v.cod);
  rs = await disparar(Array.from({ length: 14 }, (_, i) => R(PIN([ANA, BRUNO, CARLA][i % 3]), v.reg, codigoErradoDe(v.cod), { ref: "TROUXE" })));
  console.log("   ", JSON.stringify(contar(rs)));
  b = await estado(v.reg);
  ok(semFalha(rs) && rs.every((x) => [409, 422].includes(x.status)), "nenhuma 500; todas recusadas (422/409)", contar(rs));
  ok(b.Tentativas === 5 && b.Travado === true, "o contador parou em 5 e a criança está travada (14 requisições, 5 conferências)", b);
  ok((await eventosDe(v.reg, "CODIGO_ERRADO")) === 5 && (await eventosDe(v.reg, "CRIANCA_TRAVADA")) === 1, "5 eventos de erro e UM evento de trava (só quem fez a 5ª reserva trava)", { erros: await eventosDe(v.reg, "CODIGO_ERRADO"), travas: await eventosDe(v.reg, "CRIANCA_TRAVADA") });
  ok(rs.filter((x) => x.flags && x.flags.codigoErrado).length === 5, "exatamente 5 respostas foram 'código errado' conferido; as outras 9 nem chegaram a conferir", rs.filter((x) => x.flags && x.flags.codigoErrado).length);

  console.log("== 19 códigos errados e UM certo ao mesmo tempo: nunca mais de 5 conferências, e o certo só vale se conseguiu uma das 5 reservas ==");
  v = await um1(sv, "Visitante Corrida Quatro Teste"); CODIGOS.push(v.cod);
  rs = await disparar([R(PIN(CARLA), v.reg, v.cod, { ref: "TROUXE" }), ...Array.from({ length: 19 }, (_, i) => R(PIN(i % 2 ? BRUNO : ANA), v.reg, codigoErradoDe(v.cod), { ref: "TROUXE" }))]);
  console.log("   ", JSON.stringify(contar(rs)));
  b = await estado(v.reg);
  const errosConferidos = await eventosDe(v.reg, "CODIGO_ERRADO");
  ok(semFalha(rs) && errosConferidos <= 5 && b.Tentativas <= 5, "no máximo 5 conferências (erros + o certo) e o contador nunca passa de 5", [errosConferidos, b.Tentativas]);
  ok((b.Situacao === "RETIRADA" && (await eventosDe(v.reg, "RETIRADA")) === 1 && b.Tentativas === 0) || (b.Situacao === "NA_SALA" && b.Travado === true && errosConferidos === 5), "estado final coerente: ou o certo ganhou a reserva (retirada, uma vez) ou as 5 reservas foram dos errados e a criança travou", [b, errosConferidos]);

  console.log("== 6 check-ins ao mesmo tempo da MESMA criança membro, de 3 voluntários ==");
  await H.limpar(); sv = await abrir();
  rs = await disparar(Array.from({ length: 6 }, (_, i) => ck("checkin", PIN([ANA, BRUNO, CARLA][i % 3]), { ...sala(sv), criancas: [{ menorId: K.bia }], trouxe: { responsavelId: P.alice } })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 201) === 1 && rs.every((x) => [201, 422].includes(x.status)), "exatamente UM check-in vale (201); os outros 5 são 'já está numa sala' (422)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE MenorMembroId = @m AND Situacao <> 'RETIRADA'", { m: K.bia })) === 1, "há UM registro aberto da Bia");

  console.log("== 6 check-ins do MESMO visitante (nome e nascimento) ao mesmo tempo ==");
  const nascV = H.nascimentoParaIdade(4);
  const visCorpo = (nome) => ({ ...sala(sv), criancas: [{ visitante: { nome, nascimento: nascV } }], trouxe: { nome: "Tia Visitante Corrida", parentesco: "TIO", documento: "RG", contato: "11 98888-7777" } });
  rs = await disparar(Array.from({ length: 6 }, (_, i) => ck("checkin", PIN([ANA, BRUNO, CARLA][i % 3]), visCorpo("Visitante Repetido Corrida Teste"))));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 201) === 1 && rs.every((x) => [201, 422].includes(x.status)), "exatamente UM visitante entra; os outros 5 são recusados (422)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE VisitanteNome = N'Visitante Repetido Corrida Teste' AND Situacao <> 'RETIRADA'")) === 1, "há UM registro aberto dele");

  console.log("== o MESMO visitante e a MESMA criança membro em duas SALAS do mesmo serviço, ao mesmo tempo ==");
  await H.limpar();
  const svDuas = await H.servico(c1);
  await H.alocar(svDuas, eq.maternal, [ANA, BRUNO]); await H.alocar(svDuas, eq.bercario, [OLGA, MARIA]);
  for (const [m, e] of [[ANA, eq.maternal], [BRUNO, eq.maternal], [OLGA, eq.bercario], [MARIA, eq.bercario]]) await ckPost("entrar-na-sala", pin(m), sala(svDuas, e));
  rs = await disparar([
    ck("checkin", PIN(ANA), { ...visCorpo("Visitante Duas Salas Teste"), servicoId: svDuas, equipeId: eq.maternal }), ck("checkin", PIN(BRUNO), { ...visCorpo("Visitante Duas Salas Teste"), servicoId: svDuas, equipeId: eq.maternal }),
    ck("checkin", PIN(OLGA), { ...visCorpo("Visitante Duas Salas Teste"), servicoId: svDuas, equipeId: eq.bercario }), ck("checkin", PIN(MARIA), { ...visCorpo("Visitante Duas Salas Teste"), servicoId: svDuas, equipeId: eq.bercario }),
    ck("checkin", PIN(ANA), { servicoId: svDuas, equipeId: eq.maternal, criancas: [{ menorId: K.caio }], trouxe: { responsavelId: P.alice } }), ck("checkin", PIN(OLGA), { servicoId: svDuas, equipeId: eq.bercario, criancas: [{ menorId: K.caio }], trouxe: { responsavelId: P.alice } })
  ]);
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && rs.every((x) => [201, 422].includes(x.status)), "nenhuma 500 (a trava é por sala: quem decide entre as duas salas é o índice único)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE VisitanteNome = N'Visitante Duas Salas Teste' AND Situacao <> 'RETIRADA'")) === 1, "o visitante está em UMA sala só (uma das duas ganhou)");
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE MenorMembroId = @m AND Situacao <> 'RETIRADA'", { m: K.caio })) === 1, "o Caio está em UMA sala só");

  console.log("== entrada na sala em paralelo ==");
  const svE = await H.servico(c1); await H.alocar(svE, eq.maternal, [ANA]); await H.alocar(svE, eq.bercario, [OLGA]);
  rs = await disparar(Array.from({ length: 6 }, () => ck("entrar-na-sala", PIN(ANA), sala(svE))));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 201) === 6, "6 cliques no 'entrar': todos recebem 201 ('já estava' para 5)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND MembroId = @m AND SaiuEm IS NULL", { s: svE, m: ANA })) === 1, "e há UMA presença da Ana");
  rs = await disparar([...Array.from({ length: 3 }, () => ck("entrar-na-sala", PIN(MARIA), sala(svE, eq.maternal))), ...Array.from({ length: 3 }, () => ck("entrar-na-sala", PIN(MARIA), sala(svE, eq.bercario)))]);
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && (await escalar("SELECT COUNT(*) FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND MembroId = @m AND SaiuEm IS NULL", { s: svE, m: MARIA })) === 1, "a líder das duas equipes entra nas DUAS salas ao mesmo tempo: fica em UMA só", contar(rs));
  ok(rs.filter((x) => x.status === 201 && !(x.flags && x.flags.jaEstava)).length === 1 && rs.filter((x) => x.status === 422).length >= 1, "uma sala a aceita; a outra responde 422 'você já está em outra sala' (nunca 'já estava' para a sala errada)", rs.map((x) => [x.status, x.flags && x.flags.jaEstava]));

  console.log("== lotação: 6 voluntários fazem check-in de 4 crianças ao mesmo tempo numa sala com 2 adultos (cabem 10) ==");
  await H.limpar(); sv = await abrir([ANA, BRUNO]);
  rs = await disparar(Array.from({ length: 6 }, (_, i) => ck("checkin", PIN(i % 2 ? BRUNO : ANA), { ...sala(sv), criancas: [0, 1, 2, 3].map((j) => visitante(`Lote ${String.fromCharCode(65 + i)} Crianca ${String.fromCharCode(65 + j)} Teste`, 4)), trouxe: { nome: `Tia Lote ${i} Teste`, parentesco: "TIO", documento: "RG", contato: "11 98888-7777" } })));
  console.log("   ", JSON.stringify(contar(rs)));
  const naSala = await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE ServicoId = @s AND Situacao <> 'RETIRADA'", { s: sv });
  ok(semFalha(rs) && naSala <= 10 && naSala === quantos(rs, 201) * 4 && quantos(rs, 201) === 2, "a sala NUNCA passa de 10: exatamente 2 pedidos de 4 entram (8) e os outros 4 são recusados por lotação; cada pedido entra inteiro ou não entra", [naSala, contar(rs)]);

  console.log("== saída de voluntário contra check-in (a mesma trava da sala): a regra dos dois adultos e a proporção nunca ficam violadas ==");
  let violacoes = 0, trials = 0;
  for (let t = 0; t < 4; t++) {
    await H.limpar(); sv = await abrir([ANA, BRUNO, CARLA]);
    const dez = await checkin(pin(ANA), sv, eq.maternal, Array.from({ length: 6 }, (_, i) => visitante(`Dez ${t} Crianca ${String.fromCharCode(65 + i)} Teste`, 4)), trouxeLivre("Tia Dez Teste"));
    const mais = await checkin(pin(ANA), sv, eq.maternal, Array.from({ length: 4 }, (_, i) => visitante(`Dez ${t} Crianca ${String.fromCharCode(75 + i)} Teste`, 4)), trouxeLivre("Tia Dez Dois Teste"));
    if (dez.status !== 201 || mais.status !== 201) throw new Error("preparo da saída: " + JSON.stringify([dez.body, mais.body]));
    rs = await disparar([ck("sair-da-sala", PIN(BRUNO), sala(sv)), ck("checkin", PIN(ANA), { ...sala(sv), criancas: Array.from({ length: 5 }, (_, i) => visitante(`Cinco ${t} Crianca ${String.fromCharCode(65 + i)} Teste`, 4)), trouxe: { nome: "Tia Cinco Teste", parentesco: "TIO", documento: "RG", contato: "11 98888-7777" } })]);
    trials++;
    const adultos = await escalar("SELECT COUNT(*) FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND SaiuEm IS NULL", { s: sv });
    const criancas = await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE ServicoId = @s AND Situacao <> 'RETIRADA'", { s: sv });
    if (!semFalha(rs) || adultos < 2 || criancas > adultos * 5) violacoes++;
    console.log(`    tentativa ${t + 1}: adultos=${adultos} criancas=${criancas} ${JSON.stringify(rs.map((x) => x.status))}`);
  }
  ok(violacoes === 0, `${trials} rodadas: nunca ficou menos de 2 adultos com criança nem acima de 5 crianças por adulto, e nenhuma 500 (ou o voluntário saiu e o check-in foi recusado, ou o check-in entrou e a saída foi recusada)`, violacoes);

  console.log("== aprovar e negar a MESMA retirada divergente ao mesmo tempo ==");
  await H.limpar(); sv = await abrir();
  v = await um1(sv, "Visitante Decisao Corrida Teste"); CODIGOS.push(v.cod);
  let x1 = await ckPost("retirar", pin(ANA), { registroId: v.reg, codigo: v.cod, retirante: { outro: { nome: "Estranho Da Decisao Teste", parentesco: "OUTRO", documento: "RG" } } });
  ok(x1.status === 200 && x1.body.divergente, "(pedido divergente pendente)", x1.body);
  rs = await disparar([...Array.from({ length: 3 }, (_, i) => ck("decidir-divergencia", GESTAO(), { registroId: v.reg, aprovar: true, motivo: `Aprovei depois de ligar para o responsável ${i}.` })),
    ...Array.from({ length: 3 }, (_, i) => ck("decidir-divergencia", GESTAO(), { registroId: v.reg, aprovar: false, motivo: `Neguei por falta de confirmação do responsável ${i}.` }))]);
  console.log("   ", JSON.stringify(contar(rs)));
  b = await estado(v.reg);
  const aprov = await eventosDe(v.reg, "RETIRADA_DIVERGENTE_APROVADA"), neg = await eventosDe(v.reg, "RETIRADA_DIVERGENTE_NEGADA");
  ok(semFalha(rs) && quantos(rs, 200) === 1 && quantos(rs, 409) === 5, "uma decisão vale (200) e as outras 5 recebem 409", contar(rs));
  ok((b.Situacao === "RETIRADA" && aprov === 1 && neg === 0) || (b.Situacao === "NA_SALA" && neg === 1 && aprov === 0 && b.Divergente === false), "o estado final é o da decisão que venceu (aprovada OU negada), com UM só evento", [b, aprov, neg]);

  console.log("== segunda via: 6 pedidos e depois 5 confirmações ao mesmo tempo ==");
  await H.limpar(); sv = await abrir([ANA, BRUNO, CARLA]); await ckPost("entrar-na-sala", pin(MARIA), sala(sv));
  v = await um1(sv, "Visitante Via Corrida Teste"); CODIGOS.push(v.cod);
  rs = await disparar(Array.from({ length: 6 }, (_, i) => ck("segunda-via-pedir", PIN([ANA, BRUNO, CARLA][i % 3]), { registroId: v.reg, pessoa: { ref: "TROUXE" }, documento: "RG" })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 201) === 1 && quantos(rs, 422) === 5, "6 pedidos: UM é aceito (201); 5 recebem 'já há um pedido' (422)", contar(rs));
  const quemPediu = await escalar("SELECT PedidaPorMembroId FROM CheckinInfantilSegundasVias WHERE RegistroId = @r AND ConfirmadaEm IS NULL AND CanceladaEm IS NULL", { r: v.reg });
  const outros = [ANA, BRUNO, CARLA, MARIA].filter((m) => m !== quemPediu);
  rs = await disparar([...outros.map((m) => ck("segunda-via-confirmar", PIN(m), { registroId: v.reg })), ck("segunda-via-confirmar", PIN(outros[0]), { registroId: v.reg }), ck("segunda-via-confirmar", PIN(outros[1]), { registroId: v.reg })]);
  console.log("   ", JSON.stringify(contar(rs)));
  b = await estado(v.reg);
  ok(semFalha(rs) && quantos(rs, 200) === 1, "5 confirmações: UMA vale (200), as outras recebem 422/409 (ninguém recebe um segundo código)", contar(rs));
  ok(b.CodigoGeracao === 2 && (await eventosDe(v.reg, "SEGUNDA_VIA_EMITIDA")) === 1 && (await escalar("SELECT COUNT(*) FROM CheckinInfantilSegundasVias WHERE RegistroId = @r AND ConfirmadaEm IS NOT NULL", { r: v.reg })) === 1, "no banco: geração 2 (nunca 3), UM evento de emissão e UMA via confirmada", b);
  v = await um1(sv, "Visitante Via Contra Retirada Teste"); CODIGOS.push(v.cod);
  x1 = await ckPost("segunda-via-pedir", pin(ANA), { registroId: v.reg, pessoa: { ref: "TROUXE" }, documento: "RG" });
  rs = await disparar([ck("segunda-via-confirmar", PIN(BRUNO), { registroId: v.reg }), R(PIN(CARLA), v.reg, v.cod, { ref: "TROUXE" })]);
  console.log("   ", JSON.stringify(contar(rs)));
  b = await estado(v.reg);
  ok(semFalha(rs) && ((b.Situacao === "RETIRADA" && b.CodigoGeracao === 1) || (b.Situacao === "NA_SALA" && b.CodigoGeracao === 2)), "confirmar a segunda via contra retirar com o código ANTIGO: ou a retirada passou (geração 1, a via não vale) ou a via passou e o código antigo morreu (geração 2); nunca os dois", [b, rs.map((x) => x.status)]);

  console.log("== destravar em paralelo (o UPDATE que não encontra linha NÃO pode virar erro do banco) ==");
  v = await um1(sv, "Visitante Trava Corrida Teste");
  for (let i = 0; i < 5; i++) await ckPost("retirar", pin(ANA), { registroId: v.reg, codigo: codigoErradoDe(v.cod), retirante: { ref: "TROUXE" } });
  ok((await estado(v.reg)).Travado === true, "(criança travada)");
  rs = await disparar(Array.from({ length: 5 }, () => ck("destravar", GESTAO(), { registroId: v.reg })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 200) === 1 && quantos(rs, 409) === 4, "5 destravamentos: UM vale (200) e 4 recebem 409 'não está travada' (nunca 500)", contar(rs));
  ok((await eventosDe(v.reg, "CRIANCA_DESTRAVADA")) === 1, "UM evento de destravamento");

  console.log("== lista de autorizados: o mesmo adulto 5 vezes, e 14 nomes ao mesmo tempo (o limite é 8) ==");
  rs = await disparar(Array.from({ length: 5 }, () => ck("autorizado-adicionar", PIN(P.claudia), { menorId: K.duda, nome: "Dina Avo E2E", parentesco: "AVO", membroId: P.dina })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 201) === 1 && quantos(rs, 422) === 4, "a mesma avó 5 vezes: UMA entra (índice único), 4 recebem 'já está na lista'", contar(rs));
  rs = await disparar(Array.from({ length: 14 }, (_, i) => ck("autorizado-adicionar", PIN(P.claudia), { menorId: K.enzo, nome: `Pessoa Autorizada ${String.fromCharCode(65 + i)}${String.fromCharCode(97 + i)} Teste`, parentesco: "TIO" })));
  console.log("   ", JSON.stringify(contar(rs)));
  const ativos = await escalar("SELECT COUNT(*) FROM CheckinInfantilAutorizados WHERE MenorMembroId = @m AND RevogadoEm IS NULL", { m: K.enzo });
  ok(semFalha(rs) && ativos <= 8, "14 nomes ao mesmo tempo: o limite de 8 por criança NUNCA é ultrapassado", [ativos, contar(rs)]);

  console.log("== revogar o consentimento de saúde ao mesmo tempo que o check-in da criança ==");
  await H.limpar(); sv = await abrir();
  const hashSaude = ((await consGet("textos", pin(P.alice))).body.textos.find((t) => t.finalidade === "SAUDE_CRACHA") || {}).hash;
  let janelas = 0;
  for (let t = 0; t < 3; t++) {
    await H.limpar(); sv = await abrir();
    let r1 = await consPost("conceder", pin(P.claudia), { menorId: K.duda, finalidade: "SAUDE_CRACHA", aceito: true, termoHash: hashSaude });
    if (r1.status !== 201) { r1 = await consPost("conceder", pin(P.claudia), { menorId: K.duda, finalidade: "SAUDE_CRACHA", aceito: true, termoHash: hashSaude }); }
    await ckPost("saude-gravar", pin(P.claudia), { menorId: K.duda, texto: "Alergia a corante" });
    rs = await disparar([{ handler: "consentimento", acao: "revogar", token: PIN(P.claudia), corpo: { menorId: K.duda, finalidade: "SAUDE_CRACHA" } }, ck("checkin", PIN(ANA), { ...sala(sv), criancas: [{ menorId: K.duda }], trouxe: { responsavelId: P.claudia } })]);
    ok(semFalha(rs), `rodada ${t + 1}: nenhuma 500 (${JSON.stringify(rs.map((x) => x.status))})`, rs);
    const sobrou = await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE MenorMembroId = @m AND SaudeTexto IS NOT NULL", { m: K.duda });
    const linha = await escalar("SELECT COUNT(*) FROM CheckinInfantilSaude WHERE MenorMembroId = @m", { m: K.duda });
    if (sobrou > 0) janelas++;
    ok(linha === 0, `rodada ${t + 1}: a linha de saúde sumiu com a revogação`, linha);
  }
  console.log(`    (a cópia da saúde sobrou no registro em ${janelas} de 3 rodadas: a rotina diária a apaga)`);
  rs = await disparar([{ handler: "agendador", rotina: true, headers: { "x-cron-secret": process.env.CRON_SECRET } }]);
  ok(await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE MenorMembroId = @m AND SaudeTexto IS NOT NULL", { m: K.duda }) === 0, "depois da rotina diária NENHUMA cópia de saúde sem consentimento sobrevive (a janela da corrida é fechada)");

  console.log("== a rotina diária 3 vezes ao mesmo tempo, e a retenção em paralelo ==");
  const svAnt = await abrir([ANA, BRUNO]); await um1(svAnt, "Visitante Esquecido Corrida Teste");
  await q("UPDATE EscalasServicos SET DataHora = DATEADD(DAY, -1, DataHora) WHERE ServicoId = @s", { s: svAnt });
  rs = await disparar(Array.from({ length: 3 }, () => ({ handler: "agendador", rotina: true, headers: { "x-cron-secret": process.env.CRON_SECRET } })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.every((x) => x.status === 200), "as 3 rodadas terminam em 200 (nenhuma falha, nenhum deadlock)", rs.map((x) => [x.status, x.mensagem, x.erro]));
  const dup = await q("SELECT RegraChave, DestinatarioMembroId d, ReferenciaId r, COUNT(*) n FROM Notificacoes WHERE RegraChave LIKE 'CHECKIN[_]%' GROUP BY RegraChave, DestinatarioMembroId, ReferenciaId HAVING COUNT(*) > 1");
  ok(dup.length === 0, "nenhum aviso duplicado (mesma regra, destinatário e referência)", dup.slice(0, 3));
  ok((await notif("CHECKIN_SEM_RETIRADA")).length >= 3, "o aviso de criança sem retirada saiu para a gestão");
  rs = await disparar(Array.from({ length: 3 }, () => ({ funcao: { modulo: "checkinInfantilDb", nome: "aplicarRetencao", args: [{}] } })));
  ok(rs.every((x) => x.status === 200), "a retenção em 3 processos ao mesmo tempo: nenhum erro", rs.map((x) => x.erro));

  console.log("== o código nunca vazou nas corridas ==");
  const tudo = await H.textoDasTabelas();
  ok(CODIGOS.every((c) => !tudo.includes(c)), `nenhum dos ${CODIGOS.length} códigos emitidos nas corridas está em tabela, auditoria ou aviso`);
  ok((await retratoCk()).length > 0 && (await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name LIKE 'TR[_]Checkin%' AND is_disabled = 1")) === 0, "e todos os gatilhos seguem ligados");

  fim("e2e-21-checkin-corridas");
})().catch((e) => { H.erroFatal("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
