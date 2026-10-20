// e2e-19-checkin-fluxos.js — v7.10: os fluxos felizes e de borda do check-in infantil pelos HANDLERS REAIS (rota /api/checkin-infantil/<acao>) contra o SQL Server de verdade:
// abrir a sala e entrar com PIN, check-in (membro e visitante), a lotação e as regras da v7.7 na porta, a retirada com código (certa, errada, travada, divergente que exige a liderança,
// por autorizado, por quem trouxe, por indicado da visita), a segunda via com dois olhares, o telefone só para a liderança, a saúde só com o consentimento SAUDE_CRACHA (revogar APAGA),
// o histórico do responsável, a rotina diária (sem retirada, retenção) e o portão da EBD. Parte da base "cenario-checkin" (e2e-18).
process.env.CRON_SECRET = "segredo-cron-so-do-teste-e2e";
const H = require("./lib-checkin");
const { L, q, um, escalar, hoje, cenario, pin, gestao, semFator, LOGS, ckGet, ckPost, consGet, consPost, volPost, meusDados, rotinaDiaria, visitante, trouxeLivre, checkin, codigosDe, registrosDe, codigoErradoDe,
  textoDasTabelas, limpar, derrubarAptidao, restaurarAptidao, reg, eventos, notif, auditoria, falha, ckRegra, IP_PUBLICO } = H;
