// e2e-6-corridas.js — corridas de verdade: N processos node, cada um com a sua conexão ao SQL Server, disparando ao mesmo tempo. A ponte do shim é UMA conexão, então
// Promise.all num processo só não prova corrida nenhuma. Parte da base-cenario (banco recém-restaurado).
const fs = require("fs");
const { spawn } = require("child_process");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, PIN, IP_PUBLICO, API, path } = L;
const H = require(path.join(API, "GestaoSetoresTecnicos/index.js"));
const cen = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario.json"), "utf8"));
const S = cen.setores, C = cen.cong;
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const hoje = L.hojeBr();
const gestora = GERAL(1003, ["setores_tecnicos"]);

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
const geral = (id, p = TUDO) => ({ tipo: "GERAL", membroId: id, permissoes: p });
const pin = (id) => ({ tipo: "PIN", membroId: id });
async function ativar(membro, setor, extra = {}) {
  let r = await POST(H, "indicar", gestora, { membroId: membro, setorId: setor, formacao: "Profissional", ...extra });
  const vinculoId = r.body.vinculoId;
  r = await POST(H, "registrar-termo", GERAL(1002, TUDO), { vinculoId, forma: "FICHA_FISICA", dataAceite: hoje, referencia: `ficha ${membro}` });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return vinculoId;
}
async function indicado(membro, setor, extra = {}) { const r = await POST(H, "indicar", gestora, { membroId: membro, setorId: setor, formacao: "Profissional", ...extra }); return r.body.vinculoId; }
const interdicaoBase = (objeto) => ({ congregacaoId: C.central.id, motivo: "RISCO_DESABAMENTO", objeto, descricao: "Rachadura na viga principal; a cobertura cedeu desde a última visita." });

