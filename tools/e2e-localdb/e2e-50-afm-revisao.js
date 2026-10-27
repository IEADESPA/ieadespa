// e2e-50-afm-revisao.js — v8.1: o que a revisão independente do servidor (27/10/2026) pediu, com os handlers e o banco REAIS, sobre a base "cenario-afm".
// Só o nível geral mexe no que conta falta da CLI (o Dirigente não abre, não encerra, não justifica, não corrige, não marca "não conta"); ninguém justifica nem corrige a
// própria falta; uma reunião que conta por dia; "não conta falta" refaz a apuração; período fora da CLI interrompe a sequência; pedido pendente segura a exclusão até a
// recusa; justificativa no meio refaz a exclusão com as reuniões certas; o Seminário de novembro não conta para a CLI; o quórum da Magna é só da Câmara; o documento só para
// quem a Academia esperava; a frequência sem o motivo fora do nível geral; a trilha sem o detalhe; a CEI com a matrícula ativa e o CHM que sobrevive à rematrícula; o papel
// Global sem "pessoas" não corrige marco; identificador estranho não vira 500.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GERAL, PIN, LIDER } = L;
const { P, montarCenario, chamarRota } = require("./lib-afm");

console.error = () => { };
const PERM = ["reunioes", "assembleia", "cli", "pessoas", "afm", "consagracoes"];
const SEC = GERAL(1002, PERM);
const DIRIGENTE = LIDER(3001, ["reunioes", "pessoas"], ["Central E2E"]);
const db = require(path.join(API, "shared/afmDb.js"));
let orgaoCLI;
let n = 0, idade = 0;
async function abrir(tipoSessao, token = SEC) {
  const senha = `rv${++n}`;
  const r = await chamarRota("AbrirReuniao/index.js", { metodo: "POST", token, corpo: { orgaoId: orgaoCLI, descricao: `Revisão ${n}`, senhaAcesso: senha, tipoSessao } });
  return { r, sessaoId: r.body && r.body.sessaoId, senha };
}
const presenca = (s, m) => chamarRota("RegistrarPresenca/index.js", { metodo: "POST", corpo: { matricula: m, senha: s.senha } });
async function envelhecer(sessaoId) { await q("UPDATE Sessoes SET DataSessao = DATEADD(DAY, @d, CAST(SYSUTCDATETIME() AS DATE)) WHERE SessaoId = @s AND ContaFaltasCLI = 1", { d: -(300 - 7 * ++idade), s: sessaoId }); }
const encerrarSemData = (sessaoId, token = SEC) => chamarRota("EncerrarReuniao/index.js", { metodo: "POST", binding: { sessaoId }, token, corpo: {} });
async function encerrar(sessaoId) { await envelhecer(sessaoId); return encerrarSemData(sessaoId); }
async function reuniao(tipo, presentes) { const s = await abrir(tipo); for (const m of presentes) await presenca(s, m); await encerrar(s.sessaoId); return s.sessaoId; }
const justificar = (sessaoId, corpo, token = SEC) => chamarRota("JustificarFalta/index.js", { metodo: "POST", binding: { sessaoId }, token, corpo });
const vigente = (id) => um("SELECT * FROM CLIExclusoesFaltas WHERE MembroId = @id AND ReadmitidaEm IS NULL AND AnuladaEm IS NULL", { id });
const afmPost = (acao, corpo, token = SEC) => chamarRota("GestaoAFM/index.js", { metodo: "POST", binding: { acao }, token, corpo });

