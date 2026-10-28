// e2e-58-consagracao-revisao.js — v8.3 (Consagração e documentação): o que a revisão independente do servidor (28/10/2026) pediu, com os handlers e o banco REAIS, sobre a
// base "cenario-escada". A cerimônia exige a lista inteira (presentes e ausentes): quem entrou sem a Secretaria ver não perde o ano; a cerimônia não fica antes da
// homologação; o dossiê da indicação (ninguém no próprio, nada apagado depois do envio ao CEI, só o geral acrescenta); o CEI não vê o próprio processo; a homologação não é
// anterior ao parecer; reprovar solta a cerimônia e o código reservado; ex-cônjuges não ficam lado a lado; dois casamentos pedem o escrutínio.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, hojeBr, path, API } = L;
const E = require("./lib-escada");
const { P, TIPO, SEC, protocolar, evoluir, esteira, cerimonias, parecer, homologar, pagarTaxa, novaCerimonia, statusDe, chamarRota } = E;

console.error = () => { };
const somar = (n) => require(path.join(API, "shared/afm.js")).somarDias(hojeBr(), n);

(async () => {
  await obterPool();
  const hoje = hojeBr();
  await E.montarCenario();
  const id = (r) => r.body.consagracao.consagracaoId;
  async function ateHomologado(membroId, assunto, extra = {}) {
    const r = await protocolar({ membroId, assunto, proponenteMembroId: 1002, ...extra });
    const cid = id(r);
    await evoluir(cid, "AVANCAR"); await parecer(cid); await homologar(cid); await pagarTaxa(cid);
    return cid;
  }

  console.log("== a lista inteira na cerimônia (presentes e ausentes) ==");
  const a = await ateHomologado(P.auxiliar, TIPO.MISSIONARIO);
  const b = await ateHomologado(P.missionario, TIPO.DIACONO);
  const ce = await novaCerimonia();
  await cerimonias("incluir", { cerimoniaId: ce, ids: [a] });
  // a Secretaria abriu a cerimônia só com "a"; outra tela inclui "b" antes do registro
  await cerimonias("incluir", { cerimoniaId: ce, ids: [b] });
  let r = await cerimonias("registrar", { cerimoniaId: ce, presentes: [a], ausentes: [] });
  ok(r.status === 409 && /mudou/.test(r.body.mensagem), "quem entrou sem a Secretaria ver: o registro volta (409)", r.body);
  ok((await statusDe(b)) === "HOMOLOGADO" && (await escalar("SELECT Status FROM CerimoniasConsagracao WHERE CerimoniaId = @c", { c: ce })) === "PLANEJADA", "e ninguém perde o ano: nada mudou");
  r = await cerimonias("registrar", { cerimoniaId: ce, presentes: [a, b], ausentes: [b] });
  ok(r.status === 409, "o mesmo nome nas duas listas: volta", r.body);
  r = await cerimonias("registrar", { cerimoniaId: ce, presentes: [a] });
  ok(r.status === 400, "sem a lista de ausentes: 400", r.body);

  console.log("== reprovar solta a cerimônia e o código reservado ==");
  await cerimonias("diplomas", undefined, SEC(), "GET", { cerimoniaId: ce });
  ok(!!(await escalar("SELECT DiplomaCodigo FROM Consagracoes WHERE ConsagracaoId = @id", { id: b })), "o diploma de 'b' foi impresso (código reservado)");
  await evoluir(b, "REPROVAR");
  const pb = await um("SELECT Status, CerimoniaId, DiplomaCodigo FROM Consagracoes WHERE ConsagracaoId = @id", { id: b });
  ok(pb.Status === "REPROVADO" && pb.CerimoniaId === null && pb.DiplomaCodigo === null, "reprovado: sai da cerimônia e o código é solto", pb);
  r = await cerimonias("registrar", { cerimoniaId: ce, presentes: [a], ausentes: [] });
  ok(r.status === 200 && r.body.resultados.length === 1 && r.body.resultados[0].resultado === "CONSAGRADO", "o registro segue com quem ficou", r.body);
  const dip = await um("SELECT c.DiplomaCodigo, e.CodigoVerificacao FROM Consagracoes c JOIN CertificadosEmitidos e ON e.CertificadoId = c.DiplomaCertificadoId WHERE c.ConsagracaoId = @id", { id: a });
  ok(dip && dip.DiplomaCodigo === dip.CodigoVerificacao, "o código que fica no processo é o do diploma emitido", dip);

  console.log("== a cerimônia não fica antes da homologação ==");
  const c2 = await ateHomologado(P.vetado, TIPO.MISSIONARIO);
  const ontem = await novaCerimonia(undefined, { dataCerimonia: somar(-1) });
  r = await cerimonias("incluir", { cerimoniaId: ontem, ids: [c2] });
  ok(r.status === 422 && /depois da data desta cerimônia/.test(r.body.mensagem) && !(await escalar("SELECT CerimoniaId FROM Consagracoes WHERE ConsagracaoId = @id", { id: c2 })), "homologado hoje não entra numa cerimônia de ontem", r.body);
  const ce3 = await novaCerimonia();
  await cerimonias("incluir", { cerimoniaId: ce3, ids: [c2] });
  r = await cerimonias("editar", { cerimoniaId: ce3, dataCerimonia: somar(-1), local: "Templo Sede E2E", ocasiao: "AGO", valorTaxa: 70 });
  ok(r.status === 422 && /homologado\(a\) depois dessa data/.test(r.body.mensagem), "nem a data da cerimônia volta para antes da homologação", r.body);
  // e mesmo que a data estivesse gravada antes (banco antigo), o registro devolve a pessoa
  await q("UPDATE CerimoniasConsagracao SET DataCerimonia = @d WHERE CerimoniaId = @c", { d: somar(-1), c: ce3 });
  await q("UPDATE Consagracoes SET TaxaPagaEm = @d WHERE ConsagracaoId = @id", { d: somar(-60), id: c2 });
  r = await cerimonias("registrar", { cerimoniaId: ce3, presentes: [c2], ausentes: [] });
  ok(r.status === 200 && r.body.resultados[0].resultado === "VOLTOU" && /depois da data desta cerimônia/.test(r.body.resultados[0].motivo) && (await statusDe(c2)) === "HOMOLOGADO", "registrada com data antes da homologação: a pessoa volta para a fila", r.body);

  console.log("== o dossiê da indicação ==");
  r = await protocolar({ membroId: P.semSexo, assunto: TIPO.DIACONO, proponenteMembroId: 1002 });
  if (r.status !== 201) { await E.salvarPessoa(P.semSexo, { sexo: "M" }); r = await protocolar({ membroId: P.semSexo, assunto: TIPO.DIACONO, proponenteMembroId: 1002 }); }
  const d = id(r);
  const numD = await escalar("SELECT Numero FROM Consagracoes WHERE ConsagracaoId = @id", { id: d });
  r = await chamarRota("AnexosGenericos/index.js", { token: L.GERAL(P.semSexo, ["consagracoes"]), query: { tabela: "Consagracoes", registroId: numD } });
  ok(r.status === 403, "o candidato não vê o próprio dossiê", r.body);
  await evoluir(d, "AVANCAR");
  const anexo = await escalar("SELECT TOP 1 AnexoId FROM AnexosGenericos WHERE Tabela = 'Consagracoes' AND RegistroId = @n", { n: numD });
  r = await chamarRota("AnexosGenericos/index.js", { metodo: "DELETE", binding: { id: String(anexo) }, token: SEC() });
  ok(r.status === 403 && (await escalar("SELECT COUNT(*) FROM AnexosGenericos WHERE AnexoId = @a", { a: anexo })) === 1, "depois do envio ao CEI, ninguém apaga (nem a Secretaria)", r.body);
  r = await chamarRota("AnexosGenericos/index.js", { metodo: "POST", token: E.LIDER(), corpo: { tabela: "Consagracoes", registroId: numD, nomeArquivo: "rg.pdf", mimeType: "application/pdf", documentoBase64: Buffer.from("%PDF-1.4 teste").toString("base64") } });
  ok(r.status === 403, "e o Dirigente local não acrescenta mais", r.body);

  console.log("== o CEI não vê o próprio processo ==");
  r = await esteira("cei", undefined, L.GERAL(P.semSexo, ["cei"]), "GET");
  ok(r.status === 200 && !r.body.itens.some((x) => String(x.consagracaoId).toLowerCase() === String(d).toLowerCase()), "a fila do CEI não traz o processo de quem consulta", r.body.itens);
  ok((await esteira("cei", undefined, SEC(), "GET")).body.itens.some((x) => String(x.consagracaoId).toLowerCase() === String(d).toLowerCase()), "para os outros do CEI, traz");
  await parecer(d);
  r = await esteira("parecer", undefined, L.GERAL(P.semSexo, ["cei"]), "GET", { consagracaoId: d });
  ok(r.status === 404, "nem o próprio parecer (a fundamentação é do CEI)", r.body);

  console.log("== a homologação não é anterior ao parecer ==");
  await q("UPDATE PareceresCEIConsagracao SET SabatinaEm = @d WHERE ConsagracaoId = @id", { d: hoje, id: d });
  await q("UPDATE Consagracoes SET DataProtocolo = @d WHERE ConsagracaoId = @id", { d: somar(-10), id: d });   // o protocolo é antigo: só a regra do parecer pesa
  r = await esteira("homologar", { ids: [d], ato: "Lista validada", data: somar(-1) });
  ok(r.status === 422 && /anterior ao parecer do CEI/.test(r.body.resultados[0].mensagem), "ato do Presidente de ontem para um parecer de hoje: não", r.body);

  console.log("== casal: só o casamento atual; dois casamentos pedem o escrutínio ==");
  // o Presbítero e o candidato de "c2" foram casados no registro (2005); depois o Presbítero casou com outra pessoa (2015): os dois não ficam lado a lado
  await q("INSERT INTO Casamentos (MembroId, MembroConjugeId, Modalidade, DataCasamento) VALUES (@a, @b, 'CIVIL_E_RELIGIOSO', '2005-01-01')", { a: P.presbitero, b: P.vetado });
  await q("INSERT INTO Casamentos (MembroId, NomeConjuge, Modalidade, DataCasamento) VALUES (@a, N'Outra Pessoa', 'CIVIL_E_RELIGIOSO', '2015-01-01')", { a: P.presbitero });
  const regra = require(path.join(API, "shared/consagracao.js"));
  const db = require(path.join(API, "shared/consagracaoDb.js"));
  const ev = await ateHomologado(P.presbitero, TIPO.EVANGELISTA, { modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato e2e-58" });
  ok((await statusDe(ev)) === "HOMOLOGADO", "o Presbítero chegou à homologação");
  const ce4 = await novaCerimonia();
  r = await cerimonias("incluir", { cerimoniaId: ce4, ids: [ev, c2] });
  ok(r.status === 200 && r.body.resultados.every((x) => x.sucesso), "os dois na mesma cerimônia", r.body);
  r = await cerimonias("detalhe", undefined, SEC(), "GET", { cerimoniaId: ce4 });
  ok(r.status === 200 && r.body.roteiro.posicoes.length === 2 && r.body.roteiro.posicoes.every((x) => !x.casal), "ex-cônjuge não fica lado a lado", r.body.roteiro.posicoes);
  ok(regra.precisaEscrutinio("CASADO", false, 2) === true && regra.precisaEscrutinio("CASADO", false, 1) === false, "dois casamentos registrados pedem o escrutínio (o recasado aparece como casado)");
  r = await protocolar({ membroId: P.nomeado, assunto: TIPO.PRESBITERO, proponenteMembroId: 1001, modalidade: "NOMEACAO_PRESIDENCIAL", atoReferencia: "Ato e2e-58b" });
  const nom = id(r);
  await q("INSERT INTO Casamentos (MembroId, NomeConjuge, Modalidade, DataCasamento) VALUES (@a, N'Primeira E2E', 'CIVIL_E_RELIGIOSO', '2000-01-01'), (@a, N'Segunda E2E', 'CIVIL_E_RELIGIOSO', '2010-01-01')", { a: P.nomeado });
  await evoluir(nom, "AVANCAR");
  r = await esteira("cei", undefined, SEC(), "GET");
  ok((r.body.itens.find((x) => String(x.consagracaoId).toLowerCase() === String(nom).toLowerCase()) || {}).escrutinio === true, "na fila do CEI: escrutínio pedido para quem tem dois casamentos", r.body.itens);
  r = await parecer(nom, { escrutinio: {} });
  ok(r.status === 422 && /tempo da ignorância/.test(r.body.mensagem), "e o APTO sem o escrutínio não passa", r.body);
  ok(typeof db.filaDoCEI === "function", "módulo carregado");

  fim("e2e-58 consagração (revisão)");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
