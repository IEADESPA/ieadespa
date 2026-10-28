// e2e-56-consagracao-seguranca.js — v8.3 (Consagração e documentação): quem pode o quê, ids ruins e lixo em todo campo, com os handlers e o banco REAIS, sobre a base
// "cenario-escada". Sem sessão: 401; liderança local, nível geral sem a permissão certa e PIN: 403 (ou 401); id malformado ou inexistente: 404/400; ninguém age no próprio
// processo; nenhum lixo dá 500 nem vaza texto interno; chamada recusada não mexe no banco; a disciplina não vaza pelo parecer de quem não tem "disciplina".
const L = require("./lib");
const { ok, fim, q, escalar, um, obterPool, LIXO, hojeBr } = L;
const E = require("./lib-escada");
const { P, TIPO, SEC, protocolar, evoluir, esteira, cerimonias, parecer, homologar, pagarTaxa, novaCerimonia } = E;

console.error = () => { };
const TABELAS = ["Consagracoes", "PareceresCEIConsagracao", "CerimoniasConsagracao", "CerimoniasComissaoUncao", "CertificadosEmitidos", "Matriculas_AFM", "CargosMinisteriaisHistorico", "MembroReferencia"];
async function retrato() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
const VAZA = /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules|RequestError/i;
// `preparar()`: roda ANTES da fotografia do banco e devolve o que muda no corpo (ex.: o processo novo do parecer)
async function fuzz(rotulo, chamar, base, campos, preparar) {
  let n = 0;
  const quebras = [];
  const mudancas = [];
  for (const campo of campos) for (const lixo of LIXO) {
    const corpo = { ...base, ...(preparar ? await preparar() : {}) };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = await chamar(corpo);
    n++;
    if (!r.status || r.status >= 500) quebras.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} (${r.status}) mexeu no banco`);
    if (r.body && typeof r.body === "object" && !Buffer.isBuffer(r.body) && VAZA.test(JSON.stringify(r.body))) quebras.push(`${campo} vazou: ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  ok(quebras.length === 0, `${rotulo}: ${n} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 5));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 5));
}

(async () => {
  await obterPool();
  const hoje = hojeBr();
  await E.montarCenario();
  const id = (r) => r.body.consagracao.consagracaoId;
  // um processo em cada etapa
  let r = await protocolar({ membroId: P.auxiliar, assunto: TIPO.MISSIONARIO, proponenteMembroId: 1002 });
  const idCEI = id(r);
  await evoluir(idCEI, "AVANCAR");
  r = await protocolar({ membroId: P.missionario, assunto: TIPO.DIACONO, proponenteMembroId: 1002 });
  const idHom = id(r);
  await evoluir(idHom, "AVANCAR"); await parecer(idHom);
  const ce = await novaCerimonia();

  console.log("== sem sessão, PIN, liderança local, geral sem a permissão ==");
  const ACOES_ESTEIRA = [["cei", "GET"], ["parecer", "GET"], ["parecer", "POST"], ["reunioes-cli", "GET"], ["homologar", "POST"], ["taxa", "POST"], ["xyz", "POST"]];
  for (const [acao, metodo] of ACOES_ESTEIRA) {
    const semSessao = await E.chamarRota("EsteiraConsagracao/index.js", { metodo, binding: { acao }, corpo: { consagracaoId: idCEI } });
    ok(semSessao.status === 401, `esteira ${metodo} ${acao} sem sessão: 401`, semSessao.status);
  }
  const ACOES_CER = [[undefined, "GET"], ["detalhe", "GET"], ["diplomas", "GET"], ["criar", "POST"], ["comissao", "POST"], ["incluir", "POST"], ["retirar", "POST"], ["registrar", "POST"], ["cancelar", "POST"]];
  for (const [acao, metodo] of ACOES_CER) {
    const semSessao = await cerimonias(acao, { cerimoniaId: ce }, null, metodo, { cerimoniaId: ce });
    ok(semSessao.status === 401, `cerimônias ${metodo} ${acao || "lista"} sem sessão: 401`, semSessao.status);
  }
  const fichas = {
    PIN: L.PIN(1002),
    "líder local com tudo": L.LIDER(P.lider, ["consagracoes", "cei", "financeiro"], [E.CENTRAL]),
    "geral só com afm": L.GERAL(1003, ["afm"])
  };
  for (const [nome, tk] of Object.entries(fichas)) {
    const recusas = [];
    for (const [acao, metodo] of ACOES_ESTEIRA.filter(([a]) => a !== "xyz")) {
      const x = await esteira(acao, { consagracaoId: idCEI, ids: [idHom] }, tk, metodo, { consagracaoId: idCEI });
      if (![401, 403].includes(x.status)) recusas.push(`${metodo} ${acao}: ${x.status}`);
    }
    for (const [acao, metodo] of ACOES_CER) {
      const x = await cerimonias(acao, { cerimoniaId: ce }, tk, metodo, { cerimoniaId: ce });
      if (![401, 403].includes(x.status)) recusas.push(`cerimônias ${metodo} ${acao}: ${x.status}`);
    }
    ok(recusas.length === 0, `${nome}: tudo recusado (401/403)`, recusas);
  }
  ok((await esteira("parecer", { consagracaoId: idCEI, ...E.PARECER_APTO, sabatinaEm: hoje }, L.GERAL(1003, ["consagracoes"]))).status === 403, "a Secretaria sem 'cei' não dá parecer");
  ok((await esteira("homologar", { ids: [idHom], ato: "Ato", data: hoje }, L.GERAL(1003, ["cei"]))).status === 403, "o CEI não homologa");
  ok((await esteira("taxa", { consagracaoId: idHom, pagoEm: hoje, valor: 70, forma: "PIX" }, L.GERAL(1003, ["cei", "afm"]))).status === 403, "nem registra taxa");
  ok((await cerimonias("criar", { dataCerimonia: hoje, local: "Templo", ocasiao: "AGO" }, L.GERAL(1003, ["cei", "financeiro"]))).status === 403, "cerimônia é só das consagrações");

  console.log("== ids ruins ==");
  for (const ruim of ["x", "1", "'; --", "11111111-1111-1111-1111-111111111111", "", null]) {
    ok((await esteira("parecer", { consagracaoId: ruim, ...E.PARECER_APTO, sabatinaEm: hoje })).status === 404, `parecer com processo ${JSON.stringify(ruim)}: 404`);
    ok((await esteira("taxa", { consagracaoId: ruim, pagoEm: hoje, valor: 70, forma: "PIX" })).status === 404, `taxa com processo ${JSON.stringify(ruim)}: 404`);
    ok((await esteira("parecer", undefined, SEC(), "GET", { consagracaoId: ruim })).status === 404, `ler parecer de ${JSON.stringify(ruim)}: 404`);
  }
  for (const ruim of ["abc", "1e1", "-1", "0", "1.5", "99999999"]) {
    ok((await cerimonias("detalhe", undefined, SEC(), "GET", { cerimoniaId: ruim })).status === 404, `detalhe da cerimônia ${ruim}: 404`);
    ok((await cerimonias("comissao", { cerimoniaId: ruim, membroIds: E.COMISSAO })).status === 404, `comissão da cerimônia ${ruim}: 404`);
  }
  for (const ids of [[], "x", [idHom, "x"], Array.from({ length: 101 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`), null]) {
    ok((await esteira("homologar", { ids, ato: "Ato", data: hoje })).status === 400, `homologar com ids ${JSON.stringify(ids).slice(0, 30)}: 400`);
  }
  ok((await esteira("homologar", { ids: [idHom], sessaoId: "abc" })).status === 400, "reunião da CLI malformada: 400");
  ok((await cerimonias("comissao", { cerimoniaId: ce, membroIds: Array.from({ length: 21 }, (_, i) => 9000 + i) })).status === 400, "comissão com 21: 400");
  ok((await cerimonias("comissao", { cerimoniaId: ce, membroIds: ["abc"] })).status === 400, "comissão com matrícula malformada: 400");
  ok((await cerimonias("registrar", { cerimoniaId: ce, presentes: "todos" })).status === 400, "presentes que não é lista: 400");
  ok((await cerimonias("registrar", { cerimoniaId: ce, presentes: [idCEI], ausentes: [] })).status === 422, "cerimônia sem candidato: 422 (nada muda)");

  console.log("== ninguém age no próprio processo ==");
  ok((await esteira("parecer", { consagracaoId: idCEI, ...E.PARECER_APTO, sabatinaEm: hoje }, L.GERAL(P.auxiliar, ["cei"]))).status === 422, "o candidato não dá o próprio parecer");
  r = await esteira("homologar", { ids: [idHom], ato: "Ato", data: hoje }, L.GERAL(P.missionario, ["consagracoes"]));
  ok(r.status === 422 && /próprio processo/.test(r.body.resultados[0].mensagem), "nem homologa o próprio", r.body);
  await homologar(idHom); await pagarTaxa(idHom);
  r = await cerimonias("incluir", { cerimoniaId: ce, ids: [idHom] }, L.GERAL(P.missionario, ["consagracoes"]));
  ok(r.status === 422 && !(await escalar("SELECT CerimoniaId FROM Consagracoes WHERE ConsagracaoId = @id", { id: idHom })), "nem se inclui na cerimônia", r.body);

  console.log("== presente de fora da cerimônia; a disciplina não vaza pelo parecer ==");
  await cerimonias("incluir", { cerimoniaId: ce, ids: [idHom] });
  r = await cerimonias("registrar", { cerimoniaId: ce, presentes: [idHom, idCEI], ausentes: [] });
  ok(r.status === 409 && (await escalar("SELECT Status FROM CerimoniasConsagracao WHERE CerimoniaId = @c", { c: ce })) === "PLANEJADA", "presença de quem não está na cerimônia: 409, nada muda", r.body);
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.auxiliar, d: hoje });
  r = await esteira("parecer", { consagracaoId: idCEI, ...E.PARECER_APTO, sabatinaEm: hoje }, L.GERAL(1003, ["cei"]));
  const it = ((r.body.requisitos || {}).itens || []).find((i) => i.chave === "disciplina") || {};
  ok(r.status === 422 && it.situacao === "FALTA" && !/Há disciplina em curso/.test(JSON.stringify(r.body)), "o CEI sem 'disciplina' vê que travou, não o motivo", r.body);
  r = await esteira("parecer", { consagracaoId: idCEI, ...E.PARECER_APTO, sabatinaEm: hoje });
  ok(r.status === 422 && /Há disciplina em curso/.test(JSON.stringify(r.body.requisitos)), "quem tem 'disciplina' vê o motivo", r.body.requisitos);
  await q("DELETE FROM ProcessosDisciplinares WHERE MembroId = @m", { m: P.auxiliar });

  console.log("== lixo em todo campo ==");
  const proximoCEI = async () => {
    const rr = await protocolar({ membroId: P.vetado, assunto: TIPO.MISSIONARIO, proponenteMembroId: 1002 });
    if (rr.status === 201) await evoluir(id(rr), "AVANCAR");
    return escalar("SELECT ConsagracaoId FROM Consagracoes WHERE MembroId = @m AND Status = 'EM_ANALISE_CONSELHO'", { m: P.vetado });
  };
  const idLixo = await proximoCEI();
  // o parecer é aceito com alguns lixos (ex.: sabatina que não é objeto, para Missionário, não pesa): depois de cada aceito, um processo novo
  let alvoAceito = null;
  await fuzz("parecer", async (corpo) => {
    const rr = await esteira("parecer", corpo);
    if (rr.status === 200) alvoAceito = corpo.consagracaoId;
    return rr;
  }, { consagracaoId: idLixo, ...E.PARECER_APTO, sabatinaEm: hoje }, ["resultado", "sabatinaEm", "fundamentacao", "sabatina", "escrutinio", "excecaoPastorNaoCasado"], async () => {
    // o lixo aceito (ex.: sabatina que não é objeto, para Missionário) levou o processo adiante: outro, novo, antes da fotografia
    if (alvoAceito) { await evoluir(alvoAceito, "REPROVAR"); alvoAceito = null; }
    const alvo = (await escalar("SELECT ConsagracaoId FROM Consagracoes WHERE MembroId = @m AND Status = 'EM_ANALISE_CONSELHO'", { m: P.vetado })) || (await proximoCEI());
    return { consagracaoId: alvo };
  });
  await fuzz("taxa", (corpo) => esteira("taxa", corpo), { consagracaoId: idHom, pagoEm: hoje, valor: 70, forma: "PIX" }, ["pagoEm", "valor", "forma", "remover"]);
  await fuzz("homologar", (corpo) => esteira("homologar", corpo), { ids: [idHom], ato: "Ato do Presidente", data: hoje }, ["ids", "sessaoId", "ato", "data"]);
  await fuzz("criar cerimônia", (corpo) => cerimonias("criar", corpo), { dataCerimonia: hoje, local: "Templo Sede", ocasiao: "AGO", valorTaxa: 70 }, ["dataCerimonia", "local", "ocasiao", "valorTaxa"]);
  await fuzz("comissão", (corpo) => cerimonias("comissao", corpo), { cerimoniaId: ce, membroIds: E.COMISSAO }, ["cerimoniaId", "membroIds"]);
  await fuzz("incluir", (corpo) => cerimonias("incluir", corpo), { cerimoniaId: ce, ids: [idHom] }, ["cerimoniaId", "ids"]);
  await fuzz("cancelar", (corpo) => cerimonias("cancelar", corpo), { cerimoniaId: 99999999, motivo: "Motivo de teste" }, ["cerimoniaId", "motivo"]);
  await fuzz("registrar", (corpo) => cerimonias("registrar", corpo), { cerimoniaId: 99999999, presentes: [], ausentes: [] }, ["cerimoniaId", "presentes", "ausentes"]);

  console.log("== texto que parece código é guardado como texto ==");
  r = await cerimonias("criar", { dataCerimonia: hoje, local: "'; DROP TABLE Consagracoes; -- <img src=x onerror=alert(1)>", ocasiao: "SOLENE_CLI" });
  ok(r.status === 201 && (await escalar("SELECT Local FROM CerimoniasConsagracao WHERE CerimoniaId = @c", { c: r.body.cerimoniaId })) === "'; DROP TABLE Consagracoes; -- <img src=x onerror=alert(1)>" && (await escalar("SELECT COUNT(*) FROM Consagracoes")) > 0, "o local com SQL e tag fica exatamente como veio (e a tabela continua lá)");

  fim("e2e-56 consagração (segurança e lixo)");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
