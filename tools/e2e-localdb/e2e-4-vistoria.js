// e2e-4-vistoria.js — o Termo de Vistoria de antecedentes (Art. 133 §5º): acesso exclusivo, solicitação, lavratura com hash, recusa, pendentes, avisos e direito do titular.
const fs = require("fs");
const crypto = require("crypto");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, PIN, sessao, API, path } = L;
const H = require(path.join(API, "GestaoVistoriasAntecedentes/index.js"));
const LGPD = require(path.join(API, "MeusDadosLGPD/index.js"));
const motor = require(path.join(API, "shared/notificacaoMotor.js"));
const vdb = require(path.join(API, "shared/vistoriaAntecedentesDb.js"));
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const presidente = GERAL(1001, TUDO), secretario = GERAL(1002, TUDO), gestora = GERAL(1003, ["setores_tecnicos"]);
const dirCentral = LIDER(3001, ["reunioes", "pessoas"], ["Central E2E"]);
const semFator = sessao(1001, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: TUDO });
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const hoje = L.hojeBr();
const doc = (t, tipo = "ANTECEDENTES_FEDERAL", extra = {}) => ({ tipo, hash: hash(t), dataEmissao: hoje, ...extra });
const termo = (extra = {}) => ({ membroId: 3001, motivo: "INVESTIDURA", funcao: "Dirigente da Congregação Central", comVulneraveis: true, dataVerificacao: hoje, resultado: "SEM_RESTRICAO", parecer: "Certidões sem apontamentos; apto à função.", destinoOriginal: "DEVOLVIDO",
  documentos: [doc("federal 3001"), doc("estadual 3001", "ANTECEDENTES_ESTADUAL"), doc("civel 3001", "DISTRIBUICAO_CIVEL")], ...extra });
const notif = (regra) => q("SELECT DestinatarioMembroId d FROM Notificacoes WHERE RegraChave = @r ORDER BY DestinatarioMembroId", { r: regra }).then(l => l.map(x => x.d));
const mesmo = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

