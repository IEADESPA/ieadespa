// e2e-38-trava7c-saude-revogacao.js — Trava 7-C (item I1): revogar o consentimento de saúde do check-in (SAUDE_CRACHA) grava a linha de revogação e apaga a saúde e as
// cópias nos registros do check-in na MESMA transação, sob a trava da saúde da criança (a mesma da gravação da saúde, do check-in e da exclusão LGPD). Parte da base
// "cenario-checkin" (`bash rodar.sh preparar-checkin`):
//   BASE=cenario-checkin bash rodar.sh roteiro e2e-38-trava7c-saude-revogacao.js
// O que prova:
//   1) na MESMA resposta da revogação (pelo responsável e pela ficha da Secretaria) não sobra saúde em tabela nenhuma — nem a linha, nem a cópia no registro do check-in;
//   2) se o apagar falha no meio (um gatilho de teste derruba o DELETE), NADA fica pela metade: a revogação também não é gravada (antes: a revogação ficava e a saúde também);
//   3) corrida em vários processos — revogar × gravar a saúde (duas vezes) × check-in da criança —, em várias rodadas: nenhuma 500, nenhum deadlock, e no fim de cada rodada
//      ou o consentimento continua valendo, ou não há saúde em lugar nenhum (nunca saúde órfã, sem precisar da rotina diária);
//   4) a gravação da saúde depois da revogação é recusada.
process.env.AUTH_SECRET = "segredo-das-corridas-do-checkin-" + "x".repeat(24);
process.env.CRON_SECRET = "segredo-cron-so-do-teste-e2e";
const { spawn } = require("child_process");
const H = require("./lib-checkin");
const { L, q, um, escalar, cenario, pin, gestao, ckPost, consGet, consPost } = H;
const { ok, fim, obterPool, path } = L;
const C = cenario();
const { c1, eq, pessoas: P, criancas: K } = C;
const ANA = 6010, BRUNO = 6011, CARLA = 6012;
const CENTRAL = ["Central E2E"];

async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 700;
  const procs = chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1, erro: "sem resultado" }); });
  }));
  return Promise.all(procs);
}
const PIN = (id) => ({ tipo: "PIN", membroId: id });
const ck = (acao, token, corpo) => ({ handler: "checkin", acao, token, corpo });
const saudeLinha = (m) => escalar("SELECT COUNT(*) FROM CheckinInfantilSaude WHERE MenorMembroId = @m", { m });
const saudeCopias = (m) => escalar("SELECT COUNT(*) FROM CheckinInfantilRegistros WHERE MenorMembroId = @m AND SaudeTexto IS NOT NULL", { m });
const ultimaSaude = (m) => um("SELECT TOP 1 Concedido, ConsentimentoId FROM MinisterioMenoresConsentimentos WHERE MenorMembroId = @m AND Finalidade = 'SAUDE_CRACHA' ORDER BY ConsentimentoId DESC", { m });

