// e2e-5-seguranca.js — a bateria de ataque da v7.6: sessão forjada, atribuição em massa, IP forjado, matriz ator × ação, injeção e lixo em todo campo, nunca 500 e nunca
// uma chamada recusada alterando o banco. Roda DEPOIS do e2e-3 na mesma base (precisa dos setores já com gente servindo).
const fs = require("fs");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, chamar, GERAL, LIDER, PIN, IP_PUBLICO, API, path, fuzz, retrato } = L;
const H = require(path.join(API, "GestaoSetoresTecnicos/index.js"));
const V = require(path.join(API, "GestaoVistoriasAntecedentes/index.js"));
const cen = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario.json"), "utf8"));
const S = cen.setores, C = cen.cong;
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const presidente = GERAL(1001, TUDO), secretario = GERAL(1002, TUDO), gestora = GERAL(1003, ["setores_tecnicos"]);
const dirCentral = LIDER(3001, ["reunioes", "pessoas"], ["Central E2E"]), dirVila = LIDER(3002, ["reunioes", "pessoas"], ["Vila Nova E2E"]), dirBeta = LIDER(3004, ["reunioes", "pessoas"], ["Beta E2E"]);
const pastor = LIDER(3003, ["reunioes", "pessoas"], ["Central E2E", "Vila Nova E2E"], "AREA");
const hoje = L.hojeBr();

// Cria direto no banco (sem o limite de emissão) atos novos para a matriz.
async function novoAto(tipo, { emitente = 2002, setor = S.SEGURANCA, congregacao = C.central.id, canal = null } = {}) {
  const v = await escalar("SELECT TOP 1 VinculoId FROM SetoresTecnicosMembros WHERE MembroId = @m AND SetorId = @s AND Status = 'ATIVO'", { m: emitente, s: setor });
  const motivo = tipo === "INTERDICAO" ? "RISCO_DESABAMENTO" : "ERRO_GROSSEIRO";
  const ref = tipo === "REMOCAO_POSTAGEM" ? "https://exemplo.org/p/" + Math.random().toString(36).slice(2) : null;
  return (await q(`INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, CanalId, Motivo, Objeto, Referencia, Descricao, Status)
    VALUES (@t, @s, @v, @e, @c, @ca, @mo, N'Objeto de teste da matriz', @ref, N'Justificativa de teste da matriz de autorização.', 'EMITIDA'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`,
    { t: tipo, s: setor, v, e: emitente, c: congregacao, ca: canal, mo: motivo, ref }))[0].id;
}
const statusDe = (id) => escalar("SELECT Status FROM SetoresTecnicosIntervencoes WHERE IntervencaoId = @i", { i: id });

