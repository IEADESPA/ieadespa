// e2e-11-consentimento-canais.js — v7.7: o consentimento do responsável (LGPD art. 14) e os canais com menores, ponta a ponta com os handlers REAIS no SQL Server real.
// Parte da base "cenario-menores": BASE=cenario-menores bash rodar.sh roteiro e2e-11-consentimento-canais.js
const fs = require("fs");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, PIN, IP_PUBLICO, API, path, obterPool } = L;
const C = require(path.join(API, "GestaoConsentimentoMenor/index.js"));
const VOL = require(path.join(API, "GestaoVoluntariado/index.js"));
const CAN = require(path.join(API, "GestaoCanais/index.js"));
const LGPD = require(path.join(API, "MeusDadosLGPD/index.js"));
const cDb = require(path.join(API, "shared/menoresConsentimentoDb.js"));
const foto = require(path.join(API, "shared/consentimentoFoto.js"));
const canaisDb = require(path.join(API, "shared/canaisDb.js"));
const { sql } = require(path.join(API, "shared/db.js"));
const { c1 } = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario-menores.json"), "utf8"));
const hoje = L.hojeBr();
const secretaria = LIDER(3001, ["habilitacao_voluntarios", "escalas", "reunioes", "pessoas"], ["Central E2E"]);
const gestaoCanais = GERAL(1001, ["canais_gestao", "setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"]);
const codigos = (l) => (l || []).map((x) => x.codigo);

