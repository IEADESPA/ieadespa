// e2e-10-menores-corridas.js — v7.7: corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) nas rotas do ministério com menores.
// Parte da base "cenario-menores": BASE=cenario-menores bash rodar.sh roteiro e2e-10-menores-corridas.js
const fs = require("fs");
const { spawn } = require("child_process");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, PIN, IP_PUBLICO, API, path, obterPool } = L;
const mm = require(path.join(API, "shared/ministerioMenores.js"));
const { eq, c1 } = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario-menores.json"), "utf8"));
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const hoje = L.hojeBr();
const dias = (n) => new Date(Date.now() + n * 86400000);

// Dispara todas as chamadas juntas (cada uma num processo) e devolve os resultados.
async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 600;      // folga para os processos subirem a ponte e conectarem
  const procs = chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1, erro: "sem resultado" }); });
  }));
  return Promise.all(procs);
}
const contar = (rs) => rs.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
const pin = (id) => ({ tipo: "PIN", membroId: id });
const geral = (id, p = TUDO) => ({ tipo: "GERAL", membroId: id, permissoes: p });
const menores = (acao, token, corpo, headers) => ({ handler: "menores", acao, token, corpo, headers });
const servico = async (dataHora, status = "RASCUNHO") => (await q("INSERT INTO EscalasServicos (CongregacaoId, DataHora, Descricao, Status, PublicadaEm) VALUES (@c, @d, N'Culto corrida', @st, CASE WHEN @st = 'PUBLICADA' THEN SYSUTCDATETIME() END); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: c1, d: dataHora, st: status }))[0].id;

(async () => {
  let rs;
  console.log("== 8 aceites da política ao mesmo tempo (a mesma pessoa) ==");
  rs = await disparar(Array.from({ length: 8 }, () => menores("aceitar-politica", pin(6018), { aceito: true, textoHash: mm.POLITICA_HASH }, IP_PUBLICO)));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.filter((r) => r.status === 201).length === 1 && rs.filter((r) => r.status === 422).length === 7, "exatamente 1 aceite vale; os outros 7 são recusados (422), nenhum 500", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresPoliticaAceites WHERE MembroId = 6018")) === 1 && (await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao = 'MENORES_POLITICA_ACEITA'")) === 1, "uma linha e uma entrada de auditoria só");

  console.log("== o aceite digital contra a ficha da secretaria, ao mesmo tempo ==");
  rs = await disparar([
    menores("aceitar-politica", pin(6025), { aceito: true, textoHash: mm.POLITICA_HASH }, IP_PUBLICO),
    { handler: "menores", acao: "registrar-politica", token: { tipo: "LIDER", membroId: 3001, permissoes: ["habilitacao_voluntarios", "escalas", "pessoas"], escopo: ["Central E2E"], nivel: "CONGREGACAO" }, corpo: { membroId: 6025, referencia: "Pasta 5, ficha 5" } }
  ]);
  ok(rs.filter((r) => r.status === 201).length === 1 && rs.filter((r) => r.status === 422).length === 1, "só uma das duas formas vale (uma política por versão)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresPoliticaAceites WHERE MembroId = 6025")) === 1, "e há um único aceite");

  console.log("== 6 declarações de auto-denúncia ao mesmo tempo (a mesma pessoa) ==");
  const sv = await servico(dias(40), "PUBLICADA");
  await q("INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status) VALUES (@s, @e, 6022, 'ACEITO')", { s: sv, e: eq.bercario });
  rs = await disparar(Array.from({ length: 6 }, () => menores("auto-denuncia", pin(6022), { tipo: "INQUERITO_POLICIAL", dataCiencia: hoje, ciente: true })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.filter((r) => r.status === 201).length === 1 && rs.filter((r) => r.status === 422).length === 5, "exatamente 1 comunicação nasce; as outras 5 recebem 'já comunicou' (422)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresAutoDenuncias WHERE MembroId = 6022 AND Decisao IS NULL")) === 1, "uma só sem decisão (o índice único segurou)");
  const avisosDir = await q("SELECT DestinatarioMembroId d FROM Notificacoes WHERE RegraChave = 'MENORES_AUTODENUNCIA'");
  ok(avisosDir.length === 4 && avisosDir.map((x) => x.d).sort((a, b) => a - b).join() === "1,2,1001,1002", "a Diretoria (Presidente e Secretário Geral: os dois da semente e os dois do cenário) foi avisada UMA vez cada", avisosDir);
  ok((await escalar("SELECT Status FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6022", { s: sv })) === "CANCELADA", "e a escala futura dela com menores caiu, uma vez");
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresRetiradas WHERE MembroId = 6022")) === 1, "uma retirada registrada só (não seis)");

  console.log("== a Diretoria decide a mesma comunicação em dois processos ==");
  const adId = await escalar("SELECT AutoDenunciaId FROM MinisterioMenoresAutoDenuncias WHERE MembroId = 6022 AND Decisao IS NULL");
  rs = await disparar([
    { handler: "menores", acao: "auto-denuncia-decidir", token: geral(1001), corpo: { autoDenunciaId: adId, decisao: "MANTIDO", observacao: "Conversei com a pessoa; segue em dia." } },
    { handler: "menores", acao: "auto-denuncia-decidir", token: geral(1002), corpo: { autoDenunciaId: adId, decisao: "AFASTADO_PREVENTIVAMENTE", observacao: "Afastamento por cautela, a pedido." } },
    { handler: "menores", acao: "auto-denuncia-decidir", token: geral(1001), corpo: { autoDenunciaId: adId, decisao: "MANTIDO", observacao: "Segunda decisão do mesmo ato." } }
  ]);
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.filter((r) => r.status === 200).length === 1 && rs.filter((r) => r.status === 422).length === 2, "exatamente uma decisão vale; as outras são recusadas", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao = 'MENORES_AUTODENUNCIA_DECIDIDA'")) === 1, "uma entrada de auditoria só");
  const dec = await um("SELECT Decisao, DecididaPorMembroId FROM MinisterioMenoresAutoDenuncias WHERE AutoDenunciaId = @i", { i: adId });
  ok(dec.Decisao && [1001, 1002].includes(dec.DecididaPorMembroId), "a decisão guardada é inteira de UMA pessoa (decisão e quem decidiu coerentes)", dec);

  console.log("== duas varreduras da escala ao mesmo tempo (a rotina diária e o ato da Diretoria) ==");
  const sv2 = await servico(dias(45), "PUBLICADA");
  for (const m of [6013, 6014, 6015, 6019]) await q("INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status) VALUES (@s, @e, @m, 'CONFIRMADO')", { s: sv2, e: eq.bercario, m });
  const antes = (await q("SELECT COUNT(*) n FROM MinisterioMenoresRetiradas"))[0].n;
  const avisosAntes = (await q("SELECT COUNT(*) n FROM Notificacoes WHERE RegraChave = 'MENORES_RETIRADO_DA_ESCALA'"))[0].n;
  const varredura = { funcao: { modulo: "ministerioMenoresDb", nome: "retirarInaptosDasEscalas", args: [{}] } };
  rs = await disparar([varredura, varredura, varredura, { funcao: { modulo: "ministerioMenoresDb", nome: "retirarInaptosDasEscalas", args: [{ membroId: 6013 }] } }]);
  console.log("   ", JSON.stringify(rs.map((r) => r.resultado || r.erro)));
  ok(rs.every((r) => r.status === 200), "nenhuma varredura quebra (sem 500, sem impasse)", rs.map((r) => r.erro));
  const novas = (await q("SELECT MembroId, COUNT(*) n FROM MinisterioMenoresRetiradas WHERE RetiradaId > (SELECT ISNULL(MAX(RetiradaId), 0) - 100 FROM MinisterioMenoresRetiradas) GROUP BY MembroId")).filter((x) => [6013, 6014, 6015, 6019].includes(x.MembroId));
  const retiradasPorPessoa = {};
  for (const m of [6013, 6014, 6015, 6019]) retiradasPorPessoa[m] = await escalar("SELECT COUNT(*) FROM MinisterioMenoresRetiradas WHERE MembroId = @m AND AlocacoesCanceladas > 0 AND RetiradoEm > DATEADD(MINUTE, -5, SYSUTCDATETIME())", { m });
  ok(Object.values(retiradasPorPessoa).every((n) => n === 1), "cada pessoa tem UMA retirada registrada (as varreduras não duplicam)", retiradasPorPessoa);
  const avisosPessoa = {};
  for (const m of [6013, 6014, 6015, 6019]) avisosPessoa[m] = await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'MENORES_RETIRADO_DA_ESCALA' AND DestinatarioMembroId = @m", { m });
  ok(Object.values(avisosPessoa).every((n) => n === 1), "e cada pessoa recebeu UM aviso", avisosPessoa);
  ok((await escalar("SELECT COUNT(*) FROM EscalasAlocacoes WHERE ServicoId = @s AND Status <> 'CANCELADA'", { s: sv2 })) === 0, "todas as escalas caíram");

  console.log("== crianças previstas: 6 gravações ao mesmo tempo no mesmo serviço e equipe ==");
  const sv3 = await servico(dias(20));
  rs = await disparar([3, 5, 8, 2, 9, 4].map((n) => ({ handler: "escalas", acao: "criancas-previstas", token: pin(6001), corpo: { servicoId: sv3, equipeId: eq.bercario, criancas: n } })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.every((r) => r.status === 200), "todas as gravações respondem 200 (nenhuma 500 por chave duplicada)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresSalas WHERE ServicoId = @s AND EquipeId = @e", { s: sv3, e: eq.bercario })) === 1, "e há UMA linha (o valor final é o de uma das gravações)");
  ok([3, 5, 8, 2, 9, 4].includes(await escalar("SELECT CriancasPrevistas FROM MinisterioMenoresSalas WHERE ServicoId = @s AND EquipeId = @e", { s: sv3, e: eq.bercario })), "com um dos valores enviados");

  console.log("== a ficha confirmada 6 vezes ao mesmo tempo ==");
  rs = await disparar(Array.from({ length: 6 }, () => menores("confirmar-ficha", pin(6014), { confirmo: true })));
  ok(rs.every((r) => r.status === 200), "todas confirmam sem quebrar", contar(rs));

  console.log("== a integridade geral depois de todas as corridas ==");
  ok((await escalar("SELECT COUNT(*) FROM (SELECT MembroId FROM MinisterioMenoresAutoDenuncias WHERE Decisao IS NULL GROUP BY MembroId HAVING COUNT(*) > 1) x")) === 0, "ninguém tem duas comunicações sem decisão");
  ok((await escalar("SELECT COUNT(*) FROM (SELECT MembroId, Versao FROM MinisterioMenoresPoliticaAceites GROUP BY MembroId, Versao HAVING COUNT(*) > 1) x")) === 0, "nenhum aceite de política repetido");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE RegistroId IS NULL AND Acao LIKE 'MENORES[_]%'")) === 0, "nenhuma auditoria da v7.7 com RegistroId nulo");
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresRetiradas WHERE AlocacoesCanceladas <= 0")) === 0, "nenhuma retirada vazia");
  fim("e2e-10-menores-corridas");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
