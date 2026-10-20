// e2e-20-checkin-seguranca.js — v7.10: a bateria de segurança do check-in infantil (handlers REAIS, SQL Server real): quem pode chamar o quê (todas as rotas × todas as sessões), a mesma
// resposta para "não existe" e "não é seu" (enumeração de salas e de registros), o escopo da liderança, a aptidão reavaliada a cada ato, o código só em HMAC e nunca em resposta/log/aviso,
// o teto de tentativas, lixo em todo campo (nunca 500, nunca vazamento, recusa nunca grava), injeção e o que as trilhas (auditoria, avisos, logs) NÃO podem dizer.
// Parte da base "cenario-checkin" (e2e-18).
process.env.CRON_SECRET = "segredo-cron-so-do-teste-e2e";
const H = require("./lib-checkin");
const { L, q, um, escalar, hoje, cenario, pin, gestao, semFator, LOGS, ckGet, ckPost, consGet, consPost, visitante, trouxeLivre, checkin, codigosDe, registrosDe, codigoErradoDe,
  textoDasTabelas, limpar, derrubarAptidao, restaurarAptidao, falha, ckRegra, retratoCk, chamarH } = H;
const { ok, fim, obterPool, LIDER, LIXO } = L;
const C = cenario();
const { c1, c2, eq, pessoas: P, criancas: K } = C;
const CENTRAL = ["Central E2E"], VILA = ["Vila Nova E2E"];
const sec = () => gestao(C.secretaria.central, CENTRAL), secVila = () => gestao(C.secretaria.vila, VILA), secSemFator = () => semFator(C.secretaria.central, CENTRAL);
const ANA = 6010, BRUNO = 6011, CARLA = 6012, OLGA = 6024, MARIA = 6001, NILO = 6023, QUITERIA = 6026, RITA = 6003;
const msg = (r) => (r.body && r.body.mensagem) || "";
const sala = (sv, e = eq.maternal) => ({ servicoId: sv, equipeId: e });
const R = (token, registroId, codigo, retirante) => ckPost("retirar", token, { registroId, codigo, retirante });
const doBanco = (id) => um("SELECT Situacao, Tentativas, Travado, CodigoGeracao, CodigoHash, RetiradoTipo, Divergente FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: id });
const mae = { responsavelId: P.alice };
const NEGADO = [403, 404];

(async () => {
  const pool = await obterPool();
  let r, b;
  const CODIGOS = [];                                   // todo código emitido neste roteiro: nenhum pode aparecer em lugar nenhum além da resposta que o emitiu
  const anota = (x) => { for (const c of codigosDe(x)) CODIGOS.push(c); return x; };
  const RESPOSTAS = [];                                 // o texto de TODA resposta recebida (menos a do check-in e a da segunda via, que trazem o código)
  const envolver = (f) => async (...a) => { const x = await f(...a); RESPOSTAS.push(JSON.stringify(x.body)); return x; };
  const get = envolver(ckGet), post = envolver(ckPost);

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  // O cenário: a sala da Central (3 adultos) com uma criança em cada situação, e a sala da Vila (3 adultos) com uma criança da Vila
  const svC = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  const svV = await H.abrirSala(c2, eq.infantilVila, [NILO, QUITERIA]); await ckPost("entrar-na-sala", pin(RITA), sala(svV, eq.infantilVila));
  r = anota(await checkin(pin(ANA), svC, eq.maternal, [{ menorId: K.bia }, { menorId: K.caio }, { menorId: K.joana }], mae));
  const [rBia, rCaio, rJoana] = registrosDe(r); const [cBia, cCaio, cJoana] = codigosDe(r);
  r = anota(await checkin(pin(ANA), svC, eq.maternal, [{ menorId: K.duda }, { menorId: K.enzo }], { responsavelId: P.claudia })); const [rDuda, rEnzo] = registrosDe(r); const [cDuda, cEnzo] = codigosDe(r);
  ok(!!rBia && !!rCaio && !!rJoana && !!rDuda && !!rEnzo, "cenário: 5 crianças na sala da Central", r.body);
  r = anota(await checkin(pin(NILO), svV, eq.infantilVila, [{ menorId: K.heitorVila }], { responsavelId: P.irene })); const rVila = registrosDe(r)[0], cVila = codigosDe(r)[0]; ok(r.status === 201, "e uma na sala da Vila", r.body);
  // Enzo com uma retirada divergente pendente; Duda travada; Caio com uma segunda via aguardando
  r = await R(pin(ANA), rEnzo, cEnzo, { outro: { nome: "Estranho Do Cenario Teste", parentesco: "OUTRO", documento: "RG" } }); ok(r.status === 200 && r.body.divergente, "(Enzo com retirada divergente pendente)", r.body);
  for (let i = 0; i < 5; i++) await R(pin(ANA), rDuda, codigoErradoDe(cDuda), { ref: `RESP:${P.claudia}` }); ok((await doBanco(rDuda)).Travado === true, "(Duda travada)");
  r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: rCaio, pessoa: { ref: `RESP:${P.alice}` }, documento: "RG" }); ok(r.status === 201, "(Caio com pedido de segunda via aguardando)", r.body);

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  console.log("== quem pode chamar o quê: todas as rotas × todas as sessões ==");
  const SESSOES = {
    semSessao: undefined, tokenLixo: "isto.nao-e-um-token", voluntario: pin(CARLA), voluntarioDaVila: pin(NILO), mae: pin(P.alice), conhecido: pin(P.everton), secretariaPorPin: pin(C.secretaria.central),
    gestor: sec(), gestorDaVila: secVila(), gestorSemFator: secSemFator(), geral: H.geral(1001)
  };
  const ESPERADO_LEITURA = {                                                  // [GET, query, {sessão: status | "negado"}]
    catalogos: { semSessao: 401, tokenLixo: 401, voluntario: 200, voluntarioDaVila: 200, mae: 200, conhecido: 200, secretariaPorPin: 200, gestor: 200, gestorDaVila: 200, gestorSemFator: 200, geral: 200 },
    "minhas-salas": { semSessao: 401, tokenLixo: 401, voluntario: 200, voluntarioDaVila: 200, mae: 200, conhecido: 200, secretariaPorPin: 200, gestor: 200, gestorDaVila: 200, gestorSemFator: 200, geral: 200 },
    "meus-filhos": { semSessao: 401, tokenLixo: 401, voluntario: 200, voluntarioDaVila: 200, mae: 200, conhecido: 200, secretariaPorPin: 200, gestor: 200, gestorDaVila: 200, gestorSemFator: 200, geral: 200 },
    historico: { semSessao: 401, tokenLixo: 401, voluntario: 200, voluntarioDaVila: 200, mae: 200, conhecido: 200, secretariaPorPin: 200, gestor: 200, gestorDaVila: 200, gestorSemFator: 200, geral: 200 },
    sala: { semSessao: 401, tokenLixo: 401, voluntario: 200, voluntarioDaVila: "negado", mae: "negado", conhecido: "negado", secretariaPorPin: "negado", gestor: 200, gestorDaVila: "negado", gestorSemFator: 200, geral: 200 },
    relatorio: { semSessao: 401, tokenLixo: 401, voluntario: "negado", voluntarioDaVila: "negado", mae: "negado", conhecido: "negado", secretariaPorPin: "negado", gestor: 200, gestorDaVila: "negado", gestorSemFator: 200, geral: 200 },
    responsaveis: { semSessao: 401, tokenLixo: 401, voluntario: 200, voluntarioDaVila: "negado", mae: "negado", conhecido: "negado", secretariaPorPin: "negado", gestor: "negado", gestorDaVila: "negado", gestorSemFator: "negado", geral: "negado" },
    autorizados: { semSessao: 401, tokenLixo: 401, voluntario: "negado", voluntarioDaVila: "negado", mae: 200, conhecido: "negado", secretariaPorPin: "negado", gestor: 200, gestorDaVila: "negado", gestorSemFator: 200, geral: 200 },
    saude: { semSessao: 401, tokenLixo: 401, voluntario: "negado", voluntarioDaVila: "negado", mae: 200, conhecido: "negado", secretariaPorPin: "negado", gestor: 200, gestorDaVila: "negado", gestorSemFator: 200, geral: 200 }
  };
  const QUERY = { sala: sala(svC), relatorio: sala(svC), responsaveis: { ...sala(svC), menorId: K.bia }, autorizados: { menorId: K.bia }, saude: { menorId: K.bia }, historico: {} };
  let divergencias = [];
  for (const [acao, esperado] of Object.entries(ESPERADO_LEITURA)) for (const [nome, token] of Object.entries(SESSOES)) {
    const x = await get(acao, token, QUERY[acao]);
    const e = esperado[nome];
    const certo = e === "negado" ? NEGADO.includes(x.status) : x.status === e;
    if (!certo) divergencias.push(`GET ${acao} como ${nome}: esperava ${e}, veio ${x.status} ${msg(x).slice(0, 60)}`);
  }
  ok(divergencias.length === 0, `leituras: ${Object.keys(ESPERADO_LEITURA).length * Object.keys(SESSOES).length} combinações rota × sessão conferem`, divergencias.slice(0, 6));
  // Trava 7-B: a busca de criança é POST (o nome digitado não vai no endereço); a matriz de quem pode é a mesma de antes
  const ESPERADO_BUSCA = { semSessao: 401, tokenLixo: 401, voluntario: 200, voluntarioDaVila: "negado", mae: "negado", conhecido: "negado", secretariaPorPin: "negado", gestor: "negado", gestorDaVila: "negado", gestorSemFator: "negado", geral: "negado" };
  divergencias = [];
  for (const [nome, token] of Object.entries(SESSOES)) {
    const x = await post("buscar", token, { ...sala(svC), q: "Bia" });
    const e = ESPERADO_BUSCA[nome];
    if (!(e === "negado" ? NEGADO.includes(x.status) : x.status === e)) divergencias.push(`POST buscar como ${nome}: esperava ${e}, veio ${x.status} ${msg(x).slice(0, 60)}`);
  }
  ok(divergencias.length === 0, "POST buscar: as 11 sessões conferem (só a equipe da sala, presente, busca criança)", divergencias.slice(0, 6));
  // 'geral' = Diretoria de nível geral COM a permissão: vê a sala e a lista, mas NÃO opera (buscar/responsaveis são da equipe da sala, presente)

  console.log("== as escritas: quem não é da equipe da sala nunca grava nada ==");
  const ESCRITAS = {                                                          // acao -> corpo (válido para a sala/criança da Central) e quem PODE
    "entrar-na-sala": { corpo: sala(svC), podem: ["voluntario"] },
    "sair-da-sala": { corpo: sala(svC), podem: [] },                          // (a Carla pode, mas a regra dos dois adultos pode barrar: aqui só importa quem NÃO pode)
    checkin: { corpo: { ...sala(svC), criancas: [visitante("Visitante Da Matriz Teste", 4)], trouxe: trouxeLivre() }, podem: ["voluntario"] },
    retirar: { corpo: { registroId: rJoana, codigo: codigoErradoDe(cJoana), retirante: { ref: `RESP:${P.alice}` } }, podem: ["voluntario"] },
    "segunda-via-pedir": { corpo: { registroId: rJoana, pessoa: { ref: `RESP:${P.alice}` }, documento: "RG" }, podem: ["voluntario"] },
    "segunda-via-confirmar": { corpo: { registroId: rCaio }, podem: ["voluntario"] },
    "decidir-divergencia": { corpo: { registroId: rEnzo, aprovar: true, motivo: "Confirmei com a mãe, pelo telefone cadastrado." }, podem: ["gestor", "geral"] },
    destravar: { corpo: { registroId: rDuda }, podem: ["gestor", "gestorSemFator", "geral"] },
    "encerrar-sala": { corpo: { ...sala(svC), motivo: "Ficaram na sala depois do culto." }, podem: ["gestor", "geral"] },
    "autorizado-adicionar": { corpo: { menorId: K.bia, nome: "Pessoa Teste Seguranca", parentesco: "TIO" }, podem: ["mae"] },
    "autorizado-revogar": { corpo: { autorizadoId: 1 }, podem: [] },
    "saude-gravar": { corpo: { menorId: K.bia, texto: "Alergia teste" }, podem: ["mae"] },
    "saude-apagar": { corpo: { menorId: K.bia }, podem: ["mae", "gestor", "geral", "gestorSemFator"] }
  };
  divergencias = [];
  for (const [acao, { corpo, podem }] of Object.entries(ESCRITAS)) for (const [nome, token] of Object.entries(SESSOES)) {
    if (podem.includes(nome)) continue;
    if (acao === "sair-da-sala" && ["voluntario", "gestor", "gestorSemFator", "geral"].includes(nome)) continue;     // quem tem escopo na congregação passa da porta (e ouve "não está na sala"); aqui só importa quem NÃO tem relação com a sala
    if (acao === "autorizado-adicionar" && nome === "gestor") continue;      // a Secretaria também autoriza, mas com ficha (testado no e2e-19)
    if ((acao === "decidir-divergencia" || acao === "destravar") && nome === "gestorSemFator") { if (acao === "decidir-divergencia") { /* 428 abaixo */ } }
    const antes = await retratoCk();
    const x = await post(acao, token, corpo);
    const esperado401 = nome === "semSessao" || nome === "tokenLixo";
    const certo = esperado401 ? x.status === 401 : ((acao === "decidir-divergencia" || acao === "encerrar-sala") && nome === "gestorSemFator") ? x.status === 428 : NEGADO.includes(x.status);
    if (!certo) divergencias.push(`POST ${acao} como ${nome}: veio ${x.status} ${msg(x).slice(0, 70)}`);
    if ((await retratoCk()) !== antes) divergencias.push(`POST ${acao} como ${nome}: MEXEU NO BANCO (${x.status})`);
  }
  ok(divergencias.length === 0, "escritas: quem não pode é recusado (401/403/404; 428 sem a confirmação reforçada) e NADA é gravado, avisado nem auditado", divergencias.slice(0, 8));
  r = await chamarH(H.CK, { acao: "checkin", metodo: "PUT", token: pin(CARLA), corpo: {} }); ok(r.status === 405, "PUT não existe (405)", r.status);
  r = await chamarH(H.CK, { acao: "checkin", metodo: "DELETE", token: pin(CARLA) }); ok(r.status === 405, "DELETE não existe (405)", r.status);
  r = await ckGet("nao-existe", pin(CARLA)); ok(r.status === 404, "ação GET inexistente: 404", r.status);
  r = await ckPost("nao-existe", pin(CARLA), {}); ok(r.status === 404, "ação POST inexistente: 404", r.status);
  r = await chamarH(H.CK, { acao: "__proto__", metodo: "POST", token: pin(CARLA), corpo: {} }); ok(r.status === 404, "ação '__proto__': 404 (sem surpresa de protótipo)", r.status);

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  console.log("== enumeração: 'não existe' e 'não é seu' têm a MESMA resposta ==");
  const mesma = async (descricao, a, b2) => ok(a.status === b2.status && msg(a) === msg(b2) && JSON.stringify(a.body) === JSON.stringify(b2.body), descricao, [[a.status, msg(a)], [b2.status, msg(b2)]]);
  const INEXISTENTE = 99999999;
  for (const [nome, token] of [["um voluntário de OUTRA congregação (Nilo, da Vila)", pin(NILO)], ["a mãe da criança (PIN, sem estar na escala)", pin(P.alice)], ["um conhecido sem vínculo", pin(P.everton)], ["o voluntário escalado só na sala da Vila (Quitéria)", pin(QUITERIA)]]) {
    for (const [acao, corpoReal, corpoFalso] of [
      ["retirar", { registroId: rJoana, codigo: cJoana, retirante: { ref: `RESP:${P.alice}` } }, { registroId: INEXISTENTE, codigo: cJoana, retirante: { ref: `RESP:${P.alice}` } }],
      ["segunda-via-pedir", { registroId: rJoana, pessoa: { ref: `RESP:${P.alice}` }, documento: "RG" }, { registroId: INEXISTENTE, pessoa: { ref: `RESP:${P.alice}` }, documento: "RG" }],
      ["segunda-via-confirmar", { registroId: rCaio }, { registroId: INEXISTENTE }]
    ]) {
      const real = await post(acao, token, corpoReal), falso = await post(acao, token, corpoFalso);
      await mesma(`${acao} por ${nome}: registro que existe (mas não é dele) e registro que não existe recebem a mesma resposta`, real, falso);
    }
    const salaReal = await get("sala", token, sala(svC)), salaFalsa = await get("sala", token, { servicoId: INEXISTENTE, equipeId: eq.maternal });
    await mesma(`sala por ${nome}: a sala da Central (que existe) e uma que não existe recebem a mesma resposta`, salaReal, salaFalsa);
    const entrReal = await post("entrar-na-sala", token, sala(svC)), entrFalsa = await post("entrar-na-sala", token, { servicoId: INEXISTENTE, equipeId: eq.maternal });
    if (nome.startsWith("o voluntário escalado só")) { /* escalado em outra sala: a resposta para a sala dos outros é a mesma de 'não existe' */ }
    if (!nome.includes("Quitéria")) await mesma(`entrar-na-sala por ${nome}: idem`, entrReal, entrFalsa);
    const chkReal = await post("checkin", token, { ...sala(svC), criancas: [visitante("Visitante Enumeracao Teste", 4)], trouxe: trouxeLivre() }), chkFalso = await post("checkin", token, { servicoId: INEXISTENTE, equipeId: eq.maternal, criancas: [visitante("Visitante Enumeracao Teste", 4)], trouxe: trouxeLivre() });
    await mesma(`checkin por ${nome}: idem`, chkReal, chkFalso);
    const sairReal = await post("sair-da-sala", token, sala(svC)), sairFalso = await post("sair-da-sala", token, { servicoId: INEXISTENTE, equipeId: eq.maternal });
    await mesma(`sair-da-sala por ${nome}: idem`, sairReal, sairFalso);
    const buscaReal = await post("buscar", token, { ...sala(svC), q: "Bia" }), buscaFalsa = await post("buscar", token, { servicoId: INEXISTENTE, equipeId: eq.maternal, q: "Bia" });
    await mesma(`buscar por ${nome}: idem`, buscaReal, buscaFalsa);
  }
  for (const [nome, token] of [["a liderança da Vila", secVila()]]) for (const acao of ["decidir-divergencia", "destravar"]) {
    const real = await post(acao, token, { registroId: rEnzo, aprovar: true, motivo: "Confirmei com a mãe, pelo telefone." }), falso = await post(acao, token, { registroId: INEXISTENTE, aprovar: true, motivo: "Confirmei com a mãe, pelo telefone." });
    await mesma(`${acao} por ${nome}: registro de outra congregação e registro que não existe: a mesma resposta`, real, falso);
  }
  r = await get("sala", pin(CARLA), sala(svC, eq.recepcao)); const semMarca = r;
  r = await get("sala", pin(CARLA), { servicoId: INEXISTENTE, equipeId: eq.maternal });
  await mesma("sala de equipe SEM a marca (que a pessoa não integra) e sala que não existe: a mesma resposta (a marca da equipe não vira sonda)", semMarca, r);
  // um id que não existe como criança/autorizado: a mesma recusa que o de outra família
  const sonda = [await post("autorizado-adicionar", pin(P.everton), { menorId: K.bia, nome: "Fulana Teste", parentesco: "TIO" }), await post("autorizado-adicionar", pin(P.everton), { menorId: INEXISTENTE, nome: "Fulana Teste", parentesco: "TIO" }), await post("autorizado-adicionar", pin(P.everton), { menorId: K.heitor, nome: "Fulana Teste", parentesco: "TIO" })];
  ok(sonda.every((x) => x.status === 403 && msg(x) === msg(sonda[0])), "autorizado-adicionar por um conhecido: criança existente, inexistente e maior de idade recebem o MESMO 403", sonda.map((x) => [x.status, msg(x)]));
  const sonda2 = [await get("saude", pin(P.everton), { menorId: K.bia }), await get("saude", pin(P.everton), { menorId: INEXISTENTE }), await get("autorizados", pin(P.everton), { menorId: K.bia }), await get("autorizados", pin(P.everton), { menorId: INEXISTENTE })];
  ok(sonda2.every((x) => x.status === 403 && msg(x) === msg(sonda2[0])), "ler saúde ou lista de autorizados sem ser responsável: o mesmo 403 para quem existe e para quem não existe", sonda2.map((x) => [x.status, msg(x)]));
  r = await get("responsaveis", pin(ANA), { ...sala(svC), menorId: K.heitorVila }); const rr2 = await get("responsaveis", pin(ANA), { ...sala(svC), menorId: INEXISTENTE });
  await mesma("responsaveis: criança de outra congregação e criança que não existe: a mesma resposta", r, rr2);

  console.log("== o que 'quem trouxe' pode ser ==");
  r = await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Sem Responsavel Teste", 4)], { responsavelId: P.everton }); anota(r);
  ok(r.status !== 201, "um visitante NÃO pode ter como 'quem trouxe' um membro qualquer pela matrícula (sem criança membro desse responsável no pedido, o responsavelId não tem o que conferir): recusado", [r.status, msg(r)]);
  r = await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Sem Responsavel Teste", 4)], { responsavelId: INEXISTENTE }); anota(r);
  const rEx = r;
  r = await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Sem Responsavel Teste", 4)], { responsavelId: P.everton }); anota(r);
  ok(rEx.status === r.status && msg(rEx) === msg(r), "e membro que existe e membro que não existe recebem a MESMA resposta (não vira sonda de matrículas)", [[rEx.status, msg(rEx)], [r.status, msg(r)]]);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE VisitanteNome = N'Visitante Sem Responsavel Teste'")) === 0, "nada foi gravado");

  console.log("== a aptidão é reavaliada a CADA ato (quem perde a habilitação no meio do serviço para na hora) ==");
  await derrubarAptidao(CARLA);
  const ATOS = [["sala", "GET", sala(svC)], ["buscar", "POST", { ...sala(svC), q: "Bia" }], ["responsaveis", "GET", { ...sala(svC), menorId: K.bia }],
    ["checkin", "POST", { ...sala(svC), criancas: [visitante("Visitante Sem Aptidao Teste", 4)], trouxe: trouxeLivre() }], ["retirar", "POST", { registroId: rJoana, codigo: cJoana, retirante: { ref: `RESP:${P.alice}` } }],
    ["segunda-via-pedir", "POST", { registroId: rJoana, pessoa: { ref: `RESP:${P.alice}` }, documento: "RG" }], ["segunda-via-confirmar", "POST", { registroId: rCaio }], ["entrar-na-sala", "POST", sala(svC)]];
  divergencias = [];
  for (const [acao, metodo, dados] of ATOS) {
    const antes = await retratoCk();
    const x = metodo === "GET" ? await get(acao, pin(CARLA), dados) : await post(acao, pin(CARLA), dados);
    if (x.status !== 403 || !/não está apto/.test(msg(x))) divergencias.push(`${acao}: ${x.status} ${msg(x).slice(0, 60)}`);
    if ((await retratoCk()) !== antes) divergencias.push(`${acao}: gravou`);
  }
  ok(divergencias.length === 0, "a Carla perdeu a habilitação (certidão venceu ontem): nenhum ato da sala é feito por ela (403 com o motivo), e nada é gravado", divergencias);
  await restaurarAptidao(CARLA);
  r = await get("sala", pin(CARLA), sala(svC)); ok(r.status === 200, "recuperada a habilitação, ela volta a operar na hora", r.status);
  await derrubarAptidao(BRUNO);
  r = await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Dois Adultos Teste", 4)], trouxeLivre());
  ok(r.status === 201, "Bruno perdeu a habilitação mas Ana e Carla ainda são 2 adultos aptos: o check-in passa", r.body);
  await derrubarAptidao(CARLA);
  r = await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Um Adulto Teste", 4)], trouxeLivre());
  ok(r.status === 422 && /nunca fica com um adulto só/.test(msg(r)), "e com a Carla também inapta, só a Ana conta como adulto: o check-in é RECUSADO (quem está na sala mas perdeu a habilitação não conta)", r.body);
  await restaurarAptidao(BRUNO); await restaurarAptidao(CARLA);
  const adolescente = 6020;
  await H.alocar(svC, eq.maternal, [adolescente]);
  r = await ckPost("entrar-na-sala", pin(adolescente), sala(svC)); ok(r.status === 403 && /Só adultos/.test(msg(r)), "o adolescente (apto) escalado na sala não entra: auxiliar não opera nem conta como adulto", r.body);
  await q("INSERT INTO CheckinInfantilVoluntarios (ServicoId, EquipeId, MembroId) VALUES (@s, @e, @m)", { s: svC, e: eq.maternal, m: adolescente });
  r = await get("sala", pin(CARLA), sala(svC)); ok(r.body.adultosPresentes.find((x) => x.membroId === adolescente).contaComoAdulto === false && r.body.lotacao.adultos === 3, "mesmo que um adolescente conste como presente (gravado por fora), ele NÃO conta como adulto na lotação", r.body.lotacao);
  r = await ckPost("retirar", pin(adolescente), { registroId: rJoana, codigo: codigoErradoDe(cJoana), retirante: { ref: `RESP:${P.alice}` } }); ok(r.status === 403, "e não opera: 403", r.body);
  await q("UPDATE CheckinInfantilVoluntarios SET SaiuEm = SYSUTCDATETIME() WHERE MembroId = @m AND SaiuEm IS NULL", { m: adolescente });
  r = await ckPost("retirar", pin(6013), { registroId: rJoana, codigo: codigoErradoDe(cJoana), retirante: { ref: `RESP:${P.alice}` } }); ok(r.status === 403 || r.status === 404, "voluntário inapto que nem está na escala: recusado", r.status);

  console.log("== sessão e escopo da liderança ==");
  r = await post("decidir-divergencia", pin(C.secretaria.central), { registroId: rEnzo, aprovar: true, motivo: "Confirmei com a mãe, pelo telefone." }); ok(r.status === 403, "a Secretaria entrando por PIN não decide divergência: 403 (PIN nunca vale como liderança)", r.body);
  r = await post("decidir-divergencia", LIDER(C.secretaria.central, ["pessoas"], CENTRAL), { registroId: rEnzo, aprovar: true, motivo: "Confirmei com a mãe, pelo telefone." }); ok(r.status === 403, "liderança SEM a permissão habilitacao_voluntarios: 403", r.body);
  r = await post("decidir-divergencia", LIDER(C.secretaria.central, ["habilitacao_voluntarios"], VILA), { registroId: rEnzo, aprovar: true, motivo: "Confirmei com a mãe, pelo telefone." }); ok(r.status === 404, "liderança com a permissão mas escopo SÓ da Vila: 404 sobre registro da Central", r.body);
  r = await post("decidir-divergencia", LIDER(C.secretaria.central, ["habilitacao_voluntarios"], [...CENTRAL, ...VILA]), { registroId: rVila, aprovar: false, motivo: "Negado pela liderança que vê as duas." }); ok(r.status !== 403, "escopo das DUAS congregações alcança o registro da Vila (a decisão depende do estado, não da porta): " + r.status, r.body);
  r = await post("decidir-divergencia", sec(), { registroId: rBia, aprovar: true, motivo: "Aprovando algo que não está pendente." }); ok(r.status === 409, "aprovar o que não está pendente: 409", r.body);
  r = await post("destravar", sec(), { registroId: rBia }); ok(r.status === 409, "destravar o que não está travado: 409", r.body);
  const expirado = L.sessao(C.secretaria.central, { via: "SENHA", nivel: "CONGREGACAO", escopoCongregacoes: CENTRAL, permissoes: ["habilitacao_voluntarios"], fator: { via: "CHAVE", em: Date.now() - 11 * 60 * 1000 } });
  r = await post("decidir-divergencia", expirado, { registroId: rEnzo, aprovar: true, motivo: "Confirmei com a mãe, pelo telefone." }); ok(r.status === 428, "a confirmação reforçada de 11 minutos atrás já venceu: 428", r.body);
  const fatorNenhum = L.sessao(C.secretaria.central, { via: "SENHA", nivel: "CONGREGACAO", escopoCongregacoes: CENTRAL, permissoes: ["habilitacao_voluntarios"], fator: { via: "NENHUM", em: Date.now() } });
  r = await post("decidir-divergencia", fatorNenhum, { registroId: rEnzo, aprovar: true, motivo: "Confirmei com a mãe, pelo telefone." }); ok(r.status === 428, "fator 'NENHUM' (só a senha) não vale como confirmação reforçada: 428", r.body);
  ok((await doBanco(rEnzo)).Situacao === "RETIRADA_PENDENTE", "(o Enzo continua pendente depois de tudo isso)");

  console.log("== o código: só o HMAC, nunca em resposta, log, aviso nem auditoria; o segredo do servidor faz parte ==");
  const reg = await um("SELECT CodigoHash, CodigoGeracao FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: rJoana });
  ok(/^[0-9a-f]{64}$/.test(reg.CodigoHash) && reg.CodigoHash === ckRegra.hashCodigo(cJoana, { registroId: rJoana, geracao: reg.CodigoGeracao, segredo: process.env.AUTH_SECRET }), "o banco guarda 64 hexadecimais: o HMAC do código com o segredo do servidor");
  ok(!ckRegra.confereCodigo(cJoana, reg.CodigoHash, { registroId: rJoana, geracao: reg.CodigoGeracao, segredo: "outro-segredo-que-o-servidor-nao-usa-12345" }), "com OUTRO segredo o mesmo código não confere (o hash vazado do banco não vale sem o segredo)");
  ok(!ckRegra.confereCodigo(cJoana, reg.CodigoHash, { registroId: rBia, geracao: reg.CodigoGeracao, segredo: process.env.AUTH_SECRET }), "nem em outro registro (atado ao registro)");
  ok(!ckRegra.confereCodigo(cJoana, reg.CodigoHash, { registroId: rJoana, geracao: reg.CodigoGeracao + 1, segredo: process.env.AUTH_SECRET }), "nem em outra geração (a segunda via invalida o antigo)");
  const todoTexto = await textoDasTabelas();
  ok(CODIGOS.every((c) => !todoTexto.includes(c)), `nenhum dos ${CODIGOS.length} códigos emitidos aparece em tabela, auditoria ou aviso`);
  ok(CODIGOS.every((c) => !LOGS.join("\n").includes(c)), "nem em log");
  ok(CODIGOS.every((c) => RESPOSTAS.every((t) => !t.includes(c))), `e nenhum aparece em resposta nenhuma das ${RESPOSTAS.length} desta bateria (leituras, recusas, erros): o código só sai UMA vez, na resposta do check-in`);
  const hashesGuardados = (await q("SELECT CodigoHash FROM CheckinInfantilRegistros")).map((x) => x.CodigoHash);
  await get("sala", sec(), sala(svC)); await get("relatorio", sec(), sala(svC)); await get("historico", pin(P.alice), {});
  ok(hashesGuardados.length > 5 && RESPOSTAS.every((t) => !/CodigoHash/.test(t) && hashesGuardados.every((h) => !t.includes(h))), `e o HMAC guardado de cada um dos ${hashesGuardados.length} registros nunca sai em resposta (nem na sala e no relatório da liderança, nem no histórico)`);

  console.log("== o teto de tentativas: reservado no banco ANTES de conferir ==");
  r = anota(await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Teto Teste", 4)], trouxeLivre("Tia Teto Teste"))); const rTeto = registrosDe(r)[0], cTeto = codigosDe(r)[0];
  const resultados = [];
  for (let i = 0; i < 8; i++) resultados.push((await R(i % 2 ? pin(BRUNO) : pin(ANA), rTeto, codigoErradoDe(cTeto), { ref: "TROUXE" })).status);
  b = await doBanco(rTeto);
  ok(b.Tentativas === 5 && b.Travado === true && (await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE RegistroId = @r AND Tipo = 'CODIGO_ERRADO'", { r: rTeto })) === 5, "8 tentativas erradas por DOIS voluntários: só 5 são conferidas (5 eventos, contador em 5, criança travada)", [resultados, b]);
  ok(resultados.slice(5).every((s) => s === 422), "as três últimas são recusadas sem conferir (422 'travada')", resultados);
  r = await R(pin(ANA), rTeto, cTeto, { ref: "TROUXE" }); ok(r.status === 422 && r.body.travada === true, "depois do teto o código certo também não vale", r.body);
  r = await R(pin(ANA), rTeto, codigoErradoDe(cTeto), { ref: "TROUXE" }); ok((await doBanco(rTeto)).Tentativas === 5, "e o contador não passa de 5 (continua 5)");
  await q("UPDATE Prazos SET Dias = 99 WHERE Sigla = 'CHECKIN_TENTATIVAS_CODIGO'"); H.db.limparCaches();      // a configuração dos prazos fica 15 s em memória: o roteiro mudou no banco e quer o efeito na hora
  r = anota(await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Teto Cem Teste", 4)], trouxeLivre("Tia Teto Cem Teste"))); const rT2 = registrosDe(r)[0], cT2 = codigosDe(r)[0];
  for (let i = 0; i < 7; i++) await R(pin(ANA), rT2, codigoErradoDe(cT2), { ref: "TROUXE" });
  ok((await doBanco(rT2)).Tentativas === 5 && (await doBanco(rT2)).Travado === true, "mesmo que a Igreja configure 99 tentativas, o teto de 5 vale (a configuração só pode baixar)", await doBanco(rT2));
  await q("UPDATE Prazos SET Dias = 0 WHERE Sigla = 'CHECKIN_TENTATIVAS_CODIGO'"); H.db.limparCaches();      // a configuração dos prazos fica 15 s em memória: o roteiro mudou no banco e quer o efeito na hora
  r = anota(await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Teto Zero Teste", 4)], trouxeLivre("Tia Teto Zero Teste"))); const rT3 = registrosDe(r)[0], cT3 = codigosDe(r)[0];
  r = await R(pin(ANA), rT3, codigoErradoDe(cT3), { ref: "TROUXE" }); ok(r.status === 422 && r.body.tentativasRestantes === 4, "configurar 0 tentativas volta ao padrão (5): o prazo ruim nunca trava todas as crianças", r.body);
  await q("UPDATE Prazos SET Dias = 5 WHERE Sigla = 'CHECKIN_TENTATIVAS_CODIGO'"); H.db.limparCaches();      // a configuração dos prazos fica 15 s em memória: o roteiro mudou no banco e quer o efeito na hora

  console.log("== a sala e a marca mudam no meio do serviço: a criança que está na sala precisa poder ser retirada ==");
  r = anota(await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Marca Teste", 4)], trouxeLivre("Tia Marca Teste"))); const rMarca = registrosDe(r)[0], cMarca = codigosDe(r)[0];
  await q("UPDATE EscalasEquipes SET ContatoComMenores = 0 WHERE EquipeId = @e", { e: eq.maternal });
  r = await R(pin(ANA), rMarca, cMarca, { ref: "TROUXE" });
  ok(r.status === 200, "a liderança tirou a marca 'contato com menores' da equipe NO MEIO do serviço: a criança que já está na sala continua podendo ser retirada com o código", [r.status, msg(r)]);
  await q("UPDATE EscalasEquipes SET ContatoComMenores = 1 WHERE EquipeId = @e", { e: eq.maternal });
  r = anota(await checkin(pin(ANA), svC, eq.maternal, [visitante("Visitante Marca Dois Teste", 4)], trouxeLivre("Tia Marca Dois Teste"))); const rMarca2 = registrosDe(r)[0], cMarca2 = codigosDe(r)[0];
  await q("UPDATE EscalasEquipes SET ContatoComMenores = 0 WHERE EquipeId = @e", { e: eq.maternal });
  r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: rMarca2, pessoa: { ref: "TROUXE" }, documento: "RG" }); const pedidoSemMarca = r.status;
  r = await ckPost("segunda-via-confirmar", pin(BRUNO), { registroId: rMarca2 });
  ok(pedidoSemMarca === 201 && r.status === 200, "e a segunda via também funciona sem a marca", [pedidoSemMarca, r.status, msg(r)]);
  const cMarca2Novo = r.status === 200 ? r.body.etiqueta.codigo : null; if (cMarca2Novo) CODIGOS.push(cMarca2Novo);
  r = await ckPost("destravar", sec(), { registroId: rMarca2 }); ok(r.status === 409, "e a liderança alcança o registro (409 'não está travada', não 'equipe sem a marca')", [r.status, msg(r)]);
  r = await ckPost("checkin", pin(ANA), { ...sala(svC), criancas: [visitante("Visitante Depois Da Marca Teste", 4)], trouxe: trouxeLivre() }); ok(r.status === 422 && /contato com menores/.test(msg(r)), "mas um check-in NOVO na equipe sem a marca é recusado", r.body);
  await q("UPDATE EscalasEquipes SET ContatoComMenores = 1 WHERE EquipeId = @e", { e: eq.maternal });
  await q("UPDATE EscalasEquipes SET Ativa = 0 WHERE EquipeId = @e", { e: eq.maternal });
  r = await ckPost("checkin", pin(ANA), { ...sala(svC), criancas: [visitante("Visitante Equipe Inativa Teste", 4)], trouxe: trouxeLivre() }); ok(r.status !== 201, "equipe DESATIVADA: nenhum check-in novo", [r.status, msg(r)]);
  r = await ckPost("entrar-na-sala", pin(OLGA), sala(svC)); ok(r.status !== 201, "equipe desativada: ninguém novo entra na sala", [r.status, msg(r)]);
  const rJoanaSala = await R(pin(ANA), rJoana, codigoErradoDe(cJoana), { ref: `RESP:${P.alice}` }); ok(rJoanaSala.status === 422 && rJoanaSala.body.codigoErrado, "mas a retirada de quem já está na sala segue valendo (o código errado é conferido como sempre)", [rJoanaSala.status, msg(rJoanaSala)]);
  await q("UPDATE EscalasEquipes SET Ativa = 1 WHERE EquipeId = @e", { e: eq.maternal });
  await q("UPDATE EscalasServicos SET Status = 'CANCELADA' WHERE ServicoId = @s", { s: svC });
  r = await R(pin(ANA), rMarca2, cMarca2Novo || cMarca2, { ref: "TROUXE" });
  ok(r.status === 200, "serviço CANCELADO com criança dentro: a retirada com o código continua funcionando", [r.status, msg(r)]);
  r = await ckPost("checkin", pin(ANA), { ...sala(svC), criancas: [visitante("Visitante Servico Cancelado Teste", 4)], trouxe: trouxeLivre() }); ok(r.status === 422 && /não está publicado/.test(msg(r)), "mas não se faz check-in novo em serviço cancelado", r.body);
  await q("UPDATE EscalasServicos SET Status = 'PUBLICADA' WHERE ServicoId = @s", { s: svC });

  console.log("== o que um voluntário comum NÃO alcança ==");
  r = await ckPost("retirar", pin(NILO), { registroId: rVila, codigo: cVila, retirante: { ref: `RESP:${P.irene}` } }); ok(r.status === 200, "(controle: o Nilo retira a criança da SALA DELE com o código certo)", r.body);
  r = await ckPost("retirar", pin(NILO), { registroId: rJoana, codigo: cJoana, retirante: { ref: `RESP:${P.alice}` } }); ok(NEGADO.includes(r.status), "mas, mesmo com o código certo da Joana nas mãos, o Nilo (voluntário da Vila) não retira criança da Central", r.status);
  ok((await doBanco(rJoana)).Situacao === "NA_SALA", "e a Joana segue na sala");
  const bercario = await H.abrirSala(c1, eq.bercario, [BRUNO, OLGA]);
  r = await ckPost("retirar", pin(BRUNO), { registroId: rJoana, codigo: cJoana, retirante: { ref: `RESP:${P.alice}` } });
  ok(NEGADO.includes(r.status) || r.status === 200, "(informativo) o Bruno está escalado no BERÇÁRIO e na sala do maternal; a Joana é do maternal: " + r.status, msg(r));
  r = await ckGet("sala", pin(OLGA), sala(svC)); ok(NEGADO.includes(r.status), "a Olga, escalada só no berçário deste serviço, não vê a sala do maternal", r.status);
  r = await ckPost("retirar", pin(OLGA), { registroId: rJoana, codigo: cJoana, retirante: { ref: `RESP:${P.alice}` } }); ok(NEGADO.includes(r.status), "nem retira criança do maternal", r.status);
  ok(bercario > 0, "(berçário aberto para a prova)");

  console.log("== lixo em todo campo: nunca 500, nunca vazamento, recusa nunca grava ==");
  async function fuzzarCaminhos(rotulo, fazer, base, listaDeCaminhos, { aceitos = [200, 201, 400, 401, 403, 404, 409, 422, 428, 429], mudancaLegitima = () => false } = {}) {
    let chamadas = 0; const quebras = [], mudancas = [];
    for (const caminho of listaDeCaminhos) for (const lixo of LIXO) {
      const corpo = JSON.parse(JSON.stringify(base, (k, v) => (v === undefined ? null : v)));
      let alvo = corpo; for (let i = 0; i < caminho.length - 1; i++) { if (alvo[caminho[i]] == null || typeof alvo[caminho[i]] !== "object") alvo[caminho[i]] = {}; alvo = alvo[caminho[i]]; }
      const ultimo = caminho[caminho.length - 1];
      if (lixo === undefined) delete alvo[ultimo]; else alvo[ultimo] = lixo;
      const antes = await retratoCk();
      const x = await fazer(corpo); chamadas++;
      const texto = x.body && typeof x.body === "object" ? JSON.stringify(x.body) : "";
      const rot = `${rotulo}.${caminho.join(".")} = ${JSON.stringify(lixo) === undefined ? "undefined" : JSON.stringify(lixo).slice(0, 36)}`;
      if (x.status === 500 || !aceitos.includes(x.status)) quebras.push(`${rot} -> ${x.status} ${texto.slice(0, 100)}`);
      else if (x.status >= 400 && !mudancaLegitima(x) && (await retratoCk()) !== antes) mudancas.push(`${rot} (${x.status}) mexeu no banco`);
      if (/SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules|RAISERROR|CodigoHash/i.test(texto)) quebras.push(`${rot} vazou texto interno: ${texto.slice(0, 90)}`);
    }
    ok(quebras.length === 0, `${rotulo}: ${chamadas} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 5));
    ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 5));
  }
  const svF = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
  const baseCheckin = { ...sala(svF), criancas: [{ visitante: { nome: "Visitante Fuzz Teste", nascimento: H.nascimentoParaIdade(4), saude: { texto: "Alergia fuzz", concordo: true, textoHash: (await ckGet("catalogos", pin(ANA))).body.textoSaude.hash } } }], trouxe: { nome: "Tia Fuzz Teste", parentesco: "MAE", documento: "RG", contato: "11 98888-7777" }, autorizadosVisita: [{ nome: "Indicada Fuzz", parentesco: "AVO" }] };
  await fuzzarCaminhos("checkin", (corpo) => ckPost("checkin", pin(ANA), corpo), baseCheckin, [["servicoId"], ["equipeId"], ["criancas"], ["criancas", 0, "visitante"], ["criancas", 0, "visitante", "nome"], ["criancas", 0, "visitante", "nascimento"], ["criancas", 0, "visitante", "saude"], ["criancas", 0, "visitante", "saude", "texto"],
    ["criancas", 0, "visitante", "saude", "concordo"], ["criancas", 0, "visitante", "saude", "textoHash"], ["criancas", 0, "menorId"], ["trouxe"], ["trouxe", "nome"], ["trouxe", "parentesco"], ["trouxe", "documento"], ["trouxe", "contato"], ["trouxe", "responsavelId"], ["autorizadosVisita"], ["autorizadosVisita", 0, "nome"], ["autorizadosVisita", 0, "parentesco"]]);
  await limpar(); for (const m of [ANA, BRUNO, CARLA]) await ckPost("entrar-na-sala", pin(m), sala(svF));
  r = anota(await checkin(pin(ANA), svF, eq.maternal, [visitante("Visitante Fuzz Dois Teste", 4)], trouxeLivre("Tia Fuzz Dois"))); const rFz = registrosDe(r)[0], cFz = codigosDe(r)[0];
  await fuzzarCaminhos("retirar", (corpo) => ckPost("retirar", pin(ANA), corpo), { registroId: rFz, codigo: codigoErradoDe(cFz), retirante: { ref: "TROUXE" } }, [["registroId"], ["codigo"], ["retirante"], ["retirante", "ref"], ["retirante", "outro"], ["retirante", "outro", "nome"], ["retirante", "outro", "parentesco"], ["retirante", "outro", "documento"]], { mudancaLegitima: (x) => !!(x.body && x.body.codigoErrado) });   // o código errado GASTA a tentativa e fica no histórico: é o que o teto exige
  await fuzzarCaminhos("segunda-via-pedir", (corpo) => ckPost("segunda-via-pedir", pin(ANA), corpo), { registroId: rFz, pessoa: { ref: "TROUXE" }, documento: "RG" }, [["registroId"], ["pessoa"], ["pessoa", "ref"], ["documento"]]);
  await fuzzarCaminhos("segunda-via-confirmar", (corpo) => ckPost("segunda-via-confirmar", pin(BRUNO), corpo), { registroId: rFz }, [["registroId"]]);
  await fuzzarCaminhos("decidir-divergencia", (corpo) => ckPost("decidir-divergencia", sec(), corpo), { registroId: rFz, aprovar: true, motivo: "Confirmei com o responsável por telefone." }, [["registroId"], ["aprovar"], ["motivo"]]);
  await fuzzarCaminhos("destravar", (corpo) => ckPost("destravar", sec(), corpo), { registroId: rFz }, [["registroId"]]);
  // uma sala SEM criança nem voluntário (serviço novo): um motivo que por acaso seja válido não muda nada (idempotente); o resto é recusado
  const svVazio = await H.servico(c1);
  await fuzzarCaminhos("encerrar-sala", (corpo) => ckPost("encerrar-sala", sec(), corpo), { ...sala(svVazio), motivo: "Encerrando a sala de teste." }, [["servicoId"], ["equipeId"], ["motivo"]]);
  await fuzzarCaminhos("entrar-na-sala", (corpo) => ckPost("entrar-na-sala", pin(OLGA), corpo), sala(svF), [["servicoId"], ["equipeId"], ["membroId"]]);
  await fuzzarCaminhos("sair-da-sala", (corpo) => ckPost("sair-da-sala", sec(), corpo), { ...sala(svF), membroId: OLGA }, [["servicoId"], ["equipeId"], ["membroId"]]);
  await fuzzarCaminhos("autorizado-adicionar", (corpo) => ckPost("autorizado-adicionar", pin(P.alice), corpo), { menorId: K.bia, nome: "Fulana Fuzz Teste", parentesco: "TIO", membroId: P.dina, validoAte: "2099-01-01", ficha: false, referencia: "Pasta fuzz" }, [["menorId"], ["nome"], ["parentesco"], ["membroId"], ["validoAte"], ["ficha"], ["referencia"]]);
  await fuzzarCaminhos("autorizado-revogar", (corpo) => ckPost("autorizado-revogar", pin(P.alice), corpo), { autorizadoId: 1 }, [["autorizadoId"]]);
  await fuzzarCaminhos("saude-gravar", (corpo) => ckPost("saude-gravar", pin(P.alice), corpo), { menorId: K.bia, texto: "Alergia fuzz", ficha: false, referencia: "Pasta fuzz" }, [["menorId"], ["texto"], ["ficha"], ["referencia"]]);
  await fuzzarCaminhos("saude-apagar", (corpo) => ckPost("saude-apagar", pin(P.alice), corpo), { menorId: K.bia }, [["menorId"]]);
  for (const [acao, base, campos] of [["sala", sala(svF), ["servicoId", "equipeId"]], ["responsaveis", { ...sala(svF), menorId: K.bia }, ["servicoId", "equipeId", "menorId"]], ["autorizados", { menorId: K.bia }, ["menorId"]], ["saude", { menorId: K.bia }, ["menorId"]], ["historico", { menorId: K.bia }, ["menorId"]], ["relatorio", sala(svF), ["servicoId", "equipeId"]]]) {
    await H.fuzzar(ok, `GET ${acao}`, (corpo) => ckGet(acao, acao === "autorizados" || acao === "saude" || acao === "historico" ? pin(P.alice) : acao === "sala" || acao === "relatorio" ? sec() : pin(ANA), corpo), base, campos);
  }

  // Trava 7-B: a busca vai por POST (o nome digitado não vai no endereço, que fica nos registros da plataforma); por GET ela não existe mais
  await H.fuzzar(ok, "POST buscar", (corpo) => ckPost("buscar", pin(ANA), corpo), { ...sala(svF), q: "Bia" }, ["servicoId", "equipeId", "q"]);
  r = await ckGet("buscar", pin(ANA), { ...sala(svF), q: "Bia" }); ok(r.status === 404 && !JSON.stringify(r.body).includes("Bia"), "Trava 7-B: GET buscar não existe mais (404), e nada da criança volta", [r.status, r.body]);

  console.log("== injeção e marcação: o texto livre é dado, nunca comando nem tela ==");
  const INJECOES = ["'; DROP TABLE CheckinInfantilRegistros; --", "' OR '1'='1", "\"; EXEC xp_cmdshell('dir'); --", "Robert'); DELETE FROM CheckinInfantilEventos;--", "<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "${7*7}", "{{7*7}}", "%00", "‮evil", "\u0000x", "a".repeat(1000)];
  const antesTabelas = await escalar("SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'CheckinInfantil%'");
  const aceitos = [];
  for (const t of INJECOES) {
    for (const [acao, corpoDe] of [
      ["checkin", (t2) => ({ ...sala(svF), criancas: [{ visitante: { nome: t2, nascimento: H.nascimentoParaIdade(4) } }], trouxe: trouxeLivre("Tia Injecao Teste") })],
      ["checkin", (t2) => ({ ...sala(svF), criancas: [{ visitante: { nome: "Visitante Injecao Teste", nascimento: H.nascimentoParaIdade(4) } }], trouxe: { nome: t2, parentesco: "TIO", documento: "RG", contato: "11 98888-7777" } })],
      ["autorizado-adicionar", (t2) => ({ menorId: K.bia, nome: t2, parentesco: "TIO" })],
      ["autorizado-adicionar", (t2) => ({ menorId: K.bia, nome: "Fulana Injecao Teste", parentesco: "TIO", referencia: t2 })],
      ["saude-gravar", (t2) => ({ menorId: K.bia, texto: t2 })],
      ["decidir-divergencia", (t2) => ({ registroId: rFz, aprovar: false, motivo: t2 })],
      ["retirar", (t2) => ({ registroId: rFz, codigo: t2, retirante: { outro: { nome: t2, parentesco: "OUTRO", documento: "RG" } } })]
    ]) {
      const token = acao === "autorizado-adicionar" || acao === "saude-gravar" ? pin(P.alice) : acao === "decidir-divergencia" ? sec() : pin(ANA);
      const x = await ckPost(acao, token, corpoDe(t));
      ok(x.status !== 500, `${acao} com ${JSON.stringify(t).slice(0, 30)}: sem erro 500`, x.body);
      if (x.status < 300) aceitos.push([acao, t]);
    }
    const busca = await ckPost("buscar", pin(ANA), { ...sala(svF), q: t });
    ok(busca.status !== 500 && busca.status !== 200 || (busca.status === 200 && busca.body.criancas.length === 0), `buscar com ${JSON.stringify(t).slice(0, 30)}: sem 500 e sem resultado`, busca.body);
  }
  ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'CheckinInfantil%'")) === antesTabelas && (await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos")) > 0, "as tabelas do check-in continuam todas lá, e o histórico segue com as linhas (nenhum comando de apagar rodou)");
  const guardado = await q("SELECT VisitanteNome, TrouxeNome FROM CheckinInfantilRegistros WHERE VisitanteNome LIKE N'%''%' OR TrouxeNome LIKE N'%''%' OR VisitanteNome LIKE N'%<%' OR TrouxeNome LIKE N'%<%'");
  ok(guardado.every((x) => !/[<>]/.test((x.VisitanteNome || "") + (x.TrouxeNome || ""))), "texto com < ou > nunca foi guardado (nome com marcação é recusado); o apóstrofo, que é parte de nome de gente, entra e sai inteiro", guardado.slice(0, 3));
  r = await checkin(pin(ANA), svF, eq.maternal, [{ visitante: { nome: "Maria D'Ávila Ñandú", nascimento: H.nascimentoParaIdade(5) } }], trouxeLivre("João D'Arc Çelik")); anota(r);
  ok(r.status === 201 && (await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE VisitanteNome = N'Maria D''Ávila Ñandú' AND TrouxeNome = N'João D''Arc Çelik'")) === 1, "nome com apóstrofo e acentos entra e sai inteiro (sem escapar nem quebrar)", r.body);

  console.log("== o que as trilhas NÃO podem dizer: auditoria, avisos e logs ==");
  const auds = await q("SELECT Acao, DadosDepois, DadosAntes FROM AuditLog WHERE Acao LIKE 'CHECKIN%'");
  ok(auds.length > 10, "há trilha de auditoria do check-in", auds.length);
  const nomesDeCrianca = ["Bia", "Caio", "Duda", "Enzo", "Joana", "Visitante", "Heitor", "Silva", "Souza", "Estranho", "Tia "];
  ok(auds.every((a) => !nomesDeCrianca.some((n) => ((a.DadosDepois || "") + (a.DadosAntes || "")).includes(n)) && !/amendoim|alergia|asma|diabetes|telefone|\d{10,}/i.test((a.DadosDepois || "") + (a.DadosAntes || ""))), "a auditoria tem só ids e códigos de ato: nenhum nome de criança, nome de quem retirou, saúde, telefone ou código de retirada", auds.filter((a) => nomesDeCrianca.some((n) => ((a.DadosDepois || "") + (a.DadosAntes || "")).includes(n))).slice(0, 2));
  const evs = await q("SELECT Tipo, Detalhe FROM CheckinInfantilEventos WHERE Detalhe IS NOT NULL");
  ok(evs.every((e) => /^(adultos=\d+;criancas=\d+|tentativa=\d+\/\d+|erros=\d+|geracao=\d+|retirado pela liderança|[A-Z_]+;adultos=\d+;criancas=\d+|RESPONSAVEL|AUTORIZADO|TROUXE|OUTRO)$/.test(e.Detalhe)), "o histórico de atos só carrega números e códigos curtos no detalhe (nunca nome, código de retirada nem texto livre)", evs.filter((e) => !/^(adultos=\d+;criancas=\d+|tentativa=\d+\/\d+|erros=\d+|geracao=\d+|retirado pela liderança|[A-Z_]+;adultos=\d+;criancas=\d+|RESPONSAVEL|AUTORIZADO|TROUXE|OUTRO)$/.test(e.Detalhe)).slice(0, 3));
  const avs = await q("SELECT RegraChave, Mensagem FROM Notificacoes WHERE RegraChave LIKE 'CHECKIN%'");
  ok(avs.length > 0 && avs.filter((a) => (a.RegraChave === "CHECKIN_RETIRADA_DIVERGENTE" && /aguardando a sua aprovação/.test(a.Mensagem)) || a.RegraChave === "CHECKIN_SEM_RETIRADA").every((a) => !/Bia|Caio|Duda|Enzo|Joana|Visitante/.test(a.Mensagem)), "os avisos à liderança nunca levam nome de criança", avs.slice(0, 2));
  const logs = LOGS.join("\n");
  ok(!/Bia Silva|Caio Silva|Joana Silva|Duda Souza|Enzo Souza|Alice Mae|Claudia Mae|amendoim|11 ?98888/i.test(logs), "os logs não têm nome de criança, de responsável, saúde nem telefone", logs.slice(0, 200));

  console.log("== cabeçalhos e cache: tudo no-store ==");
  const respostasSemCache = [];
  for (const [acao, token, query] of [["catalogos", pin(CARLA), {}], ["minhas-salas", pin(CARLA), {}], ["sala", pin(CARLA), sala(svC)], ["historico", pin(P.alice), {}], ["saude", pin(P.alice), { menorId: K.bia }], ["autorizados", pin(P.alice), { menorId: K.bia }], ["sala", undefined, sala(svC)], ["sala", pin(P.everton), sala(svC)]]) {
    const x = await ckGet(acao, token, query); if (!x.headers || x.headers["Cache-Control"] !== "no-store") respostasSemCache.push(`GET ${acao} ${x.status}`);
  }
  for (const [acao, token, corpo] of [["checkin", pin(ANA), { ...sala(svF), criancas: [visitante("Visitante Cache Teste", 4)], trouxe: trouxeLivre("Tia Cache Teste") }], ["retirar", pin(ANA), { registroId: rFz, codigo: "ABCDEF", retirante: { ref: "TROUXE" } }], ["checkin", undefined, {}], ["checkin", pin(P.everton), {}]]) {
    const x = await ckPost(acao, token, corpo); anota(x); if (!x.headers || x.headers["Cache-Control"] !== "no-store") respostasSemCache.push(`POST ${acao} ${x.status}`);
  }
  ok(respostasSemCache.length === 0, "as respostas (inclusive as de erro e a que traz o código) são todas Cache-Control: no-store", respostasSemCache);

  fim("e2e-20-checkin-seguranca");
})().catch((e) => { H.erroFatal("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
