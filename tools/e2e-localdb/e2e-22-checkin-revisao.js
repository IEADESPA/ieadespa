// e2e-22-checkin-revisao.js — v7.10: a prova, contra o SQL Server de verdade e com os HANDLERS REAIS, de cada correção da revisão adversarial do servidor do check-in infantil:
// A1 encerrar a sala (baixa administrativa) · A2 autorizado × responsável revogado · B4 portão da EBD com número fracionário · B5 o voluntário não vê a aptidão dos colegas · B6 relatório só da gestão
// B7 retenção ampliada e gatilhos (C19) · B9 avisos obrigatórios que não podem falhar em silêncio · B10 segunda via mostra quem pediu e o documento · B11 cache curto dos prazos · B13 histórico só de quem
// ainda é menor · C15 nome do autorizado vem do cadastro · C17 destravar no teto de erros · C23 teto das recusas gravadas · C24 motivo do pedido divergente · C25 sair depois de tirado da escala · C26 acento.
// Cada ✗ é uma falha de verdade: rode também com o código ANTIGO (o roteiro foi escrito para falhar nele). Parte da base "cenario-checkin" (e2e-18).
process.env.AUTH_SECRET = "segredo-da-revisao-do-checkin-" + "x".repeat(24);       // o mesmo em todos os processos das corridas
process.env.CRON_SECRET = "segredo-cron-so-do-teste-e2e";
const { spawn } = require("child_process");
const H = require("./lib-checkin");
const { L, q, um, escalar, cenario, pin, gestao, semFator, LOGS, ckGet, ckPost, volPost, rotinaDiaria, visitante, trouxeLivre, checkin, codigosDe, registrosDe, limpar, derrubarAptidao, restaurarAptidao,
  eventos, notif, auditoria, falha, ckRegra, retratoCk, consPost } = H;
