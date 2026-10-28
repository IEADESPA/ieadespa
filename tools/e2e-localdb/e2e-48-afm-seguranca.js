// e2e-48-afm-seguranca.js — v8.1 (AFM e faltas da CLI): quem pode o quê e lixo em todo campo, com os handlers e o banco REAIS, sobre a base "cenario-afm".
// Sem sessão (401 em toda ação), PIN (só o catálogo e a própria situação), liderança de congregação com "afm" (lê só o próprio território, nenhum ato), nível geral sem "afm",
// a Secretaria; o obreiro que tenta justificar a falta de outro; a Secretaria de outra congregação; o que não existe (404 igual); e, para cada ato, cada campo com o lixo de
// lib.js: nunca 500, nunca texto interno na resposta e, se recusou, o banco fica IGUAL.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GERAL, PIN, LIDER, hojeBr } = L;
const { P, montarCenario, chamarRota } = require("./lib-afm");

console.error = () => { };
const SEC = GERAL(1002, ["reunioes", "assembleia", "cli", "pessoas", "afm", "consagracoes"]);
const LOCAL_C = LIDER(3001, ["afm", "reunioes"], ["Central E2E"]);
const LOCAL_V = LIDER(3002, ["afm", "reunioes"], ["Vila Nova E2E"]);
const GERAL_SEM = GERAL(1003, ["pessoas"]);
const afm = (acao, token, metodo = "GET", corpo) => chamarRota("GestaoAFM/index.js", { binding: { acao }, token, metodo, corpo });
const TABELAS = ["Matriculas_AFM", "AFMDesmatriculas", "CLIExclusoesFaltas", "AFMCorpoDocente", "ComissaoMembros", "Presencas", "Sessoes"];
async function retrato() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
async function fuzz(rotulo, { base, campos, chamarCom }) {
  let chamadas = 0; const quebras = [], mudancas = [];
  for (const campo of campos) for (const lixo of L.LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = await chamarCom(corpo);
    chamadas++;
    if (!r.status || r.status >= 500) quebras.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} (${r.status}) mexeu no banco`);
    if (r.body && /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules/i.test(JSON.stringify(r.body))) quebras.push(`${campo} vazou texto interno: ${JSON.stringify(r.body).slice(0, 140)}`);
  }
  ok(quebras.length === 0, `${rotulo}: ${chamadas} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 4));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 4));
}

