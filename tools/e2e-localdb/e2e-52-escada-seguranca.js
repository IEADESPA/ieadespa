// e2e-52-escada-seguranca.js — v8.2 (Escada ministerial): quem pode o quê e lixo em todo campo, com os handlers e o banco REAIS, sobre a base "cenario-escada".
// Sem sessão (401), PIN (403), o Dirigente (só no próprio território; nunca nomeação, outra convenção, cargo, "no cargo desde", dízimo, CHM, candidato nem veto), a
// liderança local com "afm" (nenhum ato da Academia), a Secretaria; fora do escopo responde igual a "não existe"; e, para cada rota nova ou mudada, cada campo com o lixo
// de lib.js: nunca 500, nunca texto interno na resposta e, se recusou (status >= 400 ou sucesso:false), o banco fica IGUAL.
const L = require("./lib");
const { ok, fim, um, escalar, obterPool, PIN, hojeBr } = L;
const E = require("./lib-escada");
const { P, TIPO, SEC, LIDER, req, protocolar, evoluir, afmGet, afmPost, salvarPessoa, chamarRota } = E;

console.error = () => { };
const TABELAS = ["Consagracoes", "CargosMinisteriaisHistorico", "Matriculas_AFM", "MarcosMembro"];
async function retrato() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  partes.push(JSON.stringify(await um("SELECT CHECKSUM_AGG(CHECKSUM(MembroId, CargoMinisterial, Sexo, DizimistaFiel, Funcao, Status)) c FROM MembroReferencia")));
  return partes.join("|");
}
const recusou = (r) => !r.status || r.status >= 400 || (r.body && r.body.sucesso === false);
async function fuzz(rotulo, { base, campos, chamarCom }) {
  let chamadas = 0; const quebras = [], mudancas = [];
  for (const campo of campos) for (const lixo of L.LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = await chamarCom(corpo);
    chamadas++;
    if (!r.status || r.status >= 500) quebras.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    else if (recusou(r) && (await retrato()) !== antes) mudancas.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} (${r.status}) mexeu no banco`);
    if (r.body && /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules/i.test(JSON.stringify(r.body))) quebras.push(`${campo} vazou texto interno: ${JSON.stringify(r.body).slice(0, 140)}`);
  }
  ok(quebras.length === 0, `${rotulo}: ${chamadas} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 4));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 4));
}

