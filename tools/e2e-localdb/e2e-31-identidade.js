// e2e-31-identidade.js — v7.14 (Identidade Visual Anual, Regimento Art. 159), com os handlers e o banco REAIS, sobre a base "cenario-pastoral" + a migração 151.
// O esquema (ciclo que só anda para a frente, sugestão com no máximo 3 ativas e texto único, cédula que congela, resultado e tema do processo que não se editam, cores que não
// mudam depois da primeira arte), a porta (PIN, liderança sem o nível Geral, permissão enxertada), o ciclo aberto pela Diretoria (nada de sugestão sem ciclo), os temas já usados,
// as sugestões (igual = recusado, parecido = marcado), a triagem (ajuste guardando a original, critério do descarte, sem nome de quem mandou), a votação que abre sozinha no dia
// 22 e é votada pela Enquete (Meu Painel), o fechamento e a apuração depois do dia 30, as cores e o concurso de arte (imagem conferida), o resultado do culto que entra na lista
// de temas, os avisos à Diretoria (nunca aos membros), o empate decidido pela Diretoria, a votação aberta pelo botão, a exclusão LGPD, Meus Dados, a retenção e o lixo em
// cada campo. O relógio da regra é posto em novembro e dezembro de 2027 e 2028 (db.usarRelogio); o banco segue com a hora dele.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GET, POST, LIDER, GERAL, PIN, chamar, LIXO, sessao } = L;
const H = require(path.join(API, "GestaoIdentidadeVisual/index.js"));
const ENQ = require(path.join(API, "GestaoEnquetes/index.js"));
const EXCLUSAO = require(path.join(API, "ExecutarExclusaoLGPD/index.js"));
const MEUS_DADOS = require(path.join(API, "MeusDadosLGPD/index.js"));
const db = require(path.join(API, "shared/identidadeVisualDb.js"));
const iv = require(path.join(API, "shared/identidadeVisual.js"));
const { avaliarRegras } = require(path.join(API, "shared/notificacaoMotor.js"));

let falhasAuditoria = 0;
const erroOriginal = console.error;
console.error = (...a) => { if (String(a[0]).includes("[AUDITORIA]")) falhasAuditoria++; if (process.env.E2E_VERBOSO) erroOriginal(...a); };

// o relógio da regra e o armazenamento de mentira (guarda o que "subiu" e o que "saiu")
let agora = new Date("2027-10-20T12:00:00Z");
const em = (iso) => { agora = new Date(iso); };
db.usarRelogio(() => agora);
const blobs = new Map();
let seqBlob = 0;
const apagados = [];
db.usarArmazenamento({
  salvarDocumento: async (buffer, tipo) => { const u = `https://blob.e2e/documentos/doc-${++seqBlob}`; blobs.set(u, { tamanho: buffer.length, tipo, bytes: Buffer.from(buffer) }); return u; },
  excluirDocumento: async (u) => { apagados.push(u); blobs.delete(u); },
  urlDocumentoComSas: (u) => `${u}?sas=e2e`
});

const PERM = ["identidade_visual"];
const DIR = GERAL(1002, PERM);                                                     // Secretário Geral
const PRES = GERAL(1001, PERM);                                                    // Presidente
const SEM_FATOR = sessao(1002, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() - 3600000 }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });
const LOCAL = LIDER(3001, PERM, ["Central E2E"]);                                 // a permissão num papel de congregação: não é o nível Geral
const ENXERTO = sessao(2001, { via: "PIN", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });
const M = { ana: 2001, beto: 2002, carla: 2003, davi: 2004, eva: 2005, gil: 2010, hugo: 2011, ivo: 2012, semComunhao: 2008, desligado: 2009 };
const falha = async (texto, params) => { try { await q(texto, params); return null; } catch (e) { return e.message || String(e); } };
const sugerir = (membroId, texto) => POST(H, "sugerir", PIN(membroId), { texto });
const meu = async (membroId) => (await GET(H, "meu", PIN(membroId))).body;
async function votar(membroId, enqueteId, perguntaId, opcaoId) {
  const ctx = { bindingData: { id: String(enqueteId), acao: "votar" }, log: { error() { } } };
  await ENQ(ctx, { method: "POST", query: {}, body: { respostas: [{ perguntaId, opcaoId }] }, headers: { "x-auth-token": PIN(membroId) } });
  return ctx.res;
}
const pedacoPng = (tipo, dados) => { const d = Buffer.isBuffer(dados) ? dados : Buffer.from(dados, "latin1"); const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(tipo, 4, "latin1"); d.copy(b, 8); return b; };
// PNG com cabeçalho, dados e fim — e, como a foto de um celular, texto com o GPS e o EXIF (que têm de sair antes de guardar)
const png = (semente, tamanho = 200) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedacoPng("IHDR", Buffer.alloc(13, 1)),
  pedacoPng("tEXt", "GPSLatitude" + String.fromCharCode(0) + "-6.0675"), pedacoPng("eXIf", "MM*GPSLongitude -49.9"), pedacoPng("IDAT", Buffer.alloc(tamanho, semente)), pedacoPng("IEND", "")]);
const segJpeg = (m, dados) => { const d = Buffer.from(dados, "latin1"); const b = Buffer.alloc(4 + d.length); b[0] = 0xff; b[1] = m; b.writeUInt16BE(d.length + 2, 2); d.copy(b, 4); return b; };
const jpeg = (semente) => Buffer.concat([Buffer.from([0xff, 0xd8]), segJpeg(0xe0, "JFIF"), segJpeg(0xe1, "Exif GPSLatitude -6.0675 Celular"), segJpeg(0xdb, "tabela"),
  segJpeg(0xda, "varredura"), Buffer.alloc(300, semente), Buffer.from([0xff, 0xd9])]);
const enviarArte = (membroId, buf, tipo = "image/png", extra = {}) => POST(H, "arte", PIN(membroId), { imagemBase64: buf.toString("base64"), tipo, ...extra });
async function avisos(chave) { return q("SELECT DestinatarioMembroId AS d, ReferenciaId AS ref, Mensagem AS m FROM Notificacoes WHERE RegraChave = @k ORDER BY NotificacaoId", { k: chave }); }
const QUEM_RODA = [2002, 2003, 2004, 2005, 2012, 3002, 3003, 3004, 2001, 1003, 5001, 5002, 5003, 5004, 7001, 7002, 7003, 8010, 8011, 8012, 8013, 8014, 8015, 8016, 8017];
const RODIZIO = (n) => PIN(QUEM_RODA[n % QUEM_RODA.length]);
const TABELAS = ["IdentidadeCiclos", "IdentidadeTemasUsados", "IdentidadeSugestoes", "IdentidadeCores", "IdentidadeArtes", "IdentidadeResultados", "Enquetes", "RespostasEnquete"];
async function retrato() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
// Lixo em cada campo: nunca 500, nunca texto interno, e a chamada recusada não muda nada. `token` pode ser uma função do número da chamada (o membro muda a cada
// chamada: o limitador por pessoa — 20 sugestões em 10 minutos, 10 artes por hora — não pode responder no lugar da validação).
async function fuzz(rotulo, { acao, token, base, campos, aceitos = [200, 201, 400, 404, 409, 422, 428] }) {
  const quebras = [], mudancas = [];
  let n = 0;
  for (const campo of campos) for (const lixo of LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = await POST(H, acao, typeof token === "function" ? token(n) : token, corpo);
    n++;
    if (!aceitos.includes(r.status)) quebras.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} (${r.status}) mexeu no banco`);
    if (r.body && /SELECT |INSERT |UPDATE |mssql|tedious|node_modules|at Object/i.test(JSON.stringify(r.body))) quebras.push(`${campo} vazou texto interno`);
  }
  ok(quebras.length === 0, `${rotulo}: ${n} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 4));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 4));
}