const { ok, fim, obterPool, LIDER, API, path } = L;
const C = cenario();
const { c1, c2, eq, pessoas: P, criancas: K } = C;
const CENTRAL = ["Central E2E"], VILA = ["Vila Nova E2E"];
const sec = () => gestao(C.secretaria.central, CENTRAL), secVila = () => gestao(C.secretaria.vila, VILA), secSemFator = () => semFator(C.secretaria.central, CENTRAL);
const SEC = C.secretaria.central;
const ANA = 6010, BRUNO = 6011, CARLA = 6012, OLGA = 6024;
const msg = (r) => (r.body && r.body.mensagem) || "";
const sala = (sv, e = eq.maternal) => ({ servicoId: sv, equipeId: e });
const mae = { responsavelId: P.alice };
const R = (token, registroId, codigo, retirante) => ckPost("retirar", token, { registroId, codigo, retirante });
const limparCaches = () => { if (typeof H.db.limparCaches === "function") H.db.limparCaches(); };          // (o código de antes da revisão não tem: o roteiro falha, não quebra)
const doBanco = (id) => um("SELECT * FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: id });
const MOTIVO = "Os voluntários esqueceram de registrar as retiradas depois do culto.";
const encerrar = (token, sv, motivo = MOTIVO, e = eq.maternal) => ckPost("encerrar-sala", token, { servicoId: sv, equipeId: e, motivo });
const adiantarRelogio = (sv, horas = 6) => q("UPDATE EscalasServicos SET DataHora = DATEADD(HOUR, @h, DataHora) WHERE ServicoId = @s", { s: sv, h: -horas });
const trigger = async (nome, tabela, fn) => { await q(`DISABLE TRIGGER dbo.${nome} ON dbo.${tabela}`); try { return await fn(); } finally { await q(`ENABLE TRIGGER dbo.${nome} ON dbo.${tabela}`); } };
const envelhecer = (ids, dias) => trigger("TR_CheckinRegistros_Protegido", "CheckinInfantilRegistros", () => q(`UPDATE CheckinInfantilRegistros SET EntregueEm = DATEADD(DAY, -${Number(dias)}, EntregueEm) WHERE RegistroId IN (${ids.map(Number).join(",")})`));
const refsDe = async (token, sv, registroId, e = eq.maternal) => { const s = (await ckGet("sala", token, sala(sv, e))).body; const c = ((s && s.criancas) || []).find((x) => x.registroId === registroId); return c ? c.quemPodeRetirar : []; };
const salaDe = async (token, sv, e = eq.maternal) => (await ckGet("sala", token, sala(sv, e))).body;
const inserirRegistro = async (sv, e, nome) => (await q(`INSERT INTO CheckinInfantilRegistros (ServicoId, EquipeId, CongregacaoId, VisitanteNome, VisitanteNascimento, IdadeAnos, FaixaSala, TrouxeNome, TrouxeParentesco, TrouxeDocumento, CodigoHash, EntreguePorMembroId)
  OUTPUT INSERTED.RegistroId VALUES (@s, @e, @c, @n, @nasc, 4, 'MATERNAL', N'Tia De Ontem Teste', 'TIO', 'RG', REPLICATE('a', 64), 6010)`, { s: sv, e, c: c1, n: nome, nasc: new Date(`${H.nascimentoParaIdade(4)}T00:00:00Z`) }))[0].RegistroId;

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

(async () => {
  const pool = await obterPool();
  let r, b;
  const CODIGOS = [];                                   // todo código emitido neste roteiro: nenhum pode aparecer em lugar nenhum além da resposta que o emitiu
  const anota = (x) => { for (const c of codigosDe(x)) CODIGOS.push(c); if (x.body && x.body.etiqueta && x.body.etiqueta.codigo) CODIGOS.push(x.body.etiqueta.codigo); return x; };

  // ====================================================================================================================================================
  console.log("== A1: a criança que ficou na sala depois do serviço — a liderança encerra a sala (baixa administrativa) ==");
  const svA = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  await H.alocar(svA, eq.maternal, [OLGA]);
  r = anota(await checkin(pin(ANA), svA, eq.maternal, [{ menorId: K.bia }, { menorId: K.caio }], mae)); const [rBia, rCaio] = registrosDe(r); const [cBia] = codigosDe(r);
  r = anota(await checkin(pin(ANA), svA, eq.maternal, [{ menorId: K.duda }, { menorId: K.enzo }], { responsavelId: P.claudia })); const [rDuda, rEnzo] = registrosDe(r); const cEnzo = codigosDe(r)[1];
  r = anota(await checkin(pin(ANA), svA, eq.maternal, [visitante("Visitante Esquecido A1 Teste", 4)], trouxeLivre("Tia Esquecida A1"))); const rVisA = registrosDe(r)[0];
  ok(!!rBia && !!rCaio && !!rDuda && !!rEnzo && !!rVisA, "cenário: 5 crianças na sala e ninguém registra a retirada", r.body);
  r = await R(pin(ANA), rEnzo, cEnzo, { outro: { nome: "Estranho A1 Teste", parentesco: "OUTRO", documento: "RG" } }); ok(r.status === 200 && r.body.divergente, "(Enzo com retirada divergente pendente)", r.body);
  r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: rCaio, pessoa: { ref: `RESP:${P.alice}` }, documento: "RG" }); ok(r.status === 201, "(Caio com pedido de segunda via aguardando)", r.body);

  const antesA = await retratoCk();
  r = await encerrar(sec(), svA); ok(r.status === 422 && /ainda está aberta/.test(msg(r)), "com o check-in da sala aberto e criança nela, encerrar é recusado: a criança sai pela retirada com código (422)", [r.status, msg(r)]);
  r = await encerrar(pin(CARLA), svA); ok(r.status === 403, "o voluntário da sala não encerra: 403", r.body);
  r = await encerrar(pin(SEC), svA); ok(r.status === 403, "a Secretaria entrando por PIN não encerra (PIN nunca vale como liderança): 403", r.body);
  r = await encerrar(undefined, svA); ok(r.status === 401, "sem sessão: 401", r.status);
  for (const [rotulo, motivo] of [["com motivo nulo", null], ["motivo curto demais", "ok"], ["motivo só de espaços", "      "], ["motivo com marcação", "Motivo <b>com</b> marcação"], ["motivo de 301 caracteres", "m".repeat(301)], ["motivo que não é texto", ["a", "b"]]]) {
    r = await encerrar(sec(), svA, motivo); ok(r.status === 422, `encerrar ${rotulo}: 422`, [r.status, msg(r)]);
  }
  r = await ckPost("encerrar-sala", sec(), sala(svA)); ok(r.status === 422, "encerrar SEM o campo motivo: 422", [r.status, msg(r)]);
  r = await encerrar(secSemFator(), svA); ok(r.status === 428, "sem a confirmação reforçada recente (só a senha): 428", [r.status, msg(r)]);
  r = await encerrar(secVila(), svA); const rVila = r, rNada = await encerrar(secVila(), 99999999);
  ok(rVila.status === 404 && rNada.status === 404 && JSON.stringify(rVila.body) === JSON.stringify(rNada.body), "a liderança de OUTRA congregação e uma sala que não existe recebem a MESMA resposta (404)", [rVila.status, rNada.status]);
  ok((await retratoCk()) === antesA, "nenhuma dessas recusas gravou, avisou nem auditou nada");

  // o domingo seguinte (o serviço de agora) e o culto de antes, com a janela já fechada
  await adiantarRelogio(svA);
  const svB = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  r = await checkin(pin(ANA), svB, eq.maternal, [{ menorId: K.bia }], mae); ok(r.status === 422 && /já está numa sala/.test(msg(r)), "(o problema) a Bia, esquecida no culto de antes, não faz check-in no culto de agora: 422 'já está numa sala'", r.body);
  r = await ckPost("entrar-na-sala", pin(OLGA), sala(svA)); ok(r.status === 422 && /fechou/.test(msg(r)), "(o problema) ninguém novo entra na sala de antes: a janela fechou", r.body);
  r = await ckPost("sair-da-sala", pin(ANA), sala(svA)); ok(r.status === 200, "a Ana sai da sala de antes (sobram dois adultos)", r.body);
  r = await ckPost("sair-da-sala", pin(BRUNO), sala(svA)); ok(r.status === 422 && /não pode sair agora/.test(msg(r)), "(o problema) os dois últimos adultos NÃO conseguem sair enquanto há criança na sala", r.body);

  r = await encerrar(sec(), svA);
  ok(r.status === 200 && r.body.sucesso === true && r.body.baixadas === 5 && /5 criança/.test(msg(r)), "a liderança encerra a sala (com a confirmação reforçada): 200, 5 baixas administrativas", r.body);
  const baixadas = await q("SELECT * FROM CheckinInfantilRegistros WHERE ServicoId = @s", { s: svA });
  ok(baixadas.length === 5 && baixadas.every((x) => x.Situacao === "RETIRADA" && x.RetiradoTipo === "BAIXA_ADM" && x.RetiradoPorOperadorId === SEC && x.BaixaMotivo === MOTIVO && x.RetiradoEm !== null && x.RetiradoMembroId === null
    && x.RetiradoNome === null && x.RetiradoDocumento === null && x.Divergente === false && x.Tentativas === 0 && x.Travado === false),
  "no banco: RETIRADA do tipo BAIXA_ADM, SEM retirante, com quem deu a baixa (a Secretaria) e o motivo", baixadas.map((x) => [x.RegistroId, x.Situacao, x.RetiradoTipo]));
  b = await doBanco(rBia);
  ok(b.CodigoGeracao === 1 && b.CodigoHash === ckRegra.hashCodigo(cBia, { registroId: rBia, geracao: 1, segredo: process.env.AUTH_SECRET }), "a baixa não é retirada: o código da criança não foi usado nem trocado");
  b = await doBanco(rEnzo);
  ok(b.DivergenciaDecididaPorId === SEC && b.DivergenciaPedidaEm === null && b.Divergente === false, "o pedido divergente pendente do Enzo também foi encerrado (como uma negação: quem pediu sai do registro, quem decidiu fica gravado)", b);
  ok((await escalar("SELECT CanceladaEm FROM CheckinInfantilSegundasVias WHERE RegistroId = @r", { r: rCaio })) !== null, "e o pedido de segunda via que ninguém confirmou foi cancelado");
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo = 'BAIXA_ADMINISTRATIVA' AND AtorMembroId = @a", { s: svA, a: SEC })) === 5
    && (await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE RegistroId = @r AND Tipo = 'BAIXA_ADMINISTRATIVA' AND Detalhe = 'RETIRADA_PENDENTE'", { r: rEnzo })) === 1, "um evento imutável BAIXA_ADMINISTRATIVA por criança, com quem deu a baixa (o do Enzo marca que estava pendente)");
  const evSala = await q("SELECT AtorMembroId, Detalhe FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo = 'SALA_ENCERRADA'", { s: svA });
  ok(evSala.length === 1 && evSala[0].AtorMembroId === SEC && evSala[0].Detalhe === "baixadas=5;voluntarios=2", "e um evento SALA_ENCERRADA da sala, com os números", evSala);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND SaiuEm IS NULL", { s: svA })) === 0
    && (await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo = 'VOLUNTARIO_SAIU' AND Detalhe = N'sala encerrada pela liderança'", { s: svA })) === 2, "os dois voluntários que ainda constavam presentes saíram (com o evento de saída)");
  const audE = await auditoria("CHECKIN_SALA_ENCERRADA");
  ok(audE.length === 1 && audE[0].UsuarioId === SEC && /"baixadas":5/.test(audE[0].DadosDepois) && !/esqueceram|motivo|Bia|Caio|Duda|Enzo|Visitante/.test(audE[0].DadosDepois), "a auditoria tem só ids e números (nunca o motivo nem nome de criança)", audE);
  r = await encerrar(sec(), svA);
  ok(r.status === 200 && r.body.baixadas === 0 && r.body.jaEncerrada === true, "encerrar de novo: 200 'já estava encerrada' (nada é baixado outra vez, nem é erro)", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo IN ('BAIXA_ADMINISTRATIVA', 'SALA_ENCERRADA')", { s: svA })) === 6, "e nenhum evento novo foi gravado");
  r = anota(await checkin(pin(ANA), svB, eq.maternal, [{ menorId: K.bia }], mae)); ok(r.status === 201, "depois da baixa a Bia faz o check-in no culto de agora (201)", r.body);
  r = await ckGet("historico", pin(P.alice), { menorId: K.bia }); const hBaixa = (r.body.historico || []).find((h) => h.registroId === rBia);
  ok(hBaixa && hBaixa.baixaAdministrativa === true && hBaixa.retiradoEm === null && hBaixa.quemRetirou === null && !!hBaixa.encerradaEm && /Encerrada pela liderança/.test(hBaixa.rotuloSituacao) && !JSON.stringify(r.body).includes("esqueceram"),
    "a mãe vê no histórico que a Bia foi 'encerrada pela liderança', NÃO retirada (sem 'retirada em', sem quem retirou, sem o motivo)", hBaixa);
  r = await ckGet("relatorio", sec(), sala(svA)); const relBaixa = (r.body.criancas || []).find((c) => c.registroId === rBia);
  ok(r.status === 200 && relBaixa && relBaixa.baixaAdministrativa === true && relBaixa.baixaMotivo === MOTIVO && relBaixa.tipoRetirante === "BAIXA_ADM" && relBaixa.quemRetirou === null && r.body.eventos.some((e) => e.tipo === "SALA_ENCERRADA"),
    "o relatório da liderança mostra a baixa, o motivo e o evento de encerramento", relBaixa);
  const protegido = async (rotulo, texto, params) => { const e = await falha(texto, params); ok(!!e && /custódia|não se altera/.test(e), rotulo, e); };
  await protegido("o gatilho: o motivo da baixa não se reescreve", "UPDATE CheckinInfantilRegistros SET BaixaMotivo = N'Outro motivo escrito depois' WHERE RegistroId = @r", { r: rBia });
  await protegido("e quem deu a baixa também não", "UPDATE CheckinInfantilRegistros SET RetiradoPorOperadorId = 6010 WHERE RegistroId = @r", { r: rBia });
  await protegido("e quem decidiu o pedido divergente (depois de encerrado) também não", "UPDATE CheckinInfantilRegistros SET DivergenciaDecididaPorId = 6010 WHERE RegistroId = @r", { r: rEnzo });
  await protegido("nem o motivo da decisão", "UPDATE CheckinInfantilRegistros SET DivergenciaMotivo = N'Reescrito' WHERE RegistroId = @r", { r: rEnzo });

  // sala sem criança, com o check-in ainda aberto: encerra e os voluntários saem
  const svD = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO]);
  r = await encerrar(sec(), svD); ok(r.status === 200 && r.body.baixadas === 0 && !r.body.jaEncerrada, "sala SEM criança e com o check-in aberto: encerra (nenhuma baixa) e os 2 voluntários saem", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND SaiuEm IS NULL", { s: svD })) === 0 && (await escalar("SELECT Detalhe FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo = 'SALA_ENCERRADA'", { s: svD })) === "baixadas=0;voluntarios=2", "e o evento diz 0 baixas e 2 voluntários");
  // serviço cancelado com criança dentro: a janela ainda está aberta, mas o serviço não existe mais
  const svE = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  r = await checkin(pin(ANA), svE, eq.maternal, [visitante("Visitante Servico Cancelado A1 Teste", 4)], trouxeLivre("Tia Cancelada A1")); const rVisE = registrosDe(r)[0]; anota(r);
  await q("UPDATE EscalasServicos SET Status = 'CANCELADA' WHERE ServicoId = @s", { s: svE });
  r = await encerrar(sec(), svE); ok(r.status === 200 && r.body.baixadas === 1 && (await doBanco(rVisE)).RetiradoTipo === "BAIXA_ADM", "serviço CANCELADO com criança dentro: a liderança encerra mesmo com a janela aberta", r.body);
  // o mesmo pedido de quatro processos ao mesmo tempo: uma baixa por criança, um só encerramento, nenhuma 500
  const svF = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  for (const nome of ["Visitante Corrida A1 Um Teste", "Visitante Corrida A1 Dois Teste", "Visitante Corrida A1 Tres Teste"]) anota(await checkin(pin(ANA), svF, eq.maternal, [visitante(nome, 4)], trouxeLivre("Tia Corrida A1")));
  await adiantarRelogio(svF);
  const GESTAO = { tipo: "LIDER", membroId: SEC, permissoes: ["habilitacao_voluntarios"], escopo: CENTRAL, nivel: "CONGREGACAO" };
  const rs = await disparar(Array.from({ length: 4 }, () => ({ handler: "checkin", acao: "encerrar-sala", token: GESTAO, corpo: { servicoId: svF, equipeId: eq.maternal, motivo: MOTIVO } })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.every((x) => x.status === 200), "4 encerramentos ao mesmo tempo: todos 200, nenhuma 500", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo = 'BAIXA_ADMINISTRATIVA'", { s: svF })) === 3 && (await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo = 'SALA_ENCERRADA'", { s: svF })) === 1
    && (await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE ServicoId = @s AND RetiradoTipo = 'BAIXA_ADM'", { s: svF })) === 3, "no banco: 3 baixas, UM encerramento (a trava da sala serializa)");
  // o culto de ontem: a sala continua na lista da liderança até ser encerrada, e a rotina diária manda para lá
  const svG = await H.servico(c1, { minutos: -1440 }); await H.alocar(svG, eq.maternal, [ANA]);
  const rOntem = await inserirRegistro(svG, eq.maternal, "Visitante De Ontem Teste");
  r = await ckGet("minhas-salas", sec()); const salaOntem = (r.body.salas || []).find((x) => x.servicoId === svG);
  ok(salaOntem && salaOntem.diaAnterior === true && salaOntem.criancasNaSala === 1 && salaOntem.ehGestao === true, "a sala de ONTEM com criança sem retirada continua na lista da liderança (diaAnterior), para ela poder encerrar", salaOntem);
  r = await ckGet("minhas-salas", pin(ANA)); ok(!(r.body.salas || []).some((x) => x.servicoId === svG), "e não aparece para o voluntário (a sala de um dia que passou é da liderança)", r.body.salas && r.body.salas.length);
  r = await rotinaDiaria(); ok(r.status === 200, "a rotina diária roda", [r.status, r.body && r.body.detectoresComFalha]);
  const avSem = (await notif("CHECKIN_SEM_RETIRADA")).filter((a) => a.r === ckRegra.referenciaDeSemRetirada(svG, eq.maternal));
  ok(avSem.length >= 2 && avSem.every((a) => /Encerrar a sala/.test(a.m) && !/Visitante|Ontem/.test(a.m)), "o aviso da manhã seguinte manda a liderança regularizar pelo botão 'Encerrar a sala' (e nunca leva nome de criança)", avSem.map((a) => a.m).slice(0, 1));
  r = await encerrar(sec(), svG); ok(r.status === 200 && r.body.baixadas === 1 && (await doBanco(rOntem)).RetiradoTipo === "BAIXA_ADM", "a liderança encerra a sala de ontem: 1 baixa", r.body);
  r = await ckGet("minhas-salas", sec()); ok(!(r.body.salas || []).some((x) => x.servicoId === svG), "e a sala some da lista");
  await limpar();

  // ====================================================================================================================================================
  console.log("== A2: o que o responsável autorizou deixa de valer quando ele deixa de ser responsável ==");
  const nova = (id, nome) => H.crianca({ id, nome, idade: 4, cong: c1, resp: [[P.alice, "MAE"], [P.bernardo, "PAI"]] });
  await nova(7301, "Kaue Dependente E2E");
  r = await ckPost("autorizado-adicionar", pin(P.alice), { menorId: 7301, nome: "Tio Autorizado Pela Alice", parentesco: "TIO" }); const autA = r.body.autorizadoId; ok(r.status === 201 && !!autA, "a mãe Alice autoriza o tio a retirar o Kaue (201)", r.body);
  const svH = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  r = anota(await checkin(pin(ANA), svH, eq.maternal, [{ menorId: 7301 }], { responsavelId: P.bernardo })); const rK = registrosDe(r)[0], cK = codigosDe(r)[0];
  ok((await refsDe(pin(ANA), svH, rK)).some((x) => x.ref === `AUT:${autA}`), "(controle) o Kaue entra pelo pai Bernardo e o tio está na lista de quem pode retirar");
  const respAlice = await escalar("SELECT ResponsavelId FROM VoluntariadoResponsaveis WHERE MenorMembroId = 7301 AND ResponsavelMembroId = @r AND RevogadoEm IS NULL", { r: P.alice });
  r = await volPost("responsavel-revogar", sec(), { responsavelId: respAlice }); ok(r.status === 200 && /1 autorização\(ões\) de retirada/.test(msg(r)), "a Secretaria revoga a Alice como responsável do Kaue: a resposta já diz que 1 autorização dela deixou de valer", r.body);
  ok((await refsDe(pin(ANA), svH, rK)).every((x) => x.ref !== `AUT:${autA}`) && (await refsDe(pin(ANA), svH, rK)).some((x) => x.ref === `RESP:${P.bernardo}`), "o tio sai da lista de quem pode retirar (o pai continua)");
  r = await R(pin(ANA), rK, cK, { ref: `AUT:${autA}` }); b = await doBanco(rK);
  ok(r.status === 422 && /não está na lista/.test(msg(r)) && b.Situacao === "NA_SALA" && b.Tentativas === 0, "retirar o Kaue como o tio, com o código certo: RECUSADO (não está na lista) e nenhuma tentativa gasta", [r.status, msg(r), b.Situacao]);
  const linhaA = await um("SELECT RevogadoEm, RevogadoPorMembroId FROM CheckinInfantilAutorizados WHERE AutorizadoId = @a", { a: autA });
  ok(linhaA.RevogadoEm !== null && linhaA.RevogadoPorMembroId === SEC, "a linha do tio foi revogada de vez (por quem revogou a mãe): não ressuscita se a Alice for cadastrada de novo", linhaA);
  const avDep = await notif("CHECKIN_AUTORIZADOS_DEPENDENTES"); const destDep = avDep.map((a) => a.d);
  ok(destDep.includes(SEC) && destDep.includes(1001) && !destDep.includes(C.secretaria.vila) && avDep.every((a) => /deixaram de valer/.test(a.m) && !/Kaue|Dependente|Tio/.test(a.m)), "a liderança da Central e a Diretoria foram avisadas (sem nome de criança)", [destDep, avDep[0] && avDep[0].m]);
  r = await ckGet("autorizados", pin(P.bernardo), { menorId: 7301 }); ok(r.status === 200 && !r.body.autorizados.some((x) => x.autorizadoId === autA), "o pai não vê mais o tio na lista (nem ele ocupa uma das 8 vagas)", r.body.autorizados);
  // o filtro de leitura sozinho (a revogação do responsável por fora do ato, direto no banco)
  await nova(7302, "Lia Dependente Banco E2E");
  r = await ckPost("autorizado-adicionar", pin(P.alice), { menorId: 7302, nome: "Tia Autorizada Pela Alice", parentesco: "TIO" }); const autB = r.body.autorizadoId;
  await q("UPDATE VoluntariadoResponsaveis SET RevogadoEm = SYSUTCDATETIME(), RevogadoPorMembroId = @p WHERE MenorMembroId = 7302 AND ResponsavelMembroId = @r AND RevogadoEm IS NULL", { p: SEC, r: P.alice });
  r = anota(await checkin(pin(ANA), svH, eq.maternal, [{ menorId: 7302 }], { responsavelId: P.bernardo })); const rL = registrosDe(r)[0], cL = codigosDe(r)[0];
  r = await R(pin(ANA), rL, cL, { ref: `AUT:${autB}` });
  ok(r.status === 422 && /não está na lista/.test(msg(r)) && (await escalar("SELECT RevogadoEm FROM CheckinInfantilAutorizados WHERE AutorizadoId = @a", { a: autB })) === null, "revogado por fora do ato, o filtro de LEITURA sozinho já barra a retirada (a linha nem foi tocada)", [r.status, msg(r)]);
  r = await ckGet("autorizados", pin(P.bernardo), { menorId: 7302 }); ok(!r.body.autorizados.some((x) => x.autorizadoId === autB), "e a lista de autorizados também a esconde");
  // a ficha assinada (Secretaria) não depende de ninguém
  await nova(7303, "Nina Ficha E2E");
  r = await ckPost("autorizado-adicionar", sec(), { menorId: 7303, nome: "Avó Da Ficha Teste", parentesco: "AVO", ficha: true, referencia: "Pasta 12, ficha 3" }); const autF = r.body.autorizadoId; ok(r.status === 201, "a Secretaria registra a avó pela ficha assinada", r.body);
  r = await ckPost("autorizado-adicionar", pin(P.alice), { menorId: 7303, nome: "Tia Da Alice Teste", parentesco: "TIO" }); const autG = r.body.autorizadoId;
  r = await volPost("responsavel-revogar", sec(), { responsavelId: await escalar("SELECT ResponsavelId FROM VoluntariadoResponsaveis WHERE MenorMembroId = 7303 AND ResponsavelMembroId = @r AND RevogadoEm IS NULL", { r: P.alice }) }); ok(r.status === 200, "a Secretaria revoga a Alice como responsável da Nina", r.body);
  r = await ckGet("autorizados", sec(), { menorId: 7303 }); ok(r.status === 200 && r.body.autorizados.some((x) => x.autorizadoId === autF) && !r.body.autorizados.some((x) => x.autorizadoId === autG), "a avó da FICHA continua valendo; a tia que a Alice autorizou, não", r.body.autorizados);
  await limpar();

  // ====================================================================================================================================================
  console.log("== B4: o portão da EBD não é burlado por número fracionário ==");
  const EBDT = require(path.join(API, "GestaoEbdTurmas/index.js"));
  const ebdCentral = () => LIDER(SEC, ["ebd_gestao"], CENTRAL);
  const ebd = (acao, metodo, token, corpo, query) => H.chamarH(EBDT, { acao, metodo, token, corpo, query });
  r = await ebd("turmas", "POST", ebdCentral(), { congregacaoId: c1, nome: "Turma B4 Revisao E2E" }); ok(r.status === 201, "a EBD cria a turma", r.body);
  const turmaB4 = await escalar("SELECT TurmaId FROM EbdTurmas WHERE Nome = N'Turma B4 Revisao E2E'");
  r = await ebd("turmas/menores", "POST", ebdCentral(), { turmaId: turmaB4, contatoComMenores: true }); ok(r.status === 200 && r.body.mudou === true, "marca a turma como 'com menores'", r.body);
  const designados = () => escalar("SELECT COUNT(*) FROM EbdTurmaProfessores WHERE TurmaId = @t", { t: turmaB4 });
  for (const membroId of [6013.9, "6013.9", "6013.0", "06013", 6013.0000001, [6013], true]) {
    r = await ebd("professores", "POST", ebdCentral(), { turmaId: turmaB4, membroId }); ok(r.status === 400, `designar professor com membroId ${JSON.stringify(membroId)}: 400 (identificador inválido)`, [r.status, r.body]);
  }
  r = await ebd("professores", "POST", ebdCentral(), { turmaId: `${turmaB4}.5`, membroId: ANA }); ok(r.status === 400, "turmaId fracionário: 400", [r.status, r.body]);
  r = await ebd("professores/encerrar", "POST", ebdCentral(), { turmaId: turmaB4, membroId: 6013.9 }); ok(r.status === 400, "encerrar professor com membroId fracionário: 400", [r.status, r.body]);
  ok((await designados()) === 0, "o professor inapto (6013, certidão vencida) NÃO foi designado por nenhuma dessas tentativas");
  const ebdMod = require(path.join(API, "shared/ebdTurmas.js")); const mmDb = require(path.join(API, "shared/ministerioMenoresDb.js"));
  const direta = await ebdMod.designarProfessor(pool, { turmaId: turmaB4, membroId: 6013.9, principal: false, designadoPorMembroId: SEC });
  ok(direta.sucesso === false && (await designados()) === 0, "a função designarProfessor também recusa o identificador fracionário (não só a rota)", direta);
  const portao = await mmDb.aptosParaTurma(pool, { turmaId: turmaB4, membroIds: [6013.9] });
  ok(portao.contatoComMenores === true && portao.aptos.size === 0 && portao.bloqueados.size === 1, "o portão: uma lista que perdeu elementos é RECUSA, não 'turma sem marca'", { aptos: [...portao.aptos], bloqueados: [...portao.bloqueados] });
  r = await ebd("professores", "POST", ebdCentral(), { turmaId: turmaB4, membroId: 6013 }); ok(r.status === 422, "(controle) o mesmo professor com o identificador certo: 422 (inapto)", r.body);
  r = await ebd("professores", "POST", ebdCentral(), { turmaId: turmaB4, membroId: ANA }); ok(r.status === 201, "(controle) um apto com o identificador certo: 201", r.body);

  // ====================================================================================================================================================
  console.log("== B5 e B6: o voluntário não vê a aptidão dos colegas e o relatório é só da gestão ==");
  const svJ = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  await derrubarAptidao(BRUNO);
  r = await ckGet("sala", pin(ANA), sala(svJ));
  ok(r.status === 200 && r.body.adultosPresentes.length === 3 && r.body.adultosPresentes.every((x) => !("apto" in x) && typeof x.contaComoAdulto === "boolean" && x.membroId && x.nome), "o voluntário recebe os adultos presentes SEM o campo 'apto' (só 'contaComoAdulto')", r.body.adultosPresentes);
  ok(r.body.adultosPresentes.find((x) => x.membroId === BRUNO).contaComoAdulto === false && r.body.adultosPresentes.find((x) => x.membroId === CARLA).contaComoAdulto === true && r.body.lotacao.adultos === 2, "e 'contaComoAdulto' segue valendo para a lotação (Bruno inapto não conta)");
  ok(!/"apto"|INCIDENTE|PENDENCIA_|bloqueios?"/i.test(JSON.stringify(r.body)), "nem em outro lugar da resposta aparece aptidão ou bloqueio");
  r = await ckGet("sala", sec(), sala(svJ)); ok(r.status === 200 && r.body.adultosPresentes.find((x) => x.membroId === BRUNO).apto === false, "a liderança continua vendo 'apto' (como na tela de habilitação)", r.body.adultosPresentes);
  await restaurarAptidao(BRUNO);
  r = await ckGet("relatorio", pin(ANA), sala(svJ)); ok(r.status === 403 && !("criancas" in (r.body || {})), "o voluntário da sala NÃO lê o relatório do dia: 403, sem dado", r.body);
  r = await ckGet("relatorio", sec(), sala(svJ)); ok(r.status === 200 && Array.isArray(r.body.criancas), "a liderança da congregação lê (200)");
  r = await ckGet("relatorio", secVila(), sala(svJ)); ok(r.status === 404, "e a de outra congregação não (404, a mesma de 'não existe')", r.status);
  await limpar();

  // ====================================================================================================================================================
  console.log("== B7 e C19: a retenção apaga também os textos livres, o nome da segunda via e os autorizados; os gatilhos seguram ==");
  const svR = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  const novoV = async (nome) => { const x = anota(await checkin(pin(ANA), svR, eq.maternal, [visitante(nome, 4)], trouxeLivre("Tia Retencao22 Teste"))); if (x.status !== 201) throw new Error(`${nome}: ${JSON.stringify(x.body)}`); return { reg: registrosDe(x)[0], cod: codigosDe(x)[0] }; };
  const V1 = await novoV("Visitante Retencao Um Teste"), V2 = await novoV("Visitante Retencao Dois Teste"), V3 = await novoV("Visitante Retencao Tres Teste"), V4 = await novoV("Visitante Retencao Quatro Teste");
  r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: V1.reg, pessoa: { ref: "TROUXE" }, documento: "RG" }); ok(r.status === 201, "(segunda via do V1: pedida pela Ana)", r.body);
  r = anota(await ckPost("segunda-via-confirmar", pin(BRUNO), { registroId: V1.reg })); ok(r.status === 200, "(e confirmada pelo Bruno)", r.body); V1.cod = r.body.etiqueta.codigo;
  ok((await escalar("SELECT PessoaNome FROM CheckinInfantilSegundasVias WHERE RegistroId = @r", { r: V1.reg })) === "Tia Retencao22 Teste", "(o nome de quem pediu a segunda via está gravado)");
  r = await R(pin(ANA), V1.reg, V1.cod, { outro: { nome: "Estranho Retencao Teste", parentesco: "OUTRO", documento: "RG", motivo: "Disse que o pai mandou buscar." } }); ok(r.status === 200 && r.body.divergente, "(retirada divergente do V1 com o motivo do voluntário)", r.body);
  r = await ckPost("decidir-divergencia", sec(), { registroId: V1.reg, aprovar: true, motivo: "Confirmei com o pai pelo telefone cadastrado." }); ok(r.status === 200, "(aprovada pela Secretaria)", r.body);
  b = await doBanco(V1.reg); ok(b.DivergenciaMotivo === "Confirmei com o pai pelo telefone cadastrado." && b.DivergenciaPedidoMotivo === "Disse que o pai mandou buscar.", "(os dois textos livres estão gravados, cada um no seu campo)", b);
  r = await R(pin(ANA), V3.reg, V3.cod, { ref: "TROUXE" }); ok(r.status === 200, "(V3 retirado normalmente: controle de que o registro comum também é anonimizado)", r.body);
  r = await R(pin(ANA), V4.reg, V4.cod, { ref: "TROUXE" }); ok(r.status === 200, "(V4 retirado e NÃO envelhecido: serve para os gatilhos)", r.body);
  await adiantarRelogio(svR);
  r = await encerrar(sec(), svR); ok(r.status === 200 && r.body.baixadas === 1, "(o V2, que ficou na sala, recebe a baixa administrativa)", r.body);
  // autorizados: revogado há mais de 5 anos, vencido há mais de 5 anos, ficha revogada, ainda ativo e revogado há pouco
  await nova(7304, "Mia Retencao E2E");
  const aut = async (corpo, token = pin(P.alice)) => { const x = await ckPost("autorizado-adicionar", token, { menorId: 7304, parentesco: "AVO", ...corpo }); if (x.status !== 201) throw new Error(JSON.stringify(x.body)); return x.body.autorizadoId; };
  const aRev = await aut({ nome: "Avo Revogada Antiga Teste", membroId: P.dina }), aVenc = await aut({ nome: "Avo Vencida Antiga Teste", validoAte: "2099-01-01" }), aFicha = await aut({ nome: "Avo Da Ficha Antiga Teste", ficha: true, referencia: "Pasta 5, ficha 9" }, sec());
  const aAtiva = await aut({ nome: "Avo Ativa Controle Teste" }), aRecente = await aut({ nome: "Avo Revogada Recente Teste" });
  for (const id of [aRev, aFicha, aRecente]) { r = await ckPost("autorizado-revogar", pin(P.alice), { autorizadoId: id }); ok(r.status === 200, `(autorizado ${id} revogado)`, r.body); }
  await q("UPDATE CheckinInfantilAutorizados SET RevogadoEm = DATEADD(DAY, -2000, RevogadoEm) WHERE AutorizadoId IN (@a, @b)", { a: aRev, b: aFicha });
  await q("UPDATE CheckinInfantilAutorizados SET RevogadoEm = DATEADD(DAY, -100, RevogadoEm) WHERE AutorizadoId = @a", { a: aRecente });
  await q("UPDATE CheckinInfantilAutorizados SET ValidoAte = DATEADD(DAY, -2000, CAST(SYSUTCDATETIME() AS DATE)) WHERE AutorizadoId = @a", { a: aVenc });
  await envelhecer([V1.reg, V2.reg, V3.reg], 2000);
  r = await rotinaDiaria(); const ret = r.body && r.body.retencaoCheckin;
  ok(r.status === 200 && ret && ret.anonimizados >= 3 && ret.segundasViasAnonimizadas >= 1 && ret.autorizadosAnonimizados === 3, "a rotina diária anonimiza 3 registros, a segunda via e 3 autorizados (e o resumo diz)", ret);
  for (const [rotulo, reg] of [["retirado com divergência aprovada (V1)", V1.reg], ["com baixa administrativa (V2)", V2.reg], ["retirado normalmente (V3)", V3.reg]]) {
    b = await doBanco(reg);
    ok(b.AnonimizadoEm !== null && b.VisitanteNome === "(anonimizado)" && b.TrouxeNome === null && b.RetiradoNome === null && b.DivergenciaMotivo === null && b.DivergenciaPedidoMotivo === null && b.BaixaMotivo === null, `registro ${rotulo}: anonimizado, e SEM os textos livres (motivo da decisão, do pedido e da baixa)`, b);
  }
  b = await doBanco(V2.reg); ok(b.RetiradoTipo === "BAIXA_ADM" && b.RetiradoPorOperadorId === SEC && b.RetiradoEm !== null, "a baixa administrativa anonimizada guarda o que prova (tipo, quem deu a baixa e quando)", b);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilSegundasVias WHERE RegistroId = @r AND PessoaNome IS NULL AND PessoaMembroId IS NULL AND Documento IS NOT NULL", { r: V1.reg })) === 1, "o nome de quem pediu a segunda via saiu (o tipo de documento conferido fica)");
  const autRows = await q("SELECT AutorizadoId, Nome, AutorizadoMembroId, Referencia FROM CheckinInfantilAutorizados WHERE MenorMembroId = 7304");
  const del = (id) => autRows.find((x) => x.AutorizadoId === id);
  ok([aRev, aVenc, aFicha].every((id) => del(id).Nome === "(anonimizado)" && del(id).AutorizadoMembroId === null) && del(aRev).Referencia === null && del(aFicha).Referencia === "(anonimizado)",
    "autorizado revogado há mais de 5 anos, vencido há mais de 5 anos e ficha revogada: sem nome nem matrícula (a ficha fica com o texto neutro, que a coluna obrigatória exige)", autRows);
  ok(del(aAtiva).Nome === "Avo Ativa Controle Teste" && del(aRecente).Nome === "Avo Revogada Recente Teste", "o ainda ativo e o revogado há 100 dias seguem inteiros");
  r = await rotinaDiaria(); ok(r.body.retencaoCheckin.anonimizados === 0 && r.body.retencaoCheckin.autorizadosAnonimizados === 0 && r.body.retencaoCheckin.segundasViasAnonimizadas === 0, "rodar de novo não anonimiza nada outra vez (idempotente)", r.body.retencaoCheckin);
  // gatilhos (C19)
  await protegido("depois de anonimizado o nome de quem trouxe não volta a ter conteúdo", "UPDATE CheckinInfantilRegistros SET TrouxeNome = N'Nome Reescrito Depois' WHERE RegistroId = @r", { r: V1.reg });
  await protegido("nem o nome da criança visitante", "UPDATE CheckinInfantilRegistros SET VisitanteNome = N'Nome Reescrito Depois' WHERE RegistroId = @r", { r: V1.reg });
  await protegido("nem o texto livre do motivo", "UPDATE CheckinInfantilRegistros SET DivergenciaMotivo = N'Texto novo' WHERE RegistroId = @r", { r: V1.reg });
  await protegido("carimbar 'anonimizado' REESCREVENDO o nome para outro texto é proibido (o carimbo só vale se o nome sai de verdade)", "UPDATE CheckinInfantilRegistros SET AnonimizadoEm = SYSUTCDATETIME(), TrouxeNome = N'Nome Reescrito', VisitanteNome = N'(anonimizado)', VisitanteNascimento = NULL WHERE RegistroId = @r", { r: V4.reg });
  await protegido("carimbar 'anonimizado' deixando o nome da criança visitante como está também", "UPDATE CheckinInfantilRegistros SET AnonimizadoEm = SYSUTCDATETIME(), TrouxeNome = NULL, TrouxeContato = NULL, VisitanteNascimento = NULL WHERE RegistroId = @r", { r: V4.reg });
  const svW = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  r = await checkin(pin(ANA), svW, eq.maternal, [visitante("Visitante Visita Gatilho Teste", 4)], trouxeLivre("Tia Gatilho Teste"), { autorizadosVisita: [{ nome: "Indicada Do Gatilho", parentesco: "AVO" }] }); anota(r);
  const idVis = await escalar("SELECT AutorizadoVisitaId FROM CheckinInfantilAutorizadosVisita WHERE Nome = N'Indicada Do Gatilho'");
  ok(!!idVis, "(há um indicado só desta visita)", r.body);
  await protegido("o nome de um indicado só desta visita não se reescreve", "UPDATE CheckinInfantilAutorizadosVisita SET Nome = N'Outra Pessoa' WHERE AutorizadoVisitaId = @a", { a: idVis });
  await protegido("nem o parentesco", "UPDATE CheckinInfantilAutorizadosVisita SET Parentesco = N'TIO' WHERE AutorizadoVisitaId = @a", { a: idVis });
  await protegido("nem se apaga", "DELETE FROM CheckinInfantilAutorizadosVisita WHERE AutorizadoVisitaId = @a", { a: idVis });
  ok((await falha("UPDATE CheckinInfantilAutorizadosVisita SET Nome = NULL WHERE AutorizadoVisitaId = @a", { a: idVis })) === null, "só a anonimização (nome nulo) é aceita");
  await limpar();

  // ====================================================================================================================================================
  console.log("== B9: o aviso obrigatório não falha em silêncio, e nenhum erro de aviso vem depois do ato gravado ==");
  const svK = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  const visK = async (nome) => { const x = anota(await checkin(pin(ANA), svK, eq.maternal, [visitante(nome, 4)], trouxeLivre("Tia Aviso Teste"))); return { reg: registrosDe(x)[0], cod: codigosDe(x)[0] }; };
  const OUTRO = { outro: { nome: "Estranho Do Aviso Teste", parentesco: "OUTRO", documento: "RG" } };
  let k = await visK("Visitante Aviso Um Teste");
  await q("UPDATE NotificacaoRegras SET Ativa = 0 WHERE Chave = 'CHECKIN_RETIRADA_DIVERGENTE'");
  r = await R(pin(ANA), k.reg, k.cod, OUTRO);
  ok(r.status === 200 && r.body.divergente === true && r.body.semAviso === true && r.body.avisados === 0 && /NÃO foi avisada/.test(msg(r)) && (await doBanco(k.reg)).Situacao === "RETIRADA_PENDENTE", "regra de aviso inativa: o pedido fica registrado, e a resposta diz CLARAMENTE que a liderança NÃO foi avisada (ligue para ela)", r.body);
  await q("UPDATE NotificacaoRegras SET Ativa = 1 WHERE Chave = 'CHECKIN_RETIRADA_DIVERGENTE'");
  k = await visK("Visitante Aviso Dois Teste");
  r = await R(pin(ANA), k.reg, k.cod, OUTRO); ok(r.status === 200 && r.body.semAviso === false && r.body.avisados >= 2 && /enviado à liderança/.test(msg(r)), "(controle) com a regra ativa o aviso sai e a resposta diz que foi enviado à liderança", r.body);
  // a lista de quem avisar falha (a tabela da liderança some por um instante): nada pode virar 500 depois do ato
  k = await visK("Visitante Aviso Tres Teste");
  await q("EXEC sp_rename N'dbo.Lideranca', N'Lideranca_Fora'");
  try {
    r = await R(pin(ANA), k.reg, k.cod, OUTRO);
    const pendente = (await doBanco(k.reg)).Situacao;
    ok(r.status === 200 && r.body.divergente === true && r.body.semAviso === true && pendente === "RETIRADA_PENDENTE", "a lista de quem avisar FALHA: o pedido vale, a resposta é 200 e diz que ninguém foi avisado (antes: 500 depois do ato, e na nova tentativa 'já há um pedido' sem aviso nenhum)", [r.status, msg(r), pendente]);
    const k2 = await visK("Visitante Aviso Quatro Teste");
    r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: k2.reg, pessoa: { ref: "TROUXE" }, documento: "RG" }); ok(r.status === 201, "(segunda via pedida)", r.body);
    r = anota(await ckPost("segunda-via-confirmar", pin(BRUNO), { registroId: k2.reg }));
    ok(r.status === 200 && /^[A-HJKMNP-Z2-9]{6}$/.test((r.body.etiqueta || {}).codigo || "") && r.body.semAviso === true, "segunda via com a lista de aviso falhando: 200 e o CÓDIGO NOVO chega (antes: 500 depois do commit e o código se perdia)", [r.status, r.body && r.body.mensagem]);
  } finally { await q("EXEC sp_rename N'dbo.Lideranca_Fora', N'Lideranca'"); }
  ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = N'Lideranca'")) === 1, "(a tabela da liderança voltou ao lugar)");
  await q("UPDATE NotificacaoRegras SET Ativa = 0 WHERE Chave = 'CHECKIN_SEGUNDA_VIA'");
  const k3 = await visK("Visitante Aviso Cinco Teste");
  r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: k3.reg, pessoa: { ref: "TROUXE" }, documento: "RG" });
  r = anota(await ckPost("segunda-via-confirmar", pin(BRUNO), { registroId: k3.reg }));
  ok(r.status === 200 && r.body.etiqueta && r.body.etiqueta.codigo, "(visitante: não há responsável cadastrado a avisar, e a segunda via sai normalmente)", r.body);
  await q("UPDATE NotificacaoRegras SET Ativa = 1 WHERE Chave = 'CHECKIN_SEGUNDA_VIA'");
  const kb = anota(await checkin(pin(ANA), svK, eq.maternal, [{ menorId: K.enzo }], { responsavelId: P.claudia })); const rEnzoK = registrosDe(kb)[0];
  await q("UPDATE NotificacaoRegras SET Ativa = 0 WHERE Chave = 'CHECKIN_SEGUNDA_VIA'");
  r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: rEnzoK, pessoa: { ref: `RESP:${P.claudia}` }, documento: "RG" });
  r = anota(await ckPost("segunda-via-confirmar", pin(BRUNO), { registroId: rEnzoK }));
  ok(r.status === 200 && r.body.etiqueta.codigo && r.body.semAviso === true && /não conseguiu avisar o responsável/.test(msg(r)), "criança membro com o aviso à mãe impossível (regra inativa): o código novo sai e a resposta avisa o voluntário que a mãe NÃO foi avisada", r.body);
  await q("UPDATE NotificacaoRegras SET Ativa = 1 WHERE Chave = 'CHECKIN_SEGUNDA_VIA'");
  await limpar();

  // ====================================================================================================================================================
  console.log("== B10 e C24: a segunda via mostra de quem é o pedido e o documento; o pedido divergente leva o motivo ==");
  const svM = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  r = anota(await checkin(pin(ANA), svM, eq.maternal, [{ menorId: K.bia }, { menorId: K.caio }], mae)); const [rBiaM, rCaioM] = registrosDe(r); const [cBiaM, cCaioM] = codigosDe(r);
  r = await ckPost("autorizado-adicionar", pin(P.alice), { menorId: K.caio, nome: "Nome Digitado Que Nao E Da Dina", parentesco: "AVO", membroId: P.dina }); const autDina = r.body.autorizadoId; ok(r.status === 201, "a Alice autoriza a Dina (que tem matrícula) digitando OUTRO nome (201)", r.body);
  ok((await escalar("SELECT Nome FROM CheckinInfantilAutorizados WHERE AutorizadoId = @a", { a: autDina })) === "Dina Avo E2E", "C15: o nome gravado é o do CADASTRO (Dina Avo E2E), não o digitado");
  r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: rBiaM, pessoa: { ref: `RESP:${P.alice}` }, documento: "CNH" }); ok(r.status === 201, "a Ana pede a segunda via da Bia para a mãe Alice, conferindo a CNH", r.body);
  r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: rCaioM, pessoa: { ref: `AUT:${autDina}` }, documento: "RG" }); ok(r.status === 201, "e a do Caio para a avó Dina", r.body);
  let sl = await salaDe(pin(BRUNO), svM); const viaBia = sl.criancas.find((c) => c.registroId === rBiaM).segundaViaPendente, viaCaio = sl.criancas.find((c) => c.registroId === rCaioM).segundaViaPendente;
  ok(viaBia && viaBia.pessoaNome === "Alice Mae E2E" && viaBia.documento === "CNH" && viaBia.pedidaPorMembroId === ANA, "o Bruno (segundo adulto) vê DE QUEM é o pedido (a mãe cadastrada) e o documento conferido", viaBia);
  ok(viaCaio && viaCaio.pessoaNome === "Dina Avo E2E" && viaCaio.documento === "RG", "também para a avó autorizada (que é membro): o nome vem do cadastro", viaCaio);
  r = anota(await ckPost("segunda-via-confirmar", pin(BRUNO), { registroId: rBiaM }));
  ok(r.status === 200 && new Date(r.body.etiqueta.instante).getTime() === (await um("SELECT EntregueEm FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: rBiaM })).EntregueEm.getTime() && !!r.body.etiqueta.segundaViaEm && r.body.etiqueta.segundaViaEm !== r.body.etiqueta.instante,
    "a etiqueta da segunda via traz a hora de ENTRADA original ('instante') e, à parte, a hora da reemissão ('segundaViaEm')", r.body.etiqueta);
  // C24: o motivo do pedido divergente
  const svN = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  const vN = anota(await checkin(pin(ANA), svN, eq.maternal, [visitante("Visitante Motivo Teste", 4)], trouxeLivre("Tia Motivo Teste"))); const rN = registrosDe(vN)[0], cN = codigosDe(vN)[0];
  r = await R(pin(ANA), rN, cN, { outro: { nome: "Estranho Motivo Teste", parentesco: "OUTRO", documento: "RG", motivo: "Rubrica <b>falsa</b>" } }); b = await doBanco(rN);
  ok(r.status === 422 && b.Tentativas === 0 && b.Situacao === "NA_SALA", "motivo com marcação: 422 e NENHUMA tentativa gasta", [r.status, msg(r), b.Tentativas]);
  r = await R(pin(ANA), rN, cN, { outro: { nome: "Estranho Motivo Teste", parentesco: "OUTRO", documento: "RG", motivo: "m".repeat(301) } }); ok(r.status === 422, "motivo de 301 caracteres: 422", r.body);
  r = await R(pin(ANA), rN, cN, { outro: { nome: "Estranho Motivo Teste", parentesco: "OUTRO", documento: "RG", motivo: "Disse que é o tio da criança e que a mãe está no carro." } });
  ok(r.status === 200 && r.body.divergente === true && (await doBanco(rN)).DivergenciaPedidoMotivo === "Disse que é o tio da criança e que a mãe está no carro.", "o pedido divergente aceita o motivo opcional e o grava", r.body);
  sl = await salaDe(sec(), svN); const cardN = sl.criancas.find((c) => c.registroId === rN);
  ok(cardN.divergencia && cardN.divergencia.motivo === "Disse que é o tio da criança e que a mãe está no carro.", "o cartão do gestor traz o motivo", cardN.divergencia);
  sl = await salaDe(pin(BRUNO), svN); ok(!("motivo" in sl.criancas.find((c) => c.registroId === rN).divergencia), "e o do voluntário não");
  r = await ckPost("decidir-divergencia", sec(), { registroId: rN, aprovar: false, motivo: "Não consegui falar com a mãe." }); b = await doBanco(rN);
  ok(r.status === 200 && b.DivergenciaMotivo === "Não consegui falar com a mãe." && b.DivergenciaPedidoMotivo === null && b.Situacao === "NA_SALA", "negar: a criança volta, o motivo do pedido sai junto com quem pediu e o da decisão fica", b);
  await limpar();

  // ====================================================================================================================================================
  console.log("== B11: o cache de 15 segundos dos prazos (nenhum dado de custódia em cache) ==");
  ok(typeof H.db.limparCaches === "function", "o módulo do banco exporta limparCaches() (os roteiros que mudam prazo no banco precisam do efeito na hora)");
  const svC = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  const original = pool.request; let consultasDePrazo = 0;
  pool.request = (...a) => { const rq = original.apply(pool, a); const q0 = rq.query.bind(rq); rq.query = (t) => { if (/\bPrazos\b/i.test(String(t))) consultasDePrazo++; return q0(t); }; return rq; };
  try {
    limparCaches(); consultasDePrazo = 0; await H.db.lerPrazos(pool); const umaLeitura = consultasDePrazo;
    consultasDePrazo = 0; for (let i = 0; i < 10; i++) await H.db.lerPrazos(pool);
    ok(umaLeitura >= 4 && consultasDePrazo === 0, "dez leituras seguidas dos prazos do check-in fazem ZERO consultas (a primeira já as guardou, e fez as suas)", { umaLeitura, depois: consultasDePrazo });
    consultasDePrazo = 0; limparCaches(); await H.db.lerPrazos(pool); ok(consultasDePrazo === umaLeitura, "limparCaches() zera: a leitura seguinte volta ao banco", { consultasDePrazo, umaLeitura });
    limparCaches(); await ckGet("sala", pin(ANA), sala(svC));          // aquece o cache
    consultasDePrazo = 0; for (let i = 0; i < 10; i++) await ckGet("sala", pin(ANA), sala(svC)); const comCache = consultasDePrazo;
    consultasDePrazo = 0; for (let i = 0; i < 10; i++) { limparCaches(); await ckGet("sala", pin(ANA), sala(svC)); } const semCache = consultasDePrazo;
    ok(semCache - comCache >= 9 * 4, "dez chamadas da tela da sala com o cache fazem pelo menos 36 consultas de configuração a menos que sem ele (o polling de 8 s deixa de pesar no banco de 5 DTU)", { comCache, semCache });
  } finally { pool.request = original; }
  sl = await salaDe(pin(ANA), svC); ok(sl.criancas.length === 0 && sl.totais.entregues === 0, "(e o que NÃO fica em cache: a sala é lida do banco a cada chamada — uma criança entregue aparece na hora)");
  r = await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Cache Teste", 4)], trouxeLivre("Tia Cache")); anota(r);
  sl = await salaDe(pin(ANA), svC); ok(sl.criancas.length === 1 && sl.totais.entregues === 1, "uma criança entregue aparece na leitura seguinte (nenhum dado de custódia em cache)", sl.totais);
  await q("UPDATE Prazos SET Dias = 4 WHERE Sigla = 'CHECKIN_TENTATIVAS_CODIGO'");
  r = await ckGet("catalogos", pin(ANA)); ok(r.body.tentativas === 5, "o prazo mudou no banco mas o cache de 15 s ainda vale (continua 5)", r.body.tentativas);
  limparCaches(); r = await ckGet("catalogos", pin(ANA)); ok(r.body.tentativas === 4, "sem o cache, o prazo novo (4) vale", r.body.tentativas);
  await q("UPDATE Prazos SET Dias = 5 WHERE Sigla = 'CHECKIN_TENTATIVAS_CODIGO'"); limparCaches();
  await limpar();

  // ====================================================================================================================================================
  console.log("== B13: o responsável não vê o histórico de quem já fez 18 anos ==");
  await H.crianca({ id: 7306, nome: "Nina Dezoito E2E", idade: 17, cong: c1, resp: [[P.alice, "MAE"]] });
  const svO = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  r = anota(await checkin(pin(ANA), svO, eq.maternal, [{ menorId: 7306 }], mae)); const rNina = registrosDe(r)[0], cNina = codigosDe(r)[0];
  r = await R(pin(ANA), rNina, cNina, { ref: `RESP:${P.alice}` }); ok(r.status === 200, "(a Nina, de 17 anos, é entregue e retirada)", r.body);
  r = await ckGet("historico", pin(P.alice), { menorId: 7306 }); ok(r.status === 200 && r.body.historico.some((h) => h.registroId === rNina), "(controle) enquanto é menor, a mãe vê o histórico dela", r.body);
  await q("UPDATE MembroReferencia SET DataNascimento = DATEADD(DAY, -1, DATEADD(YEAR, -18, CAST(SYSUTCDATETIME() AS DATE))) WHERE MembroId = 7306");
  r = await ckGet("historico", pin(P.alice), { menorId: 7306 }); ok(r.status === 200 && r.body.historico.length === 0, "a Nina fez 18 anos: o histórico dela some (nem pedindo pelo menorId)", r.body.historico);
  r = await ckGet("historico", pin(P.alice)); ok(!r.body.historico.some((h) => h.menorId === 7306), "nem na lista geral dos filhos");
  await limpar();

  // ====================================================================================================================================================
  console.log("== C17, C23, C25 e C26: destravar no teto, recusas gravadas, sair da sala e acento ==");
  const svP = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  const vP = anota(await checkin(pin(ANA), svP, eq.maternal, [visitante("Visitante Teto Revisao Teste", 4)], trouxeLivre("Tia Teto Revisao"))); const rP = registrosDe(vP)[0], cP = codigosDe(vP)[0];
  await q("UPDATE CheckinInfantilRegistros SET Tentativas = 5 WHERE RegistroId = @r", { r: rP });     // a queda entre reservar a tentativa e gravar o travamento: no teto, mas Travado = 0
  sl = await salaDe(pin(ANA), svP); ok(sl.criancas.find((c) => c.registroId === rP).travado === true && sl.pendencias.travadas === 1, "C17: criança no teto de erros sem o travamento gravado aparece TRAVADA na tela", sl.criancas.find((c) => c.registroId === rP));
  r = await R(pin(ANA), rP, cP, { ref: "TROUXE" }); ok(r.status === 422 && r.body.travada === true, "e a retirada responde 'travada' (não 'o registro mudou')", [r.status, r.body]);
  r = await ckPost("destravar", sec(), { registroId: rP }); ok(r.status === 200, "a liderança destrava (antes: 'não está travada' e a criança ficava presa)", [r.status, msg(r)]);
  r = await R(pin(ANA), rP, cP, { ref: "TROUXE" }); ok(r.status === 200, "e o código certo retira", r.body);
  // C23: um evento de recusa por sala por minuto
  const svS = await H.servico(c1); await H.alocar(svS, eq.maternal, [ANA]); await ckPost("entrar-na-sala", pin(ANA), sala(svS));
  for (let i = 0; i < 5; i++) { r = await checkin(pin(ANA), svS, eq.maternal, [visitante(`Visitante Recusado ${"ABCDE"[i]}${i} Teste`, 4)], trouxeLivre()); ok(r.status === 422, `(recusa ${i + 1}: um adulto só)`, r.body); }
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo = 'SALA_RECUSOU_CHECKIN'", { s: svS })) === 1, "C23: 5 recusas seguidas gravam UM evento (o histórico imutável não enche)");
  // C25: tirado da escala depois de entrar, ainda sai
  const svT = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO]);
  const removida = await falha("DELETE FROM EscalasAlocacoes WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m", { s: svT, e: eq.maternal, m: ANA });
  ok(removida === null, "(a Ana é tirada da escala depois de entrar na sala)", removida);
  r = await ckPost("sair-da-sala", pin(ANA), sala(svT)); ok(r.status === 200, "C25: quem está presente na sala sai mesmo depois de tirado da escala (antes: 404 e a presença ficava aberta)", [r.status, msg(r)]);
  r = await ckPost("sair-da-sala", pin(OLGA), sala(svT)); ok(r.status === 404, "(quem nunca teve relação com a sala continua recebendo 404)", r.status);
  // C26: acento
  await H.crianca({ id: 7305, nome: "João Acentuado E2E", idade: 4, cong: c1, resp: [[P.alice, "MAE"]] });
  r = await ckGet("buscar", pin(BRUNO), { ...sala(svP), q: "joao acentuado" }); ok(r.status === 200 && r.body.criancas.some((c) => c.menorId === 7305), "C26: buscar 'joao acentuado' acha 'João Acentuado' (a busca ignora acento e caixa)", r.body);
  r = await ckGet("buscar", pin(BRUNO), { ...sala(svP), q: "JOÃO ACENTUADO" }); ok(r.status === 200 && r.body.criancas.some((c) => c.menorId === 7305), "e 'JOÃO ACENTUADO' também", r.body);
  const svU = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  r = anota(await checkin(pin(ANA), svU, eq.maternal, [{ visitante: { nome: "Joao Visitante Acento", nascimento: "2022-03-04" } }], trouxeLivre())); ok(r.status === 201, "(o visitante 'Joao Visitante Acento' entra)", r.body);
  r = await checkin(pin(ANA), svU, eq.maternal, [{ visitante: { nome: "João Visitante Acento", nascimento: "2022-03-04" } }], trouxeLivre()); ok(r.status === 422 && /já está numa sala/.test(msg(r)), "o MESMO visitante digitado com acento ('João') é reconhecido: 422 'já está numa sala'", [r.status, msg(r)]);
  await limpar();

  // ====================================================================================================================================================
  console.log("== o que as trilhas não podem dizer ==");
  const todoTexto = await H.textoDasTabelas();
  ok(CODIGOS.length > 10 && CODIGOS.every((c) => !todoTexto.includes(c)), `nenhum dos ${CODIGOS.length} códigos emitidos aparece em tabela, auditoria ou aviso`);
  ok(CODIGOS.every((c) => !LOGS.join("\n").includes(c)), "nem em log");
  const avsTodos = await q("SELECT Mensagem FROM Notificacoes WHERE RegraChave = 'CHECKIN_AUTORIZADOS_DEPENDENTES'");
  ok(avsTodos.every((a) => !/Kaue|Lia|Nina|Dependente/.test(a.Mensagem)), "os avisos sobre autorizações sem efeito nunca levam nome de criança");
  const evs = await q("SELECT Tipo, Detalhe FROM CheckinInfantilEventos WHERE Detalhe IS NOT NULL");
  const OK_DETALHE = /^(adultos=\d+;criancas=\d+|tentativa=\d+\/\d+|erros=\d+|geracao=\d+|retirado pela liderança|sala encerrada pela liderança|[A-Z_]+;adultos=\d+;criancas=\d+|RESPONSAVEL|AUTORIZADO|TROUXE|OUTRO|NA_SALA|RETIRADA_PENDENTE|baixadas=\d+;voluntarios=\d+)$/;
  ok(evs.every((e) => OK_DETALHE.test(e.Detalhe)), "o histórico de atos só carrega números e códigos curtos no detalhe (nunca o motivo, nome nem código)", evs.filter((e) => !OK_DETALHE.test(e.Detalhe)).slice(0, 3));
  const auds = await q("SELECT Acao, DadosDepois FROM AuditLog WHERE Acao LIKE 'CHECKIN%'");
  ok(auds.every((a) => !/esqueceram|Disse que|Confirmei|Estranho|Rubrica|Não consegui/.test(a.DadosDepois || "")), "e a auditoria nunca leva texto livre (motivo da baixa, do pedido nem da decisão)");
  ok(!/esqueceram|Disse que|Estranho Motivo/.test(JSON.stringify((await ckGet("historico", pin(P.alice))).body)), "o histórico do responsável nunca leva o motivo escrito pela liderança nem o do voluntário");

  fim("e2e-22-checkin-revisao");
})().catch((e) => { H.erroFatal("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