(async () => {
  console.log("== acesso exclusivo ==");
  let r;
  const base0 = await escalar("SELECT COUNT(*) FROM VistoriasAntecedentes");     // a base do cenário já traz o termo dos testes de gatilho
  for (const [rotulo, t] of [["sem sessão", undefined], ["PIN", PIN(2001)], ["dirigente com a permissão em escopo local", LIDER(3001, ["vistoria_antecedentes"], ["Central E2E"])], ["gestora (só setores_tecnicos)", gestora], ["geral sem a permissão", GERAL(1003, ["pessoas", "setores_tecnicos"])]]) {
    for (const acao of ["catalogos", "lista", "pendentes"]) { r = await GET(H, acao, t); ok(r.status === (t ? 403 : 401), `${rotulo}: ${acao} → ${t ? 403 : 401}`, r.status); }
    r = await POST(H, "lavrar", t, termo()); ok(r.status === (t ? 403 : 401), `${rotulo}: lavrar negado`, r.status);
  }
  ok((await escalar("SELECT COUNT(*) FROM VistoriasAntecedentes")) === base0, "nenhuma tentativa negada gravou algo");
  r = await GET(H, "catalogos", presidente); ok(r.status === 200 && r.body.motivos.length === 4 && r.body.maxDocumentos === 6, "a Diretoria abre o catálogo", r.body);
  r = await GET(H, "catalogos", secretario); ok(r.status === 200, "o Secretário Geral também (Diretoria Executiva)");

  console.log("== quem falta ==");
  r = await GET(H, "pendentes", presidente); const nomesPend = r.body.liderancas.map(x => x.membroId);
  ok(mesmo(nomesPend, [1, 2, 1001, 1002, 1003, 3001, 3002, 3003, 3004]), "as lideranças em exercício sem Termo de Vistoria (os dois da semente e os sete do cenário)", nomesPend);
  const p3001 = r.body.liderancas.find(x => x.membroId === 3001); ok(p3001.cargos === "Dirigente de Congregação" && p3001.ultimoResultado === null && p3001.recusou === false, "cada um com o cargo", p3001);
  ok(!JSON.stringify(r.body).match(/Email|DataNascimento|@exemplo/), "a lista não leva e-mail nem nascimento");

  r = await GET(H, "pessoa", presidente, { membroId: 2005 }); ok(r.status === 200 && r.body.pessoa.nome === "Candidata Eva E2E" && r.body.pessoa.congregacaoNome === "Central E2E" && Object.keys(r.body.pessoa).sort().join() === "congregacaoNome,membroId,nome", "a consulta de nome devolve só nome e congregação", r.body);
  r = await GET(H, "pessoa", presidente, { membroId: 999999 }); ok(r.status === 404, "matrícula que não existe: 404");
  r = await GET(H, "pessoa", presidente, { membroId: "0x10" }); ok(r.status === 400, "matrícula 0x10: 400");
  r = await GET(H, "pessoa", PIN(2001), { membroId: 2005 }); ok(r.status === 403, "PIN não consulta nomes por aqui");
  console.log("== solicitar as certidões (§5º, I) ==");
  r = await POST(H, "solicitar", presidente, { membroId: 2005, motivo: "SUSPEITA_FUNDADA", funcao: "Professora da EBD" }); ok(r.status === 200 && /foi avisado/.test(r.body.mensagem), "a Diretoria solicita as certidões a 2005", r.body);
  const aviso = await um("SELECT Mensagem FROM Notificacoes WHERE RegraChave = 'VISTORIA_SOLICITADA' AND DestinatarioMembroId = 2005");
  ok(aviso && /certidão de antecedentes criminais/.test(aviso.Mensagem) && /Professora da EBD/.test(aviso.Mensagem) && /nunca uma cópia/.test(aviso.Mensagem), "a pessoa recebe o aviso com o que levar", aviso);
  r = await POST(H, "solicitar", secretario, { membroId: 2005 }); ok(r.status === 200, "um segundo pedido, de outra pessoa da Diretoria, também sai");
  r = await POST(H, "solicitar", presidente, { membroId: 2005 }); ok(r.status === 422 && /duas vezes nas últimas 24 horas/.test(r.body.mensagem), "o terceiro pedido em 24 horas é segurado", r.body);
  r = await POST(H, "solicitar", presidente, { membroId: 1001 }); ok(r.status === 422, "ninguém solicita a si mesmo");
  r = await POST(H, "solicitar", presidente, { membroId: 999999 }); ok(r.status === 422 && /Pessoa não encontrada/.test(r.body.mensagem), "matrícula que não existe: 422");
  r = await POST(H, "solicitar", presidente, { membroId: "0x10" }); ok(r.status === 422, "matrícula 0x10: 422");
  r = await POST(H, "solicitar", presidente, { membroId: 2004, motivo: "QUALQUER" }); ok(r.status === 422, "motivo fora da lista: 422");
  ok((await escalar("SELECT COUNT(*) FROM VistoriasAntecedentes")) === base0, "solicitar não cria registro de vistoria");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao = 'VISTORIA_SOLICITADA'")) === 2, "mas fica na auditoria");

  console.log("== lavrar o Termo ==");
  r = await POST(H, "lavrar", semFator, termo()); ok(r.status === 428 && r.body.precisaFator === true, "sem confirmação reforçada recente: 428", r.status);
  ok((await escalar("SELECT COUNT(*) FROM VistoriasAntecedentes")) === base0, "o 428 não gravou nada");
  r = await POST(H, "lavrar", presidente, termo({ membroId: 1001 })); ok(r.status === 422 && /própria vistoria/.test(r.body.mensagem), "ninguém assina a própria vistoria");
  r = await POST(H, "lavrar", presidente, termo({ membroId: 999999 })); ok(r.status === 422 && /Pessoa não encontrada/.test(r.body.mensagem), "pessoa que não existe: 422");
  r = await POST(H, "lavrar", presidente, termo({ documentos: [] })); ok(r.status === 422, "sem certidão: 422");
  r = await POST(H, "lavrar", presidente, termo({ destinoOriginal: undefined })); ok(r.status === 422 && /original/.test(r.body.mensagem), "sem o destino do original: 422");
  r = await POST(H, "lavrar", presidente, termo({ documentos: [doc("x", "ANTECEDENTES_FEDERAL", { hash: "não é hash" })] })); ok(r.status === 422, "hash inválido: 422");
  r = await POST(H, "lavrar", presidente, termo({ parecer: "<script>alert(1)</script> sem restrição" })); ok(r.status === 422, "parecer com tag: 422");
  ok((await escalar("SELECT COUNT(*) FROM VistoriasAntecedentes")) === base0, "as recusas de regra não gravaram nada");
  r = await POST(H, "lavrar", presidente, termo({ documentos: [doc("federal 3001", "ANTECEDENTES_FEDERAL", { hash: hash("federal 3001").toUpperCase() }), doc("estadual 3001", "ANTECEDENTES_ESTADUAL"), doc("civel 3001", "DISTRIBUICAO_CIVEL")] }));
  ok(r.status === 201 && r.body.vistoria.documentos.length === 3, "o Presidente lavra o Termo de Vistoria do dirigente", r.body);
  const v1 = r.body.vistoria;
  ok(v1.assinadaPorMembroId === 1001 && v1.assinadaPorNome === "Presidente E2E" && v1.resultado === "SEM_RESTRICAO" && v1.rotuloDestino === "Devolvido ao membro" && v1.comVulneraveis === true, "o termo guarda quem assinou, o resultado e o destino do original", v1);
  ok(v1.documentos.every(d => /^[0-9a-f]{64}$/.test(d.hash)) && v1.documentos[0].hash === hash("federal 3001"), "os hashes ficaram em minúsculas (a maiúscula foi normalizada)");
  const linhasDoc = await q("SELECT Tipo, HashSha256 FROM VistoriasDocumentos WHERE VistoriaId = @v ORDER BY DocumentoId", { v: v1.vistoriaId });
  ok(linhasDoc.length === 3 && linhasDoc.map(x => x.Tipo).join() === "ANTECEDENTES_FEDERAL,ANTECEDENTES_ESTADUAL,DISTRIBUICAO_CIVEL", "as três certidões estão no banco, só como hash");
  const colunasComCertidao = await q("SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN ('VistoriasAntecedentes', 'VistoriasDocumentos') AND (DATA_TYPE IN ('varbinary', 'image') OR COLUMN_NAME LIKE '%Arquivo%' OR COLUMN_NAME LIKE '%Url%' OR COLUMN_NAME LIKE '%Conteudo%')");
  ok(colunasComCertidao.length === 0, "o banco nem tem onde guardar a certidão (vedação de arquivo morto, §5º, IV, b)", colunasComCertidao);
  const aud = await q("SELECT DadosDepois FROM AuditLog WHERE Acao = 'VISTORIA_LAVRADA'");
  ok(aud.length === 1 && !/apto à função|Certidões sem/.test(JSON.stringify(aud)) && !JSON.stringify(aud).includes(hash("federal 3001")), "a auditoria não leva o parecer nem o hash", aud);
  ok(/"documentos":3/.test(aud[0].DadosDepois) && !/resultado|SEM_RESTRICAO|motivo|INVESTIDURA|funcao|Dirigente/i.test(aud[0].DadosDepois), "a auditoria guarda só a contagem de certidões (nem o resultado, nem o motivo, nem a função)", aud[0].DadosDepois);
  r = await POST(H, "lavrar", secretario, termo({ membroId: 1001, motivo: "INVESTIDURA", funcao: "Presidente", comVulneraveis: false, documentos: [doc("federal 1001")], resultado: "COM_RESTRICAO", parecer: "Há um apontamento antigo já arquivado; a Diretoria decide a função.", destinoOriginal: "DESCARTADO" }));
  ok(r.status === 201, "o Secretário Geral vistoria o Presidente (assinam um ao outro)", r.body);
  r = await POST(H, "lavrar", presidente, { membroId: 3002, motivo: "SOLICITACAO_DIRETORIA", funcao: "Dirigente da Vila Nova", dataVerificacao: hoje, resultado: "RECUSA", parecer: "Recusou apresentar as certidões; afastamento preventivo da função aplicado pela Diretoria.", documentos: [] });
  ok(r.status === 201 && r.body.vistoria.rotuloDestino === null && r.body.vistoria.documentos.length === 0, "a recusa fica registrada, sem certidão nem destino do original", r.body);
  r = await POST(H, "lavrar", presidente, { membroId: 3004, motivo: "MUDANCA_FUNCAO", funcao: "Tesoureiro", dataVerificacao: hoje, resultado: "RECUSA", parecer: "Recusa com certidão informada.", documentos: [doc("x")] }); ok(r.status === 422, "recusa com certidão é contraditória: 422");

  console.log("== ler e acompanhar ==");
  r = await GET(H, "lista", presidente, { membroId: 3001 }); ok(r.status === 200 && r.body.vistorias.length === 1 && r.body.vistorias[0].documentos.length === 3, "a lista de um membro traz o termo e as certidões (hash)");
  r = await GET(H, "lista", presidente); ok(r.body.vistorias.length === base0 + 3, "sem filtro: as mais recentes de todos", r.body.vistorias.length);
  r = await GET(H, "vistoria", presidente, { vistoriaId: v1.vistoriaId }); ok(r.status === 200 && r.body.vistoria.parecer === "Certidões sem apontamentos; apto à função.", "o termo por identificador");
  r = await GET(H, "vistoria", presidente, { vistoriaId: 999999 }); ok(r.status === 404, "termo que não existe: 404");
  r = await GET(H, "lista", presidente, { membroId: "0x10" }); ok(r.status === 400, "membroId 0x10: 400");
  r = await GET(H, "pendentes", presidente);
  ok(!r.body.liderancas.some(x => x.membroId === 3001) && !r.body.liderancas.some(x => x.membroId === 1001), "quem já tem Termo de Vistoria sai da lista de pendentes");
  const rec = r.body.liderancas.find(x => x.membroId === 3002); ok(rec && rec.recusou === true && rec.ultimoResultado === "RECUSA", "quem recusou continua pendente, marcado como recusa", rec);
  ok(await vdb.ultimaVistoria(await L.obterPool(), 3001).then(u => u && u.resultado === "SEM_RESTRICAO"), "a última vistoria da pessoa fica disponível para a v7.7");
  ok((await vdb.ultimaVistoria(await L.obterPool(), 2005)) === null, "quem nunca foi vistoriado: null");

  console.log("== o aviso mensal à Diretoria ==");
  const pool = await L.obterPool();
  const fatos = await vdb.detectarLiderancasSemVistoria(pool);
  ok(fatos.length === 1 && mesmo(fatos[0].destinatarios.map(d => d.membroId), [1, 2, 1001, 1002]), "o detector avisa quem tem vistoria_antecedentes", fatos.map(f => f.destinatarios.map(d => d.membroId)));
  ok(/liderança\(s\) em exercício ainda sem Termo de Vistoria/.test(fatos[0].fatoGerador) && /Art. 133 §5º, II/.test(fatos[0].fatoGerador), "com a contagem e a regra", fatos[0].fatoGerador);
  await motor.avaliarRegras(pool);
  ok(mesmo(await notif("VISTORIA_PENDENTES"), [1, 2, 1001, 1002]), "a rodada diária cria o aviso");
  await motor.avaliarRegras(pool);
  ok((await notif("VISTORIA_PENDENTES")).length === 4, "e não repete no mesmo mês");

  console.log("== o direito do titular ==");
  const meus = async (matricula, token) => { const ctx = { bindingData: { matricula: String(matricula) }, log: { error() { }, info() { }, warn() { }, verbose() { } } }; await LGPD(ctx, { method: "GET", query: {}, headers: { "x-auth-token": token } }); return ctx.res; };
  r = await meus(3001, dirCentral); ok(r.status === 200 && r.body.vistoriasAntecedentes.vistorias.length === 1, "o dirigente recebe o próprio Termo de Vistoria em Meus Dados");
  const t3001 = r.body.vistoriasAntecedentes.vistorias[0];
  ok(t3001.parecer && t3001.certidoes.length === 3 && t3001.certidoes[0].hash === hash("federal 3001") && t3001.resultado === "Sem restrição" && !JSON.stringify(t3001).includes("Presidente E2E"), "com o parecer e os hashes — sem o nome de quem assinou", t3001);
  r = await meus(3002, LIDER(3002, ["reunioes"], ["Vila Nova E2E"])); ok(r.body.vistoriasAntecedentes.vistorias[0].resultado.startsWith("Recusou"), "quem recusou vê o registro da recusa");
  r = await meus(2005, PIN(2005)); ok(r.body.vistoriasAntecedentes.vistorias.length === 0, "quem não foi vistoriado recebe a lista vazia");
  r = await meus(3001, PIN(2005)); ok(r.status === 403, "ninguém pede os dados de outra pessoa");

  console.log("== anular um termo lavrado por engano ==");
  const MOTIVO = "Termo lavrado na matrícula errada.";
  r = await POST(H, "lavrar", presidente, termo({ membroId: 3003, funcao: "Pastor de área", documentos: [doc("federal 3003")] })); ok(r.status === 201, "lavra um termo que será anulado", r.body);
  const vid = await escalar("SELECT MAX(VistoriaId) FROM VistoriasAntecedentes WHERE MembroId = 3003");
  r = await GET(H, "pendentes", presidente); ok(!r.body.liderancas.some(x => x.membroId === 3003), "com o termo, a pessoa sai de 'quem falta'");
  const antes = await L.retrato();
  for (const [rotulo, t] of [["sem sessão", undefined], ["PIN", PIN(2001)], ["dirigente com a permissão em escopo local", LIDER(3001, ["vistoria_antecedentes"], ["Central E2E"])], ["gestora (só setores_tecnicos)", gestora], ["geral sem a permissão", GERAL(1003, ["pessoas", "setores_tecnicos"])]]) {
    r = await POST(H, "anular", t, { vistoriaId: vid, motivo: MOTIVO }); ok(r.status === (t ? 403 : 401), `${rotulo}: anular negado`, r.status);
  }
  r = await POST(H, "anular", semFator, { vistoriaId: vid, motivo: MOTIVO }); ok(r.status === 428 && r.body.precisaFator === true, "sem confirmação reforçada recente: 428", r.status);
  ok((await L.retrato()) === antes, "nenhuma tentativa negada nem o 428 gravou algo");
  for (const motivo of [undefined, "", "curto", "x".repeat(301), "<b>engano</b> de matrícula", ["Termo lavrado na matrícula errada."], { a: 1 }, true]) {
    r = await POST(H, "anular", presidente, { vistoriaId: vid, motivo }); ok(r.status === 422, "motivo inválido recusado: " + String(JSON.stringify(motivo)).slice(0, 40), r.status);
  }
  for (const vistoriaId of [undefined, 0, -1, "0x1", "1e1", [vid], true, 99999999, "abc"]) {
    r = await POST(H, "anular", presidente, { vistoriaId, motivo: MOTIVO }); ok(r.status === 422, "termo inexistente ou malformado: 422 (" + JSON.stringify(vistoriaId) + ")", r.status);
  }
  ok((await L.retrato()) === antes, "as recusas de regra não gravaram nada");
  // Ninguém anula o termo feito sobre si.
  r = await POST(H, "lavrar", secretario, termo({ membroId: 1001, funcao: "Presidente", documentos: [doc("federal 1001")] })); ok(r.status === 201, "o Secretário Geral lavra o termo do Presidente", r.body);
  const vidPres = await escalar("SELECT MAX(VistoriaId) FROM VistoriasAntecedentes WHERE MembroId = 1001");
  r = await POST(H, "anular", presidente, { vistoriaId: vidPres, motivo: MOTIVO }); ok(r.status === 422 && /sobre si/.test(r.body.mensagem), "ninguém anula o termo feito sobre si", r.body);
  ok((await escalar("SELECT COUNT(*) FROM VistoriasAnulacoes WHERE VistoriaId = @v", { v: vidPres })) === 0, "e nada foi gravado");
  // A anulação de verdade.
  r = await POST(H, "anular", presidente, { vistoriaId: vid, motivo: MOTIVO }); ok(r.status === 200 && r.body.sucesso && r.body.vistoria.anulada && r.body.vistoria.anulada.motivo === MOTIVO, "a Diretoria anula o termo", r.body);
  const an = await um("SELECT * FROM VistoriasAnulacoes WHERE VistoriaId = @v", { v: vid }); ok(an && an.AnuladaPorMembroId === 1001 && an.Motivo === MOTIVO, "a anulação guarda quem anulou e o motivo", an);
  ok((await escalar("SELECT COUNT(*) FROM VistoriasAntecedentes WHERE VistoriaId = @v", { v: vid })) === 1, "o termo continua registrado (não se apaga)");
  const audA = await q("SELECT DadosDepois FROM AuditLog WHERE Acao = 'VISTORIA_ANULADA' AND RegistroId = @v", { v: vid });
  ok(audA.length === 1 && !JSON.stringify(audA).includes("matrícula errada") && !JSON.stringify(audA).includes(hash("federal 3003")), "a auditoria registra a anulação sem o motivo nem o hash", audA);
  r = await POST(H, "anular", secretario, { vistoriaId: vid, motivo: MOTIVO }); ok(r.status === 422 && /já foi anulado/.test(r.body.mensagem), "anular de novo: 422", r.body);
  ok((await escalar("SELECT COUNT(*) FROM VistoriasAnulacoes WHERE VistoriaId = @v", { v: vid })) === 1, "continua uma anulação só");
  // O termo anulado deixa de contar.
  r = await GET(H, "pendentes", presidente); ok(r.body.liderancas.some(x => x.membroId === 3003), "a pessoa volta a 'quem falta'");
  ok((await vdb.ultimaVistoria(await L.obterPool(), 3003)) === null, "e a última vistoria válida dela é nula");
  r = await GET(H, "lista", presidente, { membroId: 3003 }); ok(r.status === 200 && r.body.vistorias.length === 1 && r.body.vistorias[0].anulada && r.body.vistorias[0].anulada.porNome && r.body.vistorias[0].anulada.motivo === MOTIVO, "a lista mostra o termo marcado como anulado", r.body);
  r = await GET(H, "vistoria", presidente, { vistoriaId: vid }); ok(r.status === 200 && r.body.vistoria.anulada, "o detalhe também");
  r = await meus(3003, LIDER(3003, ["reunioes", "pessoas"], ["Central E2E", "Vila Nova E2E"], "AREA")); ok(r.status === 200 && r.body.vistoriasAntecedentes.vistorias.length === 1 && r.body.vistoriasAntecedentes.vistorias[0].anuladaEm, "o titular vê, em Meus Dados, que o termo foi anulado", r.body.vistoriasAntecedentes);
  // E uma nova vistoria da mesma pessoa vale normalmente.
  r = await POST(H, "lavrar", presidente, termo({ membroId: 3003, funcao: "Pastor de área", documentos: [doc("federal 3003 (correto)")] })); ok(r.status === 201, "lavrar o termo certo depois da anulação", r.body);
  ok((await vdb.ultimaVistoria(await L.obterPool(), 3003)) !== null, "a pessoa volta a ter vistoria válida");
  fim("e2e-4-vistoria");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