(async () => {
  let r;
  const pool = await obterPool();
  // O menor deste roteiro é novo (o do cenário já tem uma autorização gravada pelos testes de gatilho, que são imutáveis).
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Email) VALUES (6030, N'Davi Menor M7', @c, 'ATIVO', 'EM_COMUNHAO', '2011-05-05', '2020-01-01', N'p6030@exemplo.org')", { c: c1 });
  console.log("== a Secretaria cadastra o responsável legal do Davi (menor, 15 anos) ==");
  r = await POST(VOL, "responsavel", PIN(6010), { menorId: 6030, responsavelId: 6001, vinculo: "MAE", documento: "Certidão de nascimento conferida" }); ok(r.status === 403, "membro comum não designa responsável", r.status);
  r = await POST(VOL, "responsavel", secretaria, { menorId: 6030, responsavelId: 6001, vinculo: "MAE", documento: "Certidão de nascimento conferida" }); ok(r.status === 201 || r.status === 200, "a Secretaria designa a Maria (6001) como mãe do Davi (6030)", r.body);

  console.log("== os textos e o estado inicial ==");
  r = await GET(C, "textos"); ok(r.status === 401, "textos sem sessão: 401");
  r = await GET(C, "textos", PIN(6001)); ok(r.status === 200 && r.body.textos.length === 2 && r.body.textos.every((t) => /^[0-9a-f]{64}$/.test(t.hash) && t.itens.length >= 5), "dois textos (imagem e saúde no crachá), cada um com hash e itens", r.body.textos && r.body.textos.map((t) => t.finalidade));
  const textos = Object.fromEntries(r.body.textos.map((t) => [t.finalidade, t]));
  ok(/apag/i.test(JSON.stringify(textos.IMAGEM.itens)) && /sens[ií]vel/i.test(JSON.stringify(textos.SAUDE_CRACHA.itens)), "o texto da imagem diz que o arquivo é apagado; o da saúde diz que é dado sensível");
  r = await GET(C, "meus-menores", PIN(6001)); ok(r.status === 200 && r.body.menores.length === 1 && r.body.menores[0].menorId === 6030 && r.body.menores[0].estados.IMAGEM.situacao === "NUNCA_DADO", "a responsável vê o Davi, com a imagem ainda não autorizada", r.body);
  r = await GET(C, "meus-menores", PIN(6010)); ok(r.status === 200 && r.body.menores.length === 0, "quem não é responsável de ninguém vê lista vazia");

  console.log("== conceder o consentimento da imagem ==");
  const conceder = (menorId, finalidade, token, extra = {}, headers = IP_PUBLICO) => POST(C, "conceder", token, { menorId, finalidade, aceito: true, termoHash: (textos[finalidade] || {}).hash, ...extra }, headers);
  r = await conceder(6030, "IMAGEM", PIN(6001), {}, {}); ok(r.status === 422 && /origem/.test(r.body.mensagem), "sem IP identificável, o aceite digital é recusado", r.body);
  r = await conceder(6030, "IMAGEM", PIN(6001), { termoHash: "0".repeat(64) }); ok(r.status === 422 && r.body.termoMudou === true, "hash de outro texto: 422 com termoMudou", r.body);
  r = await conceder(6030, "IMAGEM", PIN(6001), { termoHash: textos.SAUDE_CRACHA.hash }); ok(r.status === 422, "hash do texto da OUTRA finalidade também é recusado", r.status);
  for (const aceito of ["true", 1, [], {}, false, undefined]) { r = await conceder(6030, "IMAGEM", PIN(6001), { aceito }); ok(r.status === 422, `aceito ${JSON.stringify(aceito)}: 422`, r.status); }
  r = await conceder(6030, "OUTRA", PIN(6001)); ok(r.status === 400 || r.status === 422, "finalidade fora da lista é recusada", r.status);
  for (const [rotulo, t] of [["quem não é responsável", PIN(6010)], ["a próprio Davi", PIN(6030)], ["responsável de outra criança", PIN(6002)]]) { r = await conceder(6030, "IMAGEM", t); ok(r.status === 403, `${rotulo} não concede: 403`, r.status); }
  r = await conceder(6010, "IMAGEM", PIN(6001)); ok(r.status === 403, "e adulto ou pessoa que não é filha dela: o MESMO 403 (não revela se existe)", r.status);
  for (const id of ["0x10", "1e1", true, [6030], 0, -1, 1.5]) { r = await conceder(id, "IMAGEM", PIN(6001)); ok(r.status === 400, `menorId ${JSON.stringify(id)}: 400`, r.status); }
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresConsentimentos WHERE MenorMembroId = 6030")) === 0, "nenhuma recusa gravou");
  const antes = await escalar("SELECT COUNT(*) FROM MinisterioMenoresConsentimentos");
  r = await conceder(6030, "IMAGEM", PIN(6001), { termoHash: ` ${textos.IMAGEM.hash.toUpperCase()} `, responsavelId: 6002, enderecoIp: "1.1.1.1", forma: "FICHA_FISICA", registradoPorMembroId: 1001 }); ok(r.status === 201, "a mãe concede a imagem (hash em maiúsculas e com espaços vale; o corpo não manda em nada do servidor)", r.body);
  const lin = await um("SELECT TOP 1 * FROM MinisterioMenoresConsentimentos WHERE MenorMembroId = 6030 ORDER BY ConsentimentoId DESC");
  ok(lin.ResponsavelMembroId === 6001 && lin.Forma === "CLICK_RESP" && lin.EnderecoIp === "177.8.9.10" && lin.RegistradoPorMembroId === null && lin.Finalidade === "IMAGEM" && lin.Concedido === true && lin.TextoHash === textos.IMAGEM.hash, "o responsável é o da sessão, a forma e o IP são do servidor, o hash é o do texto", lin);
  r = await conceder(6030, "IMAGEM", PIN(6001)); ok(r.status === 422, "conceder de novo o mesmo texto: 422", r.body);
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresConsentimentos")) === antes + 1, "e só uma linha nova no total");
  ok(await cDb.consentimentoVigente(pool, 6030, "IMAGEM") === true && await cDb.consentimentoVigente(pool, 6030, "SAUDE_CRACHA") === false, "a imagem está vigente; a saúde ainda não");
  r = await GET(C, "meus-menores", PIN(6001)); ok(r.body.menores[0].estados.IMAGEM.situacao === "CONCEDIDO" && r.body.menores[0].estados.IMAGEM.vigente === true, "a tela da responsável mostra CONCEDIDO");

  console.log("== a foto do menor: só vale o consentimento do RESPONSÁVEL ==");
  await q("INSERT INTO ConsentimentosLGPD (MembroId, Tipo, Concedido, RegistradoPor) VALUES (6002, 'FOTO', 1, 6002)");              // adulto: o próprio consentimento vale (como sempre)
  await q("INSERT INTO ConsentimentosLGPD (MembroId, Tipo, Concedido, RegistradoPor) VALUES (2006, 'FOTO', 1, 2006)");              // Fábio, 14 anos: o consentimento DELE não vale
  ok(await foto.fotoConsentimentoConcedido(pool, sql, 6002) === true, "adulto com FOTO concedido: a foto é liberada, como sempre");
  ok(await foto.fotoConsentimentoConcedido(pool, sql, 2006) === false, "menor de idade com FOTO concedido por ELE MESMO: não libera (o menor não consente sozinho)");
  ok(await foto.fotoConsentimentoConcedido(pool, sql, 6030) === true, "o Davi, com a imagem autorizada pela mãe: libera");
  ok(await foto.fotoConsentimentoConcedido(pool, sql, 6021) === false, "idade desconhecida sem nenhum consentimento: não libera");
  await q("UPDATE MembroReferencia SET FotoUrl = N'https://exemplo.invalid/fotos/6030.jpg' WHERE MembroId = 6030");

  console.log("== revogar a imagem apaga o arquivo da foto ==");
  r = await POST(C, "revogar", PIN(6010), { menorId: 6030, finalidade: "IMAGEM" }); ok(r.status === 403, "quem não é responsável não revoga", r.status);
  r = await POST(C, "revogar", PIN(6030), { menorId: 6030, finalidade: "IMAGEM" }); ok(r.status === 403, "nem a própria menor (quem revoga é o responsável)", r.status);
  r = await POST(C, "revogar", secretaria, { menorId: 6030, finalidade: "IMAGEM" }); ok(r.status === 403, "nem a Secretaria por esta rota (ela registra a ficha do responsável)", r.status);
  r = await POST(C, "revogar", PIN(6001), { menorId: 6030, finalidade: "IMAGEM" }); ok(r.status === 200, "a mãe revoga a imagem", r.body);
  ok((await escalar("SELECT FotoUrl FROM MembroReferencia WHERE MembroId = 6030")) === null, "a foto saiu do cadastro (FotoUrl vazio) e o arquivo foi mandado apagar", r.body);
  ok(r.body.fotoApagada === true, "a resposta diz que a foto foi apagada", r.body);
  ok(await cDb.consentimentoVigente(pool, 6030, "IMAGEM") === false && await foto.fotoConsentimentoConcedido(pool, sql, 6030) === false, "revogada: não está mais vigente e a foto não libera");
  r = await POST(C, "revogar", PIN(6001), { menorId: 6030, finalidade: "IMAGEM" }); ok(r.status === 200 && r.body.jaRevogada === true, "revogar de novo não grava outra linha", r.body);
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresConsentimentos WHERE MenorMembroId = 6030 AND Finalidade = 'IMAGEM' AND Concedido = 0")) === 1, "uma só linha de revogação");
  ok((await q("SELECT DadosDepois FROM AuditLog WHERE Acao LIKE 'MENORES_CONSENTIMENTO%' OR Acao LIKE '%CONSENTIMENTO_MENOR%'")).every((x) => !/177\.8\.9\.10|https?:\/\//.test(x.DadosDepois || "")), "a auditoria não leva IP nem endereço da foto");
  r = await conceder(6030, "IMAGEM", PIN(6001)); ok(r.status === 201, "e a mãe pode autorizar de novo depois (consentimento é livre e revogável)", r.body);

  console.log("== a Secretaria registra a ficha assinada do responsável ==");
  const ficha = (extra, t = secretaria) => POST(C, "registrar-ficha", t, { menorId: 6030, responsavelId: 6001, finalidade: "SAUDE_CRACHA", concedido: true, referencia: "Pasta 4, ficha 7", ...extra });
  r = await ficha({}, PIN(6010)); ok(r.status === 403, "membro comum não registra ficha", r.status);
  r = await ficha({}, PIN(3001)); ok(r.status === 403, "o PIN da dirigente também não (sessão de membro)", r.status);
  r = await ficha({ responsavelId: 6002 }); ok(r.status === 422, "responsável que não é do Davi: 422", r.body);
  r = await ficha({ referencia: "" }); ok(r.status === 422 || r.status === 400, "sem a referência da ficha: recusado", r.status);
  r = await ficha({ referencia: "<b>x</b>" }); ok(r.status === 422 || r.status === 400, "referência com tag: recusada", r.status);
  r = await ficha({ concedido: "sim" }); ok(r.status === 422 || r.status === 400, "concedido não booleano: recusado", r.status);
  r = await ficha({ menorId: 999999 }); ok([403, 404].includes(r.status), "menor que não existe: recusado sem vazar", r.status);
  r = await ficha({ menorId: 6023 }); ok([403, 404].includes(r.status), "menor de outra congregação: o mesmo tipo de recusa", r.status);
  r = await ficha({}); ok(r.status === 201, "a Secretaria registra a ficha da saúde (SAUDE_CRACHA)", r.body);
  const fl = await um("SELECT TOP 1 * FROM MinisterioMenoresConsentimentos WHERE MenorMembroId = 6030 AND Finalidade = 'SAUDE_CRACHA' ORDER BY ConsentimentoId DESC");
  ok(fl.Forma === "FICHA_FISICA" && fl.RegistradoPorMembroId === 3001 && fl.ResponsavelMembroId === 6001 && fl.EnderecoIp === null && fl.Referencia === "Pasta 4, ficha 7", "a ficha guarda quem registrou (a dirigente), o responsável e a referência", fl);
  ok(await cDb.consentimentoVigente(pool, 6030, "SAUDE_CRACHA") === true, "e a saúde passa a estar vigente");
  r = await GET(C, "menor", secretaria, { menorId: 6030 }); ok(r.status === 200 && r.body.visao === "GESTAO" && r.body.estados.SAUDE_CRACHA.vigente === true, "a Secretaria vê os estados do menor da congregação dela", r.body.visao);
  r = await GET(C, "menor", secretaria, { menorId: 6023 }); const a404 = r;
  r = await GET(C, "menor", secretaria, { menorId: 999999 }); ok(a404.status === 404 && r.status === 404 && a404.body.mensagem === r.body.mensagem, "menor de outra congregação e menor inexistente: o MESMO 404");
  r = await GET(C, "menor", PIN(6010), { menorId: 6030 }); ok(r.status === 404, "quem não tem relação com a criança recebe 404", r.status);
  r = await GET(C, "menor", PIN(3001), { menorId: 6030 }); ok(r.status === 404, "e o PIN da dirigente também (PIN não vale como Secretaria)", r.status);

  console.log("== o responsável deixa de ser responsável: a autorização não vale mais ==");
  const resps = await q("SELECT ResponsavelId FROM VoluntariadoResponsaveis WHERE MenorMembroId = 6030 AND ResponsavelMembroId = 6001 AND RevogadoEm IS NULL");
  r = await POST(VOL, "responsavel-revogar", secretaria, { responsavelId: resps[0].ResponsavelId }); ok(r.status === 200, "a Secretaria revoga a designação da mãe", r.body);
  ok(await cDb.consentimentoVigente(pool, 6030, "IMAGEM") === false && await cDb.consentimentoVigente(pool, 6030, "SAUDE_CRACHA") === false, "sem responsável ativo, nenhuma autorização vale");
  ok(await foto.fotoConsentimentoConcedido(pool, sql, 6030) === false, "e a foto do Davi deixa de liberar");
  r = await POST(C, "revogar", PIN(6001), { menorId: 6030, finalidade: "IMAGEM" }); ok(r.status === 403, "quem deixou de ser responsável não mexe mais");
  await POST(VOL, "responsavel", secretaria, { menorId: 6030, responsavelId: 6001, vinculo: "MAE", documento: "Certidão de nascimento conferida" });

  console.log("== Meus Dados ==");
  const meus = async (matricula, token) => { const ctx = { bindingData: { matricula: String(matricula) }, log: { error() { }, info() { }, warn() { }, verbose() { } } }; await LGPD(ctx, { method: "GET", query: {}, headers: { "x-auth-token": token } }); return ctx.res; };
  r = await meus(6001, PIN(6001)); ok(r.status === 200 && r.body.consentimentosMenores && r.body.consentimentosMenores.comoResponsavel.length >= 2 && r.body.ministerioMenores && Array.isArray(r.body.ministerioMenores.politicaDeComunicacao), "a mãe recebe o que autorizou como responsável e o bloco do ministério com menores", Object.keys(r.body));
  const comoMenor = (await meus(6030, PIN(6030))).body.consentimentosMenores.comoMenor;
  ok(comoMenor.length >= 2 && !JSON.stringify(comoMenor).match(/EnderecoIp|177\.8\.9\.10|Dirigente Central/), "o Davi vê o que foi autorizado sobre ela, sem o IP da mãe nem o nome de quem registrou a ficha");
  r = await meus(6030, PIN(6010)); ok(r.status === 403, "ninguém pede os dados de outra pessoa");

  console.log("== canais com menores: dois adultos habilitados e o responsável com acesso ==");
  const catalogo = (await GET(CAN, "catalogos", gestaoCanais)).body;
  ok(catalogo && catalogo.plataformas.some((p) => p.codigo === "WHATSAPP_GRUPO"), "catálogo de canais ok");
  const novo = (extra = {}) => POST(CAN, "canais", gestaoCanais, { nome: "Grupo das crianças M7", plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", identificador: "Crianças da Central", vinculoInstitucional: "ESTRUTURA", declaracaoInstitucional: true, escopo: "CONGREGACAO", congregacaoId: c1, incluiMenores: true, ...extra });
  r = await novo({ responsavelAcessoMembroId: "0x10" }); ok(r.status === 400 || r.status === 422, "responsável com id torto: recusado", r.status);
  r = await novo({ responsavelAcessoMembroId: 6030 }); ok(r.status === 422, "um menor de 18 anos não é o responsável com acesso", r.body);
  r = await novo(); ok(r.status === 201, "criar o canal com menores ainda sem administradores é aceito (nasce irregular)", r.body);
  const canalId = r.body.canal ? r.body.canal.canalId : r.body.canalId;
  const estado = async () => (await GET(CAN, "canal", gestaoCanais, { canalId })).body;
  let e = await estado();
  ok(e.situacao === "IRREGULAR" && ["MENORES_SEM_SEGUNDO_ADULTO", "MENORES_SEM_RESPONSAVEL"].every((c) => codigos(e.pendencias).includes(c)), "nasce IRREGULAR: sem dois administradores e sem responsável", codigos(e.pendencias));
  r = await POST(CAN, "administradores/designar", gestaoCanais, { canalId, membroId: 6013, papel: "ADMINISTRADOR" }); ok(r.status === 422 && /não está habilitada/.test(r.body.mensagem) && !/restri|apontamento/i.test(r.body.mensagem), "designar quem não está habilitado é recusado, dizendo ao gestor o que a pessoa precisa regularizar", r.body);
  r = await POST(CAN, "administradores/designar", gestaoCanais, { canalId, membroId: 6019, papel: "ADMINISTRADOR" }); ok(r.status === 422 && /diretoria executiva/i.test(r.body.mensagem) && !/restri|apontamento/i.test(r.body.mensagem), "quem tem pendência reservada: recusado, e só se diz 'pendência com a Diretoria'", r.body);
  r = await POST(CAN, "administradores/designar", gestaoCanais, { canalId, membroId: 6010, papel: "ADMINISTRADOR" }); ok(r.status === 201 || r.status === 200, "designa a Ana (6010, habilitada)", r.body);
  r = await POST(CAN, "administradores/designar", gestaoCanais, { canalId, membroId: 6011, papel: "OPERADOR" }); ok(r.status === 201 || r.status === 200, "designa o Bruno (6011, habilitado)", r.body);
  e = await estado();
  ok(codigos(e.pendencias).includes("MENORES_SEM_SEGUNDO_ADULTO"), "enquanto os dois não aceitam o Termo de Dever de Moderação, o segundo adulto ainda não conta", codigos(e.pendencias));
  for (const [m, tok] of [[6010, PIN(6010)], [6011, PIN(6011)]]) { r = await POST(CAN, "termo/aceitar", tok, { todos: true }); ok(r.status === 200, `${m} aceita o Termo de Dever de Moderação`, r.body); }
  e = await estado();
  ok(!codigos(e.pendencias).includes("MENORES_SEM_SEGUNDO_ADULTO") && codigos(e.pendencias).includes("MENORES_SEM_RESPONSAVEL"), "com dois administradores com o termo aceito, falta só o responsável", codigos(e.pendencias));
  r = await POST(CAN, "canais/responsavel-acesso", gestaoCanais, { canalId, membroId: 6030 }); ok(r.status === 422, "menor de idade como responsável: 422", r.body);
  r = await POST(CAN, "canais/responsavel-acesso", gestaoCanais, { canalId, membroId: 6027 }); ok(r.status === 200 || r.status === 422, "membro sem comunhão: regra do canal decide (ativo e adulto)", r.status);
  r = await POST(CAN, "canais/responsavel-acesso", gestaoCanais, { canalId }); ok(r.status === 400, "sem a chave membroId: 400 (retirar é null explícito)", r.status);
  for (const id of ["0x10", "1e1", true, [5], 0, ""]) { r = await POST(CAN, "canais/responsavel-acesso", gestaoCanais, { canalId, membroId: id }); ok(r.status === 400, `membroId ${JSON.stringify(id)}: 400`, r.status); }
  r = await POST(CAN, "canais/responsavel-acesso", gestaoCanais, { canalId: 999999, membroId: 6001 }); const c404 = r;
  r = await POST(CAN, "canais/responsavel-acesso", LIDER(3002, ["canais_gestao"], ["Vila Nova E2E"]), { canalId, membroId: 6001 }); ok(c404.status === 404 && r.status === 404 && c404.body.mensagem === r.body.mensagem, "canal inexistente e canal fora do escopo: a MESMA 404");
  r = await POST(CAN, "canais/responsavel-acesso", PIN(6010), { canalId, membroId: 6001 }); ok(r.status === 403, "membro comum não indica responsável");
  r = await POST(CAN, "canais/responsavel-acesso", gestaoCanais, { canalId, membroId: 6001 }); ok(r.status === 200, "indica a Maria (6001) como responsável com acesso", r.body);
  e = await estado();
  ok(e.situacao !== "IRREGULAR" && !codigos(e.pendencias).some((c) => c.startsWith("MENORES_")), "agora o canal cumpre as três exigências", [e.situacao, codigos(e.pendencias)]);
  ok(e.responsavelAcesso && e.responsavelAcesso.membroId === 6001 && e.administradores.every((a) => a.aptoMenores === true && a.adulto === true) && !JSON.stringify(e.administradores).match(/bloqueio|ANTECEDENTES|restri/i), "o detalhe mostra o responsável e, de cada administrador, só o sim/não da habilitação", e.administradores);
  const adm = (await q("SELECT AdminId, MembroId FROM CanalAdministradores WHERE CanalId = @c AND EncerradoEm IS NULL ORDER BY AdminId", { c: canalId }));
  r = await POST(CAN, "administradores/encerrar", gestaoCanais, { adminId: adm[0].AdminId, motivo: "Saiu do ministério." }); ok(r.status === 422 && Array.isArray(r.body.pendencias), "encerrar um dos dois administradores deixaria o canal sem a regra: 422 com a lista", r.body);
  ok((await escalar("SELECT COUNT(*) FROM CanalAdministradores WHERE CanalId = @c AND EncerradoEm IS NULL", { c: canalId })) === 2, "e nada foi encerrado");
  // o administrador perde a habilitação: o canal fica irregular de novo (calculado na leitura)
  const hab6010 = await escalar("SELECT HabilitacaoId FROM VoluntariosHabilitacao WHERE MembroId = 6010");
  r = await POST(L.__HAB || require(path.join(API, "GestaoHabilitacaoVoluntarios/index.js")), "marcar-inapto", secretaria, { habilitacaoId: hab6010, motivo: "Afastado para o teste." }); ok(r.status === 200, "a Ana é marcada inapta", r.body);
  e = await estado(); ok(e.situacao === "IRREGULAR" && codigos(e.pendencias).includes("MENORES_ADMIN_SEM_HABILITACAO"), "o canal volta a ficar IRREGULAR: um administrador deixou de estar habilitado", codigos(e.pendencias));
  const fatos = await canaisDb.detectarCanaisComMenoresIrregulares(pool, { hoje });
  const fato = fatos.find((f) => /Grupo das crianças M7/.test(f.fatoGerador));
  ok(fato && fato.destinatarios.length >= 2 && fato.fatoGerador.length <= 1000 && !/antecedentes|restri|vencid/i.test(fato.fatoGerador) && fato.referenciaId < 2147483647, "o detector monta o aviso mensal do canal (destinatários, limite, sem motivo reservado)", fato && fato.fatoGerador);
  // desmarcar "inclui menores" zera o responsável
  r = await POST(CAN, "canais/atualizar", gestaoCanais, { canalId, incluiMenores: false }); ok(r.status === 200, "desmarcar 'inclui menores' é livre", r.body);
  ok((await escalar("SELECT ResponsavelAcessoMembroId FROM CanaisOficiaisComunicacao WHERE CanalId = @c", { c: canalId })) === null, "e zera o responsável com acesso");
  r = await POST(CAN, "canais/atualizar", gestaoCanais, { canalId, incluiMenores: true }); ok(r.status === 422 && Array.isArray(r.body.pendencias), "ligar 'inclui menores' num canal que já tem administradores exige a regra cumprida (aqui falta responsável e há admin sem habilitação)", r.body);

  fim("e2e-11-consentimento-canais");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