(async () => {
  await obterPool();
  const hashSaude = ((await consGet("textos", pin(P.alice))).body.textos.find((t) => t.finalidade === "SAUDE_CRACHA") || {}).hash;
  ok(!!hashSaude, "o texto do consentimento de saúde tem hash");
  // concede (se preciso) e grava a saúde; com `comCheckin`, a criança entra numa sala e a etiqueta copia a saúde para o registro
  async function prepararSaude(menorId, resp, { comCheckin = false } = {}) {
    await H.limpar();
    const sv = await H.abrirSala(c1, eq.maternal, [ANA, BRUNO, CARLA]);
    const u = await ultimaSaude(menorId);
    if (!u || !u.Concedido) {
      const r = await consPost("conceder", pin(resp), { menorId, finalidade: "SAUDE_CRACHA", aceito: true, termoHash: hashSaude });
      if (r.status !== 201) throw new Error(`conceder: ${r.status} ${JSON.stringify(r.body)}`);
    }
    const g = await ckPost("saude-gravar", pin(resp), { menorId, texto: "Alergia a amendoim (teste)" });
    if (g.status !== 200) throw new Error(`gravar a saúde: ${g.status} ${JSON.stringify(g.body)}`);
    if (comCheckin) {
      const c = await ckPost("checkin", pin(ANA), { servicoId: sv, equipeId: eq.maternal, criancas: [{ menorId }], trouxe: { responsavelId: resp } });
      if (c.status !== 201) throw new Error(`check-in: ${c.status} ${JSON.stringify(c.body)}`);
    }
    return sv;
  }

  console.log("== 1) na mesma resposta da revogação, não sobra saúde em tabela nenhuma ==");
  await prepararSaude(K.duda, P.claudia, { comCheckin: true });
  ok((await saudeLinha(K.duda)) === 1 && (await saudeCopias(K.duda)) === 1, "antes: a saúde está guardada e copiada no registro do check-in de hoje");
  let r = await consPost("revogar", pin(P.claudia), { menorId: K.duda, finalidade: "SAUDE_CRACHA" });
  ok(r.status === 200 && r.body.sucesso, "o responsável revoga (200)", [r.status, r.body && r.body.mensagem]);
  ok((await saudeLinha(K.duda)) === 0 && (await saudeCopias(K.duda)) === 0, "logo depois da resposta: nem a linha de saúde nem a cópia no registro");
  ok((await ultimaSaude(K.duda)).Concedido === false, "e a última linha do consentimento é a revogação");
  // a ficha da Secretaria (revogação em papel), pelo mesmo caminho
  await prepararSaude(K.duda, P.claudia, { comCheckin: true });
  const ficha = await consPost("registrar-ficha", gestao(C.secretaria.central, CENTRAL), { menorId: K.duda, responsavelId: P.claudia, finalidade: "SAUDE_CRACHA", concedido: false, referencia: "Ficha E2E 38, pasta verde" }, {});
  ok([200, 201].includes(ficha.status) && ficha.body.sucesso, "a Secretaria registra a ficha de revogação", [ficha.status, ficha.body && ficha.body.mensagem]);
  ok((await saudeLinha(K.duda)) === 0 && (await saudeCopias(K.duda)) === 0 && (await ultimaSaude(K.duda)).Concedido === false, "pela ficha também: nada de saúde depois da resposta");
  const g2 = await ckPost("saude-gravar", pin(P.claudia), { menorId: K.duda, texto: "Outra alergia" });
  ok(g2.status !== 200 && (await saudeLinha(K.duda)) === 0, "4) gravar a saúde depois da revogação é recusado e nada é guardado", g2.status);

  console.log("== 2) o apagar falha no meio: nada fica pela metade ==");
  await prepararSaude(K.duda, P.claudia, { comCheckin: true });
  const antes = (await ultimaSaude(K.duda)).ConsentimentoId;
  await q(`EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_E2E38_FalhaNoApagar ON dbo.CheckinInfantilSaude AFTER DELETE AS BEGIN SET NOCOUNT ON; THROW 50038, N''falha de teste no apagar da saúde'', 1; END')`);
  try {
    r = await consPost("revogar", pin(P.claudia), { menorId: K.duda, finalidade: "SAUDE_CRACHA" });
  } catch (e) { r = { status: 500, body: { erro: String(e && e.message) } }; }
  finally { await q("DROP TRIGGER IF EXISTS dbo.TR_E2E38_FalhaNoApagar"); }
  const depois = await ultimaSaude(K.duda);
  const saudeFicou = (await saudeLinha(K.duda)) + (await saudeCopias(K.duda));
  ok(r.status !== 200, "a revogação não diz que deu certo", r.status);
  ok(depois.ConsentimentoId === antes && depois.Concedido === true && saudeFicou === 2,
    "a linha de revogação NÃO ficou gravada sem o apagar: o consentimento continua valendo e a saúde continua inteira (nada pela metade)", { antes, depois, saudeFicou });
  r = await consPost("revogar", pin(P.claudia), { menorId: K.duda, finalidade: "SAUDE_CRACHA" });
  ok(r.status === 200 && (await saudeLinha(K.duda)) === 0 && (await saudeCopias(K.duda)) === 0 && (await ultimaSaude(K.duda)).Concedido === false, "tentando de novo, revoga e apaga tudo");

  console.log("== 3) corrida: revogar × gravar a saúde × check-in, em vários processos ==");
  const RODADAS = Number(process.env.E2E38_RODADAS || 6);
  let orfas = 0, deadlocks = 0, quinhentos = 0;
  for (let t = 0; t < RODADAS; t++) {
    const sv = await prepararSaude(K.duda, P.claudia);
    const rs = await disparar([
      { handler: "consentimento", acao: "revogar", token: PIN(P.claudia), corpo: { menorId: K.duda, finalidade: "SAUDE_CRACHA" }, headers: L.IP_PUBLICO },
      ck("saude-gravar", PIN(P.claudia), { menorId: K.duda, texto: `Alergia rodada ${t} A` }),
      ck("saude-gravar", PIN(P.claudia), { menorId: K.duda, texto: `Alergia rodada ${t} B` }),
      ck("checkin", PIN(t % 2 ? BRUNO : ANA), { servicoId: sv, equipeId: eq.maternal, criancas: [{ menorId: K.duda }], trouxe: { responsavelId: P.claudia } })
    ]);
    quinhentos += rs.filter((x) => x.status === 500 || x.status <= 0).length;
    deadlocks += rs.filter((x) => /deadlock|impasse/i.test(`${x.erro || ""} ${x.mensagem || ""}`)).length;
    const u = await ultimaSaude(K.duda);
    const sobrou = (await saudeLinha(K.duda)) + (await saudeCopias(K.duda));
    if (!u.Concedido && sobrou > 0) orfas++;
    ok(rs.every((x) => x.status > 0 && x.status !== 500), `rodada ${t + 1}: nenhuma 500 (${JSON.stringify(rs.map((x) => x.status))})`, rs.map((x) => [x.status, x.mensagem, x.erro]));
    ok(u.Concedido || sobrou === 0, `rodada ${t + 1}: revogado ⇒ nenhuma saúde em tabela nenhuma (consentimento ${u.Concedido ? "vale" : "revogado"}, saúde ${sobrou})`);
  }
  ok(orfas === 0 && deadlocks === 0 && quinhentos === 0, `em ${RODADAS} rodadas: 0 saúde órfã, 0 deadlock, 0 erro 500`, { orfas, deadlocks, quinhentos });
  ok((await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name LIKE 'TR[_]Checkin%' AND is_disabled = 1")) === 0 && (await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name = 'TR_E2E38_FalhaNoApagar'")) === 0,
    "os gatilhos do check-in seguem ligados e o gatilho de teste foi removido");
  fim("e2e-38 (Trava 7-C: revogar a saúde e apagar na mesma transação)");
})().catch((e) => { H.erroFatal("ERRO:", e); process.exitCode = 1; try { q("DROP TRIGGER IF EXISTS dbo.TR_E2E38_FalhaNoApagar").catch(() => { }); } catch { } try { L.shimEncerrar(); } catch { } });
