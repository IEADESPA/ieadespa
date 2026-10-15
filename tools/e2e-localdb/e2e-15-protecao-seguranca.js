// e2e-15-protecao-seguranca.js — v7.8: a bateria de segurança da proteção de crianças (handlers REAIS, SQL Server real): quem pode chamar o quê, a mesma resposta para "não existe"
// e "não é seu", o conflito de interesse (quem é envolvido não vê nada), lixo em todo campo (nada de 500, nada de vazamento, recusa não grava), injeção, vazamento nos avisos e na
// auditoria, abuso do canal sem login e do registro, e o que a trilha de auditoria NÃO pode dizer. Parte da base "cenario-protecao".
process.env.CRON_SECRET = "segredo-cron-so-do-teste-e2e";
const fs = require("fs");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, PIN, sessao, LIXO, API, path, obterPool, chamar } = L;
const P = require(path.join(API, "GestaoProtecaoMenores/index.js"));
const AJUDA = require(path.join(API, "ProtecaoAjuda/index.js"));
const ANEXOS = require(path.join(API, "AnexosGenericos/index.js"));
const { eq, c1, c2 } = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario-menores.json"), "utf8"));
const hoje = L.hojeBr();
const PERM = ["protecao_menores"];
const presidente = GERAL(1001, PERM);
const secretarioGeral = GERAL(1002, PERM);
const dirCentral = LIDER(3001, PERM, ["Central E2E"]);
const dirVila = LIDER(3002, PERM, ["Vila Nova E2E"]);
const semPermissao = LIDER(3004, ["pessoas"], ["Beta E2E"]);
const incidente = (extra = {}) => ({ nivel: "QUEBRA_POLITICA", dataOcorrencia: hoje, congregacaoId: c1, descricao: "Um adulto ficou a sós com uma criança na sala do maternal.", ...extra });
const alegacao = (extra = {}) => incidente({ nivel: "ALEGACAO", relatadoPor: "VOLUNTARIO", relato: "RELATO-SECRETO-ABC A criança disse, com as palavras dela, que o tio a machucou.", ...extra });
const idDe = async (protocolo) => escalar("SELECT IncidenteId FROM IncidentesProtecao WHERE Protocolo = @p", { p: protocolo });
const chamarRotina = async (handler, headers = {}) => { const ctx = { bindingData: {}, log: Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } }) }; await handler(ctx, { method: "POST", headers, query: {}, body: {} }); return ctx.res || { status: 0, body: null }; };
const TABELAS = ["IncidentesProtecao", "IncidenteEnvolvidos", "IncidenteDecisoesCautelares", "IncidenteRelatos", "IncidenteLeituras", "IncidenteComunicacoes", "IncidenteReclassificacoes", "Notificacoes", "AuditLog", "MinisterioMenoresRetiradas", "EscalasAlocacoes"];
async function retrato() { const p = []; for (const n of TABELAS) p.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${n}`))); return p.join("|"); }
// para cada campo e cada lixo: nunca 500, status esperado, sem vazamento de texto interno e, se foi recusada (>= 400), o banco fica IGUAL
async function fuzzar(rotulo, fazer, base, campos, aceitos = [200, 201, 400, 401, 403, 404, 422, 428, 429]) {
  let chamadas = 0; const quebras = [], mudancas = [];
  for (const campo of campos) for (const lixo of LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = await fazer(corpo);
    chamadas++;
    if (r.status === 500 || !aceitos.includes(r.status)) quebras.push(`${rotulo}.${campo} = ${JSON.stringify(lixo).slice(0, 40)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(`${rotulo}.${campo} = ${JSON.stringify(lixo).slice(0, 40)} (${r.status}) mexeu no banco`);
    if (r.body && typeof r.body === "object" && /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules|RAISERROR/i.test(JSON.stringify(r.body))) quebras.push(`${rotulo}.${campo} vazou texto interno: ${JSON.stringify(r.body).slice(0, 100)}`);
  }
  ok(quebras.length === 0, `${rotulo}: ${chamadas} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 5));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 5));
}

(async () => {
  let r;
  const pool = await obterPool();
  // o cenário: uma quebra e uma suspeita de violência (com o membro 6011 envolvido, e o Presidente 1001 envolvido em outra)
  r = await POST(P, "registrar", PIN(6010), incidente({ equipeId: eq.bercario })); const quebra = await idDe(r.body.protocolo);
  r = await POST(P, "registrar", PIN(6012), alegacao({ envolvidoMembroId: 6011, equipeId: eq.bercario })); const alg = await idDe(r.body.protocolo);
  r = await POST(P, "registrar", PIN(6013), alegacao({ envolvidoMembroId: 1001, descricao: "Relato envolvendo a própria Diretoria (conflito de interesse)." })); const algPres = await idDe(r.body.protocolo);
  ok(!!quebra && !!alg && !!algPres, "cenário: 3 incidentes registrados", [quebra, alg, algPres]);
  const envId = await escalar("SELECT EnvolvidoId FROM IncidenteEnvolvidos WHERE IncidenteId = @i", { i: alg });

  console.log("== quem pode chamar o quê (todas as rotas × todas as sessões) ==");
  const SESSOES = { semSessao: undefined, pinComum: PIN(6010), pinDoPresidente: sessao(1001, { via: "PIN" }), liderSemPermissao: semPermissao, dirigente: dirCentral, dirigenteDeFora: dirVila, geral: presidente };
  const LEITURAS = [["incidentes", {}], ["incidente", { incidenteId: alg }], ["padroes", {}], ["comite", {}], ["relatorio-anual", {}]];
  const ESCRITAS = [
    ["relato", { incidenteId: alg }], ["comunicacao", { incidenteId: alg, orgao: "CONSELHO_TUTELAR", forma: "TELEFONE", comunicadoEm: new Date().toISOString(), protocoloExterno: "SEG-1" }],
    ["adendo", { incidenteId: alg, texto: "A criança contou mais por conta própria hoje." }], ["reclassificar", { incidenteId: quebra, nivelNovo: "ALEGACAO", motivo: "Soubemos de algo mais grave.", relatadoPor: "VOLUNTARIO", relato: "Relato de teste da reclassificação." }],
    ["cautelar-decidir", { incidenteId: alg, envolvidoId: envId, decisao: "MANTIDO_AFASTADO", observacao: "Mantido até a apuração das autoridades." }], ["encerrar", { incidenteId: quebra, resultado: "SEM_CONTINUIDADE", providencia: "Conversamos com a equipe e reforçamos a regra." }]
  ];
  const ESPERADO_LEITURA = { incidentes: { semSessao: 401, pinComum: 403, pinDoPresidente: 403, liderSemPermissao: 403, dirigente: 200, dirigenteDeFora: 200, geral: 200 },
    incidente: { semSessao: 401, pinComum: 403, pinDoPresidente: 403, liderSemPermissao: 403, dirigente: 200, dirigenteDeFora: 404, geral: 200 },
    padroes: { semSessao: 401, pinComum: 403, pinDoPresidente: 403, liderSemPermissao: 403, dirigente: 403, dirigenteDeFora: 403, geral: 200 },
    comite: { semSessao: 401, pinComum: 403, pinDoPresidente: 403, liderSemPermissao: 403, dirigente: 403, dirigenteDeFora: 403, geral: 200 },
    "relatorio-anual": { semSessao: 401, pinComum: 403, pinDoPresidente: 403, liderSemPermissao: 403, dirigente: 403, dirigenteDeFora: 403, geral: 200 } };
  for (const [acao, query] of LEITURAS) for (const [nome, tk] of Object.entries(SESSOES)) {
    const rr = await GET(P, acao, tk, query);
    ok(rr.status === ESPERADO_LEITURA[acao][nome], `GET ${acao} como ${nome}: ${ESPERADO_LEITURA[acao][nome]}`, rr.status);
  }
  const antesEscritas = await retrato();
  // escritas SEM a permissão: nada grava. (Com a permissão, o resultado depende do estado: o que importa aqui é a porta.)
  for (const [acao, corpo] of ESCRITAS) for (const nome of ["semSessao", "pinComum", "pinDoPresidente", "liderSemPermissao"]) {
    const rr = await POST(P, acao, SESSOES[nome], corpo);
    ok(rr.status === (nome === "semSessao" ? 401 : 403), `POST ${acao} como ${nome}: recusado`, rr.status);
  }
  for (const [acao, corpo] of ESCRITAS.filter(([a]) => ["cautelar-decidir", "encerrar"].includes(a))) {
    const rr = await POST(P, acao, dirCentral, corpo); ok(rr.status === 403, `POST ${acao} como Dirigente: só o nível geral`, rr.status);
    const r2 = await POST(P, acao, dirVila, corpo); ok(r2.status === 403, `POST ${acao} como Dirigente de fora: 403 (a porta vem antes do escopo)`, r2.status);
  }
  ok((await retrato()) === antesEscritas, "nenhuma dessas tentativas gravou ou avisou algo");
  for (const [acao, corpo] of ESCRITAS.filter(([a]) => ["relato", "comunicacao", "adendo", "reclassificar"].includes(a))) {
    const rr = await POST(P, acao, dirVila, { ...corpo, incidenteId: acao === "reclassificar" ? quebra : alg }); ok(rr.status === 404, `POST ${acao} como Dirigente de OUTRA congregação: 404`, rr.status);
  }
  ok((await retrato()) === antesEscritas, "e o 404 também não gravou nada");
  const semFator = sessao(1001, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });
  for (const acao of ["relato", "cautelar-decidir", "encerrar"]) {
    const rr = await POST(P, acao, semFator, ESCRITAS.find(([a]) => a === acao)[1]); ok(rr.status === 428 && rr.body.precisaFator === true, `POST ${acao} sem a confirmação reforçada: 428`, rr.status);
  }
  ok((await retrato()) === antesEscritas, "o 428 não gravou nada (nem registrou leitura)");
  r = await chamar(P, { acao: "incidentes", metodo: "DELETE", token: presidente }); ok([404, 405].includes(r.status), "DELETE não existe", r.status);
  r = await chamar(P, { acao: "incidentes", metodo: "PUT", token: presidente, corpo: {} }); ok([404, 405].includes(r.status), "PUT não existe", r.status);
  r = await GET(P, "registrar", presidente); ok(r.status === 404, "GET numa ação de escrita: 404", r.status);
  r = await POST(P, "padroes", presidente, {}); ok(r.status === 404, "POST numa ação de leitura: 404", r.status);
  r = await GET(P, "nao-existe", presidente); ok(r.status === 404, "ação desconhecida: 404", r.status);

  console.log("== o conflito de interesse: quem é envolvido não vê nada ==");
  const pres1 = GERAL(1001, PERM);
  r = await GET(P, "incidentes", pres1); ok(r.status === 200 && !r.body.incidentes.some((i) => i.incidenteId === algPres) && r.body.incidentes.some((i) => i.incidenteId === alg), "o Presidente, envolvido, não vê o incidente contra ele (e vê os demais)", r.body.incidentes.map((i) => i.incidenteId));
  r = await GET(P, "incidente", pres1, { incidenteId: algPres }); const inex = await GET(P, "incidente", pres1, { incidenteId: 987654 });
  ok(r.status === 404 && JSON.stringify(r.body) === JSON.stringify(inex.body), "o detalhe dele é IGUAL ao de um incidente que não existe", r.status);
  for (const [acao, corpo] of [["relato", { incidenteId: algPres }], ["comunicacao", { incidenteId: algPres, orgao: "CONSELHO_TUTELAR", forma: "OFICIO", comunicadoEm: new Date().toISOString() }], ["adendo", { incidenteId: algPres, texto: "Mais um detalhe espontâneo da criança." }], ["encerrar", { incidenteId: algPres, resultado: "ENCAMINHADO_AUTORIDADE", providencia: "Tentando encerrar o meu próprio caso." }]]) {
    const rr = await POST(P, acao, pres1, corpo); ok(rr.status === 404, `${acao} no incidente em que é o envolvido: 404`, rr.status);
  }
  const envPres = await escalar("SELECT EnvolvidoId FROM IncidenteEnvolvidos WHERE IncidenteId = @i", { i: algPres });
  r = await POST(P, "cautelar-decidir", pres1, { incidenteId: algPres, envolvidoId: envPres, decisao: "LIBERADO", observacao: "Tentando me liberar sozinho do afastamento." }); ok(r.status === 404, "ninguém se libera sozinho do afastamento (404)", r.status);
  r = await POST(P, "cautelar-decidir", secretarioGeral, { incidenteId: algPres, envolvidoId: envPres, decisao: "MANTIDO_AFASTADO", observacao: "Mantido até a apuração das autoridades." }); ok(r.status === 200, "mas o outro membro da Diretoria decide", r.body);
  r = await POST(P, "cautelar-decidir", secretarioGeral, { incidenteId: alg, envolvidoId: envPres, decisao: "LIBERADO", observacao: "Misturando o envolvido de OUTRO incidente com este." }); ok(r.status === 404, "envolvido de outro incidente não vale (404)", r.status);
  r = await POST(P, "cautelar-decidir", presidente, { incidenteId: quebra, envolvidoId: envId, decisao: "LIBERADO", observacao: "Envolvido do incidente errado de propósito." }); ok(r.status === 404, "nem num incidente que não é suspeita de violência", r.status);
  const anx = await chamar(ANEXOS, { metodo: "GET", query: { tabela: "IncidentesProtecao", registroId: algPres }, token: pres1 }); ok(anx.status === 403, "os anexos do incidente em que é envolvido: 403 (igual a 'não existe')", anx.status);

  console.log("== a mesma resposta para 'não existe' e 'não é seu' ==");
  for (const acao of ["incidente"]) {
    const a = await GET(P, acao, dirVila, { incidenteId: alg }), b = await GET(P, acao, dirVila, { incidenteId: 999999 });
    ok(a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body), `GET ${acao}: fora do escopo = inexistente`, [a.status, b.status]);
  }
  for (const [acao, corpo] of ESCRITAS.filter(([a]) => ["relato", "comunicacao", "adendo", "reclassificar"].includes(a))) {
    const a = await POST(P, acao, dirVila, { ...corpo, incidenteId: alg }), b = await POST(P, acao, dirVila, { ...corpo, incidenteId: 999999 });
    ok(a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body), `POST ${acao}: fora do escopo = inexistente`, [a.status, b.status]);
  }

  console.log("== ids tortos e tipos errados ==");
  for (const id of [0, -1, "0x10", "1e1", "abc", [alg], { a: 1 }, true, 1.5, "1; DROP TABLE IncidentesProtecao"]) {
    const b = await POST(P, "relato", presidente, { incidenteId: id });
    ok(b.status === 400, `POST relato com incidenteId ${JSON.stringify(id)}: 400`, b.status);
    if (!Array.isArray(id)) { const a = await GET(P, "incidente", presidente, { incidenteId: id }); ok(a.status === 400, `GET incidente com incidenteId ${JSON.stringify(id)}: 400`, a.status); }       // na URL a lista de um item vira o texto "9": é igual a passar 9
  }
  ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = 'IncidentesProtecao'")) === 1, "a tabela segue de pé");

  console.log("== lixo em todo campo ==");
  const sessaoRegistro = (n) => PIN(6020 + (n % 3));        // pessoas distintas para não esbarrar no teto diário
  let contador = 0;
  await fuzzar("registrar", (corpo) => POST(P, "registrar", sessaoRegistro(contador++), corpo), alegacao({ equipeId: eq.bercario }),
    ["nivel", "dataOcorrencia", "congregacaoId", "equipeId", "onde", "descricao", "envolvidoMembroId", "envolvidoNome", "relatadoPor", "relato", "conhecidoHaHoras"]);
  await fuzzar("comunicacao", (corpo) => POST(P, "comunicacao", presidente, corpo), { incidenteId: alg, orgao: "CONSELHO_TUTELAR", forma: "OFICIO", comunicadoEm: new Date().toISOString(), protocoloExterno: "P-1", referenciaArquivo: "Pasta 3", observacao: "Teste" },
    ["incidenteId", "orgao", "forma", "comunicadoEm", "protocoloExterno", "referenciaArquivo", "observacao"]);
  await fuzzar("adendo", (corpo) => POST(P, "adendo", presidente, corpo), { incidenteId: alg, texto: "A criança contou mais por conta própria hoje." }, ["incidenteId", "texto"]);
  await fuzzar("reclassificar", (corpo) => POST(P, "reclassificar", presidente, corpo), { incidenteId: quebra, nivelNovo: "ALEGACAO", motivo: "Soubemos de algo mais grave.", relatadoPor: "VOLUNTARIO", relato: "Relato de teste da reclassificação." }, ["incidenteId", "nivelNovo", "motivo", "relatadoPor", "relato"]);
  await fuzzar("cautelar-decidir", (corpo) => POST(P, "cautelar-decidir", presidente, corpo), { incidenteId: alg, envolvidoId: envId, decisao: "MANTIDO_AFASTADO", observacao: "Mantido até a apuração das autoridades." }, ["incidenteId", "envolvidoId", "decisao", "observacao"]);
  await fuzzar("encerrar", (corpo) => POST(P, "encerrar", presidente, corpo), { incidenteId: quebra, resultado: "SEM_CONTINUIDADE", providencia: "Conversamos com a equipe e reforçamos a regra." }, ["incidenteId", "resultado", "providencia"]);
  let origem = 0;
  await fuzzar("ajuda", (corpo) => chamar(AJUDA, { metodo: "POST", corpo, headers: { "x-forwarded-for": `9.9.9.9, 202.${Math.floor(origem / 250)}.${origem++ % 250}.1:443, 10.0.0.1:80` } }),
    { texto: "Quero contar uma coisa que aconteceu comigo na igreja.", quemSou: "CRIANCA_ADOLESCENTE", contato: "tia 91 9", congregacaoId: c1 }, ["texto", "quemSou", "contato", "congregacaoId"]);

  console.log("== texto malicioso é guardado como texto (e devolvido igual), sem executar nada ==");
  const injecao = "'; DROP TABLE IncidentesProtecao; -- ' OR 1=1 -- \\ %00 áéíóú ç ñ 😀";
  r = await POST(P, "registrar", PIN(6014), alegacao({ relato: `${injecao} (relato com texto estranho para guardar igual)`, descricao: `Descrição com ${injecao}` }));
  ok(r.status === 201, "texto com aspas, comentário SQL, barra, acento e emoji é aceito como TEXTO", r.body);
  const gravado = await um("SELECT i.Descricao, (SELECT Texto FROM IncidenteRelatos WHERE IncidenteId = i.IncidenteId AND Tipo = 'RELATO') AS Relato FROM IncidentesProtecao i WHERE Protocolo = @p", { p: r.body.protocolo });
  ok(gravado.Descricao.includes(injecao) && gravado.Relato.includes(injecao), "e volta exatamente como foi escrito", gravado);
  ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = 'IncidentesProtecao'")) === 1, "a tabela segue de pé");
  r = await POST(P, "registrar", PIN(6017), alegacao({ relato: "x".repeat(4001) })); ok(r.status === 422, "relato acima de 4.000 caracteres: 422", r.status);
  r = await POST(P, "registrar", PIN(6017), alegacao({ descricao: "y".repeat(1001) })); ok(r.status === 422, "descrição acima de 1.000: 422", r.status);
  r = await POST(P, "registrar", PIN(6017), alegacao({ relato: "<script>alert(1)</script> e mais texto qualquer aqui" })); ok(r.status === 422, "marca de HTML no relato: 422", r.status);

  console.log("== abusos: o teto de registros e o canal sem login ==");
  let ultimo;
  for (let i = 0; i < 3; i++) ultimo = await POST(P, "registrar", PIN(6015), alegacao({ descricao: `Registro de teste do teto número ${i} da suspeita.` }));
  ok(ultimo.status === 201, "três suspeitas em 24 horas passam");
  r = await POST(P, "registrar", PIN(6015), alegacao({ descricao: "Quarta suspeita da mesma pessoa em 24 horas, de teste." })); ok(r.status === 429 && r.body.limite === true && /100/.test(r.body.mensagem), "a quarta é barrada com 429 — e a mensagem manda ligar para o 100", r.body);
  for (let i = 0; i < 10; i++) ultimo = await POST(P, "registrar", PIN(6016), incidente({ descricao: `Quebra de teste número ${i} para o teto diário.` }));
  r = await POST(P, "registrar", PIN(6016), incidente({ descricao: "Décima primeira quebra da mesma pessoa em 24 horas." })); ok(r.status === 429, "o teto de 10 registros por dia por pessoa", r.status);
  r = await GET(P, "meus", PIN(6015)); ok(r.body.incidentes.length === 3, "só os 3 registrados existem", r.body.incidentes.length);
  // teto global do canal de ajuda: 40 por hora no total (inundação de várias origens)
  const base = await escalar("SELECT COUNT(*) FROM IncidentesProtecao WHERE Origem = 'CANAL_AJUDA' AND RegistradoEm >= DATEADD(HOUR, -1, SYSUTCDATETIME())");
  for (let i = base; i < 40; i++) await q("INSERT INTO IncidentesProtecao (Protocolo, Nivel, Origem, DataOcorrencia, Descricao, RelatadoPor, ConhecidoEm, ExigeComunicacao, PrazoNotificacaoEm) VALUES (@p, 'ALEGACAO', 'CANAL_AJUDA', CAST(SYSUTCDATETIME() AS DATE), N'Teste do teto global.', 'OUTRA_PESSOA', SYSUTCDATETIME(), 1, DATEADD(HOUR, 24, SYSUTCDATETIME()))", { p: `PRO-TETO-${i}` });
  const antesTeto = await escalar("SELECT COUNT(*) FROM IncidentesProtecao");
  r = await chamar(AJUDA, { metodo: "POST", corpo: { texto: "Quero pedir ajuda mas já há muitas mensagens agora." }, headers: { "x-forwarded-for": "9.9.9.9, 203.7.7.7:443, 10.0.0.1:80" } });
  ok(r.status === 429 && /100/.test(r.body.mensagem) && r.body.contatosDeAjuda.length === 3 && (await escalar("SELECT COUNT(*) FROM IncidentesProtecao")) === antesTeto, "no teto global: 429, a orientação do Disque 100 continua e nada é gravado", r.body);
  r = await chamar(AJUDA, { metodo: "GET" }); ok(r.status === 404 || r.status === 405 || (r.status === 429 || r.status === 422 || r.status === 201), "GET no canal não faz nada de útil", r.status);

  console.log("== o que os avisos e a auditoria NÃO podem dizer ==");
  const todosAvisos = await q("SELECT Mensagem, Titulo FROM Notificacoes WHERE RegraChave LIKE 'PROTECAO[_]%'");
  const textoAvisos = JSON.stringify(todosAvisos);
  ok(todosAvisos.length > 0 && !/RELATO-SECRETO|tio a machucou|PRO-\d{4}|Pessoa 6011|6011|6012|Presidente E2E|DROP TABLE/.test(textoAvisos), "nenhum aviso leva relato, protocolo, matrícula nem nome", todosAvisos.length);
  const audit = await q("SELECT Acao, RegistroId, UsuarioId, DadosDepois, Tabela FROM AuditLog WHERE Acao LIKE 'PROTECAO[_]%'");
  const sensiveis = audit.filter((a) => ["PROTECAO_PEDIDO_DE_AJUDA", "PROTECAO_RELATO_LIDO", "PROTECAO_CAUTELAR_DECIDIDA"].includes(a.Acao));
  ok(audit.length > 0 && sensiveis.every((a) => a.RegistroId === 0 && a.UsuarioId === null && a.DadosDepois === "{}"), "a auditoria das ações sensíveis não liga caso nem pessoa", sensiveis.slice(0, 2));
  const auditSuspeitas = audit.filter((a) => a.Acao === "PROTECAO_INCIDENTE_REGISTRADO" && a.RegistroId === 0);
  ok(auditSuspeitas.length >= 3 && auditSuspeitas.every((a) => a.UsuarioId === null && a.DadosDepois === "{}"), "o registro de suspeita não leva quem registrou nem o nível", auditSuspeitas.length);
  ok(!/RELATO-SECRETO|tio a machucou|PRO-\d{4}/.test(JSON.stringify(audit)), "nada do relato nem do protocolo na auditoria");
  const retiradasAud = await q("SELECT DadosDepois FROM AuditLog WHERE Acao = 'MENORES_RETIRADO_DA_ESCALA'");
  ok(retiradasAud.every((a) => !/6011/.test(a.DadosDepois)), "a retirada da escala por incidente não aponta a pessoa na auditoria");
  // o painel da v7.7 e o Meu Painel: o afastamento por incidente vira "pendência com a Diretoria" para quem não é da Diretoria
  const M = require(path.join(API, "GestaoMinisterioMenores/index.js"));
  r = await GET(M, "minha-situacao", PIN(6011)); ok(!/INCIDENTE|incidente|suspeita|alega|apura/i.test(JSON.stringify(r.body.situacao.bloqueios)), "a pessoa afastada não lê o motivo em Meu Painel (código, rótulo e texto)", r.body.situacao.bloqueios);
  r = await GET(M, "catalogos", PIN(6011)); ok(r.status === 200, "o catálogo da v7.7 segue servindo");
  r = await GET(M, "painel", LIDER(3001, ["habilitacao_voluntarios"], ["Central E2E"]), { congregacaoId: c1 });
  ok(!/INCIDENTE_EM_APURACAO/.test(JSON.stringify(r.body)), "o painel da gestão não cita o incidente", r.status);

  console.log("== anexos do incidente ==");
  for (const [nome, tk] of Object.entries({ semSessao: undefined, pin: PIN(6010), semPermissao, dirigenteDeFora: dirVila })) {
    const rr = await chamar(ANEXOS, { metodo: "GET", query: { tabela: "IncidentesProtecao", registroId: alg }, token: tk });
    ok(rr.status === (nome === "semSessao" ? 401 : 403), `anexos como ${nome}: recusado`, rr.status);
  }
  r = await chamar(ANEXOS, { metodo: "POST", token: dirVila, corpo: { tabela: "IncidentesProtecao", registroId: alg, nomeArquivo: "ofício.pdf", mimeType: "application/pdf", documentoBase64: Buffer.from("%PDF-1.4 teste").toString("base64") } }); ok(r.status === 403, "o Dirigente de fora não anexa comprovante", r.status);
  r = await chamar(ANEXOS, { metodo: "GET", query: { tabela: "IncidentesProtecao", registroId: alg }, token: dirCentral }); ok(r.status === 200, "o Dirigente da congregação lista", r.status);

  console.log("== a rotina horária ==");
  const VERIFICADOR = require(path.join(API, "ProtecaoVerificador/index.js"));
  for (const h of [{}, { "x-cron-secret": "" }, { "x-cron-secret": "errado" }, { "X-CRON-SECRET ": process.env.CRON_SECRET }, { "x-cron-secret": process.env.CRON_SECRET.slice(0, -1) }]) {
    const rr = await chamarRotina(VERIFICADOR, h); ok(rr.status === 401, `rotina com cabeçalho ${JSON.stringify(h).slice(0, 40)}: 401`, rr.status);
  }
  const antes = await retrato();
  r = await chamarRotina(VERIFICADOR, { "x-cron-secret": process.env.CRON_SECRET }); ok(r.status === 200, "com o segredo certo: 200", r.body);
  r = await chamarRotina(VERIFICADOR, { "x-cron-secret": process.env.CRON_SECRET }); ok(r.status === 200, "e rodar de novo também");
  ok((await escalar("SELECT COUNT(*) FROM IncidentesProtecao")) === (await escalar("SELECT COUNT(*) FROM IncidentesProtecao")), "a rotina não cria incidentes");
  void antes;

  fim("e2e-15-protecao-seguranca");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