(async () => {
  console.log("== sessão forjada ==");
  const trocarPayload = (token, mudar) => { const [p, s] = token.split("."); const obj = JSON.parse(Buffer.from(p, "base64url").toString("utf8")); mudar(obj); return Buffer.from(JSON.stringify(obj)).toString("base64url") + "." + s; };
  const forjados = {
    "assinatura trocada": presidente.slice(0, -4) + "AAAA",
    "permissão acrescentada no corpo": trocarPayload(PIN(2005), (o) => { o.permissoes = TUDO; o.nivel = "GLOBAL"; o.escopoCongregacoes = "TODAS"; o.via = "SENHA"; }),
    "matrícula trocada no corpo": trocarPayload(PIN(2005), (o) => { o.membroId = 1001; }),
    "sem assinatura": presidente.split(".")[0],
    "lixo": "a.b.c"
  };
  for (const [rotulo, t] of Object.entries(forjados)) {
    for (const [h, acao, metodo] of [[H, "decidir", "POST"], [H, "setor", "POST"], [H, "atos", "GET"], [V, "lavrar", "POST"], [V, "lista", "GET"]]) {
      const r = await chamar(h, { acao, metodo, token: t, corpo: {} }); ok(r.status === 401, `token forjado (${rotulo}) em ${acao}: 401`, r.status);
    }
  }

  console.log("== atribuição em massa e origem forjada ==");
  let r = await POST(H, "candidatar", PIN(2012), { setorId: S.TI, formacao: "Profissional de TI", membroId: 2001, status: "ATIVO", origem: "INDICACAO", aprovadoPorMembroId: 1001, criadoPorMembroId: 1001, ativadoEm: "2026-01-01", encerradoEm: "2026-01-01" });
  ok(r.status === 201, "candidatura com campos de controle no corpo é aceita (e os campos são ignorados)", r.body);
  const vm = await um("SELECT * FROM SetoresTecnicosMembros WHERE VinculoId = @v", { v: r.body.vinculoId });
  ok(vm.MembroId === 2012 && vm.Status === "CANDIDATO" && vm.Origem === "CANDIDATURA" && vm.CriadoPorMembroId === 2012 && vm.AprovadoPorMembroId === null && vm.AtivadoEm === null, "o vínculo é de quem está logado, candidato, sem aprovação", vm);
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosMembros WHERE MembroId = 2001 AND SetorId = @s", { s: S.TI })) === 0, "nada foi criado para a matrícula que veio no corpo");
  const vTI = vm.VinculoId;
  r = await POST(H, "aprovar", gestora, { vinculoId: vTI, status: "ATIVO", aprovadoPorMembroId: 99999 }); ok(r.status === 200, "aprovar");
  const ap = await um("SELECT Status, AprovadoPorMembroId FROM SetoresTecnicosMembros WHERE VinculoId = @v", { v: vTI }); ok(ap.Status === "AGUARDANDO_TERMO" && ap.AprovadoPorMembroId === 1003, "aprovar vai para AGUARDANDO_TERMO (não pula para ATIVO) e registra quem aprovou de verdade", ap);
  r = await POST(H, "aceitar-termo", PIN(2012), { vinculoId: vTI, aceito: true, enderecoIp: "1.1.1.1", termoHash: "0".repeat(64), forma: "FICHA_FISICA", cadeiaCabecalhos: "forjada" }, { "x-azure-clientip": "8.8.8.8" });
  ok(r.status === 422 && /origem da conexão/.test(r.body.mensagem), "só x-azure-clientip (que o cliente escreve) não prova a origem: o aceite é recusado");
  // (Uma entrada só no x-forwarded-for é o pedido direto à Function — fora do Static Web Apps, que sempre acrescenta o IP real e o do proxy; a regra da v7.5 a aceita.)
  r = await POST(H, "aceitar-termo", PIN(2012), { vinculoId: vTI, aceito: true }, { "x-forwarded-for": "10.1.2.3, 9.9.9.9" }); ok(r.status === 422, "cadeia cujo penúltimo valor é privado não prova a origem", r.body);
  // O hash que a tela mostrou é parte do aceite: ausente, forjado ou de outro texto, o servidor recusa sem gravar nada.
  for (const [rotulo, extra] of [["sem o hash", { termoHash: undefined }], ["com hash forjado (zeros)", { termoHash: "0".repeat(64) }], ["com hash de outro tipo", { termoHash: [1] }], ["com hash vazio", { termoHash: "" }]]) {
    r = await POST(H, "aceitar-termo", PIN(2012), { vinculoId: vTI, aceito: true, ...extra }, IP_PUBLICO);
    ok(r.status === 422 && /texto do Termo mudou/.test(r.body.mensagem), "aceite " + rotulo + ": 422, o texto não lido não se aceita", r.body);
  }
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosAdesoes WHERE VinculoId = @v", { v: vTI })) === 0, "nenhum aceite recusado gravou adesão");
  // IP, forma e cadeia forjados no corpo são ignorados; o hash verdadeiro (em maiúsculas, com espaços) vale.
  const hashReal = await L.termoHashDo(H, PIN(2012), vTI);
  r = await POST(H, "aceitar-termo", PIN(2012), { vinculoId: vTI, aceito: true, enderecoIp: "1.1.1.1", termoHash: "  " + String(hashReal).toUpperCase() + " ", forma: "FICHA_FISICA", cadeiaCabecalhos: "forjada" }, IP_PUBLICO); ok(r.status === 201, "aceite com cabeçalho confiável e o hash que a tela mostrou", r.body);
  const ad = await um("SELECT * FROM SetoresTecnicosAdesoes WHERE VinculoId = @v", { v: vTI });
  ok(ad.Forma === "CLICKWRAP" && ad.EnderecoIp === "177.8.9.10" && ad.TermoHash !== "0".repeat(64) && !/forjada/.test(ad.CadeiaCabecalhos), "IP, hash e forma vêm do servidor, nunca do corpo", ad);
  r = await POST(H, "interdicao", PIN(2002), { congregacaoId: C.central.id, motivo: "RISCO_DESABAMENTO", objeto: "Fachada principal", descricao: "A marquise apresenta ferragem exposta e pedaços de concreto soltos.",
    emitidaPorMembroId: 1001, status: "RATIFICADA", registroProfissional: "CREA 999", decididaPorMembroId: 1001, vinculoId: 1, setorId: S.ENGENHARIA });
  ok(r.status === 422 || r.status === 201, "interdição com campos de controle no corpo", r.body);
  if (r.status === 422) { ok(/não serve nesse setor/.test(r.body.mensagem), "setorId de outro setor (onde a pessoa não serve) é recusado, não aceito", r.body); r = await POST(H, "interdicao", PIN(2002), { congregacaoId: C.central.id, motivo: "RISCO_DESABAMENTO", objeto: "Fachada principal", descricao: "A marquise apresenta ferragem exposta e pedaços de concreto soltos.", emitidaPorMembroId: 1001, status: "RATIFICADA", registroProfissional: "CREA 999", decididaPorMembroId: 1001, vinculoId: 1 }); }
  const at = await um("SELECT * FROM SetoresTecnicosIntervencoes WHERE IntervencaoId = @i", { i: r.body.intervencaoId });
  ok(at && at.EmitidaPorMembroId === 2002 && at.Status === "EMITIDA" && at.RegistroProfissional === null && at.DecididaPorMembroId === null && at.SetorId === S.SEGURANCA, "o ato é de quem está logado, EMITIDA, sem decisão, com o registro do banco (nenhum) e o setor onde serve", at);

  console.log("== matriz ator × ação nos atos (cada célula com um ato novo) ==");
  const ATORES = {
    emitente: PIN(2002), outroDoSetor: PIN(2010), estranho: PIN(2012), engenheira: PIN(2001), comunicacao: PIN(2011), adminCanal: PIN(4001),
    dirCentral, dirVila, dirBeta, pastor, gestora, presidente, secretario
  };
  // Interdição: decidir (RATIFICAR) só a Diretoria (e nunca o emitente); levantar: emitente (ainda no setor) e Diretoria.
  const permitidoInterdicao = { decidir: new Set(["presidente", "secretario"]), levantar: new Set(["emitente", "presidente", "secretario"]) };
  for (const [acao, corpoDe] of [["decidir", () => ({ decisao: "RATIFICAR" })], ["levantar", () => ({ observacao: "Observação suficiente para o levantamento." })]]) {
    for (const [nome, token] of Object.entries(ATORES)) {
      const id = await novoAto("INTERDICAO");
      const antes = await retrato();
      const r = await chamar(H, { acao, metodo: "POST", token, corpo: { intervencaoId: id, ...corpoDe() } });
      const permitido = permitidoInterdicao[acao].has(nome);
      const mudou = (await statusDe(id)) !== "EMITIDA";
      ok(permitido ? (r.status === 200 && mudou) : (r.status >= 400 && r.status < 500 && !mudou), `interdição/${acao}: ${nome} ${permitido ? "pode" : "NÃO pode"}`, [r.status, r.body && r.body.mensagem]);
      if (!permitido) ok((await retrato()) === antes, `interdição/${acao}: a recusa de ${nome} não mexeu no banco`);
    }
  }
  // Pedido de remoção de postagem (canal da Central; emitente: Comunicação 2011, que serve com o poder).
  const permitidoRemocao = { atender: new Set(["adminCanal", "dirCentral", "pastor", "gestora", "presidente", "secretario"]), cancelar: new Set(["comunicacao"]), decidir: new Set(["presidente", "secretario"]) };
  for (const [acao, corpoDe] of [["atender", () => ({ observacao: "Postagem retirada do ar." })], ["cancelar", () => ({ observacao: "Foi engano meu, cancelo o pedido." })], ["decidir", () => ({ decisao: "REVOGAR", observacao: "A postagem está correta e autorizada." })]]) {
    for (const [nome, token] of Object.entries(ATORES)) {
      const id = await novoAto("REMOCAO_POSTAGEM", { emitente: 2011, setor: S.COMUNICACAO, canal: cen.canalId });
      const r = await chamar(H, { acao, metodo: "POST", token, corpo: { intervencaoId: id, ...corpoDe() } });
      const permitido = permitidoRemocao[acao].has(nome);
      const mudou = (await statusDe(id)) !== "EMITIDA";
      ok(permitido ? (r.status === 200 && mudou) : (r.status >= 400 && r.status < 500 && !mudou), `remoção/${acao}: ${nome} ${permitido ? "pode" : "NÃO pode"}`, [r.status, r.body && r.body.mensagem]);
    }
  }
  // Leitura da lista geral e do detalhe: quem vê o quê.
  const idLeitura = await novoAto("REMOCAO_POSTAGEM", { emitente: 2011, setor: S.COMUNICACAO, canal: cen.canalId });
  const veAto = new Set(["comunicacao", "adminCanal", "dirCentral", "pastor", "gestora", "presidente", "secretario"]);
  for (const [nome, token] of Object.entries(ATORES)) {
    const r = await GET(H, "ato", token, { intervencaoId: idLeitura });
    ok(veAto.has(nome) ? r.status === 200 : r.status === 404, `ato: ${nome} ${veAto.has(nome) ? "vê" : "recebe 404"}`, r.status);
    const lista = await GET(H, "atos", token);
    ok(["gestora", "presidente", "secretario"].includes(nome) ? lista.status === 200 : lista.status === 403, `lista geral de atos: ${nome}`, lista.status);
  }

  console.log("== os mesmos 403 nas ações de gestão (todos os não-gestores) ==");
  const naoGestores = Object.entries(ATORES).filter(([n]) => !["gestora", "presidente", "secretario"].includes(n));
  const antes = await retrato();
  for (const [nome, token] of naoGestores) {
    for (const [acao, corpo] of [["setor", { nome: "Setor Intruso", competencia: "Setor criado por quem não pode." }], ["setor-editar", { setorId: S.TI, nome: "Hackeado", competencia: "Competência trocada por intruso." }], ["setor-ativo", { setorId: S.TI, ativo: false }],
      ["indicar", { membroId: 2005, setorId: S.TI, formacao: "Intruso" }], ["aprovar", { vinculoId: 1 }], ["recusar", { vinculoId: 1 }], ["encerrar", { vinculoId: 1, tipoMotivo: "OUTRO" }], ["registrar-termo", { vinculoId: 1, forma: "FICHA_FISICA", dataAceite: hoje, referencia: "ficha" }]]) {
      const r = await POST(H, acao, token, corpo); ok(r.status === 403, `${acao}: ${nome} → 403`, r.status);
    }
    const lv = await GET(H, "vinculos", token); ok(lv.status === 403, `vinculos: ${nome} → 403`, lv.status);
  }
  ok((await retrato()) === antes, "nenhuma dessas recusas alterou o banco");

  console.log("== lixo em todo campo de toda ação: nunca 500, nunca vazamento, recusa nunca altera o banco ==");
  const vCand = (await q("INSERT INTO SetoresTecnicosMembros (SetorId, MembroId, Status, Origem, Formacao, CriadoPorMembroId) VALUES (@s, 2012, 'CANDIDATO', 'CANDIDATURA', N'Fuzz', 2012); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { s: S.EDUCACAO }))[0].id;
  const vAguarda = (await q("INSERT INTO SetoresTecnicosMembros (SetorId, MembroId, Status, Origem, Formacao, CriadoPorMembroId, AprovadoPorMembroId, AprovadoEm) VALUES (@s, 2012, 'AGUARDANDO_TERMO', 'INDICACAO', N'Fuzz', 1003, 1003, SYSUTCDATETIME()); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { s: S.CULTURA_ARTES }))[0].id;
  const idAto = await novoAto("INTERDICAO"), idRem = await novoAto("REMOCAO_POSTAGEM", { emitente: 2011, setor: S.COMUNICACAO, canal: cen.canalId });
  const cenarios = [
    ["candidatar", PIN(2007), { setorId: S.TI, formacao: "Profissional de TI", conselhoSigla: "CREA", registroNumero: "123" }, ["setorId", "formacao", "conselhoSigla", "registroNumero"]],
    ["candidatar", PIN(2012), { setorId: S.TRANSPORTE, formacao: "Motorista", conselhoSigla: "CNH", registroNumero: "123" }, ["setorId", "formacao", "conselhoSigla", "registroNumero"]],
    ["indicar", gestora, { membroId: 2005, setorId: S.HISTORIA_ACERVO, formacao: "Historiadora", conselhoSigla: "CREA", registroNumero: "123" }, ["membroId", "setorId", "formacao", "conselhoSigla", "registroNumero"]],
    ["setor", gestora, { nome: "Setor de Fuzz", competencia: "Competência do setor de fuzz para teste.", profissoes: "Testadores", conselhoClasse: "CONFUZZ", inciso: "XXI", exigeRegistro: false, podeInterditar: false, podeSolicitarRemocao: false, ordem: 5 }, ["nome", "competencia", "profissoes", "conselhoClasse", "inciso", "exigeRegistro", "podeInterditar", "podeSolicitarRemocao", "ordem"]],
    ["setor-editar", gestora, { setorId: S.LIBRAS, nome: "Setor de Interpretação e Libras", competencia: "Acessibilidade comunicacional nos cultos.", exigeRegistro: false, ordem: 20 }, ["setorId", "nome", "competencia", "exigeRegistro", "ordem"]],
    ["setor-ativo", gestora, { setorId: S.LIBRAS, ativo: true }, ["setorId", "ativo"]],
    ["aprovar", gestora, { vinculoId: vCand }, ["vinculoId"]],
    ["recusar", gestora, { vinculoId: vCand, observacao: "Sem vaga no momento." }, ["vinculoId", "observacao"]],
    ["encerrar", gestora, { vinculoId: vAguarda, tipoMotivo: "MUDANCA", observacao: "Mudou de área." }, ["vinculoId", "tipoMotivo", "observacao"]],
    ["registrar-termo", gestora, { vinculoId: vAguarda, forma: "MENSAGERIA", dataAceite: hoje, referencia: "mensagem de teste", canal: "EMAIL" }, ["vinculoId", "forma", "dataAceite", "referencia", "canal"]],
    ["sair", PIN(2012), { vinculoId: vCand }, ["vinculoId"]],
    ["interdicao", PIN(2002), { congregacaoId: C.beta.id, motivo: "FALHA_ELETRICA_GRAVE", objeto: "Quadro geral de energia", descricao: "O disjuntor principal aquece e há fios descascados no quadro geral.", referencia: "Laudo 55", setorId: S.SEGURANCA }, ["congregacaoId", "motivo", "objeto", "descricao", "referencia", "setorId"]],
    ["pedido-remocao", PIN(2011), { congregacaoId: C.central.id, canalId: cen.canalId, motivo: "DOUTRINA_IMAGEM", objeto: "Instagram", referencia: "https://exemplo.org/p/fuzz", descricao: "A postagem contradiz a doutrina da Igreja de forma clara.", setorId: S.COMUNICACAO }, ["congregacaoId", "canalId", "motivo", "objeto", "referencia", "descricao", "setorId"]],
    ["decidir", presidente, { intervencaoId: idAto, decisao: "REVOGAR", observacao: "Não há risco, conforme laudo." }, ["intervencaoId", "decisao", "observacao"]],
    ["levantar", presidente, { intervencaoId: idAto, observacao: "Risco sanado, laudo emitido." }, ["intervencaoId", "observacao"]],
    ["atender", presidente, { intervencaoId: idRem, observacao: "Retirada." }, ["intervencaoId", "observacao"]],
    ["cancelar", PIN(2011), { intervencaoId: idRem, observacao: "Engano de quem pediu." }, ["intervencaoId", "observacao"]]
  ];
  for (const [acao, token, base, campos] of cenarios) await fuzz(`POST ${acao}`, H, { acao, token, base, campos });
  await fuzz("POST aceitar-termo", H, { acao: "aceitar-termo", base: { vinculoId: vAguarda, aceito: true }, campos: ["vinculoId", "aceito"], chamarCom: (corpo) => chamar(H, { acao: "aceitar-termo", metodo: "POST", token: PIN(2012), corpo, headers: IP_PUBLICO }) });
  for (const [acao, token, base, campos] of [
    ["vinculos", gestora, { setorId: S.TI, status: "ATIVO" }, ["setorId", "status"]], ["atos", presidente, { tipo: "INTERDICAO", status: "EMITIDA", abertos: "1", congregacaoId: C.central.id }, ["tipo", "status", "abertos", "congregacaoId"]],
    ["atos-da-congregacao", dirCentral, { congregacaoId: C.central.id }, ["congregacaoId"]], ["ato", presidente, { intervencaoId: idAto }, ["intervencaoId"]], ["canais", PIN(2011), { congregacaoId: C.central.id }, ["congregacaoId"]], ["termo", gestora, { vinculoId: vAguarda }, ["vinculoId"]]
  ]) await fuzz(`GET ${acao}`, H, { acao, metodo: "GET", token, base, campos });
  // vistoria: lavrar e solicitar com lixo (o 428 e o 422 são esperados; 500 nunca)
  const hashBom = "a".repeat(64);
  await fuzz("POST lavrar", V, { acao: "lavrar", token: presidente, campos: ["membroId", "motivo", "funcao", "comVulneraveis", "dataVerificacao", "resultado", "parecer", "destinoOriginal", "documentos"],
    base: { membroId: 2012, motivo: "INVESTIDURA", funcao: "Professor", comVulneraveis: false, dataVerificacao: hoje, resultado: "SEM_RESTRICAO", parecer: "Certidões sem apontamentos.", destinoOriginal: "DEVOLVIDO", documentos: [{ tipo: "OUTRO", hash: hashBom, dataEmissao: hoje }] } });
  await fuzz("POST lavrar/documento", V, { acao: "lavrar", token: presidente, campos: ["tipo", "hash", "dataEmissao"], base: { tipo: "OUTRO", hash: hashBom, dataEmissao: hoje },
    chamarCom: (doc) => chamar(V, { acao: "lavrar", metodo: "POST", token: presidente, corpo: { membroId: 2005, motivo: "INVESTIDURA", funcao: "Professora", dataVerificacao: hoje, resultado: "SEM_RESTRICAO", parecer: "Certidões sem apontamentos.", destinoOriginal: "DESCARTADO", documentos: [doc] } }) });
  await fuzz("POST solicitar", V, { acao: "solicitar", token: presidente, base: { membroId: 2008, motivo: "INVESTIDURA", funcao: "Professor" }, campos: ["membroId", "motivo", "funcao"] });
  for (const [acao, base, campos] of [["lista", { membroId: 2005 }, ["membroId"]], ["vistoria", { vistoriaId: 1 }, ["vistoriaId"]]]) await fuzz(`GET vistoria/${acao}`, V, { acao, metodo: "GET", token: presidente, base, campos });

  console.log("== o que foi guardado de texto hostil fica como texto (SQL parametrizado) ==");
  const sqlInj = "Eng'; DROP TABLE SetoresTecnicos; --";
  r = await POST(H, "candidatar", PIN(2008 + 0), { setorId: S.MEIO_AMBIENTE, formacao: sqlInj }); // 2008 está SEM_COMUNHAO: recusa; só confere que não quebrou
  ok(r.status === 422, "candidatura de quem está sem comunhão: recusada");
  r = await POST(H, "candidatar", PIN(2005), { setorId: S.MEIO_AMBIENTE, formacao: sqlInj }); ok(r.status === 201, "a aspa e o ponto e vírgula não são problema para o SQL parametrizado", r.body);
  ok((await escalar("SELECT Formacao FROM SetoresTecnicosMembros WHERE VinculoId = @v", { v: r.body.vinculoId })) === sqlInj && (await escalar("SELECT COUNT(*) FROM SetoresTecnicos")) >= 20, "o texto ficou idêntico e a tabela continua lá");
  const lv = await GET(H, "vinculos", gestora, { setorId: S.MEIO_AMBIENTE }); ok(lv.status === 200 && lv.body.vinculos.some(v => v.formacao === sqlInj), "e volta idêntico na leitura (a tela escapa na saída)");
  fim("e2e-5-seguranca");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