(async () => {
  await obterPool();
  const DIRETORIA = (await q(`SELECT DISTINCT l.MembroId AS m FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
    WHERE (',' + p.Permissoes + ',') LIKE '%,identidade_visual,%' AND p.Nivel = 'GLOBAL' AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE)) ORDER BY l.MembroId`)).map((x) => x.m);

  console.log("== o esquema da 151 ==");
  ok((await escalar("SELECT COUNT(*) FROM Funcionalidades WHERE Chave = 'identidade_visual'")) === 1, "a permissão identidade_visual existe");
  const papeis = await q("SELECT Nome FROM Papeis WHERE (',' + Permissoes + ',') LIKE '%,identidade_visual,%' ORDER BY Nome");
  ok(papeis.map((p) => p.Nome).join("|") === "Presidente|Secretário Geral", "só o Presidente e o Secretário Geral a recebem", papeis);
  const regras = await q("SELECT Chave, PermissaoAlvo, NivelAlvo, Obrigatoria FROM NotificacaoRegras WHERE Chave LIKE 'IDENTIDADE_%' ORDER BY Chave");
  ok(regras.length === 4 && regras.every((r) => r.PermissaoAlvo === "identidade_visual" && r.NivelAlvo === "GLOBAL" && !r.Obrigatoria), "os 4 avisos vão só à Diretoria do nível Geral", regras);
  const pol = await um("SELECT DiasRetencao, BaseLegal FROM PoliticasRetencao WHERE Categoria = N'Identidade visual — sugestões e artes dos membros'");
  ok(pol && pol.DiasRetencao === 365 && pol.BaseLegal !== "x" && pol.BaseLegal.length <= 300, "a retenção (1 ano) tem a base legal escrita", pol);
  ok((await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('Enquetes') AND name = 'DataFechamentoPrevista'")) === 1, "a enquete ganhou a data de fechamento");
  ok(!!(await falha("INSERT INTO IdentidadeCiclos (AnoAlvo, AbertoPorMembroId) VALUES (2027, 1002)")), "(revisão) não há ciclo da identidade de 2027 no banco (feito fora do sistema; CHECK a partir de 2028)");
  ok(!!(await falha("INSERT INTO IdentidadeTemasUsados (Ano, Tema, TemaNormalizado, Origem, RegistradoPorMembroId) VALUES (2005, N'Tema antigo', N'tema antigo', 'MANUAL', 1002)")), "tema já usado só de 2006 em diante");
  ok(!!(await falha("INSERT INTO IdentidadeTemasUsados (Ano, Tema, TemaNormalizado, Origem, RegistradoPorMembroId) VALUES (2010, N'Tema antigo', N'tema antigo', NULL, 1002)")), "a origem do tema não pode ser nula (o CHECK com IN deixaria passar)");

  console.log("== a porta ==");
  ok((await GET(H, "catalogos", null)).status === 401, "sem sessão: 401");
  const catPin = await GET(H, "catalogos", PIN(M.ana));
  ok(catPin.status === 200 && catPin.body.papeis.gestao === false && catPin.body.limites.sugestoes === 3, "o membro por PIN abre o catálogo, sem gestão", catPin.body);
  for (const [nome, tok] of [["PIN", PIN(M.ana)], ["Dirigente com a permissão (não é o Geral)", LOCAL], ["PIN com permissão enxertada", ENXERTO]]) {
    ok((await GET(H, "painel", tok)).status === 403 && (await POST(H, "abrir-ciclo", tok, { anoAlvo: 2028 })).status === 403, `${nome}: 403 no painel e no abrir`);
  }
  ok((await GET(H, "catalogos", DIR)).body.papeis.gestao === true, "o Secretário Geral (Geral, sessão de liderança) é gestão");
  ok((await GET(H, "nada", DIR)).status === 404 && (await chamar(H, { acao: "meu", metodo: "PUT", token: DIR })).status === 405, "ação inexistente 404; método errado 405");
  ok((await GET(H, "ciclo", DIR, { cicloId: "0x10" })).status === 400 && (await GET(H, "imagem", PIN(M.ana), { arteId: "1e1" })).status === 400, "id malformado na consulta: 400");

  console.log("== antes do ciclo: nada de sugestão; os temas já usados ==");
  em("2027-10-20T12:00:00Z");
  const m0 = await meu(M.ana);
  ok(m0.sucesso && m0.ciclo === null && m0.proximoAno === 2028 && m0.apto === true, "sem ciclo aberto, o Meu Painel não mostra etapa nenhuma (só o ano que vem)", m0);
  const s0 = await sugerir(M.ana, "Família, fé e missão");
  ok(s0.status === 422 && /Ainda não há processo/.test(s0.body.mensagem), "sugerir sem ciclo aberto: recusado", s0.body);
  const t1 = await POST(H, "tema", DIR, { ano: 2027, tema: "Avante, Igreja!" });
  const t2 = await POST(H, "tema", DIR, { ano: 2026, tema: "Fé que vence o mundo" });
  ok(t1.status === 201 && t2.status === 201, "a Secretaria cadastra os temas já usados (inclusive o de 2027, escolhido fora do sistema)", [t1.body, t2.body]);
  ok((await POST(H, "tema", DIR, { ano: 2027, tema: "Outro" })).status === 422, "um tema por ano");
  ok((await POST(H, "tema", DIR, { ano: 2005, tema: "Antigo demais" })).status === 422 && (await POST(H, "tema", DIR, { ano: 2029, tema: "Futuro demais" })).status === 422, "o ano vai de 2006 ao ano que vem");
  ok((await POST(H, "tema", DIR, { ano: 2015, tema: "<script>x</script>" })).status === 422, "tema com tag: recusado");
  const t3 = await POST(H, "tema", DIR, { ano: 2016, tema: "Tema com erro de digitaçao" });
  const t3b = await POST(H, "tema", DIR, { temaUsadoId: t3.body.temaUsadoId, ano: 2016, tema: "Tema corrigido de 2016" });
  ok(t3b.status === 200 && (await escalar("SELECT Tema FROM IdentidadeTemasUsados WHERE Ano = 2016")) === "Tema corrigido de 2016", "a Secretaria corrige o tema manual", t3b.body);
  ok((await POST(H, "excluir-tema", DIR, { temaUsadoId: t3.body.temaUsadoId })).status === 200 && (await escalar("SELECT COUNT(*) FROM IdentidadeTemasUsados WHERE Ano = 2016")) === 0, "e apaga o tema manual");
  ok((await POST(H, "excluir-tema", DIR, { temaUsadoId: 999999 })).status === 404, "tema inexistente: 404");
  const lista = (await GET(H, "temas", DIR)).body.temas;
  ok(lista.length === 2 && lista[0].ano === 2027 && lista[0].origem === "MANUAL", "a lista dos temas já usados", lista);

  console.log("== a Diretoria abre o ciclo ==");
  ok((await POST(H, "abrir-ciclo", DIR, { anoAlvo: 2029 })).status === 422, "só o ciclo do ano que vem (2028) se abre");
  em("2026-10-23T12:00:00Z");
  const ab27 = await POST(H, "abrir-ciclo", DIR, { anoAlvo: 2027 });
  ok(ab27.status === 422 && /primeiro ciclo no sistema é o da identidade de 2028/.test(ab27.body.mensagem), "(revisão) o ciclo de 2027 não se abre (o processo foi feito fora do sistema)", ab27.body);
  ok((await GET(H, "painel", DIR)).body.podeAbrir === false, "e o painel não oferece abrir");
  em("2027-10-20T12:00:00Z");
  ok((await POST(H, "abrir-ciclo", SEM_FATOR, { anoAlvo: 2028 })).status === 428, "(revisão) abrir o ciclo pede a confirmação reforçada");
  const pg0 = (await GET(H, "painel", DIR)).body;
  ok(pg0.podeAbrir === true && pg0.proximoAno === 2028 && pg0.ciclos.length === 0, "o painel diz que dá para abrir o de 2028", pg0);
  const ab = await POST(H, "abrir-ciclo", DIR, { anoAlvo: 2028 });
  ok(ab.status === 201 && ab.body.cicloId, "ciclo de 2028 aberto", ab.body);
  const CICLO = ab.body.cicloId;
  ok((await POST(H, "abrir-ciclo", PRES, { anoAlvo: 2028 })).status === 422, "abrir de novo: recusado (um ciclo por ano)");
  const m1 = await meu(M.ana);
  ok(m1.ciclo && m1.ciclo.fase === "AGUARDANDO" && m1.ciclo.calendario.sugestao.inicio === "2027-11-01" && m1.ciclo.calendario.votacao.fim === "2027-11-30", "o membro vê o ciclo AGUARDANDO, com as datas", m1.ciclo);
  ok((await sugerir(M.ana, "Família, fé e missão")).status === 422, "antes de 1º/11: ainda não se sugere");
  ok(!!(await falha("UPDATE IdentidadeCiclos SET AnoAlvo = 2030 WHERE CicloId = @c", { c: CICLO })), "o ano do ciclo não muda (gatilho)");

  console.log("== sugestões (01 a 15/nov) ==");
  em("2027-11-05T15:00:00Z");
  const a1 = await sugerir(M.ana, "Família, fé e missão");
  ok(a1.status === 201 && a1.body.parecido === null, "a Ana manda a 1ª", a1.body);
  const igual = await sugerir(M.ana, "  avante   IGREJA ");
  ok(igual.status === 422 && igual.body.jaUsado && igual.body.jaUsado.ano === 2027, "igual a um tema já usado (sem diferença de acento, maiúscula, pontuação): recusado na hora", igual.body);
  const a2 = await sugerir(M.ana, "Avante a Igreja do Senhor");
  ok(a2.status === 201 && a2.body.parecido && a2.body.parecido.ano === 2027, "parecido com um tema já usado: aceito e marcado para a triagem", a2.body);
  ok((await escalar("SELECT ParecidoComAno FROM IdentidadeSugestoes WHERE SugestaoId = @s", { s: a2.body.sugestaoId })) === 2027, "a marca fica no banco");
  const a3 = await sugerir(M.ana, "Jovens que brilham");
  const a4 = await sugerir(M.ana, "Uma quarta sugestão");
  ok(a3.status === 201 && a4.status === 422 && /máximo/.test(a4.body.mensagem), "até 3 por pessoa; a 4ª é recusada", a4.body);
  ok(!!(await falha("INSERT INTO IdentidadeSugestoes (CicloId, MembroId, Texto, TextoNormalizado) VALUES (@c, @m, N'Quarta por fora', N'quarta por fora')", { c: CICLO, m: M.ana })), "o banco também barra a 4ª ativa (gatilho)");
  const ret = await POST(H, "retirar-sugestao", PIN(M.ana), { sugestaoId: a3.body.sugestaoId });
  ok(ret.status === 200, "a Ana retira uma", ret.body);
  ok((await POST(H, "retirar-sugestao", PIN(M.ana), { sugestaoId: a3.body.sugestaoId })).status === 422, "retirar de novo: recusado");
  ok((await POST(H, "retirar-sugestao", PIN(M.beto), { sugestaoId: a1.body.sugestaoId })).status === 404, "retirar a de outra pessoa: 404 (a mesma resposta de \"não existe\")");
  ok((await POST(H, "retirar-sugestao", PIN(M.ana), { sugestaoId: 999999 })).status === 404, "retirar a inexistente: 404");
  ok(!!(await falha("UPDATE IdentidadeSugestoes SET Status = 'ENVIADA', RetiradaEm = NULL WHERE SugestaoId = @s", { s: a3.body.sugestaoId })), "a retirada não volta (gatilho)");
  ok(!!(await falha("UPDATE IdentidadeSugestoes SET Texto = N'Outro texto' WHERE SugestaoId = @s", { s: a1.body.sugestaoId })), "o texto original não se reescreve (gatilho)");
  ok(!!(await falha("DELETE FROM IdentidadeSugestoes WHERE SugestaoId = @s", { s: a1.body.sugestaoId })), "a sugestão não se apaga (gatilho)");
  const a5 = await sugerir(M.ana, "Jovens que brilham");
  ok(a5.status === 201, "depois de retirar, a vaga volta (e o texto retirado pode ser mandado de novo)", a5.body);
  const dup = await sugerir(M.beto, "FAMILIA FE E MISSAO!!!");
  ok(dup.status === 422 && /outro membro/.test(dup.body.mensagem), "o mesmo tema (normalizado) de outra pessoa: recusado", dup.body);
  ok(!!(await falha("INSERT INTO IdentidadeSugestoes (CicloId, MembroId, Texto, TextoNormalizado) VALUES (@c, @m, N'Familia fe e missao', N'familia fe e missao')", { c: CICLO, m: M.beto })), "o banco também barra o texto repetido no ciclo (índice único)");
  ok((await sugerir(M.semComunhao, "Tema de quem está sem comunhão")).status === 422 && (await sugerir(M.desligado, "Tema de quem saiu")).status === 422, "sem comunhão e desligado: não participam");
  for (const [rot, t] of [["tag", "<b>Tema</b>"], ["invisível", "Tema" + String.fromCharCode(0x200b) + "oculto"], ["quebra de linha", "Tema\noutra linha"], ["81 letras", "x".repeat(81)], ["sem palavra", "!!! ???"], ["curto", "ab"]]) {
    ok((await sugerir(M.beto, t)).status === 422, `texto inválido (${rot}): recusado`);
  }
  for (const [m, t] of [[M.beto, "Igreja forte, família unida"], [M.carla, "Missão sem fronteiras"], [M.davi, "Tema que será descartado"], [M.eva, "Tempo de colheita"], [M.gil, "Sal da terra e luz do mundo"]]) {
    const r = await sugerir(m, t);
    ok(r.status === 201, `a sugestão "${t}" entra`, r.body);
  }
  const mm = await meu(M.ana);
  ok(mm.ciclo.fase === "SUGESTAO" && mm.minhasSugestoes.length === 4 && mm.minhasSugestoes.filter((s) => s.situacao === "RETIRADA").length === 1, "a Ana vê as dela (3 ativas e a retirada)", mm.minhasSugestoes);
  ok((await POST(H, "triar", DIR, { sugestaoId: a1.body.sugestaoId, decisao: "DESCARTADA", criterio: 1 })).status === 422, "a triagem não começa antes do dia 16");

  console.log("== triagem (16 a 21/nov) ==");
  em("2027-11-16T13:00:00Z");
  ok((await sugerir(M.hugo, "Tarde demais")).status === 422 && (await POST(H, "retirar-sugestao", PIN(M.ana), { sugestaoId: a5.body.sugestaoId })).status === 422, "depois do dia 15: nem sugerir nem retirar");
  // (revisão) a Secretaria cadastra dois temas antigos DEPOIS que as sugestões chegaram: a triagem tem de ver o igual e o parecido mesmo assim (antes, só o do envio)
  ok((await POST(H, "tema", DIR, { ano: 2019, tema: "Tempo da colheita" })).status === 201 && (await POST(H, "tema", DIR, { ano: 2018, tema: "Sal da terra e luz do mundo!" })).status === 201,
    "temas de 2019 e 2018 cadastrados depois do envio");
  const det = await GET(H, "ciclo", DIR, { cicloId: CICLO });
  ok(det.status === 200 && det.body.ciclo.fase === "TRIAGEM" && det.body.sugestoes.length === 8 && det.body.retiradas === 1 && det.body.participantes === 6, "a Diretoria vê as 8 sugestões ativas, de 6 pessoas", det.body.sugestoes.length);
  ok(!/Eng Ana E2E|Seg Beto E2E|Com Carla E2E|membroId/.test(JSON.stringify(det.body.sugestoes)), "a triagem vê só o texto, nunca quem mandou");
  const idDe = (texto) => det.body.sugestoes.find((s) => s.texto === texto).sugestaoId;
  const S = { familia: idDe("Família, fé e missão"), avante: idDe("Avante a Igreja do Senhor"), jovens: idDe("Jovens que brilham"), igreja: idDe("Igreja forte, família unida"),
    missao: idDe("Missão sem fronteiras"), descartar: idDe("Tema que será descartado"), colheita: idDe("Tempo de colheita"), sal: idDe("Sal da terra e luz do mundo") };
  const sugCol = det.body.sugestoes.find((x) => x.sugestaoId === S.colheita), sugSal = det.body.sugestoes.find((x) => x.sugestaoId === S.sal);
  ok(sugCol.parecido && sugCol.parecido.ano === 2019 && sugCol.parecido.igual === false && sugCol.parecidoNoEnvio === null, "(revisão) o parecido com um tema cadastrado DEPOIS do envio aparece na triagem", sugCol);
  ok(sugSal.parecido && sugSal.parecido.ano === 2018 && sugSal.parecido.igual === true, "(revisão) o igual a um tema cadastrado depois aparece como igual", sugSal);
  ok((await POST(H, "triar", DIR, { sugestaoId: S.sal, decisao: "FINALISTA" })).status === 422, "e o igual não vira finalista");
  ok((await POST(H, "triar", SEM_FATOR, { sugestaoId: S.familia, decisao: "FINALISTA" })).status === 428, "aprovar finalista sem a confirmação recente: 428");
  ok((await POST(H, "triar", LOCAL, { sugestaoId: S.familia, decisao: "FINALISTA" })).status === 403, "o Dirigente não faz triagem");
  const f1 = await POST(H, "triar", DIR, { sugestaoId: S.familia, decisao: "FINALISTA", textoAjustado: "Família: fé e missão", observacao: "Ajuste de pontuação" });
  ok(f1.status === 200, "aprovada com a redação ajustada", f1.body);
  const linhaF1 = await um("SELECT Texto, TextoFinal, Status, TriadoPorMembroId FROM IdentidadeSugestoes WHERE SugestaoId = @s", { s: S.familia });
  ok(linhaF1.Texto === "Família, fé e missão" && linhaF1.TextoFinal === "Família: fé e missão" && linhaF1.TriadoPorMembroId === 1002, "a original fica guardada; a ajustada vai à votação", linhaF1);
  const f1b = await POST(H, "triar", DIR, { sugestaoId: S.familia, decisao: "FINALISTA", observacao: "Conferida de novo" });
  ok(f1b.status === 200 && (await escalar("SELECT TextoFinal FROM IdentidadeSugestoes WHERE SugestaoId = @s", { s: S.familia })) === "Família: fé e missão", "(revisão) aprovar de novo SEM ajuste mantém o ajuste salvo", f1b.body);
  ok((await POST(H, "triar", DIR, { sugestaoId: S.avante, decisao: "FINALISTA", textoAjustado: "Avante, igreja" })).status === 422, "o ajuste que fica igual a um tema já usado: recusado");
  ok((await POST(H, "triar", DIR, { sugestaoId: S.igreja, decisao: "FINALISTA", textoAjustado: "familia fe e missao" })).status === 422, "duas finalistas com a mesma redação: recusado");
  ok((await POST(H, "triar", DIR, { sugestaoId: S.descartar, decisao: "DESCARTADA" })).status === 422, "descartar sem o critério: recusado");
  const d1 = await POST(H, "triar", SEM_FATOR, { sugestaoId: S.descartar, decisao: "DESCARTADA", criterio: "3", observacao: "Repete um tema" });
  ok(d1.status === 200 && (await escalar("SELECT Criterio FROM IdentidadeSugestoes WHERE SugestaoId = @s", { s: S.descartar })) === 3, "descartar (sem confirmação reforçada) guarda o critério 3 do Art. 159", d1.body);
  ok((await POST(H, "triar", DIR, { sugestaoId: S.avante, decisao: "DESCARTADA", criterio: 3 })).status === 200, "a parecida com 2027 é descartada");
  for (const s of [S.igreja, S.missao, S.colheita]) ok((await POST(H, "triar", DIR, { sugestaoId: s, decisao: "FINALISTA" })).status === 200, "mais uma finalista");
  const semFatorFin = await POST(H, "triar", SEM_FATOR, { sugestaoId: S.missao, decisao: "DESCARTADA", criterio: 1 });
  ok(semFatorFin.status === 428 && (await escalar("SELECT Status FROM IdentidadeSugestoes WHERE SugestaoId = @s", { s: S.missao })) === "FINALISTA", "(revisão) descartar uma FINALISTA sem a confirmação recente: 428, nada muda");
  ok((await POST(H, "triar", SEM_FATOR, { sugestaoId: S.colheita, decisao: "ENVIADA" })).status === 428, "(revisão) voltar uma finalista para a triagem também pede");
  ok((await POST(H, "triar", DIR, { sugestaoId: S.colheita, decisao: "ENVIADA" })).status === 200 && (await escalar("SELECT Status FROM IdentidadeSugestoes WHERE SugestaoId = @s", { s: S.colheita })) === "ENVIADA", "a decisão pode ser desfeita enquanto a votação não abriu");
  ok((await POST(H, "triar", DIR, { sugestaoId: a3.body.sugestaoId, decisao: "FINALISTA" })).status === 422, "a retirada não vira finalista");
  const membroAntes = await meu(M.ana);
  ok(membroAntes.minhasSugestoes.every((s) => s.situacao === "ENVIADA" || s.situacao === "RETIRADA"), "durante a triagem o membro vê \"em análise\" (a decisão aparece quando a votação abre)", membroAntes.minhasSugestoes);
  ok((await POST(H, "abrir-votacao", DIR, { cicloId: CICLO })).status === 422, "a votação não abre antes do dia 22");
  await avaliarRegras(await obterPool(), { chaves: ["IDENTIDADE_TRIAGEM", "IDENTIDADE_VOTACAO", "IDENTIDADE_APURACAO", "IDENTIDADE_ARTE"] });
  await avaliarRegras(await obterPool(), { chaves: ["IDENTIDADE_TRIAGEM"] });
  const avT = await avisos("IDENTIDADE_TRIAGEM");
  ok(DIRETORIA.length >= 2 && DIRETORIA.includes(1001) && DIRETORIA.includes(1002), "a Diretoria do cenário: quem tem a permissão num papel do nível Geral", DIRETORIA);
  ok(avT.length === DIRETORIA.length && avT.map((a) => a.d).sort((x, y) => x - y).join() === DIRETORIA.join() && /8 sugestão/.test(avT[0].m), "o aviso da triagem vai a cada um da Diretoria (Presidente e Secretário Geral), uma vez só, com o número de sugestões", avT);
  ok((await avisos("IDENTIDADE_VOTACAO")).length === 0 && (await avisos("IDENTIDADE_ARTE")).length === 0, "nenhum aviso fora da etapa");

  console.log("== votação (22 a 30/nov): abre sozinha, vota-se pela Enquete ==");
  em("2027-11-22T11:00:00Z");
  const pendentes = await escalar("SELECT COUNT(*) FROM IdentidadeSugestoes WHERE CicloId = @c AND Status = 'ENVIADA'", { c: CICLO });
  const mv0 = await meu(M.beto);
  ok(pendentes > 0 && mv0.votacao === null && mv0.ciclo.fase === "VOTACAO", `(revisão) com ${pendentes} sugestão(ões) sem decisão, a votação NÃO abre sozinha no dia 22`, mv0.votacao);
  await avaliarRegras(await obterPool(), { chaves: ["IDENTIDADE_VOTACAO"] });
  const avEsp = (await avisos("IDENTIDADE_VOTACAO")).filter((a) => a.ref < 0);
  ok(avEsp.length === DIRETORIA.length && /NÃO abriu sozinha: há \d+ sugestão\(ões\) ainda sem decisão/.test(avEsp[0].m), "(revisão) a Diretoria é avisada de que ela espera a triagem (ou o botão)", avEsp);
  const perg = await POST(H, "abrir-votacao", DIR, { cicloId: CICLO });
  ok(perg.status === 422 && perg.body.pendentes === pendentes, "(revisão) o botão diz quantas estão sem decisão e pede a confirmação", perg.body);
  for (const sid of (await q("SELECT SugestaoId FROM IdentidadeSugestoes WHERE CicloId = @c AND Status = 'ENVIADA'", { c: CICLO })).map((x) => x.SugestaoId)) {
    await POST(H, "triar", DIR, { sugestaoId: sid, decisao: "DESCARTADA", criterio: 2 });
  }
  const mv = await meu(M.beto);
  ok(mv.ciclo.fase === "VOTACAO" && mv.votacao && mv.votacao.aberta && mv.votacao.opcoes.length === 3 && mv.ciclo.votacaoAutomatica === true, "no dia 22 o primeiro acesso abre a votação, com as 3 finalistas", mv.votacao);
  ok(mv.votacao.opcoes.every((o) => o.votos === undefined), "durante a votação ninguém vê a contagem");
  const enq = await um("SELECT e.*, (SELECT COUNT(*) FROM PerguntasEnquete p WHERE p.EnqueteId = e.EnqueteId) AS Perguntas FROM Enquetes e JOIN IdentidadeCiclos c ON c.EnqueteId = e.EnqueteId WHERE c.CicloId = @c", { c: CICLO });
  ok(enq.PublicoTipo === "TODOS_ATIVOS" && enq.Visibilidade === "SECRETA" && enq.Perguntas === 1 && enq.CriadoPor === null && new Date(enq.DataFechamentoPrevista).toISOString() === "2027-12-01T03:00:00.000Z",
    "a enquete: toda a membresia apta, secreta, uma pergunta, aberta pelo sistema, fecha à meia-noite de 30/11 (Brasília)", enq);
  ok(mv.votacao.opcoes.map((o) => o.texto).includes("Família: fé e missão"), "a finalista vai com a redação ajustada");
  ok((await POST(H, "abrir-votacao", DIR, { cicloId: CICLO })).body.jaExistia === true, "o botão de abrir não cria outra (uma por ciclo)");
  ok((await POST(H, "triar", DIR, { sugestaoId: S.colheita, decisao: "FINALISTA" })).status === 409, "com a votação aberta, a lista de finalistas não muda");
  ok(!!(await falha("UPDATE IdentidadeSugestoes SET Status = 'DESCARTADA', Criterio = 1 WHERE SugestaoId = @s", { s: S.missao })), "a cédula congelou também no banco (gatilho)");
  const mvAna = await meu(M.ana);
  ok(mvAna.minhasSugestoes.find((s) => s.sugestaoId === S.familia).situacao === "FINALISTA" && mvAna.minhasSugestoes.find((s) => s.sugestaoId === S.avante).situacao === "DESCARTADA", "agora a Ana vê a decisão da triagem", mvAna.minhasSugestoes);
  const pv = await GET(ENQ, undefined, PIN(M.ana), { paraVotar: "1" });
  const pvEnq = (pv.body.enquetes || []).find((e) => e.identidadeVisual === 2028);
  ok(pv.status === 200 && pvEnq && pvEnq.jaRespondeu === false && pvEnq.perguntas[0].opcoes.length === 3 && !JSON.stringify(pvEnq).includes("votos"), "Meu Painel → Votações lista a enquete aberta, sem contagem", pv.body);
  const pvSem = await GET(ENQ, undefined, PIN(M.semComunhao), { paraVotar: "1" });
  ok(!(pvSem.body.enquetes || []).some((e) => e.identidadeVisual === 2028), "quem está sem comunhão não a vê");
  const opc = Object.fromEntries(mv.votacao.opcoes.map((o) => [o.texto, o.opcaoId]));
  const P1 = mv.votacao.perguntaId;
  const votos = [[M.ana, "Família: fé e missão"], [M.beto, "Família: fé e missão"], [M.carla, "Missão sem fronteiras"], [M.davi, "Família: fé e missão"], [M.eva, "Igreja forte, família unida"], [1001, "Missão sem fronteiras"]];
  for (const [m, t] of votos) { const r = await votar(m, enq.EnqueteId, P1, opc[t]); ok(r.status === 200 && r.body.sucesso, `voto de ${m}`, r.body); }
  const dobrado = await votar(M.ana, enq.EnqueteId, P1, opc["Missão sem fronteiras"]);
  ok(dobrado.body.sucesso === false && /já respondeu/.test(dobrado.body.mensagem), "votar de novo: recusado (uma vez por pessoa)", dobrado.body);
  ok((await votar(M.semComunhao, enq.EnqueteId, P1, opc["Missão sem fronteiras"])).body.sucesso === false, "sem comunhão não vota");
  const pv2 = await GET(ENQ, undefined, PIN(M.ana), { paraVotar: "1" });
  ok(pv2.body.enquetes.find((e) => e.identidadeVisual === 2028).jaRespondeu === true, "depois de votar, o Meu Painel diz que já respondeu");
  const ctxEnc = { bindingData: { id: String(enq.EnqueteId), acao: "encerrar" }, log: { error() { } } };
  await ENQ(ctxEnc, { method: "POST", query: {}, body: {}, headers: { "x-auth-token": GERAL(1002, ["reunioes", "assembleia"]) } });
  ok(ctxEnc.res.body.sucesso === false && /fecha sozinha/.test(ctxEnc.res.body.mensagem), "a votação da identidade não se encerra à mão", ctxEnc.res.body);
  const listaMesa = await GET(ENQ, undefined, GERAL(1002, ["reunioes", "assembleia"]));
  const naLista = (listaMesa.body || []).find((e) => e.enqueteId === enq.EnqueteId);
  ok(naLista && naLista.perguntas[0].opcoes.every((o) => o.votos === undefined) && naLista.participantes.length === 0, "na aba Enquetes, nem a mesa do geral vê a contagem nem quem votou enquanto a votação está aberta", naLista && naLista.perguntas[0].opcoes);
  const detV = (await GET(H, "ciclo", DIR, { cicloId: CICLO })).body;
  ok(detV.votacao.participantes === 6 && detV.votacao.opcoes.every((o) => o.votos === undefined), "a Diretoria vê quantos votaram, não em quem", detV.votacao);
  await avaliarRegras(await obterPool(), { chaves: ["IDENTIDADE_VOTACAO"] });
  const avV = await avisos("IDENTIDADE_VOTACAO");
  const avVa = avV.filter((a) => a.ref === CICLO);
  ok(avVa.length === DIRETORIA.length && /está aberta/.test(avVa[0].m), "o aviso da votação aberta vai à Diretoria", avV);
  ok((await q("SELECT DISTINCT DestinatarioMembroId AS d FROM Notificacoes WHERE RegraChave LIKE 'IDENTIDADE_%'")).every((x) => DIRETORIA.includes(x.d)), "nenhum aviso a membro (só à Diretoria)");

  console.log("== apuração (depois da meia-noite de 30/11) ==");
  em("2027-11-30T23:00:00Z");                                       // 20h de 30/11 em Brasília: ainda aberta
  ok((await meu(M.ana)).votacao.aberta === true && (await escalar("SELECT Apuracao FROM IdentidadeCiclos WHERE CicloId = @c", { c: CICLO })) === null, "às 20h do dia 30 a votação segue aberta");
  em("2027-12-01T03:30:00Z");                                       // 00h30 de 1º/12 em Brasília (o relógio da regra)
  // (revisão) o relógio da regra já passou, mas o do BANCO não (a data marcada ainda está no futuro para ele): não apura — o voto ainda é aceito pela hora do banco
  ok((await meu(M.carla)).ciclo.apuracao === null && (await escalar("SELECT Status FROM Enquetes WHERE EnqueteId = @e", { e: enq.EnqueteId })) === "ABERTA",
    "(revisão) quem decide que a votação fechou é a hora do BANCO (a mesma que o voto confere): sem ela, não apura");
  // o banco "chega" à data marcada: a data passa a ser AGORA (os votos do roteiro foram gravados antes)
  await q("UPDATE Enquetes SET DataFechamentoPrevista = SYSUTCDATETIME() WHERE EnqueteId = @e", { e: enq.EnqueteId });
  const previstaBanco = await escalar("SELECT CONVERT(varchar(33), DataFechamentoPrevista, 126) FROM Enquetes WHERE EnqueteId = @e", { e: enq.EnqueteId });
  const ma = await meu(M.carla);
  ok(ma.ciclo.fase === "ARTE" && ma.ciclo.apuracao === "VENCEDOR" && ma.ciclo.tema.texto === "Família: fé e missão" && ma.ciclo.tema.votos === 3 && ma.ciclo.votosTotal === 6, "passada a meia-noite, o primeiro acesso fecha e apura: vence a da Ana, 3 de 6", ma.ciclo);
  const enqF = await um("SELECT Status, DataFechamento FROM Enquetes WHERE EnqueteId = @e", { e: enq.EnqueteId });
  ok(enqF.Status === "ENCERRADA" && new Date(enqF.DataFechamento).getTime() === new Date(previstaBanco + "Z").getTime(), "a enquete fica ENCERRADA no instante marcado", { enqF, previstaBanco });
  ok((await q("SELECT VotosApurados FROM IdentidadeSugestoes WHERE CicloId = @c AND Status = 'FINALISTA' ORDER BY VotosApurados DESC", { c: CICLO })).map((x) => x.VotosApurados).join() === "3,2,1",
    "(revisão) os votos de cada finalista ficam gravados na apuração");
  ok(ma.votacao.opcoes.find((o) => o.texto === "Família: fé e missão").votos === 3, "fechada, a contagem aparece");
  ok((await votar(M.gil, enq.EnqueteId, P1, opc["Missão sem fronteiras"])).body.sucesso === false, "depois de fechada, ninguém mais vota");
  ok(!!(await falha("UPDATE IdentidadeCiclos SET TemaTexto = N'Outro' WHERE CicloId = @c", { c: CICLO })), "o tema apurado não muda (gatilho)");
  await avaliarRegras(await obterPool(), { chaves: ["IDENTIDADE_APURACAO", "IDENTIDADE_ARTE"] });
  ok((await avisos("IDENTIDADE_APURACAO")).length === DIRETORIA.length && /Família: fé e missão/.test((await avisos("IDENTIDADE_APURACAO"))[0].m), "o aviso da apuração, com o tema");
  ok((await avisos("IDENTIDADE_ARTE")).length === DIRETORIA.length && /Registre até 3 cores/.test((await avisos("IDENTIDADE_ARTE"))[0].m), "o aviso da fase da arte pede as cores");

  console.log("== cores e concurso de arte (dezembro) ==");
  ok((await enviarArte(M.gil, png(1))).status === 422, "sem cor registrada, ainda não se manda arte");
  ok((await POST(H, "cor", DIR, { cicloId: CICLO, ordem: 4, nome: "Azul", hex: "#112233" })).status === 422 && (await POST(H, "cor", DIR, { cicloId: CICLO, ordem: 1, nome: "Azul", hex: "#123" })).status === 422, "posição 1 a 3 e cor #RRGGBB");
  ok((await POST(H, "cor", DIR, { cicloId: CICLO, ordem: 1, nome: "<i>Azul</i>", hex: "#112233" })).status === 422, "nome da cor com tag: recusado");
  const c1 = await POST(H, "cor", DIR, { cicloId: CICLO, ordem: 1, nome: "Azul royal", hex: "#1a4d8f" });
  ok(c1.status === 200 && (await escalar("SELECT Hex FROM IdentidadeCores WHERE CorId = @k", { k: c1.body.corId })) === "#1A4D8F", "cor 1 registrada (o código fica em maiúsculas)", c1.body);
  ok(!!(await falha("INSERT INTO IdentidadeCores (CicloId, Ordem, Nome, Hex, RegistradoPorMembroId) VALUES (@c, 2, N'Errada', '#zzzzzz', 1002)", { c: CICLO })), "o banco recusa código de cor inválido");
  const art1 = await enviarArte(M.gil, png(1), "image/png", { titulo: "Arte do Gil" });
  ok(art1.status === 201 && blobs.size === 1, "o Gil manda a arte (a imagem vai ao armazenamento)", art1.body);
  ok((await enviarArte(M.gil, png(1))).status === 422, "a mesma imagem de novo: recusada");
  ok((await enviarArte(M.gil, Buffer.from("não sou uma imagem, sou um texto qualquer"))).status === 422, "texto com o tipo de PNG: recusado (a assinatura do arquivo é conferida)");
  ok((await enviarArte(M.gil, jpeg(2), "image/gif")).status === 422 && (await enviarArte(M.gil, png(3), "image/jpeg")).status === 422, "só PNG ou JPEG, e o tipo tem de bater com o arquivo");
  ok((await enviarArte(M.gil, png(4, 5 * 1024 * 1024 + 10))).status === 422, "imagem acima de 5 MB: recusada");
  ok((await enviarArte(M.semComunhao, png(5))).status === 422, "sem comunhão não manda arte");
  const art2 = await enviarArte(M.gil, jpeg(6), "image/jpeg");
  const art3 = await enviarArte(M.gil, png(7));
  ok(art2.status === 201 && art3.status === 201 && (await enviarArte(M.gil, png(8))).status === 422, "até 3 artes por pessoa");
  const artHugo = await enviarArte(M.hugo, png(9), "image/png", { titulo: "Arte do Hugo", descricao: "Baseada no azul royal" });
  ok(artHugo.status === 201, "o Hugo manda a dele");
  ok((await POST(H, "cor", DIR, { cicloId: CICLO, ordem: 1, nome: "Azul claro", hex: "#AABBCC" })).status === 422 && (await POST(H, "excluir-cor", DIR, { corId: c1.body.corId })).status === 422,
    "depois da primeira arte, a cor em que desenharam não muda nem sai");
  ok(!!(await falha("UPDATE IdentidadeCores SET Hex = '#000000' WHERE CorId = @k", { k: c1.body.corId })), "o banco também barra (gatilho)");
  const c2 = await POST(H, "cor", DIR, { cicloId: CICLO, ordem: 2, nome: "Branco", hex: "#FFFFFF" });
  ok(c2.status === 200, "acrescentar a 2ª cor ainda pode");
  const imgGil = await GET(H, "imagem", PIN(M.gil), { arteId: art1.body.arteId });
  ok(imgGil.status === 200 && /\?sas=e2e$/.test(imgGil.body.url), "o Gil abre a imagem dele (endereço assinado)", imgGil.body);
  ok((await GET(H, "imagem", PIN(M.hugo), { arteId: art1.body.arteId })).status === 404, "o Hugo não abre a do Gil (404)");
  ok((await GET(H, "imagem", DIR, { arteId: art1.body.arteId })).status === 200, "a Diretoria abre qualquer uma");
  const urlArt3 = await escalar("SELECT ArquivoUrl FROM IdentidadeArtes WHERE ArteId = @a", { a: art3.body.arteId });
  const rArt = await POST(H, "retirar-arte", PIN(M.gil), { arteId: art3.body.arteId });
  ok(rArt.status === 200 && apagados.includes(urlArt3) && (await escalar("SELECT ArquivoUrl FROM IdentidadeArtes WHERE ArteId = @a", { a: art3.body.arteId })) === null, "retirar a arte apaga a imagem", rArt.body);
  ok((await POST(H, "retirar-arte", PIN(M.hugo), { arteId: art1.body.arteId })).status === 404, "retirar a de outro: 404");
  ok((await POST(H, "recusar-arte", DIR, { arteId: art2.body.arteId, motivo: "x" })).status === 422, "recusar sem motivo de verdade: recusado");
  ok((await POST(H, "recusar-arte", DIR, { arteId: art2.body.arteId, motivo: "Ilegível nas cores do tecido" })).status === 200, "a Diretoria tira do concurso a arte ilegível (Art. 159 § 1º, IV, c)");
  const mGil = await meu(M.gil);
  ok(mGil.minhasArtes.find((a) => a.arteId === art2.body.arteId).motivoRecusa === "Ilegível nas cores do tecido" && mGil.cores.length === 2, "o Gil vê o motivo e as cores", mGil.minhasArtes);
  const detA = (await GET(H, "ciclo", DIR, { cicloId: CICLO })).body;
  ok(detA.artes.length === 3 && detA.artes.find((a) => a.arteId === artHugo.body.arteId).autor === "Com Hugo E2E", "a Diretoria vê as artes com o autor (para falar com quem desenhou)", detA.artes.map((a) => a.autor));

  const trilhaMembro = await q("SELECT Tabela, RegistroId, UsuarioId, Acao FROM AuditLog WHERE Acao IN ('IDENTIDADE_SUGESTAO_ENVIADA', 'IDENTIDADE_SUGESTAO_RETIRADA', 'IDENTIDADE_ARTE_ENVIADA', 'IDENTIDADE_ARTE_RETIRADA')");
  ok(trilhaMembro.length >= 12 && trilhaMembro.every((x) => x.UsuarioId === null && x.Tabela === "IdentidadeCiclos" && x.RegistroId === CICLO),
    "(revisão) a trilha de mandar/retirar sugestão e arte não guarda quem foi nem o número da sugestão/arte (só o ciclo)", trilhaMembro.slice(0, 3));
  // (revisão, item 13) a imagem guardada não tem os metadados do celular (GPS, EXIF)
  const guardadas = [...blobs.values()].filter((b) => b.bytes);
  ok(guardadas.length >= 3 && guardadas.every((b) => !b.bytes.toString("latin1").includes("GPS") && !b.bytes.toString("latin1").includes("Exif")), "(revisão) nenhuma imagem guardada leva GPS nem EXIF");
  ok(guardadas.some((b) => b.tipo === "image/jpeg" && b.bytes.toString("latin1").includes("JFIF")) && guardadas.some((b) => b.tipo === "image/png" && b.bytes.toString("latin1").includes("IDAT")), "e a imagem continua inteira (o desenho fica)");
  // (revisão, item 7) depois de 24/12 o membro não retira mais a arte (a Diretoria já prepara a escolha do culto)
  em("2027-12-25T12:00:00Z");
  const tarde = await POST(H, "retirar-arte", PIN(M.gil), { arteId: art1.body.arteId });
  ok(tarde.status === 422 && /até 24\/12\/2027/.test(tarde.body.mensagem) && (await escalar("SELECT Status FROM IdentidadeArtes WHERE ArteId = @a", { a: art1.body.arteId })) === "ENVIADA", "(revisão) depois de 24/12 a arte não se retira", tarde.body);
  ok((await meu(M.gil)).minhasArtes.every((a) => a.podeRetirar === false), "e a tela não oferece o botão");

  console.log("== a escolha final do culto ==");
  em("2027-12-20T14:00:00Z");
  const base = { cicloId: CICLO, arteId: artHugo.body.arteId, corId: c1.body.corId, dataCulto: "2027-12-19", ocasiao: "CULTO_ADMINISTRATIVO", votosVencedor: 120, presentes: 180, ata: "Ata 12/2027, folha 3" };
  ok((await POST(H, "resultado", SEM_FATOR, base)).status === 428, "registrar a identidade oficial pede a confirmação reforçada");
  ok((await POST(H, "resultado", DIR, { ...base, dataCulto: "2027-12-25" })).status === 422, "culto no futuro: recusado");
  ok((await POST(H, "resultado", DIR, { ...base, dataCulto: "2027-11-28" })).status === 422, "culto fora de dezembro: recusado");
  ok((await POST(H, "resultado", DIR, { ...base, presentes: 100 })).status === 422, "presentes menos que os votos: recusado");
  ok((await POST(H, "resultado", DIR, { ...base, arteId: art2.body.arteId })).status === 422, "a arte recusada não pode ser a escolhida");
  const res = await POST(H, "resultado", DIR, base);
  ok(res.status === 201, "resultado registrado", res.body);
  const tema2028 = await um("SELECT Tema, Origem, CicloId FROM IdentidadeTemasUsados WHERE Ano = 2028");
  ok(tema2028 && tema2028.Tema === "Família: fé e missão" && tema2028.Origem === "PROCESSO" && tema2028.CicloId === CICLO, "o tema entrou sozinho na lista de temas já usados (origem PROCESSO)", tema2028);
  ok((await escalar("SELECT Status FROM IdentidadeArtes WHERE ArteId = @a", { a: artHugo.body.arteId })) === "ESCOLHIDA", "a arte do Hugo é a escolhida");
  ok((await POST(H, "resultado", DIR, base)).status === 422, "registrar de novo: recusado");
  em("2027-12-21T12:00:00Z");
  ok((await POST(H, "retirar-arte", PIN(M.gil), { arteId: art1.body.arteId })).status === 422, "(revisão) com o resultado registrado, nenhuma arte se retira (nem antes de 24/12)");
  em("2027-12-20T14:00:00Z");
  const temaProc = (await GET(H, "temas", DIR)).body.temas.find((t) => t.ano === 2028);
  ok((await POST(H, "tema", DIR, { temaUsadoId: temaProc.temaUsadoId, ano: 2028, tema: "Outro" })).status === 422 && (await POST(H, "excluir-tema", DIR, { temaUsadoId: temaProc.temaUsadoId })).status === 422, "o tema do processo não se edita nem se apaga pela tela");
  ok(!!(await falha("DELETE FROM IdentidadeTemasUsados WHERE Ano = 2028")) && !!(await falha("UPDATE IdentidadeResultados SET VotosVencedor = 1")) && !!(await falha("DELETE FROM IdentidadeResultados")), "nem no banco (gatilhos)");
  const mFim = await meu(M.eva);
  ok(mFim.ciclo.fase === "ENCERRADO" && mFim.resultado.tema === "Família: fé e missão" && mFim.resultado.cor.hex === "#1A4D8F", "o membro vê a identidade oficial de 2028", mFim.resultado);
  ok((await GET(H, "imagem", PIN(M.eva), { arteId: artHugo.body.arteId })).status === 200 && (await GET(H, "imagem", PIN(M.eva), { arteId: art1.body.arteId })).status === 404, "a arte escolhida qualquer membro abre; a não escolhida, não");
  ok((await POST(H, "cancelar-ciclo", DIR, { cicloId: CICLO })).status === 422, "o ciclo com sugestões não se cancela");

  console.log("== Meus Dados e a exclusão LGPD ==");
  const ctxMD = { bindingData: { matricula: String(M.ana) }, log: Object.assign(() => { }, { error() { } }) };
  await MEUS_DADOS(ctxMD, { method: "GET", query: {}, headers: { "x-auth-token": PIN(M.ana) } });
  const ivAna = ctxMD.res.body.identidadeVisual || (ctxMD.res.body.dados || {}).identidadeVisual;
  ok(ctxMD.res.status === 200 && ivAna && ivAna.sugestoesDeTema.length === 4 && ivAna.sugestoesDeTema.some((s) => s.texto === "Família, fé e missão" && s.situacao === "FINALISTA"), "em Meus Dados a Ana vê as sugestões dela", ivAna);
  const ctxMG = { bindingData: { matricula: String(M.gil) }, log: Object.assign(() => { }, { error() { } }) };
  await MEUS_DADOS(ctxMG, { method: "GET", query: {}, headers: { "x-auth-token": PIN(M.gil) } });
  const ivGil = ctxMG.res.body.identidadeVisual || (ctxMG.res.body.dados || {}).identidadeVisual;
  ok(ivGil && ivGil.artesEnviadas.length === 3, "e o Gil, as artes dele", ivGil);
  const urlsGil = (await q("SELECT ArquivoUrl FROM IdentidadeArtes WHERE MembroId = @m AND ArquivoUrl IS NOT NULL", { m: M.gil })).map((x) => x.ArquivoUrl);
  const votosAntes = await escalar("SELECT COUNT(*) FROM RespostasEnquete WHERE PerguntaId = @p", { p: P1 });
  for (const m of [M.ana, M.gil, M.hugo]) {
    const sol = (await q("INSERT INTO SolicitacoesTitularLGPD (MembroId, Tipo, Status) VALUES (@m, 'EXCLUSAO', 'PENDENTE'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { m }))[0].id;
    const ctxEx = { bindingData: { id: String(sol) }, log: Object.assign(() => { }, { error() { } }) };
    await EXCLUSAO(ctxEx, { method: "POST", query: {}, body: {}, headers: { "x-auth-token": GERAL(1002, ["protecaodedados"]) } });
    ok(ctxEx.res.status === 200 && ctxEx.res.body.sucesso, `a exclusão LGPD de ${m} executa`, ctxEx.res.body);
  }
  ok((await escalar("SELECT COUNT(*) FROM IdentidadeSugestoes WHERE MembroId IN (2001, 2010, 2011)")) === 0 && (await escalar("SELECT COUNT(*) FROM IdentidadeArtes WHERE MembroId IN (2001, 2010, 2011)")) === 0, "as sugestões e as artes perderam o nome");
  ok((await escalar("SELECT Texto FROM IdentidadeSugestoes WHERE SugestaoId = @s", { s: S.avante })) === "(removida a pedido do titular)", "a sugestão que não foi finalista perdeu também o texto");
  ok((await escalar("SELECT Texto FROM IdentidadeSugestoes WHERE SugestaoId = @s", { s: S.familia })) === "Família, fé e missão", "a finalista (foi à votação pública) fica, sem nome");
  ok(urlsGil.every((u) => apagados.includes(u)) && (await escalar("SELECT COUNT(*) FROM IdentidadeArtes WHERE ArteId IN (@a, @b) AND ArquivoUrl IS NULL", { a: art1.body.arteId, b: art2.body.arteId })) === 2, "as imagens não escolhidas do Gil saíram do armazenamento");
  ok((await escalar("SELECT COUNT(*) FROM IdentidadeArtes WHERE ArteId = @a AND ArquivoUrl IS NOT NULL AND Status = 'ESCOLHIDA'", { a: artHugo.body.arteId })) === 1, "a arte escolhida (a identidade oficial) fica, sem o nome do Hugo");
  ok((await escalar("SELECT COUNT(*) FROM RespostasEnquete WHERE PerguntaId = @p", { p: P1 })) === votosAntes && (await escalar("SELECT COUNT(*) FROM IdentidadeTemasUsados WHERE Ano = 2028")) === 1, "a contagem e o tema escolhido ficam");
  const auditLgpd = await q("SELECT DadosDepois FROM AuditLog WHERE Tabela = 'IdentidadeSugestoes' AND Acao LIKE N'Exclusão LGPD%'");
  ok(auditLgpd.length === 3, "a exclusão de cada um ficou na auditoria (só as contagens)", auditLgpd.length);

  console.log("== o ciclo de 2029: votação sem finalistas, botão, empate e desempate ==");
  em("2028-10-01T12:00:00Z");
  const ab29 = await POST(H, "abrir-ciclo", DIR, { anoAlvo: 2029 });
  ok(ab29.status === 201 && (await POST(H, "cancelar-ciclo", DIR, { cicloId: ab29.body.cicloId })).status === 200, "o ciclo aberto por engano, ainda vazio, se cancela");
  const C29 = (await POST(H, "abrir-ciclo", DIR, { anoAlvo: "2029" })).body.cicloId;
  ok(!!C29, "e se abre de novo");
  em("2028-11-03T12:00:00Z");
  const s29 = {};
  ok((await sugerir(M.beto, "FAMÍLIA: FÉ E MISSÃO")).status === 422, "o tema escolhido em 2028 (processo) já conta como usado");
  for (const [k, m, t] of [["a", M.beto, "Raízes e asas"], ["b", M.carla, "Unidos no amor"], ["c", M.davi, "Herança e esperança"]]) s29[k] = (await sugerir(m, t)).body.sugestaoId;
  em("2028-11-18T12:00:00Z");
  ok((await POST(H, "triar", DIR, { sugestaoId: s29.a, decisao: "FINALISTA" })).status === 200, "uma finalista só");
  em("2028-11-22T12:00:00Z");
  const m29 = await meu(M.beto);
  ok(m29.ciclo.fase === "VOTACAO" && m29.votacao === null, "com uma finalista, a votação não abre sozinha");
  const semFin = await POST(H, "abrir-votacao", DIR, { cicloId: C29 });
  ok(semFin.status === 422 && semFin.body.faltamFinalistas === true, "nem pelo botão (são precisas 2)", semFin.body);
  await avaliarRegras(await obterPool(), { chaves: ["IDENTIDADE_VOTACAO"] });
  await avaliarRegras(await obterPool(), { chaves: ["IDENTIDADE_VOTACAO"] });
  const avNao = (await avisos("IDENTIDADE_VOTACAO")).filter((a) => a.ref === -20281122);
  ok(avNao.length === DIRETORIA.length && /NÃO abriu/.test(avNao[0].m), "a Diretoria é avisada de que a votação não abriu (uma vez por dia)", avNao);
  ok((await POST(H, "triar", DIR, { sugestaoId: s29.b, decisao: "FINALISTA" })).status === 200 && (await POST(H, "triar", DIR, { sugestaoId: s29.c, decisao: "FINALISTA" })).status === 200,
    "a Diretoria atrasada ainda aprova no dia 22 (a votação não abriu)");
  ok((await POST(H, "abrir-votacao", SEM_FATOR, { cicloId: C29 })).status === 428, "abrir pelo botão pede a confirmação reforçada");
  const bot = await POST(H, "abrir-votacao", PRES, { cicloId: C29 });
  ok(bot.status === 201 && bot.body.finalistas === 3 && (await escalar("SELECT VotacaoCriadaPorMembroId FROM IdentidadeCiclos WHERE CicloId = @c", { c: C29 })) === 1001, "o Presidente abre pelo botão; fica quem abriu", bot.body);
  const v29 = (await meu(M.ana)).votacao;
  const o29 = Object.fromEntries(v29.opcoes.map((o) => [o.texto, o.opcaoId]));
  await votar(M.beto, v29.enqueteId, v29.perguntaId, o29["Raízes e asas"]);
  await votar(M.carla, v29.enqueteId, v29.perguntaId, o29["Unidos no amor"]);
  em("2028-12-01T04:00:00Z");
  await q("UPDATE Enquetes SET DataFechamentoPrevista = SYSUTCDATETIME() WHERE EnqueteId = @e", { e: v29.enqueteId });
  await db.rotinaDiaria(await obterPool());
  const c29 = await um("SELECT Apuracao, TemaSugestaoId, VotosTotal FROM IdentidadeCiclos WHERE CicloId = @c", { c: C29 });
  ok(c29.Apuracao === "EMPATE" && c29.TemaSugestaoId === null && c29.VotosTotal === 2, "a rotina diária apura: EMPATE, sem tema", c29);
  await avaliarRegras(await obterPool(), { chaves: ["IDENTIDADE_APURACAO"] });
  ok((await avisos("IDENTIDADE_APURACAO")).some((a) => a.ref === C29 && /EMPATE/.test(a.m)), "a Diretoria é avisada do empate");
  ok((await POST(H, "resultado", DIR, { cicloId: C29, arteId: artHugo.body.arteId, corId: c1.body.corId, dataCulto: "2028-12-01", ocasiao: "VIGILIA", votosVencedor: 5 })).status === 422, "sem tema definido, o resultado não se registra");
  ok((await POST(H, "desempate", SEM_FATOR, { sugestaoId: s29.a, motivo: "Decisão da Diretoria" })).status === 428, "o desempate pede a confirmação reforçada");
  // (revisão) um voto "fantasma" gravado DEPOIS da apuração, com data de antes do fechamento: a recontagem ao vivo empataria a terceira; a contagem GRAVADA, não
  await q("INSERT INTO RespostasEnquete (PerguntaId, MembroId, OpcaoId, DataResposta) SELECT @p, 2012, @o, DATEADD(MINUTE, -5, DataFechamentoPrevista) FROM Enquetes WHERE EnqueteId = @e",
    { p: v29.perguntaId, o: o29["Herança e esperança"], e: v29.enqueteId });
  ok((await POST(H, "desempate", DIR, { sugestaoId: s29.c, motivo: "Decisão da Diretoria" })).status === 422, "só entre as empatadas em primeiro (a sem voto, não) — pela contagem GRAVADA na apuração, nunca recontada");
  ok((await POST(H, "desempate", DIR, { sugestaoId: s29.a, motivo: "ok" })).status === 422, "com o motivo escrito");
  const dz = await POST(H, "desempate", DIR, { sugestaoId: s29.a, motivo: "Reunião da Diretoria de 02/12/2028, ata 40" });
  const c29b = await um("SELECT TemaTexto, TemaDefinidoPor, DesempatePorMembroId FROM IdentidadeCiclos WHERE CicloId = @c", { c: C29 });
  ok(dz.status === 200 && c29b.TemaTexto === "Raízes e asas" && c29b.TemaDefinidoPor === "DESEMPATE" && c29b.DesempatePorMembroId === 1002, "o tema fica definido pela Diretoria, com quem e por quê", c29b);
  ok((await POST(H, "desempate", DIR, { sugestaoId: s29.b, motivo: "Mudamos de ideia" })).status === 422, "e não muda mais");
  em("2028-12-03T12:00:00Z");
  const cor29 = await POST(H, "cor", DIR, { cicloId: C29, ordem: 1, nome: "Verde bandeira", hex: "#00A859" });
  const arteIvo = await enviarArte(M.ivo, png(41), "image/png", { titulo: "Arte do Ivo" });
  ok(cor29.status === 200 && arteIvo.status === 201, "2029: a cor e a arte do Ivo", [cor29.body, arteIvo.body]);
  const urlIvo = await escalar("SELECT ArquivoUrl FROM IdentidadeArtes WHERE ArteId = @a", { a: arteIvo.body.arteId });
  const solIvo = (await q("INSERT INTO SolicitacoesTitularLGPD (MembroId, Tipo, Status) VALUES (@m, 'EXCLUSAO', 'PENDENTE'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { m: M.ivo }))[0].id;
  const ctxIvo = { bindingData: { id: String(solIvo) }, log: Object.assign(() => { }, { error() { } }) };
  await EXCLUSAO(ctxIvo, { method: "POST", query: {}, body: {}, headers: { "x-auth-token": GERAL(1002, ["protecaodedados"]) } });
  const linhaIvo = await um("SELECT MembroId, ArquivoUrl, Status FROM IdentidadeArtes WHERE ArteId = @a", { a: arteIvo.body.arteId });
  ok(ctxIvo.res.status === 200 && linhaIvo.MembroId === null && linhaIvo.ArquivoUrl === urlIvo && linhaIvo.Status === "ENVIADA" && !apagados.includes(urlIvo),
    "(revisão) LGPD com o ciclo em andamento: a arte perde o nome, mas a imagem fica no concurso (pode ser a escolhida)", linhaIvo);
  await db.aplicarRetencao(await obterPool());
  ok(!apagados.includes(urlIvo), "a retenção não apaga a imagem enquanto o ciclo não encerra");
  // a arte escolhida no culto não veio pelo sistema: a Diretoria envia a imagem no próprio registro do resultado
  em("2028-12-20T12:00:00Z");
  const res29 = await POST(H, "resultado", DIR, { cicloId: C29, imagemBase64: jpeg(77).toString("base64"), tipo: "image/jpeg", corId: cor29.body.corId, dataCulto: "2028-12-18", ocasiao: "CULTO_ADMINISTRATIVO", votosVencedor: 80 });
  ok(res29.status === 201, "(revisão) resultado com a imagem enviada pela Diretoria (sem arte do concurso)", res29.body);
  const escolhida29 = await um("SELECT a.EnviadaPelaDiretoria, a.Status, a.MembroId FROM IdentidadeResultados r JOIN IdentidadeArtes a ON a.ArteId = r.ArteId WHERE r.CicloId = @c", { c: C29 });
  ok(escolhida29 && escolhida29.EnviadaPelaDiretoria === true && escolhida29.Status === "ESCOLHIDA" && (await escalar("SELECT Origem FROM IdentidadeTemasUsados WHERE Ano = 2029")) === "PROCESSO",
    "a arte da Diretoria é a escolhida e o tema de 2029 entra na lista", escolhida29);
  ok(!(await meu(1002)).minhasArtes.length, "a arte enviada pela Diretoria não aparece como \"arte do membro\" para quem registrou");
  await db.aplicarRetencao(await obterPool());
  ok(apagados.includes(urlIvo) && (await escalar("SELECT ArquivoUrl FROM IdentidadeArtes WHERE ArteId = @a", { a: arteIvo.body.arteId })) === null,
    "(revisão) com o ciclo encerrado, a retenção apaga a imagem da arte anonimizada que não foi a escolhida");

  console.log("== o ciclo de 2030: sem 2 finalistas, o tema sem votação ==");
  em("2029-10-01T12:00:00Z");
  const C30 = (await POST(H, "abrir-ciclo", DIR, { anoAlvo: 2030 })).body.cicloId;
  ok(!!C30, "ciclo de 2030 aberto");
  em("2029-11-04T12:00:00Z");
  const s30 = (await sugerir(M.eva, "Fé que transforma vidas")).body.sugestaoId;
  em("2029-11-18T12:00:00Z");
  ok((await POST(H, "triar", DIR, { sugestaoId: s30, decisao: "FINALISTA" })).status === 200, "uma finalista só");
  ok((await POST(H, "tema-sem-votacao", DIR, { sugestaoId: s30, motivo: "Ata 41, só um tema viável" })).status === 422, "antes do dia 22, termine a triagem: o tema sai da votação");
  em("2029-11-23T12:00:00Z");
  ok((await POST(H, "tema-sem-votacao", SEM_FATOR, { sugestaoId: s30, motivo: "Ata 41, só um tema viável" })).status === 428, "definir o tema sem votação pede a confirmação reforçada");
  ok((await POST(H, "tema-sem-votacao", DIR, { sugestaoId: s30, motivo: "ok" })).status === 422, "com o motivo escrito");
  const sv = await POST(H, "tema-sem-votacao", DIR, { sugestaoId: s30, motivo: "Ata 41, só um tema viável" });
  const c30 = await um("SELECT Apuracao, TemaTexto, TemaDefinidoPor, DesempatePorMembroId, EnqueteId FROM IdentidadeCiclos WHERE CicloId = @c", { c: C30 });
  ok(sv.status === 200 && c30.Apuracao === "NAO_VOTADA" && c30.TemaTexto === "Fé que transforma vidas" && c30.TemaDefinidoPor === "DIRETORIA" && c30.DesempatePorMembroId === 1002 && c30.EnqueteId === null,
    "(revisão) o tema fica definido pela Diretoria, sem votação, com quem e por quê", c30);
  ok((await POST(H, "abrir-votacao", DIR, { cicloId: C30 })).status === 422 && !!(await falha("UPDATE IdentidadeCiclos SET EnqueteId = 1, VotacaoCriadaEm = SYSUTCDATETIME() WHERE CicloId = @c", { c: C30 })),
    "e depois disso não há votação (nem pelo banco)");
  ok((await meu(M.eva)).ciclo.tema.texto === "Fé que transforma vidas", "o membro vê o tema do ano");

  console.log("== retenção ==");
  em("2029-01-05T12:00:00Z");
  const antesRet = await escalar("SELECT COUNT(*) FROM IdentidadeSugestoes WHERE MembroId IS NOT NULL AND CicloId = @c", { c: CICLO });
  const r1 = await db.aplicarRetencao(await obterPool());
  ok(antesRet > 0 && (await escalar("SELECT COUNT(*) FROM IdentidadeSugestoes WHERE MembroId IS NOT NULL AND CicloId = @c", { c: CICLO })) === 0 && r1.sugestoes === antesRet, "1 ano depois de 31/12/2027, as sugestões de 2028 perdem o nome", r1);
  ok((await escalar("SELECT COUNT(*) FROM IdentidadeSugestoes WHERE MembroId IS NOT NULL AND CicloId = @c", { c: C29 })) === 3, "as de 2029 (ciclo de 2028) ainda não");
  ok((await escalar("SELECT COUNT(*) FROM IdentidadeArtes WHERE CicloId = @c AND Status <> 'ESCOLHIDA' AND ArquivoUrl IS NOT NULL", { c: CICLO })) === 0
    && (await escalar("SELECT COUNT(*) FROM IdentidadeArtes WHERE CicloId = @c AND Status = 'ESCOLHIDA' AND ArquivoUrl IS NOT NULL", { c: CICLO })) === 1, "as imagens não escolhidas saem; a escolhida fica");
  ok((await db.aplicarRetencao(await obterPool())).sugestoes === 0, "rodar de novo não faz nada");

  console.log("== lixo em cada campo ==");
  em("2028-11-05T12:00:00Z");
  await fuzz("sugerir", { acao: "sugerir", token: RODIZIO, base: { texto: "Tema do fuzz" }, campos: ["texto"] });
  await fuzz("tema", { acao: "tema", token: DIR, base: { ano: 2012, tema: "Tema do fuzz de 2012" }, campos: ["ano", "tema", "temaUsadoId"] });
  await fuzz("cor", { acao: "cor", token: DIR, base: { cicloId: C29, ordem: 3, nome: "Verde", hex: "#00AA00" }, campos: ["cicloId", "ordem", "nome", "hex"] });
  await fuzz("triar", { acao: "triar", token: DIR, base: { sugestaoId: s29.b, decisao: "DESCARTADA", criterio: 2 }, campos: ["sugestaoId", "decisao", "criterio", "observacao", "textoAjustado"] });
  await fuzz("arte", { acao: "arte", token: RODIZIO, base: { imagemBase64: png(11).toString("base64"), tipo: "image/png" }, campos: ["imagemBase64", "tipo", "titulo", "descricao"] });
  await fuzz("resultado", { acao: "resultado", token: DIR, base: { cicloId: C29, arteId: 1, corId: 1, dataCulto: "2028-12-01", ocasiao: "VIGILIA", votosVencedor: 5 },
    campos: ["cicloId", "arteId", "corId", "dataCulto", "ocasiao", "votosVencedor", "presentes", "ata"] });

  console.log("== o que nunca vaza ==");
  const audit = JSON.stringify(await q("SELECT * FROM AuditLog WHERE Tabela LIKE 'Identidade%'"));
  ok(audit.length > 2 && !/Raízes e asas|Jovens que brilham|Tempo de colheita/.test(audit), "a auditoria tem os atos, nunca o texto de uma sugestão");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela LIKE 'Identidade%' AND RegistroId IS NULL")) === 0, "nenhuma linha de auditoria sem RegistroId");
  ok(falhasAuditoria === 0, "nenhuma falha de gravação da auditoria", falhasAuditoria);

  fim("e2e-31 (identidade visual)");
})().catch((e) => { console.log("ERRO FATAL:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