(async () => {
  await obterPool();
  const hoje = hojeBr();
  const { orgaoCLI } = await montarCenario();
  // três ordinárias só com o Pastor presente: exclusões para o resto da CLI
  const S = [];
  for (let i = 1; i <= 3; i++) {
    const senha = `seg${i}`;
    const r = await chamarRota("AbrirReuniao/index.js", { metodo: "POST", token: SEC, corpo: { orgaoId: orgaoCLI, descricao: `Seg ${i}`, senhaAcesso: senha, tipoSessao: "ORDINARIA" } });
    S.push(r.body.sessaoId);
    await chamarRota("RegistrarPresenca/index.js", { metodo: "POST", corpo: { matricula: P.presente, senha } });
    await q("UPDATE Sessoes SET DataSessao = DATEADD(DAY, @d, CAST(SYSUTCDATETIME() AS DATE)) WHERE SessaoId = @s", { d: -(100 - 7 * i), s: r.body.sessaoId });   // uma que conta por dia
    await chamarRota("EncerrarReuniao/index.js", { metodo: "POST", binding: { sessaoId: r.body.sessaoId }, token: SEC, corpo: {} });
  }
  const exF = await um("SELECT ExclusaoId FROM CLIExclusoesFaltas WHERE MembroId = @id AND AnuladaEm IS NULL AND ReadmitidaEm IS NULL", { id: P.fiscal });
  ok(!!exF, "cenário: há uma exclusão vigente para testar");

  console.log("== sem sessão: 401 em toda ação ==");
  const ACOES_GET = ["catalogos", "minha-situacao", "matriculas", "corpo-docente", "sessoes-magnas", "faltas-cli", "inexistente", undefined];
  const ACOES_POST = ["nivel", "reprovar", "anular-reprovacao", "rematricular", "nomear-reitor", "homologar-reitor", "reconduzir-reitor", "docente", "encerrar-corpo", "comunicar-exclusao", "readmitir", "x"];
  for (const a of ACOES_GET) ok((await afm(a, null)).status === 401, `GET ${a} sem sessão: 401`);
  for (const a of ACOES_POST) ok((await afm(a, null, "POST", { membroId: P.presente })).status === 401, `POST ${a} sem sessão: 401`);

  console.log("== PIN: só o catálogo e a própria situação ==");
  const pin = PIN(P.faltoso);
  ok((await afm("catalogos", pin)).status === 200 && (await afm("minha-situacao", pin)).status === 200, "PIN lê o catálogo e a própria situação");
  for (const a of ["matriculas", "corpo-docente", "sessoes-magnas", "faltas-cli"]) ok((await afm(a, pin)).status === 403, `PIN: ${a} é 403`);
  const antesPin = await retrato();
  for (const a of ACOES_POST) { const r = await afm(a, pin, "POST", { membroId: P.faltoso, exclusaoId: exF.ExclusaoId, data: hoje, ato: "Ata de mentira", nivel: "BACHAREL", concluido: true }); ok(r.status === 403 || r.status === 400, `PIN: POST ${a} recusado`, r.status); }
  ok((await retrato()) === antesPin, "nada mudou no banco pelas tentativas do PIN");
  const minha = await afm("minha-situacao", pin);
  ok(minha.body.cli && minha.body.cli.excluidaEm && !("nome" in minha.body), "a própria situação não traz dado de outra pessoa", minha.body);

  console.log("== território e nível geral ==");
  const mV = await afm("matriculas", LOCAL_V);
  ok(mV.status === 200 && mV.body.geral === false && mV.body.itens.every((m) => m.congregacao === "Vila Nova E2E"), "liderança da Vila Nova vê só a Vila Nova");
  const mC = await afm("matriculas", LOCAL_C);
  ok(mC.status === 200 && mC.body.itens.some((m) => m.membroId === P.diacono) && mC.body.itens.every((m) => m.congregacao === "Central E2E"), "liderança da Central vê a Central");
  const antesLocal = await retrato();
  for (const a of ACOES_POST.filter((x) => x !== "x")) { const r = await afm(a, LOCAL_C, "POST", { membroId: P.diacono, exclusaoId: exF.ExclusaoId, data: hoje, ato: "Ata 1/2026", nivel: "BASICO", concluido: true }); ok(r.status === 403, `liderança local: POST ${a} é do nível geral (403)`, r.status); }
  ok((await retrato()) === antesLocal, "nada mudou no banco pelas tentativas da liderança local");
  ok((await afm("matriculas", GERAL_SEM)).status === 403 && (await afm("nivel", GERAL_SEM, "POST", { membroId: P.diacono, nivel: "BASICO", concluido: true })).status === 403, "nível geral sem a permissão afm: 403");
  ok((await afm("faltas-cli", LOCAL_C)).status === 403, "faltas-cli: só o nível geral (as faltas e as exclusões são da igreja inteira)");

  console.log("== o que não existe ==");
  ok((await afm("readmitir", SEC, "POST", { exclusaoId: 99999999, data: hoje, ato: "Ata 1/2026" })).status === 404, "readmitir exclusão inexistente: 404");
  ok((await afm("comunicar-exclusao", SEC, "POST", { exclusaoId: 99999999, data: hoje })).status === 404, "comunicar exclusão inexistente: 404");
  ok((await afm("nivel", SEC, "POST", { membroId: 99999999, nivel: "BASICO", concluido: true })).status === 404, "nível de matrícula inexistente: 404");
  ok((await afm("encerrar-corpo", SEC, "POST", { corpoDocenteId: 99999999, data: hoje, motivo: "teste de sonda" })).status === 404, "encerrar corpo docente inexistente: 404");

  console.log("== justificativa: só a própria, só no território ==");
  const antesJ = await retrato();
  const deOutro = await chamarRota("SolicitarJustificativa/index.js", { metodo: "POST", binding: { matricula: P.faltoso, sessaoId: S[0] }, token: PIN(P.presente), corpo: { codigo: "SAUDE" } });
  ok(deOutro.status === 403 || deOutro.status === 401, "o PIN de um obreiro não pede justificativa da falta de outro", deOutro.status);
  const foraTerr = await chamarRota("JustificarFalta/index.js", { metodo: "POST", binding: { sessaoId: S[0] }, token: LIDER(3002, ["reunioes"], ["Vila Nova E2E"]), corpo: { membroId: P.faltoso, codigo: "SAUDE" } });
  ok(foraTerr.status === 403, "a Secretaria da Vila Nova não justifica falta de quem é da Central", foraTerr.status);
  ok((await retrato()) === antesJ, "e nada mudou");

  console.log("== lixo em cada campo ==");
  await fuzz("nível", { base: { membroId: P.diacono, nivel: "MEDIO", concluido: false }, campos: ["membroId", "nivel", "concluido"], chamarCom: (c) => afm("nivel", SEC, "POST", c) });
  await fuzz("reprovar", { base: { membroId: P.auxiliar, data: hoje, detalhe: "Prova de doutrina de outubro" }, campos: ["membroId", "data", "detalhe"], chamarCom: (c) => afm("reprovar", SEC, "POST", c) });
  await fuzz("anular-reprovacao", { base: { membroId: P.auxiliar, motivo: "Registro feito no obreiro errado" }, campos: ["membroId", "motivo"], chamarCom: (c) => afm("anular-reprovacao", SEC, "POST", c) });
  await fuzz("rematricular", { base: { membroId: P.auxiliar, reciclagemAprovadaEm: hoje, observacao: "ok" }, campos: ["membroId", "reciclagemAprovadaEm", "observacao"], chamarCom: (c) => afm("rematricular", SEC, "POST", c) });
  await fuzz("nomear-reitor", { base: { membroId: P.reitor, dataInicio: hoje, titulacao: "Mestre em Teologia", homologadoCLIEm: hoje, homologacaoAto: "Ata 9/2026" },
    campos: ["membroId", "dataInicio", "titulacao", "homologadoCLIEm", "homologacaoAto"], chamarCom: (c) => afm("nomear-reitor", SEC, "POST", c) });
  await fuzz("homologar-reitor", { base: { data: hoje, ato: "Ata 9/2026" }, campos: ["data", "ato"], chamarCom: (c) => afm("homologar-reitor", SEC, "POST", c) });
  await fuzz("reconduzir-reitor", { base: { ano: Number(hoje.slice(0, 4)) + 1 }, campos: ["ano"], chamarCom: (c) => afm("reconduzir-reitor", SEC, "POST", c) });
  await fuzz("docente", { base: { membroId: P.mestre, titulacao: "Bacharel em Teologia", dataInicio: hoje }, campos: ["membroId", "titulacao", "dataInicio"], chamarCom: (c) => afm("docente", SEC, "POST", c) });
  const docente = await escalar("SELECT TOP 1 CorpoDocenteId FROM AFMCorpoDocente WHERE Papel = 'DOCENTE' AND DataFim IS NULL");
  await fuzz("encerrar-corpo", { base: { corpoDocenteId: docente || 1, data: hoje, motivo: "Mudou de cidade" }, campos: ["corpoDocenteId", "data", "motivo"], chamarCom: (c) => afm("encerrar-corpo", SEC, "POST", c) });
  await fuzz("comunicar-exclusao", { base: { exclusaoId: exF.ExclusaoId, data: hoje }, campos: ["exclusaoId", "data"], chamarCom: (c) => afm("comunicar-exclusao", SEC, "POST", c) });
  await fuzz("readmitir", { base: { exclusaoId: exF.ExclusaoId, data: hoje, ato: "Ata da CLI 12/2026" }, campos: ["exclusaoId", "data", "ato"], chamarCom: (c) => afm("readmitir", SEC, "POST", c) });
  await fuzz("justificar (CLI)", { base: { membroId: P.faltoso, codigo: "SAUDE", detalhe: "ok" }, campos: ["membroId", "codigo", "detalhe", "comprovanteConferido"],
    chamarCom: (c) => chamarRota("JustificarFalta/index.js", { metodo: "POST", binding: { sessaoId: S[2] }, token: SEC, corpo: c }) });
  await fuzz("pedido de justificativa (CLI)", { base: { codigo: "LUTO", detalhe: "ok" }, campos: ["codigo", "detalhe"],
    chamarCom: (c) => chamarRota("SolicitarJustificativa/index.js", { metodo: "POST", binding: { matricula: P.cei, sessaoId: S[1] }, token: PIN(P.cei), corpo: c }) });
  await fuzz("rejeitar pedido", { base: { membroId: P.cei }, campos: ["membroId"],
    chamarCom: (c) => chamarRota("RejeitarJustificativa/index.js", { metodo: "POST", binding: { sessaoId: S[1] }, token: SEC, corpo: c }) });
  await fuzz("presença manual", { base: { membroId: P.cei, presente: false }, campos: ["membroId", "presente"],
    chamarCom: (c) => chamarRota("AtualizarPresencaManual/index.js", { metodo: "POST", binding: { sessaoId: S[0] }, token: SEC, corpo: c }) });
  for (const sessaoId of ["x", 2 ** 40, "0x10", -1]) {
    const r = await chamarRota("JustificarFalta/index.js", { metodo: "POST", binding: { sessaoId }, token: SEC, corpo: { membroId: P.cei, codigo: "SAUDE" } });
    ok(r.status === 400, `reunião ${JSON.stringify(sessaoId)} na rota: 400, não 500`, r.status);
  }
  await fuzz("abrir reunião (tipo)", { base: { orgaoId: orgaoCLI, descricao: "Fuzz", senhaAcesso: "fz", tipoSessao: "EXTRAORDINARIA" }, campos: ["tipoSessao"],
    chamarCom: async (c) => { const r = await chamarRota("AbrirReuniao/index.js", { metodo: "POST", token: SEC, corpo: c }); if (r.body && r.body.sessaoId) await q("UPDATE Sessoes SET Status = 'ENCERRADA' WHERE SessaoId = @s", { s: r.body.sessaoId }); return r; } });
  await fuzz("CDER", { base: { membroId: P.mestre, qualificacao: "Mestre em Teologia" }, campos: ["membroId", "qualificacao"],
    chamarCom: (c) => chamarRota("GestaoComissoes/index.js", { metodo: "POST", binding: { sigla: "cder" }, token: SEC, corpo: c }) });
  ok((await escalar("SELECT COUNT(*) FROM Presencas WHERE MotivoCodigo IS NOT NULL AND MotivoCodigo NOT IN ('SAUDE','VIAGEM_PROFISSIONAL','LUTO','EMERGENCIA_FAMILIAR','OUTRO_EXTERNO')")) === 0, "nenhum motivo fora do catálogo entrou no banco");
  ok((await escalar("SELECT COUNT(*) FROM AFMCorpoDocente WHERE Papel = 'REITOR' AND DataFim IS NULL")) <= 1, "nunca dois Reitores");
  ok((await escalar("SELECT COUNT(*) FROM ComissaoMembros WHERE Sigla = 'CDER' AND DataFim IS NULL")) <= 2, "nunca mais de 2 mestres na CDER");

  fim("e2e-48 (AFM e faltas da CLI — segurança e lixo)");
})().catch((e) => { console.log("ERRO FATAL:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