const { ok, fim, obterPool, LIDER, API, path } = L;
const C = cenario();
const { c1, c2, eq, pessoas: P, criancas: K } = C;
const CENTRAL = ["Central E2E"], VILA = ["Vila Nova E2E"];
const sec = () => gestao(C.secretaria.central, CENTRAL);             // a Secretaria da Central (liderança, com a permissão e a chave de acesso recente)
const secVila = () => gestao(C.secretaria.vila, VILA);
const secSemFator = () => semFator(C.secretaria.central, CENTRAL);
const ANA = 6010, BRUNO = 6011, CARLA = 6012, OLGA = 6024, MARIA = 6001;
const msg = (r) => (r.body && r.body.mensagem) || "";
const sala = (sv, e = eq.maternal) => ({ servicoId: sv, equipeId: e });
const retirar = (token, registroId, codigo, retirante) => ckPost("retirar", token, { registroId, codigo, retirante });
const salaDe = async (token, sv, e = eq.maternal) => (await ckGet("sala", token, sala(sv, e))).body;
const refsDe = async (token, sv, registroId, e = eq.maternal) => { const s = await salaDe(token, sv, e); const c = (s.criancas || []).find((x) => x.registroId === registroId); return c ? c.quemPodeRetirar : []; };
const doBanco = (id) => um("SELECT Situacao, Tentativas, Travado, CodigoGeracao, CodigoHash, RetiradoTipo, RetiradoMembroId, RetiradoNome, RetiradoPorOperadorId, Divergente, DivergenciaDecididaPorId, SaudeTexto, SaudeOrigem, TrouxeMembroId, TrouxeNome, TrouxeContato, IdadeForaDaFaixa, AnonimizadoEm, VisitanteNome FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: id });
const tiposDe = async (id) => (await eventos(id)).map((e) => e.Tipo);
const VISITANTES = (n, base = "Visitante") => Array.from({ length: n }, (_, i) => visitante(`${base} Numero${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))} Teste`, 4));

(async () => {
  const pool = await obterPool();
  let r, sv;

  // ====================================================================================================================================================
  console.log("== entrar na sala: serviço, janela, escala, aptidão ==");
  const svRasc = await H.servico(c1, { status: "RASCUNHO" }); await H.alocar(svRasc, eq.maternal, [ANA]);
  r = await ckPost("entrar-na-sala", pin(ANA), sala(svRasc)); ok(r.status === 422 && /não está publicado/.test(msg(r)), "serviço em rascunho: a sala não abre (422)", r.body);
  const svFuturo = await H.servico(c1, { minutos: 600 }); await H.alocar(svFuturo, eq.maternal, [ANA]);
  r = await ckPost("entrar-na-sala", pin(ANA), sala(svFuturo)); ok(r.status === 422 && /abre 60 minutos antes/.test(msg(r)), "serviço daqui a 10 horas: ainda não abriu (422)", r.body);
  const svPassado = await H.servico(c1, { minutos: -420 }); await H.alocar(svPassado, eq.maternal, [ANA]);
  r = await ckPost("entrar-na-sala", pin(ANA), sala(svPassado)); ok(r.status === 422 && /fechou/.test(msg(r)), "serviço de 7 horas atrás: a janela fechou (422)", r.body);
  sv = await H.servico(c1);
  await H.alocar(sv, eq.maternal, [ANA, BRUNO, 6013, 6014, 6020, 6015]);       // 6013 certidão vencida, 6014 sem treinamento, 6020 adolescente, 6015 sem a política aceita
  r = await ckPost("entrar-na-sala", pin(CARLA), sala(sv)); ok(r.status === 404, "quem não está escalado nem é o líder não entra: 404, a mesma resposta de 'sala que não existe' (a sala não vira sonda)", r.body);
  for (const [id, quem] of [[6013, "certidão vencida"], [6014, "sem treinamento"], [6015, "sem a política aceita"]]) {
    r = await ckPost("entrar-na-sala", pin(id), sala(sv)); ok(r.status === 403 && /não está apto/.test(msg(r)), `escalado mas inapto (${quem}): 403 com o motivo`, r.body);
  }
  r = await ckPost("entrar-na-sala", pin(6020), sala(sv)); ok(r.status === 403 && /Só adultos/.test(msg(r)), "o adolescente apto é auxiliar: não opera o check-in (403)", r.body);
  r = await ckPost("entrar-na-sala", undefined, sala(sv)); ok(r.status === 401, "sem sessão: 401", r.status);
  await H.alocar(sv, eq.recepcao, [ANA]);
  r = await ckPost("entrar-na-sala", pin(ANA), { servicoId: sv, equipeId: eq.recepcao }); ok(r.status === 422 && /contato com menores/.test(msg(r)), "equipe sem a marca 'contato com menores': 422", r.body);
  r = await ckPost("entrar-na-sala", pin(ANA), { servicoId: 99999999, equipeId: eq.maternal }); ok(r.status === 404, "serviço que não existe: 404", r.status);
  r = await ckPost("entrar-na-sala", pin(ANA), { servicoId: sv, equipeId: eq.infantilVila }); ok(r.status === 404, "equipe de OUTRA congregação com o serviço desta: 404", r.status);
  r = await ckPost("entrar-na-sala", pin(ANA), sala(sv)); ok(r.status === 201 && r.body.sucesso, "Ana (escalada e apta) entra na sala com a sessão de PIN (201)", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND MembroId = @m AND SaiuEm IS NULL", { s: sv, m: ANA })) === 1, "a presença dela está no banco");
  r = await ckPost("entrar-na-sala", pin(ANA), sala(sv)); ok(r.status === 201 && r.body.jaEstava === true, "entrar de novo: 'já estava' (sem linha nova)", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND MembroId = @m", { s: sv, m: ANA })) === 1, "continua uma presença só");
  r = await ckPost("entrar-na-sala", pin(MARIA), sala(sv)); ok(r.status === 201, "a líder da equipe (Maria, sem estar na escala) entra na sala", r.body);
  r = await ckPost("entrar-na-sala", pin(MARIA), { servicoId: sv, equipeId: eq.bercario }); ok(r.status === 422 && /em outra sala deste serviço/.test(msg(r)) && !r.body.jaEstava, "Maria, que lidera as duas equipes, NÃO entra na segunda sala do mesmo serviço, e a resposta diz o motivo (nunca 'você já está na sala')", [r.status, r.body]);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND MembroId = @m AND SaiuEm IS NULL", { s: sv, m: MARIA })) === 1, "e continua com uma presença só (na sala do maternal)");
  r = await ckGet("minhas-salas", pin(ANA)); const minha = r.status === 200 && r.body.salas.find((x) => x.servicoId === sv);
  ok(minha && minha.ehMinha && minha.voluntariosNaSala === 2 && minha.janela.aberta === true && !r.body.salas.some((x) => x.servicoId === svRasc), "minhas-salas: a de agora, com 2 voluntários e a janela aberta; o serviço em rascunho não aparece", r.body);
  r = await ckGet("minhas-salas", pin(CARLA)); ok(r.status === 200 && r.body.salas.length === 0, "quem não está escalado em nada vê zero salas", r.body);
  r = await ckGet("minhas-salas", sec()); ok(r.status === 200 && r.body.salas.some((s) => s.servicoId === sv && s.ehGestao) && !r.body.salas.some((s) => s.congregacaoId === c2), "a liderança vê as salas da sua congregação (ehGestao) e nenhuma de fora do escopo", r.body.salas && r.body.salas.length);
  r = await ckGet("catalogos", pin(CARLA)); ok(r.status === 200 && r.body.tentativas === 5 && r.body.janela.antesMinutos === 60 && r.body.janela.depoisHoras === 5 && r.body.papeis.gestao === false && /^[0-9a-f]{64}$/.test(r.body.textoSaude.hash), "catálogos: 5 tentativas, janela 60 min / 5 h, texto de saúde com hash; sem papel de gestão para o PIN", r.body);

  // ====================================================================================================================================================
  console.log("== a porta: dois adultos, faixa da sala, proporção ==");
  const svSolo = await H.servico(c1); await H.alocar(svSolo, eq.maternal, [ANA]);
  await ckPost("entrar-na-sala", pin(ANA), sala(svSolo));
  r = await checkin(pin(ANA), svSolo, eq.maternal, [visitante("Visitante Sozinho Teste", 4)], trouxeLivre()); ok(r.status === 422 && /nunca fica com um adulto só/.test(msg(r)), "com UM adulto na sala o check-in é recusado (regra dos dois adultos)", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE ServicoId = @s", { s: svSolo })) === 0, "e nada foi gravado em CheckinInfantilRegistros");
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo = 'SALA_RECUSOU_CHECKIN' AND Detalhe LIKE 'ADULTOS_INSUFICIENTES;adultos=1;criancas=0'", { s: svSolo })) === 1, "mas a recusa fica no histórico (SALA_RECUSOU_CHECKIN com os números)");
  await derrubarAptidao(ANA); r = await checkin(pin(ANA), svSolo, eq.maternal, [visitante("Visitante Sozinho Teste", 4)], trouxeLivre()); await restaurarAptidao(ANA);
  ok(r.status === 403 && /não está apto/.test(msg(r)), "Ana perdeu a habilitação no meio do serviço: o check-in é recusado na hora (aptidão reavaliada a cada ato)", r.body);
  const eqSemFaixa = (await q("INSERT INTO EscalasEquipes (Nome, CongregacaoId, LiderMembroId, ContatoComMenores, FaixaEtariaMenores) VALUES (N'Sala Sem Faixa E2E', @c, 6001, 1, NULL); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: c1 }))[0].id;
  const svSF = await H.abrirSala(c1, eqSemFaixa, [ANA, BRUNO]);
  r = await checkin(pin(ANA), svSF, eqSemFaixa, [visitante("Visitante Sem Faixa Teste", 4)], trouxeLivre()); ok(r.status === 422 && /não tem faixa etária/.test(msg(r)), "a equipe sem faixa etária definida: o check-in é recusado (não dá para conferir a proporção)", r.body);

  // ====================================================================================================================================================
  console.log("== check-in: a família, o código, o recibo ==");
  r = await ckPost("entrar-na-sala", pin(BRUNO), sala(sv)); ok(r.status === 201, "Bruno entra: Ana, Maria e Bruno = 3 adultos (cabem 15 crianças no maternal)", r.body);
  const mae = { responsavelId: P.alice };
  r = await checkin(pin(ANA), sv, eq.maternal, [{ menorId: K.bia }, { menorId: K.caio }], mae, { autorizadosVisita: [{ nome: "Tia Visita Teste", parentesco: "TIO" }] });
  ok(r.status === 201 && r.body.sucesso && r.body.etiquetas.length === 2 && r.body.recibo, "Alice deixa a Bia e o Caio: 201 com 2 etiquetas e o recibo", r.body);
  ok(r.headers && r.headers["Cache-Control"] === "no-store", "a resposta que traz o código é no-store", r.headers);
  const [codBia, codCaio] = codigosDe(r); const [regBia, regCaio] = registrosDe(r);
  ok(/^[A-HJKMNP-Z2-9]{6}$/.test(codBia) && /^[A-HJKMNP-Z2-9]{6}$/.test(codCaio) && codBia !== codCaio, "os códigos têm 6 símbolos do alfabeto sem 0/O/1/I/L e são diferentes", [codBia, codCaio]);
  ok(r.body.etiquetas[0].etiqueta.nome === "Bia E." && r.body.etiquetas[0].etiqueta.sala === "Maternal M7" && r.body.recibo.trouxe === "Alice Mae E2E" && r.body.recibo.criancas.length === 2, "etiqueta só com o primeiro nome e a inicial do último (nunca o nome inteiro); recibo com quem trouxe e os dois códigos", r.body);
  const rb = await doBanco(regBia);
  ok(rb.Situacao === "NA_SALA" && rb.CodigoGeracao === 1 && rb.Tentativas === 0 && rb.Travado === false && rb.TrouxeMembroId === P.alice && rb.IdadeForaDaFaixa === false, "no banco: na sala, geração 1, sem tentativas, trazida por Alice, dentro da faixa", rb);
  ok(rb.CodigoHash === ckRegra.hashCodigo(codBia, { registroId: regBia, geracao: 1, segredo: process.env.AUTH_SECRET }), "o que está gravado é o HMAC do código atado ao registro e à geração (e só ele)");
  ok(rb.CodigoHash !== ckRegra.hashCodigo(codBia, { registroId: regCaio, geracao: 1, segredo: process.env.AUTH_SECRET }), "o mesmo código em outro registro daria outro HMAC (atado ao registro)");
  ok((await um("SELECT EntreguePorMembroId a FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: regBia })).a === ANA, "quem entregou a criança (o voluntário que fez o check-in) está registrado: Ana");
  ok((await tiposDe(regBia)).join() === "CHECKIN" && (await um("SELECT Detalhe FROM CheckinInfantilEventos WHERE RegistroId = @r", { r: regBia })).Detalhe === "adultos=3;criancas=1", "evento CHECKIN com os números da sala", await eventos(regBia));
  const aud = await auditoria("CHECKIN_INFANTIL_ENTREGA");
  ok(aud.length === 2 && aud.every((a) => !/Bia|Caio|Silva|Alice/.test(a.DadosDepois || "")) && aud.every((a) => a.UsuarioId === ANA), "a auditoria tem só ids (nenhum nome de criança) e quem agiu", aud);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilAutorizadosVisita WHERE RegistroId IN (@a, @b)", { a: regBia, b: regCaio })) === 2, "o indicado da visita vale para cada criança do check-in");
  ok(!(await textoDasTabelas()).includes(codBia) && !(await textoDasTabelas()).includes(codCaio), "o texto do código NÃO está em nenhuma tabela do check-in, nem na auditoria nem nos avisos");
  ok(!LOGS.join("\n").includes(codBia) && !LOGS.join("\n").includes(codCaio), "e nunca foi para log");
  const textoResp = JSON.stringify((await ckGet("sala", pin(ANA), sala(sv))).body);
  ok(!textoResp.includes(codBia) && !textoResp.includes(rb.CodigoHash), "a tela da sala (que atualiza sozinha) NÃO traz o código nem o HMAC");

  console.log("== check-in: recusas de borda ==");
  const antes = await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros");
  r = await checkin(pin(ANA), sv, eq.maternal, [{ menorId: K.bia }], mae); ok(r.status === 422 && /já está numa sala/.test(msg(r)), "a Bia de novo, ainda na sala: 422 (uma sala por vez)", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ menorId: K.duda }, { menorId: K.bia }], { responsavelId: P.claudia }); ok(r.status === 422, "Duda + Bia (que já está na sala): o pedido todo cai", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE MenorMembroId = @m", { m: K.duda })) === 0, "e a Duda NÃO ficou gravada pela metade (a transação desfaz tudo)");
  r = await checkin(pin(ANA), sv, eq.maternal, [{ menorId: K.duda }, { menorId: K.duda }], { responsavelId: P.claudia }); ok(r.status === 422 && /duas vezes/.test(msg(r)), "a mesma criança duas vezes no pedido: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, VISITANTES(7), trouxeLivre()); ok(r.status === 422 && /até 6/.test(msg(r)), "7 crianças de uma vez: 422 (o teto é 6)", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [], mae); ok(r.status === 422, "nenhuma criança: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ menorId: K.fabio }], { responsavelId: P.alice }); ok(r.status === 422 && /não é responsável cadastrado/.test(msg(r)), "quem trouxe diz ser responsável do Fábio mas não é (cadastro da Secretaria): 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ menorId: K.enzo }], { responsavelId: P.alice }); ok(r.status === 422, "a Alice como responsável do Enzo (que é da Claudia): 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ menorId: K.heitorVila }], { responsavelId: P.irene }); ok(r.status === 422 && /não encontrada/.test(msg(r)), "criança de OUTRA congregação: 422 'não encontrada'", r.body);
  const msgNaoExiste = msg(await checkin(pin(ANA), sv, eq.maternal, [{ menorId: 99999999 }], mae)); ok(msgNaoExiste === msg(r), "criança que não existe: a MESMA mensagem da de outra congregação", msgNaoExiste);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ menorId: K.heitor }], mae); ok(r.status === 422 && /menos de 18/.test(msg(r)), "quem tem 18 anos não é criança: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ menorId: K.isa }], { nome: "Quem Trouxe Teste", parentesco: "TIO", documento: "RG" }); ok(r.status === 422 && /data de nascimento/.test(msg(r)), "membro sem data de nascimento: 422 com a instrução", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ menorId: BRUNO }], mae); ok(r.status === 422 && /menos de 18/.test(msg(r)), "um adulto como 'criança': 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [visitante("Visitante Sem Telefone Teste", 4)], { nome: "Tia Sem Fone", parentesco: "TIO", documento: "RG" }); ok(r.status === 422 && /telefone/.test(msg(r)), "visitante sem telefone de quem trouxe: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Teste Futuro", nascimento: "2999-01-01" } }], trouxeLivre()); ok(r.status === 422, "visitante com nascimento no futuro: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Adulto Disfarcado Teste", nascimento: H.nascimentoParaIdade(18) } }], trouxeLivre()); ok(r.status === 422, "visitante de 18 anos: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino <b>Teste</b>", nascimento: H.nascimentoParaIdade(4) } }], trouxeLivre()); ok(r.status === 422, "nome do visitante com marcação (< >): 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Teste Numero", nascimento: "2022-02-30" } }], trouxeLivre()); ok(r.status === 422, "data impossível: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "X", nascimento: H.nascimentoParaIdade(4) } }], trouxeLivre()); ok(r.status === 422, "nome de uma letra: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Teste Docs", nascimento: H.nascimentoParaIdade(4) } }], trouxeLivre("Tia Documento Ruim", { documento: "PASSAPORTE" })); ok(r.status === 422, "documento fora da lista: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Teste Tel", nascimento: H.nascimentoParaIdade(4) } }], trouxeLivre("Tia Telefone Ruim", { contato: "123" })); ok(r.status === 422, "telefone curto demais: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Teste Aut", nascimento: H.nascimentoParaIdade(4) } }], trouxeLivre(), { autorizadosVisita: Array.from({ length: 4 }, (_, i) => ({ nome: `Pessoa Indicada ${i}x`, parentesco: "TIO" })) }); ok(r.status === 422 && /no máximo 3/.test(msg(r)), "mais de 3 indicados da visita: 422", r.body);
  r = await checkin(pin(CARLA), sv, eq.maternal, [{ menorId: K.duda }], { responsavelId: P.claudia }); ok(r.status === 404, "quem não é da escala nem líder não faz check-in: 404 (a mesma resposta de 'sala que não existe')", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros")) === antes, "nenhuma dessas recusas gravou criança");

  console.log("== check-in: fora da faixa avisa, visitante, saúde do balcão ==");
  r = await checkin(pin(BRUNO), sv, eq.maternal, [{ menorId: K.duda }], { responsavelId: P.claudia }); ok(r.status === 201 && r.body.etiquetas[0].foraDaFaixa === true, "a Duda (2 anos, berçário) no maternal: entra e AVISA (foraDaFaixa), não impede", r.body);
  const regDuda = registrosDe(r)[0], codDuda = codigosDe(r)[0];
  ok((await doBanco(regDuda)).IdadeForaDaFaixa === true && (await um("SELECT EntreguePorMembroId a FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: regDuda })).a === BRUNO, "gravado como fora da faixa, entregue pelo Bruno");
  const catalogo = (await ckGet("catalogos", pin(ANA))).body.textoSaude;
  const nascV = H.nascimentoParaIdade(4);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Visitante Alergico", nascimento: nascV, saude: { texto: "Alergia a amendoim", concordo: true, textoHash: catalogo.hash } } }], trouxeLivre("Tia Visitante Silva", { contato: "(11) 98888-7777", parentesco: "MAE" }));
  ok(r.status === 201 && r.body.etiquetas[0].etiqueta.saude === "Alergia a amendoim" && r.body.recibo.trouxe === "Tia Visitante Silva", "visitante com saúde informada no balcão e o responsável presente concordando: 201 e a etiqueta leva a saúde", r.body);
  const regVisA = registrosDe(r)[0], codVisA = codigosDe(r)[0];
  const rv = await um("SELECT VisitanteNome, VisitanteNascimento, MenorMembroId, TrouxeNome, TrouxeContato, TrouxeDocumento, SaudeTexto, SaudeOrigem, SaudeTextoVersao, SaudeTextoHash FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: regVisA });
  ok(rv.MenorMembroId === null && rv.VisitanteNome === "Menino Visitante Alergico" && rv.TrouxeContato === "11988887777" && rv.SaudeOrigem === "BALCAO" && rv.SaudeTextoVersao === catalogo.versao && rv.SaudeTextoHash === catalogo.hash, "no banco: sem matrícula, telefone só em dígitos, saúde do BALCÃO com a versão e o hash do texto aceito", rv);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Sem Concordo", nascimento: nascV, saude: { texto: "Asma", concordo: false, textoHash: catalogo.hash } } }], trouxeLivre(undefined, { parentesco: "MAE" })); ok(r.status === 422 && /concordar/.test(msg(r)), "saúde sem a concordância do responsável presente: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Hash Velho", nascimento: nascV, saude: { texto: "Asma", concordo: true, textoHash: "0".repeat(64) } } }], trouxeLivre(undefined, { parentesco: "MAE" })); ok(r.status === 422 && r.body.termoMudou === true, "hash de outro texto de autorização: 422 com termoMudou", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Saude Marca", nascimento: nascV, saude: { texto: "<script>x</script>", concordo: true, textoHash: catalogo.hash } } }], trouxeLivre(undefined, { parentesco: "MAE" }));
  // Trava 7-B: a saúde do visitante só com a concordância do pai, da mãe ou do tutor(a) (LGPD art. 14, § 1º)
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Saude Do Tio", nascimento: nascV, saude: { texto: "Asma", concordo: true, textoHash: catalogo.hash } } }], trouxeLivre("Tio Que Trouxe Teste")); ok(r.status === 422 && /só pode ser autorizada pelo pai, pela mãe ou pelo tutor/.test(msg(r)) && (await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE VisitanteNome = N'Menino Saude Do Tio'")) === 0, "Trava 7-B: o tio que trouxe não autoriza a saúde do visitante: 422 e nada gravado", r.body); ok(r.status === 422, "texto de saúde com marcação: 422", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, [{ visitante: { nome: "Menino Visitante Alergico", nascimento: nascV } }], trouxeLivre("Outra Tia Visitante")); ok(r.status === 422 && /já está/i.test(msg(r)), "o MESMO visitante (nome e nascimento) de novo, ainda na sala: recusado (senão a criança teria dois códigos e uma ficaria 'na sala' para sempre)", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE VisitanteNome = N'Menino Visitante Alergico'")) === 1, "e só há UM registro dele");

  console.log("== lotação: cabem 5 por adulto no maternal; a sala cheia recusa o pedido INTEIRO ==");
  let s = await salaDe(pin(ANA), sv);
  ok(s.lotacao.adultos === 3 && s.lotacao.capacidade === 15 && s.lotacao.criancasPorAdulto === 5 && s.totais.naSala === 4 && s.lotacao.vagas === 11, "a sala mostra 3 adultos, capacidade 15, 4 crianças e 11 vagas", s.lotacao);
  r = await checkin(pin(ANA), sv, eq.maternal, VISITANTES(6, "Lote"), trouxeLivre()); ok(r.status === 201, "6 visitantes entram (vagas 11 → 5)", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, VISITANTES(6, "Excesso"), trouxeLivre("Tia Excesso Teste")); ok(r.status === 422 && /no limite/.test(msg(r)) && r.body.lotacao.problemas[0].codigo === "SALA_CHEIA", "mais 6 passariam do limite (4+6+6 > 15): recusado inteiro (SALA_CHEIA)", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE VisitanteNome LIKE N'Excesso%' OR VisitanteNome LIKE N'Visitante NumeroA%Excesso%'")) === 0, "nenhuma criança do pedido recusado ficou gravada");
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo = 'SALA_RECUSOU_CHECKIN' AND Detalhe LIKE 'SALA_CHEIA;adultos=3;criancas=10'", { s: sv })) === 1, "a recusa por sala cheia está no histórico com os números");
  r = await checkin(pin(ANA), sv, eq.maternal, VISITANTES(5, "Fecha"), trouxeLivre("Tia Fecha Teste")); ok(r.status === 201, "5 vagas, 5 crianças: a sala fecha exatamente na capacidade (15)", r.body);
  r = await checkin(pin(ANA), sv, eq.maternal, VISITANTES(1, "Dezesseis"), trouxeLivre("Tia Dezesseis Teste")); ok(r.status === 422, "a 16ª criança: recusada", r.body);
  r = await ckPost("entrar-na-sala", pin(OLGA), sala(sv)); ok(r.status === 404, "Olga ainda não está na escala: não entra (404, como 'não existe')", r.body);
  await H.alocar(sv, eq.maternal, [OLGA]);
  r = await ckPost("entrar-na-sala", pin(OLGA), sala(sv)); ok(r.status === 201, "Olga é escalada e entra (4 adultos = capacidade 20)", r.body);
  r = await checkin(pin(OLGA), sv, eq.maternal, VISITANTES(1, "Dezesseis"), trouxeLivre("Tia Dezesseis Teste")); ok(r.status === 201, "com o quarto adulto a 16ª criança entra", r.body);
  r = await ckPost("sair-da-sala", pin(OLGA), sala(sv)); ok(r.status === 422 && /proporção/.test(msg(r)), "e a Olga não sai: restariam 3 adultos para 16 crianças (cabem 15)", [r.status, msg(r)]);
  await limpar();

  console.log("== sair da sala: nunca deixa criança com menos de dois adultos, nem fora da proporção ==");
  const svS = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO]);
  r = await ckPost("sair-da-sala", pin(ANA), sala(svS)); ok(r.status === 200, "sala vazia de crianças: o voluntário sai", r.body);
  await ckPost("entrar-na-sala", pin(ANA), sala(svS));
  r = await checkin(pin(ANA), svS, eq.maternal, [visitante("Crianca Que Prende Teste", 4)], trouxeLivre()); ok(r.status === 201, "uma criança entra (2 adultos)", r.body);
  r = await ckPost("sair-da-sala", pin(ANA), sala(svS)); ok(r.status === 422 && /ficaria com 1 adulto/.test(msg(r)), "com criança na sala e só 2 adultos, ninguém sai (ficaria com 1)", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND SaiuEm IS NULL", { s: svS })) === 2, "e os dois continuam na sala");
  r = await ckPost("sair-da-sala", pin(BRUNO), { ...sala(svS), membroId: ANA }); ok(r.status === 403, "um voluntário comum não tira outro da sala (só a liderança): 403", r.body);
  r = await ckPost("sair-da-sala", sec(), { ...sala(svS), membroId: ANA }); ok(r.status === 422, "a liderança também não deixa a sala com criança e menos de 2 adultos: 422", r.body);
  await ckPost("entrar-na-sala", pin(MARIA), sala(svS));
  r = await ckPost("sair-da-sala", pin(ANA), sala(svS)); ok(r.status === 200, "com um terceiro adulto, a Ana sai", r.body);
  r = await ckPost("sair-da-sala", pin(ANA), sala(svS)); ok(r.status === 422 && /não está na sala/.test(msg(r)), "quem é da sala mas já saiu não sai de novo: 422", r.body);
  r = await ckPost("sair-da-sala", pin(CARLA), sala(svS)); ok(r.status === 404, "quem não tem relação nenhuma com a sala (Carla, que não está nela) recebe a resposta de 'não existe': 404", r.body);
  r = await ckPost("sair-da-sala", sec(), { ...sala(svS), membroId: BRUNO }); ok(r.status === 422, "tirar o Bruno deixaria 1 adulto: 422 mesmo para a liderança", r.body);
  await limpar();
  await ckPost("entrar-na-sala", pin(BRUNO), sala(svS));                    // (a limpeza fecha também a presença de todos: Bruno volta, para a liderança tirá-lo)
  r = await ckPost("sair-da-sala", sec(), { ...sala(svS), membroId: BRUNO }); ok(r.status === 200, "sem criança na sala, a liderança tira quem esqueceu de sair", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilEventos WHERE ServicoId = @s AND Tipo = 'VOLUNTARIO_SAIU' AND Detalhe = N'retirado pela liderança' AND AtorMembroId = @a", { s: svS, a: C.secretaria.central })) === 1, "o histórico diz que foi a liderança (e quem)");
  r = await ckPost("sair-da-sala", sec(), { ...sala(svS), membroId: 7010 }); ok(r.status === 422, "a liderança 'tirando' alguém que não está na sala: 422", r.body);

  // ====================================================================================================================================================
  console.log("== retirada: o código, quem está na lista, e o que NÃO gasta tentativa ==");
  await limpar();
  const svR = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);                // 3 adultos: cabem 15
  r = await ckPost("autorizado-adicionar", pin(P.claudia), { menorId: K.duda, nome: "Dina Avo E2E", parentesco: "AVO", membroId: P.dina }); ok(r.status === 201 && r.body.autorizadoId, "Claudia (mãe, responsável cadastrada) autoriza a avó Dina a retirar a Duda (201)", r.body);
  const autDina = r.body.autorizadoId;
  r = await ckPost("autorizado-adicionar", pin(P.claudia), { menorId: K.enzo, nome: "Dina Avo E2E", parentesco: "AVO", membroId: P.dina }); const autDinaEnzo = r.body.autorizadoId; ok(r.status === 201, "e também a retirar o Enzo", r.body);
  const resFam = await checkin(pin(ANA), svR, eq.maternal, [{ menorId: K.bia }, { menorId: K.caio }, { menorId: K.joana }], mae, { autorizadosVisita: [{ nome: "Tia Visita Teste", parentesco: "TIO" }] });
  ok(resFam.status === 201, "check-in da família Silva (Bia, Caio, Joana) com uma indicada só desta visita", resFam.body);
  const [cBia, cCaio, cJoana] = codigosDe(resFam); const [rBia, rCaio, rJoana] = registrosDe(resFam);
  r = await checkin(pin(ANA), svR, eq.maternal, [{ menorId: K.duda }], { responsavelId: P.claudia }); const cDuda = codigosDe(r)[0], rDuda = registrosDe(r)[0];
  r = await checkin(pin(BRUNO), svR, eq.maternal, [{ menorId: K.enzo }], { responsavelId: P.claudia }); const cEnzo = codigosDe(r)[0], rEnzo = registrosDe(r)[0];
  r = await checkin(pin(CARLA), svR, eq.maternal, [{ menorId: K.fabio }], { nome: "Vizinho Que Trouxe Teste", parentesco: "AMIGO_FAMILIA", documento: "CNH", contato: "11 97777-6666" }); ok(r.status === 201, "o Fábio (sem responsável cadastrado) é deixado por um vizinho registrado na hora", r.body);
  const cFabio = codigosDe(r)[0], rFabio = registrosDe(r)[0];
  r = await checkin(pin(ANA), svR, eq.maternal, [{ menorId: K.gabi }], mae); const cGabi = codigosDe(r)[0], rGabi = registrosDe(r)[0]; ok(r.status === 201, "a Gabi (17 anos, tutelada pela Alice) entra: fora da faixa só avisa", r.body);
  const R = (id, cod, retirante, token = pin(ANA)) => retirar(token, id, cod, retirante);

  r = await R(rBia, codigoErradoDe(cBia), { ref: `RESP:${P.alice}` }); ok(r.status === 422 && r.body.codigoErrado === true && r.body.tentativasRestantes === 4 && /Restam 4/.test(msg(r)), "código errado: 422 e 'restam 4 tentativas'", r.body);
  ok((await doBanco(rBia)).Tentativas === 1 && (await tiposDe(rBia)).join() === "CHECKIN,CODIGO_ERRADO", "uma tentativa gasta e o erro entra no histórico");
  ok((await um("SELECT Detalhe, AtorMembroId FROM CheckinInfantilEventos WHERE RegistroId = @r AND Tipo = 'CODIGO_ERRADO'", { r: rBia })).Detalhe === "tentativa=1/5", "o histórico diz 'tentativa=1/5' e nunca o código digitado");
  for (const ruim of ["ABC", "", "   ", "ABCDE0", "ABCDEL", "ABCDEFG", "AB CD", "<b>ABCD", "ÀBCDEF", null, 123456, ["ABCDEF"], { a: 1 }]) {
    r = await R(rBia, ruim, { ref: `RESP:${P.alice}` }); ok(r.status === 422 && !r.body.codigoErrado, `código malformado ${JSON.stringify(ruim)}: 422 sem gastar tentativa`, r.body);
  }
  ok((await doBanco(rBia)).Tentativas === 1, "nenhum código malformado gastou tentativa (continua 1)");
  r = await R(rBia, cBia, { ref: `RESP:${P.everton}` }); ok(r.status === 422 && /não está na lista/.test(msg(r)), "o código está certo mas Everton (conhecido, fora da lista): 422 'não está na lista' (para o 'outra pessoa' é outro caminho)", r.body);
  for (const ruim of ["XYZ", "RESP:", "RESP:abc", "RESP:0", "AUT:99999999", "VIS:99999999", "TROUXE2", 7, { x: 1 }, [`RESP:${P.alice}`]]) {
    r = await R(rBia, cBia, { ref: ruim }); ok(r.status === 422, `ref ${JSON.stringify(ruim)}: 422`, r.body);
  }
  r = await R(rBia, cBia, { outro: { nome: "Fulano Sem Documento", parentesco: "OUTRO" } }); ok(r.status === 422, "'outra pessoa' sem o documento conferido: 422", r.body);
  r = await R(rBia, cBia, { ref: `RESP:${P.alice}`, outro: { nome: "Fulano De Tal", parentesco: "OUTRO", documento: "RG" } }); ok(r.status === 422, "alguém da lista E 'outra pessoa' ao mesmo tempo: 422", r.body);
  r = await ckPost("retirar", pin(ANA), { registroId: rBia, codigo: cBia }); ok(r.status === 422, "sem dizer quem retira: 422", r.body);
  ok((await doBanco(rBia)).Tentativas === 1, "e nada disso gastou tentativa nem retirou a criança");
  r = await R(rBia, ` ${cBia.slice(0, 3).toLowerCase()}-${cBia.slice(3).toLowerCase()} `, { ref: `RESP:${P.bernardo}` }); ok(r.status === 200 && r.body.retirada === true, "código certo (digitado em minúsculas, com hífen e espaços) + o pai Bernardo, que não trouxe mas é responsável cadastrado: a criança sai (200)", r.body);
  let b = await doBanco(rBia);
  ok(b.Situacao === "RETIRADA" && b.RetiradoTipo === "RESPONSAVEL" && b.RetiradoMembroId === P.bernardo && b.RetiradoPorOperadorId === ANA && b.Tentativas === 0 && b.Divergente === false, "no banco: retirada por RESPONSAVEL 7102, registrada por Ana, tentativas zeradas, não divergente", b);
  ok((await tiposDe(rBia)).join() === "CHECKIN,CODIGO_ERRADO,RETIRADA" && (await auditoria("CHECKIN_INFANTIL_RETIRADA")).length === 1, "histórico: entrega, erro, retirada; a auditoria tem uma retirada");
  r = await R(rBia, cBia, { ref: `RESP:${P.alice}` }); ok(r.status === 422 && /já foi retirada/.test(msg(r)), "retirar de novo a que já saiu: 422", r.body);
  r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: rBia, pessoa: { ref: `RESP:${P.alice}` }, documento: "RG" }); ok(r.status === 422 && /já foi retirada/.test(msg(r)), "segunda via de criança retirada: 422", r.body);
  r = await R(rCaio, cCaio, { ref: "TROUXE" }); ok(r.status === 200, "quem trouxe a criança (Alice) retira o Caio com o código (ref TROUXE)", r.body);
  b = await doBanco(rCaio); ok(b.RetiradoTipo === "TROUXE" && b.RetiradoMembroId === P.alice, "registrado como TROUXE, com a matrícula da Alice", b);
  const refsJoana = await refsDe(pin(ANA), svR, rJoana); const visJoana = refsJoana.find((x) => x.ref.startsWith("VIS:"));
  ok(refsJoana.some((x) => x.ref === `RESP:${P.alice}`) && !!visJoana && visJoana.rotulo.includes("só esta visita") && refsJoana.some((x) => x.ref === "TROUXE"), "quem pode retirar a Joana: a mãe, a indicada da visita (com o rótulo) e quem trouxe", refsJoana);
  r = await R(rJoana, cJoana, { ref: visJoana.ref }); ok(r.status === 200, "a indicada da visita retira a Joana com o código", r.body);
  b = await doBanco(rJoana); ok(b.RetiradoTipo === "AUTORIZADO" && b.RetiradoMembroId === null && b.RetiradoNome === "Tia Visita Teste", "registrada como AUTORIZADO, pelo nome (sem matrícula)", b);
  r = await R(rDuda, cDuda, { ref: `AUT:${autDina}` }); ok(r.status === 200, "a avó Dina (autorizada pela mãe no sistema) retira a Duda com o código", r.body);
  b = await doBanco(rDuda); ok(b.RetiradoTipo === "AUTORIZADO" && b.RetiradoMembroId === P.dina, "registrada como AUTORIZADO com a matrícula 7104", b);

  console.log("== autorizados: revogar, vencer, limites e quem NÃO pode autorizar ==");
  const aut = (token, corpo) => ckPost("autorizado-adicionar", token, { menorId: K.bia, nome: "Dina Avo E2E", parentesco: "AVO", ...corpo });
  r = await aut(pin(P.dina), {}); ok(r.status === 403, "a própria avó não se autoriza (não é responsável cadastrada da Bia): 403", r.body);
  r = await aut(pin(P.everton), {}); ok(r.status === 403, "um conhecido não autoriza ninguém: 403", r.body);
  r = await aut(pin(P.claudia), {}); ok(r.status === 403, "a Claudia (responsável de OUTRAS crianças) não autoriza para a Bia: 403", r.body);
  const msg403Real = msg(r); r = await aut(pin(P.claudia), { menorId: 99999999 }); ok(r.status === 403 && msg(r) === msg403Real, "criança que não existe: o MESMO 403 (não diz quem existe)", r.body);
  r = await aut(pin(P.alice), { menorId: K.heitor }); ok(r.status === 403, "criança que já é maior de idade: 403 (a lista é só de menores)", r.body);
  r = await aut(pin(P.alice), { ficha: true, referencia: "Pasta 1" }); ok(r.status === 403, "o responsável não registra 'ficha física' (isso é da Secretaria): 403", r.body);
  r = await aut(secVila(), { ficha: true, referencia: "Pasta 1" }); ok(r.status === 403, "a Secretaria da Vila não mexe em criança da Central: 403", r.body);
  r = await aut(sec(), { ficha: true }); ok(r.status === 422 && /referência da ficha/.test(msg(r)), "ficha física sem a referência de onde está arquivada: 422", r.body);
  r = await aut(pin(P.alice), { membroId: P.gustavo }); ok(r.status === 422 && /maiores de 18/.test(msg(r)), "um adolescente de 17 anos não pode ser autorizado: 422", r.body);
  r = await aut(pin(P.alice), { membroId: K.bia }); ok(r.status === 422, "a criança não autoriza a si mesma: 422", r.body);
  r = await aut(pin(P.alice), { validoAte: "2020-01-01" }); ok(r.status === 422 && /já passou/.test(msg(r)), "validade no passado: 422", r.body);
  r = await aut(pin(P.alice), { nome: "<b>Dina</b>" }); ok(r.status === 422, "nome com marcação: 422", r.body);
  r = await aut(pin(P.alice), { parentesco: "VIZINHO" }); ok(r.status === 422, "parentesco fora da lista: 422", r.body);
  r = await aut(pin(P.alice), { membroId: P.dina }); ok(r.status === 201, "a Alice autoriza a Dina (membro) para a Bia: 201", r.body); const autBia = r.body.autorizadoId;
  r = await aut(pin(P.alice), { membroId: P.dina }); ok(r.status === 422 && /já está na lista/.test(msg(r)), "a mesma Dina de novo: 422 (índice único)", r.body);
  r = await aut(sec(), { nome: "Tio Everton Autorizado", parentesco: "TIO", membroId: P.everton, ficha: true, referencia: "Pasta 4, ficha 12" }); ok(r.status === 201, "a Secretaria registra a ficha assinada do Everton: 201", r.body); const autEverton = r.body.autorizadoId;
  ok((await um("SELECT Forma, Referencia, RegistradoPorMembroId FROM CheckinInfantilAutorizados WHERE AutorizadoId = @a", { a: autEverton })).Forma === "FICHA_FISICA", "gravada como FICHA_FISICA, com a referência e quem registrou");
  r = await ckGet("autorizados", pin(P.alice), { menorId: K.bia }); ok(r.status === 200 && r.body.autorizados.length === 2 && r.body.responsaveis.length === 2 && r.body.limite === 8, "a lista da Bia: 2 autorizados, 2 responsáveis cadastrados, limite 8", r.body);
  r = await ckGet("autorizados", pin(P.dina), { menorId: K.bia }); ok(r.status === 403, "a avó não lê a lista da Bia: 403", r.body);
  r = await ckGet("autorizados", sec(), { menorId: K.bia }); ok(r.status === 200, "a Secretaria da Central lê", r.body);
  r = await ckGet("autorizados", secVila(), { menorId: K.bia }); ok(r.status === 403, "a da Vila não lê: 403", r.body);
  for (let i = 0; i < 6; i++) await aut(pin(P.alice), { nome: `Pessoa Autorizada Numero ${String.fromCharCode(65 + i)}x` });
  r = await aut(pin(P.alice), { nome: "Pessoa Que Estoura Limite" }); ok(r.status === 422 && /até 8/.test(msg(r)), "o nono autorizado: 422 (limite de 8 por criança)", r.body);
  r = await ckPost("autorizado-revogar", pin(P.dina), { autorizadoId: autBia }); ok(r.status === 403, "a própria autorizada não revoga a sua autorização: 403", r.body);
  r = await ckPost("autorizado-revogar", secVila(), { autorizadoId: autBia }); ok(r.status === 403, "a Secretaria da Vila não revoga: 403", r.body);
  r = await ckPost("autorizado-revogar", pin(P.alice), { autorizadoId: 99999999 }); ok(r.status === 403 && msg(r) === msg403Real, "autorização que não existe: o MESMO 403", r.body);
  r = await ckPost("autorizado-revogar", pin(P.bernardo), { autorizadoId: autBia }); ok(r.status === 200, "o pai Bernardo (também responsável) revoga a Dina: 200", r.body);
  ok((await um("SELECT RevogadoPorMembroId AS por FROM CheckinInfantilAutorizados WHERE AutorizadoId = @a", { a: autBia })).por === P.bernardo, "o banco diz quem revogou");
  r = await ckPost("autorizado-revogar", pin(P.bernardo), { autorizadoId: autBia }); ok(r.status === 200 && r.body.jaRevogado === true, "revogar de novo: 'já estava revogada'", r.body);
  // a Bia volta numa segunda visita; a Dina revogada não está mais entre quem pode retirar, e o Everton (ficha) e uma nova autorização vencida também não
  r = await aut(pin(P.alice), { membroId: P.dina, validoAte: hoje }); ok(r.status === 201, "a Alice autoriza a Dina de novo, com validade até hoje: 201 (é outra linha)", r.body); const autDinaHoje = r.body.autorizadoId;
  r = await checkin(pin(ANA), svR, eq.maternal, [{ menorId: K.bia }], mae); ok(r.status === 201, "a Bia vem de novo (segunda visita)", r.body);
  const cBia2 = codigosDe(r)[0], rBia2 = registrosDe(r)[0];
  const refsBia2 = await refsDe(pin(ANA), svR, rBia2);
  ok(!refsBia2.some((x) => x.ref === `AUT:${autBia}`) && refsBia2.some((x) => x.ref === `AUT:${autDinaHoje}`) && refsBia2.some((x) => x.ref === `AUT:${autEverton}`), "quem pode retirar a Bia agora: a Dina com validade de hoje e o Everton (ficha); a autorização revogada saiu", refsBia2);
  r = await R(rBia2, cBia2, { ref: `AUT:${autBia}` }); ok(r.status === 422 && /não está na lista/.test(msg(r)), "a autorização REVOGADA não retira (nem com o código certo): 422", r.body);
  await q("UPDATE CheckinInfantilAutorizados SET ValidoAte = DATEADD(DAY, -1, CAST(SYSUTCDATETIME() AS DATE)) WHERE AutorizadoId = @a", { a: autDinaHoje });
  r = await R(rBia2, cBia2, { ref: `AUT:${autDinaHoje}` }); ok(r.status === 422 && /não está na lista/.test(msg(r)), "a autorização VENCIDA (ontem) não retira: 422", r.body);
  ok((await doBanco(rBia2)).Tentativas === 0, "(e nada disso gastou tentativa de código)");
  r = await R(rBia2, cBia2, { ref: `AUT:${autEverton}` }); ok(r.status === 200, "o Everton (autorizado por ficha da Secretaria) retira a Bia com o código: 200", r.body);
  ok((await doBanco(rBia2)).RetiradoMembroId === P.everton, "registrado com a matrícula do Everton");

  console.log("== retirada divergente: só com o código E a liderança ==");
  r = await R(rEnzo, codigoErradoDe(cEnzo), { outro: { nome: "Fulano Estranho Teste", parentesco: "OUTRO", documento: "RG" } }); ok(r.status === 422 && r.body.codigoErrado, "'outra pessoa' SEM o código certo: só gasta tentativa (nunca chega à liderança)", r.body);
  ok((await doBanco(rEnzo)).Situacao === "NA_SALA" && (await doBanco(rEnzo)).Tentativas === 1, "o Enzo continua na sala, uma tentativa gasta");
  r = await R(rEnzo, cEnzo, { outro: { nome: "Fulano Estranho Teste", parentesco: "OUTRO", documento: "RG" } }); ok(r.status === 200 && r.body.divergente === true && r.body.aguardaLideranca === true && !r.body.retirada, "código certo + 'outra pessoa': NÃO sai — fica aguardando a liderança", r.body);
  b = await doBanco(rEnzo);
  ok(b.Situacao === "RETIRADA_PENDENTE" && b.Divergente === true && b.RetiradoNome === "Fulano Estranho Teste" && b.RetiradoPorOperadorId === ANA && b.Tentativas === 0, "no banco: RETIRADA_PENDENTE, divergente, com o nome de quem pediu e o voluntário que registrou", b);
  ok((await um("SELECT RetiradoEm FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: rEnzo })).RetiradoEm === null, "e SEM horário de retirada (a criança segue na sala)");
  const avisos = await notif("CHECKIN_RETIRADA_DIVERGENTE"); const dest = avisos.map((a) => a.d);
  ok(dest.includes(P.claudia) && dest.includes(C.secretaria.central) && dest.includes(MARIA) && dest.includes(1001) && !dest.includes(P.alice) && !dest.includes(C.secretaria.vila), "avisados na hora: a mãe do Enzo, a liderança da Central, a líder da sala e a Diretoria; nem a Alice nem a Secretaria da Vila", dest);
  const avMae = avisos.find((a) => a.d === P.claudia), avSec = avisos.find((a) => a.d === C.secretaria.central);
  ok(/Enzo/.test(avMae.m) && !/Souza|Fulano|Estranho/.test(avMae.m) && !/Enzo|Souza/.test(avSec.m) && !new RegExp(cEnzo).test(avMae.m + avSec.m), "o aviso à mãe leva só o primeiro nome da criança; o da liderança nunca leva nome de criança; nenhum leva código nem o nome do estranho");
  ok(avisos.every((a) => a.t === "CheckinInfantilEventos"), "a referência dos avisos é o evento (um fato, um aviso)");
  r = await R(rEnzo, cEnzo, { ref: `RESP:${P.claudia}` }); ok(r.status === 422 && /aguardando a aprovação/.test(msg(r)), "enquanto aguarda, ninguém mais retira a criança (nem a mãe): 422", r.body);
  r = await ckPost("segunda-via-pedir", pin(ANA), { registroId: rEnzo, pessoa: { ref: `RESP:${P.claudia}` }, documento: "RG" }); ok(r.status === 422, "nem se pede segunda via dela: 422", r.body);
  let sl = await salaDe(pin(ANA), svR); const cEnzoTela = sl.criancas.find((x) => x.registroId === rEnzo);
  ok(cEnzoTela.situacao === "RETIRADA_PENDENTE" && cEnzoTela.divergencia.quem.nome === "Fulano Estranho Teste" && sl.pendencias.divergencias === 1, "a tela da sala mostra a divergência pendente (quem pediu) e conta 1 pendência", cEnzoTela.divergencia);
  const decidir = (token, corpo) => ckPost("decidir-divergencia", token, { registroId: rEnzo, aprovar: true, motivo: "Confirmei com a mãe pelo telefone cadastrado.", ...corpo });
  r = await decidir(undefined, {}); ok(r.status === 401, "decidir sem sessão: 401", r.status);
  r = await decidir(pin(ANA), {}); ok(r.status === 403, "um voluntário comum (PIN) não decide: 403", r.body);
  r = await decidir(pin(C.secretaria.central), {}); ok(r.status === 403, "nem a própria Secretaria entrando por PIN (precisa da sessão de liderança): 403", r.body);
  r = await decidir(secSemFator(), {}); ok(r.status === 428 && r.body.precisaFator === true, "liderança sem a confirmação recente (chave de acesso ou código): 428", r.body);
  r = await decidir(secVila(), {}); ok(r.status === 404, "liderança de OUTRA congregação: 404 (a mesma resposta de 'não existe')", r.body);
  r = await decidir(sec(), { registroId: 99999999 }); ok(r.status === 404, "registro que não existe: 404", r.body);
  r = await decidir(sec(), { motivo: "curto" }); ok(r.status === 422, "motivo curto demais (menos de 8 letras): 422", r.body);
  r = await decidir(sec(), { aprovar: "sim" }); ok(r.status === 422, "aprovar que não é booleano: 422", r.body);
  ok((await doBanco(rEnzo)).Situacao === "RETIRADA_PENDENTE", "nenhuma dessas tentativas decidiu nada");
  r = await decidir(sec(), {}); ok(r.status === 200 && r.body.aprovada === true, "a Secretaria da Central (com a chave recente) aprova: 200", r.body);
  b = await doBanco(rEnzo);
  ok(b.Situacao === "RETIRADA" && b.RetiradoNome === "Fulano Estranho Teste" && b.DivergenciaDecididaPorId === C.secretaria.central && b.Divergente === true && b.RetiradoPorOperadorId === ANA, "no banco: RETIRADA, ainda marcada divergente, quem decidiu (Secretaria) e quem registrou (Ana)", b);
  ok((await um("SELECT DivergenciaMotivo m FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: rEnzo })).m === "Confirmei com a mãe pelo telefone cadastrado.", "o motivo da liderança está guardado");
  ok((await tiposDe(rEnzo)).join() === "CHECKIN,CODIGO_ERRADO,RETIRADA_DIVERGENTE_PEDIDA,RETIRADA_DIVERGENTE_APROVADA", "histórico completo: entrega, erro, pedido, aprovação", await tiposDe(rEnzo));
  r = await decidir(sec(), {}); ok(r.status === 409, "decidir de novo (já decidida): 409", r.body);
  // a negativa
  r = await R(rFabio, cFabio, { outro: { nome: "Estranho Que Sera Negado", parentesco: "AMIGO_FAMILIA", documento: "CNH" } }); ok(r.status === 200 && r.body.divergente, "Fábio: outro pedido divergente", r.body);
  const negar = (token, extra = {}) => ckPost("decidir-divergencia", token, { registroId: rFabio, aprovar: false, motivo: "Não consegui falar com o responsável.", ...extra });
  r = await negar(sec()); ok(r.status === 200 && r.body.negada === true, "a liderança NEGA: 200", r.body);
  b = await doBanco(rFabio);
  ok(b.Situacao === "NA_SALA" && b.Divergente === false && b.RetiradoNome === null && b.DivergenciaDecididaPorId === C.secretaria.central, "a criança volta a 'na sala', sem o pedido, e fica quem negou", b);
  ok((await tiposDe(rFabio)).join() === "CHECKIN,RETIRADA_DIVERGENTE_PEDIDA,RETIRADA_DIVERGENTE_NEGADA", "o histórico guarda o pedido e a negativa", await tiposDe(rFabio));
  r = await R(rFabio, cFabio, { ref: "TROUXE" }); ok(r.status === 200 && (await doBanco(rFabio)).RetiradoTipo === "TROUXE", "depois da negativa, o vizinho que TROUXE o Fábio retira com o código", r.body);
  // quem registrou o pedido não decide sobre ele (a líder tem a permissão e também opera a sala)
  const rGabiDiv = rGabi;
  r = await ckPost("entrar-na-sala", pin(MARIA), sala(svR)); ok(r.status === 201, "a líder Maria entra na sala do serviço (ela também opera)", r.body);
  r = await R(rGabiDiv, cGabi, { outro: { nome: "Estranho Para A Lider Teste", parentesco: "OUTRO", documento: "RG" } }, LIDER(MARIA, ["habilitacao_voluntarios"], CENTRAL)); ok(r.status === 200 && r.body.divergente, "a líder Maria (com a permissão de gestão) registra o pedido divergente da Gabi", r.body);
  r = await ckPost("decidir-divergencia", LIDER(MARIA, ["habilitacao_voluntarios"], CENTRAL), { registroId: rGabiDiv, aprovar: true, motivo: "Eu mesma aprovo o que registrei." }); ok(r.status === 403 && /não decide sobre ele/.test(msg(r)), "quem registrou o pedido NÃO decide sobre ele (403), mesmo sendo da liderança", r.body);
  r = await ckPost("decidir-divergencia", H.geral(1001), { registroId: rGabiDiv, aprovar: false, motivo: "Negado pela Diretoria, sem confirmação." }); ok(r.status === 200, "a Diretoria (nível geral) decide: 200", r.body);

  // ====================================================================================================================================================
  console.log("== o código errado 5 vezes trava a criança; só a liderança destrava (ou a segunda via) ==");
  const visTrava = async (nome, trouxe = "Tia Travada Silva") => { const x = await checkin(pin(ANA), svR, eq.maternal, [visitante(nome, 4)], trouxeLivre(trouxe)); if (x.status !== 201) throw new Error("check-in de " + nome + ": " + JSON.stringify(x.body)); return { reg: registrosDe(x)[0], cod: codigosDe(x)[0] }; };
  const V1 = await visTrava("Visitante Travado Um Teste");
  for (let i = 1; i <= 4; i++) { r = await R(V1.reg, codigoErradoDe(V1.cod), { ref: "TROUXE" }); ok(r.status === 422 && r.body.tentativasRestantes === 5 - i && !r.body.travada, `erro ${i} de 5: restam ${5 - i}`, r.body); }
  r = await R(V1.reg, codigoErradoDe(V1.cod), { ref: "TROUXE" }); ok(r.status === 422 && r.body.travada === true && /travada depois de 5 erros/.test(msg(r)), "o 5º erro TRAVA a criança", r.body);
  b = await doBanco(V1.reg); ok(b.Travado === true && b.Tentativas === 5, "no banco: travada, 5 tentativas", b);
  ok((await tiposDe(V1.reg)).join() === "CHECKIN,CODIGO_ERRADO,CODIGO_ERRADO,CODIGO_ERRADO,CODIGO_ERRADO,CODIGO_ERRADO,CRIANCA_TRAVADA", "histórico: cinco erros e a trava");
  r = await R(V1.reg, V1.cod, { ref: "TROUXE" }); ok(r.status === 422 && r.body.travada === true, "travada: nem o código CERTO retira (422)", r.body);
  ok((await doBanco(V1.reg)).Tentativas === 5 && (await doBanco(V1.reg)).Situacao === "NA_SALA", "e a tentativa não sobe mais");
  sl = await salaDe(pin(ANA), svR); const tTela = sl.criancas.find((x) => x.registroId === V1.reg);
  ok(tTela.travado === true && tTela.tentativasRestantes === 0 && sl.pendencias.travadas >= 1, "a tela da sala mostra a criança travada, 0 tentativas e a pendência", tTela);
  r = await ckPost("destravar", pin(ANA), { registroId: V1.reg }); ok(r.status === 403, "o voluntário (PIN) não destrava: 403", r.body);
  r = await ckPost("destravar", pin(C.secretaria.central), { registroId: V1.reg }); ok(r.status === 403, "nem a Secretaria entrando por PIN: 403", r.body);
  r = await ckPost("destravar", secVila(), { registroId: V1.reg }); ok(r.status === 404, "liderança de OUTRA congregação: 404", r.body);
  r = await ckPost("destravar", sec(), { registroId: 99999999 }); ok(r.status === 404, "registro que não existe: 404", r.body);
  r = await ckPost("destravar", sec(), { registroId: "0x10" }); ok(r.status === 400, "registroId em formato estranho: 400", r.body);
  r = await ckPost("destravar", sec(), { registroId: V1.reg }); ok(r.status === 200, "a Secretaria da Central destrava (200)", r.body);
  b = await doBanco(V1.reg); ok(b.Travado === false && b.Tentativas === 0, "destravada: tentativas zeradas", b);
  ok((await tiposDe(V1.reg)).pop() === "CRIANCA_DESTRAVADA" && (await um("SELECT AtorMembroId a FROM CheckinInfantilEventos WHERE RegistroId = @r AND Tipo = 'CRIANCA_DESTRAVADA'", { r: V1.reg })).a === C.secretaria.central, "o histórico diz quem destravou");
  r = await ckPost("destravar", sec(), { registroId: V1.reg }); ok(r.status === 409, "destravar quem não está travada: 409 (e não um erro 500 do banco)", r.body);
  r = await R(V1.reg, V1.cod, { ref: "TROUXE" }); ok(r.status === 200, "destravada, o código certo retira", r.body);
  const V2 = await visTrava("Visitante Quatro Erros Teste");
  for (let i = 0; i < 4; i++) await R(V2.reg, codigoErradoDe(V2.cod), { ref: "TROUXE" });
  r = await R(V2.reg, V2.cod, { ref: "TROUXE" }); ok(r.status === 200, "4 erros e o certo na 5ª tentativa: ainda retira (o teto é 5 TENTATIVAS)", r.body);
  const V3 = await visTrava("Visitante Travado Tres Teste");
  for (let i = 0; i < 5; i++) await R(V3.reg, codigoErradoDe(V3.cod), { ref: "TROUXE" });
  ok((await doBanco(V3.reg)).Travado === true, "(V3 travada)");

  console.log("== segunda via: dois olhares, o código antigo morre, o responsável é avisado ==");
  const pedir = (token, registroId, ref, documento = "RG") => ckPost("segunda-via-pedir", token, { registroId, pessoa: { ref }, documento });
  const confirmar = (token, registroId) => ckPost("segunda-via-confirmar", token, { registroId });
  r = await pedir(pin(ANA), rGabi, `RESP:${P.everton}`); ok(r.status === 422 && /não está na lista/.test(msg(r)), "segunda via para quem NÃO está na lista (Everton): 422 — esse caso é a retirada divergente com a liderança", r.body);
  r = await pedir(pin(ANA), rGabi, `RESP:${P.alice}`, "PASSAPORTE"); ok(r.status === 422, "documento fora da lista: 422", r.body);
  r = await pedir(pin(ANA), rGabi, "ALGUEM"); ok(r.status === 422, "referência malformada: 422", r.body);
  r = await pedir(pin(OLGA), rGabi, `RESP:${P.alice}`); ok(r.status === 404, "quem não é da sala não pede (404, como registro que não existe)", r.body);
  r = await pedir(pin(P.alice), rGabi, `RESP:${P.alice}`); ok(r.status === 404, "a própria mãe (PIN, sem estar na escala) não pede a segunda via: 404", r.body);
  r = await confirmar(pin(BRUNO), rGabi); ok(r.status === 422 && /Não há pedido/.test(msg(r)), "confirmar sem pedido: 422", r.body);
  r = await pedir(pin(ANA), rGabi, `RESP:${P.alice}`); ok(r.status === 201 && r.body.viaId, "Ana pede a segunda via para a Alice, conferindo o RG (201)", r.body);
  r = await pedir(pin(BRUNO), rGabi, `RESP:${P.alice}`); ok(r.status === 422 && /Já há um pedido/.test(msg(r)), "outro pedido enquanto há um aguardando: 422", r.body);
  r = await confirmar(pin(ANA), rGabi); ok(r.status === 403 && /Quem pediu/.test(msg(r)), "quem pediu NÃO confirma (dois olhares): 403", r.body);
  r = await confirmar(pin(OLGA), rGabi); ok(r.status === 404, "quem não está na sala não confirma: 404", r.body);
  r = await confirmar(sec(), rGabi); ok(r.status === 403, "a Secretaria (que não está na sala) também não: 403", r.body);
  ok((await doBanco(rGabi)).CodigoGeracao === 1, "(o código ainda é o da geração 1)");
  r = await confirmar(pin(BRUNO), rGabi); ok(r.status === 200 && r.body.etiqueta && /^[A-HJKMNP-Z2-9]{6}$/.test(r.body.etiqueta.codigo), "Bruno confirma: sai a etiqueta nova com o código novo (200)", r.body);
  ok(r.headers["Cache-Control"] === "no-store", "a resposta da segunda via é no-store");
  const cGabi2 = r.body.etiqueta.codigo;
  b = await doBanco(rGabi);
  ok(cGabi2 !== cGabi && b.CodigoGeracao === 2 && b.Tentativas === 0 && b.CodigoHash === ckRegra.hashCodigo(cGabi2, { registroId: rGabi, geracao: 2, segredo: process.env.AUTH_SECRET }), "no banco: geração 2 e o HMAC do código NOVO (atado à geração)", b);
  ok((await tiposDe(rGabi)).slice(-2).join() === "SEGUNDA_VIA_PEDIDA,SEGUNDA_VIA_EMITIDA" && (await um("SELECT Detalhe d FROM CheckinInfantilEventos WHERE RegistroId = @r AND Tipo = 'SEGUNDA_VIA_EMITIDA'", { r: rGabi })).d === "geracao=2", "histórico: pedida e emitida (geração 2)");
  ok((await um("SELECT ConfirmadaPorMembroId c, PedidaPorMembroId p, Documento d FROM CheckinInfantilSegundasVias WHERE RegistroId = @r", { r: rGabi })).c === BRUNO, "a via guarda quem pediu, quem confirmou e o documento conferido");
  const avVia = await notif("CHECKIN_SEGUNDA_VIA");
  ok(avVia.length === 1 && avVia[0].d === P.alice && /Gabi/.test(avVia[0].m) && !/Adolescente|E2E/.test(avVia[0].m) && !avVia[0].m.includes(cGabi2) && !avVia[0].m.includes(cGabi), "a mãe é avisada da segunda via (só o primeiro nome da criança, nenhum código)", avVia);
  ok(!(await textoDasTabelas()).includes(cGabi2) && !LOGS.join("\n").includes(cGabi2), "o código novo também nunca foi gravado nem registrado em log");
  r = await R(rGabi, cGabi, { ref: `RESP:${P.alice}` }); ok(r.status === 422 && r.body.codigoErrado === true, "o código ANTIGO morreu: conta como código errado", r.body);
  ok((await doBanco(rGabi)).Tentativas === 1, "(e gastou uma tentativa)");
  r = await R(rGabi, cGabi2, { ref: `RESP:${P.alice}` }); ok(r.status === 200, "o código novo retira a Gabi", r.body);
  // a segunda via destrava a criança travada
  r = await pedir(pin(ANA), V3.reg, "TROUXE"); ok(r.status === 201, "V3 (travada): a segunda via é pedida a quem trouxe", r.body);
  r = await confirmar(pin(CARLA), V3.reg); ok(r.status === 200, "e confirmada por Carla", r.body);
  b = await doBanco(V3.reg); ok(b.Travado === false && b.Tentativas === 0 && b.CodigoGeracao === 2, "a segunda via destravou a criança e zerou as tentativas", b);
  r = await R(V3.reg, r.body.etiqueta.codigo, { ref: "TROUXE" }); ok(r.status === 200, "o código novo retira", r.body);
  // o pedido que ninguém confirma em 10 minutos vence
  const V4 = await visTrava("Visitante Via Vencida Teste");
  r = await pedir(pin(ANA), V4.reg, "TROUXE"); ok(r.status === 201, "V4: pedido de segunda via", r.body); const via1 = r.body.viaId;
  await q("UPDATE CheckinInfantilSegundasVias SET PedidaEm = DATEADD(MINUTE, -11, SYSUTCDATETIME()) WHERE ViaId = @v", { v: via1 });
  r = await confirmar(pin(BRUNO), V4.reg); ok(r.status === 422 && /passou de 10 minutos/.test(msg(r)), "confirmar depois de 10 minutos: 422 ('peça de novo')", r.body);
  ok((await doBanco(V4.reg)).CodigoGeracao === 1, "(o código não mudou)");
  r = await pedir(pin(ANA), V4.reg, "TROUXE"); ok(r.status === 201 && r.body.viaId !== via1, "um pedido novo é aceito: o vencido é cancelado (nada se apaga)", r.body);
  ok((await um("SELECT CanceladaEm c FROM CheckinInfantilSegundasVias WHERE ViaId = @v", { v: via1 })).c !== null, "o vencido ficou com CanceladaEm");
  r = await confirmar(pin(BRUNO), V4.reg); ok(r.status === 200, "e este é confirmado", r.body);
  r = await R(V4.reg, r.body.etiqueta.codigo, { ref: "TROUXE" }); ok(r.status === 200, "e retira", r.body);
  r = await pedir(pin(ANA), 99999999, "TROUXE"); ok(r.status === 404, "segunda via de registro que não existe: 404", r.body);
  r = await confirmar(pin(ANA), "abc"); ok(r.status === 400, "registroId malformado: 400", r.body);

  // ====================================================================================================================================================
  console.log("== o telefone só vai para a liderança ==");
  r = await checkin(pin(BRUNO), svR, eq.maternal, [{ menorId: K.enzo }], { responsavelId: P.claudia }); const rEnzoT = registrosDe(r)[0]; ok(r.status === 201, "o Enzo volta (nova visita, só para esta prova)", r.body);
  r = await checkin(pin(BRUNO), svR, eq.maternal, [visitante("Visitante Com Telefone Teste", 4)], trouxeLivre("Tio Com Telefone", { contato: "(21) 99876-5432" })); const rVisT = registrosDe(r)[0]; ok(r.status === 201, "e um visitante com o telefone de quem trouxe", r.body);
  const foneClaudia = String(await escalar("SELECT Telefone FROM MembroReferencia WHERE MembroId = @m", { m: P.claudia })).replace(/\D/g, "");
  ok(foneClaudia.length >= 10, "(o cadastro da Claudia tem telefone)", foneClaudia);
  const soDigitos = (x) => JSON.stringify(x).replace(/\D/g, "");
  let visaoOp = await salaDe(pin(ANA), svR);
  ok(!soDigitos(visaoOp).includes("21998765432") && !soDigitos(visaoOp).includes(foneClaudia) && visaoOp.criancas.every((c) => !("telefoneDeQuemTrouxe" in c) && !("responsaveisParaContato" in c)), "a tela do voluntário (PIN) NÃO traz o telefone de quem trouxe nem o dos responsáveis", Object.keys(visaoOp.criancas[0] || {}));
  const relOp = (await ckGet("relatorio", pin(ANA), sala(svR))).body; ok(!soDigitos(relOp).includes("21998765432") && !soDigitos(relOp).includes(foneClaudia), "o relatório da sala (voluntário) também não");
  visaoOp = await salaDe(pin(MARIA), svR); ok(!soDigitos(visaoOp).includes("21998765432"), "a líder da equipe entrando por PIN vê como voluntário (sem telefone)");
  const visaoGestao = await salaDe(sec(), svR);
  const cV = visaoGestao.criancas.find((x) => x.registroId === rVisT), cE = visaoGestao.criancas.find((x) => x.registroId === rEnzoT);
  ok(cV && cV.telefoneDeQuemTrouxe === "21998765432" && cE && cE.responsaveisParaContato.some((x) => soDigitos(x.telefone) === foneClaudia), "a liderança vê o telefone de quem trouxe o visitante e o cadastrado do responsável do Enzo", [cV && cV.telefoneDeQuemTrouxe, cE && cE.responsaveisParaContato]);
  const visaoLider = await salaDe(LIDER(MARIA, ["habilitacao_voluntarios"], CENTRAL), svR);
  ok(visaoLider.criancas.find((x) => x.registroId === rVisT).telefoneDeQuemTrouxe === "21998765432", "a líder com sessão de liderança e a permissão também vê");
  r = await ckGet("sala", pin(OLGA), sala(svR)); ok(r.status === 404, "quem não é da equipe da sala não vê a sala: 404", r.body);
  r = await ckGet("sala", pin(P.alice), sala(svR)); ok(r.status === 404, "a mãe (PIN) não vê a sala: 404", r.body);
  r = await ckGet("sala", secVila(), sala(svR)); ok(r.status === 404, "a Secretaria da Vila não vê a sala da Central: 404", r.body);
  r = await ckGet("sala", sec(), { servicoId: 99999999, equipeId: eq.maternal }); ok(r.status === 404, "sala que não existe: 404", r.body);
  r = await ckPost("buscar", pin(ANA), { ...sala(svR), q: "Bia" }); ok(r.status === 200 && r.body.criancas.length === 1 && r.body.criancas[0].menorId === K.bia && r.body.criancas[0].temResponsavel === true, "a busca por 3 letras acha a Bia, da congregação da sala", r.body);
  r = await ckPost("buscar", pin(ANA), { ...sala(svR), q: "Heitor" }); ok(r.status === 200 && r.body.criancas.every((c) => c.menorId !== K.heitorVila) && r.body.criancas.every((c) => c.menorId !== K.heitor), "a busca não traz a criança da Vila nem o maior de idade (Heitor)", r.body);
  r = await ckPost("buscar", pin(ANA), { ...sala(svR), q: "Bi" }); ok(r.status === 422, "busca com menos de 3 letras: 422", r.body);
  r = await ckPost("buscar", pin(ANA), { ...sala(svR), q: "%%%" }); ok(r.status === 422, "busca com curinga (%): 422", r.body);
  r = await ckPost("buscar", pin(OLGA), { ...sala(svR), q: "Bia" }); ok(r.status === 404, "quem não é da sala não busca criança: 404", r.body);
  r = await ckGet("responsaveis", pin(ANA), { ...sala(svR), menorId: K.bia }); ok(r.status === 200 && r.body.responsaveis.length === 2, "responsáveis da Bia para escolher 'quem trouxe'", r.body);
  r = await ckGet("responsaveis", pin(ANA), { ...sala(svR), menorId: K.heitorVila }); ok(r.status === 404, "responsáveis de criança de outra congregação: 404", r.body);

  // ====================================================================================================================================================
  console.log("== saúde: só com o consentimento SAUDE_CRACHA; revogar APAGA o dado e as cópias ==");
  await limpar(); await ckPost("entrar-na-sala", pin(ANA), sala(svR)); await ckPost("entrar-na-sala", pin(BRUNO), sala(svR)); await ckPost("entrar-na-sala", pin(CARLA), sala(svR));
  const textos = (await consGet("textos", pin(P.alice))).body;
  const hashSaude = (textos.textos.find((t) => t.finalidade === "SAUDE_CRACHA") || {}).hash;
  ok(/^[0-9a-f]{64}$/.test(hashSaude), "o hash do texto de saúde vem da rota de consentimento", textos && Object.keys(textos));
  const gravar = (token, corpo) => ckPost("saude-gravar", token, { menorId: K.bia, texto: "Alergia a amendoim e a picada de abelha", ...corpo });
  r = await gravar(pin(P.alice), {}); ok(r.status === 422 && /autorizar primeiro/.test(msg(r)), "sem o consentimento de saúde vigente, a Alice NÃO consegue gravar a alergia: 422", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilSaude")) === 0, "e nada ficou guardado");
  r = await consPost("conceder", pin(P.alice), { menorId: K.bia, finalidade: "SAUDE_CRACHA", aceito: true, termoHash: hashSaude }); ok(r.status === 201, "a Alice concede o consentimento SAUDE_CRACHA da Bia (rota da v7.7)", r.body);
  r = await gravar(pin(P.dina), {}); ok(r.status === 403, "a avó (não responsável) não grava a saúde da Bia: 403", r.body);
  r = await gravar(pin(P.claudia), {}); ok(r.status === 403, "nem a Claudia (responsável de outras): 403", r.body);
  r = await gravar(pin(P.alice), { menorId: 99999999 }); ok(r.status === 403, "criança que não existe: o mesmo 403", r.body);
  r = await gravar(pin(P.alice), { texto: "<img src=x onerror=1>" }); ok(r.status === 422, "texto com marcação: 422", r.body);
  r = await gravar(pin(P.alice), { texto: "a" }); ok(r.status === 422, "texto de uma letra: 422", r.body);
  r = await gravar(pin(P.alice), { texto: "x".repeat(401) }); ok(r.status === 422, "texto acima de 400 caracteres: 422", r.body);
  r = await gravar(pin(P.alice), { ficha: true, referencia: "Pasta 9" }); ok(r.status === 403, "o responsável não registra 'ficha' (é da Secretaria): 403", r.body);
  r = await gravar(sec(), { ficha: true }); ok(r.status === 422 && /referência da ficha/.test(msg(r)), "a Secretaria sem a referência da ficha: 422", r.body);
  r = await gravar(secVila(), { ficha: true, referencia: "Pasta 9" }); ok(r.status === 403, "a Secretaria da Vila: 403", r.body);
  r = await gravar(pin(P.alice), {}); ok(r.status === 200, "com o consentimento vigente, a Alice grava a alergia da Bia (200)", r.body);
  r = await gravar(sec(), { texto: "Alergia a amendoim, picada de abelha e lactose", ficha: true, referencia: "Pasta 9, ficha 2" }); ok(r.status === 200, "a Secretaria atualiza pela ficha assinada (200)", r.body);
  ok((await um("SELECT Forma, Referencia, RegistradoPorMembroId r FROM CheckinInfantilSaude WHERE MenorMembroId = @m", { m: K.bia })).Forma === "FICHA_FISICA" && (await escalar("SELECT COUNT(*) FROM CheckinInfantilSaude WHERE MenorMembroId = @m", { m: K.bia })) === 1, "uma linha só por criança, agora pela ficha");
  ok((await auditoria("CHECKIN_SAUDE_GRAVADA")).every((a) => !/amendoim|abelha|lactose/i.test(a.DadosDepois || "")), "a auditoria NUNCA leva o texto da saúde");
  r = await ckGet("saude", pin(P.alice), { menorId: K.bia }); ok(r.status === 200 && r.body.consentimentoVigente === true && /lactose/.test(r.body.saude.texto), "a Alice lê o que guardou", r.body);
  r = await ckGet("saude", pin(P.dina), { menorId: K.bia }); ok(r.status === 403, "a avó não lê: 403", r.body);
  r = await ckGet("saude", secVila(), { menorId: K.bia }); ok(r.status === 403, "a Secretaria da Vila não lê: 403", r.body);
  r = await ckGet("saude", sec(), { menorId: K.bia }); ok(r.status === 200, "a Secretaria da Central lê", r.body);
  r = await checkin(pin(ANA), svR, eq.maternal, [{ menorId: K.bia }, { menorId: K.caio }], mae); ok(r.status === 201, "check-in da Bia e do Caio", r.body);
  const [rBia3, rCaio3] = registrosDe(r);
  ok(/lactose/.test(r.body.etiquetas[0].etiqueta.saude) && r.body.etiquetas[1].etiqueta.saude === null, "a etiqueta da Bia sai com a alergia; a do Caio, sem", r.body.etiquetas.map((e) => e.etiqueta.saude));
  b = await doBanco(rBia3); ok(b.SaudeOrigem === "CADASTRO" && /lactose/.test(b.SaudeTexto), "a cópia no registro tem a origem CADASTRO", b);
  // o dado sem consentimento nunca sai na etiqueta, mesmo que alguém o tenha gravado por fora
  await q("INSERT INTO CheckinInfantilSaude (MenorMembroId, Texto, Forma, RegistradoPorMembroId) VALUES (@m, N'Dado sem consentimento', 'RESPONSAVEL', @p)", { m: K.caio, p: P.alice });
  await limpar(); await ckPost("entrar-na-sala", pin(ANA), sala(svR)); await ckPost("entrar-na-sala", pin(BRUNO), sala(svR));
  r = await checkin(pin(ANA), svR, eq.maternal, [{ menorId: K.caio }], mae); ok(r.status === 201 && r.body.etiquetas[0].etiqueta.saude === null, "o Caio TEM uma linha de saúde mas NÃO tem o consentimento: a etiqueta sai SEM saúde (a leitura confere a vigência)", r.body.etiquetas && r.body.etiquetas[0].etiqueta);
  r = await ckGet("saude", pin(P.alice), { menorId: K.caio }); ok(r.status === 200 && r.body.consentimentoVigente === false && r.body.saude === null, "e a tela do responsável também não mostra o dado sem consentimento", r.body);
  // revogar o consentimento APAGA a linha e as cópias (inclusive nos registros já retirados)
  await limpar(); await ckPost("entrar-na-sala", pin(ANA), sala(svR)); await ckPost("entrar-na-sala", pin(BRUNO), sala(svR));
  r = await checkin(pin(ANA), svR, eq.maternal, [{ menorId: K.bia }], mae); const rBia4 = registrosDe(r)[0]; ok(r.status === 201 && /lactose/.test(r.body.etiquetas[0].etiqueta.saude), "a Bia entra de novo, de novo com a alergia na etiqueta", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE MenorMembroId = @m AND SaudeTexto IS NOT NULL", { m: K.bia })) === 2, "há 2 registros dela com a cópia da saúde (um já retirado, um na sala)");
  r = await consPost("revogar", pin(P.dina), { menorId: K.bia, finalidade: "SAUDE_CRACHA" }); ok(r.status === 403, "quem não é responsável não revoga: 403", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilSaude WHERE MenorMembroId = @m", { m: K.bia })) === 1, "(e nada foi apagado)");
  r = await consPost("revogar", pin(P.bernardo), { menorId: K.bia, finalidade: "SAUDE_CRACHA" }); ok(r.status === 200, "o pai Bernardo revoga o consentimento (qualquer responsável ativo revoga): 200", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilSaude WHERE MenorMembroId = @m", { m: K.bia })) === 0, "a linha de saúde da Bia FOI APAGADA na mesma operação");
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE MenorMembroId = @m AND (SaudeTexto IS NOT NULL OR SaudeOrigem IS NOT NULL)", { m: K.bia })) === 0, "e as cópias nos registros de check-in também (o da sala e o já retirado)");
  sl = await salaDe(pin(ANA), svR); ok(sl.criancas.find((x) => x.registroId === rBia4).saude === null, "a tela da sala já não mostra a alergia");
  ok((await auditoria("CHECKIN_SAUDE_APAGADA")).length >= 1 && (await auditoria("CHECKIN_SAUDE_APAGADA")).every((a) => !/amendoim|lactose/i.test(a.DadosDepois || "")), "a auditoria registra o apagamento, sem o texto");
  r = await gravar(pin(P.alice), {}); ok(r.status === 422, "sem o consentimento, não grava de novo", r.body);
  // apagar a pedido
  r = await consPost("conceder", pin(P.alice), { menorId: K.joana, finalidade: "SAUDE_CRACHA", aceito: true, termoHash: hashSaude }); ok(r.status === 201, "consentimento da Joana", r.body);
  r = await ckPost("saude-gravar", pin(P.alice), { menorId: K.joana, texto: "Asma leve, usa bombinha" }); ok(r.status === 200, "saúde da Joana", r.body);
  r = await ckPost("saude-apagar", pin(P.dina), { menorId: K.joana }); ok(r.status === 403, "a avó não apaga: 403", r.body);
  r = await ckPost("saude-apagar", pin(P.alice), { menorId: K.joana }); ok(r.status === 200 && /apagada/.test(msg(r)), "a Alice apaga a pedido: 200", r.body);
  r = await ckPost("saude-apagar", pin(P.alice), { menorId: K.joana }); ok(r.status === 200 && /Não havia/.test(msg(r)), "apagar de novo: 200 'não havia' (sem erro do banco)", r.body);
  // a pessoa deixa de ser responsável: a saúde sai junto
  r = await ckPost("saude-gravar", pin(P.alice), { menorId: K.joana, texto: "Asma leve, usa bombinha" }); ok(r.status === 200, "(Joana volta a ter saúde guardada)", r.body);
  const respJoana = await escalar("SELECT ResponsavelId FROM VoluntariadoResponsaveis WHERE MenorMembroId = @m AND ResponsavelMembroId = @r AND RevogadoEm IS NULL", { m: K.joana, r: P.alice });
  r = await volPost("responsavel-revogar", sec(), { responsavelId: respJoana }); ok(r.status === 200, "a Secretaria revoga a Alice como responsável da Joana", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilSaude WHERE MenorMembroId = @m", { m: K.joana })) === 0, "a saúde da Joana foi apagada junto (ninguém mais pode autorizar o dado)");
  r = await ckGet("saude", pin(P.alice), { menorId: K.joana }); ok(r.status === 403, "e a Alice, que deixou de ser responsável, não lê mais: 403", r.body);

  // ====================================================================================================================================================
  console.log("== o histórico do responsável (Meus filhos) ==");
  r = await ckGet("meus-filhos", pin(P.alice)); const filhosAlice = (r.body.filhos || []).map((f) => f.menorId).sort();
  ok(r.status === 200 && JSON.stringify(filhosAlice) === JSON.stringify([K.bia, K.caio, K.gabi].sort()), "a Alice vê Bia, Caio e Gabi (a Joana saiu quando deixou de ser responsável)", filhosAlice);
  r = await ckGet("meus-filhos", pin(P.claudia)); ok(r.status === 200 && JSON.stringify(r.body.filhos.map((f) => f.menorId).sort()) === JSON.stringify([K.duda, K.enzo]), "a Claudia vê Duda e Enzo", r.body.filhos);
  r = await ckGet("meus-filhos", pin(P.everton)); ok(r.status === 200 && r.body.filhos.length === 0, "quem não é responsável de ninguém vê lista vazia", r.body);
  r = await ckGet("meus-filhos", undefined); ok(r.status === 401, "sem sessão: 401", r.status);
  r = await ckGet("historico", pin(P.alice)); const histA = r.body.historico || [];
  ok(r.status === 200 && histA.length >= 4 && histA.every((h) => [K.bia, K.caio, K.gabi].includes(h.menorId)), "o histórico da Alice só tem os filhos dela", histA.map((h) => h.menorId));
  const textoHist = JSON.stringify(histA);
  ok(!/Ana Apta|Bruno Apto|Carla Apta|Olga Apta|Maria|Lider/.test(textoHist) && !/codigo|saude|motivo|RetiradoPorOperador|telefone|operador/i.test(textoHist) && [cBia, cBia2, cCaio, cJoana, cDuda, cEnzo, cFabio, cGabi, cGabi2].every((c) => !textoHist.includes(c)), "o histórico NÃO traz o nome de voluntário, código, saúde, motivo nem telefone", Object.keys(histA[0] || {}));
  const hBia = histA.find((h) => h.menorId === K.bia && h.situacao === "RETIRADA");
  ok(hBia && hBia.quemRetirou && hBia.quemTrouxe === "Alice Mae E2E" && hBia.sala === "Maternal M7" && !!hBia.entregueEm && !!hBia.retiradoEm, "cada linha: data, sala, quem trouxe, quem retirou e os horários", hBia);
  r = await ckGet("historico", pin(P.claudia)); const histC = r.body.historico; const hEnzo = histC.find((h) => h.registroId === rEnzo);
  ok(histC.every((h) => [K.duda, K.enzo].includes(h.menorId)) && hEnzo && hEnzo.retiradaDivergente === true && hEnzo.quemRetirou === "Fulano Estranho Teste", "a Claudia vê só os dela, e a retirada aprovada pela liderança aparece como divergente, com o nome de quem retirou", hEnzo);
  r = await ckGet("historico", pin(P.claudia), { menorId: K.bia }); ok(r.status === 200 && r.body.historico.length === 0, "pedir o histórico da criança de OUTRA família: lista vazia (nada vaza)", r.body);
  r = await ckGet("historico", pin(P.dina)); ok(r.status === 200 && r.body.historico.length === 0, "a avó autorizada não vê histórico (só quem é responsável cadastrado)", r.body);
  r = await ckGet("historico", pin(ANA)); ok(r.status === 200 && r.body.historico.length === 0, "o voluntário que atendeu as crianças também não vê o histórico delas", r.body);
  r = await ckGet("historico", sec()); ok(r.status === 200 && r.body.historico.length === 0, "nem a Secretaria por esta rota (a visão dela é o relatório da sala)", r.body);
  r = await meusDados(P.alice, pin(P.alice)); const ckLgpd = r.body && (r.body.checkinInfantil || (r.body.dados && r.body.dados.checkinInfantil));
  ok(r.status === 200 && ckLgpd && ckLgpd.comoQuemTrouxeOuRetirou.registros >= 3 && ckLgpd.comoAutorizado.criancas === 0, "Meus Dados: a Alice vê quantas vezes trouxe ou retirou criança (o titular enxerga o que há dele)", ckLgpd);
  r = await meusDados(P.dina, pin(P.dina)); const ckDina = r.body && (r.body.checkinInfantil || (r.body.dados && r.body.dados.checkinInfantil)); ok(ckDina && ckDina.comoAutorizado.criancas >= 1, "a Dina vê que está autorizada a retirar crianças", ckDina);
  r = await meusDados(P.dina, pin(P.alice)); ok(r.status === 403, "ver os dados de OUTRA pessoa: 403", r.status);

  // ====================================================================================================================================================
  console.log("== rotina diária: criança sem retirada, retenção curta e longa, saúde de quem perdeu o consentimento ==");
  await limpar();
  const trigger = async (nome, tabela, fn) => { await q(`DISABLE TRIGGER dbo.${nome} ON dbo.${tabela}`); try { return await fn(); } finally { await q(`ENABLE TRIGGER dbo.${nome} ON dbo.${tabela}`); } };
  const envelhecer = (ids, dias) => trigger("TR_CheckinRegistros_Protegido", "CheckinInfantilRegistros", () => q(`UPDATE CheckinInfantilRegistros SET EntregueEm = DATEADD(DAY, -${Number(dias)}, EntregueEm) WHERE RegistroId IN (${ids.map(Number).join(",")})`));
  const svAnt = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO]);
  r = await checkin(pin(ANA), svAnt, eq.maternal, [visitante("Visitante Esquecido Teste", 4), visitante("Visitante Esquecido Dois Teste", 4)], trouxeLivre("Tia Esqueceu Teste")); const [rEsq1] = registrosDe(r); ok(r.status === 201, "dois visitantes são deixados e ninguém registra a retirada", r.body);
  await q("UPDATE EscalasServicos SET DataHora = DATEADD(DAY, -1, DataHora) WHERE ServicoId = @s", { s: svAnt });
  r = await rotinaDiaria(); ok(r.status === 200 && r.body.sucesso === true, "a rotina diária completa roda (200) mesmo com o banco cheio de casos", [r.status, r.body && r.body.detectoresComFalha, r.body && r.body.retencaoCheckin]);
  const semRet = await notif("CHECKIN_SEM_RETIRADA"); const destSem = semRet.map((a) => a.d).sort((a, b) => a - b);
  ok(semRet.length >= 3 && destSem.includes(C.secretaria.central) && destSem.includes(MARIA) && destSem.includes(1001) && !destSem.includes(C.secretaria.vila), "aviso 'criança sem retirada' para a liderança da Central, a líder da sala e a Diretoria (não para a Vila)", destSem);
  ok(semRet.every((a) => /2 criança\(s\)/.test(a.m) && !/Visitante|Esquecido|Teste/.test(a.m)), "a mensagem diz quantas e a sala, e nunca o nome de criança", semRet[0] && semRet[0].m);
  const nAntes = (await notif("CHECKIN_SEM_RETIRADA")).length;
  await rotinaDiaria(); ok((await notif("CHECKIN_SEM_RETIRADA")).length === nAntes, "a rotina rodando de novo no mesmo dia NÃO duplica o aviso");
  ok(r.body.retencaoCheckin && typeof r.body.retencaoCheckin.contatosApagados === "number", "a rotina devolve o resumo da retenção do check-in", r.body && r.body.retencaoCheckin);
  // retenção curta (90 dias) e longa (5 anos)
  const salaRet = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO]);
  const novo = async (nome, extra = {}) => { const x = await checkin(pin(ANA), salaRet, eq.maternal, [{ visitante: { nome, nascimento: H.nascimentoParaIdade(4), ...extra } }], trouxeLivre("Tia Retencao Teste", { contato: "(31) 97777-1111", parentesco: "MAE" }), { autorizadosVisita: [{ nome: "Indicada Da Retencao", parentesco: "AVO" }] }); if (x.status !== 201) throw new Error(nome + ": " + JSON.stringify(x.body)); return { reg: registrosDe(x)[0], cod: codigosDe(x)[0] }; };
  const comSaude = { saude: { texto: "Alergia de balcão", concordo: true, textoHash: catalogo.hash } };
  const A89 = await novo("Visitante Oitenta E Nove Teste", comSaude), A91 = await novo("Visitante Noventa E Um Teste", comSaude), A2000 = await novo("Visitante Cinco Anos Teste", comSaude), AAberta = await novo("Visitante Antiga Aberta Teste", comSaude);
  for (const x of [A89, A91, A2000]) { r = await R(x.reg, x.cod, { ref: "TROUXE" }, pin(ANA)); ok(r.status === 200, "(retirada para a prova de retenção)", r.body); }
  await envelhecer([A89.reg], 89); await envelhecer([A91.reg], 91); await envelhecer([A2000.reg], 2000); await envelhecer([AAberta.reg], 2000);
  await rotinaDiaria();
  let ret = await um("SELECT TrouxeContato, SaudeTexto, SaudeOrigem, VisitanteNome, TrouxeNome, AnonimizadoEm FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: A89.reg });
  ok(ret.TrouxeContato === "31977771111" && /balcão/.test(ret.SaudeTexto) && ret.AnonimizadoEm === null, "89 dias: o telefone e a saúde do balcão ainda estão (o prazo é 90)", ret);
  ret = await um("SELECT TrouxeContato, SaudeTexto, SaudeOrigem, SaudeTextoVersao, SaudeTextoHash, VisitanteNome, TrouxeNome, AnonimizadoEm FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: A91.reg });
  ok(ret.TrouxeContato === null && ret.SaudeTexto === null && ret.SaudeOrigem === null && ret.SaudeTextoVersao === null && ret.SaudeTextoHash === null && ret.VisitanteNome === "Visitante Noventa E Um Teste" && ret.TrouxeNome === "Tia Retencao Teste" && ret.AnonimizadoEm === null, "91 dias: o telefone e a saúde do balcão SAÍRAM; o registro de custódia continua inteiro", ret);
  ret = await um("SELECT * FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: A2000.reg });
  ok(ret.AnonimizadoEm !== null && ret.VisitanteNome === "(anonimizado)" && ret.VisitanteNascimento === null && ret.TrouxeNome === null && ret.TrouxeContato === null && ret.RetiradoNome === null && ret.SaudeTexto === null, "passado o prazo de guarda (2000 dias): o registro retirado é ANONIMIZADO (nome, nascimento, quem trouxe e quem retirou)", ret);
  ok(ret.IdadeAnos === 4 && ret.FaixaSala === "MATERNAL" && ret.EntregueEm !== null && ret.RetiradoEm !== null && ret.ServicoId === salaRet && ret.RetiradoTipo === "TROUXE", "e o que prova a contagem de presença sobrevive (idade, faixa, horários, sala, tipo de retirante)");
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilAutorizadosVisita WHERE RegistroId = @r AND Nome IS NOT NULL", { r: A2000.reg })) === 0, "o nome dos indicados da visita também sai");
  ret = await um("SELECT AnonimizadoEm, VisitanteNome FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: AAberta.reg });
  ok(ret.AnonimizadoEm === null && ret.VisitanteNome === "Visitante Antiga Aberta Teste", "uma criança ainda 'na sala' NUNCA é anonimizada, por mais velho que seja o registro (a prova de custódia está em aberto)", ret);
  const resumo2 = (await rotinaDiaria()).body.retencaoCheckin; ok(resumo2.anonimizados === 0 && resumo2.autorizadosDeVisitaAnonimizados === 0, "rodar de novo não anonimiza nada outra vez (idempotente)", resumo2);
  // criança MEMBRO: a anonimização tira também as matrículas (criança, quem trouxe, quem retirou)?
  r = await checkin(pin(ANA), salaRet, eq.maternal, [{ menorId: K.enzo }], { responsavelId: P.claudia }); const MEnzo = { reg: registrosDe(r)[0], cod: codigosDe(r)[0] };
  r = await R(MEnzo.reg, MEnzo.cod, { ref: `RESP:${P.claudia}` }); ok(r.status === 200, "(Enzo retirado pela mãe, para a prova de retenção de criança membro)", r.body);
  await envelhecer([MEnzo.reg], 2000); await rotinaDiaria();
  ret = await um("SELECT MenorMembroId, TrouxeMembroId, RetiradoMembroId, TrouxeNome, RetiradoNome, AnonimizadoEm FROM CheckinInfantilRegistros WHERE RegistroId = @r", { r: MEnzo.reg });
  ok(ret.AnonimizadoEm !== null && ret.MenorMembroId === null && ret.TrouxeMembroId === null && ret.RetiradoMembroId === null, "criança MEMBRO anonimizada: as matrículas da criança, de quem trouxe e de quem retirou também saem (senão o registro continua ligado às pessoas)", ret);
  // a saúde de quem perdeu o consentimento por outro caminho (a criança fez 18 anos)
  r = await consPost("conceder", pin(P.alice), { menorId: K.gabi, finalidade: "SAUDE_CRACHA", aceito: true, termoHash: hashSaude }); ok(r.status === 201, "consentimento da Gabi", r.body);
  r = await ckPost("saude-gravar", pin(P.alice), { menorId: K.gabi, texto: "Diabetes tipo 1" }); ok(r.status === 200, "saúde da Gabi", r.body);
  await q("UPDATE MembroReferencia SET DataNascimento = DATEADD(DAY, -1, DATEADD(YEAR, -18, CAST(SYSUTCDATETIME() AS DATE))) WHERE MembroId = @m", { m: K.gabi });
  ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilSaude WHERE MenorMembroId = @m", { m: K.gabi })) === 1, "(a Gabi acabou de fazer 18 anos e a linha ainda está lá)");
  await rotinaDiaria(); ok((await escalar("SELECT COUNT(*) FROM CheckinInfantilSaude WHERE MenorMembroId = @m", { m: K.gabi })) === 0, "a rotina diária APAGA a saúde de quem perdeu o consentimento (a criança fez 18 anos)");

  // ====================================================================================================================================================
  console.log("== o portão da EBD: turma 'com menores' só aceita professor apto e perde o que deixou de ser ==");
  const EBDT = require(path.join(API, "GestaoEbdTurmas/index.js"));
  const ebdCentral = () => LIDER(C.secretaria.central, ["ebd_gestao"], CENTRAL), ebdVila = () => LIDER(C.secretaria.vila, ["ebd_gestao"], VILA), ebdSemFator = () => L.sessao(C.secretaria.central, { via: "SENHA", nivel: "CONGREGACAO", escopoCongregacoes: CENTRAL, permissoes: ["ebd_gestao"] });
  const ebd = (acao, metodo, token, corpo, query) => H.chamarH(EBDT, { acao, metodo, token, corpo, query });
  r = await ebd("turmas", "POST", ebdCentral(), { congregacaoId: c1, nome: "Criancas Portao E2E" }); ok(r.status === 201, "a EBD cria a turma 'Crianças Portão' (nasce SEM a marca)", r.body);
  const turmaId = await escalar("SELECT TurmaId FROM EbdTurmas WHERE Nome = N'Criancas Portao E2E'"); ok((await escalar("SELECT ContatoComMenores FROM EbdTurmas WHERE TurmaId = @t", { t: turmaId })) === false, "marca desligada ao nascer");
  r = await ebd("professores", "POST", ebdCentral(), { turmaId, membroId: 6013 }); ok(r.status === 201, "turma SEM marca: o professor inapto (certidão vencida) é designado normalmente (nada muda sozinho)", r.body);
  r = await ebd("professores", "POST", ebdCentral(), { turmaId, membroId: ANA }); ok(r.status === 201, "e o apto também", r.body);
  const marcar = (token, v = true, id = turmaId) => ebd("turmas/menores", "POST", token, { turmaId: id, contatoComMenores: v });
  r = await marcar(undefined); ok(r.status === 401, "marcar sem sessão: 401", r.status);
  r = await marcar(pin(C.secretaria.central)); ok(r.status === 403, "marcar por PIN: 403", r.body);
  r = await marcar(ebdVila()); ok(r.status === 404, "marcar com a EBD da Vila (turma da Central): 404", r.body);
  r = await marcar(ebdCentral(), true, 99999999); ok(r.status === 404, "turma que não existe: 404 (a mesma resposta)", r.body);
  for (const ruim of ["0x10", "1e1", -1, 0, true, "abc", [turmaId], { a: 1 }]) { r = await ebd("turmas/menores", "POST", ebdCentral(), { turmaId: ruim, contatoComMenores: true }); ok(r.status === 400 || r.status === 404, `turmaId ${JSON.stringify(ruim)}: recusado (${r.status})`, r.body); }
  r = await ebd("turmas/menores", "POST", ebdCentral(), { turmaId, contatoComMenores: "sim" }); ok(r.status === 400, "contatoComMenores que não é booleano: 400", r.body);
  ok((await escalar("SELECT ContatoComMenores FROM EbdTurmas WHERE TurmaId = @t", { t: turmaId })) === false, "(nenhuma dessas recusas ligou a marca)");
  r = await marcar(ebdCentral()); ok(r.status === 200 && r.body.mudou === true && r.body.retirados === 1, "a EBD liga a marca: 200 e o professor inapto SAIU na hora (1 retirado)", r.body);
  ok((await escalar("SELECT Ativo FROM EbdTurmaProfessores WHERE TurmaId = @t AND MembroId = 6013", { t: turmaId })) === false && (await escalar("SELECT Ativo FROM EbdTurmaProfessores WHERE TurmaId = @t AND MembroId = @m", { t: turmaId, m: ANA })) === true, "o inapto (6013) saiu e o apto (Ana) ficou");
  const ret6013 = await um("SELECT EquipeId, TurmaId, AlocacoesCanceladas, Motivos FROM MinisterioMenoresRetiradas WHERE MembroId = 6013 AND TurmaId = @t", { t: turmaId });
  ok(ret6013 && ret6013.EquipeId === null && ret6013.AlocacoesCanceladas === 1, "a retirada ficou registrada como da TURMA (sem equipe)", ret6013);
  ok((await q("SELECT DadosDepois FROM AuditLog WHERE Acao = 'MENORES_RETIRADO_DA_TURMA_EBD'")).every((a) => !/certid|ANTECEDENTES/i.test(a.DadosDepois || "")), "a auditoria da retirada não leva o motivo");
  ok((await notif("MENORES_RETIRADO_DA_ESCALA")).some((a) => a.d === 6013 && a.t === "MinisterioMenoresRetiradas") && (await notif("EBD_PROFESSOR_RETIRADO")).some((a) => a.d === ANA), "o professor retirado e os colegas da turma foram avisados");
  r = await marcar(ebdCentral()); ok(r.status === 200 && r.body.mudou === false, "ligar de novo: 200 'já estava' (sem mudança nem auditoria nova)", r.body);
  r = await ebd("professores", "POST", ebdCentral(), { turmaId, membroId: 6014 }); ok(r.status === 422 && /com menores/.test(msg(r)), "designar professor inapto (6014, sem treinamento) na turma marcada: 422", r.body);
  r = await ebd("professores", "POST", ebdCentral(), { turmaId, membroId: 6013 }); ok(r.status === 422, "reativar o que saiu por inaptidão: 422", r.body);
  r = await ebd("professores", "POST", ebdCentral(), { turmaId, membroId: BRUNO }); ok(r.status === 201, "designar professor apto: 201", r.body);
  await derrubarAptidao(ANA); r = await rotinaDiaria(); await restaurarAptidao(ANA);
  ok(r.status === 200 && (await escalar("SELECT Ativo FROM EbdTurmaProfessores WHERE TurmaId = @t AND MembroId = @m", { t: turmaId, m: ANA })) === false && (await escalar("SELECT Ativo FROM EbdTurmaProfessores WHERE TurmaId = @t AND MembroId = @m", { t: turmaId, m: BRUNO })) === true, "a Ana perde a habilitação: a rotina diária a tira da turma; o Bruno continua", [r.status, r.body && r.body.detectoresComFalha]);
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresRetiradas WHERE MembroId = @m AND TurmaId = @t", { m: ANA, t: turmaId })) === 1, "com a retirada registrada (uma só)");
  await rotinaDiaria(); ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresRetiradas WHERE MembroId = @m AND TurmaId = @t", { m: ANA, t: turmaId })) === 1, "e a rotina de novo não repete a retirada");
  r = await marcar(ebdSemFator(), false); ok(r.status === 428 && r.body.precisaFator === true, "DESLIGAR a marca sem a confirmação reforçada: 428 (derruba o portão)", r.body);
  ok((await escalar("SELECT ContatoComMenores FROM EbdTurmas WHERE TurmaId = @t", { t: turmaId })) === true, "(continua ligada)");
  r = await marcar(ebdCentral(), false); ok(r.status === 200 && r.body.mudou === true, "com a confirmação recente, a marca é desligada", r.body);
  r = await ebd("professores", "POST", ebdCentral(), { turmaId, membroId: 6014 }); ok(r.status === 201, "sem a marca, o portão cai: o inapto volta a poder ser designado (como antes da v7.10)", r.body);
  r = await marcar(ebdCentral(), false); ok(r.status === 200 && r.body.mudou === false, "desligar de novo: 'já estava' (sem pedir confirmação por nada)", r.body);

  fim("e2e-19-checkin-fluxos");
})().catch((e) => { H.erroFatal("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
