// e2e-103-volta10-carta-e-encerrar.js — a volta 10 do Membros (os 3 importantes e os menores baratos do portão v9), contra o SQL Server de verdade. Só dados
// de mentira.
//  1. Quem está em ARROLAMENTO entra de verdade no aplicativo (MembroEntrar com o PIN) e NÃO emite a Carta de Recomendação nem o Atestado Supletivo (a recusa
//     é neutra, nada se grava); a carta já emitida antes (gravada direto) não sai em PDF, nem para o titular nem para a secretaria, e não gasta protocolo. O
//     controle: quem está em comunhão continua emitindo na hora e baixando o PDF.
//  2. Encerrar a cadeira e a vaga de comissão pede o motivo NO SERVIDOR: vazio, só espaços ou sem o campo -> 400 e nada muda (a cadeira continua aberta, nada
//     na trilha); com o motivo, ele vai sem os espaços das pontas para a cadeira/vaga e para a trilha.
//  3. (menor 8) A Minha linha do tempo de quem está em arrolamento não traz o "membro desde" nem a entrada no rol com a data do sistema pago.
// Roda sobre a base cenario-186 (`BASE=cenario-186 bash rodar.sh roteiro e2e-103-volta10-carta-e-encerrar.js`).
process.env.AUTH_SECRET = "segredo-do-e2e-103-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool } = L;
const H = (nome) => require(L.path.join(L.API, `${nome}/index.js`));

async function rota(h, ligado, metodo, token, corpo, query = {}, headers = {}) {
  const ctx = { bindingData: ligado || {}, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  const hs = { ...headers }; if (token) hs["x-auth-token"] = token;
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);
  try { await h(ctx, { method: metodo, query: qs, body: corpo, headers: hs }); } catch (e) { return { status: 500, body: { estourou: String(e && e.message).slice(0, 200) } }; }
  return ctx.res || { status: 0, body: null };
}