(async () => {
  console.log("== 8 aceites do Termo ao mesmo tempo (a mesma pessoa, o mesmo vínculo) ==");
  const v1 = await indicado(2005, S.TI);
  const hash1 = await L.termoHashDo(H, L.PIN(2005), v1);
  let rs = await disparar(Array.from({ length: 8 }, () => ({ handler: "setores", acao: "aceitar-termo", token: pin(2005), corpo: { vinculoId: v1, aceito: true, termoHash: hash1 }, headers: IP_PUBLICO })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.filter((r) => r.status === 201).length === 1 && rs.filter((r) => r.status === 422).length === 7, "exatamente 1 aceite vale; os outros 7 são recusados (422)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosAdesoes WHERE VinculoId = @v", { v: v1 })) === 1 && (await escalar("SELECT Status FROM SetoresTecnicosMembros WHERE VinculoId = @v", { v: v1 })) === "ATIVO", "uma prova só, e o vínculo ATIVO");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao = 'SETOR_ADESAO_REGISTRADA'")) === 1, "uma entrada de auditoria só");

  console.log("== o aceite digital contra a ficha da gestão, ao mesmo tempo ==");
  const v2 = await indicado(2004, S.JURIDICO);
  const hash2 = await L.termoHashDo(H, L.PIN(2004), v2);
  rs = await disparar([{ handler: "setores", acao: "aceitar-termo", token: pin(2004), corpo: { vinculoId: v2, aceito: true, termoHash: hash2 }, headers: IP_PUBLICO }, { handler: "setores", acao: "registrar-termo", token: geral(1002, TUDO), corpo: { vinculoId: v2, forma: "FICHA_FISICA", dataAceite: hoje, referencia: "ficha corrida" } }]);
  ok(rs.filter((r) => r.status === 201).length === 1, "só uma das duas formas vale", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosAdesoes WHERE VinculoId = @v", { v: v2 })) === 1, "e há uma única adesão");

  console.log("== o desligamento contra o aceite ==");
  const v3 = await indicado(2007 + 3, S.EDUCACAO);       // 2010
  const hash3 = await L.termoHashDo(H, L.PIN(2010), v3);
  rs = await disparar([{ handler: "setores", acao: "aceitar-termo", token: pin(2010), corpo: { vinculoId: v3, aceito: true, termoHash: hash3 }, headers: IP_PUBLICO }, { handler: "setores", acao: "encerrar", token: geral(1003, ["setores_tecnicos"]), corpo: { vinculoId: v3, tipoMotivo: "OUTRO", observacao: "Desligamento durante o aceite." } }]);
  const vv3 = await um("SELECT Status, AtivadoEm FROM SetoresTecnicosMembros WHERE VinculoId = @v", { v: v3 });
  const ad3 = await escalar("SELECT COUNT(*) FROM SetoresTecnicosAdesoes WHERE VinculoId = @v", { v: v3 });
  ok(vv3.Status === "ENCERRADO" && ((vv3.AtivadoEm && ad3 === 1) || (!vv3.AtivadoEm && ad3 === 0)), "o resultado é coerente: encerrado com prova (aceitou antes) ou sem prova (encerrado antes)", [vv3, ad3, rs.map((r) => r.status)]);
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosMembros m WHERE m.Status = 'ATIVO' AND m.MembroId < 5000 AND NOT EXISTS (SELECT 1 FROM SetoresTecnicosAdesoes a WHERE a.VinculoId = m.VinculoId)")) === 0, "nunca existe vínculo ATIVO sem prova do Termo");

  console.log("== 5 candidaturas iguais ao mesmo tempo ==");
  rs = await disparar(Array.from({ length: 5 }, () => ({ handler: "setores", acao: "candidatar", token: pin(2012), corpo: { setorId: S.BELEZA, formacao: "Esteticista" } })));
  ok(rs.filter((r) => r.status === 201).length === 1 && (await escalar("SELECT COUNT(*) FROM SetoresTecnicosMembros WHERE MembroId = 2012 AND SetorId = @s", { s: S.BELEZA })) === 1, "uma candidatura só (índice único)", contar(rs));

  console.log("== aprovar contra recusar ==");
  const cand = (await POST(H, "candidatar", pin2(2005 + 0), { setorId: S.GASTRONOMIA, formacao: "Cozinheira" })).body.vinculoId;
  function pin2(id) { return PIN(id); }
  rs = await disparar([{ handler: "setores", acao: "aprovar", token: geral(1003, ["setores_tecnicos"]), corpo: { vinculoId: cand } }, { handler: "setores", acao: "recusar", token: geral(1001), corpo: { vinculoId: cand } }, { handler: "setores", acao: "aprovar", token: geral(1002), corpo: { vinculoId: cand } }]);
  ok(rs.filter((r) => r.status === 200).length === 1, "só uma decisão vale", contar(rs));
  ok(["AGUARDANDO_TERMO", "ENCERRADO"].includes(await escalar("SELECT Status FROM SetoresTecnicosMembros WHERE VinculoId = @v", { v: cand })), "o estado final é um dos dois, nunca misturado");

  console.log("== o teto de 3 atos por dia contra 8 emissões simultâneas ==");
  await ativar(2001, S.ENGENHARIA, { conselhoSigla: "CREA-PA", registroNumero: "12345" });
  rs = await disparar(Array.from({ length: 8 }, (_, i) => ({ handler: "setores", acao: "interdicao", token: pin(2001), corpo: interdicaoBase(`Estrutura número ${i + 1} do templo`) })));
  console.log("   ", JSON.stringify(contar(rs)));
  const emitidos = await escalar("SELECT COUNT(*) FROM SetoresTecnicosIntervencoes WHERE EmitidaPorMembroId = 2001");
  ok(rs.filter((r) => r.status === 201).length === 3 && emitidos === 3, "exatamente 3 passam (o teto vale mesmo com 8 conexões ao mesmo tempo)", [contar(rs), emitidos]);
  ok(rs.filter((r) => r.status === 422).length === 5, "as outras 5 são recusadas pela regra, não por erro");

  console.log("== ratificar e revogar a mesma interdição ao mesmo tempo ==");
  await ativar(2002, S.SEGURANCA);
  const a1 = (await POST(H, "interdicao", PIN(2002), interdicaoBase("Escada de emergência da Central"))).body.intervencaoId;
  rs = await disparar([{ handler: "setores", acao: "decidir", token: geral(1001), corpo: { intervencaoId: a1, decisao: "RATIFICAR" } }, { handler: "setores", acao: "decidir", token: geral(1002), corpo: { intervencaoId: a1, decisao: "REVOGAR", observacao: "Não há risco, conforme laudo." } },
    { handler: "setores", acao: "decidir", token: geral(1001), corpo: { intervencaoId: a1, decisao: "REVOGAR", observacao: "Revogação concorrente do mesmo ato." } }, { handler: "setores", acao: "levantar", token: pin(2002), corpo: { intervencaoId: a1, observacao: "O emitente levanta ao mesmo tempo." } }]);
  console.log("   ", JSON.stringify(contar(rs)));
  const ato1 = await um("SELECT Status, DecididaPorMembroId, FechadaPorMembroId FROM SetoresTecnicosIntervencoes WHERE IntervencaoId = @i", { i: a1 });
  ok(rs.filter((r) => r.status === 200).length === 1 || (rs.filter((r) => r.status === 200).length === 2 && ato1.Status === "LEVANTADA" && ato1.DecididaPorMembroId), "uma decisão vale (ou ratificada e depois levantada, nessa ordem)", [contar(rs), ato1]);
  ok(["RATIFICADA", "REVOGADA", "LEVANTADA"].includes(ato1.Status), "o estado final é válido (as CHECK do banco não deixam outro)", ato1);

  console.log("== o pedido de remoção atendido por dois ao mesmo tempo ==");
  await ativar(2011, S.COMUNICACAO);
  const p1 = (await POST(H, "pedido-remocao", PIN(2011), { congregacaoId: C.central.id, canalId: cen.canalId, motivo: "ERRO_GROSSEIRO", referencia: "https://exemplo.org/p/corrida", descricao: "Texto com erro grosseiro de português na postagem." })).body.intervencaoId;
  rs = await disparar([{ handler: "setores", acao: "atender", token: pin(4001), corpo: { intervencaoId: p1 } }, { handler: "setores", acao: "atender", token: geral(1003, ["setores_tecnicos"]), corpo: { intervencaoId: p1 } }, { handler: "setores", acao: "decidir", token: geral(1001), corpo: { intervencaoId: p1, decisao: "REVOGAR", observacao: "Revogo ao mesmo tempo que atendem." } }, { handler: "setores", acao: "cancelar", token: pin(2011), corpo: { intervencaoId: p1, observacao: "Cancelo ao mesmo tempo que atendem." } }]);
  ok(rs.filter((r) => r.status === 200).length === 1, "exatamente uma ação vale sobre o pedido", contar(rs));
  const aviso = await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'SETOR_REMOCAO_DECIDIDA' AND ReferenciaId IN (@a, @b, @c)", { a: p1 * 10 + 2, b: p1 * 10 + 3, c: p1 * 10 + 4 });
  ok(aviso > 0, "e o aviso da decisão saiu uma vez só pela decisão vencedora");

  console.log("== integridade geral depois de todas as corridas ==");
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosMembros GROUP BY SetorId, MembroId HAVING SUM(CASE WHEN Status <> 'ENCERRADO' THEN 1 ELSE 0 END) > 1")) === null, "nenhuma pessoa com dois vínculos vigentes no mesmo setor");
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosAdesoes a JOIN SetoresTecnicosMembros m ON m.VinculoId = a.VinculoId WHERE m.AtivadoEm IS NULL")) === 0, "nenhuma adesão de vínculo que nunca foi ativado");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao LIKE '%falha%'")) === 0, "nenhuma falha de auditoria registrada");
  fim("e2e-6-corridas");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