(async () => {
  await obterPool();
  const hoje = hojeBr();
  await E.montarCenario();
  const LID = LIDER();
  const LOCAL_AFM = L.LIDER(P.lider, ["afm", "consagracoes"], [E.CENTRAL]);
  const GERAL_SEM = L.GERAL(1003, ["pessoas"]);

  console.log("== sem sessão: 401 ==");
  for (const [nome, chamada] of [
    ["requisitos", () => chamarRota("RequisitosEscada/index.js", { query: { membroId: P.missionario, assunto: TIPO.DIACONO } })],
    ["protocolar", () => chamarRota("CriarConsagracao/index.js", { metodo: "POST", corpo: { membroId: P.missionario, assunto: TIPO.DIACONO, proponenteMembroId: 1002 } })],
    ["evoluir", () => chamarRota("EvoluirConsagracao/index.js", { metodo: "POST", binding: { consagracaoId: "11111111-1111-1111-1111-111111111111" }, corpo: { acao: "AVANCAR" } })],
    ["vetaveis", () => chamarRota("GestaoAFM/index.js", { binding: { acao: "vetaveis" } })],
    ["chm", () => chamarRota("GestaoAFM/index.js", { metodo: "POST", binding: { acao: "chm" }, corpo: { membroId: P.missionario, conceder: true, data: hoje } })],
    ["vetar", () => chamarRota("GestaoAFM/index.js", { metodo: "POST", binding: { acao: "vetar" }, corpo: {} })],
    ["candidato", () => chamarRota("GestaoAFM/index.js", { metodo: "POST", binding: { acao: "matricular-candidato" }, corpo: {} })],
    ["pessoas", () => chamarRota("GestaoPessoas/index.js", { metodo: "POST", corpo: { membroId: P.missionario, nome: "x", cargoMinisterial: "PASTOR" } })]
  ]) ok((await chamada()).status === 401, `${nome}: 401 sem sessão`);

  console.log("== PIN e geral sem a permissão: 403 ==");
  ok((await req(TIPO.DIACONO, P.missionario, "INDICACAO", PIN(P.missionario))).status === 403, "PIN não confere requisitos (nem os próprios)");
  ok((await protocolar({ membroId: P.missionario, assunto: TIPO.DIACONO, proponenteMembroId: P.missionario }, PIN(P.missionario))).status === 403, "PIN não protocola");
  ok((await req(TIPO.DIACONO, P.missionario, "INDICACAO", GERAL_SEM)).status === 403, "geral sem 'consagracoes': 403");
  for (const acao of ["vetaveis"]) ok((await afmGet(acao, GERAL_SEM)).status === 403, `geral sem 'afm': ${acao} 403`);
  for (const acao of ["chm", "vetar", "matricular-candidato"]) ok((await afmPost(acao, { membroId: P.candidato }, GERAL_SEM)).status === 403, `geral sem 'afm': ${acao} 403`);

  console.log("== liderança local ==");
  for (const acao of ["chm", "vetar", "matricular-candidato"]) ok((await afmPost(acao, { membroId: P.candidato, conceder: true, data: hoje, nivel: "BASICO", consagracaoId: "11111111-1111-1111-1111-111111111111", motivo: "x".repeat(20) }, LOCAL_AFM)).status === 403, `local com 'afm': ${acao} é do geral (403)`);
  ok((await afmGet("vetaveis", LOCAL_AFM)).status === 403, "local com 'afm': vetáveis é do geral (403)");
  let r = await req(TIPO.MISSIONARIO, P.foraEscopo, "INDICACAO", LID);
  ok(r.status === 404, "requisitos de quem está fora do escopo: igual a 'não existe' (404)", r.body);
  ok((await req(TIPO.MISSIONARIO, 999999, "INDICACAO", LID)).status === 404, "matrícula inexistente: o mesmo 404");
  const antes = await retrato();
  r = await protocolar({ membroId: P.foraEscopo, assunto: TIPO.MISSIONARIO, proponenteMembroId: P.lider }, LID);
  ok(r.body.sucesso === false && /não encontrada/.test(r.body.mensagem) && (await retrato()) === antes, "protocolar fora do escopo: 'não encontrada', nada gravado", r.body);
  r = await protocolar({ membroId: P.missionario, assunto: TIPO.DIACONO, proponenteMembroId: 1002 }, LID);
  ok(r.status === 403, "o Dirigente não protocola em nome de outro proponente", r.body);
  for (const modalidade of ["NOMEACAO_PRESIDENCIAL", "OUTRA_CONVENCAO"]) {
    r = await protocolar({ membroId: P.missionario, assunto: TIPO.DIACONO, proponenteMembroId: P.lider, modalidade, atoReferencia: "Ato 1/2026" }, LID);
    ok(r.status === 403 && (await retrato()) === antes, `o Dirigente não registra ${modalidade}`, r.body);
  }
  r = await salvarPessoa(P.foraEscopo, { telefone: "91900000000" }, LID);
  ok(r.status === 403 && (await retrato()) === antes, "cadastro fora do escopo: 403");
  r = await salvarPessoa(P.missionario, { cargoMinisterial: "DIACONO" }, LID);
  ok(r.status === 403 && (await retrato()) === antes, "o Dirigente não troca cargo");
  r = await salvarPessoa(P.missionario, { dizimistaFiel: null }, LID);
  ok(r.status === 403 && (await retrato()) === antes, "nem 'apaga' o dízimo");
  r = await salvarPessoa(P.legado, { cargoDesde: "2010-01-01" }, LID);
  ok(r.status === 403 && (await retrato()) === antes, "nem informa 'no cargo desde'");

  console.log("== a Secretaria: o que não existe ==");
  ok((await evoluir("not-a-guid", "AVANCAR")).body.sucesso === false, "processo com id ruim: 'não encontrado'");
  ok((await evoluir("11111111-1111-1111-1111-111111111111", "AVANCAR")).body.sucesso === false, "processo inexistente: 'não encontrado'");
  r = await afmPost("vetar", { consagracaoId: "11111111-1111-1111-1111-111111111111", motivo: "Motivo de teste longo o bastante" });
  ok(r.status === 404, "vetar inexistente: 404", r.body);
  r = await afmPost("chm", { membroId: 999999, conceder: true, data: hoje });
  ok(r.status === 422 && (await retrato()) === antes, "CHM de quem não tem matrícula: recusado", r.body);
  r = await afmPost("chm", { membroId: P.inativo, conceder: true, data: hoje });
  ok(r.status === 422, "CHM para matrícula inativa: recusado (Art. 69 §3º)", r.body);
  r = await afmPost("matricular-candidato", { membroId: 999999, nivel: "BASICO", data: hoje });
  ok(r.status === 404, "candidato inexistente: 404", r.body);

  console.log("== lixo em todo campo ==");
  // a missionária nunca passa para Diácono (teto das obreiras): nenhum lixo pode fazer o processo nascer
  await fuzz("protocolar", { base: { membroId: P.missionaria, assunto: TIPO.DIACONO, proponenteMembroId: 1002, modalidade: "INDICACAO", atoReferencia: "Ato" },
    campos: ["membroId", "assunto", "proponenteMembroId", "modalidade", "atoReferencia", "cargoAtual"], chamarCom: (c) => protocolar(c) });
  await fuzz("protocolar (Dirigente)", { base: { membroId: P.missionaria, assunto: TIPO.DIACONO, proponenteMembroId: P.lider },
    campos: ["membroId", "assunto", "proponenteMembroId", "modalidade", "atoReferencia"], chamarCom: (c) => protocolar(c, LID) });
  await fuzz("requisitos", { base: { membroId: P.missionario, assunto: TIPO.DIACONO, modalidade: "INDICACAO" },
    campos: ["membroId", "assunto", "modalidade"], chamarCom: (c) => chamarRota("RequisitosEscada/index.js", { token: SEC(), query: c }) });
  await fuzz("evoluir", { base: { acao: "AVANCAR" }, campos: ["acao"], chamarCom: (c) => chamarRota("EvoluirConsagracao/index.js", { metodo: "POST", binding: { consagracaoId: "11111111-1111-1111-1111-111111111111" }, token: SEC(), corpo: c }) });
  await fuzz("evoluir (id)", { base: { id: "x" }, campos: ["id"], chamarCom: (c) => chamarRota("EvoluirConsagracao/index.js", { metodo: "POST", binding: { consagracaoId: c.id }, token: SEC(), corpo: { acao: "AVANCAR" } }) });
  await fuzz("chm", { base: { membroId: P.inativo, conceder: true, data: hoje }, campos: ["membroId", "conceder", "data"], chamarCom: (c) => afmPost("chm", c) });
  await fuzz("vetar", { base: { consagracaoId: "11111111-1111-1111-1111-111111111111", motivo: "Motivo de teste longo o bastante" }, campos: ["consagracaoId", "motivo"], chamarCom: (c) => afmPost("vetar", c) });
  await fuzz("candidato", { base: { membroId: P.auxiliar, nivel: "BASICO", data: hoje }, campos: ["membroId", "nivel", "data"], chamarCom: (c) => afmPost("matricular-candidato", c) });
  // o cadastro regrava a linha inteira: com lixo no sexo e na data de entrada no cargo, nada de cargo, sexo, dízimo nem histórico muda
  const base = (await E.pessoa(P.legado)) || {};
  const { cargoDesde, funcao, congregacao, extensao, capacidade, menorDeIdade, fotoUrl, processoDisciplinarAtivo, ...campos } = base;
  await fuzz("pessoas", { base: campos, campos: ["sexo", "cargoDesde"], chamarCom: (c) => chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: SEC(), corpo: c }) });

  fim("e2e-52 escada (segurança e lixo)");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