async function principal() {
  const pool = await obterPool();
  const [c1] = await q("SELECT TOP 1 CongregacaoId, Nome FROM Congregacoes ORDER BY CongregacaoId");
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro, DataAdmissao, DataBatismo, CongregacaoId, Funcao) VALUES
    (991031, N'Ana Arrolamento E2E103', N'ATIVO', N'ARROLAMENTO', '2012-05-05', NULL, @c, N'Porteira E2E103'),
    (991032, N'Carla Em Comunhão E2E103', N'ATIVO', N'EM_COMUNHAO', '2020-05-10', '2020-05-10', @c, NULL),
    (991033, N'Davi Congregado E2E103', N'ATIVO', N'CONGREGADO', NULL, NULL, @c, NULL)`, { c: c1.CongregacaoId });
  const pinMembro = require(L.path.join(L.API, "shared/pinMembro"));
  const hEntrar = H("MembroEntrar"), hCarta = H("SolicitarCarta"), hPdf = H("CartaPdf");

  console.log("== 1. quem está em arrolamento entra e não emite sozinho a carta que sai na hora ==");
  await pinMembro.gravarPin(pool, 991031, "4827");
  const entrar = await rota(hEntrar, {}, "POST", null, { matricula: 991031, pin: "4827" }, {}, L.IP_PUBLICO);
  ok(entrar.body && entrar.body.sucesso === true && !!entrar.body.token, "o arrolado entra com o PIN (a entrada não muda nesta volta)", entrar.body && entrar.body.mensagem);
  const tk = entrar.body && entrar.body.token;
  const cartasAntes = await escalar("SELECT COUNT(*) FROM CartasTransito WHERE MembroId = 991031");
  for (const tipo of ["RECOMENDACAO", "ATESTADO_SUPLETIVO"]) {
    const r = await rota(hCarta, {}, "POST", tk, { matricula: 991031, tipo, destino: "Igreja de mentira E2E103" });
    ok(r.body && r.body.sucesso === false && /ficha ainda está para completar: a carta sai depois que a secretaria completar a ficha/.test(r.body.mensagem || ""),
      `${tipo} de quem está em arrolamento: recusada, com a frase neutra`, r.body);
    ok(!/arrolamento|sistema pago|2012/i.test(JSON.stringify(r.body)), `${tipo}: a recusa não diz por quê nem a data do sistema pago`, r.body);
  }
  ok((await escalar("SELECT COUNT(*) FROM CartasTransito WHERE MembroId = 991031")) === cartasAntes, "nenhuma carta foi gravada para o arrolado");

  // a carta emitida ANTES da regra (gravada direto, como o portão provou que acontecia): o PDF não sai, nem para o titular nem para a secretaria
  const emitida = await escalar(`INSERT INTO CartasTransito (MembroId, Tipo, Destino, SolicitadoPor, EmitidoPor, Status, DataConfirmacao, DataEmissao, DataValidade)
    OUTPUT INSERTED.CartaId VALUES (991031, N'RECOMENDACAO', N'Igreja de mentira E2E103', 991031, 991031, N'EMITIDA', SYSUTCDATETIME(), CAST(SYSUTCDATETIME() AS DATE), DATEADD(day, 30, CAST(SYSUTCDATETIME() AS DATE)))`);
  const pdfTitular = await rota(hPdf, { id: String(emitida) }, "GET", tk, undefined, { matricula: 991031 });
  ok(pdfTitular.status === 422 && /ficha ainda está para completar/.test((pdfTitular.body && pdfTitular.body.mensagem) || ""), "o PDF da carta já emitida: 422 com a frase neutra para o titular", [pdfTitular.status, pdfTitular.body]);
  const secretaria = L.LIDER(991032, ["pessoas"], [c1.Nome]);
  const pdfSec = await rota(hPdf, { id: String(emitida) }, "GET", secretaria, undefined, { matricula: 991031 });
  ok(pdfSec.status === 422, "o PDF da mesma carta: 422 também para a secretaria da congregação", [pdfSec.status, pdfSec.body]);
  ok((await escalar("SELECT Protocolo FROM CartasTransito WHERE CartaId = @id", { id: emitida })) === null, "a recusa não gastou número de protocolo");

  console.log("== 1. o controle: em comunhão e congregado seguem como antes ==");
  const tkCarla = L.PIN(991032);
  const rCarla = await rota(hCarta, {}, "POST", tkCarla, { matricula: 991032, tipo: "RECOMENDACAO", destino: "Igreja de mentira E2E103" });
  ok(rCarla.status === 201 && rCarla.body.sucesso === true, "em comunhão: a Recomendação sai na hora (201)", rCarla.body);
  const pdfCarla = await rota(hPdf, { id: String(rCarla.body && rCarla.body.cartaId) }, "GET", tkCarla, undefined, { matricula: 991032 });
  ok(pdfCarla.status === 200 && pdfCarla.headers && pdfCarla.headers["Content-Type"] === "application/pdf", "em comunhão: o PDF sai", [pdfCarla.status]);
  const rDavi = await rota(hCarta, {}, "POST", L.PIN(991033), { matricula: 991033, tipo: "RECOMENDACAO", destino: "Igreja de mentira E2E103" });
  ok(rDavi.status === 201, "congregado: a Recomendação continua saindo (a regra desta volta é só do arrolamento)", rDavi.body);

  console.log("== 2. encerrar pede o motivo no servidor ==");
  const geral = L.GERAL(991032, ["pessoas", "financeiro"]);
  const orgao = await um("SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla = 'CONSELHO_FISCAL'");
  const assento = await escalar(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) OUTPUT INSERTED.AssentoId
    VALUES (@o, 991033, 'FUNCAO', N'Conselheiro E2E103', '2025-01-01')`, { o: orgao.OrgaoId });
  const vaga = await escalar(`INSERT INTO ComissaoMembros (Sigla, MembroId, DataInicio) OUTPUT INSERTED.ComissaoMembroId VALUES (N'CCJ', 991033, '2025-01-01')`);
  const hAssentos = H("GestaoAssentos"), hComissoes = H("GestaoComissoes");
  const trilhaAntes = await escalar("SELECT COUNT(*) FROM AuditLog WHERE (Tabela = N'Assentos' AND RegistroId = @a) OR (Tabela = N'ComissaoMembros' AND RegistroId = @v)", { a: String(assento), v: String(vaga) });
  for (const corpo of [{}, { motivoEncerramento: "" }, { motivoEncerramento: "    " }, { motivoEncerramento: null }, { motivoEncerramento: 12 }, { motivoEncerramento: "x".repeat(201) }]) {
    const rA = await rota(hAssentos, { id: String(assento), acao: "encerrar" }, "POST", geral, corpo);
    const rC = await rota(hComissoes, { sigla: "ccj", id: String(vaga), acao: "encerrar" }, "POST", geral, corpo);
    ok(rA.status === 400 && rC.status === 400 && /Informe o motivo do encerramento/.test(`${rA.body && rA.body.mensagem}|${rC.body && rC.body.mensagem}`),
      `encerrar com ${JSON.stringify(corpo).slice(0, 40)}: 400 na cadeira e na vaga`, [rA.status, rC.status]);
  }
  ok((await escalar("SELECT COUNT(*) FROM Assentos WHERE AssentoId = @a AND DataFim IS NULL", { a: assento })) === 1
    && (await escalar("SELECT COUNT(*) FROM ComissaoMembros WHERE ComissaoMembroId = @v AND DataFim IS NULL", { v: vaga })) === 1, "recusado: a cadeira e a vaga continuam abertas");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE (Tabela = N'Assentos' AND RegistroId = @a) OR (Tabela = N'ComissaoMembros' AND RegistroId = @v)", { a: String(assento), v: String(vaga) })) === trilhaAntes,
    "recusado: nada na trilha");
  const local = L.LIDER(991032, ["pessoas"], [c1.Nome]);
  const rLocal = await rota(hAssentos, { id: String(assento), acao: "encerrar" }, "POST", local, { motivoEncerramento: "Fim do mandato" });
  ok(rLocal.status === 403, "a liderança local continua sem encerrar (403), mesmo com o motivo", rLocal.status);
  const okA = await rota(hAssentos, { id: String(assento), acao: "encerrar" }, "POST", geral, { motivoEncerramento: "  Ainda não é membro (congregado) E2E103  " });
  const okC = await rota(hComissoes, { sigla: "ccj", id: String(vaga), acao: "encerrar" }, "POST", geral, { motivoEncerramento: " Ainda não é membro (congregado) E2E103 " });
  ok(okA.body && okA.body.sucesso === true && okC.body && okC.body.sucesso === true, "com o motivo: a Geral encerra a cadeira e a vaga", [okA.body, okC.body]);
  const gravA = await escalar("SELECT MotivoEncerramento FROM Assentos WHERE AssentoId = @a", { a: assento });
  const gravC = await escalar("SELECT MotivoEncerramento FROM ComissaoMembros WHERE ComissaoMembroId = @v", { v: vaga });
  ok(gravA === "Ainda não é membro (congregado) E2E103" && gravC === "Ainda não é membro (congregado) E2E103", "o motivo vai sem os espaços das pontas para a cadeira e para a vaga", [gravA, gravC]);
  const trilhaA = await escalar("SELECT TOP 1 DadosDepois FROM AuditLog WHERE Tabela = N'Assentos' AND RegistroId = @a ORDER BY AuditId DESC", { a: String(assento) });
  ok(/"motivoEncerramento":"Ainda não é membro \(congregado\) E2E103"/.test(trilhaA || ""), "o motivo fica na trilha da cadeira", trilhaA);

  console.log("== 3. a Minha linha do tempo de quem está em arrolamento ==");
  const linha = await rota(H("MinhaLinhaDoTempo"), { matricula: "991031" }, "GET", tk);
  ok(linha.body && linha.body.sucesso === true && linha.body.dataAdmissao === null && !(linha.body.eventos || []).some((e) => e.tipo === "ADMISSAO" || e.tipo === "READMISSAO"),
    "sem o 'membro desde' e sem a entrada no rol com a data do sistema pago", linha.body && { dataAdmissao: linha.body.dataAdmissao, eventos: (linha.body.eventos || []).map((e) => e.tipo) });
  const linhaCarla = await rota(H("MinhaLinhaDoTempo"), { matricula: "991032" }, "GET", tkCarla);
  ok(linhaCarla.body && linhaCarla.body.dataAdmissao === "2020-05-10", "controle: em comunhão, o 'membro desde' continua", linhaCarla.body && linhaCarla.body.dataAdmissao);

  await q(`DELETE FROM CartasTransito WHERE MembroId BETWEEN 991031 AND 991033; DELETE FROM Assentos WHERE MembroId BETWEEN 991031 AND 991033;
    DELETE FROM ComissaoMembros WHERE MembroId BETWEEN 991031 AND 991033`);
  fim("e2e-103");
}
principal().catch((e) => { console.error("ESTOUROU:", e); process.exitCode = 1; }).finally(() => { L.shimEncerrar(); });