(async () => {
  await obterPool();
  ({ orgaoCLI } = await montarCenario());
  const SEMPRE = [P.presente, P.tesoureiro, P.dupla, P.reprovado, P.reitor, P.mestre];

  console.log("== o Dirigente não mexe no que conta falta da CLI ==");
  ok((await abrir("ORDINARIA", DIRIGENTE)).r.status === 403, "o Dirigente não abre reunião da CLI (403)");
  const aberta = await abrir("ORDINARIA");
  ok((await encerrarSemData(aberta.sessaoId, DIRIGENTE)).status === 403, "nem encerra a que a Secretaria abriu (403)");
  await presenca(aberta, P.presente);
  await encerrar(aberta.sessaoId);
  const O1 = aberta.sessaoId;
  ok((await justificar(O1, { membroId: P.faltoso, codigo: "SAUDE" }, DIRIGENTE)).status === 403, "nem justifica falta da CLI (403)");
  ok((await chamarRota("AtualizarPresencaManual/index.js", { metodo: "POST", binding: { sessaoId: O1 }, token: DIRIGENTE, corpo: { membroId: P.faltoso, presente: true } })).status === 403, "nem corrige presença na CLI (403)");
  ok((await afmPost("nao-conta", { sessaoId: O1, motivo: "Tentativa do dirigente" }, DIRIGENTE)).status === 403, "nem marca 'não conta falta' (403)");
  ok((await encerrarSemData(O1)).body.sucesso === false, "encerrar de novo: 'já está encerrada' (nada é lançado duas vezes)");

  console.log("== uma reunião que conta por dia ==");
  const hoje1 = await abrir("ORDINARIA");
  await encerrarSemData(hoje1.sessaoId);                           // encerrada HOJE (sem envelhecer)
  const outra = await abrir("ORDINARIA");
  ok(outra.r.status === 422 && /Extraordinária/.test(outra.r.body.mensagem), "a segunda que conta no mesmo dia é recusada (422)", outra.r.body);
  const extra = await abrir("EXTRAORDINARIA");
  ok(extra.r.status === 201, "a Extraordinária no mesmo dia pode");
  await encerrarSemData(extra.sessaoId);
  const naoConta = await afmPost("nao-conta", { sessaoId: hoje1.sessaoId, motivo: "Aberta e encerrada por engano no teste" });
  ok(naoConta.status === 200, "o nível geral marca a reunião errada como 'não conta falta'", naoConta.body);
  ok((await um("SELECT ContaFaltasCLI c, NaoContaMotivo m FROM Sessoes WHERE SessaoId = @s", { s: hoje1.sessaoId })).c === false, "ela deixa de contar, com o motivo guardado");
  ok((await afmPost("nao-conta", { sessaoId: hoje1.sessaoId, motivo: "De novo, para conferir" })).status === 422, "marcar de novo: recusado");
  ok((await abrir("ORDINARIA")).r.status === 201, "e, com ela fora, outra que conta pode ser aberta hoje");
  await q("UPDATE Sessoes SET Status = 'ENCERRADA', ContaFaltasCLI = 0 WHERE Status = 'ABERTA'");

  console.log("== série de ordinárias: pendente, quebra, refazer ==");
  // O1 já passou (só o Pastor presente). O2..O5:
  const O2 = await reuniao("ORDINARIA", [...SEMPRE]);
  const pedido = await chamarRota("SolicitarJustificativa/index.js", { metodo: "POST", binding: { matricula: P.fiscal, sessaoId: O2 }, token: PIN(P.fiscal), corpo: { codigo: "VIAGEM_PROFISSIONAL", detalhe: "Viagem de trabalho" } });
  ok(pedido.status === 200, "o Conselheiro pede justificativa da 2ª falta (fica pendente)");
  // o CEI sai da CLI antes da 3ª e volta depois
  const orgaoCEI = await escalar("SELECT OrgaoId FROM Orgaos WHERE Sigla = 'CEI'");
  await q("UPDATE Assentos SET DataFim = DATEADD(DAY, -1, CAST(SYSUTCDATETIME() AS DATE)), MotivoEncerramento = 'FIM_MANDATO' WHERE MembroId = @m AND OrgaoId = @o AND DataFim IS NULL", { m: P.cei, o: orgaoCEI });
  const O3 = await reuniao("ORDINARIA", [...SEMPRE]);
  ok(!(await vigente(P.fiscal)), "pedido pendente na sequência: a exclusão NÃO nasce enquanto a Secretaria não decide");
  ok(!(await um("SELECT 1 x FROM Presencas WHERE SessaoId = @s AND MembroId = @m", { s: O3, m: P.cei })), "fora da CLI, o CEI não era esperado na 3ª");
  await q("INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) VALUES (@o, @m, 'FUNCAO', N'Conselheiro de Ética', CAST(SYSUTCDATETIME() AS DATE))", { m: P.cei, o: orgaoCEI });
  const O4 = await reuniao("ORDINARIA", [...SEMPRE, P.fiscal]);
  ok(!(await vigente(P.cei)), "faltou 2, ficou fora, voltou e faltou 1: o período fora interrompe — não é excluído");
  const O5 = await reuniao("ORDINARIA", [...SEMPRE, P.fiscal, P.cei]);
  const exF1 = await vigente(P.faltoso);
  ok(exF1 && exF1.SessoesGatilho === [O1, O2, O3].join(","), "o Presbítero ausente em todas: excluído nas 3 primeiras", exF1);
  const rej = await chamarRota("RejeitarJustificativa/index.js", { metodo: "POST", binding: { sessaoId: O2 }, token: SEC, corpo: { membroId: P.fiscal } });
  ok(rej.status === 200 && /exclusão/.test(rej.body.mensagem), "recusado o pedido, a apuração refaz e exclui", rej.body);
  ok((await vigente(P.fiscal)) && (await vigente(P.fiscal)).SessoesGatilho === [O1, O2, O3].join(","), "…com as 3 reuniões certas");
  const jO2 = await justificar(O2, { membroId: P.faltoso, codigo: "SAUDE", detalhe: "Texto secreto da consulta" });
  ok(jO2.status === 200, "justificada a 2ª falta do Presbítero", jO2.body);
  // depois de excluído ele saiu da CLI: a 4ª e a 5ª não o esperavam (quebra) — sem a 2ª, a sequência deixa de existir
  ok(!(await vigente(P.faltoso)), "justificada uma das 3, a exclusão é anulada (as reuniões depois dela não o esperavam)");

  console.log("== a trilha e a frequência não espalham o motivo ==");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE DadosDepois LIKE N'%secreto%'")) === 0, "a trilha de auditoria não guarda o detalhe escrito (só o código)");
  const frLocal = await chamarRota("ListarFrequencia/index.js", { binding: { sessaoId: O2 }, token: LIDER(3001, ["reunioes"], ["Central E2E"]) });
  const linha = frLocal.body.frequencia.find((f) => f.membroId === P.faltoso);
  ok(linha && linha.faltaJustificada && linha.motivoJustificativa === null && linha.motivoCodigo === null, "fora do nível geral, a frequência diz só 'justificada' (sem o motivo)", linha);
  const frGeral = await chamarRota("ListarFrequencia/index.js", { binding: { sessaoId: O2 }, token: SEC });
  ok(frGeral.body.frequencia.find((f) => f.membroId === P.faltoso).motivoCodigo === "SAUDE", "o nível geral vê o motivo");

  console.log("== ninguém justifica nem corrige a própria falta ==");
  const O6 = await reuniao("ORDINARIA", [P.presente, P.tesoureiro, P.dupla, P.reprovado, P.reitor]);   // o Mestre falta
  const MESTRE_SEC = GERAL(P.mestre, PERM);
  ok((await justificar(O6, { membroId: P.mestre, codigo: "SAUDE" }, MESTRE_SEC)).status === 403, "o Mestre (da Secretaria) não justifica a própria falta");
  ok((await chamarRota("AtualizarPresencaManual/index.js", { metodo: "POST", binding: { sessaoId: O6 }, token: MESTRE_SEC, corpo: { membroId: P.mestre, presente: true } })).status === 403, "nem se marca presente");
  ok((await justificar(O6, { membroId: P.mestre, codigo: "SAUDE" })).status === 200, "outra pessoa da Secretaria justifica");

  console.log("== 'não conta falta' desfaz a exclusão ==");
  const SEM_PASTOR = [P.tesoureiro, P.dupla, P.reprovado, P.reitor, P.mestre, P.fiscal, P.cei];
  await reuniao("ORDINARIA", SEM_PASTOR);
  await reuniao("ORDINARIA", SEM_PASTOR);
  const O9 = await reuniao("ORDINARIA", SEM_PASTOR);
  ok(!!(await vigente(P.presente)), "o Pastor faltou a 3 seguidas: excluído");
  const nc = await afmPost("nao-conta", { sessaoId: O9, motivo: "Encerrada por engano com a sala chegando" });
  ok(nc.status === 200 && /anulada/.test(nc.body.mensagem), "marcar a 3ª como 'não conta' refaz a apuração na hora", nc.body);
  ok(!(await vigente(P.presente)), "e a exclusão que dependia dela é anulada");

  console.log("== Sessão Magna: quórum da Câmara e documento só para quem a Academia esperava ==");
  const M1 = await reuniao("MAGNA_AFM", [...SEMPRE, P.auxiliar, P.foraCLI, P.diacono, P.cei]);   // o Conselheiro Fiscal (só CLI) falta
  const frM = await chamarRota("ListarFrequencia/index.js", { binding: { sessaoId: M1 }, token: SEC });
  const presentesCLI = frM.body.frequencia.filter((f) => f.presente && f.esperadoCLI !== false).length;
  ok(frM.body.quorum.totalPresentes === presentesCLI && frM.body.quorum.totalPresentes < frM.body.frequencia.filter((f) => f.presente).length,
    "o quórum da CLI na Magna conta só a Câmara (Auxiliar e Diáconos não)", { quorum: frM.body.quorum.totalPresentes, cli: presentesCLI });
  const jFis = await justificar(M1, { membroId: P.fiscal, codigo: "LUTO" });
  ok(jFis.status === 200, "a falta de quem é só da CLI na Magna se justifica sem o documento da AFM", jFis.body);

  console.log("== o Seminário de novembro conta só para a Academia ==");
  const exAntes = await escalar("SELECT COUNT(*) FROM CLIExclusoesFaltas WHERE MembroId = @m", { m: P.presente });
  for (let i = 0; i < 3; i++) await reuniao("SEMINARIO_AFM", [P.tesoureiro, P.auxiliar, P.foraCLI, P.reprovado, P.dupla, P.reitor, P.mestre]);   // o Pastor e o Diácono faltam aos três
  ok((await escalar("SELECT COUNT(*) FROM CLIExclusoesFaltas WHERE MembroId = @m", { m: P.presente })) === exAntes, "3 Seminários sem o Pastor: nenhuma exclusão da CLI");
  ok((await escalar("SELECT TOP 1 StatusMatricula FROM Matriculas_AFM WHERE MembroId = @m ORDER BY MatriculaId DESC", { m: P.diacono })) === "INATIVA", "…mas o Diácono ausente fica com a matrícula inativa (AFM)");

  console.log("== CEI e o Certificado de Habilitação ==");
  const pool = await obterPool();
  const cei = require(path.join(API, "shared/cei.js"));
  await q("UPDATE Matriculas_AFM SET NivelEscolaridade = 'AVANCADO', CertificadoHabilitacao = 1 WHERE MembroId = @m", { m: P.reprovado });
  ok((await cei.dadosElegibilidadeCEI(pool, require("mssql"), P.reprovado)).afmAvancadoComCertificado === true, "com nível e certificado, conta para a CEI");
  await afmPost("reprovar", { membroId: P.reprovado, data: L.hojeBr(), detalhe: "Prova de liturgia do Seminário" });
  ok((await cei.dadosElegibilidadeCEI(pool, require("mssql"), P.reprovado)).afmAvancadoComCertificado === false, "com a matrícula inativa, não conta (Art. 72: Matrícula Ativa)");
  await afmPost("rematricular", { membroId: P.reprovado, reciclagemAprovadaEm: L.hojeBr() });
  ok((await escalar("SELECT TOP 1 CertificadoHabilitacao FROM Matriculas_AFM WHERE MembroId = @m ORDER BY MatriculaId DESC", { m: P.reprovado })) === true, "a rematrícula leva o certificado junto");
  ok((await cei.dadosElegibilidadeCEI(pool, require("mssql"), P.reprovado)).afmAvancadoComCertificado === true, "e volta a contar para a CEI");

  console.log("== o resto ==");
  ok((await chamarRota("EditarMarcoMembro/index.js", { metodo: "POST", binding: { marcoId: 1 }, token: GERAL(1003, ["afm"]), corpo: { justificativa: "x", descricao: "y" } })).status === 403, "papel Global só com 'afm' não corrige marco");
  for (const matricula of ["abc", 2 ** 40, -5]) {
    const s = await abrir("EXTRAORDINARIA");
    const r = await chamarRota("RegistrarPresenca/index.js", { metodo: "POST", corpo: { matricula, senha: s.senha } });
    ok(r.status !== 500 && r.body && r.body.sucesso === false, `presença com matrícula ${JSON.stringify(matricula)}: recusada sem 500`, r.status);
    await encerrarSemData(s.sessaoId);
  }
  ok((await chamarRota("EncerrarReuniao/index.js", { metodo: "POST", binding: { sessaoId: "abc" }, token: SEC, corpo: {} })).status === 400, "encerrar com id estranho: 400");
  ok((await chamarRota("ListarFrequencia/index.js", { binding: { sessaoId: 2 ** 40 }, token: SEC })).status === 400, "frequência com id estranho: 400");
  console.log("== apuração atrasada: as faltas mudam e a exclusão é REFEITA ==");
  // 5 reuniões já encerradas com as faltas gravadas direto no banco e SEM apuração (como se a apuração na hora tivesse falhado): a pessoa estava nas 5
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento) VALUES (9196, N'Atrasado E2E', @c, 'ATIVO', 'EM_COMUNHAO', '1970-01-01')", { c: c1 });
  const X = [];
  for (let i = 0; i < 5; i++) {
    const sx = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, Status, TipoSessao, ContaFaltasCLI) OUTPUT INSERTED.SessaoId
      VALUES (@o, N'Atrasada', DATEADD(DAY, @d, CAST(SYSUTCDATETIME() AS DATE)), 'ENCERRADA', 'ORDINARIA', 1)`, { o: orgaoCLI, d: -(30 - i) });
    X.push(sx);
    await q("INSERT INTO Presencas (SessaoId, MembroId, Presente, FaltaJustificada, EsperadoCLI, EsperadoAFM) VALUES (@s, 9196, 0, 0, 1, 0)", { s: sx });
  }
  await db.apurar(pool, { membroIds: [9196] });
  const ex1 = await vigente(9196);
  ok(ex1 && ex1.SessoesGatilho === X.slice(0, 3).join(","), "a apuração atrasada exclui pelas 3 primeiras");
  await q("UPDATE Presencas SET FaltaJustificada = 1, MotivoCodigo = 'LUTO' WHERE SessaoId = @s AND MembroId = 9196", { s: X[1] });
  await db.apurar(pool, { membroIds: [9196] });
  const ex2 = await vigente(9196);
  ok(ex2 && ex2.ExclusaoId !== ex1.ExclusaoId && ex2.SessoesGatilho === X.slice(2, 5).join(","), "justificada a 2ª, a sequência continua (3ª a 5ª): a exclusão é REFEITA com as reuniões e a data certas", ex2);
  ok(/mudaram/.test((await um("SELECT MotivoAnulacao m FROM CLIExclusoesFaltas WHERE ExclusaoId = @e", { e: ex1.ExclusaoId })).m), "a antiga fica anulada, dizendo por quê");

  const rot = await db.rotinaDiaria(pool);
  ok(rot.falhas.length === 0, "a rotina diária roda sem falha depois de tudo", rot);

  fim("e2e-50 (AFM e faltas da CLI — o que a revisão do servidor pediu)");
})().catch((e) => { console.log("ERRO FATAL:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
